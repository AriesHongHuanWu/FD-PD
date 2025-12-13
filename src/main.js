// MediaPipe loaded via CDN in index.html
const Pose = window.Pose;
const Camera = window.Camera;

import Chart from 'chart.js/auto';
import { BiomechanicsEngine } from './core/biomechanics.js';
import { Visualizer } from './ui/visualizer.js';
import { appState } from './core/state.js';

// --- Initialization ---

const videoElement = document.getElementById('input-video');
const canvasElement = document.getElementById('output-canvas');
const systemStatusPill = document.getElementById('system-status');

// Engines
const engine = new BiomechanicsEngine();
const visualizer = new Visualizer(canvasElement);
let camera = null;

// Chart Setup
const ctxChart = document.getElementById('load-chart').getContext('2d');
const loadChart = new Chart(ctxChart, {
    type: 'line',
    data: {
        labels: [],
        datasets: [{
            label: 'Load Factor',
            data: [],
            borderColor: '#4285F4', // Google Blue
            backgroundColor: 'rgba(66, 133, 244, 0.05)',
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            pointRadius: 0,
            pointHoverRadius: 4
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 }, // Performance optimization
        interaction: { mode: 'nearest', intersect: false },
        scales: {
            y: {
                beginAtZero: true,
                max: 100,
                grid: { color: '#E1E3E1' }, // Material Outline Variant
                ticks: { display: false }
            },
            x: {
                display: false,
                grid: { display: false }
            }
        },
        plugins: {
            legend: { display: false },
            tooltip: { enabled: false }
        }
    }
});

// --- State Subscription ---

appState.subscribe((state) => {
    updateUI(state);
});

// --- MediaPipe Setup ---

function onResults(results) {
    // Resize handling
    if (canvasElement.width !== videoElement.videoWidth) {
        visualizer.resize(videoElement.videoWidth, videoElement.videoHeight);
    }

    // Clear & Draw
    visualizer.clear();

    if (!results.poseLandmarks) return;

    // Analyze
    const timestamp = performance.now();
    const analysis = engine.analyze(results.poseLandmarks, timestamp);

    if (analysis) {
        // Update Central State
        appState.updateMetrics({
            flexion: analysis.flexion,
            valgus: analysis.valgus,
            velocity: analysis.velocity
        });

        if (analysis.risk) {
            appState.updateRisk(analysis.risk);
        }

        // Draw Visuals (Visualizer reads from state or passed data? 
        // Passing data is faster for frame-sync)
        visualizer.draw(results.poseLandmarks, analysis);

        // Update Chart
        updateChart(analysis.flexion);
    }
}

const pose = new Pose({
    locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
    }
});

pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

pose.onResults(onResults);

// --- Camera ---

if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    camera = new Camera(videoElement, {
        onFrame: async () => {
            await pose.send({ image: videoElement });
        },
        width: 1280,
        height: 720
    });
    camera.start()
        .then(() => {
            document.getElementById('loading-overlay').classList.add('opacity-0', 'pointer-events-none');
            showSnackbar('Camera Connected');
        })
        .catch(err => {
            console.error(err);
            showSnackbar('Camera Error: Check Permissions', true);
        });
}

// --- UI Logic ---

const calibrateBtn = document.getElementById('calibrate-btn');
calibrateBtn.addEventListener('click', () => {
    if (!appState.state.isCalibrating) {
        engine.startCalibration();
        appState.setCalibration(true);
        showSnackbar('Stand Still for Calibration...');

        setTimeout(() => {
            engine.finishCalibration();
            appState.setCalibrationComplete();
            showSnackbar('Calibration Complete');
        }, 3000);
    }
});

function updateUI(state) {
    // Metrics
    document.getElementById('metric-flexion').innerText = `${Math.round(state.metrics.flexion)}°`;
    document.getElementById('metric-valgus').innerText = `${Math.round(state.metrics.valgus)}°`;
    document.getElementById('metric-velocity').innerText = `${Math.round(state.metrics.velocity)} rad/s`;

    // Status Pill
    const statusPill = document.getElementById('status-pill');
    const statusText = document.getElementById('status-text');
    const statusIndicator = document.getElementById('status-indicator');

    statusText.innerText = state.risk.message;
    statusIndicator.style.backgroundColor = state.risk.color;

    if (state.risk.level === 'CRITICAL') {
        statusPill.classList.add('animate-pulse-fast', 'bg-red-50');
        statusText.classList.add('text-google-red');
    } else {
        statusPill.classList.remove('animate-pulse-fast', 'bg-red-50');
        statusText.classList.remove('text-google-red');
    }

    // Button State
    if (state.isCalibrating) {
        calibrateBtn.innerText = 'Calibrating...';
        calibrateBtn.disabled = true;
        calibrateBtn.classList.add('opacity-75');
    } else {
        calibrateBtn.innerText = state.isCalibrated ? 'Recalibrate' : 'Start Calibration';
        calibrateBtn.disabled = false;
        calibrateBtn.classList.remove('opacity-75');
    }
}

function updateChart(value) {
    loadChart.data.labels.push('');
    loadChart.data.datasets[0].data.push(value);

    if (loadChart.data.labels.length > 50) {
        loadChart.data.labels.shift();
        loadChart.data.datasets[0].data.shift();
    }
    loadChart.update('none');
}

// --- Snackbar System ---

function showSnackbar(message, isError = false) {
    const snackbar = document.getElementById('snackbar');
    snackbar.innerText = message;
    snackbar.className = `fixed bottom-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full text-sm font-medium shadow-md-elevation-3 transition-transform duration-300 transform translate-y-20 opacity-0 ${isError ? 'bg-md-sys-light-error text-md-sys-light-on-error' : 'bg-md-sys-light-on-surface text-md-sys-light-surface'}`;

    // Animate In
    requestAnimationFrame(() => {
        snackbar.classList.remove('translate-y-20', 'opacity-0');
    });

    // Hide after 3s
    setTimeout(() => {
        snackbar.classList.add('translate-y-20', 'opacity-0');
    }, 3000);
}
