# 專案技術文件：FallGuard AI 系統架構與邏輯解析

本文檔旨在完整描述本專案的系統架構、數學邏輯、模組關聯以及關鍵語法，供技術面試或後續開發參考。

## 一、 系統架構與檔案連接邏輯 (System Architecture)

### 1. 模組關係詳解圖 (Detailed Module Relationship)

本圖展示了各個模組 (**Modules**) 內部使用的核心演算法 (**Algorithms**) 以及資料流向。

```mermaid
graph TD
    subgraph Core [主程式核心 Core]
        Main[main.js]
        Camera[Camera Feed<br/>MediaDevices API]
    end

    subgraph Logic [邏輯運算 Detectors]
        Detectors[detectors.js]
        MediaPipe[MediaPipe Pose Model<br/>BlazePose Architecture]
        CocoSSD[COCO-SSD Model<br/>Object Detection]
        
        MathEngine[運算引擎 Math Engine]
        note1[1. Vector Angles<br/>- atan2<br/>2. Stability Score<br/>- COG Projection<br/>3. Fall Risk Index<br/>- Weighted Sum]
    end

    subgraph View [視覺呈現 Visualizer]
        Visualizer[visualizer.js]
        ThreeJS[Three.js Engine<br/>WebGL Renderer]
        Canvas2D[Canvas API<br/>2D Context]
        
        Map3D[3D Mapping Logic<br/>x,y -> -x,-y,z]
    end

    subgraph Interface [使用者介面 UI]
        UI[ui.js]
        DOM[DOM Manipulation]
        Tailwind[Tailwind CSS<br/>Utility Classes]
    end

    %% Connections
    Main -->|Start Loop requestAnimationFrame| Detectors
    Camera -->|Video Frame Stream| Detectors
    
    Detectors -->|Inference Request| MediaPipe
    Detectors -->|Inference Request| CocoSSD
    MediaPipe -->|Pose Landmarks| MathEngine
    CocoSSD -->|Bounding Boxes| MathEngine
    MathEngine --- note1
    
    MathEngine -->|Processed Risks & Angles| UI
    MathEngine -->|World Landmarks x,y,z| Visualizer
    
    Visualizer -->|Update Skeleton| Map3D
    Map3D -->|Set Position| ThreeJS
    MediaPipe -->|Raw Landmarks| Canvas2D
    
    UI -->|Update Metrics/Classes| DOM
    DOM -->|Reflow/Repaint| Tailwind
```

### 2. 各檔案詳細邏輯與算法應用 (Detailed Logic per Module)

#### A. `detectors.js` (The Brain - 運算的核心)
這是系統最複雜的部分，整合了兩個 AI 模型與多個物理算法。

*   **使用的 AI 模型**:
    1.  **MediaPipe Pose**: Google 的 BlazePose 架構。提供 33 個身體關鍵點 (Landmarks)，含 `(x, y, z, visibility)`。
        *   *用途*: 姿勢分析、跌倒偵測、穩定度計算。
    2.  **COCO-SSD (TensorFlow.js)**: 輕量級物件偵測模型 (Single Shot MultiBox Detector)。
        *   *用途*: 辨識環境障礙物 (如背包、椅子)，計算 `EnvRisk`。

*   **實作的數學算法**:
    1.  **幾何運算 (Geometry)**: 使用 `Math.atan2(dy, dx)` 計算關節夾角。
        *   *應用*: 膝蓋壓力 (Knee Pressure)、脊椎健康度 (Spine Health)。
    2.  **物理平衡 (Physics Balance)**: 計算「重心 (Center of Gravity)」對「支撐面 (Base of Support)」的投影。
        *   *應用*: 穩定度分數 (Stability Score)。公式：`100 - (|Hip.x - Ankle.x| * Gain)`。
    3.  **加權風險評估 (Weighted Risk Assessment)**:
        *   算法: `Risk = (Knee * 0.3) + (Stability * 0.4) + (Env * 0.2) + (Spine * 0.1)`。
        *   *應用*: 將多維度數據正規化為單一的 0-100% 風險指標。

#### B. `visualizer.js` (The Eyes - 3D 渲染與轉換)
負責將抽象的 AI 數據轉化為使用者能理解的 3D 畫面。

