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

// Environmental Context
let seatObjects = []; // { bbox: [x, y, w, h], class: str, bottomY: float }
let leftFootStabilityTimer = 0;
let rightFootStabilityTimer = 0;

const FALL_TRIGGER_FRAMES = 60; // ~2 seconds @ 30fps
const STABILITY_FRAMES = 10; // ~0.3s to confirm "Stable Step"
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
                    UI.updateStatus('Camera Blocked / Too Close', 'warning');
                    // Safety Gate: Force Safe Metrics
                    UI.updateTelemetry({ risk: 0, stability: 100, envRisk: 0, spine: 'Unknown' });
                }
            } else {
                lowVisibilityFrameCount = 0;
                UI.updateStatus('Active', 'success');
            }

            this.analyzePose(results.poseLandmarks, results.poseWorldLandmarks, visibility);
        } else {
            lowVisibilityFrameCount++;
            // Reset metrics if no person
            UI.updateTelemetry({ risk: 0, stability: 0, envRisk: 0, spine: 'Good' });
            fallFrameCount = 0; // Reset fall timer if person lost
        }

        const isFalling = fallFrameCount >= FALL_TRIGGER_FRAMES;
        Visualizer.update3D(results.poseWorldLandmarks, isFalling, false);
    },

    checkVisibility(landmarks) {
        const indices = [11, 12, 23, 24, 25, 26, 27, 28]; // Shoulders + Lower body
        let totalVis = 0;
        indices.forEach(i => totalVis += landmarks[i].visibility);
        return totalVis / indices.length;
    },

    analyzePose(landmarks, worldLandmarks, visibility) {
        // Strict Visibility Gate
        if (visibility < VISIBILITY_THRESHOLD) {
            // Do not analyze if visibility is poor to avoid false positives
            return;
        }

        // 1. Hand Support
        const handSupport = this.checkHandSupport(landmarks);
        UI.toggleHandSupport(handSupport);

        // 2. Knee Pressure (Dual Logic)
        // Use World Landmarks (3D) for alignment-invariant angle
        const leftKneeAngle = this.calculateAngle(worldLandmarks[23], worldLandmarks[25], worldLandmarks[27]);
        const rightKneeAngle = this.calculateAngle(worldLandmarks[24], worldLandmarks[26], worldLandmarks[28]);

        // Detect Grounded Feet (Dynamic Logic)
        // Previous fixed threshold fails if camera is far/close.
        // Solution: Use Shin Length (Knee to Ankle distance) as a dynamic ruler.

        // Calculate Shin Lengths (Euclidean distance)
        const getDist = (i1, i2) => Math.hypot(landmarks[i1].x - landmarks[i2].x, landmarks[i1].y - landmarks[i2].y);
        const leftShin = getDist(25, 27);
        const rightShin = getDist(26, 28);
        const avgShin = (leftShin + rightShin) / 2;

        // Ground Level is the lowest ankle point
        const leftAnkleY = landmarks[27].y;
        const rightAnkleY = landmarks[28].y;
        const groundLevel = Math.max(leftAnkleY, rightAnkleY);

        // Threshold is 30% of average shin length (adaptive to zoom/distance)
        const DYNAMIC_THRESHOLD = avgShin * 0.3;

        // 2a. Climbing/Stepping Logic (Stable Elevated Foot Heuristic)
        // If a foot is NOT grounded (lifted) but is STATIONARY, it's likely on a step/box.

        const checkFootStability = (footIndex, timer) => {
            // Velocity check
            const curr = landmarks[footIndex];
            const prev = previousLandmarks ? previousLandmarks[footIndex] : curr;
            const vel = Math.hypot(curr.x - prev.x, curr.y - prev.y);

            if (vel < 0.002) return timer + 1; // Very stable
            return 0; // Moving
        };

        leftFootStabilityTimer = checkFootStability(27, leftFootStabilityTimer);
        rightFootStabilityTimer = checkFootStability(28, rightFootStabilityTimer);

        const isLeftSupported = isLeftGrounded || (leftFootStabilityTimer > STABILITY_FRAMES);
        const isRightSupported = isRightGrounded || (rightFootStabilityTimer > STABILITY_FRAMES);

        // 2b. Sitting Detection (Object Overlap + Depth Check)
        let isSitting = false;
        if (seatObjects.length > 0) {
            const hipX = (landmarks[23].x + landmarks[24].x) / 2;
            const hipY = (landmarks[23].y + landmarks[24].y) / 2;
            const feetY = groundLevel; // Furthest down point of user

            for (const seat of seatObjects) {
                // 2D Overlap: Hip inside box
                const inBox = hipX > seat.bbox.x && hipX < (seat.bbox.x + seat.bbox.w) &&
                    hipY > seat.bbox.y && hipY < (seat.bbox.y + seat.bbox.h);

                // Depth Alignment: Seat bottom approx same as Feet bottom?
                // Threshold: 10% of screen height
                const depthMatch = Math.abs(seat.bottomY - feetY) < 0.1;

                if (inBox && depthMatch) {
                    isSitting = true;
                    break;
                }
            }
        }

        if (isSitting) {
            UI.updateStatus('Sitting Detected (Load masked)', 'success');
        }

        // 3. Dynamic Impact Logic (F=ma Proxy)
        const impactFactor = this.calculateImpact(landmarks);

        // UI Updates: 
        // If Sitting: Force 180 (Zero Load).
        // If Supported (Ground or Step): Show Angle.
        // If Air (Unsupported): Force 180.

        let uiLeftAngle = 180;
        let uiRightAngle = 180;

        if (!isSitting) {
            if (isLeftSupported) uiLeftAngle = leftKneeAngle;
            if (isRightSupported) uiRightAngle = rightKneeAngle;
        }

        UI.updateKneePressure(uiLeftAngle, uiRightAngle, impactFactor);

        // 3. New Metrics Calculations
        const stabilityScore = this.calculateStability(landmarks);
        const spineHealth = this.calculateSpineHealth(landmarks);

        // 4. Composite Fall Risk Calculation
        // Calculate effective angle based on LOADED legs only
        let effectiveAngle = 180; // Default safe
        if (isSitting) {
            effectiveAngle = 180; // Safe
        } else {
            if (isLeftSupported && isRightSupported) {
                effectiveAngle = Math.min(leftKneeAngle, rightKneeAngle);
            } else if (isLeftSupported) {
                effectiveAngle = leftKneeAngle;
            } else if (isRightSupported) {
                effectiveAngle = rightKneeAngle;
            }
        }
        // If in air/unsupported, effectiveAngle stays 180 (Safe)
        // If both in air, we default to 180 (Safe) unless Impact Factor is high?
        // Actually impact factor is separate multiplier in UI, but for Risk Index:
        // Jumping isn't necessarily "High Pressure" until landing.

        // Hand support modifier
        if (handSupport) effectiveAngle += 30;

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

        // 5. Fall Detection (Requires persistence)
        const isFallen = this.checkFall(landmarks);

        // Require strictly high risk OR geometric fall for sustained time
        if (isFallen || riskIndex >= 95) {
            fallFrameCount++;
            if (fallFrameCount === FALL_TRIGGER_FRAMES) { // Trigger AFTER ~2 seconds
                Logger.add('error', 'FALL DETECTED', `Risk: ${Math.round(riskIndex)}%`);
                UI.toggleFallOverlay(true);
            }
        } else {
            // Decay frame count slowly instead of instant reset to handle flicker? 
            // Or instant reset for strictness? Instant is better for ensuring 2s CONTINUOUS fall.
            fallFrameCount = 0;
        }

        this.predictNextAction(landmarks);

        previousLandmarks = landmarks;
        lastPoseTime = Date.now();
    },

    calculateImpact(landmarks) {
        if (!previousLandmarks) return 1.0;

        // Hip Center Velocity Y
        const currentHipY = (landmarks[23].y + landmarks[24].y) / 2;
        const prevHipY = (previousLandmarks[23].y + previousLandmarks[24].y) / 2;

        // Positive dy = Moving Downwards
        const dy = currentHipY - prevHipY;

        // Thresholds for "Impact"
        // Normal walking dy ~ 0.005
        // Jump landing dy ~ 0.02 - 0.05

        if (dy > 0.015) { // Fast downward movement
            // Amplify factor based on speed
            // Map 0.015 -> 1.0, 0.05 -> 2.0
            return 1.0 + ((dy - 0.015) * 30);
        }

        return 1.0;
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

        seatObjects = []; // Reset for this frame

        predictions.forEach(pred => {
            // Normalize bbox to 0-1
            const bx = pred.bbox[0] / width;
            const by = pred.bbox[1] / height;
            const bw = pred.bbox[2] / width;
            const bh = pred.bbox[3] / height;
            const bottomY = by + bh;

            // Track Seats
            if (['chair', 'couch', 'bench', 'bed'].includes(pred.class)) {
                seatObjects.push({
                    bbox: { x: bx, y: by, w: bw, h: bh },
                    bottomY: bottomY,
                    class: pred.class
                });
                return; // Don't treat seats as instantaneous tripping hazards (maybe?)
                // Actually, if you trip on a chair it IS a hazard.
                // But specifically for 'Sitting vs Hazard', let's separate.
            }

            if (pred.class === 'person') return;

            // Standard Obstacle Logic
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

        // Use 3D vector calculation if z is available (World Landmarks)
        // Cosine Rule: C^2 = A^2 + B^2 - 2AB*cos(gamma)
        // Vector approach: dot(BA, BC) / (|BA| * |BC|)

        const v1 = { x: a.x - b.x, y: a.y - b.y, z: (a.z || 0) - (b.z || 0) };
        const v2 = { x: c.x - b.x, y: c.y - b.y, z: (c.z || 0) - (b.z || 0) };

        const dot = (v1.x * v2.x) + (v1.y * v2.y) + (v1.z * v2.z);
        const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y + v1.z * v1.z);
        const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y + v2.z * v2.z);

        if (mag1 * mag2 === 0) return 180;

        let angleRad = Math.acos(dot / (mag1 * mag2));
        return angleRad * (180.0 / Math.PI);
    }
};

window.addEventListener('reset-system', () => {
    fallFrameCount = 0;
    Logger.add('info', 'System Reset', 'User cleared alarms');
});
