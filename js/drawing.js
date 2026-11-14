
export class DrawingEngine {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");

        this.strokes = [];
        this.redoStack = [];
        this.activeStrokes = new Map();

        this.settings = {
            tool: "pen",
            color: "#35ff9a",
            size: 8,
            opacity: 100
        };

        this.zoom = 1;
        this.resize();
        window.addEventListener("resize", () => this.resize());
    }

    resize() {
        const rect = this.canvas.getBoundingClientRect();
        const oldWidth = this.canvas.width;
        const oldHeight = this.canvas.height;

        const oldCanvas = document.createElement("canvas");
        oldCanvas.width = oldWidth || 1;
        oldCanvas.height = oldHeight || 1;

        if (oldWidth && oldHeight) {
            oldCanvas.getContext("2d").drawImage(this.canvas, 0, 0);
        }

        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
        this.canvas.height = Math.max(1, Math.round(rect.height * dpr));

        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        this.width = rect.width;
        this.height = rect.height;

        this.render();
    }

    setTool(tool) {
        this.settings.tool = tool;
    }

    setColor(color) {
        this.settings.color = color;
    }

    setSize(size) {
        this.settings.size = Number(size);
    }

    setOpacity(opacity) {
        this.settings.opacity = Number(opacity);
    }

    setZoom(value) {
        this.zoom = Math.max(0.5, Math.min(2, value));
        this.render();
    }

    addPoint(handId, point, drawing) {
        let active = this.activeStrokes.get(handId);

        if (drawing) {
            if (!active) {
                active = {
                    handId,
                    tool: this.settings.tool,
                    color: this.settings.color,
                    size: this.settings.size,
                    opacity: this.settings.opacity,
                    points: [],
                    hue: Math.random() * 360
                };

                this.activeStrokes.set(handId, active);
            }

            active.points.push({
                x: point.x,
                y: point.y,
                hue: active.hue + active.points.length * 5
            });

            this.render();
        } else if (active) {
            if (active.points.length > 0) {
                this.strokes.push(active);
                this.redoStack = [];
            }

            this.activeStrokes.delete(handId);
            this.render();
        }
    }

    finishAll() {
        for (const [id, stroke] of this.activeStrokes) {
            if (stroke.points.length) {
                this.strokes.push(stroke);
            }
            this.activeStrokes.delete(id);
        }

        this.render();
    }

    undo() {
        this.finishAll();

        const stroke = this.strokes.pop();
        if (stroke) this.redoStack.push(stroke);

        this.render();
    }

    redo() {
        const stroke = this.redoStack.pop();
        if (stroke) this.strokes.push(stroke);

        this.render();
    }

    clear() {
        this.strokes = [];
        this.redoStack = [];
        this.activeStrokes.clear();
        this.render();
    }

    drawStroke(ctx, stroke) {
        const points = stroke.points;
        if (!points.length) return;

        const w = this.width;
        const h = this.height;

        const mapped = points.map(p => ({
            x: p.x * w,
            y: p.y * h,
            hue: p.hue
        }));

        ctx.save();
        ctx.globalAlpha = stroke.opacity / 100;
        ctx.lineWidth = stroke.size;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        if (stroke.tool === "eraser") {
            ctx.globalCompositeOperation = "destination-out";
            ctx.strokeStyle = "#000";
            ctx.fillStyle = "#000";
        } else {
            ctx.globalCompositeOperation = "source-over";
            ctx.strokeStyle = stroke.color;
            ctx.fillStyle = stroke.color;
        }

        if (stroke.tool === "neon") {
            ctx.shadowColor = stroke.color;
            ctx.shadowBlur = stroke.size * 2.5;
        }

        if (stroke.tool === "marker") {
            ctx.globalAlpha = Math.min(0.35, stroke.opacity / 100);
            ctx.lineWidth = stroke.size * 2.2;
        }

        const first = mapped[0];
        const last = mapped[mapped.length - 1];

        if (stroke.tool === "line" ||
            stroke.tool === "rectangle" ||
            stroke.tool === "circle") {

            ctx.beginPath();

            if (stroke.tool === "line") {
                ctx.moveTo(first.x, first.y);
                ctx.lineTo(last.x, last.y);
            }

            if (stroke.tool === "rectangle") {
                ctx.rect(
                    first.x,
                    first.y,
                    last.x - first.x,
                    last.y - first.y
                );
            }

            if (stroke.tool === "circle") {
                const radius = Math.hypot(
                    last.x - first.x,
                    last.y - first.y
                );

                ctx.arc(first.x, first.y, radius, 0, Math.PI * 2);
            }

            ctx.stroke();
        } else if (stroke.tool === "rainbow") {
            ctx.lineWidth = stroke.size;

            for (let i = 1; i < mapped.length; i++) {
                ctx.beginPath();
                ctx.strokeStyle = `hsl(${mapped[i].hue % 360}, 100%, 65%)`;
                ctx.moveTo(mapped[i - 1].x, mapped[i - 1].y);
                ctx.lineTo(mapped[i].x, mapped[i].y);
                ctx.stroke();
            }
        } else {
            ctx.beginPath();
            ctx.moveTo(first.x, first.y);

            for (let i = 1; i < mapped.length - 1; i++) {
                const midX = (mapped[i].x + mapped[i + 1].x) / 2;
                const midY = (mapped[i].y + mapped[i + 1].y) / 2;

                ctx.quadraticCurveTo(
                    mapped[i].x,
                    mapped[i].y,
                    midX,
                    midY
                );
            }

            if (mapped.length > 1) {
                const lastPoint = mapped[mapped.length - 1];
                ctx.lineTo(lastPoint.x, lastPoint.y);
            } else {
                ctx.lineTo(first.x + 0.1, first.y + 0.1);
            }

            ctx.stroke();
        }

        ctx.restore();
    }

    render() {
        const ctx = this.ctx;

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.restore();

        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        ctx.translate(this.width / 2, this.height / 2);
        ctx.scale(this.zoom, this.zoom);
        ctx.translate(-this.width / 2, -this.height / 2);

        for (const stroke of this.strokes) {
            this.drawStroke(ctx, stroke);
        }

        for (const stroke of this.activeStrokes.values()) {
            this.drawStroke(ctx, stroke);
        }

        ctx.restore();
    }

    download() {
        this.finishAll();

        const output = document.createElement("canvas");
        const scale = 2;

        output.width = this.width * scale;
        output.height = this.height * scale;

        const ctx = output.getContext("2d");
        ctx.scale(scale, scale);

        ctx.fillStyle = "#071016";
        ctx.fillRect(0, 0, this.width, this.height);

        for (const stroke of this.strokes) {
            this.drawStroke(ctx, stroke);
        }

        const link = document.createElement("a");
        link.download = "METR-ULTRA-drawing.png";
        link.href = output.toDataURL("image/png");
        link.click();
    }
}
