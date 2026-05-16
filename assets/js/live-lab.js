/* live-lab.js — renders the activity stream, pulse banner, stats, rhythm grid.
 *
 * Event payload shape:
 *   agent, model, ts, duration_ms, tokens, type (9-value enum),
 *   meta: { tool_calls, files_touched, lines_added, lines_removed },
 *   summary?: short LLM-generated one-liner (scrubbed client-side before send),
 *   project?: repo / working-folder basename.
 */

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

/* ---------- formatters ---------------------------------------------------- */

function tsToIso(ts) {
  if (typeof ts === "number" && Number.isFinite(ts)) return new Date(ts).toISOString();
  if (typeof ts === "string") return ts;
  return "";
}

function fmtDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s - m * 60);
  return rem ? `${m}m${rem}s` : `${m}m`;
}

function fmtNum(n) {
  if (!Number.isFinite(n)) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

function stripModelPrefix(model) {
  if (!model) return "";
  return model.replace(/^github-copilot\//, "").replace(/^anthropic\//, "");
}

/* ---------- agent metadata (for dynamic stack-grid + colors) -------------- */

const AGENT_META = {
  opencode:      { name: "OpenCode",       role: "Pair-coding CLI" },
  "claude-code": { name: "Claude Code",    role: "Long-context refactors" },
  copilot:       { name: "GitHub Copilot", role: "In-editor completions" },
  codex:         { name: "Codex",          role: "Code generation" },
  jules:         { name: "Jules",          role: "Background agent" },
  cursor:        { name: "Cursor",         role: "AI editor" },
  aider:         { name: "Aider",          role: "Git-aware pair" },
  other:         { name: "Other",          role: "Other agents" },
};
function agentMeta(name) {
  return AGENT_META[name] ?? { name, role: "Agent" };
}

/* ---------- task metadata ------------------------------------------------- */

const TASK_PALETTE = {
  code:     "#22d3ee",
  refactor: "#f59e0b",
  test:     "#a3e635",
  debug:    "#f87171",
  deploy:   "#c084fc",
  idea:     "#fbbf24",
  review:   "#60a5fa",
  docs:     "#34d399",
  chore:    "#94a3b8",
};
function taskColor(t) {
  return TASK_PALETTE[t] ?? "#94a3b8";
}

/* ---------- metric pills -------------------------------------------------- */

function metricPills(e) {
  const m = e.meta || {};
  const pills = [];
  const ft = Number(m.files_touched) || 0;
  if (ft) pills.push(el("span", { class: "metric-pill" }, `${ft} file${ft === 1 ? "" : "s"}`));
  const tc = Number(m.tool_calls) || 0;
  if (tc) pills.push(el("span", { class: "metric-pill" }, `${fmtNum(tc)} tool${tc === 1 ? "" : "s"}`));
  const dur = fmtDuration(Number(e.duration_ms));
  if (dur) pills.push(el("span", { class: "metric-pill" }, dur));
  return pills;
}

function metricDigestText(e) {
  const m = e.meta || {};
  const parts = [];
  const ft = Number(m.files_touched) || 0;
  if (ft) parts.push(`${ft} file${ft === 1 ? "" : "s"}`);
  const tc = Number(m.tool_calls) || 0;
  if (tc) parts.push(`${fmtNum(tc)} tool${tc === 1 ? "" : "s"}`);
  const dur = fmtDuration(Number(e.duration_ms));
  if (dur) parts.push(dur);
  return parts.join(" · ") || "session";
}

/* ---------- stream -------------------------------------------------------- */

function renderEvent(e, isNew) {
  const color = agentColor(e.agent);
  const model = stripModelPrefix(e.model);
  const iso = tsToIso(e.ts);
  const task = typeof e.type === "string" && e.type ? e.type : null;
  const summary = typeof e.summary === "string" && e.summary.trim() ? e.summary.trim() : null;
  const project = typeof e.project === "string" && e.project.trim() ? e.project.trim() : null;
  return el("article", {
    class: "event" + (isNew ? " event--new" : ""),
    style: `--agent-color:${color}`,
    "data-id": e.id,
  },
    el("time", { class: "event__time", datetime: iso }, timeAgo(iso)),
    el("div", { class: "event__body" },
      summary ? el("p", { class: "event__summary" }, summary) : null,
      el("div", { class: "event__meta event__meta--top" },
        el("span", { class: "agent-badge", style: `--agent-color:${color}` },
          el("span", { class: "dot", style: `background:${color};width:6px;height:6px;border-radius:50%` }),
          e.agent
        ),
        task ? el("span", {
          class: "event__task",
          "data-type": task,
          style: `--task-color:${taskColor(task)}`,
        }, task) : null,
        model ? el("span", { class: "event__meta-item" }, `· ${model}`) : null,
        project ? el("span", { class: "event__meta-item event__meta-item--project" }, `· ${project}`) : null,
      ),
      el("div", { class: "event__pills" }, ...metricPills(e)),
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

/* ---------- pulse banner -------------------------------------------------- */

function renderBannerInto(container, events) {
  if (!events || events.length === 0) {
    container.replaceChildren(
      el("span", { class: "pulse-banner__item" }, "no live activity yet — be the first agent to ping in")
    );
    return;
  }
  const items = events.slice(0, 8).map(e => {
    const color = agentColor(e.agent);
    const model = stripModelPrefix(e.model);
    const summary = typeof e.summary === "string" && e.summary.trim() ? e.summary.trim() : null;
    const project = typeof e.project === "string" && e.project.trim() ? e.project.trim() : null;
    const tail = [model, project].filter(Boolean).join(" · ");
    const headline = summary || metricDigestText(e);
    return el("span", { class: "pulse-banner__item" },
      el("span", { style: `color:${color}` }, `▍${e.agent}`),
      el("span", {}, tail ? ` ${headline} — ${tail}` : ` ${headline}`),
    );
  });
  container.replaceChildren(...items, ...items.map(n => n.cloneNode(true)));
}

/* ---------- stats --------------------------------------------------------- */

async function loadStats(baseUrl) {
  if (!baseUrl) return null;
  try {
    const res = await fetch(`${baseUrl}/stats`, { cache: "no-store" });
    if (!res.ok) throw new Error("stats " + res.status);
    return await res.json();
  } catch { return null; }
}

function tile(label, value, opts = {}) {
  return el("div", { class: "stat-tile" },
    el("div", { class: "stat-tile__label" }, label),
    el("div", { class: "stat-tile__value", style: opts.small ? "font-size:1rem" : null }, String(value ?? "—")),
  );
}

function renderStatsInto(container, stats) {
  if (!stats) {
    container.replaceChildren(el("div", { class: "stream-empty" }, "Stats unavailable."));
    return;
  }
  const wToday = stats.today || {};
  const w7 = stats.last_7d || {};
  const w30 = stats.last_30d || {};

  const eventTiles = el("div", { class: "stats-grid" },
    tile("Today", wToday.events ?? 0),
    tile("Last 7 days", w7.events ?? 0),
    tile("Last 30 days", w30.events ?? 0),
    tile("Tool calls (30d)", fmtNum(w30.tool_calls ?? 0)),
    tile("Files touched (30d)", fmtNum(w30.files_touched ?? 0)),
  );

  const byTaskArr = Array.isArray(stats.by_type) ? stats.by_type.slice() : [];
  byTaskArr.sort((a, b) => (Number(b.c) || 0) - (Number(a.c) || 0));
  const totalT = Math.max(1, byTaskArr.reduce((a, b) => a + (Number(b.c) || 0), 0));
  const taskBars = el("div", { style: "margin-top: var(--sp-5)" },
    el("div", { class: "stat-tile__label", style: "margin-bottom: var(--sp-3)" }, "What agents are working on (last 30 days)"),
    byTaskArr.length
      ? el("div", {}, ...byTaskArr.map(({ type, c }) => {
          const color = taskColor(type);
          const n = Number(c) || 0;
          return el("div", { class: "stat-bar stat-bar--task" },
            el("span", { class: "stat-bar__label", style: `color:${color}` }, type),
            el("div", { class: "stat-bar__track" },
              el("div", { class: "stat-bar__fill", style: `width:${(n / totalT * 100).toFixed(1)}%; background:${color}` })
            ),
            el("span", { class: "stat-bar__count" }, String(n)),
          );
        }))
      : el("div", { class: "stream-empty" }, "No task data yet.")
  );

  const byAgentArr = Array.isArray(stats.by_agent) ? stats.by_agent : [];
  const byAgent = Object.fromEntries(byAgentArr.map(({ agent, c }) => [agent, c]));
  const totalA = Math.max(1, Object.values(byAgent).reduce((a,b)=>a+b,0));
  const agentBars = el("div", { style: "margin-top: var(--sp-5)" },
    el("div", { class: "stat-tile__label", style: "margin-bottom: var(--sp-3)" }, "By agent (last 30 days)"),
    ...Object.entries(byAgent).sort((a,b)=>b[1]-a[1]).map(([name, n]) =>
      el("div", { class: "stat-bar" },
        el("span", { class: "stat-bar__label", style: `color:${agentColor(name)}` }, name),
        el("div", { class: "stat-bar__track" },
          el("div", { class: "stat-bar__fill", style: `width:${(n/totalA*100).toFixed(1)}%` })
        ),
        el("span", { class: "stat-bar__count" }, String(n)),
      )
    )
  );

  container.replaceChildren(eventTiles, taskBars, agentBars);
}

/* ---------- hour-of-week rhythm grid ------------------------------------- *
 * Server emits stats.hour_of_week: [{ dow, hour, c }, …]  with dow 0=Sun..6=Sat
 * (SQLite strftime('%w')). We re-map to Mon-first rows for display. All
 * buckets are UTC; the caption makes that explicit.                         */

const RHYTHM_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// dow (Sun=0..Sat=6) → row index in Mon-first layout
const DOW_TO_ROW = [6, 0, 1, 2, 3, 4, 5];

function renderHourOfWeekInto(container, stats) {
  const raw = Array.isArray(stats?.hour_of_week) ? stats.hour_of_week : [];
  if (!raw.length) {
    container.replaceChildren(
      el("div", { class: "stream-empty" }, "Rhythm grid will populate as agents check in.")
    );
    return;
  }

  // Bucket into a 7×24 dense matrix.
  const matrix = Array.from({ length: 7 }, () => Array(24).fill(0));
  let max = 0;
  for (const { dow, hour, c } of raw) {
    const r = DOW_TO_ROW[Number(dow)];
    const h = Number(hour);
    const n = Number(c) || 0;
    if (r == null || !Number.isFinite(h) || h < 0 || h > 23) continue;
    matrix[r][h] = n;
    if (n > max) max = n;
  }
  if (max === 0) {
    container.replaceChildren(
      el("div", { class: "stream-empty" }, "Rhythm grid will populate as agents check in.")
    );
    return;
  }

  // Hour tick labels (sparse: 00, 06, 12, 18) along the top.
  const ticks = el("div", { class: "how__ticks" },
    el("span", { class: "how__corner" }),
    ...Array.from({ length: 24 }, (_, h) =>
      el("span", { class: "how__tick" }, h % 6 === 0 ? String(h).padStart(2, "0") : "")
    ),
  );

  const rows = matrix.map((row, ri) => {
    const cells = row.map((count, h) => {
      const lvl = count === 0 ? 0 : Math.min(4, Math.ceil(count / max * 4));
      const label = `${RHYTHM_DAYS[ri]} ${String(h).padStart(2, "0")}:00 UTC — ${count} event${count === 1 ? "" : "s"}`;
      return el("div", { class: "how__cell", "data-l": String(lvl), title: label });
    });
    return el("div", { class: "how__row" },
      el("span", { class: "how__label" }, RHYTHM_DAYS[ri]),
      ...cells,
    );
  });

  const grid = el("div", { class: "hour-of-week" }, ticks, ...rows);
  const caption = el("p", { class: "how__caption" }, "all times UTC · last 90 days");
  container.replaceChildren(grid, caption);
}

/* ---------- tabs ---------------------------------------------------------- */

function wireTabs(tabsRoot, onActivate) {
  const tabs = Array.from(tabsRoot.querySelectorAll("[role=tab]"));
  const panels = Array.from(document.querySelectorAll(".lab-panel"));
  const activate = (tab) => {
    tabs.forEach(t => t.setAttribute("aria-selected", t === tab ? "true" : "false"));
    panels.forEach(p => p.hidden = true);
    const panel = document.getElementById(tab.getAttribute("aria-controls"));
    if (panel) panel.hidden = false;
    if (typeof onActivate === "function") onActivate(tab.id);
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => activate(tab));
    tab.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") { e.preventDefault(); const n = tabs[(i + 1) % tabs.length]; n.focus(); n.click(); }
      if (e.key === "ArrowLeft")  { e.preventDefault(); const n = tabs[(i - 1 + tabs.length) % tabs.length]; n.focus(); n.click(); }
    });
  });
}

function renderStackInto(container, byAgentArr) {
  if (!container) return;
  const entries = (Array.isArray(byAgentArr) ? byAgentArr : [])
    .map(({ agent, c }) => ({ agent: String(agent), count: Number(c) || 0 }))
    .filter(e => e.count > 0)
    .sort((a, b) => b.count - a.count);

  if (entries.length === 0) {
    container.replaceChildren(
      el("div", { class: "stream-empty" }, "Agents will appear here as they ping in…")
    );
    return;
  }

  const cards = entries.map(({ agent, count }) => {
    const meta = agentMeta(agent);
    const color = agentColor(agent);
    return el("div", {
      class: "stack-card",
      "data-stack-agent": agent,
      style: `--agent-color:${color}`,
    },
      el("span", { class: "stack-card__role" }, meta.role),
      el("span", { class: "stack-card__name" }, meta.name),
      el("span", { class: "stack-card__count" }, String(count)),
    );
  });
  container.replaceChildren(...cards);
}

function updateHeroStats(stats) {
  const map = {
    "stat-today": stats?.today?.events,
    "stat-7d": stats?.last_7d?.events,
    "stat-30d": stats?.last_30d?.events,
  };
  for (const [id, v] of Object.entries(map)) {
    const node = document.getElementById(id);
    if (!node) continue;
    animateCount(node, Number(v ?? 0));
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

/* ---------- boot ---------------------------------------------------------- */

export function initLiveLab() {
  const client = getActivityClient();
  const baseUrl = client.baseUrl;

  const banner = document.querySelector("[data-pulse-banner-track]");
  const stream = document.getElementById("activity-stream");
  const statsPanel = document.getElementById("lab-stats");
  const rhythmPanel = document.getElementById("lab-rhythm");
  const tabsRoot = document.querySelector("[data-lab-tabs]");

  const newIds = new Set();
  const stackGrid = document.getElementById("stack-grid");

  document.addEventListener("agent-stream:update", (ev) => {
    const { events, newEvents = [] } = ev.detail || {};
    newEvents.forEach(e => newIds.add(e.id));
    if (banner) renderBannerInto(banner, events);
    if (stream) renderStreamInto(stream, events, newIds);
    setTimeout(() => newEvents.forEach(e => newIds.delete(e.id)), 1200);
  });

  client.start();

  async function refreshStats() {
    const stats = await loadStats(baseUrl);
    if (statsPanel) renderStatsInto(statsPanel, stats);
    if (rhythmPanel) renderHourOfWeekInto(rhythmPanel, stats);
    if (stats) {
      const byAgentArr = Array.isArray(stats.by_agent) ? stats.by_agent : [];
      if (stackGrid) renderStackInto(stackGrid, byAgentArr);
      updateHeroStats(stats);
    }
  }

  // Always do an initial fetch so the hero counters + stack populate even if
  // the user never visits the Stats/Rhythm tabs.
  refreshStats();

  // Cache API serves /stats with a 5-minute TTL; matching the client cadence
  // keeps us off the origin path entirely between refreshes.
  setInterval(refreshStats, 300_000);

  // Refresh immediately on tab activation so the user sees fresh numbers when
  // switching to Stats or Rhythm.
  if (tabsRoot) {
    wireTabs(tabsRoot, (tabId) => {
      if (tabId === "tab-stats" || tabId === "tab-rhythm") refreshStats();
    });
  }
}
