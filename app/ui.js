import { BusBridge } from "./bridge.js";

const $ = (id) => document.getElementById(id);
const selected = { start: null, end: null };
const revisions = { start: 0, end: 0, route: 0, results: 0 };
let mode = "stops";
let bridge;
let shellReady = false;
let dataVersion;
let operation = 0;
const logs = [];
const formatTime = (value) =>
  value
    ? new Intl.DateTimeFormat("zh-TW", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Taipei",
      }).format(new Date(value))
    : "—";
const node = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};
function log(message) {
  logs.unshift(`${formatTime(Date.now())} ${message}`);
  logs.splice(6);
  $("event-log").replaceChildren(...logs.map((text) => node("li", "", text)));
}
function status(message, state = "") {
  $("status-text").textContent = message;
  $("sync-status").className = "sync-status " + state;
}
function showError(error) {
  $("form-message").textContent = error.message || String(error);
}
function setMeta(meta) {
  if (dataVersion && dataVersion !== meta.version) {
    invalidate();
    revisions.start++;
    revisions.end++;
    revisions.route++;
    $("start-list").hidden = true;
    $("end-list").hidden = true;
    empty("資料已更新", "請重新查詢，查看最新的路線與站序。");
  }
  dataVersion = meta.version;
  $("route-count").textContent = meta.counts.routes.toLocaleString("zh-TW");
  $("stop-count").textContent = meta.counts.stops.toLocaleString("zh-TW");
  $("saved-at").textContent = formatTime(meta.savedAt);
  $("checked-at").textContent = formatTime(meta.checkedAt);
  $("source-time").textContent =
    "官方資料時間：" +
    Object.values(meta.sourceTimes)
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i)
      .join(" / ");
  $("data-title").textContent = "你的城市，已隨身。";
  for (const id of [
    "start-input",
    "end-input",
    "route-input",
    "search-trips",
    "example",
    "swap",
  ])
    $(id).disabled = false;
  $("sync-detail").textContent =
    "查詢使用裝置內的資料。背景同步期間也能繼續使用。";
  if (!navigator.onLine) status("離線中，使用已儲存資料");
  else status("已載入本機資料");
}
function network() {
  $("network-label").textContent = navigator.onLine ? "網路已連線" : "目前離線";
  $("network-dot").classList.toggle("offline", !navigator.onLine);
  if (!navigator.onLine && bridge?.ready) status("離線中，使用已儲存資料");
}

function empty(title, description) {
  const div = node("div", "empty");
  div.append(
    node("span", "", "↗"),
    node("h3", "", title),
    node("p", "", description),
  );
  $("results").replaceChildren(div);
  $("query-time").textContent = "";
}

function choose(which, stop) {
  invalidate();
  revisions[which]++;
  selected[which] = stop;
  $(which + "-input").value = stop?.name || "";
  $(which + "-list").hidden = true;
  $(which + "-selected").hidden = !stop;
  $(which + "-selected").textContent = stop
    ? `✓ ${stop.address || "無地址資訊"} · 站位 ${stop.id}${stop.bearing ? " · " + stop.bearing : ""}`
    : "";
  $("form-message").textContent = "";
}
function invalidate() {
  operation++;
  revisions.results++;
}
for (const which of ["start", "end"]) {
  let timer;
  $(which + "-input").addEventListener("input", () => {
    clearTimeout(timer);
    invalidate();
    selected[which] = null;
    $(which + "-selected").hidden = true;
    const version = ++revisions[which];
    const text = $(which + "-input").value.trim();
    const list = $(which + "-list");
    list.hidden = !text;
    list.replaceChildren(node("li", "candidate-message", "搜尋中…"));
    timer = setTimeout(async () => {
      if (!text) return;
      try {
        const rows = await bridge.query("searchStops", text);
        if (version !== revisions[which]) return;
        const items = rows.map((stop) => {
          const li = node("li");
          const button = node("button", "candidate");
          button.type = "button";
          button.append(
            node("strong", "", stop.name),
            node(
              "small",
              "",
              `${stop.address || "無地址資訊"} · 站位 ${stop.id} ${stop.bearing || ""}`,
            ),
          );
          button.addEventListener("click", () => {
            choose(which, stop);
            $(which === "start" ? "end-input" : "search-trips").focus();
          });
          li.append(button);
          return li;
        });
        if (rows.length === 60)
          items.push(
            node(
              "li",
              "candidate-message",
              "顯示前 60 筆，輸入更完整站名可縮小範圍。",
            ),
          );
        list.replaceChildren(
          ...(items.length
            ? items
            : [
                node("li", "candidate-message", "找不到站位，試試較短的站名。"),
              ]),
        );
      } catch (error) {
        if (version === revisions[which]) {
          list.hidden = true;
          showError(error);
        }
      }
    }, 180);
  });
  $(which + "-input").addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      $(which + "-list")
        .querySelector("button")
        ?.focus();
    }
    if (event.key === "Escape") $(which + "-list").hidden = true;
  });
  $(which + "-list").addEventListener("keydown", (event) => {
    const buttons = [...$(which + "-list").querySelectorAll("button")];
    const index = buttons.indexOf(document.activeElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      buttons[(index + 1) % buttons.length]?.focus();
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      (buttons[index - 1] || $(which + "-input")).focus();
    }
    if (event.key === "Escape") {
      $(which + "-list").hidden = true;
      $(which + "-input").focus();
    }
  });
}

