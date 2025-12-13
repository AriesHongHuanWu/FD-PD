# 面試應答攻略：AI 協作與 FallGuard AI 技術深度解析

這份指南旨在協助你自信地展示 FallGuard AI 項目，並將「AI 輔助編寫」轉化為「新世代工程師」的優勢。

## 一、 如何體現你的價值 (The "AI-Augmented" Engineer)

當被問及「這不是 AI 寫的嗎？」或「你做了什麼？」時，你的核心論述應該是：**「AI 是我的手，但我是大腦 (Architect)。」**

你可以強調以下三點價值：

1.  **架構設計與技術決策 (System Design)**:
    *   AI 可以寫出一段 function， 但無法決定整個系統要分為 `Detectors` (邏輯), `Visualizer` (渲染), `UI` (介面), `Logger` (記錄) 四個模組來降低耦合度 (Decoupling)。是你定義了這個清晰的架構。
    *   是你決定了使用 MediaPipe (輕量級、邊緣運算) 而不是重型的 Server-side 模型，這體現了對「隱私」和「即時性」的考量。

2.  **演算法定義 (Algorithm Definition)**:
    *   AI 不知道什麼是 "Fall Risk" (跌倒風險)。是你定義了公式：`風險 = 膝蓋壓力 + 重心穩定度 + 環境障礙物`。
    *   AI 不知道什麼是「穩定度」。是你運用物理知識，定義了「重心 (Hip)」與「支撐基底 (Ankles)」的水平距離就是穩定度。
    *   **價值點**：將模糊的業務需求 (保護老人) 轉化為具體的數學指標 (Risk Score)，這是高級工程師的能力。

3.  **Code Review 與優化 (The "Human in the Loop")**:
    *   AI 寫的程式碼常有 Bug 或幻覺 (Hallucination)。是你負責審查、測試並修正。例如處理 `Camera Blocked` (鏡頭遮擋) 的邊界情況 (Edge Case)，或是微調防抖動 (Smoothing) 參數，這些都需要人工的經驗與測試。

---

## 二、 必須知道的公式與語法 (Must-Know Formulas & Syntax)

面試官可能會指著你的程式碼問：「這行在算什麼？」請務必熟悉以下 `detectors.js` 中的核心邏輯。

### 1. 向量角度計算 (Vector Angles)
這是計算膝蓋彎曲度 (Knee Angle) 和脊椎姿勢 (Spine Health) 的基礎。
*   **原理**: 利用反三角函數 `atan2(y, x)` 計算點與點之間的角度。
*   **程式碼對應**:
    ```javascript
    // 計算三點 (a, b, c) 形成的角度，b 是頂點
    // 用途: 判斷膝蓋是否承受壓力 (蹲下 vs 站直)
    Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    ```
*   **關鍵詞**: Radians to Degrees (弧度轉角度), atan2 (四象限反正切)。

### 2. 穩定度公式 (Stability Score)
*   **物理原理**: 當人的重心 (Center of Gravity, COG) 超出支撐基底 (Base of Support) 時，人就會跌倒。
*   **你的實作**:
    *   **COG**: 假設為髖關節中心 `(LeftHip.x + RightHip.x) / 2`。
    *   **Base**: 假設為腳踝中心 `(LeftAnkle.x + RightAnkle.x) / 2`。
    *   **公式**: `Stability = 100 - ( |COG.x - Base.x| * 係數 )`。
    *   **解釋**: 水平差距越大，分數越低，越不穩定。

### 3. 歐幾里得距離 (Euclidean Distance)
*   **用途**: 判斷障礙物距離、手是否有支撐 (扶著東西)。
*   **語法**: `Math.hypot(dx, dy)` 等同於 $\sqrt{dx^2 + dy^2}$。
*   **例子**: `detectors.js` 中的 `checkHandSupport` 函式，檢查手腕 (Wrist) 和膝蓋 (Knee) 的距離。

---

## 三、 MediaPipe 3D 座標是如何做到的？ (The "Black Box" Explained)

這是最容易被考倒的 "Deep Tech" 問題。

**問題**: 「你只有一個普通的 2D 鏡頭，為什麼能畫出 3D 的骨架？Z 軸 (深度) 是哪來的？」

**標準答案**:
1.  **不是透過雙眼視差 (Stereo Vision)**: 我們沒有 iPhone 的 LiDAR，也沒有雙鏡頭。
2.  **是透過機器學習推論 (Machine Learning Inference)**:
    *   Google 訓練 MediaPipe 模型時，使用了大量的 2D 影片，並搭配特殊的設備 (MoCap 動作捕捉系統) 同步記錄真實的 3D 座標。
    *   模型 **「學會了」** 人體結構的限制。例如：當畫面中大腿看起來很短時，模型知道那是因為大腿「指向」鏡頭（透視縮短），從而推算出 Z 軸的深度。
3.  **座標系**: `poseWorldLandmarks` 返回的是以「臀部中心」為原點的米 (Meters) 單位真實世界座標。

---

## 四、 3D 顯示與偵測實作 (3D Rendering & Detection)

### 3D 顯示 (Three.js 實作)
*   **原理**: 使用 `Three.js` 建立一個 3D 場景 (Scene)。
*   **Mapping (映射)**: 將 MediaPipe 給出的 `(x, y, z)` 數據，賦值給 Three.js 的球體 (Sphere)。
    *   *注意*: MediaPipe 的座標系可能跟 Three.js 不同 (例如 Y 軸方向)，所以在 `visualizer.js` 裡有一行 `lm.y + 1` 或負號翻轉，就是為了校正座標系。

### 各項偵測實作細節
1.  **跌倒偵測 (Fall Detection)**:
    *   不是只看「倒下」，而是看「速度」+「姿態」。
    *   **條件**: 身體與地面的角度 < 45度 (躺平) **且** 髖關節高度變低。
    *   **防誤判**: 必須持續 `FALL_TRIGGER_FRAMES` (約2秒)，避免只是彎腰綁鞋帶被誤判。

2.  **障礙物偵測 (Obstacle Detection)**:
    *   使用另一個模型 `COCO-SSD` (Object Detection)。
    *   **邏輯**: 如果偵測到「物體 (Bounding Box)」的中心點，距離使用者的「腳底」太近 (Math.hypot < 0.2)，就視為絆倒風險 (Trip Hazard)。

---

## 五、 可能被考倒的元素 (Potential Curveballs)

準備好這些問題的答案：

1.  **Q: 為什麼用 JavaScript 跑 AI？不會很慢嗎？**
    *   **A**: 現代瀏覽器支援 WebGL/WebAssembly 加速。MediaPipe 優化極佳，能達到 30FPS。且由前端運算可以保護使用者隱私 (影像不出本機)，這在醫療/長照領域至關重要。

2.  **Q: 如何處理光線不足或遮擋？**
    *   **A**: 我在 `detectors.js` 裡寫了 `checkVisibility`。如果關鍵點 (Keypoints) 的 `visibility` 分數低於 0.6，系統會自動暫停分析並顯示警告，防止錯誤的數據造成誤判。

3.  **Q: `async/await` 在這裡的作用？**
    *   **A**: AI 推論 (`poseDetector.send`) 是耗時操作。使用 `await` 確保我們等到這一幀分析完畢才進行下一幀，避免阻塞 UI 執行緒 (Blocking UI Thread)，保持畫面流暢。

4.  **Q: 為什麼要用 Tailwind CSS？**
    *   **A**: 為了快速迭代 (Rapid Prototyping) 和維護性。Utility-first 的做法讓我能專注於邏輯開發，且 Build 後的 CSS 檔案極小 (PurgeCSS)，提升載入效能。
