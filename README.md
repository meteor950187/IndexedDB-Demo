# 下一站台北 · 公車離線查詢

從原始 Bridge / Worker / IndexedDB 設計重新製作的原生 JavaScript Demo。提供站名搜尋、路線搜尋、站點經過路線、去返程站序與兩站直達路線查詢。

## 啟動

需要 Node.js 22 以上。執行應用程式不需安裝套件：

```powershell
npm start
```

開啟 <http://127.0.0.1:4173>。請使用新版 Chrome、Edge、Firefox 或 Safari；不要直接以 `file://` 開啟 HTML。其他 port：`$env:PORT=4174; npm start`。

測試才需要安裝開發依賴：

```powershell
npm ci
npm test
```

瀏覽器驗收使用 Playwright CLI（先啟動 server，另開終端機執行）：

```powershell
npx --yes --package @playwright/cli playwright-cli -s=bus-review open http://127.0.0.1:4173
npx --yes --package @playwright/cli playwright-cli -s=bus-review run-code --filename=tests/browser-acceptance.js
npx --yes --package @playwright/cli playwright-cli -s=bus-review run-code --filename=tests/browser-stations.js
npx --yes --package @playwright/cli playwright-cli -s=bus-review run-code --filename=tests/browser-races.js
npx --yes --package @playwright/cli playwright-cli -s=bus-review close
```

這些驗收腳本會建立獨立瀏覽器 context，使用官方資料，並在其中模擬斷線與跨分頁換版，不修改你的日常瀏覽器資料。需要可用的 Chromium；截圖在 `output/playwright/`（不納入 Git）。站位斷言依本次官方快照，日後資料異動時請重新核對證據。詳細實測及舊版升級驗收方式見 [驗證紀錄](docs/verification.md)。

## 建議 review 順序

1. 等待右側顯示主路線及站位數量；首次需下載官方資料。
2. 起站輸入「志光商職」，閱讀提示並選「智光商職」；4 個附近站位只需選一次。
3. 迄站輸入「台北車站」，可選「全部站區」或忠孝、公園等站區。選「臺北車站(忠孝)」後查詢：本次資料有 262、262區，直接顯示實際上下車位置、地址與 Google Maps 定位連結。
4. 按交換起訖站再查詢，檢查反向上下車位置不同；展開完整站序確認標記。清除迄站可查起站經過路線。也可試「捷運公館站 → 臺北車站(忠孝)」或 307 範例。
5. 切到「搜尋路線」，輸入 `262`：只出現 262、262區；輸入 `26`、`226` 時完全相符路線排在前面。卡片可切換去返程。
6. 等待「離線頁面」顯示已保存，用 DevTools Network → Offline，重新整理，繼續搜尋與展開站序。
7. 恢復 Online，按「立即檢查更新」。同步中可查詢；失敗時保留既有快取。

不同 origin（例如 localhost / 127.0.0.1 / 不同 port）有各自獨立快取。清除網站資料會移除 IndexedDB 與離線頁面。無痕模式或瀏覽器空間回收也可能使快取消失。

## 展示 IndexedDB 快取

頁首「網路已連線」旁的「查看快取資料」會開啟本機資料檢視視窗。可切換路線、實體站位、路線站序、站群及同步資訊五張資料表，查看實際筆數、主鍵、索引與每筆完整 JSON。資料每頁讀取 20 筆，依主鍵排序；站群筆數包含「全部站區」的上層群組。

筆數使用 object store 的 `count()`，索引資訊讀自 IndexedDB schema，沒有寫死展示數字。檢視透過 Bridge 的唯讀入口，在同一個 transaction 讀取各表筆數、同步資訊及當頁資料；翻頁途中若資料版本已變更，會提示重新讀取。尚未下載時也能查看空資料庫。

「重新讀取」只更新本機展示，不觸發官方資料下載；介面模組已加入 Service Worker 離線殼層。點關閉或按 Escape 可回到原查詢，起訖站與路線結果不因開關視窗而清除。

## 架構

