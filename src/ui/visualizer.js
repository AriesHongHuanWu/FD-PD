/**
 * Visualizer Module (Google Material Edition)
 * Handles high-fidelity canvas drawing with ripple effects.
 */

export class Visualizer {
    constructor(canvas) {
        this.ctx = canvas.getContext('2d');
        this.width = canvas.width;
        this.height = canvas.height;
        this.ripples = []; // Array of {x, y, r, alpha, color}
    }

    resize(w, h) {
        this.ctx.canvas.width = w;
        this.ctx.canvas.height = h;
        this.width = w;
        this.height = h;
    }

    clear() {
        this.ctx.clearRect(0, 0, this.width, this.height);
    }

    /**
     * Main Draw Loop
     */
    draw(landmarks, analysisResult) {
        if (!landmarks) return;

        this.ctx.save();

        // 1. Draw Ripples (Underlay)
        this.updateAndDrawRipples();

        // 2. Risk Visualization (Force Field)
        if (analysisResult && analysisResult.risk) {
            const knee = landmarks[25]; // Left Knee
            const x = knee.x * this.width;
            const y = knee.y * this.height;

            this.drawForceField(x, y, analysisResult.risk.color);

            // Add ripple on critical
            if (analysisResult.risk.lev === 'CRITICAL' && Math.random() > 0.9) {
                this.addRipple(x, y, analysisResult.risk.color);
            }
        }

        // 3. Draw Skeleton
        this.drawSkeleton(landmarks);

        this.ctx.restore();
    }

    addRipple(x, y, color) {
        this.ripples.push({
            x, y,
            r: 10,
            alpha: 0.8,
            color
        });
    }

    updateAndDrawRipples() {
        for (let i = this.ripples.length - 1; i >= 0; i--) {
            const rip = this.ripples[i];
            rip.r += 2; // Expand
            rip.alpha -= 0.02; // Fade

            if (rip.alpha <= 0) {
                this.ripples.splice(i, 1);
                continue;
            }

            this.ctx.beginPath();
            this.ctx.arc(rip.x, rip.y, rip.r, 0, 2 * Math.PI);
            this.ctx.fillStyle = this.hexToRgba(rip.color, rip.alpha * 0.3);
            this.ctx.fill();
            this.ctx.strokeStyle = this.hexToRgba(rip.color, rip.alpha);
            this.ctx.stroke();
        }
    }

    drawForceField(x, y, color) {
        // Soft Glow
        const gradient = this.ctx.createRadialGradient(x, y, 20, x, y, 80);
        gradient.addColorStop(0, this.hexToRgba(color, 0.4));
        gradient.addColorStop(1, this.hexToRgba(color, 0.0));

        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(x, y, 80, 0, 2 * Math.PI);
        this.ctx.fill();
    }

    drawSkeleton(landmarks) {
        const CONNECTIONS = [
            [23, 25], [25, 27], // L Leg
            [24, 26], [26, 28], // R Leg
            [11, 23], [12, 24], // Torso
            [23, 24] // Hips
        ];

        this.ctx.lineWidth = 6;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        // Draw Shadows first for depth
        this.ctx.shadowColor = 'rgba(0,0,0,0.5)';
        this.ctx.shadowBlur = 10;

        CONNECTIONS.forEach(([i, j]) => {
            const p1 = landmarks[i];
            const p2 = landmarks[j];
            if (!p1 || !p2) return;

            this.ctx.strokeStyle = 'white';
            this.ctx.beginPath();
            this.ctx.moveTo(p1.x * this.width, p1.y * this.height);
            this.ctx.lineTo(p2.x * this.width, p2.y * this.height);
            this.ctx.stroke();
        });

        this.ctx.shadowBlur = 0; // Reset shadow

        // Joints
        [23, 24, 25, 26, 27, 28].forEach(idx => {
            const p = landmarks[idx];
            if (!p) return;

            const x = p.x * this.width;
            const y = p.y * this.height;

            // Outer ring
            this.ctx.beginPath();
            this.ctx.arc(x, y, 8, 0, 2 * Math.PI);
            this.ctx.fillStyle = 'white';
            this.ctx.fill();

            // Inner dot (Google Blue)
            this.ctx.beginPath();
            this.ctx.arc(x, y, 5, 0, 2 * Math.PI);
            this.ctx.fillStyle = '#4285F4';
            this.ctx.fill();
        });
    }

    hexToRgba(hex, alpha) {
        const h = hex.replace('#', '');
        const r = parseInt(h.substring(0, 2), 16);
        const g = parseInt(h.substring(2, 4), 16);
        const b = parseInt(h.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
}
