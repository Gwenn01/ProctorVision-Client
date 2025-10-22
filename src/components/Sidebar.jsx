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
      {/* ✅ Professional Floating Hamburger Toggle (mobile only) */}
      {!show && (
        <Button
          variant="dark"
          className="d-md-none position-fixed top-3 start-3 border-0 shadow-lg rounded-circle"
          style={{
            zIndex: 1060,
            width: "46px",
            height: "46px",
            backgroundColor: "#212529",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            transition: "all 0.3s ease-in-out",
          }}
          onClick={() => setShow(true)}
        >
          <div className="hamburger-icon">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </Button>
      )}

      {/* ✅ Sidebar for Desktop */}
      <div
        className="d-none d-md-flex flex-column text-white p-3 bg-dark"
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

      {/* ✅ Offcanvas for Mobile */}
      <Offcanvas
        show={show}
        onHide={() => setShow(false)}
        placement="start"
        className="bg-dark text-white shadow-lg"
        style={{ width: "260px" }}
      >
        <Offcanvas.Header
          closeButton
          closeVariant="white"
          className="border-bottom border-secondary"
        >
          <Offcanvas.Title className="fw-semibold text-white">
            {panelTitle}
          </Offcanvas.Title>
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
    {/* Logo & Title */}
    <div className="text-center mb-3">
      <img
        src={logo}
        alt="Logo"
        width="70"
        height="70"
        className="mb-2 rounded-circle"
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
    <Nav className="flex-column gap-2 mt-3">
      {links.map((link, index) => (
        <Nav.Item key={index}>
          <Link
            to={`/dashboard/${link.href}`}
            className={`nav-link text-white d-flex align-items-center px-3 py-2 rounded ${
              location.pathname.includes(link.href) ? "bg-primary" : ""
            }`}
            style={{ transition: "all 0.2s" }}
            onClick={onClose}
          >
            <i className={`bi bi-${link.icon} me-2 fs-5`}></i>
            {link.label}
          </Link>
        </Nav.Item>
      ))}
    </Nav>

    {/* Logout Button */}
    <div className="mt-auto pt-4">
      <Nav.Item>
        <span
          role="button"
          onClick={handleLogout}
          className="nav-link d-flex align-items-center justify-content-center text-white fw-semibold rounded py-2"
          style={{
            backgroundColor: "#dc3545",
            transition: "background 0.3s ease",
          }}
        >
          <i className="bi bi-box-arrow-right me-2 fs-5"></i> Logout
        </span>
      </Nav.Item>
    </div>
  </>
);

export default Sidebar;
