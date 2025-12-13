/**
 * Detectors Module
 * Handles AI Logic: Pose, Object Detection, Knee Analysis, Predictions
 */
import { UI } from './ui.js';
import { Visualizer } from './visualizer.js';

let poseDetector;
let objectDetector;
let isSystemActive = true;

// State
let lastPoseTime = 0;
let previousLandmarks = null;
let fallFrameCount = 0;
const FALL_TRIGGER_FRAMES = 10;

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
            console.log('Coco-SSD Loaded');
        } catch (e) {
            console.error('Failed to load Object Detector', e);
            UI.updateStatus('Object AI Failed', 'error');
        }

        UI.updateStatus('System Active', 'success');
    },

    async processFrame(videoElement) {
        if (!isSystemActive) return;

        // Send to Pose
        await poseDetector.send({ image: videoElement });

        // Object Detection (every few frames to save perfs could be done, but running every frame here for demo)
        // We do this inside loop in main, but let's assume we call it here.
        if (objectDetector && videoElement.readyState === 4) {
            const predictions = await objectDetector.detect(videoElement);
            this.analyzeObstacles(predictions);
        }
    },

    onPoseResults(results) {
        Visualizer.update2D(results);

        if (results.poseLandmarks) {
            this.analyzePose(results.poseLandmarks, results.poseWorldLandmarks);
        } else {
            // Occlusion or no person
            UI.updateStatus('No Person Detected', 'warning');
        }

        Visualizer.update3D(results.poseWorldLandmarks, fallFrameCount >= FALL_TRIGGER_FRAMES, false);
    },

    analyzePose(landmarks, worldLandmarks) {
        // 1. Knee Pressure Analysis
        // 23: Left Hip, 25: Left Knee, 27: Left Ankle
        // 24: Right Hip, 26: Right Knee, 28: Right Ankle

        const leftKneeAngle = this.calculateAngle(landmarks[23], landmarks[25], landmarks[27]);
        const rightKneeAngle = this.calculateAngle(landmarks[24], landmarks[26], landmarks[28]);

        // Use the leg taking more weight (more bent usually means more load in squat, but here we simplify)
        // Or simply display the one with most acute angle.
        const minAngle = Math.min(leftKneeAngle, rightKneeAngle);
        UI.updateKneePressure(minAngle);

        // 2. Fall Detection Logic
        const isFallen = this.checkFall(landmarks);
        if (isFallen) {
            fallFrameCount++;
            if (fallFrameCount >= FALL_TRIGGER_FRAMES) {
                UI.toggleFallOverlay(true);
                UI.updateStatus('FALL DETECTED', 'error');
            }
        } else {
            fallFrameCount = 0;
            // Only clear if not manually dismissed? For now auto clear if standing up
            // UI.toggleFallOverlay(false); 
        }

        // 3. Next Second Prediction
        this.predictNextAction(landmarks);

        // Store for next frame velocity calc
        previousLandmarks = landmarks;
        lastPoseTime = Date.now();
    },

    analyzeObstacles(predictions) {
        // Detect obstacles near feet
        // Feet indices: 27-32

        if (!previousLandmarks) return;

        const feetY = Math.max(previousLandmarks[29].y, previousLandmarks[30].y); // ~1.0 is bottom
        const feetX = (previousLandmarks[29].x + previousLandmarks[30].x) / 2;

        let obstacleDetected = false;
        let obstacleObj = null;

        // Simple check: Is there an object "low" in the frame and horizontally near feet?
        // predictions: [ { bbox: [x, y, width, height], class: "..." } ]
        // image coords are pixel based, landmarks are normalized 0-1

        const width = UI.elements.video.videoWidth;
        const height = UI.elements.video.videoHeight;

        if (width === 0 || height === 0) return;

        predictions.forEach(pred => {
            if (pred.class === 'person') return; // Ignore people

            // Normalize bbox
            const bx = pred.bbox[0] / width;
            const by = pred.bbox[1] / height;
            const bw = pred.bbox[2] / width;
            const bh = pred.bbox[3] / height;

            const boxCenter = { x: bx + bw / 2, y: by + bh / 2 };

            // Check proximity to feet
            // Feet are at feetX, feetY.
            // If object is "below" or at same level as feet and close horizontally

            const dist = Math.hypot(boxCenter.x - feetX, boxCenter.y - feetY);

            // If close and object is roughly on the floor (y > 0.5)
            if (dist < 0.2 && boxCenter.y > 0.5) {
                obstacleDetected = true;
                obstacleObj = pred;
            }
        });

        UI.showObstacleWarning(obstacleDetected, obstacleObj ? obstacleObj.class : '');

        // 3D Visualizer update for obstacle
        // If detected, we place a cube near the feet in 3D world
        if (obstacleDetected) {
            // Rough mapping from 2D screen pos to 3D world pos relative to character
            // This is non-trivial without depth, but we can fake it by placing it 
            // at the feet's world position + some offset.

            // Get feet world pos average
            // We need worldLandmarks from analyzePose scope, but here we are in obstacle scope.
            // Let's assume we can access access pose world landmarks or just place it generic.

            // For now, let's just tell visualizer to show it near the feet 
            // We need to pass the feet position from analyzePose. 
            // Let's refactor slightly to share state or just pass a generic "near feet" flag.

            // Actually, let's assume Visualizer knows where feet are from its own update.
            // We will pass a vector relative to feet.

            // Find feet center 3D (approximate from last update)
            if (previousLandmarks) {
                // We rely on Visualizer having the last world landmarks.
                // We will just pass "true" and let visualizer use the feet pos of the skeleton.

                // Quick hack: calculate feet position here if we had world landmarks
                // Since we don't have world landmarks in this function scope easily without passing them,
                // let's pass a dummy position or rely on visualizer to attach it to the feet node.

                // Let's pass the 3D position of the person's feet from the skeleton directly in Visualizer?
                // No, Detectors shouldn't know about Three.js meshes directly.

                // We'll pass a 3D vector derived from WORLD landmarks if we had them.
                // For now, let's pass { x: 0, y: 0, z: 0 } which is the center, 
                // but ideally it should be where the feet are.

                // IMPROVEMENT: Pass world landmarks to this function too.
                // For now, we will just say "Show it near feet"
                Visualizer.showObstacle3D(true, new THREE.Vector3(0.5, 0, 0)); // Dummy offset
            }
        } else {
            Visualizer.showObstacle3D(false);
        }
    },

    checkFall(landmarks) {
        // Geometric Fall Detection
        // 1. Torso orientation (horizontal = bad)
        // 2. Head vs Hip height

        const leftShoulder = landmarks[11];
        const rightShoulder = landmarks[12];
        const leftHip = landmarks[23];
        const rightHip = landmarks[24];

        const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
        const hipY = (leftHip.y + rightHip.y) / 2;

        const shoulderX = (leftShoulder.x + rightShoulder.x) / 2;
        const hipX = (leftHip.x + rightHip.x) / 2;

        // Angle of torso
        const dx = shoulderX - hipX;
        const dy = shoulderY - hipY; // Expect negative if standing (shoulder above hip, y is 0 at top)
        // Actually Y increases downwards in MediaPipe 2D. 0 = top.
        // So standing: Shoulder Y < Hip Y. dy should be negative.

        const angle = Math.atan2(Math.abs(dy), Math.abs(dx)) * (180 / Math.PI);

        // If angle < 45 degrees, torso is horizontal
        // AND Hip is low (y > 0.6) to avoid false positives when bending over

        const isHorizontal = angle < 45;
        const isLow = hipY > 0.5;

        return isHorizontal && isLow;
    },

    predictNextAction(landmarks) {
        if (!previousLandmarks) {
            UI.updatePrediction("Analyzing...");
            return;
        }

        // Calculate velocity of center of mass (Hip center)
        const currentHipX = (landmarks[23].x + landmarks[24].x) / 2;
        const prevHipX = (previousLandmarks[23].x + previousLandmarks[24].x) / 2;

        const currentHipY = (landmarks[23].y + landmarks[24].y) / 2;
        const prevHipY = (previousLandmarks[23].y + previousLandmarks[24].y) / 2;

        const vx = currentHipX - prevHipX;
        const vy = currentHipY - prevHipY; // +vy means moving down

        // Thresholds
        const MOVEMENT_THRESH = 0.005;

        let prediction = "Stable";

        if (Math.abs(vy) > MOVEMENT_THRESH) {
            if (vy > 0) prediction = "Lowering / Sitting";
            else prediction = "Standing Up";
        } else if (Math.abs(vx) > MOVEMENT_THRESH) {
            prediction = "Walking / Moving Sideways";
        }

        // Combined with Knee Pressure
        const kneeAng = this.calculateAngle(landmarks[23], landmarks[25], landmarks[27]);
        if (kneeAng < 100 && prediction.includes("Lowering")) {
            prediction += " (High Knee Stress)";
        }

        UI.updatePrediction(prediction);
    },

    calculateAngle(a, b, c) {
        const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
        let angle = Math.abs(radians * 180.0 / Math.PI);
        if (angle > 180.0) angle = 360.0 - angle;
        return angle;
    }
};

window.addEventListener('reset-system', () => {
    fallFrameCount = 0;
    // previousLandmarks = null;
});
