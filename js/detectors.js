/**
 * Detectors Module
 * 偵測器模組
 * Handles AI Logic: Pose, Object Detection, Knee Analysis, Predictions, Probability Metrics
 * 處理 AI 邏輯：姿態偵測、物件偵測、膝蓋分析、預測、機率指標
 */
import { UI } from './ui.js';
import { Visualizer } from './visualizer.js';
import { Logger } from './logging.js';
import { KalmanFilter } from './kalman.js';

let poseDetector;
let objectDetector;
let isSystemActive = true;

// State
let lastPoseTime = 0;
let previousLandmarks = null;
let previousVelocityY = 0;
let fallFrameCount = 0;
let lowVisibilityFrameCount = 0;

let kalmanFilters = []; // Array of 33 KalmanFilters

let currentEnvRisk = 0;

// Environmental Context
// 環境上下文
let seatObjects = []; // { bbox: [x, y, w, h], class: str, bottomY: float } (坐具物件)
let leftFootStabilityTimer = 0; // 左腳穩定計時器
let rightFootStabilityTimer = 0; // 右腳穩定計時器

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
        // 處理每一幀影像
        if (!isSystemActive) return;

        await poseDetector.send({ image: videoElement });

        if (objectDetector && videoElement.readyState === 4 && lowVisibilityFrameCount < 10) {
            // Run object detection less frequently to check environment hazard level
            // 降低物件偵測頻率以檢查環境危害等級 (為了效能)
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
        // 1. Get UI Toggle States
        // 1. 取得 UI 開關狀態
        const showReal = document.getElementById('toggle-real-skeleton')?.checked ?? true;
        const showGhost = document.getElementById('toggle-ghost-skeleton')?.checked ?? false;

        // 2. Kalman Filter Process
        // 2. 卡爾曼濾波處理 (平滑化骨架)
        let predictedLandmarks = null;

        if (results.poseLandmarks) {
            // Initialize Filters if needed
            if (kalmanFilters.length === 0) {
                results.poseLandmarks.forEach(lm => {
                    kalmanFilters.push(new KalmanFilter(lm));
                });
            }

            // Predict & Update Steps
            predictedLandmarks = results.poseLandmarks.map((lm, i) => {
                const filter = kalmanFilters[i];

                // 1. Predict (Project State)
                filter.predict();

                // 2. Update (Correct with Measurement)
                filter.update(lm);

                // 3. Forecast (15 frames ahead for Ghost)
                if (showGhost) {
                    // Clone result to avoid mutating filter state
                    const future = filter.forecast(15);
                    future.visibility = lm.visibility; // Copy visibility
                    return future;
                }
                return null;
            });
        }

        // 3. Update Visualizer (Pass all data)
        Visualizer.update2D(results, predictedLandmarks, showReal, showGhost);

        if (results.poseLandmarks) {
            const visibility = this.checkVisibility(results.poseLandmarks);

            if (visibility < VISIBILITY_THRESHOLD) {
                lowVisibilityFrameCount++;
                if (lowVisibilityFrameCount > 5) {
                    UI.updateStatus('Camera Blocked / Too Close', 'warning');
                    UI.updateTelemetry({ risk: 0, stability: 100, envRisk: 0, spine: 'Unknown' });
                }
            } else {
                lowVisibilityFrameCount = 0;
                UI.updateStatus('Active', 'success');
            }

            this.analyzePose(results.poseLandmarks, results.poseWorldLandmarks, visibility);
        } else {
            lowVisibilityFrameCount++;
            UI.updateTelemetry({ risk: 0, stability: 0, envRisk: 0, spine: 'Good' });
            fallFrameCount = 0;
        }

        const isFalling = fallFrameCount >= FALL_TRIGGER_FRAMES;
        Visualizer.update3D(results.poseWorldLandmarks, isFalling, false);

        previousLandmarks = results.poseLandmarks; // Keep for other logic if needed, though KF handles history
        // 保存當前 landmarks 供下一幀比較 (KF 也有處理歷史，但這裡用於簡單的速度計算)
        lastPoseTime = Date.now();
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
            return;
        }

        // 1. Hand Support
        const handSupport = this.checkHandSupport(landmarks);
        UI.toggleHandSupport(handSupport);

        // 2. Knee Pressure (Dual Logic)
        // 2. 膝蓋壓力 (雙重邏輯)
        // Use World Landmarks (3D) for alignment-invariant angle
        // 使用世界座標 (3D) 來計算不受視角影響的真實角度
        const leftKneeAngle = this.calculateAngle(worldLandmarks[23], worldLandmarks[25], worldLandmarks[27]);
        const rightKneeAngle = this.calculateAngle(worldLandmarks[24], worldLandmarks[26], worldLandmarks[28]);

        // Detect Grounded Feet (Dynamic Logic)
        const getDist = (i1, i2) => Math.hypot(landmarks[i1].x - landmarks[i2].x, landmarks[i1].y - landmarks[i2].y);
        const leftShin = getDist(25, 27);
        const rightShin = getDist(26, 28);
        const avgShin = (leftShin + rightShin) / 2;

        const leftAnkleY = landmarks[27].y;
        const rightAnkleY = landmarks[28].y;
        const groundLevel = Math.max(leftAnkleY, rightAnkleY);

        // Threshold is 30% of average shin length
        const DYNAMIC_THRESHOLD = avgShin * 0.3;

        const isLeftGrounded = leftAnkleY > (groundLevel - DYNAMIC_THRESHOLD);
        const isRightGrounded = rightAnkleY > (groundLevel - DYNAMIC_THRESHOLD);

        // 2a. Climbing/Stepping Logic
        const checkFootStability = (footIndex, timer) => {
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

        // 2b. Sitting Detection
        let isSitting = false;
        if (seatObjects.length > 0) {
            const hipX = (landmarks[23].x + landmarks[24].x) / 2;
            const hipY = (landmarks[23].y + landmarks[24].y) / 2;
            const feetY = groundLevel;

            for (const seat of seatObjects) {
                const inBox = hipX > seat.bbox.x && hipX < (seat.bbox.x + seat.bbox.w) &&
                    hipY > seat.bbox.y && hipY < (seat.bbox.y + seat.bbox.h);
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

        // 3. Dynamic Impact Logic
        const impactFactor = this.calculateImpact(landmarks);

        let uiLeftAngle = 180;
        let uiRightAngle = 180;

        if (!isSitting) {
            if (isLeftSupported) uiLeftAngle = leftKneeAngle;
            if (isRightSupported) uiRightAngle = rightKneeAngle;
        }

        UI.updateKneePressure(uiLeftAngle, uiRightAngle, impactFactor);

        // 3. New Metrics
        const stabilityScore = this.calculateStability(landmarks);
        const spineHealth = this.calculateSpineHealth(landmarks);

        // 4. Composite Fall Risk
        let effectiveAngle = 180;
        if (isSitting) {
            effectiveAngle = 180;
        } else {
            if (isLeftSupported && isRightSupported) {
                effectiveAngle = Math.min(leftKneeAngle, rightKneeAngle);
            } else if (isLeftSupported) {
                effectiveAngle = leftKneeAngle;
            } else if (isRightSupported) {
                effectiveAngle = rightKneeAngle;
            }
        }

        if (handSupport) effectiveAngle += 30;

        const kneeRisk = Math.max(0, (140 - effectiveAngle));
        const stabilityRisk = 100 - stabilityScore;
        const envRisk = currentEnvRisk * 100;

        let riskIndex = (kneeRisk * 0.3) + (stabilityRisk * 0.4) + (envRisk * 0.2);

        if (this.checkFreefall(landmarks)) riskIndex = 100;
        if (spineHealth === 'Poor') riskIndex += 10;

        riskIndex = Math.min(100, Math.max(0, riskIndex));

        UI.updateTelemetry({
            risk: riskIndex,
            stability: stabilityScore,
            envRisk: currentEnvRisk * 100,
            spine: spineHealth
        });

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
    },

    calculateImpact(landmarks) {
        if (!previousLandmarks) return 1.0;
        const currentHipY = (landmarks[23].y + landmarks[24].y) / 2;
        const prevHipY = (previousLandmarks[23].y + previousLandmarks[24].y) / 2;
        const dy = currentHipY - prevHipY;
        if (dy > 0.015) {
            return 1.0 + ((dy - 0.015) * 30);
        }
        return 1.0;
    },

    calculateStability(landmarks) {
        const hipX = (landmarks[23].x + landmarks[24].x) / 2;
        const ankleX = (landmarks[27].x + landmarks[28].x) / 2;
        const deviation = Math.abs(hipX - ankleX);
        const score = Math.max(0, 100 - (deviation * 500));
        return score;
    },

    calculateSpineHealth(landmarks) {
        const shoulderX = (landmarks[11].x + landmarks[12].x) / 2;
        const shoulderY = (landmarks[11].y + landmarks[12].y) / 2;
        const hipX = (landmarks[23].x + landmarks[24].x) / 2;
        const hipY = (landmarks[23].y + landmarks[24].y) / 2;
        const dx = shoulderX - hipX;
        const dy = shoulderY - hipY;
        const angleRad = Math.atan2(dx, dy);
        const angleDeg = Math.abs(angleRad * 180 / Math.PI);
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

        seatObjects = [];

        predictions.forEach(pred => {
            const bx = pred.bbox[0] / width;
            const by = pred.bbox[1] / height;
            const bw = pred.bbox[2] / width;
            const bh = pred.bbox[3] / height;
            const bottomY = by + bh;

            if (['chair', 'couch', 'bench', 'bed'].includes(pred.class)) {
                seatObjects.push({
                    bbox: { x: bx, y: by, w: bw, h: bh },
                    bottomY: bottomY,
                    class: pred.class
                });
                return;
            }

            if (pred.class === 'person') return;

            const boxCenter = { x: bx + bw / 2, y: by + bh / 2 };
            const dist = Math.hypot(boxCenter.x - feetX, boxCenter.y - feetY);

            if (dist < 0.2 && boxCenter.y > 0.5) {
                obstacleDetected = true;
                obstacleObj = pred;
            }
        });

        currentEnvRisk = obstacleDetected ? 0.8 : 0;
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
        const vy = currentHipY - prevHipY;
        const MOVEMENT_THRESH = 0.005;
        let prediction = "Stable";
        if (Math.abs(vy) > MOVEMENT_THRESH) {
            if (vy > 0) prediction = "Lowering / Sitting";
            else prediction = "Standing Up";
        }
        UI.updatePrediction(prediction);
    },

    calculateAngle(a, b, c) {
        if (!a || !b || !c) return 180;
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