```text
HTML / UI ──查詢──▶ BusBridge ──readonly transaction──▶ IndexedDB
                       │                                    ▲
                       └── Init / Sync ──▶ Web Worker ────────┘
                                          │        atomic replace
                              官方 gzip JSON → 驗證/正規化/SHA-256

Service Worker ── Cache Storage ── 應用程式殼層（HTML / CSS / JS）
```

- `GameCodeBridge.js`、`workerByJson.js`、`workerSiteSetting.js`：原始版本完整保留，Demo 不載入它們。
- `app/bridge.js`：Worker 生命週期、InitPromise、ready/status/syncerror 事件、查詢入口。
- `app/worker.js`：Init → Sync → InitSyncEnd；定期更新、錯誤重試、單分頁合併要求及跨分頁 Web Locks。
- `app/sync.js`：HTTP 下載、gzip 解壓、驗證、內容摘要、整批儲存。
- `app/model.js`：官方欄位轉換、方向與站序資料。
- `app/search.js`：逐名稱搜尋、正規化、完整數字段及結果排序。
- `app/groups.js`：附近同名站群、道路站區與全部站區階層。
- `app/db.js`：資料庫 schema、索引與一致性查詢。
- `app/config.js`：資料來源、資料庫名稱、1 小時同步間隔、30 秒下載逾時、15 秒至 5 分鐘退避重試。
- `app/ui.js`、`app/style.css`：繁體中文響應式介面。
- `sw.js`：只快取應用程式殼層，不代理或重複保存官方資料檔。
- `tools/serve.js`：只開放應用程式檔案的 localhost 靜態 server，沒有 proxy 或後端 API。

## 資料來源與格式

