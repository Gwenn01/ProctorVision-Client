import * as mpFaceMesh from "@mediapipe/face_mesh";
import { Camera } from "@mediapipe/camera_utils";

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
  previewVideoEl
) {
  console.log("[RTC] Requesting camera access…");

  // 1️⃣ Get camera
  localStream = await navigator.mediaDevices.getUserMedia({
    video: { width: 1280, height: 720, frameRate: { ideal: 30 } },
    audio: false,
  });

  previewVideoEl.srcObject = localStream;
  await previewVideoEl.play();
  console.log("[RTC] Local preview started.");

  // 2️⃣ Get ICE servers dynamically
  const iceServers = await fetchIceServers(apiBase);

  // 3️⃣ Create PeerConnection
  pc = new RTCPeerConnection({ iceServers });
  console.log("[RTC] PeerConnection created.");

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
    if (pc.connectionState === "connected") console.log("✅ WebRTC connected.");
  };

  // 4️⃣ Add tracks
  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

  // 5️⃣ Create and send offer
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

  // 6️⃣ OPTIONAL: Initialize FaceMesh detection (local feedback)
  setupFaceMesh(previewVideoEl);
}

/**
 * Stop WebRTC session
 */
export async function stopProctoringWebRTC() {
  try {
    // 🧠 Safely stop camera if present
    if (camera && typeof camera.stop === "function") {
      camera.stop();
      console.log("[RTC] Camera instance stopped.");
    }

    // 🧩 Safely close MediaPipe FaceMesh
    if (faceMesh && typeof faceMesh.close === "function") {
      try {
        await faceMesh.close();
        console.log("[RTC] FaceMesh closed safely.");
      } catch (err) {
        console.warn("[RTC] FaceMesh close error:", err);
      }
    }

    // 🔌 Close PeerConnection
    if (pc) {
      pc.getSenders().forEach((s) => {
        if (s.track) s.track.stop();
      });
      pc.close();
      console.log("[RTC] PeerConnection closed.");
    }

    // 📷 Stop all media tracks
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      console.log("[RTC] Local camera tracks stopped.");
    }
  } catch (err) {
    console.error("[RTC] Error during stopProctoringWebRTC:", err);
  } finally {
    // 🧹 Cleanup references
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
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      const landmarks = results.multiFaceLandmarks[0];

      // Simple horizontal head tilt check
      const leftEye = landmarks[33]; // left eye outer corner
      const rightEye = landmarks[263]; // right eye outer corner

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
