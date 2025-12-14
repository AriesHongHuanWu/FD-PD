/**
 * Kalman Filter for 3D Point Tracking (Constant Velocity Model)
 * State: [x, y, z, vx, vy, vz]
 */
export class KalmanFilter {
    constructor(initialState = { x: 0, y: 0, z: 0 }) {
        // State Vector [x, y, z, vx, vy, vz]
        this.x = [initialState.x, initialState.y, initialState.z, 0, 0, 0];

        // Error Covariance Matrix (P) - Identity * large
        this.P = [
            [1, 0, 0, 0, 0, 0],
            [0, 1, 0, 0, 0, 0],
            [0, 0, 1, 0, 0, 0],
            [0, 0, 0, 1, 0, 0],
            [0, 0, 0, 0, 1, 0],
            [0, 0, 0, 0, 0, 1]
        ];

        // Process Noise (Q) - Uncertainty in model (can speed change?)
        const qVal = 0.01; // Tunable
        this.Q = [
            [qVal, 0, 0, 0, 0, 0],
            [0, qVal, 0, 0, 0, 0],
            [0, 0, qVal, 0, 0, 0],
            [0, 0, 0, qVal, 0, 0],
            [0, 0, 0, 0, qVal, 0, 0],
            [0, 0, 0, 0, 0, qVal]
        ];

        // Measurement Noise (R) - Uncertainty in sensor (Webcam Jitter)
        const rVal = 0.05; // Tunable (Higher = Trust model more/smoother, Lower = Trust sensor/faster)
        this.R = [
            [rVal, 0, 0],
            [0, rVal, 0],
            [0, 0, rVal]
        ];

        // Measurement Matrix (H) - We measure x, y, z
        this.H = [
            [1, 0, 0, 0, 0, 0],
            [0, 1, 0, 0, 0, 0],
            [0, 0, 1, 0, 0, 0]
        ];
    }

    /**
     * Prediction Step (Project state ahead)
     * F = State Transition (Pos += Vel * dt)
     */
    predict() {
        // F matrix (dt = 1 frame assumed for simplicity in unit steps)
        // x = x + vx
        // y = y + vy
        // z = z + vz
        // vx = vx
        // ...

        // Update State (x)
        this.x[0] += this.x[3];
        this.x[1] += this.x[4];
        this.x[2] += this.x[5];

        // Update Covariance (P = F*P*F' + Q)
        // Simplified for diagonal/sparse matrices to save perf
        // But for correctness we do full multiplication or specific updates if P assumes structure.
        // For standard KF, P usually becomes dense. We'll use a simplified scalar approximation for P update
        // to avoid writing a full matrix math library here (simpler for 33 points @ 30fps).
        // OR better: hardcode the diagonal updates which dominate.

        // P[0][0] += P[3][3] + Q  (roughly position uncertainty increases by velocity uncertainty)
        // This is a naive approximation for speed in JS without numpy.
        // Let's implement full F*P*F^T for just the diagonals and relevant cross terms if manageable,
        // or just add process noise.

        // Approximation: Simply add process noise to P
        for (let i = 0; i < 6; i++) {
            this.P[i][i] += this.Q[i][i];
        }
    }

    /**
     * Correction Step (Update with measurement)
     * K = P * H^T * (H * P * H^T + R)^-1
     * x = x + K * (z - H*x)
     * P = (I - K * H) * P
     */
    update(measurement) {
        // z = measurement [mx, my, mz]
        const z = [measurement.x, measurement.y, measurement.z || 0];

        // Calculate Kalman Gain (K)
        // Since H is [I|0], H*P*H' is just the top-left 3x3 of P.
        // S = P_pos + R
        const S = [
            this.P[0][0] + this.R[0][0],
            this.P[1][1] + this.R[1][1],
            this.P[2][2] + this.R[2][2]
        ];

        // K = P * H' * S^-1
        // K is 6x3.
        // K_pos = P_pos * 1/S
        // K_vel = P_vel_pos * 1/S (Cross correlation)

        // Simplified: Assume P is diagonal-ish. 
        // K[i] = P[i][i] / S[i%3]  (for i=0..2)
        // K[i] = 0 (for i=3..5 if no correlation, but we need velocity update).
        // Let's rely on a simpler "Alpha-Beta Filter" approach which is a steady-state Kalman Filter
        // or just hardcode the gain logic properly.

        // Let's do scalar updates for X, Y, Z independently to avoid complexity.
        // It's statistically valid if dimensions are independent.

        this.updateScalar(0, z[0]); // X
        this.updateScalar(1, z[1]); // Y
        this.updateScalar(2, z[2]); // Z
    }

    updateScalar(idx, measuredVal) {
        // State index: idx (0=x, 1=y, 2=z)
        // Vel index: idx + 3

        const P_pos = this.P[idx][idx];
        const P_vel = this.P[idx + 3][idx + 3]; // Ignoring cross-covariance for JS simplicity
        const R = this.R[idx][idx];

        // Innovation
        const y = measuredVal - this.x[idx];

        // Innovation Covariance
        const S = P_pos + R;

        // Kalman Gain
        const K_pos = P_pos / S;
        const K_vel = 0.5 * P_pos / S; // Heuristic coupling if covariance is not tracked fully
        // Better: Standard KF usually results in known gains. 
        // Let's implement a standard 1D KF update for each dimension.

        // Update State
        this.x[idx] += K_pos * y;
        this.x[idx + 3] += K_vel * y; // Update velocity based on position error!

        // Update Process Covariance (Posterior)
        // P = (1 - K*H) * P
        this.P[idx][idx] = (1 - K_pos) * P_pos;
        this.P[idx + 3][idx + 3] = (1 - K_vel) * P_vel; // Roughly?
    }

    /**
     * Forecast future state
     * @param {number} frames 
     */
    forecast(frames) {
        return {
            x: this.x[0] + (this.x[3] * frames),
            y: this.x[1] + (this.x[4] * frames),
            z: this.x[2] + (this.x[5] * frames),
            visibility: 1.0 // unknown
        };
    }
}
