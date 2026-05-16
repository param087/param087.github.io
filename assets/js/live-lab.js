/* live-lab.js — renders the activity stream, pulse banner, stats, heatmap.
 *
 * Privacy contract: events carry NO summary, NO project, NO file paths,
 * NO commands. Only agent, model, ts, duration_ms, tokens, a numeric meta
 * digest (tool_calls, files_touched), and a task `type` from a fixed
 * 9-value enum (code/refactor/test/debug/deploy/idea/review/docs/chore).
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
  const tok = Number(e.tokens) || 0;
  if (tok) pills.push(el("span", { class: "metric-pill" }, `${fmtNum(tok)} tok`));
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
  const tok = Number(e.tokens) || 0;
  if (tok) parts.push(`${fmtNum(tok)} tok`);
  return parts.join(" · ") || "session";
}

/* ---------- stream -------------------------------------------------------- */

function renderEvent(e, isNew) {
  const color = agentColor(e.agent);
  const model = stripModelPrefix(e.model);
  const iso = tsToIso(e.ts);
  const task = typeof e.type === "string" && e.type ? e.type : null;
  return el("article", {
    class: "event" + (isNew ? " event--new" : ""),
    style: `--agent-color:${color}`,
    "data-id": e.id,
  },
    el("time", { class: "event__time", datetime: iso }, timeAgo(iso)),
    el("div", { class: "event__body" },
      el("div", { class: "event__meta event__meta--top" },
        el("span", { class: "agent-badge", style: `--agent-color:${color}` },
          el("span", { class: "dot", style: `background:${color};width:6px;height:6px;border-radius:50%` }),
          e.agent
        ),
        model ? el("span", { class: "event__meta-item" }, `· ${model}`) : null,
        task ? el("span", {
          class: "event__task",
          "data-type": task,
          style: `--task-color:${taskColor(task)}`,
        }, task) : null,
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
    return el("span", { class: "pulse-banner__item" },
      el("span", { style: `color:${color}` }, `▍${e.agent}`),
      el("span", {}, model ? ` ${model} · ${metricDigestText(e)}` : ` ${metricDigestText(e)}`),
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
  const w365 = stats.last_365d || {};

  const eventTiles = el("div", { class: "stats-grid" },
    tile("Today", wToday.events ?? 0),
    tile("Last 7 days", w7.events ?? 0),
    tile("Last 30 days", w30.events ?? 0),
    tile("Top model", stripModelPrefix(stats.top_model?.model) || "—", { small: true }),
    tile("Tool calls (30d)", fmtNum(w30.tool_calls ?? 0)),
    tile("Files touched (30d)", fmtNum(w30.files_touched ?? 0)),
  );

  const tokenTiles = el("div", { class: "stats-grid", style: "margin-top: var(--sp-5)" },
    tile("Tokens today",     fmtNum(wToday.tokens ?? 0)),
    tile("Tokens last 7d",   fmtNum(w7.tokens ?? 0)),
    tile("Tokens last 30d",  fmtNum(w30.tokens ?? 0)),
    tile("Tokens last 365d", fmtNum(w365.tokens ?? 0)),
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

  const byTaskArr = Array.isArray(stats.by_type) ? stats.by_type.slice() : [];
  byTaskArr.sort((a, b) => (Number(b.c) || 0) - (Number(a.c) || 0));
  const totalT = Math.max(1, byTaskArr.reduce((a, b) => a + (Number(b.c) || 0), 0));
  const taskBars = el("div", { style: "margin-top: var(--sp-5)" },
    el("div", { class: "stat-tile__label", style: "margin-bottom: var(--sp-3)" }, "By task (last 30 days)"),
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

  const byModelArr = Array.isArray(stats.by_model) ? stats.by_model : [];
  const maxModelTokens = Math.max(1, ...byModelArr.map(m => Number(m.tokens) || 0));
  const modelBars = el("div", { style: "margin-top: var(--sp-5)" },
    el("div", { class: "stat-tile__label", style: "margin-bottom: var(--sp-3)" }, "Tokens by model (last 365 days)"),
    byModelArr.length
      ? el("div", {}, ...byModelArr.map(m => {
          const color = modelColor(m.model);
          const tok = Number(m.tokens) || 0;
          return el("div", { class: "stat-bar stat-bar--model" },
            el("span", { class: "stat-bar__label", style: `color:${color}` }, stripModelPrefix(m.model)),
            el("div", { class: "stat-bar__track" },
              el("div", { class: "stat-bar__fill", style: `width:${(tok/maxModelTokens*100).toFixed(1)}%; background:${color}` })
            ),
            el("span", { class: "stat-bar__count" }, `${fmtNum(tok)} tok`),
          );
        }))
      : el("div", { class: "stream-empty" }, "No token data yet.")
  );

  const buckets = stats.tokens_by_model || { day: [], week: [], year: [] };
  const tokenBuckets = renderTokenBuckets(buckets);

  container.replaceChildren(eventTiles, tokenTiles, agentBars, taskBars, modelBars, tokenBuckets);
}

/* ---------- tokens-by-model bucketed widget ------------------------------- */

function renderTokenBuckets(buckets) {
  const wrap = el("div", { class: "token-buckets", style: "margin-top: var(--sp-5)" });
  const header = el("div", { class: "token-buckets__header" },
    el("div", { class: "stat-tile__label" }, "Token consumption"),
    el("div", { class: "token-bucket-toggle", role: "tablist", "aria-label": "Bucket granularity" },
      ...["day", "week", "year"].map((g, i) =>
        el("button", {
          type: "button",
          class: "token-bucket-toggle__btn" + (g === "day" ? " is-active" : ""),
          "data-granularity": g,
          role: "tab",
          "aria-selected": g === "day" ? "true" : "false",
        }, g === "day" ? "Day" : g === "week" ? "Week" : "Year")
      )
    )
  );
  const chart = el("div", { class: "token-bucket-chart" });
  wrap.append(header, chart);

  function draw(granularity) {
    const rows = Array.isArray(buckets[granularity]) ? buckets[granularity] : [];
    // group rows by bucket key, preserving descending order
    const byBucket = new Map();
    for (const r of rows) {
      const k = String(r.bucket);
      if (!byBucket.has(k)) byBucket.set(k, { bucket: k, total: 0, segments: [] });
      const entry = byBucket.get(k);
      const tok = Number(r.tokens) || 0;
      entry.total += tok;
      entry.segments.push({ model: String(r.model || "unknown"), tokens: tok });
    }
    const all = Array.from(byBucket.values()); // already bucket-sorted DESC from server
    const max = Math.max(1, ...all.map(b => b.total));

    if (!all.length) {
      chart.replaceChildren(el("div", { class: "stream-empty" }, "No token data in this window yet."));
      return;
    }

    const rowsEl = all.slice(0, 30).map(b => {
      // segments already model-sorted by tokens DESC from server
      const totalPct = (b.total / max) * 100;
      const segs = b.segments.map(s => {
        const color = modelColor(s.model);
        const widthPct = b.total > 0 ? (s.tokens / b.total) * 100 : 0;
        return el("span", {
          class: "token-bucket-row__segment",
          style: `flex:${s.tokens || 0.0001} 1 0; background:${color}`,
          title: `${b.bucket} · ${stripModelPrefix(s.model)}: ${fmtNum(s.tokens)} tok`,
          "data-model": s.model,
        });
      });
      return el("div", { class: "token-bucket-row" },
        el("span", { class: "token-bucket-row__label" }, b.bucket),
        el("div", { class: "token-bucket-row__track", style: `width:${totalPct.toFixed(1)}%` }, ...segs),
        el("span", { class: "token-bucket-row__total" }, fmtNum(b.total)),
      );
    });

    // legend: union of models appearing in current granularity
    const modelSet = new Map();
    for (const b of all) for (const s of b.segments) {
      modelSet.set(s.model, (modelSet.get(s.model) || 0) + s.tokens);
    }
    const legendItems = Array.from(modelSet.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([m]) =>
        el("span", { class: "token-legend__item" },
          el("span", { class: "token-legend__dot", style: `background:${modelColor(m)}` }),
          stripModelPrefix(m),
        )
      );
    const legend = el("div", { class: "token-legend" }, ...legendItems);

    chart.replaceChildren(...rowsEl, legend);
  }

  header.querySelectorAll(".token-bucket-toggle__btn").forEach(btn => {
    btn.addEventListener("click", () => {
      header.querySelectorAll(".token-bucket-toggle__btn").forEach(b => {
        const active = b === btn;
        b.classList.toggle("is-active", active);
        b.setAttribute("aria-selected", active ? "true" : "false");
      });
      draw(btn.dataset.granularity);
    });
  });

  draw("day");
  return wrap;
}

/* ---------- model color palette ------------------------------------------- */

const MODEL_PALETTE = [
  "#22d3ee", "#f59e0b", "#a855f7", "#10b981",
  "#f43f5e", "#3b82f6", "#eab308", "#ec4899",
  "#94a3b8", "#84cc16",
];
function modelColor(model) {
  const key = stripModelPrefix(String(model || "unknown")).toLowerCase();
  let h = 0;
  for (let i = 0; i < key.length; i++) { h = (h * 31 + key.charCodeAt(i)) >>> 0; }
  return MODEL_PALETTE[h % MODEL_PALETTE.length];
}

function renderHeatmapInto(container, stats) {
  const raw = stats?.heatmap ?? [];
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

/* ---------- tabs ---------------------------------------------------------- */

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
  const heatPanel = document.getElementById("lab-heatmap");
  const tabsRoot = document.querySelector("[data-lab-tabs]");
  if (tabsRoot) wireTabs(tabsRoot);

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
    if (heatPanel) renderHeatmapInto(heatPanel, stats);
    if (stats) {
      const byAgentArr = Array.isArray(stats.by_agent) ? stats.by_agent : [];
      if (stackGrid) renderStackInto(stackGrid, byAgentArr);
      updateHeroStats(stats);
    }
  }
  refreshStats();
  setInterval(refreshStats, 60_000);
}
