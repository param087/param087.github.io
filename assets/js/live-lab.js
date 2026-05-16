/* live-lab.js — renders the activity stream, pulse banner, stats, heatmap. */

import { getActivityClient, timeAgo, agentColor } from "./activity-client.js";

const MAX_RENDER = 30;

function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "style") n.setAttribute("style", v);
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) n.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null) continue;
    n.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return n;
}

function renderEvent(e, isNew) {
  const color = agentColor(e.agent);
  return el("article", {
    class: "event" + (isNew ? " event--new" : ""),
    style: `--agent-color:${color}`,
    "data-id": e.id,
  },
    el("time", { class: "event__time", datetime: e.ts }, timeAgo(e.ts)),
    el("div", { class: "event__body" },
      el("p", { class: "event__summary" }, e.summary),
      el("div", { class: "event__meta" },
        el("span", { class: "agent-badge", style: `--agent-color:${color}` },
          el("span", { class: "dot", style: `background:${color};width:6px;height:6px;border-radius:50%` }),
          e.agent
        ),
        el("span", { class: "event__meta-item" }, `· ${e.type}`),
        e.project ? el("span", { class: "event__meta-item" }, `· ${e.project}`) : null,
        e.model ? el("span", { class: "event__meta-item" }, `· ${e.model}`) : null,
        Number.isFinite(e.duration_ms) ? el("span", { class: "event__meta-item" }, `· ${(e.duration_ms/1000).toFixed(1)}s`) : null,
      )
    ),
  );
}

function renderStreamInto(container, events, newIds) {
  if (!events || events.length === 0) {
    container.replaceChildren(
      el("div", { class: "stream-empty" }, "Waiting for agents to report in…")
    );
    return;
  }
  const slice = events.slice(0, MAX_RENDER);
  container.replaceChildren(...slice.map(e => renderEvent(e, newIds.has(e.id))));
}

function renderBannerInto(container, events) {
  if (!events || events.length === 0) {
    container.replaceChildren(
      el("span", { class: "pulse-banner__item" }, "no live activity yet — be the first agent to ping in")
    );
    return;
  }
  // Take latest 8, duplicate for seamless marquee.
  const items = events.slice(0, 8).map(e => {
    const color = agentColor(e.agent);
    return el("span", { class: "pulse-banner__item" },
      el("span", { style: `color:${color}` }, `▍${e.agent}`),
      el("span", {}, ` ${e.type}: ${e.summary.length > 80 ? e.summary.slice(0,80)+"…" : e.summary}`),
    );
  });
  container.replaceChildren(...items, ...items.map(n => n.cloneNode(true)));
}

/* Stats panel */
async function loadStats(baseUrl) {
  if (!baseUrl) return null;
  try {
    const res = await fetch(`${baseUrl}/stats`, { cache: "no-store" });
    if (!res.ok) throw new Error("stats " + res.status);
    return await res.json();
  } catch { return null; }
}

function renderStatsInto(container, stats) {
  if (!stats) {
    container.replaceChildren(el("div", { class: "stream-empty" }, "Stats unavailable."));
    return;
  }
  const tiles = el("div", { class: "stats-grid" },
    el("div", { class: "stat-tile" },
      el("div", { class: "stat-tile__label" }, "Today"),
      el("div", { class: "stat-tile__value" }, String(stats.today?.events ?? 0)),
    ),
    el("div", { class: "stat-tile" },
      el("div", { class: "stat-tile__label" }, "Last 7 days"),
      el("div", { class: "stat-tile__value" }, String(stats.last_7d?.events ?? 0)),
    ),
    el("div", { class: "stat-tile" },
      el("div", { class: "stat-tile__label" }, "Last 30 days"),
      el("div", { class: "stat-tile__value" }, String(stats.last_30d?.events ?? 0)),
    ),
    el("div", { class: "stat-tile" },
      el("div", { class: "stat-tile__label" }, "Top project"),
      el("div", { class: "stat-tile__value", style: "font-size:1rem" }, stats.top_project?.project ?? "—"),
    ),
  );

  const byAgentArr = Array.isArray(stats.by_agent) ? stats.by_agent : [];
  const byAgent = Object.fromEntries(byAgentArr.map(({ agent, c }) => [agent, c]));
  const total = Math.max(1, Object.values(byAgent).reduce((a,b)=>a+b,0));
  const bars = el("div", { style: "margin-top: var(--sp-5)" },
    el("div", { class: "stat-tile__label", style: "margin-bottom: var(--sp-3)" }, "By agent (last 30 days)"),
    ...Object.entries(byAgent).sort((a,b)=>b[1]-a[1]).map(([name, n]) =>
      el("div", { class: "stat-bar" },
        el("span", { class: "stat-bar__label", style: `color:${agentColor(name)}` }, name),
        el("div", { class: "stat-bar__track" },
          el("div", { class: "stat-bar__fill", style: `width:${(n/total*100).toFixed(1)}%` })
        ),
        el("span", { class: "stat-bar__count" }, String(n)),
      )
    )
  );

  container.replaceChildren(tiles, bars);
}

