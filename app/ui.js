import { BusBridge } from "./bridge.js";
import { validPosition } from "./groups.js";
import { setupCacheViewer } from "./cache-viewer.js";

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
    ? `✓ ${stop.kind === "hub" ? "全部站區" : stop.area} · 自動比對 ${stop.stopIds.length} 個站位`
    : "";
  $("form-message").textContent = "";
}
function invalidate() {
  operation++;
  revisions.results++;
  if ($("results").querySelector(".route-card"))
    empty("選擇已變更", "選好起訖站後，重新按「尋找直達路線」。");
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
        const response = await bridge.query("searchStations", text);
        const rows = response.groups;
        if (version !== revisions[which] || mode !== "stops") return;
        const items = rows.map((stop) => {
          const li = node("li");
          const button = node(
            "button",
            "candidate " +
              (stop.kind === "hub"
                ? "station-hub"
                : stop.parentId
                  ? "station-area"
                  : ""),
          );
          button.type = "button";
          button.append(
            node("strong", "", stop.name),
            node(
              "small",
              "",
              stop.kind === "hub"
                ? `${stop.areas.join("、")} · 合併搜尋 ${stop.stopIds.length} 個站位`
                : `${stop.area} · ${stop.stopIds.length} 個站位，自動選方向`,
            ),
          );
          button.addEventListener("click", () => {
            choose(which, stop);
            $(which === "start" ? "end-input" : "search-trips").focus();
          });
          li.append(button);
          return li;
        });
        if (response.suggestion)
          items.unshift(
            node(
              "li",
              "candidate-message suggestion",
              `找不到「${text}」。你可能要找「${response.suggestion}」：`,
            ),
          );
        if (response.total > 60)
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
                node(
                  "li",
                  "candidate-message",
                  "找不到站名，試試較短的名稱或道路站區。",
                ),
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
    if (event.key === "Escape") {
      revisions[which]++;
      $(which + "-list").hidden = true;
    }
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
      revisions[which]++;
      $(which + "-list").hidden = true;
      $(which + "-input").focus();
    }
  });
}

