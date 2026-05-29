import api from './api'; 

export const authService = {
  register: async ({ name, email, password, role }) => {
    const { data } = await api.post('/auth/register', { name, email, password, role });
    return { accessToken: data.token, user: data.user }; // ← fix
  },

  login: async ({ email, password }) => {
    const { data } = await api.post('/auth/login', { email, password });
    return { accessToken: data.token, user: data.user }; // ← fix
  },

  logout: async () => {
    await api.post('/auth/logout');
  },

  refresh: async () => {
    const { data } = await api.post('/auth/refresh');
    return { accessToken: data.token }; // ← fix
  },

  getMe: async () => {
    const { data } = await api.get('/auth/me');
    return data; // ← fix: no data.data.user wrapper, backend returns user directly
  },
};