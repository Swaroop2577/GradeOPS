import api from './api';

export const courseService = {
  listCourses: async () => {
    const { data } = await api.get('/courses');
    return data.courses;
  },
  createCourse: async (payload) => {
    const { data } = await api.post('/courses', payload);
    return data.course;
  },
  updateCourse: async (id, payload) => {
    const { data } = await api.patch(`/courses/${id}`, payload);
    return data.course;
  },
  deleteCourse: async (id) => {
    const { data } = await api.delete(`/courses/${id}`);
    return data;
  },
};