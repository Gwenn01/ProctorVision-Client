import axios from "axios";

const api = axios.create({
  baseURL:
    process.env.REACT_APP_API_BASE_URL ||
    "https://proctorvision-server-production.up.railway.app",
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
