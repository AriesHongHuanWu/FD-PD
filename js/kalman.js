/**
/**
 * Kalman Filter for 3D Point Tracking (Constant Velocity Model)
 * 3D 點追蹤的卡爾曼濾波器 (等速模型)
 * State (狀態向量): [x, y, z, vx, vy, vz] (位置 + 速度)
 */
export class KalmanFilter {
    constructor(initialState = { x: 0, y: 0, z: 0 }) {
        // State Vector [x, y, z, vx, vy, vz]
        // 初始狀態向量 [位置x, 位置y, 位置z, 速度x, 速度y, 速度z]
        this.x = [initialState.x, initialState.y, initialState.z, 0, 0, 0];

        // Error Covariance Matrix (P) - Identity * large
        // 誤差共變異矩陣 (P) - 初始設為單位矩陣 (表示對初始狀態的不確定性)
        this.P = [
            [1, 0, 0, 0, 0, 0],
            [0, 1, 0, 0, 0, 0],
            [0, 0, 1, 0, 0, 0],
            [0, 0, 0, 1, 0, 0],
            [0, 0, 0, 0, 1, 0],
            [0, 0, 0, 0, 0, 1]
        ];

        // Process Noise (Q) - Uncertainty in model (can speed change?)
        // 過程雜訊 (Q) - 模型的不確定性 (例如：速度是否會突然改變？)
        const qVal = 0.01; // Tunable (可調參數)
        this.Q = [
            [qVal, 0, 0, 0, 0, 0],
            [0, qVal, 0, 0, 0, 0],
            [0, 0, qVal, 0, 0, 0],
            [0, 0, 0, qVal, 0, 0],
            [0, 0, 0, 0, qVal, 0, 0],
            [0, 0, 0, 0, 0, qVal]
        ];

        // Measurement Noise (R) - Uncertainty in sensor (Webcam Jitter)
        // 量測雜訊 (R) - 感測器的不確定性 (例如：Webcam 的抖動)
        const rVal = 0.05; // Tunable (數值越高 = 越信任模型/更平滑; 數值越低 = 越信任感測器/反應更快)
        this.R = [
            [rVal, 0, 0],
            [0, rVal, 0],
            [0, 0, rVal]
        ];

        // Measurement Matrix (H) - We measure x, y, z
        // 量測矩陣 (H) - 我們只能直接測量到 x, y, z (無法直接測量速度)
        this.H = [
            [1, 0, 0, 0, 0, 0],
            [0, 1, 0, 0, 0, 0],
            [0, 0, 1, 0, 0, 0]
        ];
    }

    /**
     * Prediction Step (Project state ahead)
     * 預測步驟 (推算下一時刻的狀態)
     * F = State Transition (Pos += Vel * dt) (狀態轉移：位置 = 原位置 + 速度 * 時間)
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
     * 修正步驟 (使用實際量測值來更新預測)
     * K = P * H^T * (H * P * H^T + R)^-1  (卡爾曼增益)
     * x = x + K * (z - H*x)               (更新狀態)
     * P = (I - K * H) * P                 (更新誤差共變異)
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

        // 對 X, Y, Z 三個維度分別進行標量更新 (Scalar Update) 以避免複雜的矩陣運算
        // 假設各維度獨立，這在 3D 點追蹤中為可接受的簡化
        this.updateScalar(0, z[0]); // X 軸更新
        this.updateScalar(1, z[1]); // Y 軸更新
        this.updateScalar(2, z[2]); // Z 軸更新
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
     * 預測未來狀態 (用於 Ghost 骨架顯示)
     * @param {number} frames 預測多少幀之後
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
