/* activity-client.js — polls the agent-stream Worker for events.
 * - Reads worker URL from <meta name="agent-stream-url">.
 * - Polls every 20s when visible; pauses when hidden.
 * - Exponential backoff on errors (up to 2 min).
 * - Caches last successful payload in localStorage as fallback.
 * - Publishes a CustomEvent('agent-stream:update', {detail: {events, status}})
 *   on the document so other modules (swarm, stream UI) can react.
 *
 * No build step. Plain ES module.
 */

const CACHE_KEY = "agent-stream:last-events";
const POLL_MS = 20_000;
const MAX_BACKOFF_MS = 120_000;

function getBaseUrl() {
  const meta = document.querySelector('meta[name="agent-stream-url"]');
  const url = meta?.content?.trim();
  if (!url || url.startsWith("REPLACE_")) return null;
  return url.replace(/\/+$/, "");
}

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.events)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveCache(events) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ events, savedAt: Date.now() })
    );
  } catch { /* quota or disabled storage — ignore */ }
}

function dispatch(detail) {
  document.dispatchEvent(new CustomEvent("agent-stream:update", { detail }));
}

export class ActivityClient {
  constructor({ baseUrl, limit = 50 } = {}) {
    this.baseUrl = baseUrl ?? getBaseUrl();
    this.limit = limit;
    this.events = [];
    this.status = "idle";          // idle | live | offline | paused
    this.lastId = null;
    this.pollTimer = null;
    this.backoff = 0;
    this.failures = 0;
    this.controller = null;
  }

  start() {
    if (!this.baseUrl) {
      this._setStatus("offline");
      const cached = loadCache();
      if (cached) {
        this.events = cached.events;
        dispatch({ events: this.events, status: "offline", cached: true });
      }
      return;
    }
    // Hydrate from cache instantly so the UI is never empty.
    const cached = loadCache();
    if (cached) {
      this.events = cached.events;
      dispatch({ events: this.events, status: "loading", cached: true });
    }

    document.addEventListener("visibilitychange", this._onVisibility);
    this._poll(); // immediate
  }

  stop() {
    document.removeEventListener("visibilitychange", this._onVisibility);
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.controller) this.controller.abort();
  }

  _onVisibility = () => {
    if (document.hidden) {
      this._setStatus("paused");
      if (this.pollTimer) { clearTimeout(this.pollTimer); this.pollTimer = null; }
    } else {
      this._poll();
    }
  };

  async _poll() {
    if (this.pollTimer) { clearTimeout(this.pollTimer); this.pollTimer = null; }
    if (this.controller) this.controller.abort();
    this.controller = new AbortController();

    try {
      const url = new URL(`${this.baseUrl}/events`);
      url.searchParams.set("limit", String(this.limit));
      const res = await fetch(url.toString(), {
        signal: this.controller.signal,
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const events = Array.isArray(data?.events) ? data.events : [];

      const prevIds = new Set(this.events.map(e => e.id));
      const newOnes = events.filter(e => !prevIds.has(e.id));

      this.events = events;
      this.lastId = events[0]?.id ?? this.lastId;
      this.failures = 0;
      this.backoff = 0;
      this._setStatus("live");
      saveCache(events);
      dispatch({ events, status: "live", newEvents: newOnes });
    } catch (err) {
      if (err?.name === "AbortError") return;
      this.failures += 1;
      this.backoff = Math.min(MAX_BACKOFF_MS, (this.backoff || POLL_MS) * 2);
      this._setStatus("offline");
      dispatch({ events: this.events, status: "offline", error: String(err) });
    } finally {
      const delay = this.failures > 0 ? this.backoff : POLL_MS;
      if (!document.hidden) {
        this.pollTimer = setTimeout(() => this._poll(), delay);
      }
    }
  }

  _setStatus(status) {
    if (this.status === status) return;
    this.status = status;
  }
}

/* Singleton bootstrap */
let _client = null;
export function getActivityClient() {
  if (_client) return _client;
  _client = new ActivityClient();
  return _client;
}

/* Helper: format relative time */
export function timeAgo(iso) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Math.max(0, Date.now() - t);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export const AGENT_COLORS = {
  opencode:      "#22d3ee",
  "claude-code": "#f59e0b",
  copilot:       "#a855f7",
  jules:         "#10b981",
  cursor:        "#ec4899",
  codex:         "#94a3b8",
  aider:         "#94a3b8",
  other:         "#94a3b8",
};
export function agentColor(name) {
  return AGENT_COLORS[name] ?? AGENT_COLORS.other;
}
