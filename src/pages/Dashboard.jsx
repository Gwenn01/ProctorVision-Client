import React, { useState, useEffect } from "react";
import { Container, Row, Col } from "react-bootstrap";
import { Routes, Route } from "react-router-dom";
import Sidebar from "../components/Sidebar";

// Admin Pages
import CreateAccount from "./AdminDashboard/CreateAccount";
import ManageAccount from "./AdminDashboard/ManageAccount";
import ManageAdminExam from "./AdminDashboard/ManageExam";
import ManageBehavior from "./AdminDashboard/ManageBehavior";
import VerifySuccess from "./VerifySuccess";

// Instructor Pages
import CreateExam from "./InstructorDashboard/CreateExam";
import ManageExam from "./InstructorDashboard/ManageExam";
import ManageStudentEnroll from "./InstructorDashboard/ManageStudentEnroll";
import StudentBehavior from "./InstructorDashboard/StudentBehavior";

// Student Pages
import TakeExam from "./StudentDashboard/TakeExam";

const Dashboard = () => {
  const userData = JSON.parse(localStorage.getItem("userData") || "{}");
  const role = userData.role || "Student";
  const instructorId = userData.id || null;

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Update when resizing
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <Container fluid className="p-0 bg-white">
      <Row className="g-0">
        {/* Sidebar */}
        <Sidebar role={role} />

        {/* Main content */}
        <Col
          className="py-3 px-4"
          style={{
            // remove margin on mobile, apply margin on desktop
            marginLeft: isMobile ? "0" : "240px",
            width: isMobile ? "100%" : "calc(100% - 240px)",
            minHeight: "100vh",
            backgroundColor: "#fff",
          }}
        >
          <Routes>
            {/* Public route */}
            <Route path="/verify-success" element={<VerifySuccess />} />

            {/* Admin Routes */}
            {role === "Admin" && (
              <>
                <Route path="/" element={<CreateAccount />} />
                <Route path="create-account" element={<CreateAccount />} />
                <Route path="manage-account" element={<ManageAccount />} />
                <Route path="manage-admin-exam" element={<ManageAdminExam />} />
                <Route
                  path="manage-admin-behavior"
                  element={<ManageBehavior />}
                />
              </>
            )}

            {/* Instructor Routes */}
            {role === "Instructor" && (
              <>
                <Route
                  path="/"
                  element={<ManageStudentEnroll instructorId={instructorId} />}
                />
                <Route
                  path="manage-student"
                  element={<ManageStudentEnroll instructorId={instructorId} />}
                />
                <Route path="create-exam" element={<CreateExam />} />
                <Route path="manage-exam" element={<ManageExam />} />
                <Route path="student-behavior" element={<StudentBehavior />} />
              </>
            )}

            {/* Student Routes */}
            {role === "Student" && (
              <>
                <Route path="/" element={<TakeExam />} />
                <Route path="take-exam" element={<TakeExam />} />
              </>
            )}

            {/* Fallback */}
            <Route path="*" element={<h4>Page Not Found</h4>} />
          </Routes>
        </Col>
      </Row>
    </Container>
  );
};

export default Dashboard;
