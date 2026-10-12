(() => {
  'use strict';

  /* ---------- Data ---------- */
  const NEUTRAL = { bg: '#E9ECF3', ink: '#1B1F2E' };

  const EMOTIONS = {
    sadness:  { emoji: '😢', bg: '#3F66C9', ink: '#F2F5FF', sample: 'I miss how things used to be' },
    joy:      { emoji: '😄', bg: '#FFC83D', ink: '#2B1D00', sample: "I can't stop smiling, today was perfect" },
    love:     { emoji: '❤️', bg: '#FF8DA6', ink: '#3B0A1C', sample: "I'd do anything for you" },
    anger:    { emoji: '😠', bg: '#C93220', ink: '#FFF1EC', sample: 'How dare you go behind my back' },
    fear:     { emoji: '😨', bg: '#5B3FB5', ink: '#F3EEFF', sample: 'I heard footsteps in the empty house' },
    surprise: { emoji: '😲', bg: '#2FC7C0', ink: '#05302E', sample: 'I never expected that to happen' },
  };
  const FALLBACK = { emoji: '🤔', ...NEUTRAL };

  const HISTORY_KEY = 'moodlens.history';
  const HISTORY_MAX = 6;

  /* ---------- Helpers ---------- */
  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  const prefersReduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  const h = (tag, props = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v);
    }
    el.append(...kids);
    return el;
  };

  const centerOf = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  const els = {
    form: $('form'), text: $('text'), count: $('count'), hint: $('hint'),
    btn: $('analyze'), btnLabel: $('btn-label'), chips: $('chips'), dial: $('dial'),
    empty: $('p-empty'), loading: $('p-loading'), result: $('p-result'), error: $('p-error'),
    slow: $('slow'), errMsg: $('err-msg'), retry: $('retry'), panel: $('panel'),
    health: $('health'), healthLabel: $('health-label'),
    history: $('history'), historyList: $('history-list'), clearHistory: $('clear-history'),
  };

  const panels = { empty: els.empty, loading: els.loading, result: els.result, error: els.error };
  const showPanel = (name) => {
    for (const [key, el] of Object.entries(panels)) el.hidden = key !== name;
  };

  /* ---------- Colour wipe ---------- */
  let target = NEUTRAL;
  let active = null;

  const applyTheme = (t) => {
    root.style.setProperty('--bg', t.bg);
    root.style.setProperty('--ink', t.ink);
    if (themeMeta) themeMeta.content = t.bg;
  };

  const settle = () => {
    if (!active) return;
    const a = active;
    active = null;
    clearTimeout(a.timer);
    a.anim.cancel();
    a.el.remove();
    applyTheme(a.theme);
  };

  const flood = (theme, x, y) => {
    settle();
    if (theme.bg === target.bg) return;
    target = theme;

    if (prefersReduced()) { applyTheme(theme); return; }

    const el = h('div', { class: 'flood', 'aria-hidden': 'true' });
    el.style.background = theme.bg;
    document.body.prepend(el);

    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const anim = el.animate(
      [
        { clipPath: `circle(0px at ${x}px ${y}px)` },
        { clipPath: `circle(${r}px at ${x}px ${y}px)` },
      ],
      { duration: 950, easing: 'cubic-bezier(.65, 0, .2, 1)', fill: 'forwards' }
    );
    const timer = setTimeout(() => root.style.setProperty('--ink', theme.ink), 380);
    active = { el, anim, timer, theme };

    anim.finished
      .then(() => {
        if (active && active.el === el) {
          const t = active.theme;
          active = null;
          applyTheme(t);
          el.remove();
        }
      })
      .catch(() => {});
  };

  /* ---------- Rendering a result ---------- */
  const countUp = (el, to, delay = 450, duration = 1000) => {
    if (prefersReduced()) { el.textContent = to.toFixed(1); return; }
    const start = performance.now() + delay;
    const tick = (now) => {
      const t = Math.min(Math.max((now - start) / duration, 0), 1);
      el.textContent = (to * (1 - Math.pow(1 - t, 3))).toFixed(1);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const buildResult = (data) => {
    const key = data.predicted_emotion;
    const meta = EMOTIONS[key] || FALLBACK;
    const pct = data.confidence * 100;
    const entries = Object.entries(data.all_probabilities);
    const sorted = [...entries].sort((a, b) => b[1] - a[1]);

    const name = h('h2', { class: 'emotion-name', 'aria-label': key });
    [...key].forEach((ch, i) => {
      const s = h('span', { class: 'letter', 'aria-hidden': 'true', text: ch });
      s.style.setProperty('--i', i);
      name.append(s);
    });

    const pctEl = h('span', { text: '0.0' });
    const confidence = h('p', { class: 'confidence' }, h('strong', {}, pctEl, '%'), ' confident');

    const bars = h('ul', { class: 'bars' });
    entries.forEach(([label, p], i) => {
      const li = h('li', { class: 'bar' + (label === key ? ' top' : '') });
      li.style.setProperty('--i', i);
      const fill = h('span', { class: 'fill' });
      fill.style.setProperty('--w', Math.max(p, 0));
      li.append(
        h('span', { 'aria-hidden': 'true', text: (EMOTIONS[label] || FALLBACK).emoji }),
        h('span', { text: label }),
        h('span', { class: 'track' }, fill),
        h('span', { class: 'val', text: (p * 100).toFixed(1) + '%' })
      );
      bars.append(li);
    });

    const nodes = [
      h('div', { class: 'emoji-big', 'aria-hidden': 'true', text: meta.emoji }),
      name,
      confidence,
    ];
    if (pct < 50 && sorted[1]) {
      nodes.push(h('p', {
        class: 'hedge',
        text: `Mixed signals. Closest alternative: ${sorted[1][0]} (${(sorted[1][1] * 100).toFixed(1)}%).`,
      }));
    }
    nodes.push(h('p', { class: 'echo', text: `\u201C${data.text}\u201D` }), bars);

    els.result.replaceChildren(...nodes);
    countUp(pctEl, pct);
  };

  const show = (data, origin) => {
    const meta = EMOTIONS[data.predicted_emotion] || FALLBACK;
    buildResult(data);
    showPanel('result');
    flood({ bg: meta.bg, ink: meta.ink }, origin.x, origin.y);
  };

  const showError = (message) => {
    els.errMsg.textContent = message;
    showPanel('error');
  };

  /* ---------- API ---------- */
  let busy = false;
  let lastText = '';

  const setBusy = (on) => {
    busy = on;
    els.btn.dataset.loading = String(on);
    els.btnLabel.textContent = on ? 'Reading' : 'Analyze';
    els.btn.disabled = on || !els.text.value.trim();
    els.panel.setAttribute('aria-busy', String(on));
  };

  const messageFor = (err) => {
    if (err.name === 'AbortError') return 'The server took too long to answer. Try again in a moment.';
    if (err.status === 503) return 'The model is still loading. Wait a few seconds and try again.';
    if (err.status === 422) return 'Enter between 1 and 2,000 characters.';
    if (err instanceof TypeError) return "Can't reach the server. Check that it is running, then try again.";
    return 'The server hit an error while reading that sentence. Try again.';
  };

  const analyze = async (raw, origin) => {
    const text = raw.trim();
    if (!text || busy) return;

    lastText = text;
    if (!/[a-z0-9]/i.test(text)) {
      showError('Add some words. Punctuation and symbols on their own can\u2019t be scored.');
      return;
    }

    setBusy(true);
    els.slow.hidden = true;
    showPanel('loading');
    const slowTimer = setTimeout(() => { els.slow.hidden = false; }, 5000);
    const ctrl = new AbortController();
    const abortTimer = setTimeout(() => ctrl.abort(), 90000);

    try {
      const res = await fetch('/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const err = new Error('Request failed');
        err.status = res.status;
        throw err;
      }
      const data = await res.json();
      remember(data);
      show(data, origin);
    } catch (err) {
      showError(messageFor(err));
    } finally {
      clearTimeout(slowTimer);
      clearTimeout(abortTimer);
      setBusy(false);
    }
  };

  /* ---------- History ---------- */
  let history = [];

  const saveHistory = () => {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch { /* storage unavailable */ }
  };

  const loadHistory = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      if (Array.isArray(raw)) history = raw.slice(0, HISTORY_MAX);
    } catch { history = []; }
  };

  const renderHistory = () => {
    els.history.hidden = history.length === 0;
    els.historyList.replaceChildren(
      ...history.map((item) => {
        const btn = h(
          'button',
          { type: 'button', class: 'chip', title: item.text },
          h('span', { 'aria-hidden': 'true', text: (EMOTIONS[item.predicted_emotion] || FALLBACK).emoji }),
          h('span', { text: item.text })
        );
        btn.addEventListener('click', () => {
          els.text.value = item.text;
          updateInput();
          show(item, centerOf(btn));
        });
        return h('li', {}, btn);
      })
    );
  };

  const remember = (data) => {
    history = [data, ...history.filter((x) => x.text !== data.text)].slice(0, HISTORY_MAX);
    saveHistory();
    renderHistory();
  };

  /* ---------- Input ---------- */
  const updateInput = () => {
    const len = els.text.value.length;
    els.count.textContent = `${len} / 2000`;
    els.btn.disabled = busy || !els.text.value.trim();
  };

  els.text.addEventListener('input', updateInput);

  els.text.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      analyze(els.text.value, centerOf(els.btn));
    }
  });

  els.form.addEventListener('submit', (e) => {
    e.preventDefault();
    analyze(els.text.value, centerOf(els.btn));
  });

  els.retry.addEventListener('click', () => analyze(lastText, centerOf(els.retry)));

  els.clearHistory.addEventListener('click', () => {
    history = [];
    saveHistory();
    renderHistory();
  });

  /* ---------- Static pieces built from the data ---------- */
  Object.entries(EMOTIONS).forEach(([label, meta], i) => {
    const li = h('li', {}, h('span', { class: 'e', 'aria-hidden': 'true', text: meta.emoji }), h('span', { text: label }));
    li.firstChild.style.setProperty('--i', i);
    els.dial.append(li);

    const chip = h('button', { type: 'button', class: 'chip', text: meta.sample });
    chip.addEventListener('click', () => {
      els.text.value = meta.sample;
      updateInput();
      analyze(meta.sample, centerOf(chip));
    });
    els.chips.append(h('li', {}, chip));
  });

  els.hint.textContent = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
    ? '\u2318 Enter to analyze'
    : 'Ctrl Enter to analyze';

  /* ---------- Server status ---------- */
  const setHealth = (state, label) => {
    els.health.dataset.state = state;
    els.healthLabel.textContent = label;
  };

  const pollHealth = async (attempt = 0) => {
    try {
      const res = await fetch('/health', { cache: 'no-store' });
      if (res.ok) {
        const info = await res.json();
        if (info.model_loaded) { setHealth('ready', 'Model ready'); return; }
      }
    } catch { /* server not reachable yet */ }

    if (attempt >= 40) { setHealth('down', 'Server not responding'); return; }
    setHealth('pending', 'Waking the model');
    setTimeout(() => pollHealth(attempt + 1), 3000);
  };

  /* ---------- Start ---------- */
  loadHistory();
  renderHistory();
  updateInput();
  pollHealth();
})();
