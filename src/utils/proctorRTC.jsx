let pc = null;
let localStream = null;

export const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" }, // TURN not ne
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
 * @param {string} apiBase - Base URL of the AI backend (e.g. https://gwen01-proctorvision-ai.hf.space)
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
  console.log("[RTC] requesting camera…");

  // 1) Request camera access
  localStream = await navigator.mediaDevices.getUserMedia({
    video: { width: 1280, height: 720, frameRate: { ideal: 30 } },
    audio: false,
  });

  if (previewVideoEl) {
    previewVideoEl.srcObject = localStream;
    try {
      await previewVideoEl.play();
    } catch (e) {
      console.warn("Preview video playback issue:", e);
    }
  }

  // 2) Create peer connection
  pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  pc.oniceconnectionstatechange = () =>
    console.log("ICE state:", pc.iceConnectionState);
  pc.onconnectionstatechange = () =>
    console.log("RTC state:", pc.connectionState);

  // Add video tracks to the peer connection
  localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));

  // 3) Create offer and gather ICE candidates
  const offer = await pc.createOffer({
    offerToReceiveVideo: false,
    offerToReceiveAudio: false,
  });
  await pc.setLocalDescription(offer);
  await waitForIceGatheringComplete(pc);

  // ✅ FIXED: Removed /api prefix
  const url = `${apiBase}/webrtc/offer`;
  console.log("[RTC] POST", url);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sdp: pc.localDescription.sdp,
      type: pc.localDescription.type,
      student_id: String(studentId),
      exam_id: String(examId),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[RTC] /webrtc/offer failed", res.status, text);
    throw new Error(`Offer failed: ${res.status} ${text}`);
  }

  // 4) Set remote description (answer from backend)
  const answer = await res.json();
  await pc.setRemoteDescription(answer);
  console.log("[RTC] remote description set; waiting for connected…");
}

/**
 * Stop the WebRTC session and release camera resources
 */
export function stopProctoringWebRTC() {
  try {
    if (pc) {
      pc.getSenders().forEach((s) => {
        try {
          s.track && s.track.stop();
        } catch {}
      });
      pc.close();
    }
  } catch (err) {
    console.warn("Error closing peer connection:", err);
  }
  pc = null;

  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }
}