function renderHeatmapInto(container, stats) {
  const raw = stats?.heatmap ?? [];
  // Worker emits {day, c} where day = epoch_ms / 86400000. Normalize.
  const heat = raw.map(d => ({
    count: d.count ?? d.c ?? 0,
    date: d.date ?? new Date((d.day ?? 0) * 86_400_000).toISOString().slice(0, 10),
  }));
  if (!heat.length) {
    container.replaceChildren(el("div", { class: "stream-empty" }, "Heatmap will populate as agents check in."));
    return;
  }
  const max = Math.max(1, ...heat.map(d => d.count));
  const cells = heat.map(d => {
    const lvl = d.count === 0 ? 0 : Math.min(4, Math.ceil(d.count / max * 4));
    return el("div", { class: "heatmap__cell", "data-l": String(lvl), title: `${d.date}: ${d.count}` });
  });
  const grid = el("div", { class: "heatmap" }, ...cells);
  container.replaceChildren(grid);
}

/* Tabs */
function wireTabs(tabsRoot) {
  const tabs = Array.from(tabsRoot.querySelectorAll("[role=tab]"));
  const panels = Array.from(document.querySelectorAll(".lab-panel"));
  const activate = (tab) => {
    tabs.forEach(t => t.setAttribute("aria-selected", t === tab ? "true" : "false"));
    panels.forEach(p => p.hidden = true);
    const panel = document.getElementById(tab.getAttribute("aria-controls"));
    if (panel) panel.hidden = false;
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => activate(tab));
    tab.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") { e.preventDefault(); const n = tabs[(i + 1) % tabs.length]; n.focus(); n.click(); }
      if (e.key === "ArrowLeft")  { e.preventDefault(); const n = tabs[(i - 1 + tabs.length) % tabs.length]; n.focus(); n.click(); }
    });
  });
}

/* Stack card live counts */
function updateStackCounts(byAgent) {
  document.querySelectorAll("[data-stack-agent]").forEach(card => {
    const name = card.getAttribute("data-stack-agent");
    const countEl = card.querySelector(".stack-card__count");
    if (countEl) countEl.textContent = String(byAgent[name] ?? 0);
  });
}

/* Stat strip in hero */
function updateHeroStats(stats) {
  const map = {
    "stat-today": stats?.today?.events,
    "stat-7d": stats?.last_7d?.events,
    "stat-30d": stats?.last_30d?.events,
  };
  for (const [id, v] of Object.entries(map)) {
    const node = document.getElementById(id);
    if (!node) continue;
    const target = Number(v ?? 0);
    animateCount(node, target);
  }
}

function animateCount(node, target) {
  const prev = Number(node.dataset.value);
  const start = Number.isFinite(prev) ? prev : 0;
  const safeTarget = Number.isFinite(target) ? target : 0;
  const dur = 700;
  const t0 = performance.now();
  function step(t) {
    const k = Math.min(1, (t - t0) / dur);
    const eased = 1 - Math.pow(1 - k, 3);
    const v = Math.round(start + (safeTarget - start) * eased);
    node.textContent = v.toLocaleString();
    if (k < 1) requestAnimationFrame(step);
    else node.dataset.value = String(safeTarget);
  }
  requestAnimationFrame(step);
}

/* Boot */
export function initLiveLab() {
  const client = getActivityClient();
  const baseUrl = client.baseUrl;

  const banner = document.querySelector("[data-pulse-banner-track]");
  const stream = document.getElementById("activity-stream");
  const statsPanel = document.getElementById("lab-stats");
  const heatPanel = document.getElementById("lab-heatmap");
  const tabsRoot = document.querySelector("[data-lab-tabs]");
  if (tabsRoot) wireTabs(tabsRoot);

  const newIds = new Set();

  document.addEventListener("agent-stream:update", (ev) => {
    const { events, newEvents = [] } = ev.detail || {};
    newEvents.forEach(e => newIds.add(e.id));
    if (banner) renderBannerInto(banner, events);
    if (stream) renderStreamInto(stream, events, newIds);
    // clear "new" flag shortly after to avoid permanent animation
    setTimeout(() => newEvents.forEach(e => newIds.delete(e.id)), 1200);
  });

  client.start();

  // Periodic stats refresh
  async function refreshStats() {
    const stats = await loadStats(baseUrl);
    if (statsPanel) renderStatsInto(statsPanel, stats);
    if (heatPanel) renderHeatmapInto(heatPanel, stats);
    if (stats) {
      const byAgentMap = Array.isArray(stats.by_agent)
        ? Object.fromEntries(stats.by_agent.map(({ agent, c }) => [agent, c]))
        : (stats.by_agent || {});
      updateStackCounts(byAgentMap);
      updateHeroStats(stats);
    }
  }
  refreshStats();
  setInterval(refreshStats, 60_000);
}
