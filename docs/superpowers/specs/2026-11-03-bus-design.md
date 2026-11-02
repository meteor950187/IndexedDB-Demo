# 台北公車離線查詢：重新實作

使用者已確認需求並授權不中斷完成，隔日 review。只參考原始三個 JS 與本次官方資料驗證，不讀取備份實作。

目標：可展示 Worker 背景同步、HTTP 快取相容下載、IndexedDB 索引查詢及離線重新開啟的完整公車 Demo。

採用原生 HTML/CSS/ES modules；保留原始三檔不變。在目前乾淨 codex/bus-demo checkout 製作，沒有要求遠端發布，先交付本機可 review 專案。

分工：UI → BusBridge（生命週期、readonly DB 查詢）；Worker → 官方三份 Get*.gz → 解壓、驗證、正規化 → 單一 transaction 換入完整資料。Service Worker 只保存應用程式殼層。設定集中 config.js。

查詢：站名、路線、站點經過路線、路線站序、兩站直達路線。兩站須同 routeId/goBack 且上車站序小於下車站序；同名不同站位分開顯示地址。站序全景可標示上下車。

同步：首次成功後可用；既有快取立即可用並背景刷新；失敗保留舊資料且有明確錯誤、重試按鈕與退避排程；併發同步合併，跨頁用 Web Locks。拒絕空集合、錯誤格式及孤兒關聯，避免覆蓋好資料。

官方路線資料含重複 Id（業者及子路線）；依 Id 合併業者及子路線名稱，不把 pathAttributeId 當 Stop.routeId。全量檔無原本遊戲的分頁增量協定，使用完整快照原子替換，內容摘要相同則不重寫。

快取：fetch 使用一般 HTTP 快取行為，不加時間戳或 no-store；不宣稱 CDN 命中；不手動讀取未經 CORS expose 的 ETag。離線快取存在 IndexedDB，頁面殼層由 Service Worker 保存。來源為官方完整資料，無假資料 fallback。

介面：繁體中文、響應式、鍵盤可操作、載入/空結果/離線/錯誤狀態明確。非即時到站預報，非轉乘規劃。

方案取捨（本次執行決策）：直接官方檔案最接近需求且已驗證 CORS；不增加 proxy 或自架 CDN，避免不必要服務。原生模組不需打包；Node 僅提供本機靜態 server 與測試。

驗收：有意義單元/IndexedDB transaction 測試；真實 Chromium 下載、查詢、手機尺寸、離線重開；首次失敗與保留快取；原始檔 git diff 為空；README 記錄限制及重現方式。
