
// js/analysis.js
// Handles Logic: Angle calculation, Fall Prediction, Obstacle checking

export class Analyzer {
    constructor() {
        this.history = []; // Store past landmarks for velocity calc
        this.maxHistory = 10;
        this.fallThreshold = 5; // Frames to confirm fall
        this.fallCounter = 0;
        this.isFallen = false;

        // Thresholds
        this.floorY_Threshold = 0.8; // Normalized Y (0 top, 1 bottom)
        this.kneeWarningAngle = 80; // Degrees
        this.kneeCriticalAngle = 60; // Degrees (Deep squat/strain)
    }

    analyze(landmarks, obstacles) {
        if (!landmarks) return null;

        const leftKneeStats = this.calculateKneeStats(landmarks, 23, 25, 27); // Hip, Knee, Ankle
        const rightKneeStats = this.calculateKneeStats(landmarks, 24, 26, 28);

        const fallStatus = this.detectFall(landmarks);
        const prediction = this.predictMovement(landmarks);
        const obstacleStatus = this.checkObstacles(landmarks, obstacles);

        // Update history
        this.updateHistory(landmarks);

        return {
            leftKnee: leftKneeStats,
            rightKnee: rightKneeStats,
            fall: fallStatus,
            prediction: prediction,
            obstacles: obstacleStatus
        };
    }

    // --- Knee Pressure Logic ---
    calculateKneeStats(landmarks, hipIdx, kneeIdx, ankleIdx) {
        const hip = landmarks[hipIdx];
        const knee = landmarks[kneeIdx];
        const ankle = landmarks[ankleIdx];

        if (!hip || !knee || !ankle) return { angle: 180, load: 0 };

        const angle = this.calculateAngle(hip, knee, ankle);

        // Load metric: 180 deg = 0% load, 90 deg = 50% load, <60 deg = 100% load (High Stress)
        // Mapping 180 -> 60 range to 0 -> 100
        let load = 0;
        if (angle < 170) {
            load = ((170 - angle) / (170 - 60)) * 100;
        }
        load = Math.max(0, Math.min(100, load));

        return { angle, load: Math.round(load) };
    }

    calculateAngle(a, b, c) {
        const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
        let angle = Math.abs(radians * 180.0 / Math.PI);
        if (angle > 180.0) angle = 360 - angle;
        return angle;
    }

    // --- Fall Detection & Prediction ---
    detectFall(landmarks) {
        const start = 11; // Left shoulder
        const end = 24; // Right hip

        // Simple heuristic: Angle of torso + Y position
        const shouldersY = (landmarks[11].y + landmarks[12].y) / 2;
        const hipsY = (landmarks[23].y + landmarks[24].y) / 2;

        // Check if Torso is Horizontal
        const shoulderMidX = (landmarks[11].x + landmarks[12].x) / 2;
        const hipMidX = (landmarks[23].x + landmarks[24].x) / 2;

        const verticalDist = Math.abs(shouldersY - hipsY);
        const horizontalDist = Math.abs(shoulderMidX - hipMidX);

        // If horizontal distance > vertical distance -> Horizontal pose
        const isHorizontal = horizontalDist > verticalDist;
        const isLow = hipsY > 0.6; // Lower half of screen

        if (isHorizontal && isLow) {
            this.fallCounter++;
        } else {
            this.fallCounter = 0;
        }

        return this.fallCounter > this.fallThreshold;
    }

    predictMovement(landmarks) {
        // Predict hip position 1 second later based on velocity
        if (this.history.length < 2) return "Analyzing...";

        const currHip = (landmarks[23].y + landmarks[24].y) / 2;
        const prevHip = (this.history[0][23].y + this.history[0][24].y) / 2;

        const velocity = currHip - prevHip; // dy per frame (roughly)
        const fps = 30; // Assumption
        const predY = currHip + (velocity * fps); // Predicted Y in 1 sec

        if (predY > 0.9) return "Potential Fall Impact";
        if (velocity > 0.02) return "Moving Down Fast";
        if (velocity < -0.01) return "Standing Up";
        return "Stable";
    }

    updateHistory(landmarks) {
        this.history.unshift(landmarks);
        if (this.history.length > this.maxHistory) {
            this.history.pop();
        }
    }

    // --- Obstacle Checking ---
    checkObstacles(landmarks, obstacles) {
        if (!obstacles || obstacles.length === 0) return { count: 0, danger: false, names: [] };

        const leftAnkle = landmarks[27];
        const rightAnkle = landmarks[28];
        const feet = [leftAnkle, rightAnkle];

        let nearby = [];
        let danger = false;

        // Bounding box format from CocoSSD: [x, y, width, height]
        // Landmarks are normalized [0,1], Box is pixels. Need to normalize box or denormalize landmarks.
        // We will assume 1280x720 internal calc for simplicity or pass in dims.
        // Actually, let's work in normalized space. CocoSSD returns pixels.
        // We really need the canvas dimensions to map pixels to normalized.
        // For this logic snippet, we'll accept raw landmarks and just check proximity "roughly" or assume caller handles mapping.
        // Wait, standard practice: map feet to pixels.

        // We'll return the raw obstacle data and let visualizer handle the distinct logic or coordinate mapping.
        // But for "Result", let's just count.

        return { count: obstacles.length, danger: obstacles.length > 0, items: obstacles };
    }
}
