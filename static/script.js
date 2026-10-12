(() => {
  const EMO = {
    sadness:  { emoji: "😢", color: "#5b8def", line: "A heavy, quiet kind of feeling." },
    joy:      { emoji: "😄", color: "#ffc83d", line: "Bright, warm and full of energy." },
    love:     { emoji: "❤️", color: "#ff5c8a", line: "Affection and tenderness shine through." },
    anger:    { emoji: "😠", color: "#ff4d4d", line: "There is real heat behind these words." },
    fear:     { emoji: "😨", color: "#a06bff", line: "An unease that is hard to shake." },
    surprise: { emoji: "😲", color: "#2ee6c5", line: "Something unexpected just landed." },
  };
  const CIRC = 2 * Math.PI * 54;

  const $ = (id) => document.getElementById(id);
  const textEl = $("text"), btn = $("analyze"), countEl = $("count");
  const resultEl = $("result"), errEl = $("error"), barsEl = $("bars");
  const histBox = $("historyBox"), histEl = $("history");
  const history = [];

  /* ---------- health ping ---------- */
  async function ping() {
    const s = $("status"), t = $("statusText");
    try {
      const r = await fetch("/health");
      const d = await r.json();
      s.className = "status " + (d.model_loaded ? "ok" : "down");
      t.textContent = d.model_loaded ? "Model online" : "Model loading…";
    } catch {
      s.className = "status down";
      t.textContent = "Server offline";
    }
  }
  ping();
  setInterval(ping, 20000);

  /* ---------- input ---------- */
  function sync() {
    const n = textEl.value.length;
    countEl.textContent = n;
    btn.disabled = textEl.value.trim().length === 0;
  }
  textEl.addEventListener("input", sync);
  textEl.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !btn.disabled) analyze();
  });
  $("chips").addEventListener("click", (e) => {
    const c = e.target.closest(".chip");
    if (!c) return;
    textEl.value = c.dataset.t;
    sync();
    analyze();
  });
  btn.addEventListener("click", analyze);

  /* ---------- helpers ---------- */
  function countUp(el, to, ms = 1100) {
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / ms, 1);
      const eased = 1 - Math.pow(1 - p, 4);
      el.textContent = (to * eased).toFixed(1);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function burst(emoji, originEl) {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const fx = $("fx");
    const r = originEl.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    for (let i = 0; i < 18; i++) {
      const s = document.createElement("span");
      s.textContent = emoji;
      s.style.left = cx + "px";
      s.style.top = cy + "px";
      fx.appendChild(s);
      const ang = Math.random() * Math.PI * 2;
      const dist = 120 + Math.random() * 260;
      const dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist - 80;
      const rot = (Math.random() - 0.5) * 540;
      const sc = 0.5 + Math.random() * 1.1;
      s.animate(
        [
          { transform: "translate(-50%,-50%) scale(0)", opacity: 1 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${rot}deg) scale(${sc})`, opacity: 1, offset: 0.6 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy + 140}px)) rotate(${rot * 1.4}deg) scale(${sc})`, opacity: 0 },
        ],
        { duration: 1400 + Math.random() * 700, easing: "cubic-bezier(.2,.8,.3,1)" }
      ).onfinish = () => s.remove();
    }
  }

  function swapHero(word) {
    const h = $("heroWord");
    h.classList.remove("swap");
    void h.offsetWidth;
    h.textContent = word;
    h.classList.add("swap");
  }

  function showError(msg) {
    errEl.textContent = msg;
    errEl.hidden = false;
    errEl.style.animation = "none"; void errEl.offsetWidth; errEl.style.animation = "";
  }

  /* ---------- analyze ---------- */
  async function analyze() {
    const text = textEl.value.trim();
    if (!text || btn.classList.contains("loading")) return;
    errEl.hidden = true;
    btn.classList.add("loading");
    btn.disabled = true;

    try {
      const res = await fetch("/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        let detail = "Something went wrong.";
        try { const j = await res.json(); if (typeof j.detail === "string") detail = j.detail; } catch {}
        throw new Error(detail);
      }
      render(await res.json());
    } catch (e) {
      showError(e.message === "Failed to fetch" ? "Cannot reach the server. Is it running?" : e.message);
    } finally {
      btn.classList.remove("loading");
      sync();
    }
  }

  function render(d) {
    const key = d.predicted_emotion;
    const meta = EMO[key] || { emoji: "🙂", color: "#8b7bff", line: "" };
    document.body.dataset.emotion = key;
    swapHero(key);

    resultEl.hidden = false;
    resultEl.style.animation = "none"; void resultEl.offsetWidth; resultEl.style.animation = "";

    const big = $("bigEmoji");
    big.textContent = meta.emoji;
    big.classList.remove("pop"); void big.offsetWidth; big.classList.add("pop");
    $("emoName").textContent = key;
    $("quote").textContent = meta.line;

    const pct = d.confidence * 100;
    const ring = $("ringFg");
    ring.style.strokeDashoffset = CIRC;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      ring.style.strokeDashoffset = CIRC * (1 - d.confidence);
    }));
    countUp($("confNum"), pct);

    // bars sorted high -> low
    barsEl.innerHTML = "";
    Object.entries(d.all_probabilities)
      .sort((a, b) => b[1] - a[1])
      .forEach(([name, p], i) => {
        const m = EMO[name] || { emoji: "•", color: "#888" };
        const row = document.createElement("div");
        row.className = "bar" + (name === key ? " top" : "");
        row.style.animationDelay = i * 80 + "ms";
        row.innerHTML = `
          <span class="name"><span>${m.emoji}</span>${name}</span>
          <div class="track"><div class="fill" style="--c:${m.color}"></div></div>
          <span class="pct">${(p * 100).toFixed(1)}%</span>`;
        barsEl.appendChild(row);
        setTimeout(() => { row.querySelector(".fill").style.width = Math.max(p * 100, 0.8) + "%"; }, 150 + i * 80);
      });

    burst(meta.emoji, big);
    if (window.innerWidth < 700) resultEl.scrollIntoView({ behavior: "smooth", block: "start" });
    pushHistory(d.text, key, pct, meta.emoji);
  }

  function pushHistory(text, key, pct, emoji) {
    history.unshift({ text, key, pct, emoji });
    if (history.length > 5) history.pop();
    histBox.hidden = false;
    histEl.innerHTML = "";
    history.forEach((h, i) => {
      const li = document.createElement("li");
      li.style.animationDelay = i * 60 + "ms";
      li.innerHTML = `<span>${h.emoji}</span><span class="t"></span><span class="p">${h.key} · ${h.pct.toFixed(0)}%</span>`;
      li.querySelector(".t").textContent = h.text;
      li.addEventListener("click", () => { textEl.value = h.text; sync(); textEl.focus(); window.scrollTo({ top: 0, behavior: "smooth" }); });
      histEl.appendChild(li);
    });
  }

  /* ---------- cursor glow + card tilt ---------- */
  const glow = $("cursorGlow"), card = $("card");
  const fine = matchMedia("(pointer: fine)").matches;
  if (fine) {
    window.addEventListener("pointermove", (e) => {
      glow.style.left = e.clientX + "px";
      glow.style.top = e.clientY + "px";
    });
    card.addEventListener("pointermove", (e) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `perspective(1100px) rotateX(${(-y * 3.5).toFixed(2)}deg) rotateY(${(x * 3.5).toFixed(2)}deg)`;
    });
    card.addEventListener("pointerleave", () => { card.style.transform = ""; });
  } else {
    glow.style.display = "none";
  }

  sync();
})();
