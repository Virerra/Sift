/**
 * SIFT ParentGuide — progress engine
 *
 * Everything here is local. There is no fetch(), no XHR, nothing that
 * leaves the browser — reading progress and the certificate name you type
 * in both live in localStorage only, under a key namespaced to this app.
 * That's a deliberate, load-bearing property of this file, not an
 * accident of not getting around to a backend yet: see the note on
 * index.html for why.
 *
 * Single source of truth for the module list — index.html (the hub) and
 * every modules/*.html page both read from MODULES rather than each
 * hardcoding counts that could quietly drift out of sync.
 */

const STORAGE_KEY = "sift-parentguide-progress-v1";

const MODULES = [
  { id: "welcome", num: "01", title: "Welcome to SIFT", sections: 3, path: "modules/01-welcome.html" },
  { id: "safety-basics", num: "02", title: "Internet safety basics", sections: 5, path: "modules/02-safety-basics.html" },
  { id: "digital-citizenship", num: "03", title: "Digital citizenship & etiquette", sections: 4, path: "modules/03-digital-citizenship.html" },
  { id: "ad-tactics", num: "04", title: "How advertising targets kids", sections: 5, path: "modules/04-ad-tactics.html" },
  { id: "ad-policies", num: "05", title: "Ad policies & your rights", sections: 4, path: "modules/05-ad-policies.html" },
  { id: "using-sift", num: "06", title: "Using SIFT's tools", sections: 5, path: "modules/06-using-sift.html" },
  { id: "spot-and-report", num: "07", title: "Spot it, report it", sections: 5, path: "modules/07-spot-and-report.html" }
];

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { modules: {}, name: "" };
  } catch {
    // Private browsing / storage disabled — degrade to a session-only
    // in-memory object rather than throwing and breaking the page.
    return { modules: {}, name: "" };
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable — progress just won't persist this session.
    // Not fatal, nothing else in the page depends on the write succeeding.
  }
}

function markSectionRead(moduleId, sectionId) {
  const state = loadState();
  if (!state.modules[moduleId]) state.modules[moduleId] = {};
  if (state.modules[moduleId][sectionId]) return; // already recorded, skip the write
  state.modules[moduleId][sectionId] = true;
  saveState(state);
  document.dispatchEvent(new CustomEvent("sift:progress-changed"));
}

function moduleProgress(moduleId) {
  const meta = MODULES.find((m) => m.id === moduleId);
  if (!meta) return 0;
  const state = loadState();
  const read = state.modules[moduleId] ? Object.keys(state.modules[moduleId]).length : 0;
  return Math.min(100, Math.round((read / meta.sections) * 100));
}

function overallProgress() {
  const total = MODULES.reduce((sum, m) => sum + moduleProgress(m.id), 0);
  return Math.round(total / MODULES.length);
}

function isComplete() {
  return MODULES.every((m) => moduleProgress(m.id) === 100);
}

function setRing(el, percent) {
  if (!el) return;
  const circle = el.querySelector(".fill");
  if (!circle) return;
  const radius = circle.r.baseVal.value;
  const circumference = 2 * Math.PI * radius;
  circle.style.strokeDasharray = `${circumference} ${circumference}`;
  circle.style.strokeDashoffset = String(circumference * (1 - percent / 100));
  const label = el.parentElement?.querySelector("[data-ring-label]");
  if (label) label.textContent = `${percent}%`;
}

// ---------- Scroll reveal ----------
// IntersectionObserver, not a scroll listener — cheaper, and naturally
// does nothing extra once an element has already revealed.
function initScrollReveal() {
  const targets = document.querySelectorAll(".reveal");
  if (!targets.length) return;

  if (!("IntersectionObserver" in window)) {
    targets.forEach((el) => el.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
  );

  targets.forEach((el) => observer.observe(el));
}

// ---------- Section-read tracking ----------
// A section counts as "read" once it's been substantially on-screen for
// 1.5s — long enough that a fast scroll-past doesn't count, short enough
// that actually reading the section does, without requiring an explicit
// click. The reward here is meant to come from reading, not from
// clicking a checkbox.
function initSectionTracking(moduleId) {
  const sections = document.querySelectorAll("[data-track]");
  if (!sections.length) return;

  const declaredCount = MODULES.find((m) => m.id === moduleId)?.sections;
  if (declaredCount && declaredCount !== sections.length) {
    console.warn(
      `SIFT ParentGuide: module "${moduleId}" declares ${declaredCount} sections in progress.js but the page has ${sections.length} [data-track] elements — update MODULES to match.`
    );
  }

  const timers = new Map();

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const id = entry.target.dataset.track;
        if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
          if (!timers.has(id)) {
            timers.set(
              id,
              setTimeout(() => {
                markSectionRead(moduleId, id);
                updateSectionStatus(entry.target);
              }, 1500)
            );
          }
        } else if (timers.has(id)) {
          clearTimeout(timers.get(id));
          timers.delete(id);
        }
      }
    },
    { threshold: [0, 0.6, 1] }
  );

  sections.forEach((el) => observer.observe(el));

  // Reflect already-read sections immediately on load (e.g. a returning visitor).
  sections.forEach(updateSectionStatus);
}

function updateSectionStatus(sectionEl) {
  const moduleId = document.body.dataset.module;
  const sectionId = sectionEl.dataset.track;
  if (!moduleId || !sectionId) return;
  const state = loadState();
  const done = Boolean(state.modules[moduleId]?.[sectionId]);
  const statusEl = sectionEl.querySelector(".section-status");
  if (statusEl) statusEl.classList.toggle("done", done);
}

// ---------- Nav + ring wiring shared by every page ----------
function initPage() {
  initScrollReveal();

  const moduleId = document.body.dataset.module;
  if (moduleId) {
    initSectionTracking(moduleId);
  }

  refreshRings();
  document.addEventListener("sift:progress-changed", refreshRings);
}

function refreshRings() {
  document.querySelectorAll("[data-ring-for]").forEach((el) => {
    const id = el.dataset.ringFor;
    const percent = id === "overall" ? overallProgress() : moduleProgress(id);
    setRing(el, percent);
  });

  // Module page's own status dots need re-checking too, in case this ran
  // from the progress-changed event rather than initial load.
  document.querySelectorAll("[data-track]").forEach(updateSectionStatus);

  const certLink = document.querySelector("[data-cert-link]");
  if (certLink) certLink.classList.toggle("btn-locked-hint", !isComplete());
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPage);
} else {
  initPage();
}

// Exposed for certificate.html and the hub page's inline scripts.
window.SIFTProgress = {
  MODULES,
  loadState,
  saveState,
  moduleProgress,
  overallProgress,
  isComplete
};
