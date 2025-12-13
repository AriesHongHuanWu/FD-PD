/**
 * Main Application Entry Point
 */
import { UI } from './ui.js';
import { Visualizer } from './visualizer.js';
import { Detectors } from './detectors.js';

async function main() {
    console.log("FallGuard AI Starting...");

    // 1. Initialize Visualizer (Three.js)
    Visualizer.init();

    // 2. Initialize Detectors (AI Models)
    await Detectors.init();

    // 3. Start Camera Setup
    setupCamera();
}

async function setupCamera() {
    const video = UI.elements.video;

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: 1280,
                    height: 720,
                    facingMode: 'user'
                }
            });
            video.srcObject = stream;

            video.onloadedmetadata = () => {
                video.play();
                UI.resize();
                // Start Processing Loop
                requestAnimationFrame(loop);
            };
        } catch (err) {
            console.error("Camera Error:", err);
            UI.updateStatus("Camera Access Denied", "error");
        }
    }
}

async function loop() {
    const video = UI.elements.video;

    if (video.readyState >= 2) { // HAVE_CURRENT_DATA
        await Detectors.processFrame(video);
    }

    requestAnimationFrame(loop);
}

// Start
document.addEventListener('DOMContentLoaded', main);
window.addEventListener('resize', () => UI.resize());
