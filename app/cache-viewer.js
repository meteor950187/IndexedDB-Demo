const TABLES = {
  routes: {
    label: "路線",
    description:
      "每筆代表一條主路線，保留起終點、業者與支線名稱。名稱拆成搜尋 token，以索引縮小候選範圍後再精確比對。",
    columns: [
      ["id", "路線 ID"],
      ["name", "路線名稱"],
      ["departure", "起點"],
      ["destination", "終點"],
      ["providers", "業者"],
    ],
  },
  stops: {
    label: "實體站位",
    description:
      "同名站可能位於不同路側。每筆保存一個實體站位的地址、座標與方位；tokens 索引支援站名查詢。",
    columns: [
      ["id", "站位 ID"],
      ["name", "站名"],
      ["address", "地址"],
      ["bearing", "方位"],
      ["lat", "緯度"],
      ["lon", "經度"],
    ],
  },
  routeStops: {
    label: "路線站序",
    description:
      "連結路線與實體站位。stop 索引找經過某站的路線；routeDirection 複合索引取得指定路線、指定方向的站序。",
    columns: [
      ["id", "站牌 ID"],
      ["routeId", "路線 ID"],
      ["name", "站名"],
      ["stopId", "站位 ID"],
      ["direction", "方向"],
      ["seq", "站序"],
    ],
  },
  stationGroups: {
    label: "站群",
    description:
      "由附近同名站位整理而成，讓使用者選站名即可。tokens 用於站群搜尋；stop 索引由成員站位找回所屬站群。",
    columns: [
      ["id", "站群 ID"],
      ["name", "站群名稱"],
      ["kind", "類型"],
      ["stopIds", "成員站位"],
      ["area", "區域"],
    ],
  },
  meta: {
    label: "同步資訊",
    description:
      "記錄資料版本、來源時間、筆數與最近檢查時間。以主鍵 current 直接讀取，不需要另外建立索引。",
    columns: [
      ["id", "主鍵"],
      ["version", "資料版本"],
      ["savedAt", "資料儲存時間"],
      ["checkedAt", "最近檢查"],
    ],
  },
};
const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const formatTime = (value) =>
  value
    ? new Date(value).toLocaleString("zh-TW", {
        timeZone: "Asia/Taipei",
        hour12: false,
      })
    : "尚未儲存";
const formatValue = (key, value) => {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.join("、");
  if (key === "direction") return value === "0" ? "0 · 去程" : "1 · 返程";
  if (key === "kind") return value === "hub" ? "全部站區" : "站名／站區";
  if (["savedAt", "checkedAt"].includes(key)) return formatTime(value);
  return String(value);
};

