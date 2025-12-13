/**
 * UI Module
 * Handles all DOM updates and user feedback.
 */

export const UI = {
    elements: {
        video: document.getElementById('input-video'),
        canvas: document.getElementById('output-canvas'),
        ctx: document.getElementById('output-canvas').getContext('2d'),
        statusChip: document.getElementById('status-chip'),
        kneeMetric: document.getElementById('knee-metric'),
        kneeBar: document.getElementById('knee-bar'),
        predictionText: document.getElementById('prediction-text'),
        obstacleAlert: document.getElementById('obstacle-alert'),
        fallOverlay: document.getElementById('fall-overlay'),
        threeContainer: document.getElementById('three-container')
    },

    updateStatus(status, type = 'normal') {
        const chip = this.elements.statusChip;
        // Reset classes
        chip.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors';

        if (type === 'error') {
            chip.classList.add('bg-red-100', 'text-red-700');
            chip.innerHTML = `<span class="material-symbols-outlined text-sm font-bold">warning</span> ${status}`;
        } else if (type === 'warning') {
            chip.classList.add('bg-yellow-100', 'text-yellow-800');
            chip.innerHTML = `<span class="material-symbols-outlined text-sm font-bold">info</span> ${status}`;
        } else {
            chip.classList.add('bg-green-100', 'text-green-700');
            chip.innerHTML = `<span class="material-symbols-outlined text-sm font-bold">check_circle</span> ${status}`;
        }
    },

    updateKneePressure(angle) {
        // Angle < 100 is high pressure (red)
        // Angle 100-140 is medium (yellow)
        // Angle > 140 is low (green)

        let colorClass = 'bg-green-500';
        let text = 'Normal';
        let width = '25%'; // Base width

        // Inverted logic: Lower angle = Higher pressure
        // Map 180->0 to 0%->100% (roughly)
        const pressure = Math.max(0, Math.min(100, (180 - angle) / 1.8 * 1.5));
        width = `${Math.max(10, pressure)}%`;

        if (angle < 100) {
            colorClass = 'bg-red-500';
            text = 'Critical Load';
            this.elements.kneeBar.parentElement.classList.add('animate-pulse');
        } else if (angle < 140) {
            colorClass = 'bg-yellow-500';
            text = 'Moderate Load';
            this.elements.kneeBar.parentElement.classList.remove('animate-pulse');
        } else {
            this.elements.kneeBar.parentElement.classList.remove('animate-pulse');
        }

        this.elements.kneeBar.className = `h-full transition-all duration-300 ease-out ${colorClass}`;
        this.elements.kneeBar.style.width = width;
        this.elements.kneeMetric.textContent = `${text} (${Math.round(angle)}°)`;
    },

    showObstacleWarning(show, objectName = 'Obstacle') {
        if (show) {
            this.elements.obstacleAlert.classList.remove('hidden');
            this.elements.obstacleAlert.classList.add('flex');
            this.elements.obstacleAlert.querySelector('span:last-child').textContent = `${objectName} Detected`;
        } else {
            this.elements.obstacleAlert.classList.add('hidden');
            this.elements.obstacleAlert.classList.remove('flex');
        }
    },

    toggleFallOverlay(show) {
        if (show) {
            this.elements.fallOverlay.classList.remove('hidden');
            this.elements.fallOverlay.classList.add('flex');
        } else {
            this.elements.fallOverlay.classList.add('hidden');
            this.elements.fallOverlay.classList.remove('flex');
        }
    },

    updatePrediction(text) {
        this.elements.predictionText.textContent = text;
    },

    // Helper to resize canvas
    resize() {
        this.elements.canvas.width = this.elements.video.videoWidth;
        this.elements.canvas.height = this.elements.video.videoHeight;
    }
};

window.resetSystem = () => {
    UI.toggleFallOverlay(false);
    // Reset other states if needed via event or global
    window.dispatchEvent(new Event('reset-system'));
};
