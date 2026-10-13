"use strict";

/* ============================================================
   Undertone — front-end for the FastAPI BiGRU emotion service
   Endpoints used: GET /health, POST /predict
   ============================================================ */

const EMOTIONS = {
  sadness:  { emoji: "😢", color: "#5b8def", blurb: "Heavy, low-energy language." },
  joy:      { emoji: "😄", color: "#ffc53d", blurb: "Bright, upbeat and open." },
  love:     { emoji: "❤️", color: "#ff5c8a", blurb: "Warm, tender and affectionate." },
  anger:    { emoji: "😠", color: "#ff5040", blurb: "Sharp, frustrated, charged." },
  fear:     { emoji: "😨", color: "#9b6bff", blurb: "Tense, uneasy, on edge." },
  surprise: { emoji: "😲", color: "#2fd3c4", blurb: "Sudden and unexpected." },
};

const SAMPLES = [
  { e: "joy",      t: "I can't stop smiling, today turned out perfect" },
  { e: "sadness",  t: "I miss her so much it physically hurts" },
  { e: "anger",    t: "How dare you lie to my face again" },
  { e: "fear",     t: "I'm terrified of what the doctor is going to say" },
  { e: "surprise", t: "I never expected to win, I'm completely stunned" },
  { e: "love",     t: "I adore the way you laugh at your own jokes" },
];

const $ = (id) => document.getElementById(id);
const el = {
  form: $("form"), text: $("text"), go: $("go"), clear: $("clear"), count: $("count"),
  error: $("error"), chips: $("chips"), panel: $("panel"),
  result: $("result"), ring: $("ringFill"), emoji: $("emoji"),
  name: $("emotionName"), blurb: $("emotionBlurb"), confNum: $("confNum"), confTag: $("confTag"),
  bars: $("bars"), echo: $("echo"),
  historyWrap: $("historyWrap"), history: $("history"), clearHistory: $("clearHistory"),
  status: $("status"), statusText: $("statusText"),
};

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const RING_C = 2 * Math.PI * 54;
const HISTORY_KEY = "undertone.history.v1";
const MAX_HISTORY = 6;

let busy = false;
let history = [];

/* ---------------- Helpers ---------------- */
const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (v, d = 1) => (v * 100).toFixed(d);

function safeStore(action, value) {
  try {
    if (action === "get") return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    localStorage.setItem(HISTORY_KEY, JSON.stringify(value));
  } catch (_) { /* storage unavailable: history stays in memory */ }
  return [];
}

/* ---------------- Accent colour (page + canvas) ---------------- */
let targetRGB = hexToRgb("#7c8cff");
let currentRGB = [...targetRGB];

function setAccent(emotionKey) {
  const color = (EMOTIONS[emotionKey] || {}).color || "#7c8cff";
  document.documentElement.style.setProperty("--accent", color);
  targetRGB = hexToRgb(color);
}

/* ---------------- Particle field ---------------- */
const canvas = $("bg");
const ctx = canvas.getContext("2d");
let W = 0, H = 0, DPR = 1;
const mouse = { x: -9999, y: -9999 };
let particles = [];
let bursts = [];

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W * DPR; canvas.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const n = Math.round(Math.min(70, (W * H) / 20000));
  particles = Array.from({ length: n }, () => ({
    x: Math.random() * W, y: Math.random() * H,
    vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25,
    r: Math.random() * 1.4 + 0.5,
  }));
}

function burst(x, y) {
  if (reduceMotion) return;
  for (let i = 0; i < 46; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = Math.random() * 5 + 1.5;
    bursts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, r: Math.random() * 2.2 + 0.8 });
  }
}

