(() => {
  const { api, el, duration, bridge, aiBadge, GROUP_NAMES } = Span;
  const top = document.getElementById('top');
  top.append(Span.logo());
  Span.mountIdentity(top);

  const snippet = (id) => `<div data-span-poll="${id}"></div>\n<script async src="${location.origin}/embed.js"><\/script>`;

  function pollItem(p) {
    const now = Date.now();
    return el('a', { class: 'poll-item', href: `/p/${p.id}` },
      el('div', { class: 'line' },
        el('span', { class: `pill${p.closed ? '' : ' live'}` }, p.closed ? 'Closed' : `Closes in ${duration(p.endsAt - now)}`),
        el('span', {}, `running ${duration(Math.min(now, p.endsAt) - p.createdAt)}`),
        el('span', {}, `${p.participants} people`),
        el('span', {}, `${p.statements} statements`)),
      el('h3', {}, p.question),
      p.leader && el('div', { class: 'line' }, el('span', {}, p.closed ? 'Won by ' : 'Led by ', el('b', {}, p.leader.name), ' ', p.leader.isAi && aiBadge(), p.closed ? '' : ` for ${duration(now - p.leader.since)}`)));
  }

  async function hero(polls) {
    const live = polls.filter((p) => !p.closed && p.leader).sort((a, b) => b.participants - a.participants)[0];
    if (!live) return;
    const { statements } = await api(`/api/polls/${live.id}/results`);
    const s = statements[0];
    if (!s) return;
    document.getElementById('hero-card').replaceChildren(el('a', { class: 'hero-card', href: `/p/${live.id}#board` },
      el('span', { class: 'eyebrow' }, `Leading right now · ${live.question}`),
      el('q', {}, s.text),
      el('div', { class: 'hero-bridge' }, bridge(s.groups, s.score, { w: 300, h: 110 })),
      el('div', { class: 'piers' }, s.groups.map((g, i) => el('span', {}, `Group ${GROUP_NAMES[i]} ${g.pct}%`))),
      el('div', { class: 'byline' }, el('b', {}, s.author), s.isAi && aiBadge(), ` · bridge score ${Math.round(s.score)}`)));
  }

  async function load() {
    const list = document.getElementById('poll-list');
    try {
      const { polls } = await api('/api/polls');
      list.replaceChildren(...(polls.length ? polls.map(pollItem) : [el('p', { class: 'note' }, 'No polls yet. Start the first one below.')]));
      document.getElementById('snippet').textContent = snippet(polls[0]?.id || 'YOUR-POLL-ID');
      hero(polls);
    } catch (e) {
      list.replaceChildren(el('p', { class: 'note error' }, e.message));
    }
  }

  document.getElementById('create-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const note = document.getElementById('create-note');
    try {
      const { poll } = await api('/api/polls', { method: 'POST', body: {
        question: f.question.value, description: f.description.value, days: f.days.value,
        seedStatements: f.seeds.value.split('\n').map((s) => s.trim()).filter(Boolean),
      } });
      location.href = `/p/${poll.id}`;
    } catch (e) { note.textContent = e.message; note.className = 'note error'; }
  });

  load();
})();
