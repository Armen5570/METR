
import { startCamera, stopCamera } from "./camera.js";
import { HandTracker } from "./hand-tracking.js";
import { DrawingEngine } from "./drawing.js";

const video = document.getElementById("camera");
const overlay = document.getElementById("handCanvas");
const canvas = document.getElementById("drawingCanvas");

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");

const drawing = new DrawingEngine(canvas);

let handTracker = null;
let faceTracker = null;
let running = false;
let processing = false;
let animationId = null;

let eyesClosedSince = null;
let alarmOscillator = null;
let alarmGain = null;
let audioContext = null;

const $ = id => document.getElementById(id);

function updateStatus(text, online) {
    $("systemStatus").textContent = text;
    $("systemDot").classList.toggle("online", online);
    $("liveTag").textContent = online ? "LIVE" : "OFFLINE";
    $("liveTag").classList.toggle("active", online);
}

function setupAudio() {
    const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) return;

    audioContext = new AudioContextClass();
    audioContext.resume();
}

function startAlarm() {
    if (!audioContext || alarmOscillator) return;

    alarmOscillator = audioContext.createOscillator();
    alarmGain = audioContext.createGain();

    alarmOscillator.type = "sine";
    alarmOscillator.frequency.value = 880;

    alarmGain.gain.value = 0.08;

    alarmOscillator.connect(alarmGain);
    alarmGain.connect(audioContext.destination);

    alarmOscillator.start();
}

function stopAlarm() {
    if (alarmOscillator) {
        try {
            alarmOscillator.stop();
            alarmOscillator.disconnect();
            alarmGain.disconnect();
        } catch {}

        alarmOscillator = null;
        alarmGain = null;
    }
}

function eyeAspectRatio(landmarks, indices) {
    const distance = (a, b) => {
        const dx = landmarks[a].x - landmarks[b].x;
        const dy = landmarks[a].y - landmarks[b].y;
        return Math.hypot(dx, dy);
    };

    const vertical =
        distance(indices[1], indices[5]) +
        distance(indices[2], indices[4]);

    const horizontal = 2 * distance(indices[0], indices[3]);

    return vertical / Math.max(horizontal, 0.0001);
}

function setupFaceTracker() {
    if (!window.FaceMesh) {
        throw new Error("MediaPipe FaceMesh failed to load.");
    }

    faceTracker = new window.FaceMesh({
        locateFile: file =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
    });

    faceTracker.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.65,
        minTrackingConfidence: 0.65
    });

    faceTracker.onResults(results => {
        const faces = results.multiFaceLandmarks || [];

        if (!faces.length) {
            $("eyeStatus").textContent = "Face not detected";
            eyesClosedSince = null;
            $("eyeAlert").classList.remove("show");
            stopAlarm();
            return;
        }

        const face = faces[0];

        const left = eyeAspectRatio(face, [33,160,158,133,153,144]);
        const right = eyeAspectRatio(face, [362,385,387,263,373,380]);

        const closed = left < 0.20 && right < 0.20;

        if (closed) {
            $("eyeStatus").textContent = "Eyes closed";

            if (eyesClosedSince === null) {
                eyesClosedSince = Date.now();
            }

            if (Date.now() - eyesClosedSince >= 5000) {
                $("eyeAlert").classList.add("show");
                startAlarm();
            }
        } else {
            $("eyeStatus").textContent = "Eyes open";
            eyesClosedSince = null;
            $("eyeAlert").classList.remove("show");
            stopAlarm();
        }
    });
}

function updateHands(hands) {
    const left = hands.find(hand => hand.id.includes("left"));
    const right = hands.find(hand => hand.id.includes("right"));

    $("leftHandStatus").textContent =
        left ? (left.drawing ? "Drawing" : "Detected") : "Not detected";

    $("rightHandStatus").textContent =
        right ? (right.drawing ? "Drawing" : "Detected") : "Not detected";

    $("trackingLabel").textContent =
        hands.length === 0
            ? "NO HANDS"
            : `${hands.length} HAND${hands.length > 1 ? "S" : ""} TRACKED`;

    for (const hand of hands) {
        drawing.addPoint(
            hand.id,
            { x: hand.x, y: hand.y },
            hand.drawing
        );
    }

const detected = new Set(hands.map(hand => hand.id));

for (const id of [...drawing.activeStrokes.keys()]) {
    if (!detected.has(id)) {
        drawing.addPoint(id, { x: 0, y: 0 }, false);
    }
}

    $("canvasHint").style.display = hands.length ? "none" : "block";
}

