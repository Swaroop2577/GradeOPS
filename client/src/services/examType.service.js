import api from './api';

export const examTypeService = {
  // List all exam types for a course
  listExamTypes: (courseId) =>
    api.get('/exam-types', { params: { courseId } }).then((r) => r.data.examTypes),

  // Create a new exam type under a course
  createExamType: (courseId, label) =>
    api.post('/exam-types', { courseId, label }).then((r) => r.data.examType),

  // Get single exam type with its exams + rubric
  getExamType: (id) =>
    api.get(`/exam-types/${id}`).then((r) => r.data.examType),

  // Rename
  updateExamType: (id, label) =>
    api.patch(`/exam-types/${id}`, { label }).then((r) => r.data.examType),

  // Delete (also removes child exams)
  deleteExamType: (id) =>
    api.delete(`/exam-types/${id}`).then((r) => r.data),

  // Get per-student grades detail for a paper upload (fixes View button)
  getSubmissionsDetail: (examId) =>
    api.get(`/exams/${examId}/submissions-detail`).then((r) => r.data),
};
