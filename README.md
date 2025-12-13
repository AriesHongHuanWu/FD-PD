# AI FallGuard Pro 2.0

An intelligent fall detection and biomechanics monitoring system powered by MediaPipe and TensorFlow.js.

![Interface Preview](https://via.placeholder.com/800x450?text=FallGuard+Preview)

## Features

- **Real-time Pose Detection** using MediaPipe.
- **Fall Detection**: Analyzes geometric orientation and motion to detect falls.
- **Knee Pressure Monitoring**: Visualizes knee stress based on flexion angles (Green/Yellow/Red).
- **Obstacle Detection**: Uses COCO-SSD to detect objects near the feet to prevent trips.
- **Action Prediction**: Predicts user movement (Sitting, Standing, etc.) based on velocity.
- **3D Visualization**: Real-time 3D skeleton and spatial obstacle rendering using Three.js.
- **Google-inspired UI**: Clean, modern Interface using Tailwind CSS.

## Tech Stack

- **HTML5/CSS3** (Tailwind CSS)
- **JavaScript (ES6 Modules)**
- **Libraries**:
  - [MediaPipe Pose](https://google.github.io/mediapipe/solutions/pose)
  - [TensorFlow.js (COCO-SSD)](https://github.com/tensorflow/tfjs-models/tree/master/coco-ssd)
  - [Three.js](https://threejs.org/)

## Setup

1. Clone the repository.
2. Open `index.html` in a web browser (Local server recommended for camera permissions, e.g., Live Server).
3. Allow camera access when prompted.

## Project Structure

```
/
├── css/
│   └── style.css       # Custom styles & animations
├── js/
│   ├── main.js         # Entry point
│   ├── detectors.js    # AI Logic (Pose, Object, Math)
│   ├── visualizer.js   # Three.js & Canvas rendering
│   └── ui.js           # DOM manipulation
└── index.html          # Main application file
```

## License

MIT
