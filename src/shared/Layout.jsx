import React from "react";
import { Routes, Route } from "react-router-dom"; // Remove BrowserRouter
import Login from "../pages/LoginPage";
import ProtectedRoute from "../components/ProtectedRoute";
import Dashboard from "../pages/Dashboard";
import VerificationSuccess from "../verification"; // Import the VerificationSuccess component

const Layout = () => {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/dashboard/*"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      {/* Add VerificationSuccess route */}
      <Route path="/verification-success" element={<VerificationSuccess />} />
    </Routes>
  );
};

export default Layout;
