import axios from "axios";

// ProctorVision WebRTC backend
const apiWebRTC = axios.create({
  baseURL: process.env.REACT_APP_WEBRTC_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// 🔐 Optional: include token if needed for authentication
apiWebRTC.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default apiWebRTC;
