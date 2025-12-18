# FallGuard AI 判定邏輯流程圖 (Logic Flow)

此文件詳細描述了 `js/detectors.js` 中的核心判定邏輯與數據流向。

## 系統核心流程 (Mermaid Flowchart)

```mermaid
flowchart TD
    Start(["Webcam 影像輸入"]) --> ProcessFrame["Process Frame (每幀處理)"]
    ProcessFrame --> PoseDet["MediaPipe Pose 模型偵測"]
    ProcessFrame -->|每 10 幀| ObjDet["TensorFlow Object Detection"]
    
    ObjDet --> EnvHaz{"偵測到危險物件?"}
    EnvHaz -->|Yes| SetEnvRisk["設定環境風險係數 = 0.8"]
    EnvHaz -->|No| ClearEnvRisk["環境風險 = 0"]
    
    PoseDet --> OnResults["取得偵測結果"]
    OnResults --> Kalman["卡爾曼濾波 (Kalman Filter)"]
    Kalman --> Smooth["取得平滑化座標"]
    
    Smooth --> VisCheck{"全身可見度 > 0.6?"}
    VisCheck -->|No| LowVisCount["累計低可見度計數"]
    LowVisCount -->|Count > 5| WarnVis["警告: 鏡頭遮擋/太近"]
    VisCheck -->|Yes| AnalysisEntry["進入 AnalyzePose 分析階段"]
    
    subgraph AnalysisCore ["核心分析邏輯"]
        direction TB
        
        AnalysisEntry --> Step1["1. 手部支撐偵測"]
        Step1 --> HandSup{"手腕接近膝蓋?"}
        
        Step1 --> Step2["2. 膝蓋與著地分析 (3D)"]
        Step2 --> KneeAng["計算膝蓋 3D 角度"]
        Step2 --> GroundCheck["判斷腳是否著地 (Y軸高度)"]
        Step2 --> StableCheck["判斷腳是否移動 (速度)"]
        
        Step2 --> Step3["3. 坐姿偵測"]
        Step3 --> SitCheck{"臀部在椅子範圍內?"}
        SitCheck -->|Yes| IsSitting["狀態: 坐著 (忽略負載)"]
        SitCheck -->|No| IsStanding["狀態: 站立/活動"]
        
        Step3 --> Step4["4. 其他指標計算"]
        Step4 --> Impact["衝擊力計算 (臀部垂直加速度)"]
        Step4 --> Stability["穩定度 (重心 vs 支撐底面積)"]
        Step4 --> Spine["脊椎健康 (肩膀-臀部角度)"]
        
        Step4 --> Step5["5. 風險指數計算"]
        Step5 --> CalcRisk["加權計算: 膝蓋 + 穩定度 + 環境"]
        CalcRisk --> FreeFall{"偵測到自由落體?"}
        FreeFall -->|Yes| MaxRisk["風險指數 = 100%"]
        
        Step5 --> Step6["6. 跌倒判定"]
        Step6 --> CheckFall{"身體水平且低高度?"}
    end
    
    CalcRisk --> FinalRisk["最終風險指數"]
    
    CheckFall --> IsFallen{"是否跌倒?"}
    
    FinalRisk -->|Risk > 95%| TriggerFall
    IsFallen -->|Yes| TriggerFall
    
    TriggerFall --> CountFall["累計跌倒影格數"]
    CountFall -->|Count >= 60| Alert["🔴 發出跌倒警報!"]
    
    AnalyzePose --> UIUpdate["UI 更新: 儀表板/負載條/警告"]
```

## 詳細邏輯說明

### 1. 預處理 (Pre-processing)
*   **卡爾曼濾波 (Kalman Filter)**: 為了防止 Webcam 雜訊導致數據跳動，所有的關鍵點座標 (Landmarks) 都會先經過濾波器平滑化。
*   **可見度檢查 (Visibility Gate)**: 系統會檢查肩膀與下半身的關鍵點可見度。如果平均可見度低於 `0.6`，系統會暫停分析並提示使用者調整位置。

### 2. 生物力學分析 (AnalyzePose)

#### A. 著地與支撐 (Grounding & Support)
*   系統計算腳踝 (Ankle) 的 Y 座標。
*   **判定標準**: 如果腳踝高度在地面線 (最低點) 的一定閾值內 (小腿長度的 30%)，則視為「著地」。
*   **穩定計時器**: 如果腳的移動速度極低 (< 0.002)，穩定計時器會增加，進一步確認該腳為有效支撐點。

#### B. 坐姿偵測 (Sitting Detection)
*   利用物件偵測 (Object Detection) 找到的椅子 (Chair/Couch) 邊框。
*   **判定**: 如果臀部 (Hip) 座標位於椅子邊框內，且高度相符，系統判定為「坐姿」。
*   **影響**: 坐姿狀態下，膝蓋負載的權重會被忽略。

#### C. 膝蓋負載 (Knee Load)
*   **資料來源**: 使用 `poseWorldLandmarks` (3D 座標)。
*   **公式**: 計算 臀部-膝蓋-腳踝 的 3D 夾角。
*   **壓力值**: 角度越小 (蹲越低)，壓力越大。若偵測到落地衝擊 (Impact)，壓力值會瞬間加乘。

#### D. 脊椎健康 (Spine Health)
*   計算 肩膀中心 與 臀部中心 的連線角度。
*   **判定**: 如果前傾角度 > 45 度，標記為 `Poor` (姿勢不良/駝背)。

### 3. 風險評估 (Risk Assessment)

系統計算一個 **0-100%** 的綜合風險指數 (`riskIndex`)：

*   **基礎權重**:
    *   **膝蓋風險 (30%)**: 基於膝蓋彎曲角度。
    *   **穩定度風險 (40%)**: 基於重心 (X軸) 偏離雙腳中心的程度。
    *   **環境風險 (20%)**: 是否有障礙物在腳邊。
*   **特殊加權**:
    *   **自由落體 (Freefall)**: 若偵測到急劇的垂直加速度，風險直接設為 100%。
    *   **脊椎不良**: 風險指數 +10%。

### 4. 跌倒觸發 (Fall Trigger)

觸發紅色警報需要滿足以下條件之一，並持續 **60 個影格** (約 2 秒，避免誤判)：

1.  **幾何跌倒判定 (`checkFall`)**:
    *   身體角度 < 45 度 (變成水平)。
    *   臀部高度 > 0.5 (位置很低)。
2.  **高風險指數**:
    *   `riskIndex` >= 95%。
