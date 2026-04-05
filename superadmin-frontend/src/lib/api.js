import axios from 'axios';
import toast from 'react-hot-toast';

const api = axios.create({
  // Automatic Cloud Scaling Switch
  baseURL: import.meta.env.VITE_API_URL || '/api/superadmin',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor for SuperAdmin Token (Global Control)
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('sa_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Error handling for SuperAdmin (IP blocks/Unauthorized)
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message = error.response?.data?.message || 'Server Error: Check your SuperAdmin Firewall';
    toast.error(message);
    if (error.response?.status === 401 || error.response?.status === 403) {
      localStorage.removeItem('sa_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
