
// js/vision.js
// Handles Camera Input, MediaPipe Pose, and Object Detection

export class VisionSystem {
    constructor(videoElement, canvasElement, onResultsCallback) {
        this.video = videoElement;
        this.canvas = canvasElement;
        this.ctx = canvasElement.getContext('2d');
        this.onResults = onResultsCallback;

        this.pose = null;
        this.cocoModel = null;
        this.isReady = false;

        this.lastFrameTime = 0;
        this.frameCount = 0;
        this.fps = 0;
    }

    async initialize() {
        // 1. Initialize CocoSSD
        console.log('Loading Object Detection...');
        this.cocoModel = await cocoSsd.load();

        // 2. Initialize MediaPipe Pose
        console.log('Loading Pose Model...');
        this.pose = new Pose({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
        });

        this.pose.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        this.pose.onResults(this.handlePoseResults.bind(this));

        // 3. Start Camera
        await this.setupCamera();

        this.isReady = true;
        this.loop();
    }

    async setupCamera() {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 1280, height: 720 }
        });
        this.video.srcObject = stream;

        return new Promise((resolve) => {
            this.video.onloadedmetadata = () => {
                this.video.play();
                this.canvas.width = this.video.videoWidth;
                this.canvas.height = this.video.videoHeight;
                resolve();
            };
        });
    }

    async handlePoseResults(results) {
        // Run Object Detection on the SAME frame
        let obstacles = [];
        if (this.frameCount % 5 === 0 && this.cocoModel) { // Run every 5th frame for performance
            const predictions = await this.cocoModel.detect(this.video);
            // Filter for low-lying objects that could be obstacles
            // Excluding 'person' as that is the user
            obstacles = predictions.filter(p => p.class !== 'person' && p.score > 0.6);
        }

        // Calculate FPS
        const now = performance.now();
        this.fps = 1000 / (now - this.lastFrameTime);
        this.lastFrameTime = now;
        this.frameCount++;

        // Pass everything to the callback
        if (this.onResults) {
            this.onResults({
                image: results.image,
                poseLandmarks: results.poseLandmarks,
                poseWorldLandmarks: results.poseWorldLandmarks,
                obstacles: obstacles,
                fps: Math.round(this.fps)
            });
        }
    }

    async loop() {
        if (!this.video.paused && !this.video.ended) {
            await this.pose.send({ image: this.video });
        }
        requestAnimationFrame(this.loop.bind(this));
    }
}
