/**
 * UI Module
 * 使用者介面模組
 * Handles all DOM updates and user feedback.
 * 負責所有 DOM 更新與使用者回饋。
 */

export const UI = {
    elements: {
        video: document.getElementById('input-video'),
        canvas: document.getElementById('output-canvas'),
        ctx: document.getElementById('output-canvas').getContext('2d'),
        statusChip: document.getElementById('status-chip'),
        kneeLoadLeftBar: document.getElementById('knee-load-left-bar'),
        kneeLoadRightBar: document.getElementById('knee-load-right-bar'),
        kneeLoadLeftText: document.getElementById('knee-load-left-text'),
        kneeLoadRightText: document.getElementById('knee-load-right-text'),
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

    updateKneePressure(leftAngle, rightAngle, impactFactor = 1.0) {
        // ImpactFactor: Multiply "Pressure" logic. 
        // 衝擊因子：放大「壓力」計算邏輯。
        // Normal pressure (0-100 score based on angle).
        // 正常壓力 (基於角度的 0-100 分數)。
        // If impact > 1.0, pressure score boosts up. 
        // 如果衝擊力 > 1.0，壓力分數會上升。 

        const getBarData = (angle, impact) => {
            // Base pressure from angle (Lower angle = Higher pressure)
            // 基於角度的基礎壓力 (角度越小 = 壓力越大)
            // 180deg = 0 pressure. 90deg = High pressure.
            // 180度 = 0 壓力. 90度 = 高壓力.
            let pressure = Math.max(0, Math.min(100, (180 - angle) / 0.9)); // Scale 180-90 -> 0-100 approx

            // Apply Impact Multiplier (e.g. landing from jump)
            // 套用衝擊加乘 (例如：從跳躍著地)
            pressure *= impact;
            pressure = Math.min(100, pressure);

            let colorClass = 'bg-green-500';
            let text = 'Normal';

            if (pressure > 80) {
                colorClass = 'bg-red-500';
                text = impact > 1.2 ? 'IMPACT!' : 'Critical';
            } else if (pressure > 50) {
                colorClass = 'bg-yellow-500';
                text = 'High Load';
            }

            return { width: `${Math.max(5, pressure)}%`, color: colorClass, text };
        };

        const left = getBarData(leftAngle, impactFactor);
        const right = getBarData(rightAngle, impactFactor);

        // Update Left
        this.elements.kneeLoadLeftBar.className = `h-full transition-all duration-100 ease-out ${left.color}`;
        this.elements.kneeLoadLeftBar.style.width = left.width;
        this.elements.kneeLoadLeftText.textContent = `${left.text} (${Math.round(leftAngle)}°)`;

        // Update Right
        this.elements.kneeLoadRightBar.className = `h-full transition-all duration-100 ease-out ${right.color}`;
        this.elements.kneeLoadRightBar.style.width = right.width;
        this.elements.kneeLoadRightText.textContent = `${right.text} (${Math.round(rightAngle)}°)`;

        // Impact Visual Feedback
        if (impactFactor > 1.5) {
            this.elements.kneeLoadLeftBar.parentElement.parentElement.parentElement.classList.add('animate-pulse');
        } else {
            this.elements.kneeLoadLeftBar.parentElement.parentElement.parentElement.classList.remove('animate-pulse');
        }
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
        // 更新風險圓圈 (DashOffset: 226 代表 0%, 0 代表 100%)
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
