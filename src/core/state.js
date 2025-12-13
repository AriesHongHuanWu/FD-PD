/**
 * State Management Module
 * Implements a Pub/Sub pattern for centralized state handling.
 */

class StateManager {
    constructor() {
        // Initial State
        this._state = {
            isCalibrating: false,
            isCalibrated: false,
            metrics: {
                flexion: 0,
                valgus: 0,
                velocity: 0
            },
            risk: {
                level: 'OPTIMAL', // OPTIMAL, LOAD, CRITICAL
                message: 'System Ready',
                color: '#34A853'
            },
            history: [] // Chart data
        };

        this.listeners = new Set();
    }

    /**
     * Get current state (immutable copy recommended but keeping simple for perf)
     */
    get state() {
        return this._state;
    }

    /**
     * Subscribe to state changes
     * @param {Function} callback - Function to call on update
     * @returns {Function} - Unsubscribe function
     */
    subscribe(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    /**
     * Update state and notify listeners
     * @param {Object} partialState - Object to merge into current state
     */
    setState(partialState) {
        this._state = { ...this._state, ...partialState };
        this.notify();
    }

    notify() {
        this.listeners.forEach(callback => callback(this._state));
    }

    // --- Specific Actions ---

    setCalibration(status) {
        this.setState({ isCalibrating: status });
    }

    setCalibrationComplete() {
        this.setState({ isCalibrating: false, isCalibrated: true });
    }

    updateMetrics(metrics) {
        // Only update if changed significantly or strictly every frame?
        // For 60fps, we might want to throttle notifications if no UI change,
        // but for this demo, direct update is fine.
        this.setState({ metrics });
    }

    updateRisk(risk) {
        // Debounce risk changes if needed, but immediate is safer for biofeedback
        if (this._state.risk.level !== risk.lev || this._state.risk.message !== risk.msg) {
            this.setState({
                risk: {
                    level: risk.lev,
                    message: risk.msg,
                    color: risk.color
                }
            });
        }
    }
}

// Export Singleton
export const appState = new StateManager();
