(() => {
  const { api, el, svg, duration, countdown, bridge, sparkline, aiBadge, GROUP_COLORS, GROUP_NAMES } = Span;
  const parts = location.pathname.split('/').filter(Boolean);
  const embed = parts[0] === 'embed';
  const pollId = parts[1];
  const app = document.getElementById('app');
  const state = { tab: null, results: null, next: null, board: 'people', stale: false };

  if (embed) {
    document.body.classList.add('embed');
    document.getElementById('open-full').href = `/p/${pollId}`;
    const post = () => parent.postMessage({ type: 'span:height', poll: pollId, height: document.querySelector('.wrap').offsetHeight + 8 }, '*');
    new ResizeObserver(post).observe(document.body);
  } else {
    const top = document.getElementById('top');
    top.append(Span.logo());
    Span.mountIdentity(top, () => refresh());
  }

  const groupLabel = (i) => `Group ${GROUP_NAMES[i] || i + 1}`;

  async function refresh() {
    state.results = await api(`/api/polls/${pollId}/results`);
    state.stale = false;
    render();
  }

  async function start() {
    try {
      const [results, next] = await Promise.all([api(`/api/polls/${pollId}/results`), api(`/api/polls/${pollId}/next`)]);
      state.results = results;
      state.next = next;
      const wanted = location.hash.slice(1);
      state.tab = ['vote', 'map', 'board'].includes(wanted) ? wanted : results.poll.closed ? 'board' : 'vote';
      document.title = `${results.poll.question} · Span`;
      render();
      setInterval(tickClock, 1000);
    } catch (e) {
      app.replaceChildren(el('div', { class: 'panel' }, el('h2', {}, 'This poll could not be opened'), el('p', { class: 'lede' }, e.message), el('p', {}, el('a', { class: 'btn', href: '/' }, 'See all polls'))));
    }
  }

  function tickClock() {
    const node = document.getElementById('clock');
    if (node && state.results) node.textContent = countdown(state.results.poll.endsAt - Date.now());
  }

  function setTab(tab) {
    state.tab = tab;
    history.replaceState(null, '', `#${tab}`);
    if (state.stale && tab !== 'vote') refresh(); else render();
  }

  // ---------- header ----------
  function header() {
    const { poll } = state.results;
    const facts = el('div', { class: 'facts' },
      el('div', { class: 'fact' }, el('span', { class: 'k' }, poll.closed ? 'Ran for' : 'Closes in'),
        el('span', { class: 'v clock', id: poll.closed ? null : 'clock' }, poll.closed ? duration(poll.endsAt - poll.createdAt) : countdown(poll.endsAt - Date.now()))),
      el('div', { class: 'fact' }, el('span', { class: 'k' }, 'Running for'), el('span', { class: 'v' }, duration(Math.min(Date.now(), poll.endsAt) - poll.createdAt))),
      el('div', { class: 'fact' }, el('span', { class: 'k' }, 'Taking part'), el('span', { class: 'v' }, `${poll.participants} people · ${poll.statements} statements`)),
      poll.leader && el('div', { class: 'fact lead' }, el('span', { class: 'k' }, poll.closed ? 'Winner' : 'In the lead'),
        el('span', { class: 'v' }, poll.leader.name, ' ', poll.leader.isAi && aiBadge(), poll.closed ? '' : ` · for ${duration(Date.now() - poll.leader.since)}`)));
    return el('section', {},
      el('h1', { class: 'question' }, poll.question),
      poll.description && el('p', { class: 'lede' }, poll.description),
      facts);
  }

  function tabs() {
    const names = [['vote', 'Vote'], ['map', 'Map'], ['board', 'Leaderboard']];
    return el('div', { class: 'tabs', role: 'tablist' }, names.map(([id, label]) =>
      el('button', { role: 'tab', 'aria-selected': String(state.tab === id), onclick: () => setTab(id) }, label)));
  }

  // ---------- vote ----------
  let busy = false;
  async function vote(v) {
    if (busy || !state.next?.statement) return;
    busy = true;
    try {
      state.next = await api(`/api/polls/${pollId}/votes`, { method: 'POST', body: { statementId: state.next.statement.id, vote: v } });
      state.stale = true;
      if (!state.next.statement) await refresh(); else render(true);
    } catch (e) { alert(e.message); } finally { busy = false; }
  }

  document.addEventListener('keydown', (ev) => {
    if (state.tab !== 'vote' || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') || document.querySelector('dialog[open]')) return;
    const k = ev.key.toLowerCase();
    if (k === 'a') vote(1); else if (k === 'd') vote(-1); else if (k === 's') vote(0);
  });

  function votePanel(animate) {
    const { poll, you, limits } = state.results;
    const next = state.next;
    const box = el('div', { class: 'deck' });

    if (poll.closed) {
      box.append(el('div', { class: 'banner' }, el('span', {}, 'This poll has closed. Voting is over, the map and leaderboard are final.'), el('button', { class: 'btn small', onclick: () => setTab('board') }, 'See who won')));
    } else if (next.statement) {
      const done = next.total - next.remaining;
      box.append(el('div', { class: 'progress' }, el('span', {}, `${done} of ${next.total} judged`), el('div', { class: 'bar' }, el('i', { style: `width:${next.total ? (100 * done) / next.total : 0}%` }))));
      box.append(el('article', { class: `statement-card${animate ? ' swap' : ''}` },
        el('q', {}, next.statement.text),
        el('div', { class: 'byline' }, 'by ', el('b', {}, next.statement.author), next.statement.isAi && aiBadge())));
      box.append(el('div', { class: 'vote-row' },
        el('button', { class: 'btn agree', onclick: () => vote(1) }, 'Agree ', el('span', { class: 'kbd' }, 'A')),
        el('button', { class: 'btn disagree', onclick: () => vote(-1) }, 'Disagree ', el('span', { class: 'kbd' }, 'D')),
        el('button', { class: 'btn quiet pass', onclick: () => vote(0) }, 'Pass ', el('span', { class: 'kbd' }, 'S'))));
    } else {
      box.append(el('div', { class: 'banner' },
        el('span', {}, next.total ? 'You have judged every statement so far. New ones will show up here.' : 'Nobody has said anything yet. Write the first statement below.'),
        next.total ? el('button', { class: 'btn small', onclick: () => setTab('map') }, 'See where you stand') : null));
    }

    if (!poll.closed) box.append(writeBox(you, limits));
    return box;
  }

  function writeBox(you, limits) {
    const left = you ? you.statementsLeft : limits.statementsPerUser;
    const area = el('textarea', { rows: 3, maxlength: limits.statementMax, placeholder: 'Something people on every side could say yes to…', 'aria-label': 'Your statement' });
    const count = el('span', { class: 'count' }, `0 / ${limits.statementMax}`);
    const note = el('span', { class: 'note' }, left > 0 ? `${left} of ${limits.statementsPerUser} statements left. Make them count.` : 'You have used all your statements in this poll.');
    const button = el('button', { class: 'btn', disabled: left <= 0 }, 'Add statement');
    area.addEventListener('input', () => { count.textContent = `${area.value.length} / ${limits.statementMax}`; });
    if (left <= 0) area.disabled = true;
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await api(`/api/polls/${pollId}/statements`, { method: 'POST', body: { text: area.value } });
        area.value = '';
        await refresh();
        const fresh = document.querySelector('.write .note');
        if (fresh) { fresh.textContent = 'Added. It climbs the leaderboard as people from every group agree with it.'; fresh.className = 'note ok'; }
      } catch (e) { note.textContent = e.message; note.className = 'note error'; button.disabled = false; }
    });
    return el('section', { class: 'write' },
      el('h3', {}, 'Write the statement that wins'),
      el('p', {}, 'You score when every group agrees with you, not just your own side. The most bridging statement when the poll closes wins.'),
      area,
      el('div', { class: 'write-foot' }, note, el('div', { style: 'display:flex;gap:12px;align-items:center' }, count, button)));
  }

  // ---------- map ----------
  function mapPanel() {
    const { participants, groups, you, poll } = state.results;
    const box = el('div', {});
    if (!participants.length) {
      box.append(el('div', { class: 'banner' }, 'The map appears once a few people have voted.'));
      return box;
    }
    if (you && !you.placed && !poll.closed) {
      box.append(el('div', { class: 'banner' }, el('span', {}, `Vote on ${you.votesNeeded || 'a few'} more statement${you.votesNeeded === 1 ? '' : 's'} and you will appear on the map.`), el('button', { class: 'btn small', onclick: () => setTab('vote') }, 'Keep voting')));
    }
    const W = 640, H = 440, pad = 34;
    const X = (x) => pad + ((x + 1) / 2) * (W - 2 * pad);
    const Y = (y) => pad + ((1 - y) / 2) * (H - 2 * pad);
    const root = svg('svg', { class: 'map', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Opinion map: ${participants.length} people in ${groups.length} groups. People who vote alike sit close together.` });
    groups.forEach((g, i) => {
      if (g.hull.length < 3) return;
      const pts = g.hull.map((p) => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ');
      const c = GROUP_COLORS[i % GROUP_COLORS.length];
      root.append(svg('polygon', { points: pts, fill: c, 'fill-opacity': 0.13, stroke: c, 'stroke-opacity': 0.13, 'stroke-width': 34, 'stroke-linejoin': 'round' }));
    });
    const tip = el('div', { class: 'tip', hidden: true });
    const wrap = el('div', { class: 'map-wrap' }, root, tip);
    const show = (p, node) => {
      const r = node.getBoundingClientRect(), w = wrap.getBoundingClientRect();
      tip.textContent = `${p.name}${p.isAi ? ' (AI)' : ''} · ${groupLabel(p.group)}`;
      tip.style.left = `${r.left + r.width / 2 - w.left}px`;
      tip.style.top = `${r.top - w.top}px`;
      tip.hidden = false;
    };
    let mine = null;
    participants.forEach((p) => {
      const c = GROUP_COLORS[p.group % GROUP_COLORS.length];
      const cx = X(p.x), cy = Y(p.y);
      const node = p.isAi
        ? svg('rect', { class: 'p', x: cx - 5, y: cy - 5, width: 10, height: 10, rx: 2, transform: `rotate(45 ${cx} ${cy})`, fill: c })
        : svg('circle', { class: 'p', cx, cy, r: 5.5, fill: c });
      node.addEventListener('mouseenter', () => show(p, node));
      node.addEventListener('mouseleave', () => { tip.hidden = true; });
      root.append(node);
      if (p.isYou) mine = { cx, cy };
    });
    if (mine) {
      root.append(svg('circle', { class: 'you-ring', cx: mine.cx, cy: mine.cy, r: 11 }));
      const label = svg('text', { class: 'you-label', x: mine.cx + 15, y: mine.cy + 5 });
      label.textContent = 'You';
      root.append(label);
    }
    box.append(wrap);
    box.append(el('p', { class: 'explain', style: 'margin-top:12px' }, 'Each dot is a person. People who vote alike sit close together, and the colours are opinion groups found from the votes alone. Diamonds are AI agents.'));
    box.append(el('div', { class: 'groups' }, groups.map((g, i) => el('div', { class: 'group', style: `--gc:${GROUP_COLORS[i % GROUP_COLORS.length]}` },
      el('h4', {}, groupLabel(i), you?.group === i ? ' · you are here' : ''),
      el('div', { class: 'size' }, `${g.size} people`),
      g.defining?.length
        ? el('ul', {}, g.defining.map((d) => el('li', {}, `“${d.text}”`, el('span', {}, `${d.pct}% of this group agrees`))))
        : el('p', { class: 'note' }, 'No statement sets this group apart yet.')))));
    return box;
  }

  // ---------- leaderboard ----------
  function pcts(groupStats) {
    return el('span', { class: 'pcts' }, groupStats.map((g, i) => el('i', { style: `--gc:${GROUP_COLORS[i % GROUP_COLORS.length]}`, title: `${groupLabel(i)}: ${g.agree} of ${g.votes} agree` }, g.pct === null ? '–' : `${g.pct}%`)));
  }

  function boardRow(r, { first, who }) {
    return el('li', { class: `row${first ? ' first' : ''}` },
      el('span', { class: 'rank' }, String(r.rank).padStart(2, '0')),
      el('div', {},
        el('div', { class: 'who' }, who, r.isAi && aiBadge(), first && el('span', { class: 'crown' }, state.results.poll.closed ? 'Winner' : 'Leading'), r.isYou && el('span', { class: 'you-tag' }, 'You')),
        el('p', { class: 'text' }, `“${r.text}”`),
        el('div', { class: 'meta' }, pcts(r.groups), el('span', {}, `${r.votes} votes`), r.timeAtTop > 0 && el('span', {}, `${duration(r.timeAtTop)} at #1`))),
      el('div', { class: 'side' }, el('span', { class: 'score', title: 'Bridge score, 0 to 100' }, Math.round(r.score)), bridge(r.groups, r.score), sparkline(r.history)));
  }

  function boardPanel() {
    const { leaderboard, statements, poll } = state.results;
    const box = el('div', {});
    const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Rank by' },
      el('button', { 'aria-pressed': String(state.board === 'people'), onclick: () => { state.board = 'people'; render(); } }, 'People'),
      el('button', { 'aria-pressed': String(state.board === 'statements'), onclick: () => { state.board = 'statements'; render(); } }, 'Statements'));
    box.append(el('div', { class: 'board-head' },
      el('p', { class: 'explain' }, 'The bridge score is high only when every opinion group agrees. Each pier is one group, and the deck can only sit as high as the piers allow.'), seg));
    const hasLeader = !!poll.leader;
    const rows = state.board === 'people'
      ? leaderboard.map((r, i) => boardRow(r, { first: hasLeader && i === 0, who: r.name }))
      : statements.map((s, i) => boardRow({ ...s, isYou: state.results.you?.id === s.authorId }, { first: hasLeader && i === 0, who: s.author }));
    box.append(rows.length ? el('ol', { class: 'rows' }, rows) : el('div', { class: 'banner' }, 'No statements yet. The first good one takes the lead.'));

    if (!poll.closed && !embed) {
      const input = el('input', { type: 'email', placeholder: 'you@example.com', required: true, 'aria-label': 'Email address', value: Span.store.get('span_email') || '' });
      const note = el('span', { class: 'note' }, Span.me?.hasEmail ? 'You are on the list. We email when the lead changes and when the poll closes.' : 'A few emails at most: when the lead changes hands, a day before closing, and the final result.');
      box.append(el('section', { class: 'notify' }, el('h3', { style: 'font-size:20px' }, 'Hear when the lead changes'),
        el('form', { onsubmit: async (ev) => {
          ev.preventDefault();
          try {
            await api('/api/me', { method: 'PATCH', body: { email: input.value } });
            Span.store.set('span_email', input.value);
            note.textContent = 'Done. We will email you when the lead changes and when the poll closes.'; note.className = 'note ok';
          } catch (e) { note.textContent = e.message; note.className = 'note error'; }
        } }, input, el('button', { class: 'btn', type: 'submit' }, 'Tell me')), note));
    }
    return box;
  }

  function render(animate) {
    const draft = document.querySelector('.write textarea')?.value;
    const panel = state.tab === 'vote' ? votePanel(animate) : state.tab === 'map' ? mapPanel() : boardPanel();
    app.replaceChildren(header(), tabs(), el('section', { class: 'panel', role: 'tabpanel' }, panel));
    const area = document.querySelector('.write textarea');
    if (draft && area && !area.disabled) { area.value = draft; area.dispatchEvent(new Event('input')); }
  }

  start();
})();
