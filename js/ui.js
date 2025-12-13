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
        supportIndicator: document.getElementById('support-indicator'),
        eventLog: document.getElementById('event-log-container'),
        obstacleAlert: document.getElementById('obstacle-alert'),
        fallOverlay: document.getElementById('fall-overlay'),
        threeContainer: document.getElementById('three-container'),
        // Telemetry
        riskCircle: document.getElementById('risk-circle'),
        riskValue: document.getElementById('risk-value'),
        riskBadge: document.getElementById('risk-badge'),
        stabilityBar: document.getElementById('stability-bar'),
        stabilityText: document.getElementById('stability-text'),
        envBar: document.getElementById('env-bar'),
        envText: document.getElementById('env-text'),
        spineStatus: document.getElementById('spine-status')
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

    updateTelemetry(data) {
        // data: { risk: 0-100, stability: 0-100, envRisk: 0-100, spine: 'Good'|'Poor' }

        // Update Risk Circle (DashOffset: 226 = 0%, 0 = 100%)
        const offset = 226 - (data.risk / 100 * 226);
        this.elements.riskCircle.style.strokeDashoffset = offset;
        this.elements.riskValue.textContent = `${Math.round(data.risk)}%`;

        // Risk Badge
        const badge = this.elements.riskBadge;
        if (data.risk > 70) {
            badge.className = 'px-3 py-1 rounded-full bg-red-100 text-red-700 text-xs font-bold';
            badge.textContent = 'CRITICAL';
            this.elements.riskCircle.setAttribute('stroke', '#ef4444'); // Red
        } else if (data.risk > 40) {
            badge.className = 'px-3 py-1 rounded-full bg-yellow-100 text-yellow-800 text-xs font-bold';
            badge.textContent = 'WARNING';
            this.elements.riskCircle.setAttribute('stroke', '#f59e0b'); // Yellow
        } else {
            badge.className = 'px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-bold';
            badge.textContent = 'LOW RISK';
            this.elements.riskCircle.setAttribute('stroke', '#22c55e'); // Green
        }

        // Stability
        this.elements.stabilityBar.style.width = `${data.stability}%`;
        this.elements.stabilityText.textContent = `${Math.round(data.stability)}%`;
        this.elements.stabilityBar.className = `h-full transition-all duration-300 ${data.stability < 50 ? 'bg-red-500' : 'bg-blue-500'}`;

        // Environment
        this.elements.envBar.style.width = `${data.envRisk}%`;
        if (data.envRisk === 0) {
            this.elements.envText.textContent = "Safe";
            this.elements.envBar.className = "h-full bg-gray-300";
        } else {
            this.elements.envText.textContent = "Hazard";
            this.elements.envBar.className = "h-full bg-orange-500";
        }

        // Spine
        if (data.spine === 'Poor') {
            this.elements.spineStatus.innerHTML = `<span class="material-symbols-outlined text-red-500 text-base">warning</span> Bad Posture`;
        } else {
            this.elements.spineStatus.innerHTML = `<span class="material-symbols-outlined text-green-500 text-base">straight</span> Good`;
        }
    },

    toggleHandSupport(active) {
        if (active) {
            this.elements.supportIndicator.classList.remove('hidden');
            this.elements.supportIndicator.classList.add('flex');
        } else {
            this.elements.supportIndicator.classList.add('hidden');
            this.elements.supportIndicator.classList.remove('flex');
        }
    },

    addLogEntry(event) {
        const div = document.createElement('div');
        // Type styles
        let colorClass = 'text-gray-600';
        let icon = 'info';

        if (event.type === 'error') { colorClass = 'text-red-600'; icon = 'error'; }
        else if (event.type === 'warning') { colorClass = 'text-yellow-600'; icon = 'warning'; }
        else if (event.type === 'success') { colorClass = 'text-green-600'; icon = 'check_circle'; }

        div.className = 'flex gap-3 items-start p-2 rounded hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0';
        div.innerHTML = `
            <span class="material-symbols-outlined text-sm mt-0.5 ${colorClass}">${icon}</span>
            <div class="flex-1">
                <div class="flex justify-between items-center mb-0.5">
                    <span class="text-xs font-semibold ${colorClass}">${event.type.toUpperCase()}</span>
                    <span class="text-[10px] text-gray-400 font-mono">${event.time}</span>
                </div>
                <p class="text-xs text-gray-700 leading-tight">${event.message}</p>
                ${event.details ? `<div class="text-[10px] text-gray-400 mt-1 pl-2 border-l-2 border-gray-200">${event.details}</div>` : ''}
            </div>
        `;

        this.elements.eventLog.prepend(div);
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