*   **核心技術**: **Three.js (WebGL Library)**。
*   **關鍵邏輯**:
    1.  **座標空間映射 (Coordinate Space Mapping)**:
        *   MediaPipe 輸出的 `WorldLandmarks` 單位是**公尺 (Meters)**，原點在**臀部中心**。
        *   Three.js 的 Y 軸通常朝上，而螢幕座標 Y 軸朝下。
        *   **算法**: `Vector3( -lm.x, -lm.y + offset, -lm.z )`。進行鏡像翻轉與高度校正。
    2.  **即時幾何更新 (Real-time Geometry Update)**:
        *   不銷毀重建 Mesh，而是直接操作 BufferAttribute (`position.array`)。這是高效能圖學的關鍵 Design Pattern。

#### C. `ui.js` (The Face - 介面與狀態管理)
負責所有非 3D 的視覺反饋。

*   **核心技術**: Native DOM API + Tailwind CSS。
*   **關鍵邏輯**:
    1.  **數據驅動樣式 (Data-Driven Styling)**:
        *   利用 Template Literals (樣板字面值) 動態切換 Tailwind Class。
        *   例: `${risk > 80 ? 'bg-red-500' : 'bg-green-500'}`。
    2.  **微動畫 (Micro-Animations)**:
        *   利用 CSS `transition-all` 與 `duration-300`，讓進度條平滑過渡。

---

## 二、 核心演算法細節與公式 (Algorithms & Formulas Deep Dive)

這部分詳細列出程式碼中的數學公式。

### 1. 向量角度計算 (Vector Angles)
用於評估膝蓋受力 (Knee Pressure) 與脊椎姿勢 (Spine Health)。

*   **公式**: $\theta = |atan2(Cy - By, Cx - Bx) - atan2(Ay - By, Ax - Bx)|$
*   **程式碼 (`detectors.js`)**:
    ```javascript
    calculateAngle(a, b, c) {
        // b 是頂點 (例如膝蓋)
        // atan2 返回 -PI 到 PI 的弧度
        const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
        let angle = Math.abs(radians * 180.0 / Math.PI);
        if (angle > 180.0) angle = 360.0 - angle; // 確保角度取銳角側 (0-180)
        return angle;
    }
    ```

### 2. 穩定度分析 (Stability Analysis)
用於評估使用者是否站立不穩。

*   **物理概念**: 重心 (COG) 偏移出 支撐基底 (Base of Support)。
    *   **COG**: 近似為兩髖中心 `(LeftHip + RightHip) / 2`。
    *   **Base**: 近似為兩腳踝中心 `(LeftAnkle + RightAnkle) / 2`。
*   **公式**: 
    ```javascript
    // 歸一化偏移量 (Normalized Deviation)
    const deviation = Math.abs(hipX - ankleX);
    // 映射到 0-100 分數。係數 500 是經驗值，代表偏移 0.2 (屏幕寬度的 20%) 就視為 0 分。
    const score = Math.max(0, 100 - (deviation * 500));
    ```

### 3. 障礙物距離判定 (Obstacle Proximity)
使用歐式距離公式 (Euclidean Distance) 判斷使用者與物體的距離。

*   **公式**: $Distance = \sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2}$
*   **Javascript 語法**: `Math.hypot(dx, dy)` 是最高效的寫法。
*   **邏輯**:
    ```javascript
    // 用腳的位置 (feetX, feetY) 與 物體中心 (boxCenter) 比較
    const dist = Math.hypot(boxCenter.x - feetX, boxCenter.y - feetY);
    if (dist < 0.2) // 距離小於 20% 畫面寬度
        obstacleDetected = true;
    ```

---

## 三、 專案連接邏輯總結 (Connection Logic Summary)

1.  **Main Loop (主迴圈)**: `main.js` 啟動 `requestAnimationFrame`，這是一個無窮迴圈，每秒約執行 60 次。
2.  **Data Flow (資料流)**:
    *   **Input**: Camera Video Element.
    *   **Processing**: `Detectors` 讀取 Video -> MediaPipe 推論 -> 獲得 `Landmarks`。
    *   **Analysis**: `Detectors` 將 Landmarks 代入上述數學公式 -> 獲得 `Risk/Stability` 數值。
    *   **Output A (3D)**: `Visualizer` 讀取 `Landmarks` -> 更新 Three.js 骨架。
    *   **Output B (UI)**: `UI` 讀取 `Risk` 數值 -> 更新 DOM 元素寬度與顏色。

透過這種單向資料流 (Unidirectional Data Flow)，我們確保了系統的穩定性與可追蹤性。
