import React, { useEffect, useState } from "react";
import {
  Container,
  Card,
  Row,
  Col,
  Modal,
  Spinner,
  Table,
  Image,
  Button,
} from "react-bootstrap";
import { toast, ToastContainer } from "react-toastify";
import {
  BsCalendarEvent,
  BsClock,
  BsCheckCircle,
  BsBoxArrowInDownLeft,
  BsExclamationTriangleFill,
  BsCpuFill,
} from "react-icons/bs";
import { Doughnut, Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
} from "chart.js";

// Register chart elements
ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  Title
);

import "react-toastify/dist/ReactToastify.css";
import "./../../styles/indicatior.css";
import Swal from "sweetalert2";
import api from "../../api";
import apiWebRTC from "../../apiWebRTC";

const StudentBehavior = () => {
  const [exams, setExams] = useState([]);
  const [selectedExam, setSelectedExam] = useState(null);
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [behaviorLogs, setBehaviorLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCurrentExamModal, setShowCurrentExamModal] = useState(false);
  const [showPastExamModal, setShowPastExamModal] = useState(false);
  const [showBehaviorModal, setShowBehaviorModal] = useState(false);
  // exam result
  const [reviewData, setReviewData] = useState(null);
  const [showReviewModal, setShowReviewModal] = useState(false);

  const instructorId = JSON.parse(localStorage.getItem("userData"))?.id;

  const [loadingStudent, setLoadingStudent] = useState(null);
  const [loadingReview, setLoadingReview] = useState(null);
  const [loadingExamId, setLoadingExamId] = useState(null);
  // logs
  const [behaviorSummary, setBehaviorSummary] = useState(null);

  useEffect(() => {
    const fetchExams = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/api/exams-instructor/${instructorId}`);
        setExams(res.data);
      } catch (err) {
        toast.error(
          err.response?.data?.error || "Failed to load exams & activities"
        );
      } finally {
        setLoading(false);
      }
    };

    if (instructorId) fetchExams();
  }, [instructorId]);

  // auto-update current exam student statuses
  useEffect(() => {
    let interval;

    const fetchStudentsWithSubmissionStatus = async () => {
      if (!selectedExam || !selectedExam.id) return;

      try {
        const [studentRes, submittedRes] = await Promise.all([
          api.get(`/api/exam-assigned-students/${selectedExam.id}`),
          api.get(`/api/exam-submissions/${selectedExam.id}`),
        ]);

        const studentsData = studentRes.data;
        const submittedIds = submittedRes.data;

        const merged = studentsData.map((student) => ({
          ...student,
          has_submitted: submittedIds.includes(
            student.student_id || student.id
          ),
        }));

        setStudents(merged);

        // check if exam ended
        const now = new Date();
        const toStartDate = (dateStr, timeStr) => {
          const d = new Date(dateStr);
          if (Number.isNaN(d.getTime())) return null;
          let h = 0,
            m = 0,
            s = 0;
          if (/am|pm/i.test(timeStr)) {
            const [hh, mm, ss = "0"] = timeStr
              .replace(/\s?(AM|PM)/i, "")
              .split(":");
            h = parseInt(hh, 10);
            m = parseInt(mm, 10);
            s = parseInt(ss, 10);
            const isPM = /pm/i.test(timeStr);
            if (isPM && h < 12) h += 12;
            if (!isPM && h === 12) h = 0;
          } else {
            const [HH, MM, SS = "0"] = timeStr.split(":");
            h = parseInt(HH, 10);
            m = parseInt(MM, 10);
            s = parseInt(SS, 10);
          }
          d.setHours(h, m, s, 0);
          return d;
        };

        const startTime = toStartDate(
          selectedExam.exam_date,
          selectedExam.start_time
        );
        const durationMin = Number(selectedExam.duration_minutes || 0);
        const endTime = startTime
          ? new Date(startTime.getTime() + durationMin * 60_000)
          : null;

        if (startTime && endTime && now >= endTime) {
          const unsubmittedStudents = studentsData.filter(
            (student) =>
              !submittedIds.includes(student.student_id || student.id)
          );

          for (const student of unsubmittedStudents) {
            await api.post("/api/update_status_timeup", {
              student_id: student.student_id || student.id,
            });
          }
        }
      } catch (err) {
        console.error("Real-time fetch error", err);
      }
    };

    if (selectedExam && selectedExam.id && showCurrentExamModal) {
      fetchStudentsWithSubmissionStatus();
      interval = setInterval(fetchStudentsWithSubmissionStatus, 5000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [selectedExam, showCurrentExamModal]);

  // notification for student capture behavior
  // 🧠 NEW: Instructor real-time notification for cheating captures
  useEffect(() => {
    if (!showCurrentExamModal || !selectedExam || !students.length) return;

    let interval;

    const pollCheatingEvents = async () => {
      try {
        for (const student of students) {
          const res = await apiWebRTC.get("/proctor/last_capture", {
            params: {
              student_id: student.student_id || student.id,
              exam_id: selectedExam.id,
            },
          });

          const { label, at } = res.data || {};
          if (!label || !at) continue;

          // Avoid duplicate notifications
          const key = `${student.student_id || student.id}-${selectedExam.id}`;
          const lastNotifiedAt = localStorage.getItem(`notified_${key}`);
          if (!lastNotifiedAt || parseInt(lastNotifiedAt) < at) {
            localStorage.setItem(`notified_${key}`, at);

            toast.warning(`🚨 Suspicious: ${student.name} (${label})`);
            // 🚨 SweetAlert2 popup
            Swal.fire({
              title: "🚨 Suspicious Alert!",
              text: `${student.name} was detected ${label}.`,
              background: "#1e1e1e",
              color: "#fff",
              confirmButtonColor: "#d33",
              timer: 5000, // auto close after 5 seconds
              timerProgressBar: true,
            });
          }
        }
      } catch (err) {
        console.error("Polling error:", err.message);
      }
    };

    interval = setInterval(pollCheatingEvents, 5000); // every 5 seconds
    return () => clearInterval(interval);
  }, [selectedExam, showCurrentExamModal, students]);

  const groupExams = () => {
    const now = new Date();
    const todayDateStr = now.toISOString().split("T")[0];
    const past = [];
    const current = [];

    exams.forEach((exam) => {
      if (!exam.exam_date || !exam.start_time || !exam.duration_minutes) return;
      const [hour, minute] = exam.start_time.split(":").map(Number);
      const startDateTime = new Date(exam.exam_date);
      startDateTime.setHours(hour, minute, 0, 0);
      const endDateTime = new Date(startDateTime);
      endDateTime.setMinutes(
        endDateTime.getMinutes() + parseInt(exam.duration_minutes)
      );
      const examDateStr = startDateTime.toISOString().split("T")[0];

      if (examDateStr === todayDateStr && now <= endDateTime) {
        current.push({
          ...exam,
          startTimeObj: startDateTime,
          endTimeObj: endDateTime,
        });
      } else if (endDateTime < now) {
        past.push({
          ...exam,
          startTimeObj: startDateTime,
          endTimeObj: endDateTime,
        });
      }
    });

    return { past, current };
  };

  const { past, current } = groupExams();

  const handleCurrentExamClick = async (exam) => {
    setSelectedExam(exam);
    setSelectedStudent(null);
    try {
      const studentRes = await api.get(
        `/api/exam-assigned-students/${exam.id}`
      );
      const studentsData = studentRes.data;

      const submittedRes = await api.get(`/api/exam-submissions/${exam.id}`);
      const submittedIds = submittedRes.data;

      const merged = studentsData.map((student) => ({
        ...student,
        has_submitted: submittedIds.includes(student.student_id || student.id),
      }));
      setStudents(merged);
      setShowCurrentExamModal(true);
    } catch {
      toast.error("Failed to load current exam/activity students");
    }
  };
  // notification

  const handlePastExamClick = async (exam) => {
    setSelectedExam(exam);
    setSelectedStudent(null);
    setLoading(true);

    try {
      // ✅ Fetch all student behaviors for this exam
      const res = await api.get(`/api/get_exam_behavior_summary`, {
        params: { exam_id: exam.id },
      });

      const summary = res.data;
      setBehaviorSummary(summary);

      // ✅ Fetch detailed students list if needed
      const resStudents = await api.get(`/api/exam-behavior/${exam.id}`);
      const sortedStudents = resStudents.data.sort((a, b) => {
        const statusPriority = {
          Cheated: 0,
          Completed: 1,
          "Did Not Take Exam": 2,
        };
        return statusPriority[a.exam_status] - statusPriority[b.exam_status];
      });

      setStudents(sortedStudents);
      setShowPastExamModal(true);
    } catch (error) {
      console.error("Error loading behavior summary:", error);
      toast.error("Failed to load past exam/activity data");
    } finally {
      setLoading(false);
    }
  };
  // ✅ Prepare chart data dynamically
  const donutData = {
    labels: ["Cheating", "Completed", "Did Not Take"],
    datasets: [
      {
        data: [
          students.filter((s) => s.exam_status === "Cheated").length,
          students.filter((s) => s.exam_status === "Completed").length,
          students.filter((s) => s.exam_status === "Did Not Take Exam").length,
        ],
        backgroundColor: ["#dc3545", "#198754", "#6c757d"], // red, green, gray
        borderWidth: 1,
      },
    ],
  };

  const barData = {
    labels: Object.keys(behaviorSummary?.behavior_counts || {}),
    datasets: [
      {
        label: "Behavior Frequency",
        data: Object.values(behaviorSummary?.behavior_counts || {}),
        backgroundColor: "#0d6efd", // blue
      },
    ],
  };

  const handleStudentClick = async (student) => {
    setSelectedStudent(student);
    const studentId = student.student_id || student.id;
    try {
      const res = await api.get(
        `/api/behavior-images/${selectedExam.id}/${studentId}`
      );
      setBehaviorLogs(res.data);
      setShowBehaviorModal(true);
    } catch {
      toast.error("Failed to load behavior logs");
    }
  };

  const formatDate = (date) =>
    date.toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  const formatTimeRange = (examDate, startTime, duration) => {
    const [hour, minute] = startTime.split(":").map(Number);
    const start = new Date(examDate);
    start.setHours(hour, minute, 0, 0);
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + parseInt(duration));
    return `${start.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })} - ${end.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })}`;
  };

  const handleStudentReviewClick = async (student) => {
    setReviewData(null);
    setSelectedStudent(student);
    const studentId = student.student_id || student.id;

    if (!selectedExam) return toast.error("No exam selected.");

    try {
      setLoading(true);
      let res;

      if (selectedExam.exam_category?.toLowerCase() === "coding") {
        // Coding exam review endpoint
        res = await api.get(
          `/api/coding_submission/${selectedExam.id}/${studentId}`
        );
      } else {
        //  Regular exam review endpoint
        res = await api.get("/api/exam-review", {
          params: {
            exam_id: selectedExam.id,
            user_id: studentId,
          },
        });
      }

      //  Handle if no data was returned
      if (!res.data || Object.keys(res.data).length === 0) {
        toast.info("No review or submission found for this student yet.");
        return;
      }

      //  If there is valid data
      setReviewData(res.data);
      setShowReviewModal(true);
    } catch (err) {
      console.error(
        "❌ Error fetching exam review:",
        err.response?.data || err.message
      );

      if (err.response?.status === 404) {
        toast.info("No review available for this student yet.");
      } else {
        toast.error("Failed to load exam review. Please try again later.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container className="py-4">
      <ToastContainer />
      <h2 className="text-start fw-bold mb-4" style={{ color: "#0d0e0eff" }}>
        <BsCalendarEvent className="me-2" />
        Student Behavior Overview
      </h2>

      {loading ? (
        <div className="text-center">
          <Spinner animation="border" />
        </div>
      ) : (
        <Row>
          {[
            {
              label: "Current Exams & Activities",
              color: "success",
              icon: <BsCheckCircle className="me-2" />,
              data: current,
              handler: handleCurrentExamClick,
            },
            {
              label: "Past Exams & Activities",
              color: "secondary",
              icon: <BsBoxArrowInDownLeft className="me-2" />,
              data: past,
              handler: handlePastExamClick,
            },
          ].map((group, idx) => (
            <Col md={6} lg={5} key={idx}>
              <Card className="shadow mb-4 h-100 border-0 rounded-3">
                <Card.Header
                  className={`bg-${group.color} text-white fw-semibold rounded-top-3 d-flex align-items-center`}
                  style={{
                    background:
                      group.color === "success"
                        ? "linear-gradient(135deg, #198754, #28a745)"
                        : "linear-gradient(135deg, #6c757d, #adb5bd)",
                  }}
                >
                  <span className="me-2 fs-5">{group.icon}</span>
                  {group.label}
                </Card.Header>

                <Card.Body
                  className="overflow-auto bg-light"
                  style={{
                    maxHeight: "420px",
                    borderRadius: "0 0 0.5rem 0.5rem",
                  }}
                >
                  {group.data.length ? (
                    group.data.map((exam) => (
                      <Card
                        key={exam.id}
                        className={`mb-3 border-0 shadow-sm ${
                          loadingExamId === exam.id ? "opacity-75" : ""
                        }`}
                        style={{
                          cursor: loadingExamId ? "not-allowed" : "pointer",
                          transition: "all 0.2s ease-in-out",
                        }}
                        onClick={async () => {
                          if (loadingExamId) return;
                          setLoadingExamId(exam.id);
                          try {
                            await group.handler(exam);
                          } finally {
                            setLoadingExamId(null);
                          }
                        }}
                      >
                        <Card.Body className="d-flex justify-content-between align-items-center">
                          <div>
                            <h6 className="mb-1 fw-bold text-dark">
                              {exam.title}
                            </h6>
                            <div className="text-muted small">
                              <i className="bi bi-calendar-event me-1"></i>
                              {formatDate(new Date(exam.exam_date))}
                              <br />
                              <i className="bi bi-clock me-1"></i>
                              {formatTimeRange(
                                exam.exam_date,
                                exam.start_time,
                                exam.duration_minutes
                              )}
                            </div>
                          </div>

                          {loadingExamId === exam.id ? (
                            <Spinner
                              animation="border"
                              variant="primary"
                              size="sm"
                              className="ms-2"
                            />
                          ) : (
                            <i className="bi bi-chevron-right text-secondary fs-5"></i>
                          )}
                        </Card.Body>
                      </Card>
                    ))
                  ) : (
                    <div className="text-center py-5 text-muted">
                      <i className="bi bi-inboxes fs-2 d-block mb-2"></i>
                      No exams or activities
                    </div>
                  )}
                </Card.Body>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      {/* Current Exam Modal */}
      <Modal
        show={showCurrentExamModal}
        onHide={() => setShowCurrentExamModal(false)}
        size="xl"
        centered
      >
        <Modal.Header closeButton className="bg-dark text-white">
          <Modal.Title>
            <i className="bi bi-people me-2"></i>
            Students Taking Exam/Activity – {selectedExam?.title}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {students.length ? (
            <Table
              striped
              bordered
              hover
              responsive
              className="align-middle shadow-sm"
            >
              <thead className="table-light">
                <tr>
                  <th>Name</th>
                  <th>Username</th>
                  <th>Login</th>
                  <th>Exam/Activity</th>
                  <th>Other Tab</th>
                  <th className="text-center">Suspicious</th>
                  <th>Submitted</th>
                  <th className="text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.student_id}>
                    <td className="fw-semibold">{student.name}</td>
                    <td className="text-muted">{student.username}</td>
                    <td>
                      {student.is_login ? (
                        <span className="badge bg-success">Yes</span>
                      ) : (
                        <span className="badge bg-secondary">No</span>
                      )}
                    </td>
                    <td>
                      {student.is_taking_exam ? (
                        <span className="badge bg-info text-dark">Taking</span>
                      ) : (
                        <span className="badge bg-secondary">No</span>
                      )}
                    </td>
                    <td>
                      {student.is_other_tab ? (
                        <span className="badge bg-danger">Yes</span>
                      ) : (
                        <span className="badge bg-secondary">No</span>
                      )}
                    </td>

                    <td className="text-center">
                      {student.has_submitted ? (
                        <span className="badge bg-success">Submitted</span>
                      ) : (
                        <span className="badge bg-warning text-dark">
                          {student.suspicious_behavior_count ?? 0}
                        </span>
                      )}
                    </td>
                    <td>
                      {student.has_submitted ? (
                        <span className="badge bg-success">Yes</span>
                      ) : (
                        <span className="badge bg-secondary">No</span>
                      )}
                    </td>
                    <td className="text-center">
                      <Button
                        variant="outline-primary"
                        size="sm"
                        disabled={loadingStudent === student.id}
                        onClick={async () => {
                          setLoadingStudent(student.id);
                          await handleStudentClick(student);
                          setLoadingStudent(null);
                        }}
                      >
                        {loadingStudent === student.id ? (
                          <>
                            <Spinner
                              as="span"
                              animation="border"
                              size="sm"
                              role="status"
                              className="me-2"
                            />
                            Loading...
                          </>
                        ) : (
                          <>
                            <i className="bi bi-eye me-1"></i> View
                          </>
                        )}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <p className="text-muted text-center">
              No assigned students found.
            </p>
          )}
        </Modal.Body>
      </Modal>

      {/* Past Exam Modal */}
      <Modal
        show={showPastExamModal}
        onHide={() => setShowPastExamModal(false)}
        size="lg"
        centered
      >
        <Modal.Header closeButton className="bg-dark text-white">
          <Modal.Title>
            <i className="bi bi-archive me-2"></i>
            Past Exam/Activity – {selectedExam?.title}
          </Modal.Title>
        </Modal.Header>

        <Modal.Body>
          {students.length ? (
            <>
              {/* ✅ Behavior Summary Cards */}
              <Row className="mb-4 text-center">
                <Col md={3}>
                  <div className="p-3 bg-primary text-white rounded shadow-sm">
                    <h6 className="mb-0">
                      <i className="bi bi-people me-1"></i> Total Students
                    </h6>
                    <h4 className="fw-bold mt-1">{students.length}</h4>
                  </div>
                </Col>
                <Col md={3}>
                  <div className="p-3 bg-danger text-white rounded shadow-sm">
                    <h6 className="mb-0">
                      <i className="bi bi-exclamation-triangle me-1"></i>{" "}
                      Cheating
                    </h6>
                    <h4 className="fw-bold mt-1">
                      {
                        students.filter((s) => s.exam_status === "Cheated")
                          .length
                      }
                    </h4>
                  </div>
                </Col>
                <Col md={3}>
                  <div className="p-3 bg-success text-white rounded shadow-sm">
                    <h6 className="mb-0">
                      <i className="bi bi-check-circle me-1"></i> Completed
                    </h6>
                    <h4 className="fw-bold mt-1">
                      {
                        students.filter((s) => s.exam_status === "Completed")
                          .length
                      }
                    </h4>
                  </div>
                </Col>
                <Col md={3}>
                  <div className="p-3 bg-secondary text-white rounded shadow-sm">
                    <h6 className="mb-0">
                      <i className="bi bi-dash-circle me-1"></i> Did Not Take
                    </h6>
                    <h4 className="fw-bold mt-1">
                      {
                        students.filter(
                          (s) => s.exam_status === "Did Not Take Exam"
                        ).length
                      }
                    </h4>
                  </div>
                </Col>
              </Row>
              {/* ✅ Charts Section */}
              {behaviorSummary && (
                <Row className="mb-4">
                  <Col md={6} className="text-center">
                    <div className="bg-white rounded shadow-sm p-3">
                      <h6 className="fw-bold mb-3">Exam Completion Overview</h6>
                      <Doughnut data={donutData} />
                    </div>
                  </Col>
                  <Col md={6} className="text-center">
                    <div className="bg-white rounded shadow-sm p-3">
                      <h6 className="fw-bold mb-3">Behavior Type Frequency</h6>
                      <Bar
                        data={barData}
                        options={{
                          responsive: true,
                          plugins: {
                            legend: { display: false },
                            title: { display: false },
                          },
                          scales: {
                            x: { ticks: { color: "#333" } },
                            y: { beginAtZero: true, ticks: { color: "#333" } },
                          },
                        }}
                      />
                    </div>
                  </Col>
                </Row>
              )}

              {/* ✅ Behavior Details Table */}
              <Table
                bordered
                hover
                responsive
                className="align-middle shadow-sm"
              >
                <thead className="table-light">
                  <tr>
                    <th>Name</th>
                    <th>Username</th>
                    <th>Status</th>
                    <th>Action</th>
                    <th>Exam Result</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => (
                    <tr key={student.id}>
                      <td>{student.name}</td>
                      <td className="text-muted">{student.username}</td>
                      <td>
                        {student.exam_status === "Did Not Take Exam" ? (
                          <span className="badge bg-secondary">
                            Did Not Take
                          </span>
                        ) : student.exam_status === "Cheated" ? (
                          <span className="badge bg-danger">Cheating</span>
                        ) : (
                          <span className="badge bg-success">Completed</span>
                        )}
                      </td>
                      <td>
                        <Button
                          variant="outline-primary"
                          size="sm"
                          disabled={loadingStudent === student.id}
                          onClick={async () => {
                            setLoadingStudent(student.id);
                            await handleStudentClick(student);
                            setLoadingStudent(null);
                          }}
                        >
                          {loadingStudent === student.id ? (
                            <>
                              <Spinner
                                as="span"
                                animation="border"
                                size="sm"
                                role="status"
                                className="me-2"
                              />
                              Loading...
                            </>
                          ) : (
                            <>
                              <i className="bi bi-eye me-1"></i> View
                            </>
                          )}
                        </Button>
                      </td>
                      <td>
                        <Button
                          variant="outline-success"
                          size="sm"
                          disabled={loadingReview === student.id}
                          onClick={async () => {
                            setLoadingReview(student.id);
                            await handleStudentReviewClick(student);
                            setLoadingReview(null);
                          }}
                        >
                          {loadingReview === student.id ? (
                            <>
                              <Spinner
                                as="span"
                                animation="border"
                                size="sm"
                                role="status"
                                className="me-2"
                              />
                              Loading...
                            </>
                          ) : (
                            <>
                              <i className="bi bi-file-earmark-text me-1"></i>{" "}
                              Review
                            </>
                          )}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </>
          ) : (
            <p className="text-muted text-center">
              No behavior data available.
            </p>
          )}
        </Modal.Body>
      </Modal>

      {/* Behavior Modal */}
      <Modal
        show={showBehaviorModal}
        onHide={() => setShowBehaviorModal(false)}
        size="xl"
        centered
      >
        <Modal.Header closeButton className="bg-dark text-white">
          <Modal.Title>
            <i className="bi bi-eye me-2"></i>
            Suspicious Behavior – {selectedStudent?.name} (
            {selectedStudent?.username})
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {behaviorLogs.length ? (
            <Row>
              {behaviorLogs.map((log, idx) => (
                <Col md={4} key={idx} className="mb-4">
                  <Card className="shadow-sm h-100">
                    <Image
                      src={`data:image/jpeg;base64,${log.image_base64}`}
                      alt="Suspicious"
                      fluid
                      className="rounded-top"
                    />
                    <Card.Body>
                      {/*
                      <p className="mb-2">
                        <BsExclamationTriangleFill className="me-1 text-warning" />
                        <strong>Type:</strong> {log.warning_type}
                      </p>
                      */}
                      <p
                        className={`mb-2 fw-semibold ${
                          log.classification_label === "Cheating"
                            ? "text-danger"
                            : "text-success"
                        }`}
                      >
                        <BsCpuFill className="me-1 text-primary" />
                        AI: {log.classification_label}
                      </p>
                      <p className="text-muted small mb-0">
                        <BsClock className="me-1" />
                        {log.timestamp.toLocaleString()}
                      </p>
                    </Card.Body>
                  </Card>
                </Col>
              ))}
            </Row>
          ) : (
            <div className="text-center text-muted">
              <BsCheckCircle className="me-2 text-success" />
              No suspicious behavior detected by the AI model.
            </div>
          )}
        </Modal.Body>
      </Modal>

      {/* 🧾 Exam Review Modal */}
      <Modal
        show={showReviewModal}
        onHide={() => setShowReviewModal(false)}
        size="lg"
        centered
      >
        <Modal.Header closeButton className="bg-primary text-white">
          <Modal.Title>
            <i className="bi bi-file-earmark-text me-2"></i>
            Exam Review – {selectedStudent?.name}
          </Modal.Title>
        </Modal.Header>

        <Modal.Body>
          {reviewData ? (
            <>
              {!reviewData && (
                <div className="text-center py-3">
                  <Spinner animation="border" variant="primary" />
                  <p className="mt-2 text-muted">Loading exam data...</p>
                </div>
              )}
              {/*  Detect QA vs Coding */}
              {selectedExam.exam_category?.toLowerCase() === "coding" ? (
                <>
                  {/*  CODING EXAM RESULT */}
                  <h5 className="fw-bold text-center mb-4 text-primary">
                    Coding Exam Submission
                  </h5>

                  <div className="p-3 border rounded bg-light shadow-sm mb-3">
                    <p>
                      <strong>Language:</strong>{" "}
                      <span className="text-dark">
                        {reviewData.language || "—"}
                      </span>
                    </p>
                    <p>
                      <strong>Submitted At:</strong>{" "}
                      <span className="text-muted">
                        {new Date(reviewData.submitted_at).toLocaleString()}
                      </span>
                    </p>
                  </div>

                  {/* 🧠 Submitted Code */}
                  <div className="mt-3">
                    <h6 className="fw-bold text-primary mb-2">
                      <i className="bi bi-code-slash me-2"></i> Submitted Code
                    </h6>
                    <pre
                      className="bg-dark text-white p-3 rounded"
                      style={{
                        whiteSpace: "pre-wrap",
                        maxHeight: "300px",
                        overflowY: "auto",
                      }}
                    >
                      {reviewData.code || "// No code submitted"}
                    </pre>
                  </div>

                  {/* 🧾 Output */}
                  <div className="mt-4">
                    <h6 className="fw-bold text-primary mb-2">
                      <i className="bi bi-terminal me-2"></i> Program Output
                    </h6>
                    <div
                      className="p-3 bg-white border rounded"
                      style={{
                        whiteSpace: "pre-wrap",
                        fontFamily: "monospace",
                        maxHeight: "200px",
                        overflowY: "auto",
                      }}
                    >
                      {reviewData.output ? (
                        <pre className="m-0">{reviewData.output}</pre>
                      ) : (
                        <p className="text-muted fst-italic m-0">
                          No output available.
                        </p>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* 🧩 QA EXAM RESULT */}
                  <h5 className="fw-bold text-center mb-3">
                    Score:{" "}
                    <span className="text-success">
                      {reviewData.score} / {reviewData.total_score}
                    </span>
                  </h5>

                  <Table striped bordered hover>
                    <thead className="table-light">
                      <tr>
                        <th>#</th>
                        <th>Question</th>
                        <th>Answer</th>
                        <th>Correct Answer</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(reviewData.answers ?? []).map((ans, idx) => (
                        <tr key={idx}>
                          <td>{idx + 1}</td>
                          <td>{ans.question_text}</td>
                          <td>{ans.selected_answer || "-"}</td>
                          <td>{ans.correct_answer || "-"}</td>
                          <td>
                            {ans.is_correct === null ? (
                              <span className="badge bg-warning text-dark">
                                Pending
                              </span>
                            ) : ans.is_correct ? (
                              <span className="badge bg-success">Correct</span>
                            ) : (
                              <span className="badge bg-danger">Wrong</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </>
              )}
            </>
          ) : (
            <p className="text-muted text-center">No review data available.</p>
          )}
        </Modal.Body>
      </Modal>
    </Container>
  );
};

export default StudentBehavior;