function locationCard(row, label) {
  const block = node("div", "boarding-point");
  block.dataset.stopId = row.stopId;
  block.dataset.seq = row.seq;
  const location = row.location || {};
  block.append(
    node("span", "boarding-label", label),
    node("strong", "", row.name),
  );
  const directions = {
    N: "北",
    NE: "東北",
    E: "東",
    SE: "東南",
    S: "南",
    SW: "西南",
    W: "西",
    NW: "西北",
  };
  block.append(node("p", "", location.address || "官方未提供地址"));
  if (directions[location.bearing])
    block.append(node("small", "", `方向：${directions[location.bearing]}向`));
  if (validPosition(location)) {
    const link = node("a", "map-link", "Google 地圖定位 ↗");
    link.href =
      "https://www.google.com/maps/search/?api=1&query=" +
      encodeURIComponent(`${location.lat},${location.lon}`);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    block.append(link);
  }
  return block;
}
function routeCard(match) {
  const version = dataVersion;
  const { route } = match;
  let direction = match.direction;
  let choice = match.options?.[0] || { from: match.from, to: match.to };
  let rows;
  let loadRevision = 0;
  const card = node("article", "route-card");
  card.dataset.routeId = route.id;
  const header = node("div", "route-header");
  const info = node("div", "route-info");
  const title = node("strong");
  const subtitle = node(
    "small",
    "",
    `${route.departure} ↔ ${route.destination}`,
  );
  info.append(title, subtitle);
  const updateTitle = () =>
    title.replaceChildren(
      node("span", "direction-label", direction === "0" ? "去程" : "返程"),
      document.createTextNode(
        `往 ${direction === "0" ? route.destination : route.departure}`,
      ),
    );
  updateTitle();
  header.append(node("span", "route-number", route.name), info);
  card.append(header);
  const places = node("div", "boarding-places");
  const details = node("details", "route-details");
  const summary = node("summary");
  summary.append(
    document.createTextNode("查看完整站序"),
    node("span", "route-arrow", "›"),
  );
  const body = node("div", "route-body");
  details.append(summary, body);
  function drawTimeline() {
    const list = node("ol", "stop-timeline");
    for (const row of rows) {
      const board = choice.from?.id === row.id;
      const alight = choice.to?.id === row.id;
      const li = node("li", board ? "board" : alight ? "alight" : "");
      li.append(node("span", "sequence", row.seq), node("span", "", row.name));
      if (board || alight) li.append(node("em", "", board ? "上車" : "下車"));
      list.append(li);
    }
    body.replaceChildren(
      node(
        "p",
        "",
        `${route.providers.join("、")} · ${rows.length} 個站牌${route.variants.length > 1 ? " · 官方另列服務：" + route.variants.join("、") : ""}`,
      ),
      list,
    );
    if (!rows.length)
      body.append(node("p", "", "官方資料未提供這個方向的站序。"));
  }
  function drawPlaces() {
    places.replaceChildren();
    if (choice.from) places.append(locationCard(choice.from, "上車"));
    if (choice.to) places.append(locationCard(choice.to, "下車"));
    if (rows) drawTimeline();
  }
  if (match.options?.length > 1) {
    const label = node(
      "label",
      "option-label",
      `${match.options.length} 組可用${choice.to ? "上下車" : "上車"}位置`,
    );
    const select = node("select", "trip-options");
    select.setAttribute(
      "aria-label",
      `${route.name}${direction === "0" ? "去程" : "返程"}的上下車位置`,
    );
    match.options.forEach((option, i) => {
      const description = `${option.from.location?.address || option.from.name}${option.to ? " → " + (option.to.location?.address || option.to.name) : ""}`;
      const item = node("option", "", description);
      item.value = String(i);
      select.append(item);
    });
    select.addEventListener("change", () => {
      choice = match.options[Number(select.value)];
      drawPlaces();
    });
    label.append(select);
    card.append(label);
  }
  if (match.switchDirection) {
    const select = node("select", "direction-select");
    select.setAttribute("aria-label", `${route.name}的行駛方向`);
    for (const d of ["0", "1"]) {
      const option = node(
        "option",
        "",
        `${d === "0" ? "去程" : "返程"} · 往 ${d === "0" ? route.destination : route.departure}`,
      );
      option.value = d;
      select.append(option);
    }
    select.addEventListener("change", () => {
      direction = select.value;
      rows = null;
      loadRevision++;
      updateTitle();
      if (details.open) loadTimeline();
    });
    card.append(select);
  }
  drawPlaces();
  if (choice.from)
    card.append(
      places,
      node("p", "map-note", "定位依官方站位座標；外部地圖需連線。"),
    );
  card.append(details);
  async function loadTimeline() {
    if (!details.open || rows) return;
    const request = ++loadRevision;
    body.replaceChildren(node("p", "", "讀取站序…"));
    try {
      const loaded = await bridge.queryAtVersion(
        version,
        "routeStops",
        route.id,
        direction,
      );
      if (request !== loadRevision) return;
      rows = loaded;
      drawTimeline();
    } catch (error) {
      if (request === loadRevision)
        body.replaceChildren(node("p", "", error.message));
    }
  }
  details.addEventListener("toggle", loadTimeline);
  return card;
}
function renderMatches(matches, started, description) {
  $("query-time").textContent =
    `本機查詢 · ${(performance.now() - started).toFixed(0)} ms`;
  if (!matches.length) {
    empty(
      "暫時找不到直達路線",
      "已檢查所選站群的所有站位，沒有符合方向與站序的直達路線。本 Demo 不提供轉乘規劃。",
    );
    return;
  }
  $("results").replaceChildren(
    node(
      "p",
      "result-summary",
      matches[0]?.switchDirection
        ? description
        : `${description} · 共 ${matches.length} 個路線方向`,
    ),
    ...matches.map(routeCard),
  );
}
async function searchTrips() {
  if (!selected.start) throw new Error("請從搜尋結果選擇起站。");
  if ($("end-input").value.trim() && !selected.end)
    throw new Error("請從搜尋結果選擇迄站，或清空迄站欄位。");
  if (selected.start.id === selected.end?.id)
    throw new Error("起站與迄站相同，請選擇不同站名或站區。");
  const version = ++revisions.results;
  operation++;
  const started = performance.now();
  const start = selected.start;
  const end = selected.end;
  $("form-message").textContent = "";
  try {
    const matches = end
      ? await bridge.query("groupTrips", start.id, end.id)
      : await bridge.query("groupRoutes", start.id);
    if (version === revisions.results && mode === "stops")
      renderMatches(
        matches,
        started,
        end ? `${start.name} → ${end.name}` : `經過 ${start.name}`,
      );
  } catch (error) {
    if (version === revisions.results && mode === "stops") showError(error);
  }
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
      bridge.query("groupForStop", from.stopId),
      bridge.query("groupForStop", to.stopId),
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
  revisions.start++;
  revisions.end++;
  $("start-list").hidden = true;
  $("end-list").hidden = true;
  for (const key of ["stops", "routes"]) {
    $("tab-" + key).setAttribute("aria-selected", String(key === value));
    $("tab-" + key).tabIndex = key === value ? 0 : -1;
    $(key + "-pane").hidden = key !== value;
  }
  $("form-message").textContent = "";
  empty(
    value === "stops" ? "先選一個起點" : "找一條熟悉的路線",
    value === "stops"
      ? "選好站名或站區，再按「尋找直達路線」。"
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
        routes.map((route) => ({
          route,
          direction: "0",
          switchDirection: true,
        })),
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
  setupCacheViewer(bridge);
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
