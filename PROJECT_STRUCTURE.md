# FallGuard AI 專案結構說明

這個文件詳細說明了 FallGuard AI 專案中各個檔案的用途、功能以及它們如何協同運作。

## 目錄結構

```
FD/
├── css/             # 存放編譯後的 CSS 檔案
├── docs/            # 文件資料夾
├── js/              # 核心 JavaScript 程式碼
│   ├── detectors.js # AI 偵測與邏輯核心
│   ├── kalman.js    # 卡爾曼濾波器演算法 (平滑化數據)
│   ├── logging.js   # 系統日誌記錄模組
│   ├── main.js      # 程式進入點 (Entry Point)
│   ├── ui.js        # 使用者介面控制模組
│   └── visualizer.js# 視覺化模組 (2D Canvas 與 3D Three.js)
├── index.html       # 主網頁檔案
├── build.js         # 建置腳本
├── package.json     # 專案依賴配置
├── src.css          # Tailwind CSS 來源檔案
└── tailwind.config.js # Tailwind CSS 設定檔
```

## 詳細檔案說明

### 1. 核心邏輯 (js/)

*   **`js/main.js` (主程式)**
    *   **功能**: 應用程式的入口點。
    *   **職責**:
        *   初始化其他模組 (`Visualizer`, `Detectors`)。
        *   設定相機 (Camera Setup)，處理 Webcam 影像流。
        *   啟動主迴圈 (`loop`)，將每一幀影像送入 AI 進行處理。

*   **`js/detectors.js` (偵測器)**
    *   **功能**: 專案的「大腦」，負責所有的 AI 推論與邏輯判斷。
    *   **職責**:
        *   載入 MediaPipe Pose (姿態偵測) 和 TensorFlow.js (物件偵測) 模型。
        *   處理即時影像，分析人體骨架與環境物件。
        *   計算關鍵指標：
            *   **膝蓋負載 (Knee Load)**: 計算膝蓋角度與衝擊力。
            *   **跌倒偵測 (Fall Detection)**: 判斷是否發生跌倒 (基於角度、高度與速度)。
            *   **環境風險 (Environmental Risk)**: 偵測周圍障礙物。
            *   **穩定性與脊椎健康**: 分析姿態平衡與背部角度。
        *   使用 `kalman.js` 來平滑化數據，減少抖動。

*   **`js/kalman.js` (卡爾曼濾波器)**
    *   **功能**: 實作 3D 點追蹤的卡爾曼濾波演算法。
    *   **職責**:
        *   對 AI 偵測到的骨架座標進行「預測」與「修正」。
        *   消除 Webcam 的雜訊 (Jitter)，讓動作看起來更流暢。
        *   預測下一幀的位置，即便在短暫遮擋時也能保持追蹤。

*   **`js/ui.js` (使用者介面)**
    *   **功能**: 控制網頁上的 DOM 元素顯示。
    *   **職責**:
        *   更新儀表板數值 (風險指數、穩定度)。
        *   顯示警告與錯誤訊息 (Toast/Chip)。
        *   繪製膝蓋負載的進度條。
        *   管理日誌顯示區塊。

*   **`js/visualizer.js` (視覺化)**
    *   **功能**: 負責圖形渲染。
    *   **職責**:
        *   **2D 繪圖**: 在 Canvas 上繪製人體骨架、關鍵點連線。
        *   **3D 繪圖**: 使用 Three.js 建立 3D 場景，顯示空間中的骨架與障礙物。
        *   處理 AR 效果 (如膝蓋上的負載指示圈)。

*   **`js/logging.js` (日誌)**
    *   **功能**: 系統事件紀錄。
    *   **職責**:
        *   儲存系統事件 (資訊、警告、錯誤)。
        *   提供匯出日誌為 JSON 的功能。
        *   與 UI 連動顯示最新日誌。

### 2. 前端介面

*   **`index.html`**
    *   **功能**: 網頁骨架。
    *   **職責**:
        *   定義頁面佈局 (Header, Main Grid, Sidebar)。
        *   引入所有必要的函式庫 (Tailwind, Three.js, MediaPipe)。
        *   包含 `<video>` 與 `<canvas>` 元素供影像處理使用。

*   **`src.css` & `css/output.css`**
    *   **功能**: 樣式表。
    *   **職責**: 定義 Tailwind CSS 的基礎樣式與自定義樣式。

### 3. 設定與工具

*   **`tailwind.config.js`**: Tailwind CSS 的設定檔，定義顏色、字型與擴充功能。
*   **`build.js`**: 簡單的建置腳本，用於監聽 CSS 變更並重新編譯。
*   **`package.json`**: Node.js 專案設定，列出安裝的套件 (如 tailwindcss)。

## 系統運作流程

1.  **啟動**: `index.html` 載入 -> `main.js` 執行 `main()`。
2.  **初始化**: `Visualizer.init()` 建立 3D 場景 -> `Detectors.init()` 載入 AI 模型。
3.  **相機**: `setupCamera()` 取得 Webcam 影像流。
4.  **迴圈**:
    *   `loop()` 函式不斷執行 (requestAnimationFrame)。
    *   `Detectors.processFrame()` 分析當前影像。
    *   `Pose` 模型回傳座標 -> `KalmanFilter` 平滑化座標。
    *   `Detectors` 計算邏輯 (跌倒、負載) 並呼叫 `UI` 更新數值。
    *   `Visualizer.update2D/3D` 繪製骨架與 AR 效果。
