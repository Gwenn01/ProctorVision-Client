let pc = null;
let localStream = null;

// ✅ Use both STUN and TURN (TURN optional but improves reliability)
export const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  // You can add your TURN server here if you have one:
  // { urls: "turn:relay1.expressturn.com:3478", username: "user", credential: "password" },
];

// Helper: wait until ICE gathering completes
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
 * @param {string} apiBase - Base URL of the AI backend
 * @param {string|number} studentId - Current student ID
 * @param {string|number} examId - Current exam ID
 * @param {HTMLVideoElement} previewVideoEl - Video element for local preview
 */
export async function startProctoringWebRTC(
  apiBase,
  studentId,
  examId,
  previewVideoEl
) {
  console.log("[RTC] Requesting camera access…");

  try {
    // 1️⃣ Get user camera stream
    localStream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720, frameRate: { ideal: 30 } },
      audio: false,
    });
  } catch (err) {
    console.error("[RTC] Failed to access camera:", err);
    throw err;
  }

  if (previewVideoEl) {
    previewVideoEl.srcObject = localStream;
    try {
      await previewVideoEl.play();
      console.log("[RTC] Local preview started.");
    } catch (e) {
      console.warn("[RTC] Preview video playback issue:", e);
    }
  }

  // 2️⃣ Create PeerConnection
  pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  console.log("[RTC] PeerConnection created.");

  pc.oniceconnectionstatechange = () => {
    console.log("ICE state:", pc.iceConnectionState);
    if (pc.iceConnectionState === "failed") {
      console.error("[RTC] ICE connection failed. Attempting restart...");
      try {
        pc.restartIce();
      } catch (e) {
        console.warn("[RTC] restartIce not supported in this browser.");
      }
    }
  };

  pc.onconnectionstatechange = () => {
    console.log("RTC state:", pc.connectionState);
    if (pc.connectionState === "failed") {
      console.warn(
        "[RTC] Peer connection failed. Check network or TURN config."
      );
    } else if (pc.connectionState === "connected") {
      console.log("[RTC] Peer connection established ✅");
    }
  };

  pc.onicegatheringstatechange = () => {
    console.log("[RTC] ICE gathering:", pc.iceGatheringState);
  };

  // 3️⃣ Add video tracks
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
    console.log("[RTC] Added track:", track.kind);
  });

  // 4️⃣ Create offer
  const offer = await pc.createOffer({
    offerToReceiveVideo: false,
    offerToReceiveAudio: false,
  });
  await pc.setLocalDescription(offer);
  await waitForIceGatheringComplete(pc);

  console.log("[RTC] Offer created and local description set.");

  // 5️⃣ Send offer to Flask WebRTC backend
  const url = `${apiBase}/webrtc/offer`;
  console.log("[RTC] POST", url);

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sdp: pc.localDescription.sdp,
        type: pc.localDescription.type,
        student_id: String(studentId),
        exam_id: String(examId),
      }),
    });
  } catch (err) {
    console.error("[RTC] Network error while sending offer:", err);
    throw err;
  }

  if (!response.ok) {
    const text = await response.text();
    console.error("[RTC] /webrtc/offer failed", response.status, text);
    throw new Error(`Offer failed: ${response.status} ${text}`);
  }

  // 6️⃣ Set answer from backend
  const answer = await response.json();
  await pc.setRemoteDescription(answer);
  console.log("[RTC] Remote description set; waiting for connection…");
}

/**
 * Stop the WebRTC session and release resources
 */
export function stopProctoringWebRTC() {
  try {
    if (pc) {
      pc.getSenders().forEach((sender) => {
        try {
          if (sender.track) sender.track.stop();
        } catch {}
      });
      pc.close();
      console.log("[RTC] PeerConnection closed.");
    }
  } catch (err) {
    console.warn("[RTC] Error closing peer connection:", err);
  }
  pc = null;

  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
    console.log("[RTC] Camera stopped.");
  }
}
