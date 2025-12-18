/**
 * Main Application Entry Point
 * 主應用程式入口點
 */
import { UI } from './ui.js';
import { Visualizer } from './visualizer.js';
import { Detectors } from './detectors.js';

async function main() {
    console.log("FallGuard AI Starting...");

    // 1. Initialize Visualizer (Three.js)
    // 1. 初始化視覺化模組 (Three.js)
    Visualizer.init();

    // 2. Initialize Detectors (AI Models)
    // 2. 初始化偵測器 (AI 模型)
    await Detectors.init();

    // 3. Start Camera Setup
    // 3. 啟動相機設定
    setupCamera();
}

async function setupCamera() {
    const video = UI.elements.video;

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
            // Try with ideal constraints first, but fall back if needed
            const constraints = {
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                    // Removed facingMode to prevent NotFoundError on desktops
                }
            };

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = stream;

            video.onloadedmetadata = () => {
                video.play();
                UI.resize();
                // Start Processing Loop
                // 開始處理迴圈
                requestAnimationFrame(loop);
            };
        } catch (err) {
            console.error("Camera Error:", err);
            // Fallback: try raw video: true if constraints failed
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                video.srcObject = stream;
                video.onloadedmetadata = () => {
                    video.play();
                    UI.resize();
                    requestAnimationFrame(loop);
                };
            } catch (fallbackErr) {
                console.error("Fallback Camera Error:", fallbackErr);
                UI.updateStatus("Camera Not Found", "error");
            }
        }
    }
}

async function loop() {
    const video = UI.elements.video;

    if (video.readyState >= 2) { // HAVE_CURRENT_DATA
        // 確保影片已有數據
        await Detectors.processFrame(video);
    }

    requestAnimationFrame(loop);
}

// Start
document.addEventListener('DOMContentLoaded', main);
window.addEventListener('resize', () => UI.resize());