function routeCard(match) {
  const version = dataVersion;
  const { route, direction, from, to } = match;
  const details = node("details", "route-card");
  const summary = node("summary");
  const info = node("div", "route-info");
  const title = node("strong");
  title.append(
    node("span", "direction-label", direction === "0" ? "去程" : "返程"),
    document.createTextNode(
      `往 ${direction === "0" ? route.destination : route.departure}`,
    ),
  );
  info.append(
    title,
    node(
      "small",
      "",
      from
        ? `${from.name}${to ? " → " + to.name : " · 經過此站"} · 展開站序`
        : `${route.departure} ↔ ${route.destination} · 展開站序`,
    ),
  );
  summary.append(
    node("span", "route-number", route.name),
    info,
    node("span", "route-arrow", "›"),
  );
  const body = node("div", "route-body");
  details.append(summary, body);
  let loaded = false;
  details.addEventListener("toggle", async () => {
    if (!details.open || loaded) return;
    loaded = true;
    body.replaceChildren(node("p", "", "讀取站序…"));
    try {
      const rows = await bridge.queryAtVersion(
        version,
        "routeStops",
        route.id,
        direction,
      );
      const list = node("ol", "stop-timeline");
      rows.forEach((row) => {
        const board = from && row.id === from.id;
        const alight = to && row.id === to.id;
        const li = node("li", board ? "board" : alight ? "alight" : "");
        li.append(
          node("span", "sequence", row.seq),
          node("span", "", row.name),
        );
        if (board || alight) li.append(node("em", "", board ? "上車" : "下車"));
        list.append(li);
      });
      body.replaceChildren(
        node(
          "p",
          "",
          `${route.providers.join("、")} · ${rows.length} 個站牌${route.variants.length > 1 ? " · 含支線：" + route.variants.join("、") : ""}`,
        ),
        list,
      );
      if (!rows.length)
        body.append(node("p", "", "官方資料未提供這個方向的站序。"));
    } catch (error) {
      loaded = false;
      body.replaceChildren(node("p", "", error.message));
    }
  });
  return details;
}
function renderMatches(matches, started, description) {
  $("query-time").textContent =
    `本機查詢 · ${(performance.now() - started).toFixed(0)} ms`;
  if (!matches.length) {
    empty(
      "暫時找不到直達路線",
      "試試同名的另一個站位，或交換起訖站。本 Demo 不提供轉乘規劃。",
    );
    return;
  }
  $("results").replaceChildren(
    node(
      "p",
      "result-summary",
      `${description} · 共 ${matches.length} 個路線方向`,
    ),
    ...matches.map(routeCard),
  );
}
async function searchTrips() {
  if (!selected.start) throw new Error("請從搜尋結果選擇起站。");
  if ($("end-input").value.trim() && !selected.end)
    throw new Error("請從搜尋結果選擇迄站，或清空迄站欄位。");
  if (selected.start.id === selected.end?.id)
    throw new Error("起站與迄站相同，請選擇不同站位。");
  const version = ++revisions.results;
  const started = performance.now();
  const start = selected.start;
  const end = selected.end;
  $("form-message").textContent = "";
  const matches = end
    ? await bridge.query("trips", start.id, end.id)
    : await bridge.query("routesByStop", start.id);
  if (version === revisions.results && mode === "stops")
    renderMatches(
      matches,
      started,
      end ? `${start.name} → ${end.name}` : `經過 ${start.name}`,
    );
}
$("trip-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (mode === "stops") searchTrips().catch(showError);
});
$("swap").addEventListener("click", () => {
  const start = selected.start;
  choose("start", selected.end);
  choose("end", start);
});
$("reset").addEventListener("click", () => {
  choose("start", null);
  choose("end", null);
  revisions.results++;
  empty("先選一個起點", "從站名開始，找到經過你的那班公車。");
});
$("example").addEventListener("click", async () => {
  let request = ++operation;
  const cancelled = () => request !== operation || mode !== "stops";
  try {
    const routes = await bridge.query("searchRoutes", "307");
    if (cancelled()) return;
    const route = routes.find((r) => r.name === "307") || routes[0];
    if (!route) throw new Error("目前資料沒有 307，請手動搜尋其他路線。");
    const rows = await bridge.query("routeStops", route.id, "0");
    if (cancelled()) return;
    const usable = rows.filter((r) => !/裁撤|不停靠|停用|取消/.test(r.name));
    const from = usable[Math.floor(usable.length / 3)];
    const to = usable.find(
      (r) => r.seq > from?.seq + 5 && r.stopId !== from.stopId,
    );
    if (!from || !to) throw new Error("此路線資料不足，請手動選站。");
    const [start, end] = await Promise.all([
      bridge.query("stop", from.stopId),
      bridge.query("stop", to.stopId),
    ]);
    if (cancelled()) return;
    choose("start", start);
    choose("end", end);
    request = operation;
    await searchTrips();
  } catch (error) {
    if (!cancelled()) showError(error);
  }
});
function setMode(value) {
  invalidate();
  mode = value;
  revisions.results++;
  revisions.route++;
  for (const key of ["stops", "routes"]) {
    $("tab-" + key).setAttribute("aria-selected", String(key === value));
    $("tab-" + key).tabIndex = key === value ? 0 : -1;
    $(key + "-pane").hidden = key !== value;
  }
  $("form-message").textContent = "";
  empty(
    value === "stops" ? "先選一個起點" : "找一條熟悉的路線",
    value === "stops"
      ? "選好站位，再按「尋找直達路線」。"
      : "輸入路線名稱，查看去程與返程站序。",
  );
  if (value === "routes" && $("route-input").value)
    $("route-input").dispatchEvent(new Event("input"));
}
for (const key of ["stops", "routes"]) {
  $("tab-" + key).addEventListener("click", () => setMode(key));
  $("tab-" + key).addEventListener("keydown", (event) => {
    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const next =
        event.key === "Home"
          ? "stops"
          : event.key === "End"
            ? "routes"
            : key === "stops"
              ? "routes"
              : "stops";
      setMode(next);
      $("tab-" + next).focus();
    }
  });
}
let routeTimer;
$("route-input").addEventListener("input", () => {
  clearTimeout(routeTimer);
  const version = ++revisions.route;
  const text = $("route-input").value.trim();
  if (!text) {
    empty("找一條熟悉的路線", "輸入路線名稱，查看去程與返程站序。");
    return;
  }
  routeTimer = setTimeout(async () => {
    try {
      const started = performance.now();
      const routes = await bridge.query("searchRoutes", text);
      if (version !== revisions.route || mode !== "routes") return;
      if (!routes.length) {
        empty("找不到這條路線", "試試路線的一部分名稱，例如「藍」或「幹線」。");
        return;
      }
      renderMatches(
        routes.flatMap((route) =>
          ["0", "1"].map((direction) => ({ route, direction })),
        ),
        started,
        `${routes.length === 60 ? "前 " : ""}${routes.length} 條符合「${text}」的路線`,
      );
    } catch (error) {
      if (version === revisions.route) showError(error);
    }
  }, 180);
});

