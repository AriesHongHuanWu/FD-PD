
// js/visualizer.js
// Handles drawing to Canvas (2D Overlay) and Three.js (3D Skeleton)

export class Visualizer {
    constructor(canvas, ctx, threeContainer) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.threeContainer = threeContainer;

        this.initThree();
    }

    initThree() {
        // Standard Three.js Setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xffffff); // White clean background

        const width = this.threeContainer.clientWidth;
        const height = this.threeContainer.clientHeight;

        this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        this.camera.position.set(0, 1, 3);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(width, height);
        this.threeContainer.appendChild(this.renderer.domElement);

        // Lighting
        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambient);
        const dir = new THREE.DirectionalLight(0xffffff, 0.8);
        dir.position.set(0, 5, 2);
        this.scene.add(dir);

        // Skeleton
        this.points = [];
        this.lines = [];

        // Points
        const geo = new THREE.SphereGeometry(0.08, 16, 16); // Slightly larger
        const mat = new THREE.MeshLambertMaterial({ color: 0x1a73e8 }); // Google Blue

        for (let i = 0; i < 33; i++) {
            const mesh = new THREE.Mesh(geo, mat.clone());
            this.scene.add(mesh);
            this.points.push(mesh);
        }

        // Lines
        const lineMat = new THREE.LineBasicMaterial({ color: 0x8ab4f8, linewidth: 2 });
        const connections = Pose.POSE_CONNECTIONS; // MediaPipe global
        // Fallback if global not avail
        const manualConnections = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28], [27, 29], [28, 30], [29, 31], [30, 32]];

        (connections || manualConnections).forEach(pair => {
            const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)]);
            const line = new THREE.Line(geometry, lineMat);
            line.userData = { start: pair[0], end: pair[1] };
            this.scene.add(line);
            this.lines.push(line);
        });

        // Loop
        this.animate();
    }

    draw(image, landmarks, worldLandmarks, obstacles, analysisResult) {
        const w = this.canvas.width;
        const h = this.canvas.height;

        this.ctx.save();
        this.ctx.clearRect(0, 0, w, h);

        // 1. Draw Camera Feed
        if (image) {
            this.ctx.drawImage(image, 0, 0, w, h);
        }

        // 2. Draw 2D Skeleton with Health Colors
        if (landmarks) {
            drawConnectors(this.ctx, landmarks, POSE_CONNECTIONS, { color: '#ffffff', lineWidth: 4 });
            drawConnectors(this.ctx, landmarks, POSE_CONNECTIONS, { color: '#8ab4f8', lineWidth: 2 });
            drawLandmarks(this.ctx, landmarks, { color: '#1a73e8', lineWidth: 2, radius: 4 });

            // Highlight Knees if pressure is high
            if (analysisResult && analysisResult.leftKnee.load > 70) {
                this.drawHighlight(landmarks[25], 'red');
            }
            if (analysisResult && analysisResult.rightKnee.load > 70) {
                this.drawHighlight(landmarks[26], 'red');
            }
        }

        // 3. Draw Obstacles
        if (obstacles && obstacles.length > 0) {
            obstacles.forEach(obs => {
                const [x, y, width, height] = obs.bbox;
                this.ctx.strokeStyle = '#fbbc04'; // Google Yellow
                this.ctx.lineWidth = 4;
                this.ctx.strokeRect(x, y, width, height);

                // Label
                this.ctx.fillStyle = '#fbbc04';
                this.ctx.font = '16px Google Sans';
                this.ctx.fillText(`${obs.class} (${Math.round(obs.score * 100)}%)`, x, y > 10 ? y - 5 : 10);
            });

            // Draw Warning Line near feet if obstacle is close?
            // Simplified: Just boxes for now.
        }

        this.ctx.restore();

        // 4. Update 3D Skeleton
        if (worldLandmarks) {
            this.updateThree(worldLandmarks, analysisResult);
        }
    }

    drawHighlight(landmark, color) {
        const x = landmark.x * this.canvas.width;
        const y = landmark.y * this.canvas.height;
        this.ctx.beginPath();
        this.ctx.arc(x, y, 15, 0, 2 * Math.PI);
        this.ctx.fillStyle = color === 'red' ? 'rgba(234, 67, 53, 0.5)' : 'rgba(255, 255, 255, 0.5)';
        this.ctx.fill();
    }

    updateThree(landmarks, analysis) {
        landmarks.forEach((lm, i) => {
            if (this.points[i]) {
                // Invert coordinates for Three.js
                this.points[i].position.set(-lm.x, -lm.y + 1, -lm.z);

                // Color change on stress
                if ((i === 25 || i === 26) && analysis) {
                    const load = i === 25 ? analysis.leftKnee.load : analysis.rightKnee.load;
                    if (load > 80) this.points[i].material.color.setHex(0xea4335); // Red
                    else this.points[i].material.color.setHex(0x1a73e8); // Blue
                }
            }
        });

        this.lines.forEach(line => {
            const start = this.points[line.userData.start].position;
            const end = this.points[line.userData.end].position;
            const pos = line.geometry.attributes.position.array;
            pos[0] = start.x; pos[1] = start.y; pos[2] = start.z;
            pos[3] = end.x; pos[4] = end.y; pos[5] = end.z;
            line.geometry.attributes.position.needsUpdate = true;
        });
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }
}
