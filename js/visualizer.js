/**
 * Visualizer Module
 * Handles Three.js 3D rendering and 2D Canvas overlays.
 */
import { UI } from './ui.js';

let scene, camera, renderer, controls;
const skeletonPoints = [];
const skeletonLines = [];
let obstacleMesh;

// Standard MediaPipe Pose Connections
const POSE_CONNECTIONS = [
    [11, 12], [11, 23], [12, 24], [23, 24], // Torso
    [11, 13], [13, 15], [12, 14], [14, 16], // Arms
    [23, 25], [25, 27], [24, 26], [26, 28], // Legs
    [27, 29], [28, 30] // Feet
];

// Helper for angle calculation (Duplicate for independent viz logic)
const getAngle = (a, b, c) => {
    if (!a || !b || !c) return 180;
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs(radians * 180.0 / Math.PI);
    if (angle > 180.0) angle = 360.0 - angle;
    return angle;
};

// Custom Drawing Functions (replacing @mediapipe/drawing_utils)
function drawConnectors(ctx, landmarks, connections, style) {
    if (!landmarks) return;
    ctx.strokeStyle = style.color || '#00FF00';
    ctx.lineWidth = style.lineWidth || 2;

    const width = ctx.canvas.width;
    const height = ctx.canvas.height;

    connections.forEach(([i, j]) => {
        const p1 = landmarks[i];
        const p2 = landmarks[j];
        if (p1 && p2 && p1.visibility > 0.5 && p2.visibility > 0.5) {
            ctx.beginPath();
            ctx.moveTo(p1.x * width, p1.y * height);
            ctx.lineTo(p2.x * width, p2.y * height);
            ctx.stroke();
        }
    });
}

function drawLandmarks(ctx, landmarks, style) {
    if (!landmarks) return;
    ctx.fillStyle = style.color || '#FF0000';
    const radius = style.radius || 4;

    const width = ctx.canvas.width;
    const height = ctx.canvas.height;

    landmarks.forEach(lm => {
        if (lm && lm.visibility > 0.5) {
            ctx.beginPath();
            ctx.arc(lm.x * width, lm.y * height, radius, 0, 2 * Math.PI);
            ctx.fill();
        }
    });
}

