/**
 * Detectors Module
 * Handles AI Logic: Pose, Object Detection, Knee Analysis, Predictions, Probability Metrics
 */
import { UI } from './ui.js';
import { Visualizer } from './visualizer.js';
import { Logger } from './logging.js';

let poseDetector;
let objectDetector;
let isSystemActive = true;

// State
let lastPoseTime = 0;
let previousLandmarks = null;
let previousVelocityY = 0;
let fallFrameCount = 0;
let lowVisibilityFrameCount = 0;
let currentEnvRisk = 0;

const FALL_TRIGGER_FRAMES = 10;
const VISIBILITY_THRESHOLD = 0.6;

export const Detectors = {
    async init() {
        UI.updateStatus('Loading AI Models...', 'warning');

        poseDetector = new Pose({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
        });

        poseDetector.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        poseDetector.onResults(this.onPoseResults.bind(this));

        try {
            objectDetector = await cocoSsd.load();
            Logger.add('success', 'System Ready', 'Advanced Metrics Active');
        } catch (e) {
            console.error('Failed to load Object Detector', e);
            UI.updateStatus('Object AI Failed', 'error');
        }

        UI.updateStatus('System Active', 'success');
    },

    async processFrame(videoElement) {
        if (!isSystemActive) return;

        await poseDetector.send({ image: videoElement });

        if (objectDetector && videoElement.readyState === 4 && lowVisibilityFrameCount < 10) {
            // Run object detection less frequently to check environment hazard level
            // Just for demo, we run it. Logic handles throttling or basic checks inside analyzeObstacles
            const predictions = await objectDetector.detect(videoElement);
            this.analyzeObstacles(predictions);
        } else if (lowVisibilityFrameCount > 10) {
            UI.showObstacleWarning(false);
            Visualizer.showObstacle3D(false);
            currentEnvRisk = 0;
        }
    },

    onPoseResults(results) {
        Visualizer.update2D(results);

        if (results.poseLandmarks) {
            const visibility = this.checkVisibility(results.poseLandmarks);

            if (visibility < VISIBILITY_THRESHOLD) {
                lowVisibilityFrameCount++;
                if (lowVisibilityFrameCount > 5) {
                    UI.updateStatus('Camera Blocked', 'warning');
                }
                // Degrade functionality but keep showing what we can?
                // For now, allow partial analysis with penalty
            } else {
                lowVisibilityFrameCount = 0;
                UI.updateStatus('Active', 'success');
            }

            this.analyzePose(results.poseLandmarks, results.poseWorldLandmarks, visibility);
        } else {
            lowVisibilityFrameCount++;
            // Reset metrics if no person
            UI.updateTelemetry({ risk: 0, stability: 0, envRisk: 0, spine: 'Good' });
        }

        const isFalling = fallFrameCount >= FALL_TRIGGER_FRAMES;
        Visualizer.update3D(results.poseWorldLandmarks, isFalling, false);
    },

    checkVisibility(landmarks) {
        const indices = [23, 24, 25, 26, 27, 28]; // Lower body
        let totalVis = 0;
        indices.forEach(i => totalVis += landmarks[i].visibility);
        return totalVis / indices.length;
    },

    analyzePose(landmarks, worldLandmarks, visibility) {
        if (visibility < 0.3) return;

        // 1. Hand Support
        const handSupport = this.checkHandSupport(landmarks);
        UI.toggleHandSupport(handSupport);

        // 2. Knee Pressure
        const leftKneeAngle = this.calculateAngle(landmarks[23], landmarks[25], landmarks[27]);
        const rightKneeAngle = this.calculateAngle(landmarks[24], landmarks[26], landmarks[28]);
        let modifier = handSupport ? 25 : 0;
        const minAngle = Math.min(leftKneeAngle, rightKneeAngle);
        const effectiveAngle = Math.min(180, minAngle + modifier);
        UI.updateKneePressure(effectiveAngle);

        // 3. New Metrics Calculations
        const stabilityScore = this.calculateStability(landmarks);
        const spineHealth = this.calculateSpineHealth(landmarks);

        // 4. Composite Fall Risk Calculation
        // Risk increases with: Low Stability, Low Knee Angle (High pressure), High Env Risk, Fast Downward Velocity
        const kneeRisk = Math.max(0, (140 - effectiveAngle)); // 0 to ~100
        const stabilityRisk = 100 - stabilityScore; // 0 to 100
        const envRisk = currentEnvRisk * 100; // 0 to 100

        // Weighted Sum
        // Knee: 30%, Stability: 40%, Env: 20%, Base: 10%
        let riskIndex = (kneeRisk * 0.3) + (stabilityRisk * 0.4) + (envRisk * 0.2);

        // Dynamic Boosters
        if (this.checkFreefall(landmarks)) riskIndex = 100; // Immediate override
        if (spineHealth === 'Poor') riskIndex += 10;

        riskIndex = Math.min(100, Math.max(0, riskIndex));

        // Telemetry Update
        UI.updateTelemetry({
            risk: riskIndex,
            stability: stabilityScore,
            envRisk: currentEnvRisk * 100,
            spine: spineHealth
        });

        // Logger Triggers
        if (riskIndex > 85 && Math.random() < 0.05) {
            Logger.add('warning', 'High Fall Risk', `Risk Index: ${Math.round(riskIndex)}%`);
        }

        // 5. Fall Detection
        const isFallen = this.checkFall(landmarks);
        if (isFallen || riskIndex >= 95) {
            fallFrameCount++;
            if (fallFrameCount === FALL_TRIGGER_FRAMES) {
                Logger.add('error', 'FALL DETECTED', `Risk: ${Math.round(riskIndex)}%`);
                UI.toggleFallOverlay(true);
            }
        } else {
            fallFrameCount = 0;
        }

        this.predictNextAction(landmarks);

        previousLandmarks = landmarks;
        lastPoseTime = Date.now();
    },

    calculateStability(landmarks) {
        // Horizontal distance between Hip Center (COG approx) and Midpoint between Ankles (Base of support)
        const hipX = (landmarks[23].x + landmarks[24].x) / 2;
        const ankleX = (landmarks[27].x + landmarks[28].x) / 2;

        // Normalized Deviation (0 to 0.5 usually)
        const deviation = Math.abs(hipX - ankleX);

        // Map deviation to 0-100 Score. 
        // 0 deviation = 100 stability. 
        // 0.2 deviation = 0 stability (Leaning way out)

        const score = Math.max(0, 100 - (deviation * 500));
        return score;
    },

    calculateSpineHealth(landmarks) {
        // Angle between Hip-Shoulder vector and Vertical
        const shoulderX = (landmarks[11].x + landmarks[12].x) / 2;
        const shoulderY = (landmarks[11].y + landmarks[12].y) / 2;
        const hipX = (landmarks[23].x + landmarks[24].x) / 2;
        const hipY = (landmarks[23].y + landmarks[24].y) / 2;

        const dx = shoulderX - hipX;
        const dy = shoulderY - hipY;

        // Angle from vertical (Y axis)
        // atan2(dx, dy) -> 0 if vertical
        const angleRad = Math.atan2(dx, dy);
        const angleDeg = Math.abs(angleRad * 180 / Math.PI);

        // If bent forward > 45 degrees, potentially poor posture (Stoop)
        // Note: Squatting keeps back straight (angle near 0). Stooping bends back (angle > 40).

        if (angleDeg > 45) return 'Poor';
        return 'Good';
    },

    checkHandSupport(landmarks) {
        const wrists = [landmarks[15], landmarks[16]];
        const knees = [landmarks[25], landmarks[26]];
        let supported = false;
        wrists.forEach(w => {
            if (w.visibility < 0.5) return;
            knees.forEach(k => {
                if (k.visibility < 0.5) return;
                const dist = Math.hypot(w.x - k.x, w.y - k.y);
                if (dist < 0.15) supported = true;
            });
        });
        return supported;
    },

    checkFreefall(landmarks) {
        if (!previousLandmarks) return false;
        const currentY = (landmarks[23].y + landmarks[24].y) / 2;
        const prevY = (previousLandmarks[23].y + previousLandmarks[24].y) / 2;
        const dy = currentY - prevY;
        const accel = dy - previousVelocityY;
        previousVelocityY = dy;
        if (accel > 0.015 && dy > 0.02) return true;
        return false;
    },

    analyzeObstacles(predictions) {
        if (lowVisibilityFrameCount > 0) return;
        if (!previousLandmarks) return;

        const feetY = Math.max(previousLandmarks[29].y, previousLandmarks[30].y);
        const feetX = (previousLandmarks[29].x + previousLandmarks[30].x) / 2;

        let obstacleDetected = false;
        let obstacleObj = null;

        const width = UI.elements.video.videoWidth;
        const height = UI.elements.video.videoHeight;
        if (width === 0) return;

        predictions.forEach(pred => {
            if (pred.class === 'person') return;
            const bx = pred.bbox[0] / width;
            const by = pred.bbox[1] / height;
            const bw = pred.bbox[2] / width;
            const bh = pred.bbox[3] / height;
            const boxCenter = { x: bx + bw / 2, y: by + bh / 2 };

            const dist = Math.hypot(boxCenter.x - feetX, boxCenter.y - feetY);

            if (dist < 0.2 && boxCenter.y > 0.5) {
                obstacleDetected = true;
                obstacleObj = pred;
            }
        });

        // Update Risk Factor
        currentEnvRisk = obstacleDetected ? 0.8 : 0; // High risk if object near

        UI.showObstacleWarning(obstacleDetected, obstacleObj ? obstacleObj.class : '');

        if (obstacleDetected && obstacleObj) {
            if (Math.random() < 0.01) Logger.add('warning', 'Obstacle Hazard', `${obstacleObj.class}`);
            Visualizer.showObstacle3D(true, new THREE.Vector3(0.5, 0, 0));
        } else {
            Visualizer.showObstacle3D(false);
        }
    },

    checkFall(landmarks) {
        const leftShoulder = landmarks[11];
        const rightShoulder = landmarks[12];
        const leftHip = landmarks[23];
        const rightHip = landmarks[24];

        const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
        const hipY = (leftHip.y + rightHip.y) / 2;
        const shoulderX = (leftShoulder.x + rightShoulder.x) / 2;
        const hipX = (leftHip.x + rightHip.x) / 2;

        const dx = shoulderX - hipX;
        const dy = shoulderY - hipY;

        const angle = Math.atan2(Math.abs(dy), Math.abs(dx)) * (180 / Math.PI);
        const isHorizontal = angle < 45;
        const isLow = hipY > 0.5;

        return isHorizontal && isLow;
    },

    predictNextAction(landmarks) {
        if (!previousLandmarks) {
            UI.updatePrediction("Analyzing...");
            return;
        }

        const currentHipY = (landmarks[23].y + landmarks[24].y) / 2;
        const prevHipY = (previousLandmarks[23].y + previousLandmarks[24].y) / 2;
        const currentHipX = (landmarks[23].x + landmarks[24].x) / 2;
        const prevHipX = (previousLandmarks[23].x + previousLandmarks[24].x) / 2;

        const vy = currentHipY - prevHipY;
        const vx = currentHipX - prevHipX;

        const MOVEMENT_THRESH = 0.005;
        let prediction = "Stable";

        if (Math.abs(vy) > MOVEMENT_THRESH) {
            if (vy > 0) prediction = "Lowering / Sitting";
            else prediction = "Standing Up";
        } else if (Math.abs(vx) > MOVEMENT_THRESH) {
            prediction = "Walking";
        }

        UI.updatePrediction(prediction);
    },

    calculateAngle(a, b, c) {
        if (!a || !b || !c) return 180;
        const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
        let angle = Math.abs(radians * 180.0 / Math.PI);
        if (angle > 180.0) angle = 360.0 - angle;
        return angle;
    }
};

window.addEventListener('reset-system', () => {
    fallFrameCount = 0;
    Logger.add('info', 'System Reset', 'User cleared alarms');
});