function frame() {
  for (let i = 0; i < 3; i++) currentRGB[i] += (targetRGB[i] - currentRGB[i]) * 0.04;
  const [r, g, b] = currentRGB.map(Math.round);
  ctx.clearRect(0, 0, W, H);

  for (const p of particles) {
    const dx = p.x - mouse.x, dy = p.y - mouse.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < 22000) {
      const f = (1 - d2 / 22000) * 0.5;
      p.vx += (dx / Math.sqrt(d2 + 1)) * f * 0.2;
      p.vy += (dy / Math.sqrt(d2 + 1)) * f * 0.2;
    }
    p.vx *= 0.985; p.vy *= 0.985;
    p.x += p.vx + (Math.random() - 0.5) * 0.04; p.y += p.vy + (Math.random() - 0.5) * 0.04;
    if (p.x < -10) p.x = W + 10; else if (p.x > W + 10) p.x = -10;
    if (p.y < -10) p.y = H + 10; else if (p.y > H + 10) p.y = -10;
  }

  ctx.lineWidth = 1;
  for (let i = 0; i < particles.length; i++) {
    const a = particles[i];
    for (let j = i + 1; j < particles.length; j++) {
      const c = particles[j];
      const dx = a.x - c.x, dy = a.y - c.y, d2 = dx * dx + dy * dy;
      if (d2 < 13000) {
        ctx.strokeStyle = `rgba(${r},${g},${b},${(1 - d2 / 13000) * 0.16})`;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke();
      }
    }
    ctx.fillStyle = `rgba(${r},${g},${b},0.55)`;
    ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2); ctx.fill();
  }

  for (let i = bursts.length - 1; i >= 0; i--) {
    const p = bursts[i];
    p.x += p.vx; p.y += p.vy; p.vx *= 0.94; p.vy *= 0.94; p.life -= 0.018;
    if (p.life <= 0) { bursts.splice(i, 1); continue; }
    ctx.fillStyle = `rgba(${r},${g},${b},${p.life * 0.9})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * p.life + 0.3, 0, Math.PI * 2); ctx.fill();
  }
  requestAnimationFrame(frame);
}

window.addEventListener("resize", resize);
window.addEventListener("pointermove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });
window.addEventListener("pointerleave", () => { mouse.x = mouse.y = -9999; });
resize();
requestAnimationFrame(frame);

/* ---------------- Panel spotlight ---------------- */
el.panel.addEventListener("pointermove", (e) => {
  const rect = el.panel.getBoundingClientRect();
  el.panel.style.setProperty("--mx", `${e.clientX - rect.left}px`);
  el.panel.style.setProperty("--my", `${e.clientY - rect.top}px`);
});

/* ---------------- Health pill ---------------- */
async function checkHealth() {
  try {
    const res = await fetch("/health", { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    if (data.model_loaded) setStatus("online", "Model online");
    else setStatus("warming", "Model warming up");
  } catch (_) {
    setStatus("offline", "Server unreachable");
  }
}
function setStatus(state, text) {
  el.status.dataset.state = state;
  el.statusText.textContent = text;
}
checkHealth();
setInterval(checkHealth, 30000);

/* ---------------- Input handling ---------------- */
function syncInput() {
  const len = el.text.value.length;
  el.count.textContent = len;
  const has = el.text.value.trim().length > 0;
  el.go.disabled = !has || busy;
  el.clear.hidden = len === 0;
}
el.text.addEventListener("input", syncInput);
el.text.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); el.form.requestSubmit(); }
});
el.clear.addEventListener("click", () => { el.text.value = ""; syncInput(); hideError(); el.text.focus(); });

el.form.addEventListener("submit", (e) => { e.preventDefault(); analyze(); });

function showError(msg) {
  el.error.hidden = false;
  el.error.style.animation = "none"; void el.error.offsetWidth; el.error.style.animation = "";
  el.error.textContent = msg;
}
function hideError() { el.error.hidden = true; }

/* Sample chips: type the sentence in, then analyze */
SAMPLES.forEach((s) => {
  const b = document.createElement("button");
  b.type = "button"; b.className = "chip";
  b.style.setProperty("--c", EMOTIONS[s.e].color);
  const icon = document.createElement("span"); icon.textContent = EMOTIONS[s.e].emoji;
  const label = document.createElement("i"); label.style.fontStyle = "normal"; label.textContent = s.e;
  b.append(icon, label);
  b.addEventListener("click", () => typeIn(s.t));
  el.chips.appendChild(b);
});

let typing = null;
async function typeIn(text) {
  if (busy) return;
  const token = (typing = Symbol());
  hideError();
  el.text.value = "";
  if (reduceMotion) {
    el.text.value = text; syncInput();
  } else {
    for (let i = 1; i <= text.length; i++) {
      if (typing !== token) return;
      el.text.value = text.slice(0, i); syncInput();
      await sleep(14);
    }
  }
  if (typing === token) analyze();
}
el.text.addEventListener("input", () => { typing = null; });

/* ---------------- Analyze ---------------- */
async function analyze() {
  const text = el.text.value.trim();
  if (!text || busy) return;
  busy = true; hideError();
  el.go.classList.add("loading"); el.go.disabled = true;
  el.emoji.classList.remove("idle");

  try {
    const [res] = await Promise.all([
      fetch("/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      }),
      sleep(650), // keeps the loading state readable instead of flashing
    ]);

    if (!res.ok) {
      let detail = `Request failed (${res.status}).`;
      try {
        const body = await res.json();
        if (typeof body.detail === "string") detail = body.detail;
        else if (res.status === 422) detail = "That text couldn't be processed. Check its length (1–2000 characters).";
      } catch (_) {}
      throw new Error(detail);
    }
    const data = await res.json();
    render(data);
    pushHistory(data);
    setStatus("online", "Model online");
  } catch (err) {
    const offline = err instanceof TypeError;
    showError(offline ? "Can't reach the server. Check your connection and try again." : err.message);
    if (offline) setStatus("offline", "Server unreachable");
  } finally {
    busy = false;
    el.go.classList.remove("loading");
    syncInput();
  }
}

/* ---------------- Render result ---------------- */
function confidenceLabel(c) {
  if (c >= 0.8) return "High confidence";
  if (c >= 0.55) return "Moderate confidence";
  return "Mixed signals";
}

function countUp(node, to, duration = 1100) {
  if (reduceMotion) { node.textContent = to.toFixed(1); return; }
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 4);
    node.textContent = (to * eased).toFixed(1);
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function render(data) {
  const key = data.predicted_emotion;
  const meta = EMOTIONS[key] || { emoji: "🙂", color: "#7c8cff", blurb: "" };

  setAccent(key);

  el.name.textContent = key;
  el.blurb.textContent = meta.blurb;
  el.emoji.textContent = meta.emoji;
  el.confTag.textContent = confidenceLabel(data.confidence);
  el.echo.textContent = `“${data.text}”`;

  // bars: sorted high -> low
  el.bars.textContent = "";
  Object.entries(data.all_probabilities)
    .sort((a, b) => b[1] - a[1])
    .forEach(([label, p], i) => {
      const m = EMOTIONS[label] || { emoji: "•", color: "#888" };
      const li = document.createElement("li");
      li.className = "bar-row" + (label === key ? " top" : "");
      li.style.setProperty("--i", i); li.style.setProperty("--c", m.color);

      const name = document.createElement("span"); name.className = "bar-name";
      const ic = document.createElement("span"); ic.textContent = m.emoji;
      name.append(ic, document.createTextNode(label));

      const track = document.createElement("div"); track.className = "bar-track";
      const fill = document.createElement("div"); fill.className = "bar-fill";
      track.appendChild(fill);

      const val = document.createElement("span"); val.className = "bar-pct"; val.textContent = `${pct(p)}%`;
      li.append(name, track, val);
      el.bars.appendChild(li);
      fill.dataset.w = Math.max(p * 100, 0.6);
    });

  // reset + replay entrance
  el.ring.style.transition = "none";
  el.ring.style.strokeDashoffset = RING_C;
  el.confNum.textContent = "0.0";
  el.result.hidden = false;
  el.result.classList.remove("play"); void el.result.offsetWidth; el.result.classList.add("play");

  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.ring.style.transition = "";
    el.ring.style.strokeDashoffset = RING_C * (1 - data.confidence);
    el.bars.querySelectorAll(".bar-fill").forEach((f) => { f.style.width = `${f.dataset.w}%`; });
    countUp(el.confNum, data.confidence * 100);
  }));

  setTimeout(() => el.emoji.classList.add("idle"), 1100);

  // celebratory burst from the emoji
  setTimeout(() => {
    const r = el.emoji.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2);
  }, 250);

  if (window.innerWidth < 720 || el.result.getBoundingClientRect().bottom > window.innerHeight) {
    el.result.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
  }
}

/* ---------------- History ---------------- */
function pushHistory(data) {
  history = history.filter((h) => h.text !== data.text);
  history.unshift({ text: data.text, emotion: data.predicted_emotion, confidence: data.confidence, probs: data.all_probabilities });
  history = history.slice(0, MAX_HISTORY);
  safeStore("set", history);
  renderHistory();
}

function renderHistory() {
  el.history.textContent = "";
  el.historyWrap.hidden = history.length === 0;
  history.forEach((h, i) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "history-item"; btn.style.animationDelay = `${i * 50}ms`;
    const e = document.createElement("span"); e.textContent = (EMOTIONS[h.emotion] || {}).emoji || "•";
    const t = document.createElement("span"); t.className = "h-text"; t.textContent = h.text;
    const c = document.createElement("span"); c.className = "h-conf"; c.textContent = `${pct(h.confidence, 0)}%`;
    btn.append(e, t, c);
    btn.addEventListener("click", () => {
      el.text.value = h.text; syncInput();
      render({ text: h.text, predicted_emotion: h.emotion, confidence: h.confidence, all_probabilities: h.probs });
    });
    li.appendChild(btn);
    el.history.appendChild(li);
  });
}

el.clearHistory.addEventListener("click", () => { history = []; safeStore("set", history); renderHistory(); });

history = (safeStore("get") || []).filter((h) => h && h.text && h.probs).slice(0, MAX_HISTORY);
renderHistory();
syncInput();
