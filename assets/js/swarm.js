/* swarm.js — canvas-based "agent swarm" animation.
 * Renders orbiting agent nodes around a central avatar. Each new event
 * triggers a particle burst from the matching agent toward the center.
 *
 * Respects prefers-reduced-motion: in that case it renders a static
 * arrangement and skips animation frames.
 */

import { AGENT_COLORS, agentColor } from "./activity-client.js";

const ORBIT_AGENTS = ["opencode", "claude-code", "copilot", "jules", "cursor", "codex"];
const TAU = Math.PI * 2;

export class Swarm {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.nodes = [];
    this.particles = [];
    this.activity = new Map();  // agent -> last activity timestamp
    this.reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.running = false;
    this._t0 = performance.now();
    this._resize();
    window.addEventListener("resize", this._resize);
    this._initNodes();
  }

  _resize = () => {
    const rect = this.canvas.getBoundingClientRect();
    this.w = rect.width;
    this.h = rect.height;
    this.canvas.width = this.w * this.dpr;
    this.canvas.height = this.h * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.cx = this.w / 2;
    this.cy = this.h / 2;
    this.radius = Math.min(this.w, this.h) * 0.36;
  };

  _initNodes() {
    this.nodes = ORBIT_AGENTS.map((name, i) => ({
      name,
      color: agentColor(name),
      angle: (i / ORBIT_AGENTS.length) * TAU,
      speed: 0.00018 + i * 0.00004,
      radius: 18,
      pulse: 0,
    }));
  }

  start() {
    if (this.running) return;
    this.running = true;
    if (this.reduceMotion) {
      this._renderStatic();
      return;
    }
    const loop = (t) => {
      if (!this.running) return;
      this._frame(t);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop() { this.running = false; }

  /** Trigger a visual burst for the given agent. */
  triggerAgent(name) {
    const node = this.nodes.find(n => n.name === name);
    if (!node) return;
    node.pulse = 1;
    this.activity.set(name, performance.now());

    if (this.reduceMotion) return;
    const x = this.cx + Math.cos(node.angle) * this.radius;
    const y = this.cy + Math.sin(node.angle) * this.radius;
    const count = 18;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU + Math.random() * 0.4;
      const speed = 0.4 + Math.random() * 0.9;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 1,
        color: node.color,
      });
    }
  }

  _frame(t) {
    const dt = t - this._t0;
    this._t0 = t;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);

    // Subtle background ring
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, this.radius, 0, TAU);
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Connection lines
    for (const node of this.nodes) {
      node.angle += node.speed * dt;
      const x = this.cx + Math.cos(node.angle) * this.radius;
      const y = this.cy + Math.sin(node.angle) * this.radius;

      ctx.beginPath();
      ctx.moveTo(this.cx, this.cy);
      ctx.lineTo(x, y);
      ctx.strokeStyle = `rgba(255,255,255,${0.04 + node.pulse * 0.15})`;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Glow ring on pulse
      if (node.pulse > 0.01) {
        ctx.beginPath();
        ctx.arc(x, y, node.radius + (1 - node.pulse) * 26, 0, TAU);
        ctx.strokeStyle = node.color + Math.floor(node.pulse * 200).toString(16).padStart(2, "0");
        ctx.lineWidth = 2;
        ctx.stroke();
        node.pulse *= 0.94;
      }

      // Node body
      const grad = ctx.createRadialGradient(x, y, 2, x, y, node.radius);
      grad.addColorStop(0, node.color);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, node.radius, 0, TAU);
      ctx.fill();

      // Label
      ctx.fillStyle = "rgba(228,228,231,0.7)";
      ctx.font = "10px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(node.name, x, y + node.radius + 14);
    }

    // Particles
    const survivors = [];
    for (const p of this.particles) {
      // attract toward center
      const dx = this.cx - p.x;
      const dy = this.cy - p.y;
      const d = Math.hypot(dx, dy) || 1;
      p.vx += (dx / d) * 0.04;
      p.vy += (dy / d) * 0.04;
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.018;
      if (p.life > 0 && d > 8) {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.6, 0, TAU);
        ctx.fill();
        survivors.push(p);
      }
    }
    ctx.globalAlpha = 1;
    this.particles = survivors;
  }

  _renderStatic() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, this.radius, 0, TAU);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.stroke();
    for (const node of this.nodes) {
      const x = this.cx + Math.cos(node.angle) * this.radius;
      const y = this.cy + Math.sin(node.angle) * this.radius;
      ctx.fillStyle = node.color;
      ctx.beginPath(); ctx.arc(x, y, 8, 0, TAU); ctx.fill();
    }
  }
}

/** Bootstrap: find #hero-swarm canvas and wire up to activity events. */
export function initSwarm() {
  const canvas = document.getElementById("hero-swarm");
  if (!canvas) return null;
  const swarm = new Swarm(canvas);
  swarm.start();

  document.addEventListener("agent-stream:update", (ev) => {
    const newEvents = ev.detail?.newEvents ?? [];
    for (const e of newEvents) swarm.triggerAgent(e.agent);
  });

  return swarm;
}
