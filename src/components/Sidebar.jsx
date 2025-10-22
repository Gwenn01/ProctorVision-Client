import React, { useState } from "react";
import { Nav, Offcanvas, Button } from "react-bootstrap";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { toast } from "react-toastify";
import logo from "../assets/prmsu-logo.png";
import api from "../api";

const Sidebar = ({ role }) => {
  const [show, setShow] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const userData = JSON.parse(localStorage.getItem("userData"));
  const username = userData?.username || "Unknown";

  const handleLogout = async () => {
    const user = JSON.parse(localStorage.getItem("userData"));
    const token = localStorage.getItem("token");

    if (user?.role === "Student") {
      try {
        await api.post(
          "/api/logout",
          { student_id: user.id },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } catch (error) {
        console.error("Logout API failed:", error);
      }
    }

    localStorage.clear();
    toast.success("Logged out successfully!", { autoClose: 2000 });
    setTimeout(() => navigate("/login", { replace: true }), 1000);
  };

  const menuItems = {
    Admin: [
      { href: "create-account", icon: "people", label: "Create Account" },
      { href: "manage-account", icon: "gear", label: "Manage Account" },
      {
        href: "manage-admin-exam",
        icon: "clipboard-data",
        label: "Manage Exam",
      },
      {
        href: "manage-admin-behavior",
        icon: "activity",
        label: "Manage Behavior",
      },
    ],
    Instructor: [
      { href: "manage-student", icon: "person", label: "Manage Student" },
      { href: "create-exam", icon: "book", label: "Exam Setup" },
      { href: "manage-exam", icon: "chat", label: "Manage Exam" },
      {
        href: "student-behavior",
        icon: "bar-chart",
        label: "Student Behavior",
      },
    ],
    Student: [{ href: "take-exam", icon: "book", label: "Take Exam" }],
  };

  const panelTitle =
    role === "Admin"
      ? "Admin Panel"
      : role === "Instructor"
      ? "Instructor Panel"
      : "Student Dashboard";

  const links = menuItems[role] || menuItems.Student;

  return (
    <>
      {/* Toggle Button (visible only on mobile) */}
      <Button
        variant="dark"
        className="d-md-none position-fixed top-0 start-0 m-3 z-3"
        onClick={() => setShow(true)}
      >
        <i className="bi bi-list fs-4"></i>
      </Button>

      {/* Sidebar for large screens */}
      <div
        className="d-none d-md-flex flex-column text-white p-3 gap-3 bg-dark"
        style={{
          position: "fixed",
          top: 0,
          bottom: 0,
          left: 0,
          width: "240px",
          overflowY: "auto",
          zIndex: 1000,
        }}
      >
        <SidebarContent
          panelTitle={panelTitle}
          username={username}
          links={links}
          location={location}
          handleLogout={handleLogout}
        />
      </div>

      {/* Offcanvas for mobile */}
      <Offcanvas
        show={show}
        onHide={() => setShow(false)}
        className="bg-dark text-white"
      >
        <Offcanvas.Header closeButton closeVariant="white">
          <Offcanvas.Title>{panelTitle}</Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body>
          <SidebarContent
            panelTitle={panelTitle}
            username={username}
            links={links}
            location={location}
            handleLogout={handleLogout}
            onClose={() => setShow(false)}
          />
        </Offcanvas.Body>
      </Offcanvas>
    </>
  );
};

const SidebarContent = ({
  panelTitle,
  username,
  links,
  location,
  handleLogout,
  onClose,
}) => (
  <>
    {/* Logo and title */}
    <div className="text-center mb-3">
      <img
        src={logo}
        alt="Logo"
        style={{ width: "60px", height: "60px" }}
        className="mb-2"
      />
      <h5 className="fw-bold mb-1">{panelTitle}</h5>
      <div className="d-flex justify-content-center align-items-center gap-1">
        <i className="bi bi-person-circle fs-5"></i>
        <span className="fst-italic" style={{ fontSize: "0.9rem" }}>
          Welcome, <span className="fw-semibold">{username}</span>
        </span>
      </div>
    </div>

    {/* Navigation Links */}
    <Nav className="flex-column gap-2">
      {links.map((link, index) => (
        <Nav.Item key={index}>
          <Link
            to={`/dashboard/${link.href}`}
            className={`nav-link text-white d-flex align-items-center px-3 py-2 rounded ${
              location.pathname.includes(link.href) ? "bg-primary" : ""
            }`}
            onClick={onClose}
          >
            <i className={`bi bi-${link.icon} me-2 fs-5`}></i>
            {link.label}
          </Link>
        </Nav.Item>
      ))}
    </Nav>

    {/* Logout */}
    <div className="mt-auto pt-3">
      <Nav.Item>
        <span
          role="button"
          onClick={handleLogout}
          className="nav-link text-white d-flex align-items-center px-3 py-2 rounded bg-danger bg-opacity-75"
        >
          <i className="bi bi-box-arrow-right me-2 fs-5"></i> Logout
        </span>
      </Nav.Item>
    </div>
  </>
);

export default Sidebar;
