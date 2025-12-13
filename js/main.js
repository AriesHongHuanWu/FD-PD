
// js/main.js
import { VisionSystem } from './vision.js';
import { Analyzer } from './analysis.js';
import { Visualizer } from './visualizer.js';

class App {
    constructor() {
        this.video = document.getElementById('input-video');
        this.canvas = document.getElementById('output-canvas');
        this.threeContainer = document.getElementById('three-container');

        // UI Elements
        this.fpsDisplay = document.getElementById('fps-display');
        this.statusDisplay = document.getElementById('main-status');
        this.statusIndicator = document.getElementById('status-indicator');
        this.kneeValue = document.getElementById('knee-val');
        this.kneeBarLeft = document.getElementById('knee-bar-left');
        this.kneeBarRight = document.getElementById('knee-bar-right');
        this.predAction = document.getElementById('pred-action');
        this.objCount = document.getElementById('obj-count');
        this.obsList = document.getElementById('obstacle-list');
        this.alertBox = document.getElementById('danger-alert');
        this.alertText = document.getElementById('alert-text');

        this.vis = new Visualizer(this.canvas, this.canvas.getContext('2d'), this.threeContainer);
        this.analyzer = new Analyzer();
        this.vision = new VisionSystem(this.video, this.canvas, this.onFrame.bind(this));

        // Mobile Handling
        this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

        this.init();
    }

    async init() {
        console.log("Initializing App...");
        await this.vision.initialize();
        console.log("App Ready");
    }

    onFrame(data) {
        // 1. Analyze
        const result = this.analyzer.analyze(data.poseLandmarks, data.obstacles);

        // 2. Visualize
        this.vis.draw(data.image, data.poseLandmarks, data.poseWorldLandmarks, data.obstacles, result);

        // 3. Update UI
        this.fpsDisplay.textContent = data.fps;

        if (result) {
            this.updateUI(result);
        }
    }

    updateUI(result) {
        // Status & Alert
        if (result.fall) {
            this.triggerAlert("FALL DETECTED");
            this.statusDisplay.innerHTML = 'DANGER <span class="material-symbols-rounded text-red-500">warning</span>';
            this.statusIndicator.className = 'w-12 h-12 rounded-full bg-red-100 flex items-center justify-center animate-pulse-strong';
            this.statusIndicator.innerHTML = '<span class="material-symbols-rounded text-red-600 text-2xl">warning</span>';
        } else {
            this.hideAlert();
            this.statusDisplay.innerHTML = 'Secure <span class="material-symbols-rounded text-green-500">check_circle</span>';
            this.statusIndicator.className = 'w-12 h-12 rounded-full bg-green-50 flex items-center justify-center';
            this.statusIndicator.innerHTML = '<span class="material-symbols-rounded text-green-600 text-2xl">shield</span>';
        }

        // Knees
        const maxKneeLoad = Math.max(result.leftKnee.load, result.rightKnee.load);
        this.kneeValue.textContent = `${maxKneeLoad}%`;

        // Update Bars (Left moves left, Right moves right from center?)
        // Actually our CSS was absolute left/right.
        // Let's just make them fill up.
        this.kneeBarLeft.style.width = `${result.leftKnee.load / 2}%`; // Max 50% width
        this.kneeBarRight.style.width = `${result.rightKnee.load / 2}%`;

        if (maxKneeLoad > 80) {
            this.kneeBarLeft.classList.replace('bg-google-green', 'bg-google-red');
            this.kneeBarRight.classList.replace('bg-google-green', 'bg-google-red');
            this.kneeValue.classList.add('text-red-500');
        } else {
            this.kneeBarLeft.classList.replace('bg-google-red', 'bg-google-green');
            this.kneeBarRight.classList.replace('bg-google-red', 'bg-google-green');
            this.kneeValue.classList.remove('text-red-500');
        }

        // Prediction
        this.predAction.textContent = result.prediction;

        // Obstacles
        this.objCount.textContent = `${result.obstacles.count} DETECTED`;
        if (result.obstacles.count > 0) {
            this.objCount.classList.replace('bg-gray-200', 'bg-yellow-100');
            this.objCount.classList.replace('text-gray-600', 'text-yellow-800');

            // Check if ANY obstacle is close to feet (roughly by bounding box y)
            // Simplified: If object is found, list it.
            const names = result.obstacles.items.map(i => i.class).join(', ');
            this.obsList.textContent = `Caution: ${names}`;
        } else {
            this.objCount.classList.replace('bg-yellow-100', 'bg-gray-200');
            this.objCount.classList.replace('text-yellow-800', 'text-gray-600');
            this.obsList.textContent = 'Path Clear';
        }
    }

    triggerAlert(msg) {
        this.alertText.textContent = msg;
        this.alertBox.classList.remove('opacity-0');
        document.body.classList.add('bg-red-50');
    }

    hideAlert() {
        this.alertBox.classList.add('opacity-0');
        document.body.classList.remove('bg-red-50');
    }
}

// Start
window.addEventListener('DOMContentLoaded', () => {
    new App();
});
