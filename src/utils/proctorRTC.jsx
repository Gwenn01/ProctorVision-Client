import * as mpFaceMesh from "@mediapipe/face_mesh";
import { Camera } from "@mediapipe/camera_utils";
import { toast } from "react-toastify"; // ✅ for user feedback

let pc = null;
let localStream = null;
let faceMesh = null;
let camera = null;

/**
 * Dynamically fetch TURN servers from backend
 */
async function fetchIceServers(apiBase) {
  try {
    const res = await fetch(`${apiBase}/get-turn`);
    const data = await res.json();
    if (data?.v?.iceServers?.length) {
      console.log("[RTC] Using dynamic ICE servers from backend.");
      return data.v.iceServers;
    }
  } catch (err) {
    console.warn("[RTC] Failed to fetch TURN servers:", err);
  }
  return [{ urls: "stun:stun.l.google.com:19302" }];
}

/**
 * Helper: wait until ICE gathering completes
 */
function waitForIceGatheringComplete(pc) {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    function check() {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", check);
        resolve();
      }
    }
    pc.addEventListener("icegatheringstatechange", check);
  });
}

/**
 * Start the WebRTC proctoring session
 */
export async function startProctoringWebRTC(
  apiBase,
  studentId,
  examId,
  previewVideoEl,
  setIsConnecting // pass a React state setter from parent component
) {
  try {
    setIsConnecting?.(true);
    toast.info("🔄 Connecting to proctoring server...");

    console.log("[RTC] Requesting camera access…");
    localStream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720, frameRate: { ideal: 30 } },
      audio: false,
    });

    previewVideoEl.srcObject = localStream;
    await previewVideoEl.play();
    console.log("[RTC] Local preview started.");
    toast.info("📷 Camera ready, initializing connection...");

    const iceServers = await fetchIceServers(apiBase);
    pc = new RTCPeerConnection({ iceServers });
    console.log("[RTC] PeerConnection created.");

    // 🔌 Handle connection state updates
    pc.oniceconnectionstatechange = () => {
      console.log("ICE state:", pc.iceConnectionState);
      if (pc.iceConnectionState === "failed") {
        console.warn("[RTC] ICE failed, restarting...");
        try {
          pc.restartIce();
        } catch {}
      }
    };

    pc.onconnectionstatechange = () => {
      console.log("RTC state:", pc.connectionState);
      if (pc.connectionState === "connected") {
        toast.success("✅ WebRTC connected! Proctoring started.");
        console.log("✅ WebRTC connected.");
        setIsConnecting?.(false);
      } else if (pc.connectionState === "failed") {
        toast.error("⚠️ Connection failed, please check your internet.");
        setIsConnecting?.(false);
      }
    };

    // 🎥 Add camera tracks
    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

    // 🧩 Create and send offer
    toast.info("🔁 Establishing secure session...");
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIceGatheringComplete(pc);

    const response = await fetch(`${apiBase}/webrtc/offer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sdp: pc.localDescription.sdp,
        type: pc.localDescription.type,
        student_id: String(studentId),
        exam_id: String(examId),
      }),
    });

    if (!response.ok) throw new Error("Offer failed");

    const answer = await response.json();
    await pc.setRemoteDescription(answer);
    console.log("[RTC] Remote description set.");

    // 🧠 Start MediaPipe FaceMesh for feedback
    setupFaceMesh(previewVideoEl);

    // ✅ Finish loading phase
    setIsConnecting?.(false);
    toast.success("🧩 Proctoring connection established!");
  } catch (err) {
    console.error("[RTC] Error during startProctoringWebRTC:", err);
    toast.error("❌ Failed to start proctoring session. Please try again.");
    setIsConnecting?.(false);
  }
}

/**
 * Stop WebRTC session
 */
export async function stopProctoringWebRTC() {
  try {
    if (camera && typeof camera.stop === "function") {
      camera.stop();
      console.log("[RTC] Camera instance stopped.");
    }

    if (faceMesh && typeof faceMesh.close === "function") {
      try {
        await faceMesh.close();
        console.log("[RTC] FaceMesh closed safely.");
      } catch (err) {
        console.warn("[RTC] FaceMesh close error:", err);
      }
    }

    if (pc) {
      pc.getSenders().forEach((s) => s.track?.stop());
      pc.close();
      console.log("[RTC] PeerConnection closed.");
    }

    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      console.log("[RTC] Local camera tracks stopped.");
    }
  } catch (err) {
    console.error("[RTC] Error during stopProctoringWebRTC:", err);
  } finally {
    pc = null;
    localStream = null;
    console.log("[RTC] Cleanup completed.");
  }
}

/**
 * 🔍 Optional — Use MediaPipe FaceMesh for head movement detection
 */
function setupFaceMesh(videoEl) {
  faceMesh = new mpFaceMesh.FaceMesh({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
  });

  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6,
  });

  faceMesh.onResults((results) => {
    if (results.multiFaceLandmarks?.length > 0) {
      const landmarks = results.multiFaceLandmarks[0];
      const leftEye = landmarks[33];
      const rightEye = landmarks[263];
      const diffX = leftEye.x - rightEye.x;

      if (diffX > 0.09) console.log("👀 Looking LEFT");
      else if (diffX < -0.09) console.log("👀 Looking RIGHT");
      else console.log("👀 Facing forward");
    }
  });

  camera = new Camera(videoEl, {
    onFrame: async () => {
      await faceMesh.send({ image: videoEl });
    },
    width: 640,
    height: 480,
  });

  camera.start();
}
