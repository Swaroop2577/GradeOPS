import api from './api';

export const gradeService = {
  // ─── Fetching grades ─────────────────────────────────────────────────────────

  /**
   * Get the TA review queue — all grades for an exam with optional filters.
   * GET /grades?examId=<id>&status=<status>&confidence=<low|medium|high>&page=<n>&limit=<n>
   *
   * confidence filter:
   *   low    → < 0.6   (mandatory TA review)
   *   medium → 0.6–0.8
   *   high   → > 0.8
   */
  getGrades: async (examId, { status, confidence, page = 1, limit = 30 } = {}) => {
    const { data } = await api.get('/grades', {
      params: { examId, status, confidence, page, limit },
    });
    return data.data; // { grades: [], total, page, totalPages, pendingCount }
  },

  /**
   * Get a single grade record with full detail.
   * GET /grades/:id
   */
  getGradeById: async (gradeId) => {
    const { data } = await api.get(`/grades/${gradeId}`);
    return data.data; // { grade }
  },

  /**
   * Get all grades for a specific student submission.
   * GET /grades?submissionId=<id>
   */
  getGradesBySubmission: async (submissionId) => {
    const { data } = await api.get('/grades', { params: { submissionId } });
    return data.data; // { grades: [] }
  },

  // ─── TA review actions ───────────────────────────────────────────────────────

  /**
   * Approve the AI-proposed grade — no changes needed.
   * PATCH /grades/:id/approve
   */
  approveGrade: async (gradeId) => {
    const { data } = await api.patch(`/grades/${gradeId}/approve`);
    return data.data; // { grade }
  },

  /**
   * Override the AI grade with a TA-corrected score + reason.
   * PATCH /grades/:id/override
   * Body: { score: number, reason: string }
   */
  overrideGrade: async (gradeId, { score, reason }) => {
    const { data } = await api.patch(`/grades/${gradeId}/override`, { score, reason });
    return data.data; // { grade }
  },

  /**
   * Bulk approve an array of grade IDs at once.
   * PATCH /grades/bulk-approve
   * Body: { gradeIds: string[] }
   */
  bulkApprove: async (gradeIds) => {
    const { data } = await api.patch('/grades/bulk-approve', { gradeIds });
    return data.data; // { approvedCount }
  },

  // ─── Flagging ────────────────────────────────────────────────────────────────

  /**
   * Flag a grade for further review (e.g. suspected plagiarism or bad OCR).
   * PATCH /grades/:id/flag
   * Body: { reason: string }
   */
  flagGrade: async (gradeId, reason) => {
    const { data } = await api.patch(`/grades/${gradeId}/flag`, { reason });
    return data.data; // { grade }
  },

  /**
   * Remove a flag from a grade.
   * PATCH /grades/:id/unflag
   */
  unflagGrade: async (gradeId) => {
    const { data } = await api.patch(`/grades/${gradeId}/unflag`);
    return data.data; // { grade }
  },

  // ─── Analytics ───────────────────────────────────────────────────────────────

  /**
   * Get grade distribution stats for an exam.
   * GET /grades/stats?examId=<id>
   * Returns: { mean, median, stdDev, distribution: [], reviewProgress }
   */
  getGradeStats: async (examId) => {
    const { data } = await api.get('/grades/stats', { params: { examId } });
    return data.data;
  },

  /**
   * Get per-question breakdown — useful for instructors to spot hard questions.
   * GET /grades/question-stats?examId=<id>
   * Returns: { questions: [{ number, title, avgScore, passRate }] }
   */
  getQuestionStats: async (examId) => {
    const { data } = await api.get('/grades/question-stats', { params: { examId } });
    return data.data;
  },

  /**
   * Get TA activity summary — how many each TA approved vs overridden.
   * GET /grades/ta-stats?examId=<id>
   * Returns: { tas: [{ taId, name, approved, overridden, avgTimePerReview }] }
   */
  getTAStats: async (examId) => {
    const { data } = await api.get('/grades/ta-stats', { params: { examId } });
    return data.data;
  },
};