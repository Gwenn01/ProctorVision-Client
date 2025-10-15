import axios from "axios";

// Hugging Face AI backend
const apiAI = axios.create({
  baseURL:
    process.env.REACT_APP_AI_BASE_URL ||
    "https://gwen01-proctorvision-ai.hf.space/api", // ✅ include /api prefix
  headers: {
    "Content-Type": "application/json",
  },
});

apiAI.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default apiAI;
