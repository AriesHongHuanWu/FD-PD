/**
 * Biomechanics Engine
 * Handles physics calculations, risk assessment, and user calibration.
 */

export class BiomechanicsEngine {
    constructor() {
        this.isCalibrating = false;
        this.isCalibrated = false;
        this.calibrationData = [];
        this.baseline = {
            limbLength: 1.0, // Normalizing factor
            neutralValgus: 0
        };

        // Velocity tracking
        this.lastFrameTime = 0;
        this.lastFlexion = 0;
    }

    /**
     * Start the calibration phase
     */
    startCalibration() {
        this.isCalibrating = true;
        this.calibrationData = [];
        console.log("Starting Calibration...");
    }

    /**
     * Finalize calibration by averaging captured data
     */
    finishCalibration() {
        this.isCalibrating = false;
        if (this.calibrationData.length === 0) return;

        // Calculate averages
        const avgLength = this.calibrationData.reduce((a, b) => a + b.length, 0) / this.calibrationData.length;
        this.baseline.limbLength = avgLength;
        this.isCalibrated = true;
        console.log("Calibration Complete. Baseline:", this.baseline);
    }

    /**
     * Main analysis loop for a single frame
     * @param {Object} landmarks - MediaPipe 3D/2D landmarks
     * @param {number} timestamp - Current timestamp in ms
     */
    analyze(landmarks, timestamp) {
        if (!landmarks) return null;

        // Key Points (MediaPipe indices: 23=L_Hip, 25=L_Knee, 27=L_Ankle) 
        // We'll focus on Left Leg for demo, can be expanded to both.
        const hip = landmarks[23];
        const knee = landmarks[25];
        const ankle = landmarks[27];

        if (!hip || !knee || !ankle) return null;

        // 1. Calculate Metrics
        const flexion = this.calculateFlexionAngle(hip, knee, ankle);
        const valgus = this.calculateValgusDeviation(hip, knee, ankle);

        // 2. Velocity (Angular Velocity of Flexion)
        const dt = (timestamp - this.lastFrameTime) / 1000; // seconds
        let velocity = 0;
        if (dt > 0 && this.lastFrameTime !== 0) {
            velocity = Math.abs((flexion - this.lastFlexion) / dt);
        }

        this.lastFrameTime = timestamp;
        this.lastFlexion = flexion;

        // 3. Calibration Handling
        if (this.isCalibrating) {
            // Store leg length (Hip to Ankle direct) as a proxy for size
            const distinctLength = this.dist(hip, knee) + this.dist(knee, ankle);
            this.calibrationData.push({ length: distinctLength });
            return { status: "CALIBRATING", progress: this.calibrationData.length };
        }

        // 4. Normalization (The "Human-Centric" Adaptation)
        // Adjust logic based on baseline size if needed, currently used for load scaling
        // Normalized Load = (Stress / Baseline)

        // 5. Risk Logic
        const risk = this.assessRisk(flexion, valgus, velocity);

        return {
            flexion,
            valgus,
            velocity,
            risk,
            isCalibrated: this.isCalibrated
        };
    }

    assessRisk(flexion, valgus, velocity) {
        // Thresholds
        const FLEXION_Threshold = 70; // Degrees
        const VELOCITY_Threshold = 100; // Deg/s
        const VALGUS_Threshold = 10; // Degrees deviation

        // Status Determination
        if (flexion > FLEXION_Threshold && velocity > VELOCITY_Threshold) {
            return { lev: "CRITICAL", color: "#EA4335", msg: "CRITICAL STRESS" }; // Google Red
        } else if (flexion > FLEXION_Threshold || velocity > VELOCITY_Threshold * 0.8) {
            return { lev: "LOAD", color: "#FBBC05", msg: "High Load" }; // Google Yellow
        } else if (valgus > VALGUS_Threshold) {
            return { lev: "WARNING", color: "#FBBC05", msg: "Knee Valgus!" };
        } else {
            return { lev: "OPTIMAL", color: "#34A853", msg: "Optimal" }; // Google Green
        }
    }

    // --- Math Utils ---

    calculateFlexionAngle(a, b, c) {
        // Vector BA and BC
        const BA = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
        const BC = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };

        // Dot product
        const dot = (BA.x * BC.x) + (BA.y * BC.y) + (BA.z * BC.z);

        // Magnitudes
        const magBA = Math.sqrt(BA.x ** 2 + BA.y ** 2 + BA.z ** 2);
        const magBC = Math.sqrt(BC.x ** 2 + BC.y ** 2 + BC.z ** 2);

        // Angle in radians
        const rad = Math.acos(dot / (magBA * magBC));

        // Convert to degrees (180 - result because flexion is typically 0 at standing)
        return 180 - (rad * (180 / Math.PI));
    }

    calculateValgusDeviation(hip, knee, ankle) {
        // Simplified frontal plane projection (X-axis deviation)
        // Calculate the expected knee X based on line from Hip to Ankle
        const slope = (ankle.y - hip.y) === 0 ? 0 : (ankle.x - hip.x) / (ankle.y - hip.y);
        const expectedKneeX = hip.x + (knee.y - hip.y) * slope;

        // Difference
        const diff = Math.abs(knee.x - expectedKneeX);

        // Normalize roughly to degrees for visualization (approximation)
        return diff * 100; // Arbitrary scale for demo
    }

    dist(a, b) {
        return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
    }
}
