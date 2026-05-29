"""
page_segmenter.py
------------------
Splits an exam PDF into individual question-region image crops.

Strategy
--------
1. Convert each PDF page to a high-res PIL image (via pymupdf / fitz).
2. Detect question regions using one of two modes:
   a. **Bounding-box mode** – caller supplies a list of bounding boxes
      (from a layout template or a prior detection step).
   b. **Auto-detect mode** – treat each page as one question region.
3. Return a list of QuestionCrop tuples for downstream OCR.

No system dependencies required — pymupdf is a self-contained wheel.
Install with:  pip install pymupdf
"""

from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Tuple

import fitz  # pymupdf — pip install pymupdf  (no Poppler / system deps needed)
from PIL import Image


# ---------------------------------------------------------------------------
# Data types
# ---------------------------------------------------------------------------


@dataclass
class BoundingBox:
    """
    Relative bounding box on a page (values in [0.0, 1.0]).

    Attributes
    ----------
    page   : 0-indexed page number.
    x1, y1 : Top-left corner (relative).
    x2, y2 : Bottom-right corner (relative).
    """
    page: int
    x1: float
    y1: float
    x2: float
    y2: float
    question_id: str = ""


@dataclass
class QuestionCrop:
    question_id: str
    page: int
    image: Image.Image
    bbox: BoundingBox


# ---------------------------------------------------------------------------
# Core segmenter
# ---------------------------------------------------------------------------


class PageSegmenter:
    """
    Converts a PDF into per-question image crops using pymupdf.

    Parameters
    ----------
    dpi : Resolution used when rasterizing PDF pages (default 200).
    """

    def __init__(self, dpi: int = 200):
        self.dpi = dpi
        # pymupdf renders at 72 dpi by default; scale factor to reach target dpi
        self._scale = dpi / 72.0

    # ------------------------------------------------------------------
    # Public methods
    # ------------------------------------------------------------------

    def segment(
        self,
        pdf_path: str | Path,
        bounding_boxes: Optional[List[BoundingBox]] = None,
    ) -> List[QuestionCrop]:
        """
        Segment a PDF into question crops.

        Parameters
        ----------
        pdf_path      : Path to the exam PDF.
        bounding_boxes: Pre-defined bounding boxes per question. If None,
                        auto-detection is attempted (one crop per page).

        Returns
        -------
        List[QuestionCrop] ordered by (page, y1).
        """
        pdf_path = Path(pdf_path)
        if not pdf_path.exists():
            raise FileNotFoundError(f"PDF not found: {pdf_path}")

        pages = self._rasterize_pdf(pdf_path)

        if bounding_boxes:
            return self._crop_with_boxes(pages, bounding_boxes)
        return self._auto_segment(pages)

    def segment_to_files(
        self,
        pdf_path: str | Path,
        output_dir: str | Path,
        bounding_boxes: Optional[List[BoundingBox]] = None,
        fmt: str = "png",
    ) -> List[Tuple[str, Path]]:
        """
        Like segment() but saves each crop to output_dir and returns
        a list of (question_id, file_path) pairs.
        """
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        crops = self.segment(pdf_path, bounding_boxes)
        results: List[Tuple[str, Path]] = []

        for crop in crops:
            filename = f"q{crop.question_id}_p{crop.page}.{fmt}"
            out_path = output_dir / filename
            crop.image.save(out_path)
            results.append((crop.question_id, out_path))

        return results

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _rasterize_pdf(self, pdf_path: Path) -> List[Image.Image]:
        """Convert all pages of a PDF to PIL images using pymupdf."""
        doc = fitz.open(str(pdf_path))
        matrix = fitz.Matrix(self._scale, self._scale)
        pages: List[Image.Image] = []

        for page in doc:
            pix = page.get_pixmap(matrix=matrix, alpha=False)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            pages.append(img)

        doc.close()
        return pages

    def _crop_with_boxes(
        self,
        pages: List[Image.Image],
        boxes: List[BoundingBox],
    ) -> List[QuestionCrop]:
        """Crop page images according to caller-supplied bounding boxes."""
        crops: List[QuestionCrop] = []

        for box in boxes:
            if box.page >= len(pages):
                continue
            page_img = pages[box.page]
            w, h = page_img.size

            left  = int(box.x1 * w)
            upper = int(box.y1 * h)
            right = int(box.x2 * w)
            lower = int(box.y2 * h)

            crops.append(
                QuestionCrop(
                    question_id=box.question_id,
                    page=box.page,
                    image=page_img.crop((left, upper, right, lower)),
                    bbox=box,
                )
            )

        return sorted(crops, key=lambda c: (c.page, c.bbox.y1))

    def _auto_segment(self, pages: List[Image.Image]) -> List[QuestionCrop]:
        """
        Naïve auto-segmentation: treat each page as one question region.
        question_id is set to "q{N}" to match the rubric convention (q1, q2…).

        For a real exam, replace this with a layout-detection model (e.g.
        LayoutLMv3, DocLayNet, or a custom YOLO detector trained on exam
        templates).
        """
        crops: List[QuestionCrop] = []
        for page_idx, page_img in enumerate(pages):
            qid = f"q{page_idx + 1}"   # matches rubric question_id format
            box = BoundingBox(
                page=page_idx,
                x1=0.0, y1=0.0, x2=1.0, y2=1.0,
                question_id=qid,
            )
            crops.append(
                QuestionCrop(
                    question_id=qid,
                    page=page_idx,
                    image=page_img.copy(),
                    bbox=box,
                )
            )
        return crops


# ---------------------------------------------------------------------------
# Module-level convenience function
# ---------------------------------------------------------------------------


def segment_pdf(
    pdf_path: str | Path,
    bounding_boxes: Optional[List[BoundingBox]] = None,
    dpi: int = 200,
) -> List[QuestionCrop]:
    """Shorthand for PageSegmenter().segment(...)."""
    return PageSegmenter(dpi=dpi).segment(pdf_path, bounding_boxes)


# ---------------------------------------------------------------------------
# CLI helper
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys

    if len(sys.argv) < 3:
        print("Usage: python page_segmenter.py <pdf_path> <output_dir>")
        sys.exit(1)

    pdf, out = sys.argv[1], sys.argv[2]
    segmenter = PageSegmenter()
    results = segmenter.segment_to_files(pdf, out)
    for qid, path in results:
        print(f"  Q{qid} → {path}")