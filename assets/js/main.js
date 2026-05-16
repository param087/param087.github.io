/* main.js — entry point for the site.
 * Wires up nav, scroll-spy, reveal animations, theme toggle, contact form,
 * and bootstraps the Live Lab + swarm modules.
 */

import { initSwarm } from "./swarm.js?v=3";
import { initLiveLab } from "./live-lab.js?v=3";

/* Theme: default dark, optional light toggle, persisted in localStorage. */
(function initTheme() {
  const saved = localStorage.getItem("theme");
  if (saved === "light") document.documentElement.setAttribute("data-theme", "light");
  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("theme-toggle");
    if (!btn) return;
    btn.addEventListener("click", () => {
      const cur = document.documentElement.getAttribute("data-theme");
      const next = cur === "light" ? null : "light";
      if (next) document.documentElement.setAttribute("data-theme", next);
      else document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("theme", next ?? "dark");
    });
  });
})();

document.addEventListener("DOMContentLoaded", () => {
  /* Mobile nav toggle */
  const nav = document.querySelector(".nav");
  const toggle = document.querySelector(".nav__toggle");
  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    nav.querySelectorAll(".nav__links a").forEach(a =>
      a.addEventListener("click", () => nav.classList.remove("is-open"))
    );
  }

  /* Smooth scroll with nav offset */
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener("click", (e) => {
      const href = a.getAttribute("href");
      if (!href || href === "#") return;
      const target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      const top = target.getBoundingClientRect().top + window.scrollY - 72;
      window.scrollTo({ top, behavior: "smooth" });
    });
  });

  /* Scroll-spy via IntersectionObserver */
  const navLinks = document.querySelectorAll(".nav__links a[href^='#']");
  const linkBySection = new Map();
  navLinks.forEach(a => {
    const id = a.getAttribute("href")?.slice(1);
    if (id) linkBySection.set(id, a);
  });
  const spy = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      if (en.isIntersecting) {
        navLinks.forEach(l => l.classList.remove("is-active"));
        linkBySection.get(en.target.id)?.classList.add("is-active");
      }
    });
  }, { rootMargin: "-40% 0px -55% 0px", threshold: 0 });
  document.querySelectorAll("section[id]").forEach(s => spy.observe(s));

  /* Reveal-on-scroll */
  const reveal = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      if (en.isIntersecting) {
        en.target.classList.add("is-visible");
        reveal.unobserve(en.target);
      }
    });
  }, { threshold: 0.08, rootMargin: "0px 0px -10% 0px" });
  document.querySelectorAll("[data-reveal]").forEach(el => reveal.observe(el));

  /* Contact form mock submit */
  const form = document.getElementById("contact-form");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const btn = form.querySelector("button[type=submit]");
      if (!btn) return;
      const orig = btn.innerHTML;
      btn.innerHTML = '<i class="fas fa-check"></i> Message sent';
      btn.disabled = true;
      form.reset();
      setTimeout(() => { btn.innerHTML = orig; btn.disabled = false; }, 2800);
    });
  }

  /* Year in footer */
  const yr = document.getElementById("footer-year");
  if (yr) yr.textContent = new Date().getFullYear();

  /* Live Lab + swarm */
  initSwarm();
  initLiveLab();
});