async function processFrames() {
    if (!running || processing) return;

    processing = true;

    try {
        if (handTracker) {
            await handTracker.sendFrame();
        }

        if (faceTracker && running && video.videoWidth) {
            await faceTracker.send({ image: video });
        }
    } catch (error) {
        console.error("Tracking error:", error);
    } finally {
        processing = false;
    }

    if (running) {
        animationId = requestAnimationFrame(processFrames);
    }
}

async function startStudio() {
    if (running) return;

    try {
        startBtn.disabled = true;
        startBtn.textContent = "STARTING...";

        setupAudio();

        await startCamera(video);

        handTracker = new HandTracker(video, overlay, updateHands);
        setupFaceTracker();

        running = true;

        $("cameraPlaceholder").style.display = "none";
        updateStatus("SYSTEM ONLINE", true);

        startBtn.textContent = "● STUDIO RUNNING";
        stopBtn.disabled = false;

        processFrames();

    } catch (error) {
        console.error(error);

        alert(
            "Չհաջողվեց միացնել տեսախցիկը։ Ստուգիր թույլտվությունները և ինտերնետ կապը։\n\n" +
            error.message
        );

        await stopStudio();
    }
}

async function stopStudio() {
    running = false;

    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }

    while (processing) {
        await new Promise(resolve => setTimeout(resolve, 30));
    }

    drawing.finishAll();

    if (handTracker) {
        handTracker.close();
        handTracker = null;
    }

    if (faceTracker) {
        faceTracker.close();
        faceTracker = null;
    }

    stopAlarm();
    eyesClosedSince = null;

    stopCamera(video);

    $("cameraPlaceholder").style.display = "flex";
    $("eyeAlert").classList.remove("show");
    $("eyeStatus").textContent = "Waiting";
    $("leftHandStatus").textContent = "Not detected";
    $("rightHandStatus").textContent = "Not detected";
    $("trackingLabel").textContent = "NO HANDS";

    drawing.finishAll();

    updateStatus("SYSTEM OFFLINE", false);

    startBtn.disabled = false;
    startBtn.textContent = "▶ START STUDIO";
    stopBtn.disabled = true;
}

startBtn.addEventListener("click", startStudio);
stopBtn.addEventListener("click", stopStudio);

document.querySelectorAll("[data-tool]").forEach(button => {
    button.addEventListener("click", () => {
        document.querySelectorAll("[data-tool]").forEach(item => {
            item.classList.remove("active");
        });

        button.classList.add("active");
        drawing.setTool(button.dataset.tool);
    });
});

document.querySelectorAll("[data-color]").forEach(button => {
    button.addEventListener("click", () => {
        document.querySelectorAll("[data-color]").forEach(item => {
            item.classList.remove("active");
        });

        button.classList.add("active");
        drawing.setColor(button.dataset.color);
        $("customColor").value = button.dataset.color;
    });
});

$("customColor").addEventListener("input", event => {
    drawing.setColor(event.target.value);

    document.querySelectorAll("[data-color]").forEach(item => {
        item.classList.remove("active");
    });
});

$("brushSize").addEventListener("input", event => {
    drawing.setSize(event.target.value);
    $("sizeValue").textContent = event.target.value;
});

$("opacity").addEventListener("input", event => {
    drawing.setOpacity(event.target.value);
    $("opacityValue").textContent = event.target.value + "%";
});

$("undoBtn").addEventListener("click", () => drawing.undo());
$("redoBtn").addEventListener("click", () => drawing.redo());
$("clearBtn").addEventListener("click", () => {
    if (confirm("Մաքրե՞լ ամբողջ նկարը։")) {
        drawing.clear();
    }
});

$("saveBtn").addEventListener("click", () => drawing.download());

$("zoomInBtn").addEventListener("click", () => {
    drawing.setZoom(drawing.zoom + 0.1);
    $("zoomValue").textContent = Math.round(drawing.zoom * 100) + "%";
});

$("zoomOutBtn").addEventListener("click", () => {
    drawing.setZoom(drawing.zoom - 0.1);
    $("zoomValue").textContent = Math.round(drawing.zoom * 100) + "%";
});

window.addEventListener("beforeunload", () => {
    stopAlarm();
    stopCamera(video);
});
