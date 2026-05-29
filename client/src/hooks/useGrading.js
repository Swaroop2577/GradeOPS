import { useCallback, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { gradeService } from '../services/grade.service';

/**
 * useGrading — manages the complete TA review queue state for an exam.
 *
 * Encapsulates:
 *   - Fetching + caching grades from the API
 *   - Current item cursor (index navigation)
 *   - Status filter (pending / approved / overridden / all)
 *   - Approve, override, skip, flag actions with optimistic UI updates
 *   - Loading and error states
 *   - Derived counts per status
 *
 * Usage:
 *   const {
 *     grades, filtered, current, currentIdx,
 *     statusFilter, setStatusFilter,
 *     counts, loading, error,
 *     approve, override, skip, flag,
 *     goNext, goPrev,
 *     refresh,
 *   } = useGrading(examId);
 *
 * @param {string} examId  - The exam whose grades are being reviewed
 */

const STATUS_FILTERS = ['all', 'pending', 'approved', 'overridden', 'flagged'];

const useGrading = (examId) => {
  const [grades, setGrades]             = useState([]);
  const [currentIdx, setCurrentIdx]     = useState(0);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [loading, setLoading]           = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError]               = useState(null);

  // ─── Derived state ──────────────────────────────────────────────────────────

  const filtered = useMemo(
    () => statusFilter === 'all'
      ? grades
      : grades.filter((g) => g.status === statusFilter),
    [grades, statusFilter]
  );

  // Current grade the TA is looking at
  const current = filtered[currentIdx] ?? null;

  // Count of each status bucket — used for filter badges and progress bar
  const counts = useMemo(() => {
    const c = { all: grades.length };
    STATUS_FILTERS.slice(1).forEach((st) => {
      c[st] = grades.filter((g) => g.status === st).length;
    });
    return c;
  }, [grades]);

  // What % of the queue has been reviewed (approved or overridden)
  const reviewProgress = grades.length
    ? Math.round(((counts.approved + counts.overridden) / grades.length) * 100)
    : 0;

  // ─── Data fetching ──────────────────────────────────────────────────────────

  /**
   * Fetch grades from the API and populate state.
   * Call this on mount and after any bulk action.
   */
  const refresh = useCallback(async (filter = statusFilter) => {
    if (!examId) return;
    setLoading(true);
    setError(null);
    try {
      const { grades: fetched } = await gradeService.getGrades(examId, { status: filter === 'all' ? undefined : filter });
      setGrades(fetched);
      setCurrentIdx(0);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to load grades';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [examId, statusFilter]);

  // ─── Navigation ─────────────────────────────────────────────────────────────

  const goNext = useCallback(() => {
    setCurrentIdx((i) => Math.min(i + 1, filtered.length - 1));
  }, [filtered.length]);

  const goPrev = useCallback(() => {
    setCurrentIdx((i) => Math.max(i - 1, 0));
  }, []);

  const goTo = useCallback((idx) => {
    setCurrentIdx(Math.max(0, Math.min(idx, filtered.length - 1)));
  }, [filtered.length]);

  // ─── Optimistic update helper ────────────────────────────────────────────────

  const patchGrade = (id, patch) =>
    setGrades((gs) => gs.map((g) => (g._id === id ? { ...g, ...patch } : g)));

  // ─── Actions ────────────────────────────────────────────────────────────────

  /**
   * Approve the AI-proposed grade for the current item.
   * Optimistically updates the UI, then calls the API.
   * Rolls back on failure.
   */
  const approve = useCallback(async (gradeId = current?._id) => {
    if (!gradeId) return;

    // Optimistic update
    patchGrade(gradeId, { status: 'approved' });
    goNext();
    toast.success('Approved', {
      icon: '✓',
      style: { borderLeft: '3px solid #22c55e' },
    });

    try {
      await gradeService.approveGrade(gradeId);
    } catch (err) {
      // Roll back on failure
      patchGrade(gradeId, { status: 'pending' });
      toast.error('Approval failed — reverted');
    }
  }, [current, goNext]);

  /**
   * Override the AI grade with a TA-corrected score and reason.
   * @param {string} gradeId
   * @param {number} score      - TA-corrected score
   * @param {string} reason     - Mandatory justification
   */
  const override = useCallback(async (gradeId, { score, reason }) => {
    if (!gradeId) return;
    setActionLoading(true);

    // Optimistic update
    const previous = grades.find((g) => g._id === gradeId);
    patchGrade(gradeId, { status: 'overridden', taScore: score, overrideReason: reason });
    goNext();
    toast.success('Grade overridden', { icon: '✎' });

    try {
      await gradeService.overrideGrade(gradeId, { score, reason });
    } catch (err) {
      // Roll back
      if (previous) patchGrade(gradeId, previous);
      toast.error('Override failed — reverted');
    } finally {
      setActionLoading(false);
    }
  }, [grades, goNext]);

  /**
   * Skip the current item without changing its status.
   * Just advances to the next item.
   */
  const skip = useCallback(() => {
    if (!current) return;
    toast('Skipped', { icon: '→' });
    goNext();
  }, [current, goNext]);

  /**
   * Flag a grade for further attention (bad OCR, suspected plagiarism, etc.)
   * @param {string} gradeId
   * @param {string} reason
   */
  const flag = useCallback(async (gradeId, reason) => {
    if (!gradeId) return;

    patchGrade(gradeId, { status: 'flagged', flagReason: reason });
    toast('Flagged for review', { icon: '⚑' });

    try {
      await gradeService.flagGrade(gradeId, reason);
    } catch (err) {
      patchGrade(gradeId, { status: 'pending', flagReason: undefined });
      toast.error('Flag failed — reverted');
    }
  }, []);

  /**
   * Unflag a previously flagged grade.
   * @param {string} gradeId
   */
  const unflag = useCallback(async (gradeId) => {
    if (!gradeId) return;

    patchGrade(gradeId, { status: 'pending', flagReason: undefined });

    try {
      await gradeService.unflagGrade(gradeId);
    } catch (err) {
      patchGrade(gradeId, { status: 'flagged' });
      toast.error('Unflag failed — reverted');
    }
  }, []);

  /**
   * Change the status filter and reset cursor to the top.
   */
  const changeFilter = useCallback((filter) => {
    setStatusFilter(filter);
    setCurrentIdx(0);
  }, []);

  // ─── Return ──────────────────────────────────────────────────────────────────

  return {
    // Data
    grades,
    filtered,
    current,
    currentIdx,

    // Filter
    statusFilter,
    setStatusFilter: changeFilter,

    // Derived
    counts,
    reviewProgress,

    // State flags
    loading,
    actionLoading,
    error,

    // Navigation
    goNext,
    goPrev,
    goTo,

    // Actions
    approve,
    override,
    skip,
    flag,
    unflag,

    // Refetch
    refresh,
  };
};

export default useGrading;