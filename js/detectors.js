/**
 * Detectors Module
 * Handles AI Logic: Pose, Object Detection, Knee Analysis, Predictions
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
let previousVelocityY = 0; // For acceleration
let fallFrameCount = 0;
let lowVisibilityFrameCount = 0;

const FALL_TRIGGER_FRAMES = 10;
const VISIBILITY_THRESHOLD = 0.6;

export const Detectors = {
    async init() {
        UI.updateStatus('Loading AI Models...', 'warning');

        // 1. Load Pose
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

        // 2. Load Object Detection (Coco-SSD)
        try {
            objectDetector = await cocoSsd.load();
            Logger.add('success', 'AI Models Loaded', 'Pose + COCO-SSD Ready');
        } catch (e) {
            console.error('Failed to load Object Detector', e);
            UI.updateStatus('Object AI Failed', 'error');
            Logger.add('error', 'Object AI Failed', e.message);
        }

        UI.updateStatus('System Active', 'success');
    },

    async processFrame(videoElement) {
        if (!isSystemActive) return;

        // Send to Pose
        await poseDetector.send({ image: videoElement });

        // Object Detection (every few frames to save perfs could be done, but running every frame here for demo)
        if (objectDetector && videoElement.readyState === 4 && lowVisibilityFrameCount < 10) {
            const predictions = await objectDetector.detect(videoElement);
            this.analyzeObstacles(predictions);
        } else if (lowVisibilityFrameCount > 10) {
            // If visibility is low for a while, disable object detection to save resources and avoid junk
            UI.showObstacleWarning(false);
            Visualizer.showObstacle3D(false);
        }
    },

    onPoseResults(results) {
        Visualizer.update2D(results);

        if (results.poseLandmarks) {
            // Robust Occlusion Check
            const visibility = this.checkVisibility(results.poseLandmarks);

            if (visibility < VISIBILITY_THRESHOLD) {
                lowVisibilityFrameCount++;
                if (lowVisibilityFrameCount > 5) {
                    UI.updateStatus('Camera Blocked / Poor Viz', 'warning');
                    // We don't return here, we just flag it so analytics can be cautious
                }
            } else {
                lowVisibilityFrameCount = 0;
                UI.updateStatus('Monitoring', 'success');
            }

            this.analyzePose(results.poseLandmarks, results.poseWorldLandmarks, visibility);
        } else {
            lowVisibilityFrameCount++;
            if (lowVisibilityFrameCount > 5) {
                UI.updateStatus('No Person Detected', 'warning');
            }
        }

        const isFalling = fallFrameCount >= FALL_TRIGGER_FRAMES;
        Visualizer.update3D(results.poseWorldLandmarks, isFalling, false);
    },

    checkVisibility(landmarks) {
        // Check visibility of Lower Body landmarks
        const indices = [23, 24, 25, 26, 27, 28]; // Hips, Knees, Ankles
        let totalVis = 0;
        indices.forEach(i => totalVis += landmarks[i].visibility);
        return totalVis / indices.length;
    },

    analyzePose(landmarks, worldLandmarks, visibility) {
        // If visibility is too low, skip analysis to prevent bad data
        if (visibility < 0.4) return;

        // 1. Hand Support / Load Distribution
        const handSupport = this.checkHandSupport(landmarks);
        UI.toggleHandSupport(handSupport);

        // 2. Knee Pressure Analysis
        const leftKneeAngle = this.calculateAngle(landmarks[23], landmarks[25], landmarks[27]);
        const rightKneeAngle = this.calculateAngle(landmarks[24], landmarks[26], landmarks[28]);

        // If hand support is active, we simulate "less pressure" by artificially increasing angle
        // (Since closer to 180 is better)
        let modifier = handSupport ? 20 : 0;

        const minAngle = Math.min(leftKneeAngle, rightKneeAngle);
        const effectiveAngle = Math.min(180, minAngle + modifier);

        UI.updateKneePressure(effectiveAngle);

        if (effectiveAngle < 100 && !handSupport && Math.random() < 0.05) { // Throttle logs
            Logger.add('warning', 'High Knee Stress Detected', `Angle: ${Math.round(minAngle)}°`);
        }

        // 3. Fall Detection Logic (Geometric) + Freefall (Acceleration)
        const isFallen = this.checkFall(landmarks);
        const isFreefall = this.checkFreefall(landmarks);

        if (isFallen || isFreefall) {
            fallFrameCount++;
            if (fallFrameCount === FALL_TRIGGER_FRAMES) { // Log once
                Logger.add('error', 'FALL DETECTED', isFreefall ? 'High Acceleration Impact' : 'Horizontal Posture');
                UI.toggleFallOverlay(true);
                UI.updateStatus('FALL DETECTED', 'error');
            }
        } else {
            fallFrameCount = 0;
        }

        // 4. Next Second Prediction
        this.predictNextAction(landmarks);

        // Store for next frame
        previousLandmarks = landmarks;
        lastPoseTime = Date.now();
    },

    checkHandSupport(landmarks) {
        // Check if wrists are close to knees or thighs
        // Wrists: 15 (Left), 16 (Right)
        // Knees: 25, 26. Hips: 23, 24

        // We check Y-distance. If Hands are roughly at Knee Height +/- threshold
        // Or Hands are BELOW Hips significantly while Hips are low (Squat with hands on floor)

        const wrists = [landmarks[15], landmarks[16]];
        const knees = [landmarks[25], landmarks[26]];

        let supported = false;

        wrists.forEach(w => {
            if (w.visibility < 0.5) return;
            knees.forEach(k => {
                if (k.visibility < 0.5) return;

                // Euclidean distance in normalized coords
                const dist = Math.hypot(w.x - k.x, w.y - k.y);
                if (dist < 0.15) supported = true; // Close to knee
            });
        });

        return supported;
    },

    checkFreefall(landmarks) {
        if (!previousLandmarks) return false;

        // Hip Center Y
        const currentY = (landmarks[23].y + landmarks[24].y) / 2;
        const prevY = (previousLandmarks[23].y + previousLandmarks[24].y) / 2;

        const dy = currentY - prevY; // Change in position
        // dy / dt (per frame) = Velocity

        // Acceleration = Velocity - PreviousVelocity
        const accel = dy - previousVelocityY;
        previousVelocityY = dy;

        // Downward acceleration (Positive Y is down in image coords)
        // Massive jump in Y pos per frame + increasing
        // Threshold needs tuning, but let's say > 0.02 normalized units/frame^2 is suspicious

        if (accel > 0.015 && dy > 0.02) {
            // Moving down fast AND accelerating
            return true;
        }
        return false;
    },

    analyzeObstacles(predictions) {
        // Occlusion safety check
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

        UI.showObstacleWarning(obstacleDetected, obstacleObj ? obstacleObj.class : '');

        if (obstacleDetected && obstacleObj) {
            // Only log unique obstacle events occasionally
            if (Math.random() < 0.01) {
                Logger.add('warning', 'Obstacle Detected', `${obstacleObj.class} near feet`);
            }
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
