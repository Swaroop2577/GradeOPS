import api from './api';

export const examService = {
  // ─── Exam CRUD ──────────────────────────────────────────────────────────────

  /**
   * Get all exams for a course.
   * GET /exams?courseId=<id>
   */
  getExamsByCourse: async (courseId) => {
    const { data } = await api.get('/exams', { params: { courseId } });
    return data.exams || [];
  },

  /**
   * Get a single exam by ID.
   * GET /exams/:id
   */
  getExamById: async (examId) => {
    const { data } = await api.get(`/exams/${examId}`);
    return data;
  },

  /**
   * Upload bulk exam PDFs for a course.
   * POST /exams  (multipart/form-data)
   *
   * @param {string} courseId
   * @param {string} rubricId
   * @param {FileList | File[]} files
   * @param {function} onProgress  - callback(percent: number, fileName: string)
   */
  uploadExams: async (courseId, rubricId, files, onProgress) => {
    const formData = new FormData();
    formData.append('courseId', courseId);
    formData.append('rubricId', rubricId);

    Array.from(files).forEach((file) => {
      formData.append('exams', file);
    });

    const { data } = await api.post('/exams/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percent);
        }
      },
    });

    return data;
  },

  /**
   * Poll the processing status of an exam (OCR + grading pipeline).
   * GET /exams/:id/status
   * Returns: { status, ocrProgress, gradingProgress, totalSubmissions, processedCount }
   */
  getExamStatus: async (examId) => {
    const { data } = await api.get(`/exams/${examId}/status`);
    return data;
  },

  /**
   * Delete an exam and all its submissions/grades.
   * DELETE /exams/:id
   */
  deleteExam: async (examId) => {
    const { data } = await api.delete(`/exams/${examId}`);
    return data;
  },

  // ─── Rubric ─────────────────────────────────────────────────────────────────

  /**
   * Save (create or update) a rubric for an exam.
   * POST /rubrics
   */
  saveRubric: async (rubricPayload) => {
    const { data } = await api.post('/rubrics', rubricPayload);
    return data.rubric;
  },

  /**
   * Get the rubric attached to an exam.
   * GET /rubrics?examId=<id>
   */
  getRubricByExam: async (examId) => {
    const { data } = await api.get(`/rubrics/${examId}`);
    return data.rubric;
  },

  // ─── Submissions ─────────────────────────────────────────────────────────────

  /**
   * Get all submissions for an exam with optional filters.
   * GET /exams/:examId/submissions?status=<status>&page=<n>&limit=<n>
   */
  getSubmissions: async (examId, { status, page = 1, limit = 20 } = {}) => {
    const { data } = await api.get(`/exams/${examId}/submissions`, {
      params: { status, page, limit },
    });
    return data;
  },

  /**
   * Get a single submission with its cropped answer images.
   * GET /submissions/:id
   */
  getSubmissionById: async (submissionId) => {
    const { data } = await api.get(`/submissions/${submissionId}`);
    return data;
  },

  // ─── Export ──────────────────────────────────────────────────────────────────

  /**
   * Download finalized grades as CSV or PDF.
   * GET /exams/:id/export?format=csv|pdf
   * Returns a Blob.
   */
  exportGrades: async (examId, format = 'csv') => {
    const response = await api.get(`/exams/${examId}/export`, {
      params: { format },
      responseType: 'blob',
    });

    // Trigger browser download
    const contentDisposition = response.headers['content-disposition'];
    const fileName = contentDisposition
      ? contentDisposition.split('filename=')[1]?.replace(/"/g, '')
      : `grades-${examId}.${format}`;

    const url = URL.createObjectURL(response.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  },

  // ─── Pipeline control ─────────────────────────────────────────────────────

  /**
   * Manually trigger the OCR + grading pipeline for an exam.
   * POST /exams/:id/trigger-grading
   *
   * BUG FIX 2: Was posting to /exams/:id/process (route does not exist).
   * Corrected to /exams/:id/trigger-grading which matches exam.routes.js.
   */
  triggerPipeline: async (examId) => {
    const { data } = await api.post(`/exams/${examId}/trigger-grading`);
    return data;
  },
};