export const Visualizer = {
    init() {
        this.initThree();
        window.addEventListener('resize', () => this.onResize());
    },

    initThree() {
        const container = UI.elements.threeContainer;

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0f172a); // Slate-900
        scene.fog = new THREE.FogExp2(0x0f172a, 0.05);

        camera = new THREE.PerspectiveCamera(75, container.offsetWidth / container.offsetHeight, 0.1, 1000);
        camera.position.set(0, 1, 3);

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(container.offsetWidth, container.offsetHeight);
        container.appendChild(renderer.domElement);

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(5, 10, 7);
        scene.add(dirLight);

        // Grid
        const gridHelper = new THREE.GridHelper(10, 20, 0x3b82f6, 0x1e293b);
        scene.add(gridHelper);

        // Controls
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;

        // Init Skeleton
        this.createSkeleton();

        // Init Obstacle Marker (Hidden by default)
        const geometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
        const material = new THREE.MeshStandardMaterial({
            color: 0xef4444,
            transparent: true,
            opacity: 0.7,
            emissive: 0x991b1b
        });
        obstacleMesh = new THREE.Mesh(geometry, material);
        obstacleMesh.visible = false;
        scene.add(obstacleMesh);

        this.animate();
    },

    createSkeleton() {
        const geometry = new THREE.SphereGeometry(0.04, 16, 16);
        const material = new THREE.MeshStandardMaterial({ color: 0x60a5fa }); // Blue-400

        for (let i = 0; i < 33; i++) {
            const sphere = new THREE.Mesh(geometry, material.clone());
            scene.add(sphere);
            skeletonPoints.push(sphere);
        }

        const lineMaterial = new THREE.LineBasicMaterial({ color: 0x3b82f6, linewidth: 2 });

        POSE_CONNECTIONS.forEach(pair => {
            const lineGeometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0, 0, 0)
            ]);
            const line = new THREE.Line(lineGeometry, lineMaterial);
            line.userData = { start: pair[0], end: pair[1] };
            scene.add(line);
            skeletonLines.push(line);
        });
    },

    update2D(results, predictedLandmarks = null, showReal = true, showGhost = false) {
        if (!UI.elements.ctx) return;
        const ctx = UI.elements.ctx;
        const width = UI.elements.canvas.width;
        const height = UI.elements.canvas.height;

        ctx.save();
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(results.image, 0, 0, width, height);

        // Draw Ghost Skeleton (Background layer)
        if (showGhost && predictedLandmarks) {
            this.drawSkeleton(ctx, predictedLandmarks, {
                lineColor: '#00e5ff', // Cyan-400
                lineWidth: 2,
                pointColor: '#00e5ff',
                pointRadius: 2,
                dotted: true
            });
        }

        // Draw Real Skeleton
        if (results.poseLandmarks && showReal) {
            // Draw Connectors & Landmarks using helper
            this.drawSkeleton(ctx, results.poseLandmarks, {
                lineColor: 'rgba(14, 165, 233, 0.8)', // Sky-500
                lineWidth: 4,
                pointColor: '#38bdf8', // Sky-400
                pointRadius: 3
            });

            // Draw AR Knee Indicators (Only on Real Skeleton)
            this.drawKneeIndicators(results.poseLandmarks);
        }

        ctx.restore();
    },

    drawSkeleton(ctx, landmarks, style) {
        // Line Style
        ctx.strokeStyle = style.lineColor;
        ctx.lineWidth = style.lineWidth;
        if (style.dotted) ctx.setLineDash([4, 4]);
        else ctx.setLineDash([]);

        const width = ctx.canvas.width;
        const height = ctx.canvas.height;

        // Draw Lines
        ctx.beginPath();
        POSE_CONNECTIONS.forEach(([i, j]) => {
            const p1 = landmarks[i];
            const p2 = landmarks[j];
            // Check visibility if available (predicted landmarks might not have explicit visibility, assume visible)
            const v1 = p1.visibility !== undefined ? p1.visibility : 1;
            const v2 = p2.visibility !== undefined ? p2.visibility : 1;

            if (p1 && p2 && v1 > 0.5 && v2 > 0.5) {
                ctx.moveTo(p1.x * width, p1.y * height);
                ctx.lineTo(p2.x * width, p2.y * height);
            }
        });
        ctx.stroke();

        // Draw Points
        ctx.fillStyle = style.pointColor;
        ctx.setLineDash([]); // Reset for points
        landmarks.forEach(lm => {
            const v = lm.visibility !== undefined ? lm.visibility : 1;
            if (lm && v > 0.5) {
                ctx.beginPath();
                ctx.arc(lm.x * width, lm.y * height, style.pointRadius, 0, 2 * Math.PI);
                ctx.fill();
            }
        });
    },

    drawKneeIndicators(landmarks) {
        const ctx = UI.elements.ctx;
        const leftKnee = landmarks[25];
        const rightKnee = landmarks[26];
        const width = UI.elements.canvas.width;
        const height = UI.elements.canvas.height;

        const drawIndicator = (center, angle) => {
            if (center.visibility < 0.5) return;

            // Map angle to color (180=Green, 90=Red)
            // Pressure 0-100 logic
            const pressure = Math.max(0, Math.min(100, (180 - angle) / 0.9));

            let color = `rgba(34, 197, 94, 0.6)`; // Green-500
            let radius = 15;

            if (pressure > 80) {
                color = `rgba(239, 68, 68, 0.8)`; // Red-500
                radius = 25; // Pulse/Enlarge on high load
            } else if (pressure > 50) {
                color = `rgba(234, 179, 8, 0.7)`; // Yellow-500
                radius = 20;
            }

            ctx.beginPath();
            ctx.arc(center.x * width, center.y * height, radius, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();

            // Optional: Ring
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();
        };

        // Calculate Angles locally for visualization
        const leftAngle = getAngle(landmarks[23], landmarks[25], landmarks[27]);
        const rightAngle = getAngle(landmarks[24], landmarks[26], landmarks[28]);

        drawIndicator(leftKnee, leftAngle);
        drawIndicator(rightKnee, rightAngle);
    },

    update3D(worldLandmarks, isFall, isAlarm) {
        if (!worldLandmarks) return;

        // Update Points
        worldLandmarks.forEach((lm, index) => {
            if (skeletonPoints[index]) {
                // MediaPipe coords -> Three.js coords mapping
                // x -> -x, y -> -y (plus offset for height), z -> -z
                skeletonPoints[index].position.set(-lm.x, -lm.y + 1, -lm.z);

                // Color change on Alarm
                if (isAlarm || isFall) {
                    skeletonPoints[index].material.color.setHex(0xef4444); // Red
                } else {
                    skeletonPoints[index].material.color.setHex(0x60a5fa); // Blue
                }
            }
        });

        // Update Lines
        skeletonLines.forEach(line => {
            const start = skeletonPoints[line.userData.start].position;
            const end = skeletonPoints[line.userData.end].position;

            const positions = line.geometry.attributes.position.array;
            positions[0] = start.x; positions[1] = start.y; positions[2] = start.z;
            positions[3] = end.x; positions[4] = end.y; positions[5] = end.z;
            line.geometry.attributes.position.needsUpdate = true;
        });
    },

    showObstacle3D(detected, position) {
        if (detected && position) {
            obstacleMesh.visible = true;
            // Position the obstacle relative to the feet in 3D space
            // Assuming 'position' is 3D vector or roughly where feet are
            obstacleMesh.position.copy(position);
            // Add some bounce or pulse equivalent in 3D if needed
        } else {
            obstacleMesh.visible = false;
        }
    },

    onResize() {
        const container = UI.elements.threeContainer;
        if (!container || !renderer || !camera) return;

        const w = container.offsetWidth;
        const h = container.offsetHeight;

        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    },

    animate() {
        requestAnimationFrame(() => this.animate());
        if (controls) controls.update();
        if (renderer && scene && camera) renderer.render(scene, camera);
    }
};