async function manualSync() {
  $("sync-now").disabled = true;
  try {
    await bridge.sync();
  } catch (error) {
    log(error.message);
  } finally {
    $("sync-now").disabled = false;
  }
}
$("sync-now").addEventListener("click", manualSync);
window.addEventListener("offline", network);
window.addEventListener("online", () => {
  network();
  if (bridge) manualSync();
});
network();
try {
  if (
    !window.isSecureContext ||
    !("indexedDB" in window) ||
    !("Worker" in window) ||
    !("DecompressionStream" in window)
  )
    throw new Error(
      "請使用新版 Chrome、Edge、Firefox 或 Safari，並透過 localhost 或 HTTPS 開啟。",
    );
  bridge = new BusBridge();
  bridge.addEventListener("ready", (event) => {
    setMeta(event.detail);
    if (shellReady) $("shell-status").textContent = "已保存，可離線重開";
  });
  bridge.addEventListener("status", ({ detail }) => {
    status(detail.message, detail.phase === "ready" ? "" : "busy");
    $("sync-now").disabled = detail.phase !== "ready";
    if (detail.meta) setMeta(detail.meta);
    if (detail.phase === "ready")
      status(navigator.onLine ? detail.message : "離線中，使用已儲存資料");
    log(detail.message);
  });
  bridge.addEventListener("syncerror", ({ detail }) => {
    status(bridge.ready ? "更新未完成，保留既有資料" : "尚未取得資料", "error");
    $("sync-detail").textContent =
      `${detail.message}。${detail.retryMs ? Math.round(detail.retryMs / 1000) + " 秒後自動重試，也可立即檢查更新。" : "請重新整理或檢查瀏覽器儲存空間。"}`;
    $("sync-now").disabled = false;
    log(detail.message);
  });
} catch (error) {
  status("目前無法啟動", "error");
  $("sync-detail").textContent = error.message;
  $("sync-now").disabled = true;
}

if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker
    .register(new URL("../sw.js", import.meta.url))
    .then(() => navigator.serviceWorker.ready)
    .then(() => {
      shellReady = true;
      $("shell-status").textContent = bridge?.ready
        ? "已保存，可離線重開"
        : "頁面已保存，等待資料";
    })
    .catch((error) => {
      $("shell-status").textContent = "無法保存頁面";
      log("離線頁面：" + error.message);
    });
} else $("shell-status").textContent = "瀏覽器不支援";
