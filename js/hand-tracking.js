
const CONNECTIONS = [
    [0,1],[1,2],[2,3],[3,4],
    [0,5],[5,6],[6,7],[7,8],
    [5,9],[9,10],[10,11],[11,12],
    [9,13],[13,14],[14,15],[15,16],
    [13,17],[17,18],[18,19],[19,20],
    [0,17]
];

export class HandTracker {
    constructor(video, overlay, onHands) {
        this.video = video;
        this.overlay = overlay;
        this.ctx = overlay.getContext("2d");
        this.onHands = onHands;
        this.hands = null;
        this.lastHands = [];
        this.smoothed = new Map();

        if (!window.Hands) {
            throw new Error("MediaPipe Hands failed to load.");
        }

        this.hands = new window.Hands({
            locateFile: file =>
                `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        this.hands.setOptions({
            maxNumHands: 2,
            modelComplexity: 1,
            minDetectionConfidence: 0.65,
            minTrackingConfidence: 0.65
        });

        this.hands.onResults(results => {
            this.handleResults(results);
        });
    }

    async sendFrame() {
        if (!this.hands || !this.video.videoWidth) return;

        await this.hands.send({ image: this.video });
    }

    handleResults(results) {
        const landmarks = results.multiHandLandmarks || [];
        const handedness = results.multiHandedness || [];

        this.resizeOverlay();

        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);

        const handsData = [];

        landmarks.forEach((hand, index) => {
            const label =
                handedness[index]?.label?.toLowerCase() ||
                `hand-${index}`;

            const finger = hand[8];

            const x = 1 - finger.x;
            const y = finger.y;

            const old = this.smoothed.get(label) || { x, y };

            const smooth = {
                x: old.x + (x - old.x) * 0.45,
                y: old.y + (y - old.y) * 0.45
            };

            this.smoothed.set(label, smooth);

            const isDrawing = this.isDrawingGesture(hand);

            handsData.push({
                id: label,
                x: smooth.x,
                y: smooth.y,
                drawing: isDrawing
            });

            this.drawHand(ctx, hand);
        });

        for (const id of this.smoothed.keys()) {
            if (!handsData.some(hand => hand.id === id)) {
                this.smoothed.delete(id);
            }
        }

        this.lastHands = handsData;
        this.onHands(handsData);
    }

    isFingerUp(hand, tip, pip) {
        return hand[tip].y < hand[pip].y;
    }

    isDrawingGesture(hand) {
        const indexUp = this.isFingerUp(hand, 8, 6);
        const middleDown = !this.isFingerUp(hand, 12, 10);
        const ringDown = !this.isFingerUp(hand, 16, 14);
        const pinkyDown = !this.isFingerUp(hand, 20, 18);

        return indexUp && middleDown && ringDown && pinkyDown;
    }

    resizeOverlay() {
        const rect = this.overlay.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        const width = Math.max(1, Math.round(rect.width * dpr));
        const height = Math.max(1, Math.round(rect.height * dpr));

        if (this.overlay.width !== width ||
            this.overlay.height !== height) {
            this.overlay.width = width;
            this.overlay.height = height;
        }

        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.width = rect.width;
        this.height = rect.height;
    }

    drawHand(ctx, hand) {
        const w = this.width;
        const h = this.height;

        const point = landmark => ({
            x: (1 - landmark.x) * w,
            y: landmark.y * h
        });

        ctx.save();
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#35ff9a";
        ctx.shadowColor = "#35ff9a";
        ctx.shadowBlur = 12;

        for (const [a, b] of CONNECTIONS) {
            const p1 = point(hand[a]);
            const p2 = point(hand[b]);

            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
        }

        hand.forEach((landmark, index) => {
            const p = point(landmark);

            ctx.beginPath();
            ctx.fillStyle = index === 8 ? "#ffffff" : "#35ff9a";
            ctx.arc(p.x, p.y, index === 8 ? 6 : 3.5, 0, Math.PI * 2);
            ctx.fill();
        });

        ctx.restore();
    }

    close() {
        if (this.hands) {
            this.hands.close();
            this.hands = null;
        }

        this.ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
        this.lastHands = [];
        this.smoothed.clear();
    }
}