export function setupCacheViewer(bridge) {
  const $ = (id) => document.getElementById("cache-" + id);
  const dialog = $("dialog");
  let store = "routes",
    offset = 0,
    version = null,
    revision = 0;
  const buttons = new Map();
  for (const [name, info] of Object.entries(TABLES)) {
    const button = element("button", undefined, "cache-store");
    button.type = "button";
    button.dataset.store = name;
    button.setAttribute("aria-pressed", "false");
    button.append(
      element("span", info.label),
      element("strong", "—"),
      element("code", name),
    );
    button.addEventListener("click", () => {
      store = name;
      offset = 0;
      load();
    });
    buttons.set(name, button);
    $("stores").append(button);
  }
  function resetRecord() {
    $("record").hidden = true;
    $("record").open = false;
    $("json").textContent = "";
  }
  async function load() {
    const request = ++revision;
    const requestedStore = store;
    const info = TABLES[store];
    $("content").setAttribute("aria-busy", "true");
    $("message").textContent = "正在讀取本機 IndexedDB…";
    $("store-title").textContent = `${info.label} / ${store}`;
    $("store-description").textContent = info.description;
    $("table").replaceChildren();
    $("indexes").replaceChildren();
    $("range").textContent = "";
    $("prev").disabled = $("next").disabled = true;
    resetRecord();
    for (const [name, button] of buttons)
      button.setAttribute("aria-pressed", String(name === store));
    try {
      const data = await bridge.inspectCache({
        store,
        offset,
        limit: 20,
        expectedVersion: version,
      });
      if (request !== revision || !dialog.open) return;
      version = data.meta?.version || null;
      $("database").textContent =
        `${data.databaseName} · Schema v${data.schemaVersion}`;
      $("saved").textContent = data.meta
        ? `資料儲存 ${formatTime(data.meta.savedAt)} · 最近檢查 ${formatTime(data.meta.checkedAt)}（台北時間）`
        : "尚未下載公車資料。資料庫已建立，目前沒有可查詢的快取。";
      for (const summary of data.stores)
        buttons.get(summary.name).querySelector("strong").textContent =
          summary.count.toLocaleString("zh-TW");
      const summary = data.stores.find((s) => s.name === requestedStore);
      $("indexes").append(
        element("span", `主鍵：${summary.keyPath}`, "cache-index"),
      );
      for (const index of summary.indexes) {
        const key = Array.isArray(index.keyPath)
          ? `[${index.keyPath.join(", ")}]`
          : index.keyPath;
        $("indexes").append(
          element(
            "span",
            `${index.name} → ${key}${index.multiEntry ? " · multiEntry" : ""}${Array.isArray(index.keyPath) ? " · 複合索引" : ""}`,
            "cache-index",
          ),
        );
      }
      if (!summary.indexes.length)
        $("indexes").append(element("span", "無額外索引", "cache-index"));
      $("message").textContent = data.rows.length
        ? "依主鍵排序；點「查看 JSON」可展開這筆實際儲存的完整欄位。"
        : "這張資料表目前沒有資料。";
      const head = element("thead"),
        header = element("tr");
      for (const [, label] of info.columns) {
        const th = element("th", label);
        th.scope = "col";
        header.append(th);
      }
      const actionHeading = element("th", "完整資料");
      actionHeading.scope = "col";
      header.append(actionHeading);
      head.append(header);
      const body = element("tbody");
      for (const record of data.rows) {
        const row = element("tr");
        for (const [key] of info.columns) {
          const value = formatValue(key, record[key]);
          const cell = element("td");
          const text = element(
            "span",
            value,
            ["id", "version"].includes(key) ? "cache-key" : "cache-cell",
          );
          text.title = value;
          cell.append(text);
          row.append(cell);
        }
        const cell = element("td"),
          action = element("button", "查看 JSON", "cache-json-button");
        action.type = "button";
        action.setAttribute(
          "aria-label",
          `查看 ${requestedStore} ${record.id} 的 JSON`,
        );
        action.addEventListener("click", () => {
          $("record-title").textContent =
            `${requestedStore} / ${record.id} · 完整 JSON`;
          $("json").textContent = JSON.stringify(record, null, 2);
          $("record").hidden = false;
          $("record").open = true;
          $("record").scrollIntoView({ block: "nearest" });
          $("record-title").focus();
        });
        cell.append(action);
        row.append(cell);
        body.append(row);
      }
      $("table").append(
        element("caption", `${info.label}（${requestedStore}）本機資料`),
        head,
        body,
      );
      $("table-wrap").hidden = !data.rows.length;
      $("range").textContent = data.rows.length
        ? `${offset + 1}–${offset + data.rows.length} / ${summary.count.toLocaleString("zh-TW")} 筆`
        : `0 / ${summary.count.toLocaleString("zh-TW")} 筆`;
      $("prev").disabled = offset === 0;
      $("next").disabled = offset + data.rows.length >= summary.count;
    } catch (error) {
      if (request !== revision || !dialog.open) return;
      $("message").textContent =
        `無法讀取快取：${error.message} 可按「重新讀取」重試。`;
    } finally {
      if (request === revision) $("content").setAttribute("aria-busy", "false");
    }
  }
  $("open").addEventListener("click", () => {
    if (dialog.open) return;
    dialog.showModal();
    document.body.classList.add("cache-is-open");
    version = null;
    offset = 0;
    load();
  });
  $("close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    revision++;
    document.body.classList.remove("cache-is-open");
    $("open").focus();
  });
  dialog.addEventListener("click", (event) => {
    const rect = dialog.getBoundingClientRect();
    if (
      event.target === dialog &&
      (event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom)
    )
      dialog.close();
  });
  $("refresh").addEventListener("click", () => {
    version = null;
    offset = 0;
    load();
  });
  $("prev").addEventListener("click", () => {
    offset = Math.max(0, offset - 20);
    load();
  });
  $("next").addEventListener("click", () => {
    offset += 20;
    load();
  });
}
