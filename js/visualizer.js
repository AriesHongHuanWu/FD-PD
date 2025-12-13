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
    [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], // Upper Body
    [11, 23], [12, 24], // Torso
    [23, 24], [23, 25], [24, 26], [25, 27], [26, 28], [27, 29], [28, 30], [29, 31], [30, 32] // Lower Body
];

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

    update2D(results) {
        const ctx = UI.elements.ctx;
        const width = UI.elements.canvas.width;
        const height = UI.elements.canvas.height;

        ctx.save();
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(results.image, 0, 0, width, height);

        if (results.poseLandmarks) {
            drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, { color: 'rgba(14, 165, 233, 0.8)', lineWidth: 4 });
            drawLandmarks(ctx, results.poseLandmarks, { color: '#38bdf8', lineWidth: 2, radius: 3 });
        }
        ctx.restore();
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
