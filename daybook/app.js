/*
  Daybook shell: switches between the Plan and Money tabs and fills the
  "Today" header on the Plan tab with tasks, what's next, and money for the day.
*/
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const P = window.Daybook.plan;
  const M = window.Daybook.money;
  const VIEWS = ['plan', 'money'];
  const VIEW_KEY = 'daybook.view';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- tabs ----------
  let current = null;
  function show(view, { scroll = false } = {}) {
    if (!VIEWS.includes(view)) {
      let saved = null;
      try { saved = localStorage.getItem(VIEW_KEY); } catch { /* ignore */ }
      view = VIEWS.includes(saved) ? saved : 'plan';
    }
    const changedView = view !== current;
    current = view;
    VIEWS.forEach(v => {
      $('view-' + v).hidden = v !== view;
      document.querySelector(`.top-actions[data-for="${v}"]`).hidden = v !== view;
    });
    document.querySelectorAll('.tab').forEach(t => {
      if (t.dataset.view === view) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
    });
    try { localStorage.setItem(VIEW_KEY, view); } catch { /* ignore */ }
    if (location.hash !== '#' + view) history.replaceState(null, '', '#' + view);
    if (view === 'money') M.refresh();
    if (view === 'plan') renderToday();
    if (scroll && changedView) window.scrollTo({ top: 0 });
  }
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', e => {
    e.preventDefault();
    show(t.dataset.view, { scroll: true });
  }));
  window.addEventListener('hashchange', () => show(location.hash.slice(1), { scroll: true }));
  document.addEventListener('click', e => {
    const a = e.target.closest('a[data-go]');
    if (a) { e.preventDefault(); show(a.dataset.go, { scroll: true }); }
  });

  // ---------- Today header on the Plan tab ----------
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  function untilText(ms) {
    const min = Math.max(0, Math.round(ms / 60000));
    if (min < 1) return 'now';
    if (min < 60) return `in ${min} min`;
    const h = Math.floor(min / 60), m = min % 60;
    return `in ${h} h${m ? ` ${m} min` : ''}`;
  }

  function nextUp() {
    const now = new Date();
    const t = P.todayStr();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    for (let n = 0; n <= 7; n++) {
      const ds = P.addDays(t, n);
      const list = P.itemsOn(ds).filter(i => !P.isDone(i, ds));
      const pick = n === 0
        ? list.find(i => i.time && i.time >= hhmm) || null
        : list.find(i => i.time) || list[0] || null;
      if (pick) return { item: pick, ds, n };
    }
    return null;
  }

  function renderToday() {
    const t = P.todayStr();
    const now = new Date();
    const list = P.itemsOn(t);
    const tasks = list.filter(i => i.type === 'task');
    const left = tasks.filter(i => !P.isDone(i, t));
    const events = list.filter(i => i.type === 'event');

    $('p-hero-eyebrow').textContent = 'Today · ' + now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
    let fig, unit;
    if (!tasks.length) { fig = 'Free'; unit = events.length ? `no tasks · ${plural(events.length, 'event')}` : 'nothing due today'; }
    else if (!left.length) { fig = 'Done'; unit = tasks.length === 1 ? 'your task for today' : `all ${tasks.length} tasks for today`; }
    else { fig = String(left.length); unit = `task${left.length === 1 ? '' : 's'} left today`; }
    $('p-hero-figure').textContent = fig;
    $('p-hero-unit').textContent = unit;

    const parts = [];
    if (tasks.length && left.length && left.length < tasks.length) parts.push(`<strong>${tasks.length - left.length}</strong> of <strong>${tasks.length}</strong> done`);
    parts.push(`<strong>${esc(M.fmt0(M.spentOn(t)))}</strong> spent today`);
    const mo = M.month();
    if (mo.income > 0) {
      const keep = mo.income - mo.spent;
      parts.push(keep >= 0 ? `<strong>${esc(M.fmt0(keep))}</strong> left this month` : `<strong>${esc(M.fmt0(-keep))}</strong> over this month`);
    }
    $('p-hero-line').innerHTML = parts.join(' · ') + ` <a href="#money" data-go="money" class="inline-link">Open Money &#8594;</a>`;

    const nx = nextUp();
    const card = document.querySelector('.next-card');
    if (nx) {
      const { item, ds, n } = nx;
      let when;
      if (n === 0 && item.time) {
        const [h, m] = item.time.split(':').map(Number);
        const at = new Date(); at.setHours(h, m, 0, 0);
        when = untilText(at - now);
      } else if (n === 1) when = 'Tomorrow';
      else when = new Date(ds + 'T00:00').toLocaleDateString([], { weekday: 'long' });
      $('p-next-when').textContent = when;
      $('p-next-title').textContent = item.title;
      const meta = [item.type === 'task' ? 'Task' : 'Event'];
      if (item.time) meta.push(P.fmtTime(item.time) + (item.endTime ? ` – ${P.fmtTime(item.endTime)}` : ''));
      if (n > 1) meta.push(new Date(ds + 'T00:00').toLocaleDateString([], { day: 'numeric', month: 'short' }));
      if (item.remind >= 0) meta.push('Reminder set');
      $('p-next-meta').textContent = meta.join(' · ');
      card.dataset.id = item.id;
      card.classList.add('clickable');
    } else {
      $('p-next-when').textContent = '';
      $('p-next-title').textContent = 'A clear week';
      $('p-next-meta').textContent = 'Nothing scheduled. Add something with + New.';
      delete card.dataset.id;
      card.classList.remove('clickable');
    }
  }
  const nextCard = document.querySelector('.next-card');
  nextCard.setAttribute('tabindex', '0');
  nextCard.addEventListener('click', () => { if (nextCard.dataset.id) P.openEditor(nextCard.dataset.id); });
  nextCard.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && nextCard.dataset.id) { e.preventDefault(); P.openEditor(nextCard.dataset.id); } });

  document.addEventListener('daybook:change', () => { if (current === 'plan') renderToday(); });
  setInterval(() => { if (current === 'plan' && !document.hidden) renderToday(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && current === 'plan') renderToday(); });

  show(location.hash.slice(1));
})();
