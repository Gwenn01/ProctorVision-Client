import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Container,
  Card,
  Button,
  Form,
  ProgressBar,
  Modal,
  Row,
  Col,
  Alert,
} from "react-bootstrap";
import { toast } from "react-toastify";
//import Spinner from "../../components/Spinner";
import Editor from "@monaco-editor/react";
import {
  startProctoringWebRTC,
  stopProctoringWebRTC,
} from "../../utils/proctorRTC";
import api from "../../api";
import apiAI from "../../apiAI";
import apiWebRTC from "../../apiWebRTC";

import Swal from "sweetalert2";

const TakeExam = () => {
  const [exams, setExams] = useState([]);
  const [selectedExam, setSelectedExam] = useState(null);
  const [timer, setTimer] = useState(0);
  const [isTakingExam, setIsTakingExam] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [warningMessage, setWarningMessage] = useState("");
  const [showWarning, setShowWarning] = useState(false);
  //const [showCapturedModal, setShowCapturedModal] = useState(false);
  // const [classifiedLogs, setClassifiedLogs] = useState([]);
  const [examText, setExamText] = useState("");

  // Local camera preview
  const videoPreviewRef = useRef(null);

  // HUD overlay (badge in top-left of the video)
  const overlayRef = useRef(null);

  // Audio: one-shot beep + continuous alarm (both use /beep.wav)
  const beepRef = useRef(null); // one-shot
  const alarmRef = useRef(null); // continuous loop for "No Face"
  const audioCtxRef = useRef(null); // Web Audio fallback
  const prevWarnRef = useRef("Looking Forward");
  const noFaceActiveRef = useRef(false);

  const [lastCaptureAt, setLastCaptureAt] = useState(0);

  // handle question and answer
  const [questions, setQuestions] = useState([]);
  const [studentAnswers, setStudentAnswers] = useState({});
  // handle coding exam
  const [language, setLanguage] = useState("python");
  const [code, setCode] = useState("");
  const [output, setOutput] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  const [examResult, setExamResult] = useState(null); // store exam score & answers
  const [showResultModal, setShowResultModal] = useState(false); // control modal
  const [isConnecting, setIsConnecting] = useState(false);

  const [detectionCount, setDetectionCount] = useState(0);

  // ---- helpers: one-shot beep (audio element first, then Web Audio fallback) ----
  const playBeep = useCallback(async () => {
    if (beepRef.current) {
      try {
        beepRef.current.currentTime = 0;
        await beepRef.current.play();
        return;
      } catch {
        /* fall back below */
      }
    }
    try {
      if (!audioCtxRef.current) {
        const AC = window.AudioContext || window.webkitAudioContext;
        audioCtxRef.current = new AC();
      }
      if (audioCtxRef.current.state === "suspended") {
        await audioCtxRef.current.resume();
      }
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } catch {
      /* ignore */
    }
  }, []);

  // ---- helpers: start/stop continuous alarm for "No Face" ----
  const startNoFaceAlarm = useCallback(async () => {
    if (noFaceActiveRef.current) return; // already playing
    noFaceActiveRef.current = true;

    if (alarmRef.current) {
      try {
        alarmRef.current.loop = true;
        alarmRef.current.currentTime = 0;
        await alarmRef.current.play();
        return;
      } catch {
        /* fallback below */
      }
    }
    // Web Audio fallback (sustained tone until stopped)
    try {
      if (!audioCtxRef.current) {
        const AC = window.AudioContext || window.webkitAudioContext;
        audioCtxRef.current = new AC();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") await ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 700;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      // store on ref so we can stop it later
      alarmRef.current = { __osc: osc, __gain: gain, __webAudio: true };
    } catch {
      /* ignore */
    }
  }, []);

  const stopNoFaceAlarm = useCallback(() => {
    if (!noFaceActiveRef.current) return;
    noFaceActiveRef.current = false;

    const a = alarmRef.current;
    if (!a) return;

    // If it's an <audio> element
    if (a.tagName === "AUDIO") {
      try {
        a.pause();
        a.currentTime = 0;
        a.loop = false;
      } catch {}
      return;
    }

    // If it's a Web Audio oscillator fallback
    if (a.__webAudio && a.__osc) {
      try {
        a.__osc.stop();
      } catch {}
      alarmRef.current = null;
    }
  }, []);

  // Fetch exams + filter out submitted
  useEffect(() => {
    const fetchExams = async () => {
      const userData = JSON.parse(localStorage.getItem("userData"));
      const studentId = userData?.id;
      try {
        const examsRes = await api.get("/api/get_exam", {
          params: { student_id: studentId },
        });

        const submissionsRes = await api.get("/api/get_exam_submissions", {
          params: { user_id: studentId },
        });

        const submittedIds = submissionsRes.data.map((s) => s.exam_id);
        const availableExams = examsRes.data.filter(
          (exam) => !submittedIds.includes(exam.id)
        );
        setExams(availableExams);
      } catch (error) {
        console.error("Error fetching exams/submissions:", error);
      }
    };

    fetchExams();
  }, []);

  // Load exam text
  // Load exam instructions (from DB or file)
  useEffect(() => {
    if (!selectedExam) {
      setExamText("");
      return;
    }
    // Try fetching from exam_instructions API
    api
      .get(`/api/exam_instructions/${selectedExam.id}`)
      .then((res) => {
        if (res.data && res.data.instructions) {
          // ✅ Found instructions in DB
          setExamText(res.data.instructions);
        } else if (selectedExam.exam_file) {
          // ⬇️ Fallback to file if DB empty
          const filename = selectedExam.exam_file
            .replaceAll("\\", "/")
            .split("/")
            .pop();

          api
            .get(`/api/exam_text/${filename}`)
            .then((res2) => setExamText(res2.data.content))
            .catch((err) =>
              console.error("Failed to load exam text from file:", err)
            );
        } else {
          setExamText("");
        }
      })
      .catch((err) => {
        console.error("Failed to load exam instructions:", err);
        setExamText("");
      });
  }, [selectedExam]);

  const handleExamSelect = (e) => {
    const exam = exams.find((x) => x.id === parseInt(e.target.value));
    setSelectedExam(exam || null);
  };

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return h > 0
      ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(
          s
        ).padStart(2, "0")}`
      : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  // Start exam (starts timer; WebRTC begins in effect below)
  const handleStartExam = async () => {
    if (!selectedExam) {
      toast.warn("Please select an exam first!");
      return;
    }

    const now = new Date();
    const [hour, minute, second = 0] = selectedExam.start_time
      .split(":")
      .map(Number);
    const startTime = new Date(selectedExam.exam_date);
    startTime.setHours(hour, minute, second, 0);

    const durationInMinutes = parseInt(selectedExam.duration_minutes);
    const endTime = new Date(
      startTime.getTime() + durationInMinutes * 60 * 1000
    );

    if (now < startTime) {
      toast.error("You can only start the exam at the scheduled time.");
      return;
    }
    if (now > endTime) {
      toast.error("The exam period has already ended.");
      return;
    }

    // Unlock audio synchronously in the click event (both players)
    try {
      if (!audioCtxRef.current) {
        const AC = window.AudioContext || window.webkitAudioContext;
        audioCtxRef.current = new AC();
      }
      if (audioCtxRef.current.state === "suspended") {
        await audioCtxRef.current.resume();
      }
      if (beepRef.current) {
        beepRef.current.load();
        await beepRef.current.play();
        beepRef.current.pause();
        beepRef.current.currentTime = 0;
      }
      if (alarmRef.current && alarmRef.current.tagName === "AUDIO") {
        alarmRef.current.load();
        await alarmRef.current.play();
        alarmRef.current.pause();
        alarmRef.current.currentTime = 0;
      }
    } catch {
      /* ignore; fallbacks will try again later */
    }

    setIsTakingExam(true);
    const remainingTimeInSeconds = Math.floor((endTime - now) / 1000);
    setTimer(Math.max(0, remainingTimeInSeconds));
    toast.success("Exam started. Good luck!");
  };

  const getTodayDate = () =>
    new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  // Timer tick
  useEffect(() => {
    if (isTakingExam && timer > 0) {
      const countdown = setInterval(() => setTimer((p) => p - 1), 1000);
      return () => clearInterval(countdown);
    }
  }, [isTakingExam, timer]);

  // Notify start -> backend
  useEffect(() => {
    const userData = JSON.parse(localStorage.getItem("userData"));
    const studentId = userData?.id;

    const notifStart = async () => {
      try {
        await api.post("/api/update_exam_status_start", {
          student_id: studentId,
        });
      } catch (err) {
        console.error("Error updating start status:", err);
      }
    };
    if (isTakingExam) notifStart();
  }, [isTakingExam]);

  // Start WebRTC AFTER the exam view mounts
  useEffect(() => {
    (async () => {
      if (!isTakingExam || !selectedExam) return;
      const userData = JSON.parse(localStorage.getItem("userData"));
      const studentId = userData?.id;

      try {
        await startProctoringWebRTC(
          apiWebRTC.defaults.baseURL,
          studentId,
          selectedExam.id,
          videoPreviewRef.current,
          setIsConnecting // ✅ add this as the 5th argument
        );
      } catch (e) {
        console.error("Failed to start WebRTC:", e);
        toast.error(
          "Could not access/send camera. Check permissions & HTTPS, then retry."
        );
        setIsTakingExam(false);
      }
    })();
  }, [isTakingExam, selectedExam]);

  // Poll server for last_warning -> HUD + one-shot beeps + continuous alarm on No Face
  useEffect(() => {
    if (!isTakingExam || !selectedExam) return;
    const userData = JSON.parse(localStorage.getItem("userData"));
    const studentId = userData?.id;

    const t = setInterval(async () => {
      try {
        // These two stay on your main backend (Railway)
        const { data } = await apiWebRTC.get("/proctor/last_warning", {
          params: { student_id: studentId, exam_id: selectedExam.id },
        });

        const warn = data?.warning || "Looking Forward";

        const isNoFace = warn === "No Face";
        if (isNoFace) {
          await startNoFaceAlarm();
        } else {
          stopNoFaceAlarm();
        }

        // 🚨 Count every suspicious detection except "Looking Forward"
        if (warn !== "Looking Forward" && warn !== prevWarnRef.current) {
          setDetectionCount((prev) => prev + 1);
        }

        // One-shot beep on NEW violation (exclude No Face; continuous handled above)
        const isViolation = warn !== "Looking Forward" && !isNoFace;
        if (isViolation && warn !== prevWarnRef.current) {
          await playBeep();
          setWarningMessage(warn);
          setShowWarning(true);
        }
        prevWarnRef.current = warn;

        // HUD badge
        if (overlayRef.current) {
          overlayRef.current.innerText = warn || "Looking Forward";
          overlayRef.current.style.background =
            warn === "Looking Forward"
              ? "rgba(0,0,0,0.6)"
              : warn === "No Face"
              ? "rgba(128,0,0,0.75)"
              : "rgba(160,30,0,0.8)";
        }
      } catch {
        /* ignore polling errors */
      }
    }, 600);

    return () => {
      clearInterval(t);
      stopNoFaceAlarm();
    };
  }, [isTakingExam, selectedExam, playBeep, startNoFaceAlarm, stopNoFaceAlarm]);

  // Optional: poll server for last_capture -> beep on new capture (suppressed if No Face alarm is active)
  useEffect(() => {
    if (!isTakingExam || !selectedExam) return;
    const userData = JSON.parse(localStorage.getItem("userData"));
    const studentId = userData?.id;

    const t = setInterval(async () => {
      try {
        // Fetch last capture (from AI backend)
        const { data } = await apiWebRTC.get("/proctor/last_capture", {
          params: { student_id: studentId, exam_id: selectedExam.id },
        });
        if (data?.at && data.at > lastCaptureAt) {
          setLastCaptureAt(data.at);
          if (!noFaceActiveRef.current) {
            await playBeep();
          }
        }
      } catch {
        /* ignore polling errors */
      }
    }, 1200);

    return () => clearInterval(t);
  }, [isTakingExam, selectedExam, lastCaptureAt, playBeep]);

  // switchtab detection
  useEffect(() => {
    if (!isTakingExam || !selectedExam) return;

    const userData = JSON.parse(localStorage.getItem("userData"));
    const studentId = userData?.id;
    const instructorId = selectedExam?.instructor_id;

    const updateTabStatus = (isOtherTab) =>
      api
        .post("/api/update_tab_status", {
          student_id: studentId,
          instructor_id: instructorId,
          is_other_tab: isOtherTab ? 1 : 0,
        })
        .catch(() => {});

    const handleVisibilityChange = () => {
      if (document.hidden) {
        toast.warning("⚠️ You switched to another tab!");
        updateTabStatus(true);
      } else {
        toast.info("✅ You are back on the exam tab.");
        updateTabStatus(false);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isTakingExam, selectedExam]);

  // Fetch behavior logs after submitting
  const fetchBehaviorLogs = useCallback(async () => {
    const userData = JSON.parse(localStorage.getItem("userData"));
    if (!userData?.id || !selectedExam?.id) return;

    const response = await api.get("/api/get_behavior_logs", {
      params: { user_id: userData.id },
    });

    //nst logs = response.data.filter((log) => log.exam_id === selectedExam.id);
    //setClassifiedLogs(logs.reverse());
  }, [selectedExam]);

  // Fetch questions when exam is selected
  useEffect(() => {
    if (!selectedExam) return;
    api
      .get(`/api/exam_with_questions/${selectedExam.id}`)
      .then((res) => {
        setQuestions(res.data);
        // reset answers
        setStudentAnswers({});
      })
      .catch((err) => console.error("Failed to load questions:", err));
  }, [selectedExam]);

  // Handle answer selection
  const handleAnswerSelect = (qId, optionId) => {
    setStudentAnswers((prev) => ({ ...prev, [qId]: optionId }));
  };

  // Submit exam
  const handleSubmitExam = useCallback(
    async (forceSubmit = false) => {
      if (isSubmitting) return;

      setDetectionCount(0);
      const userData = JSON.parse(localStorage.getItem("userData"));
      const studentId = userData?.id;

      if (!studentId || !selectedExam?.id) {
        toast.error("Missing exam or student information.");
        return;
      }

      // ⚡ 1️⃣ Manual validation (skip if auto-submit)
      if (!forceSubmit) {
        if (selectedExam.exam_category?.toLowerCase() === "coding") {
          if (!code || code.trim() === "") {
            Swal.fire({
              icon: "warning",
              title: "Missing Code!",
              text: "Please write your code before submitting.",
              confirmButtonColor: "#3085d6",
            });
            return;
          }

          if (!language) {
            Swal.fire({
              icon: "info",
              title: "Select Language",
              text: "Please select a programming language before submitting.",
              confirmButtonColor: "#3085d6",
            });
            return;
          }
        } else {
          if (!studentAnswers || Object.keys(studentAnswers).length === 0) {
            Swal.fire({
              icon: "warning",
              title: "Unanswered Questions",
              text: "Please answer all questions before submitting your exam.",
              confirmButtonColor: "#d33",
            });
            return;
          }
        }
      }

      // 🕓 2️⃣ Start submission
      setIsSubmitting(true);

      try {
        // ✅ Stop camera and AI detection before submission
        stopProctoringWebRTC();
        stopNoFaceAlarm();

        // ✅ Update submission status in DB
        await api.post("/api/update_exam_status_submit", {
          student_id: studentId,
        });

        // 🧠 3️⃣ Submit the actual exam (based on type)
        const category = selectedExam.exam_category?.toLowerCase();
        let submitData;

        if (category === "coding") {
          // handle safe defaults for auto-submission
          const safeLanguage = forceSubmit ? language || "none" : language;
          const safeCode = forceSubmit
            ? code?.trim() || "// Auto-submitted — no code provided."
            : code;
          const safeOutput = output || "";

          submitData = await api.post("/api/submit_exam", {
            user_id: studentId,
            exam_id: selectedExam.id,
            language: safeLanguage,
            code: safeCode,
            output: safeOutput,
          });

          setExamResult(submitData.data);
          setShowResultModal(true);
          toast.success("Coding exam submitted successfully!");
        } else {
          // handle safe defaults for auto-submission
          const safeAnswers =
            forceSubmit &&
            (!studentAnswers || Object.keys(studentAnswers).length === 0)
              ? { message: "Auto-submitted — no answers provided." }
              : studentAnswers;

          submitData = await api.post("/api/submit_exam", {
            user_id: studentId,
            exam_id: selectedExam.id,
            answers: safeAnswers,
          });

          setExamResult(submitData.data);
          setShowResultModal(true);
          toast.success("Exam submitted successfully!");
        }

        // 🧩 4️⃣ Classify behavior after submission
        await apiAI.post("/api/classify_behavior_logs", {
          user_id: studentId,
          exam_id: selectedExam.id,
        });

        await fetchBehaviorLogs();
        //setShowCapturedModal(true);
        toast.success("Behavior classification completed!");
      } catch (error) {
        console.error("Exam submission error:", error);
        toast.error("Something went wrong while submitting the exam.");
      }

      // 🧹 5️⃣ Cleanup
      setIsSubmitting(false);
      setIsTakingExam(false);
    },
    [
      isSubmitting,
      selectedExam,
      fetchBehaviorLogs,
      stopNoFaceAlarm,
      studentAnswers,
      code,
      language,
      output,
    ]
  );

  // Auto-submit if detection count reaches 20
  useEffect(() => {
    if (isTakingExam && detectionCount >= 20) {
      Swal.fire({
        icon: "error",
        title: "Exam Auto-Submitted",
        text: "You have reached the maximum number of suspicious detections. Your exam will now be submitted automatically.",
        confirmButtonColor: "#d33",
      }).then(() => {
        handleSubmitExam(true);
      });
    }
  }, [detectionCount, isTakingExam, handleSubmitExam]);

  // Auto-submit when time is up
  useEffect(() => {
    if (isTakingExam && timer === 0 && selectedExam?.id) {
      handleSubmitExam(true);
    }
  }, [timer, isTakingExam, selectedExam, handleSubmitExam, studentAnswers]);

  // Cleanup on unmount / route change
  useEffect(() => {
    return () => {
      stopProctoringWebRTC();
      stopNoFaceAlarm();
    };
  }, [stopNoFaceAlarm]);

  const runCode = async () => {
    try {
      setIsRunning(true);
      setOutput("Running your code...");

      //  Axios POST request
      const res = await api.post("/api/run_code", {
        code,
        language,
      });

      // Axios automatically parses JSON
      const data = res.data;

      if (res.status !== 200) {
        setOutput(data.output || ` Error: ${data.error || "Unknown error"}`);
      } else {
        setOutput(data.output || " No output received");
      }
    } catch (err) {
      console.error("Run code error:", err);
      const msg =
        err.response?.data?.error || err.message || "Unexpected server error.";
      setOutput(`⚠️ Server error: ${msg}`);
    } finally {
      setIsRunning(false);
    }
  };
  // 🎥 Force mobile camera to landscape orientation
  useEffect(() => {
    const video = videoPreviewRef.current;
    if (!video) return;

    const handleOrientation = () => {
      const isMobile = window.innerWidth < 768;
      const isLandscape = window.matchMedia("(orientation: landscape)").matches;

      if (isMobile && !isLandscape) {
        // 👇 Force horizontal preview on portrait mobile
        video.style.transform = "rotate(90deg)";
        video.style.width = "100vh"; // swap dimensions
        video.style.height = "100vw";
        video.style.objectFit = "cover";
      } else {
        // 👇 Normal orientation (desktop or already landscape)
        video.style.transform = "rotate(0deg)";
        video.style.width = "100%";
        video.style.height = "auto";
        video.style.objectFit = "cover";
      }
    };

    handleOrientation();
    window.addEventListener("resize", handleOrientation);
    window.addEventListener("orientationchange", handleOrientation);

    return () => {
      window.removeEventListener("resize", handleOrientation);
      window.removeEventListener("orientationchange", handleOrientation);
    };
  }, []);

  return (
    <Container fluid className="py-4 px-3 px-md-5 bg-light min-vh-100">
      {/* Title */}
      <h2
        className="mb-4 fw-bold text-center text-md-start"
        style={{ color: "#0d3b66" }}
      >
        <i className="bi bi-journal-text me-2"></i>
        {selectedExam ? selectedExam.title : "Take Exam"}
      </h2>

      {/* One-shot beep */}
      <audio ref={beepRef} preload="auto">
        <source src="/beep.wav" type="audio/wav" />
      </audio>

      {/* Continuous alarm */}
      <audio ref={alarmRef} preload="auto" loop>
        <source src="/beep.wav" type="audio/wav" />
      </audio>

      {/* Date Alert */}
      <Alert variant="info" className="text-center shadow-sm rounded-pill">
        <i className="bi bi-calendar-event me-2"></i>
        <strong>Today:</strong> {getTodayDate()}
      </Alert>

      {/* Warning Modal */}
      <Modal show={showWarning} onHide={() => setShowWarning(false)} centered>
        <Modal.Header closeButton className="bg-danger text-white">
          <Modal.Title>
            <i className="bi bi-exclamation-triangle me-2"></i>
            Behavior Warning
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="fs-5 text-danger text-center">
            {`Suspicoius Detected`}
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="outline-danger"
            onClick={() => setShowWarning(false)}
          >
            Close
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Exam Selector */}
      {!isTakingExam && (
        <Row className="justify-content-center">
          <Col xs={12} md={8} lg={6}>
            <Card className="p-4 shadow border-0 rounded-3">
              <Card.Body>
                <Form.Group>
                  <Form.Label className="fw-semibold text-secondary">
                    <i className="bi bi-list-task me-2"></i>Select Exam /
                    Activity
                  </Form.Label>
                  <Form.Select
                    onChange={handleExamSelect}
                    value={selectedExam ? selectedExam.id : ""}
                  >
                    <option value="">-- Choose --</option>
                    {exams
                      .filter((exam) => {
                        const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
                        return exam.exam_date === today && exam.start_time;
                      })
                      .map((exam) => (
                        <option key={exam.id} value={exam.id}>
                          {exam.title} • {exam.exam_type} (
                          {exam.duration_minutes || 0} min)
                        </option>
                      ))}
                  </Form.Select>
                </Form.Group>
                <Button
                  variant="success"
                  onClick={handleStartExam}
                  disabled={!selectedExam || isConnecting}
                  className="w-100"
                >
                  <i className="bi bi-play-fill me-2"></i>
                  {isConnecting ? "Connecting..." : "Start"}
                </Button>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      )}

      {/* Taking Exam UI */}
      {isTakingExam && selectedExam && (
        <Row className="mt-4">
          {/* Questions Area */}
          <Col lg={8}>
            <Card className="shadow border-0 rounded-3">
              <Card.Header className="bg-primary text-white d-flex justify-content-between align-items-center">
                <h5 className="mb-0">
                  <i className="bi bi-pencil-square me-2"></i>
                  {selectedExam.title}
                </h5>
                <span className="badge bg-light text-dark">
                  {selectedExam.exam_type}
                </span>
              </Card.Header>

              <Card.Body>
                {/* Timer (inside exam card, not full width) */}
                <div className="mb-3 d-flex justify-content-between align-items-center">
                  <span className="fw-semibold">
                    Time Remaining: {formatTime(timer)}
                  </span>
                  <ProgressBar
                    now={(timer / (selectedExam.duration_minutes * 60)) * 100}
                    className="flex-grow-1 mx-3"
                    variant="success"
                  />
                  <span>{selectedExam.duration_minutes} min</span>
                </div>

                {/* Coding Exam Instructions */}
                {selectedExam?.exam_category?.toLowerCase() === "coding" ? (
                  <Card className="shadow-sm border-0 mb-4">
                    <Card.Header className="bg-dark text-white">
                      <i className="bi bi-code-slash me-2"></i> Coding Exam
                      Instructions
                    </Card.Header>
                    <Card.Body>
                      {examText ? (
                        <div
                          className="p-3 p-md-4 rounded border bg-light"
                          style={{
                            width: "100%",
                            maxWidth: "900px",
                            margin: "0 auto",
                          }}
                        >
                          <h5 className="fw-bold text-center text-primary mb-3">
                            Exam Instructions
                          </h5>
                          <div
                            className="text-start mx-auto"
                            style={{
                              maxWidth: "100%", // 👈 ensures mobile-friendly text wrapping
                              width: "100%",
                            }}
                          >
                            {examText.split("\n").map((line, idx) => (
                              <p key={idx} className="mb-2">
                                {line}
                              </p>
                            ))}
                          </div>

                          {/* Coding Section */}
                          <div className="mt-4">
                            <Form.Select
                              value={language}
                              onChange={(e) => setLanguage(e.target.value)}
                              className="mb-3 shadow-sm"
                            >
                              <option value="python">Python</option>
                              <option value="cpp">C++</option>
                              <option value="java">Java</option>
                              <option value="javascript">JavaScript</option>
                              <option value="php">PHP</option>
                            </Form.Select>

                            <div
                              className="coding-editor-wrapper mt-3"
                              style={{
                                width: "100%",
                                minHeight: "250px",
                                height:
                                  window.innerWidth < 576 ? "45vh" : "60vh", // 👈 responsive height
                                maxHeight: "500px",
                              }}
                            >
                              <Editor
                                height="100%"
                                language={language}
                                theme="vs-dark"
                                value={code}
                                onChange={(value) => setCode(value)}
                                options={{
                                  fontSize: 14,
                                  minimap: { enabled: false },
                                  wordWrap: "on",
                                  automaticLayout: true,
                                  scrollBeyondLastLine: false,
                                  lineNumbers: "on",
                                  smoothScrolling: true,
                                }}
                              />
                            </div>

                            {/* Run Button */}
                            <Button
                              variant={isRunning ? "secondary" : "primary"}
                              onClick={runCode}
                              disabled={isRunning}
                              className="mt-3 px-4 fw-semibold d-flex align-items-center justify-content-center mx-auto"
                            >
                              {isRunning ? (
                                <>
                                  <span
                                    className="spinner-border spinner-border-sm me-2"
                                    role="status"
                                    aria-hidden="true"
                                  ></span>
                                  Running...
                                </>
                              ) : (
                                <>
                                  <i className="bi bi-play-circle me-2"></i> Run
                                  Code
                                </>
                              )}
                            </Button>

                            {/* Output */}
                            <div className="mt-4 p-3 rounded shadow-sm border bg-white">
                              <h6 className="fw-bold mb-2">
                                <i className="bi bi-terminal me-2 text-primary"></i>{" "}
                                Output
                              </h6>
                              <div
                                className="p-3 rounded bg-light border"
                                style={{
                                  minHeight: "120px",
                                  overflowX: "auto",
                                  wordBreak: "break-word", // 👈 fix for long lines
                                  whiteSpace: "pre-wrap",
                                  fontFamily: "monospace",
                                }}
                              >
                                {isRunning ? (
                                  <div className="text-center text-secondary">
                                    <div
                                      className="spinner-border text-primary mb-2"
                                      style={{ width: "2rem", height: "2rem" }}
                                      role="status"
                                    ></div>
                                    <p className="mb-0 fw-semibold">
                                      Running your code...
                                    </p>
                                    <small className="text-muted">
                                      Please wait a moment ⏳
                                    </small>
                                  </div>
                                ) : output ? (
                                  <pre className="m-0">{output}</pre>
                                ) : (
                                  <p className="text-muted text-center m-0 fst-italic">
                                    No output yet. Click "Run Code" to execute
                                    your program.
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-muted fst-italic text-center">
                          No instructions available for this coding exam.
                        </p>
                      )}
                    </Card.Body>
                  </Card>
                ) : (
                  <>
                    {/* Normal Q&A Exams */}
                    {examText && (
                      <div className="border rounded p-3 bg-light-subtle mb-3">
                        <pre className="mb-0 text-break">{examText}</pre>
                      </div>
                    )}

                    {/* Questions */}
                    <div>
                      {questions.map((q, idx) => (
                        <Card
                          key={q.id}
                          className="mb-4 shadow-sm border-0"
                          style={{
                            borderRadius: "10px",
                            overflow: "hidden",
                          }}
                        >
                          <Card.Body className="p-3 p-md-4">
                            {/* Question Title */}
                            <h6
                              className="fw-bold mb-3 text-dark"
                              style={{
                                fontSize: "1rem",
                                lineHeight: "1.4",
                                wordBreak: "break-word",
                              }}
                            >
                              {idx + 1}. {q.question_text}
                            </h6>

                            {/* MCQ Type */}
                            {q.question_type === "mcq" && (
                              <Form>
                                {q.options.map((opt) => (
                                  <Form.Check
                                    key={opt.id}
                                    type="radio"
                                    id={`q-${q.id}-opt-${opt.id}`}
                                    name={`q-${q.id}`}
                                    label={
                                      <span className="text-wrap">
                                        {opt.option_text}
                                      </span>
                                    }
                                    checked={studentAnswers[q.id] === opt.id}
                                    onChange={() =>
                                      handleAnswerSelect(q.id, opt.id)
                                    }
                                    className="mb-2 p-2 border rounded text-break"
                                    style={{
                                      backgroundColor:
                                        studentAnswers[q.id] === opt.id
                                          ? "#e6f0ff"
                                          : "#fff",
                                      borderColor:
                                        studentAnswers[q.id] === opt.id
                                          ? "#0d6efd"
                                          : "#dee2e6",
                                      cursor: "pointer",
                                      wordWrap: "break-word",
                                    }}
                                  />
                                ))}
                              </Form>
                            )}

                            {/* Identification Type */}
                            {q.question_type === "identification" && (
                              <Form.Control
                                type="text"
                                placeholder="Type your answer..."
                                value={studentAnswers[q.id] || ""}
                                onChange={(e) =>
                                  handleAnswerSelect(q.id, e.target.value)
                                }
                                className="p-2 border rounded mt-2 w-100"
                                style={{ fontSize: "0.95rem" }}
                              />
                            )}

                            {/* Essay Type */}
                            {q.question_type === "essay" && (
                              <Form.Control
                                as="textarea"
                                rows={4}
                                placeholder="Write your essay answer here..."
                                value={studentAnswers[q.id] || ""}
                                onChange={(e) =>
                                  handleAnswerSelect(q.id, e.target.value)
                                }
                                className="p-2 border rounded mt-2 w-100"
                                style={{
                                  fontSize: "0.95rem",
                                  resize: "vertical",
                                  minHeight: "120px",
                                }}
                              />
                            )}
                          </Card.Body>
                        </Card>
                      ))}
                    </div>
                  </>
                )}

                {/* Submit Button */}
                <div className="text-end mt-3">
                  <Button
                    variant="danger"
                    onClick={handleSubmitExam}
                    disabled={isSubmitting}
                  >
                    <i className="bi bi-box-arrow-up me-2"></i>
                    {isSubmitting ? "Submitting..." : "Submit Exam"}
                  </Button>
                </div>
              </Card.Body>
            </Card>
          </Col>

          {/* Full-page overlay loader */}
          {isSubmitting && (
            <div
              className="position-fixed top-0 start-0 w-100 h-100 d-flex justify-content-center align-items-center"
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.8)",
                zIndex: 2000,
              }}
            >
              <div className="text-center">
                <div
                  className="spinner-border text-danger"
                  role="status"
                  style={{ width: "4rem", height: "4rem" }}
                >
                  <span className="visually-hidden">Submitting...</span>
                </div>
                <p className="mt-3 fw-semibold text-danger">
                  Submitting exam, please wait...
                </p>
              </div>
            </div>
          )}

          {/* Camera Area */}
          <Col lg={4} className="mt-3 mt-lg-0">
            <div style={{ position: "sticky", top: "20px", zIndex: 1000 }}>
              <Card className="shadow border-0 rounded-3">
                <Card.Header className="bg-dark text-white">
                  <i className="bi bi-camera-video me-2"></i> Live Camera
                </Card.Header>
                <Card.Body className="p-0 position-relative d-flex justify-content-center align-items-center">
                  <div
                    className="camera-wrapper"
                    style={{
                      width: "100%",
                      height: "100%",
                      overflow: "hidden",
                      position: "relative",
                    }}
                  >
                    <video
                      ref={videoPreviewRef}
                      autoPlay
                      muted
                      playsInline
                      className="w-100 h-auto"
                      style={{
                        objectFit: "cover",
                        borderRadius: "0 0 0.5rem 0.5rem",
                        transform: "rotate(0deg)",
                        transition: "all 0.3s ease-in-out",
                      }}
                    />
                  </div>

                  {/* Loading Overlay */}
                  {isConnecting && (
                    <div
                      className="position-absolute top-0 start-0 w-100 h-100 d-flex flex-column justify-content-center align-items-center bg-dark bg-opacity-75 text-white rounded-bottom"
                      style={{ zIndex: 10 }}
                    >
                      <div
                        className="spinner-border text-light mb-3"
                        role="status"
                      />
                      <h6 className="fw-semibold">
                        Connecting to proctoring server...
                      </h6>
                      <p className="small text-light text-center mb-0">
                        Please wait while your camera and connection are
                        initialized.
                      </p>
                    </div>
                  )}

                  {/* Overlay Text */}
                  <div
                    ref={overlayRef}
                    className="position-absolute top-0 start-0 m-2 px-2 py-1 rounded text-white small"
                    style={{ background: "rgba(0,0,0,0.6)" }}
                  >
                    Looking Forward
                  </div>
                </Card.Body>
              </Card>
            </div>
          </Col>
        </Row>
      )}

      {/* Captured Logs Modal 
      <Modal
        show={showCapturedModal}
        onHide={() => setShowCapturedModal(false)}
        size="lg"
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>
            <i className="bi bi-list-check me-2"></i>Behavior Logs
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ maxHeight: "70vh", overflowY: "auto" }}>
          {classifiedLogs.length > 0 ? (
            <Row>
              {classifiedLogs.map((log, index) => (
                <Col
                  key={index}
                  xs={12}
                  sm={6}
                  md={4}
                  className="mb-4 text-center"
                >
                  {log.image_base64 && (
                    <img
                      src={`data:image/jpeg;base64,${log.image_base64}`}
                      alt={`Captured ${index}`}
                      className="img-fluid rounded shadow-sm border mb-2"
                    />
                  )}
 
                  <div className="fw-semibold text-danger">
                    <i className="bi bi-exclamation-triangle me-1"></i>
                    Warning: {log.warning_type || "Unknown"}
                  </div>

                 
                  <div
                    className={`fw-bold ${
                      log.classification_label === "Cheating"
                        ? "text-danger"
                        : "text-success"
                    }`}
                  >
                    <i className="bi bi-shield-check me-1"></i>
                    Result: {log.classification_label || "Unclassified"}
                  </div>
                </Col>
              ))}
            </Row>
          ) : (
            <p>No behavior logs found.</p>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setShowCapturedModal(false)}
          >
            Close
          </Button>
        </Modal.Footer>
      </Modal>
      /*}

      {/* Exam Result Modal */}
      <Modal
        show={showResultModal}
        onHide={() => setShowResultModal(false)}
        size="lg"
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>
            <i className="bi bi-check-circle me-2"></i> Exam Result
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {/* If coding exam */}
          {selectedExam?.exam_category?.toLowerCase() === "coding" ? (
            <>
              <p className="text-muted text-center">
                This is a <strong>coding exam</strong>. Automatic scoring is not
                available.
              </p>
              {examResult?.language && (
                <p>
                  <strong>Language:</strong> {examResult.language}
                </p>
              )}
              {code && (
                <>
                  <h6>Your Submitted Code:</h6>
                  <pre className="bg-dark text-light p-3 rounded">{code}</pre>
                </>
              )}
              {output && (
                <>
                  <h6>Program Output:</h6>
                  <pre className="bg-light border p-3 rounded">{output}</pre>
                </>
              )}
            </>
          ) : (
            <>
              {/* ✅ Show score safely */}
              <h5 className="mb-3 text-center">
                Score:{" "}
                <span className="text-success">
                  {examResult?.score ?? 0} / {examResult?.total_score ?? 0}
                </span>
              </h5>

              {/* ✅ Show answers review safely */}
              {examResult?.answers && examResult.answers.length > 0 ? (
                <div className="mt-4">
                  {examResult.answers.map((ans, idx) => (
                    <Card key={idx} className="mb-3 shadow-sm border-0">
                      <Card.Body>
                        <h6 className="fw-semibold mb-2">
                          {idx + 1}. {ans.question_text || "Untitled Question"}
                        </h6>

                        {/* 🟩 Multiple Choice */}
                        {ans.question_type === "mcq" && (
                          <>
                            <p className="mb-1">
                              <strong>Your Answer:</strong>{" "}
                              <span
                                className={
                                  ans.is_correct
                                    ? "text-success fw-semibold"
                                    : "text-danger fw-semibold"
                                }
                              >
                                {ans.selected_answer || "—"}
                              </span>
                            </p>
                            {!ans.is_correct && ans.correct_answer && (
                              <p className="mb-0">
                                <strong>Correct Answer:</strong>{" "}
                                <span className="text-success fw-semibold">
                                  {ans.correct_answer}
                                </span>
                              </p>
                            )}
                          </>
                        )}

                        {/* 🟨 Identification */}
                        {ans.question_type === "identification" && (
                          <>
                            <p className="mb-1">
                              <strong>Your Answer:</strong>{" "}
                              <span
                                className={
                                  ans.is_correct
                                    ? "text-success fw-semibold"
                                    : "text-danger fw-semibold"
                                }
                              >
                                {ans.selected_answer || "—"}
                              </span>
                            </p>
                            {!ans.is_correct && ans.correct_answer && (
                              <p className="mb-0">
                                <strong>Correct Answer:</strong>{" "}
                                <span className="text-success fw-semibold">
                                  {ans.correct_answer}
                                </span>
                              </p>
                            )}
                          </>
                        )}

                        {/* 🟦 Essay */}
                        {ans.question_type === "essay" && (
                          <>
                            <p className="mb-1 fw-semibold">Your Answer:</p>
                            <div className="p-2 border rounded bg-light">
                              {ans.selected_answer ? (
                                ans.selected_answer
                              ) : (
                                <em className="text-muted">
                                  No answer provided.
                                </em>
                              )}
                            </div>
                            <p className="mt-2 text-muted small">
                              <i className="bi bi-info-circle me-1"></i>
                              Essay answers are graded manually.
                            </p>
                          </>
                        )}
                      </Card.Body>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="text-muted text-center fst-italic">
                  No answers available yet.
                </p>
              )}
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowResultModal(false)}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
};

export default TakeExam;