官方：[臺北市資料大平臺](https://data.taipei/dataset/detail?id=6a03b03d-90d1-4d9e-a952-c940fd869772)，提供機關為臺北市公共運輸處。

| 用途 | 檔案 |
|---|---|
| 路線 | [GetRoute.gz](https://tcgbusfs.blob.core.windows.net/blobbus/GetRoute.gz) |
| 站牌、路線關聯、站序 | [GetStop.gz](https://tcgbusfs.blob.core.windows.net/blobbus/GetStop.gz) |
| 站位名稱與座標 | [GetStopLocation.gz](https://tcgbusfs.blob.core.windows.net/blobbus/GetStopLocation.gz) |

解壓後為 `{ EssentialInfo: { UpdateTime, ... }, BusInfo: [...] }`。使用 magic bytes 判斷是否還需 gzip 解壓，兼容伺服器透過 Content-Encoding 自動解壓的情況。不使用 `Tst*.json` 範例檔。

GetRoute 的 Id 可能因業者或支線重複；GetStop.routeId 對應 Id，並非 pathAttributeId。正規化依主路線合併業者與支線名稱。只列出有站牌關聯的站位；獨立站位檔缺少某筆時，可由站牌記錄的名稱與座標補足。

不同主路線 Id 的服務分開呈現，例如 262 與 262區。相同 Id 的多個業者／路徑名稱保留為別名，無法據此保證每個班次行經所有站牌。資料為路線與站序參考，不含即時到站、班次是否營運、即時改道及轉乘規劃。名稱明示「裁撤／不停靠／停用／暫停服務／暫停使用／已取消」的站位不作為候選或推薦上下車點；原始站序仍保留標示。未標示的停駛無法由此偵測。

## 選站與搜尋規則

- 同完整站名（台／臺、全半形、空白及括號格式正規化）且所有成員兩兩直線距離不超過 400 公尺，組成一個站群。遙遠同名站及無有效座標站保守分開，不透過連續近鄰無限合併。
- 括號內道路／站區名稱保留。同基本站名的不同站區、所有站位直徑不超過 900 公尺時，另提供明示「全部站區」的上層選項。臺北車站有全部站區與 7 個分區，忠孝的 7 個站位合併選取。
- 站群不預先固定方向。查詢時自動比對成員，僅接受同路線、同方向、上車站序早於下車站序。交換起訖後重新配對；每路線＋方向一張卡，多組有效位置可用下拉選單切換。相同實體站位組合的循環行經僅保留站序差最小的一段。
- 每個路線名稱／別名獨立比對，絕不串接匹配。純數字需符合完整數字段（262 不匹配 26／226／1262），文字可部分搜尋；主名稱完全相符、別名完全相符、名稱前綴、其他包含依序排列。
- 「志光商職」不是本次官方站名。無直接命中時明示可能要找「智光商職」，由使用者選取，不生成虛構站名。
- 地圖連結使用官方座標，不需要 API Key；400／900 公尺是分組的直線距離上限，不代表步行距離、可通行路徑或無障礙承諾。卡片的主要組合依站序差選取，不是最快行程推薦。

## 同步與快取

1. 有快取時立刻發出 ready，UI 可查詢，再背景同步。
2. 三份資料下載並驗證後，在同一個 readwrite transaction 更新 routes / stops / routeStops / stationGroups / meta。任一失敗都不會清掉舊資料。
3. 正規化內容 SHA-256 不變時只更新檢查時間，不重寫資料 stores。
4. 原始範例的分頁／時間戳增量協定不適用這組全量檔；此版本使用全量快照替換。
5. fetch 使用 `cache: 'default'`，沒有附加時間戳或 `no-store`；由瀏覽器與來源 HTTP headers 管理 HTTP 快取。下載可能來自瀏覽器快取，「最近檢查」不是保證向源站確認最新版本，也不代表 CDN 命中。
6. IndexedDB 是本機查詢資料，Cache Storage 是離線頁面，兩者職責不同。沒有自行建置 CDN，也不假稱已測得 CDN 命中率。

資料庫名稱維持 `TaipeiBusOffline-v1`，schema version 為 2。升級在 versionchange transaction 內從既有資料建立 stationGroups、重建逐名稱索引與 metadata，不需重新下載，也保留原始 savedAt。`routes` / `stops` / `stationGroups` 有 multiEntry token 索引；站群另有成員索引；`routeStops` 有 stopId 與 [routeId, direction] 索引；`meta` 存已提交版本與來源時間。查詢先索引縮小範圍，再套用上述匹配與排序規則，最多顯示 60 筆並提示縮小範圍。

直達路線要求相同 routeId、相同 direction、起站 seq < 迄站 seq。循環重複站位選擇最近的有效順向區間，同站不算行程。每次查詢在單一 readonly transaction 讀取，避免背景提交期間混用兩代資料。

跨分頁以 BroadcastChannel 通知已提交的新版本；畫面清除舊結果，站序查詢另在同一 transaction 比對預期版本，防止通知尚未抵達時混用舊卡片與新站序。輸入、選站、清除或切換查詢模式，會取消先前尚未完成的範例／查詢結果。

## 靜態部署與更新

只需託管 `index.html`、`icon.svg`、`sw.js`、`app/`，支援子目錄，相對路徑不綁死根目錄。部署須用 HTTPS；目前交付在本機，沒有替你建立或發布任何遠端服務。

修改殼層檔案後，同步提高 `sw.js` 的 CACHE 版本。新 Service Worker 完整安裝後啟用新殼層，更新有舊快取的同範圍分頁並移除舊殼層，因此升級時可能重新整理並清除尚未提交的選站內容。資料庫會保留並遷移，不需要使用者刪除快取或 Unregister。完全離線時仍使用已安裝版本，待連線取得新殼層後更新。不要在正式站點同一路徑混用其他 Service Worker。

## 履歷敘述參考

> 以 Web Worker 在背景下載並正規化公開 JSON 資料，透過 IndexedDB 原子交易與索引提供本機路線查詢；搭配 HTTP 快取相容請求與 Service Worker 殼層快取，實現離線重新開啟、同步失敗保留資料及重試機制。

CDN 靜態資料分發可作為此架構的延伸說明；本 Demo 未自行部署 CDN，因此不列為已完成的量化成果。
