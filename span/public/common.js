// Shared by every page: session, API calls, small drawing helpers.
const Span = (() => {
  const GROUP_COLORS = ['#7a5cff', '#ff9f1c', '#2d8cff', '#f0509b', '#8ab800'];
  const GROUP_NAMES = ['A', 'B', 'C', 'D', 'E'];
  const mem = {};
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return mem[k] || null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { mem[k] = v; } },
  };

  let me = null;
  let sessionPromise = null;

  async function raw(path, opts = {}) {
    const headers = { 'content-type': 'application/json' };
    const token = store.get('span_token');
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(path, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data.error || 'Could not reach Span. Check your connection and try again.'); e.status = res.status; throw e; }
    return data;
  }

  function session() {
    if (!sessionPromise) {
      sessionPromise = (async () => {
        if (store.get('span_token')) {
          try { me = (await raw('/api/me')).user; return me; } catch (e) { if (e.status !== 401) throw e; }
        }
        const made = await raw('/api/session', { method: 'POST', body: {} });
        store.set('span_token', made.token);
        me = made.user;
        return me;
      })();
    }
    return sessionPromise;
  }

  async function api(path, opts) {
    await session();
    return raw(path, opts);
  }

  function el(tag, attrs = {}, ...kids) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'style') node.style.cssText = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) node.append(kid);
    return node;
  }

  function svg(tag, attrs = {}, ...kids) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) node.setAttribute(k, v);
    for (const kid of kids.flat()) if (kid) node.append(kid);
    return node;
  }

  function duration(ms) {
    const m = Math.max(0, Math.floor(ms / 60000));
    const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), min = m % 60;
    if (d) return `${d}d ${h}h`;
    if (h) return `${h}h ${min}m`;
    return `${min}m`;
  }

  function countdown(ms) {
    if (ms <= 0) return 'Closed';
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return d ? `${d}d ${pad(h)}h ${pad(m)}m` : `${pad(h)}:${pad(m)}:${pad(sec)}`;
  }

  // The bridge: one pier per opinion group, as tall as that group's agreement.
  // The deck sits at the bridge score, so one short pier drags the whole bridge down.
  function bridge(groups, score, { w = 96, h = 44 } = {}) {
    const base = h - 4, top = 5;
    const y = (pct) => base - ((base - top) * pct) / 100;
    const root = svg('svg', { viewBox: `0 0 ${w} ${h}`, width: w, height: h, role: 'img', 'aria-label': `Bridge score ${Math.round(score)}. Agreement by group: ${groups.map((g, i) => `${GROUP_NAMES[i]} ${g.pct ?? 0}%`).join(', ')}` });
    const n = groups.length || 1;
    const pw = Math.min(12, (w - 16) / n / 1.8);
    const deckY = y(score);
    groups.forEach((g, i) => {
      const cx = ((i + 0.5) * w) / n;
      const pct = g.pct ?? 0;
      const color = GROUP_COLORS[i % GROUP_COLORS.length];
      root.append(svg('rect', { x: cx - pw / 2, y: y(pct), width: pw, height: Math.max(0, base - y(pct)), rx: pw / 3, fill: color, opacity: 0.3 }));
      const solidTop = Math.max(y(pct), deckY);
      root.append(svg('rect', { x: cx - pw / 2, y: solidTop, width: pw, height: Math.max(0, base - solidTop), rx: pw / 3, fill: color }));
    });
    root.append(svg('line', { x1: 0, x2: w, y1: base + 1.5, y2: base + 1.5, stroke: '#d9ddee', 'stroke-width': 2 }));
    root.append(svg('path', { d: `M2 ${deckY + 1.5} Q ${w / 2} ${deckY - 3} ${w - 2} ${deckY + 1.5}`, stroke: '#15173a', 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round' }));
    return root;
  }

  function sparkline(points, { w = 96, h = 26 } = {}) {
    const root = svg('svg', { viewBox: `0 0 ${w} ${h}`, width: w, height: h, 'aria-hidden': 'true' });
    if (points.length < 2) return root;
    const t0 = points[0][0], t1 = points[points.length - 1][0] || t0 + 1;
    const d = points.map(([t, s], i) => `${i ? 'L' : 'M'}${(2 + ((w - 4) * (t - t0)) / (t1 - t0 || 1)).toFixed(1)} ${(h - 3 - ((h - 6) * s) / 100).toFixed(1)}`).join(' ');
    root.append(svg('path', { d, fill: 'none', stroke: '#15173a', 'stroke-width': 1.75, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    return root;
  }

  const aiBadge = () => el('span', { class: 'ai', title: 'This participant is an AI agent' }, 'AI');

  // Name + email dialog, reachable from the pill in the top bar.
  function mountIdentity(container, onChange) {
    const pill = el('button', { class: 'me', type: 'button', 'aria-label': 'Change your name or email' }, el('span', { class: 'dot' }), el('b', {}, '…'));
    container.append(pill);
    const nameIn = el('input', { type: 'text', maxlength: 40, required: true });
    const emailIn = el('input', { type: 'email', placeholder: 'you@example.com' });
    const note = el('p', { class: 'note' }, 'Your name shows on the map and leaderboard. Email is only used to tell you when the lead changes or a poll closes.');
    const dlg = el('dialog', {},
      el('h3', {}, 'Who are you here?'),
      el('form', { method: 'dialog', onsubmit: async (ev) => {
        ev.preventDefault();
        try {
          me = (await api('/api/me', { method: 'PATCH', body: { name: nameIn.value, email: emailIn.value } })).user;
          if (emailIn.value) store.set('span_email', emailIn.value);
          paint(); dlg.close(); onChange && onChange(me);
        } catch (e) { note.textContent = e.message; note.className = 'note error'; }
      } },
        el('label', {}, 'Display name', nameIn),
        el('label', {}, 'Email (optional)', emailIn),
        note,
        el('div', { class: 'actions' },
          el('button', { class: 'btn quiet small', type: 'button', onclick: () => dlg.close() }, 'Cancel'),
          el('button', { class: 'btn small', type: 'submit' }, 'Save'))));
    document.body.append(dlg);
    const paint = () => { pill.querySelector('b').textContent = me ? me.name : '…'; };
    pill.addEventListener('click', () => { nameIn.value = me?.name || ''; emailIn.value = store.get('span_email') || ''; dlg.showModal(); });
    session().then(paint);
    return { open: () => pill.click() };
  }

  const logo = () => {
    const a = el('a', { class: 'logo', href: '/' });
    const mark = svg('svg', { viewBox: '0 0 30 22', width: 30, height: 22, 'aria-hidden': 'true' },
      svg('rect', { x: 3, y: 9, width: 5, height: 12, rx: 2, fill: GROUP_COLORS[0] }),
      svg('rect', { x: 12.5, y: 5, width: 5, height: 16, rx: 2, fill: GROUP_COLORS[1] }),
      svg('rect', { x: 22, y: 9, width: 5, height: 12, rx: 2, fill: GROUP_COLORS[2] }),
      svg('path', { d: 'M1 9 Q15 1 29 9', stroke: '#15173a', 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round' }));
    a.append(mark, 'Span');
    return a;
  };

  return { api, session, el, svg, duration, countdown, bridge, sparkline, aiBadge, mountIdentity, logo, store, GROUP_COLORS, GROUP_NAMES, get me() { return me; } };
})();
