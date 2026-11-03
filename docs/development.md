# 開發與驗收指南

專案定位、架構與展示流程見 [README](../README.md)。本文件保留開發、重跑測試與靜態部署所需的操作細節。

## 本機啟動

使用 Node.js 22 以上，在專案根目錄執行 `npm start`，開啟 <http://127.0.0.1:4173>。測試依賴使用 `npm ci` 安裝。

在 PowerShell 指定其他 port：

```powershell
$env:PORT=4174
npm start
```

`localhost`、`127.0.0.1` 或不同 port 是不同 origin，各自擁有獨立的 IndexedDB 與 Cache Storage。請固定使用同一網址進行離線與升級驗證。

## 自動測試

```powershell
npm ci
npm test
```

測試使用 Node.js test runner 與 fake-indexeddb，涵蓋資料模型、索引查詢、站群配對、空資料與格式驗證、同步原子性、schema 遷移及快取檢視。

## 瀏覽器驗收

先啟動 4173 server，再於另一個終端機執行：

```powershell
npx --yes --package @playwright/cli playwright-cli -s=bus-review open http://127.0.0.1:4173
npx --yes --package @playwright/cli playwright-cli -s=bus-review run-code --filename=tests/browser-acceptance.js
npx --yes --package @playwright/cli playwright-cli -s=bus-review run-code --filename=tests/browser-stations.js
npx --yes --package @playwright/cli playwright-cli -s=bus-review run-code --filename=tests/browser-races.js
npx --yes --package @playwright/cli playwright-cli -s=bus-review close
```

需要可用的 Chromium。腳本在獨立 browser context 中讀取官方資料，模擬斷線、來源失敗及跨分頁更新；不修改日常瀏覽器資料。輸出截圖位於 `output/playwright/`，不納入 Git；README 使用的展示截圖另存於 `docs/images/`。

部分站位及站序斷言對應 2026-11-03 的驗證快照。官方資料異動後，應先核對新來源，再調整測試預期。可執行：

```powershell
node tools/inspect-data.js
node tools/verify-official.js
```

上述操作會更新 `output/source/` 與 `docs/station-data-evidence.json`。完整測試結果與已知資料差異見 [驗證紀錄](verification.md)。

### 舊版升級驗收

保留 4173 server，另於空閒的 4174 啟動專用測試 server：

```powershell
node tools/upgrade-server.js
```

在已開啟的 Playwright session 執行：

```powershell
npx --yes --package @playwright/cli playwright-cli -s=bus-review run-code --filename=tests/browser-upgrade.js
```

測試 server 從 Git commit `907a54d` 讀取舊版檔案，再切換目前程式，驗證 Service Worker 更新與 schema v1 → v2 遷移。升級階段阻擋官方下載，確認使用既有資料完成轉換，之後再斷線重新整理查詢。結束後以 Ctrl+C 關閉測試 server。

## 同步與資料庫設定

設定集中於 `app/config.js`：正常同步間隔 1 小時、下載逾時 30 秒，失敗重試由 15 秒退避至最多 5 分鐘。頁面也提供「立即檢查更新」。

資料庫名稱為 `TaipeiBusOffline-v1`，目前 schema version 為 2；名稱尾端的 v1 保留以使用原有資料庫。遷移在 versionchange transaction 中建立站群與索引，保留原始儲存時間。

官方來源為全量資料檔，因此同步採全量快照替換，不沿用原始範例的分頁／時間戳增量協定。來源 HTTP 快取可能讓下載取得快取版本；「最近檢查」不保證已向源站確認最新內容。

## 靜態部署與殼層更新

部署檔案為 `index.html`、`icon.svg`、`sw.js` 與整個 `app/`。使用相對路徑，程式設計支援子目錄；正式託管需 HTTPS。儲存庫目前提供本機展示，尚未發布遠端站點。

修改頁面、樣式或模組後，需提高 `sw.js` 的 CACHE 版本；新增模組也需加入殼層檔案清單。新 Service Worker 完整安裝後，會更新同範圍的舊分頁並移除舊殼層。升級可能重新整理頁面，尚未提交的選站內容不保留；IndexedDB 資料則遷移保留。

完全離線時繼續使用已安裝版本，待連線取得新殼層後更新。不需以刪除資料庫或 Unregister 作為正常升級步驟。
