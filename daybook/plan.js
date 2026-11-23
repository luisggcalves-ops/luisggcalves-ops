/*
  Planner — personal calendar + task reminders.
  Everything is stored in this browser's localStorage.
  Reminders pop up (system notification + in-page alert) while the page is open.
  For reminders when the tab is closed, export to a calendar app (.ics).
*/
(() => {
  'use strict';
  const changed = () => document.dispatchEvent(new CustomEvent('daybook:change', { detail: { source: 'plan' } }));
  const BELL_SVG = '<svg class="bell-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>';

  const STORE_KEY = 'planner.items.v1';
  const FIRED_KEY = 'planner.fired.v1';
  const DEFAULT_REMIND_HOUR = '09:00'; // used for items with no time

  // ---------- storage ----------
  const load = (key, fallback) => {
    try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; }
    catch { return fallback; }
  };
  const save = (key, val) => {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* storage full or blocked */ }
  };

  // ---------- dates ----------
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
  const todayStr = () => ymd(new Date());
  const at = (dateStr, time) => { const d = parseYmd(dateStr); const [h, m] = time.split(':').map(Number); d.setHours(h, m, 0, 0); return d; };
  const fmtTime = t => {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    return new Date(2000, 0, 1, h, m).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };
  const fmtLong = s => parseYmd(s).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  const fmtShort = s => parseYmd(s).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ---------- state ----------
  let items = load(STORE_KEY, null);
  if (!Array.isArray(items)) { items = seedExamples(); save(STORE_KEY, items); }
  let fired = load(FIRED_KEY, {});
  let selected = todayStr();
  let viewYear = parseYmd(selected).getFullYear();
  let viewMonth = parseYmd(selected).getMonth();
  let editingId = null;

  const persist = () => { save(STORE_KEY, items); changed(); };

  function seedExamples() {
    const t = todayStr();
    const ex = (o) => ({ id: uid(), example: true, notes: '', endTime: '', priority: 'normal', remind: -1, repeat: 'none', doneDates: [], ...o });
    return [
      ex({ type: 'event', title: 'Gym — push day', date: t, time: '18:00', endTime: '19:15', repeat: 'weekly', remind: 30 }),
      ex({ type: 'task',  title: 'Reply to emails', date: t, time: '', priority: 'normal' }),
      ex({ type: 'task',  title: 'Pay phone bill', date: addDays(t, 2), time: '10:00', priority: 'high', remind: 1440, repeat: 'monthly', amount: 25, moneyCat: 'subs' }),
      ex({ type: 'event', title: 'Dinner with friends', date: addDays(t, 4), time: '20:00', remind: 60 }),
      ex({ type: 'task',  title: 'Plan the week', date: t, time: '19:30', repeat: 'weekly', remind: 15 }),
    ];
  }

  // ---------- recurrence ----------
  function occursOn(item, ds) {
    if (ds < item.date) return false;
    if (item.repeat === 'none' || !item.repeat) return ds === item.date;
    const d = parseYmd(ds), start = parseYmd(item.date);
    switch (item.repeat) {
      case 'daily': return true;
      case 'weekdays': return d.getDay() >= 1 && d.getDay() <= 5;
      case 'weekly': return d.getDay() === start.getDay();
      case 'monthly': return d.getDate() === start.getDate();
      default: return false;
    }
  }
  const isDone = (item, ds) => item.type === 'task' && item.doneDates.includes(ds);
  const sortItems = (a, b) => (a.time || '99:99').localeCompare(b.time || '99:99') || a.title.localeCompare(b.title);
  const itemsOn = ds => items.filter(i => occursOn(i, ds)).sort(sortItems);

  const overdueTasks = () => {
    const t = todayStr();
    return items.filter(i => i.type === 'task' && i.repeat === 'none' && i.date < t && !isDone(i, i.date))
                .sort((a, b) => a.date.localeCompare(b.date));
  };

  // ---------- rendering ----------
  const $ = id => document.getElementById(id);
  const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  const BELL = `<span class="bell" title="Reminder set">${BELL_SVG}</span>`;
  const REPEAT_LABEL = { daily: 'Daily', weekdays: 'Weekdays', weekly: 'Weekly', monthly: 'Monthly' };

  function renderCalendar() {
    const first = new Date(viewYear, viewMonth, 1);
    $('p-month-label').textContent = first.toLocaleDateString([], { month: 'long', year: 'numeric' });
    const offset = (first.getDay() + 6) % 7; // Monday first
    const start = new Date(viewYear, viewMonth, 1 - offset);
    const t = todayStr();
    const grid = $('p-cal-grid');
    grid.innerHTML = '';
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const ds = ymd(d);
      const list = itemsOn(ds);
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'day' + (d.getMonth() !== viewMonth ? ' other' : '') + (ds === t ? ' today' : '') + (ds === selected ? ' selected' : '');
      cell.setAttribute('aria-label', `${fmtLong(ds)}, ${list.length} item${list.length === 1 ? '' : 's'}`);
      const chips = list.slice(0, 3).map(it =>
        `<span class="chip ${it.type}${it.priority === 'high' && it.type === 'task' ? ' high' : ''}${isDone(it, ds) ? ' done' : ''}">${it.time ? fmtTime(it.time) + ' ' : ''}${esc(it.title)}</span>`).join('');
      const more = list.length > 3 ? `<span class="more">+${list.length - 3} more</span>` : '';
      const dots = list.slice(0, 6).map(it =>
        `<i class="dot ${it.type === 'task' ? (it.priority === 'high' ? 'dot-high' : 'dot-task') : ''}${isDone(it, ds) ? ' dot-done' : ''}"></i>`).join('');
      cell.innerHTML = `<span class="num">${d.getDate()}</span>${chips}${more}<span class="dots">${dots}</span>`;
      cell.addEventListener('click', () => {
        if (cell.classList.contains('selected')) { openEditor(null, ds); return; }
        selectDay(ds);
      });
      grid.appendChild(cell);
    }
  }

  function itemRow(it, ds, opts = {}) {
    const row = document.createElement('div');
    const done = isDone(it, ds);
    row.className = `item ${it.type}${it.type === 'task' && it.priority === 'high' ? ' high' : ''}${done ? ' done' : ''}`;
    const lead = it.type === 'task'
      ? `<button type="button" class="check${done ? ' on' : ''}" aria-label="${done ? 'Mark not done' : 'Mark done'}">${done ? CHECK_SVG : ''}</button>`
      : `<span class="item-time">${it.time ? fmtTime(it.time) : 'All day'}</span>`;
    const meta = [];
    if (opts.showDate) meta.push(fmtShort(ds));
    if (it.type === 'task' && it.time) meta.push(fmtTime(it.time));
    if (it.type === 'event' && it.endTime) meta.push('until ' + fmtTime(it.endTime));
    if (it.repeat && it.repeat !== 'none') meta.push(REPEAT_LABEL[it.repeat]);
    if (it.amount > 0) meta.push((M() ? M().fmt(it.amount) : it.amount) + (it.autopay ? ' · auto' : ''));
    if (it.example) meta.push('Example');
    row.innerHTML = `${lead}
      <div class="item-main" role="button" tabindex="0">
        <div class="item-title">${esc(it.title)}</div>
        ${meta.length ? `<div class="item-meta">${meta.map(esc).join('<span>·</span>')}</div>` : ''}
      </div>
      <span>${it.type === 'task' && it.priority === 'high' && !done ? '<span class="pill">High</span> ' : ''}${it.remind >= 0 ? BELL : ''}</span>`;
    const check = row.querySelector('.check');
    if (check) check.addEventListener('click', () => toggleDone(it.id, ds));
    const main = row.querySelector('.item-main');
    main.addEventListener('click', () => openEditor(it.id));
    main.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEditor(it.id); } });
    return row;
  }

  function renderDay() {
    const t = todayStr();
    $('p-day-label').textContent = selected === t ? 'Today' : fmtLong(selected);
    const list = itemsOn(selected);
    const open = list.filter(i => i.type === 'task' && !isDone(i, selected)).length;
    $('p-day-sub').textContent = selected === t ? fmtLong(selected) : (selected === addDays(t, 1) ? 'Tomorrow' : '');
    if (list.length) $('p-day-sub').textContent += ($('p-day-sub').textContent ? ' · ' : '') + `${open} task${open === 1 ? '' : 's'} left`;
    const box = $('p-day-list');
    box.innerHTML = '';
    if (!list.length) { box.innerHTML = '<div class="empty">Nothing planned. Tap “+ Add”, or tap the selected day again.</div>'; return; }
    const events = list.filter(i => i.type === 'event'), tasks = list.filter(i => i.type === 'task');
    if (events.length) { box.insertAdjacentHTML('beforeend', '<div class="group-label">Events</div>'); events.forEach(i => box.appendChild(itemRow(i, selected))); }
    if (tasks.length) { box.insertAdjacentHTML('beforeend', '<div class="group-label">Tasks</div>'); tasks.forEach(i => box.appendChild(itemRow(i, selected))); }
  }

  function renderSide() {
    const od = overdueTasks();
    $('p-overdue-card').hidden = !od.length;
    const obox = $('p-overdue-list'); obox.innerHTML = '';
    od.forEach(i => obox.appendChild(itemRow(i, i.date, { showDate: true })));

    const ubox = $('p-upcoming-list'); ubox.innerHTML = '';
    const t = todayStr();
    let count = 0;
    for (let n = 1; n <= 7; n++) {
      const ds = addDays(t, n);
      itemsOn(ds).filter(i => !isDone(i, ds)).forEach(i => { ubox.appendChild(itemRow(i, ds, { showDate: true })); count++; });
    }
    if (!count) ubox.innerHTML = '<div class="empty">Nothing in the next week.</div>';

    $('p-example-banner').hidden = !items.some(i => i.example);
  }

  function render() { renderCalendar(); renderDay(); renderSide(); }

  function selectDay(ds) {
    selected = ds;
    const d = parseYmd(ds);
    viewYear = d.getFullYear(); viewMonth = d.getMonth();
    render();
  }

  const M = () => window.Daybook && window.Daybook.money;
  const billKey = (it, ds) => `plan:${it.id}@${ds}`;
  function recordBill(it, ds) {
    if (it.amount > 0 && M()) M().addLinked(billKey(it, ds), { date: ds, desc: it.title, cat: it.moneyCat || 'other', amount: it.amount });
  }
  function toggleDone(id, ds) {
    const it = items.find(i => i.id === id); if (!it) return;
    const nowDone = !it.doneDates.includes(ds);
    it.doneDates = nowDone ? [...it.doneDates, ds] : it.doneDates.filter(x => x !== ds);
    if (it.amount > 0) {
      if (nowDone) recordBill(it, ds); else if (M()) M().removeLinked(billKey(it, ds));
      // an unticked direct debit stays unpaid until ticked again
      if (it.autopay) it.skipDates = nowDone ? (it.skipDates || []).filter(x => x !== ds) : [...new Set([...(it.skipDates || []), ds])];
    }
    persist(); render();
  }

  // Direct debits: record each due occurrence (up to today) once, without a tap.
  function runAutopay() {
    const t = todayStr();
    let any = false;
    for (const it of items) {
      if (it.type !== 'task' || !it.autopay || !(it.amount > 0) || it.example) continue;
      let ds = it.date, guard = 0;
      const floor = addDays(t, -400);
      if (ds < floor) ds = floor;
      while (ds <= t && guard++ < 420) {
        if (occursOn(it, ds) && !it.doneDates.includes(ds) && !(it.skipDates || []).includes(ds)) {
          it.doneDates.push(ds); recordBill(it, ds); any = true;
        }
        ds = addDays(ds, 1);
      }
    }
    if (any) { persist(); render(); }
  }

  // Unpaid bills due between two dates (inclusive), for the Money tab.
  function billsBetween(from, to) {
    const out = [];
    for (let ds = from, g = 0; ds <= to && g < 40; ds = addDays(ds, 1), g++) {
      items.forEach(it => {
        if (it.type === 'task' && it.amount > 0 && occursOn(it, ds) && !isDone(it, ds)) out.push({ item: it, ds, amount: it.amount });
      });
    }
    return out;
  }

  // ---------- editor ----------
  const form = $('p-item-form');
  const setType = type => {
    form.dataset.type = type;
    $(type === 'task' ? 'p-type-task' : 'p-type-event').checked = true;
    $('p-f-title').placeholder = type === 'task' ? 'e.g. Pay rent' : 'e.g. Dentist appointment';
  };
  form.querySelectorAll('input[name="type"]').forEach(r => r.addEventListener('change', () => setType(r.value)));

  function openEditor(id, dateStr) {
    editingId = id;
    const it = id ? items.find(i => i.id === id) : null;
    $('p-modal-title').textContent = it ? 'Edit' : 'New item';
    setType(it ? it.type : 'task');
    $('p-f-title').value = it ? it.title : '';
    $('p-f-date').value = it ? it.date : (dateStr || selected);
    $('p-f-time').value = it ? it.time : '';
    $('p-f-end').value = it ? it.endTime : '';
    $('p-f-priority').value = it ? it.priority : 'normal';
    $('p-f-repeat').value = it ? it.repeat : 'none';
    $('p-f-remind').value = String(it ? it.remind : 15);
    $('p-f-notes').value = it ? it.notes : '';
    fillBillFields(it);
    $('p-delete-btn').hidden = !it;
    $('p-modal').hidden = false;
    setTimeout(() => $('p-f-title').focus(), 30);
  }
  const closeEditor = () => { $('p-modal').hidden = true; editingId = null; };

  function fillBillFields(it) {
    const cats = M() ? M().categories().filter(c => c.kind === 'expense') : [];
    const guess = it && it.moneyCat ? it.moneyCat : (window.Daybook.quick ? window.Daybook.quick.guessCategory(it ? it.title : '') : 'other');
    $('p-f-cat').innerHTML = cats.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
    $('p-f-cat').value = cats.some(c => c.id === guess) ? guess : 'other';
    $('p-f-amount').value = it && it.amount > 0 ? String(it.amount) : '';
    $('p-f-autopay').checked = !!(it && it.autopay);
    syncBillUi();
  }
  function syncBillUi() {
    const has = parseFloat(String($('p-f-amount').value).replace(',', '.')) > 0;
    form.classList.toggle('has-amount', has);
  }
  $('p-f-amount').addEventListener('input', syncBillUi);
  $('p-f-title').addEventListener('change', () => {
    // suggest a category from the title until one has been picked
    if (!editingId && !$('p-f-amount').value && window.Daybook.quick) {
      const g = window.Daybook.quick.guessCategory($('p-f-title').value);
      if ([...$('p-f-cat').options].some(o => o.value === g)) $('p-f-cat').value = g;
    }
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    const data = {
      type: form.dataset.type,
      title: $('p-f-title').value.trim(),
      date: $('p-f-date').value,
      time: $('p-f-time').value,
      endTime: form.dataset.type === 'event' ? $('p-f-end').value : '',
      priority: $('p-f-priority').value,
      repeat: $('p-f-repeat').value,
      remind: Number($('p-f-remind').value),
      notes: $('p-f-notes').value.trim(),
    };
    const amt = parseFloat(String($('p-f-amount').value).replace(/[^\d.,]/g, '').replace(',', '.'));
    data.amount = data.type === 'task' && amt > 0 ? Math.round(amt * 100) / 100 : 0;
    data.moneyCat = data.amount ? $('p-f-cat').value : '';
    data.autopay = !!(data.amount && $('p-f-autopay').checked);
    if (!data.title || !data.date) return;
    if (editingId) {
      const it = items.find(i => i.id === editingId);
      // reminder settings changed → allow it to fire again
      if (it.time !== data.time || it.remind !== data.remind || it.date !== data.date) clearFired(it.id);
      Object.assign(it, data, { example: false });
    } else {
      items.push({ id: uid(), doneDates: [], ...data });
    }
    persist(); closeEditor(); selectDay(data.date);
    if (data.autopay) runAutopay();
    if (data.remind >= 0) maybeAskPermission();
  });
  $('p-cancel-btn').addEventListener('click', closeEditor);
  $('p-modal').addEventListener('click', e => { if (e.target.id === 'p-modal') closeEditor(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('p-modal').hidden) closeEditor(); });
  $('p-delete-btn').addEventListener('click', () => {
    const btn = $('p-delete-btn');
    if (btn.dataset.confirm !== '1') { btn.dataset.confirm = '1'; btn.textContent = 'Tap again to delete'; setTimeout(() => { btn.dataset.confirm = ''; btn.textContent = 'Delete'; }, 3000); return; }
    btn.dataset.confirm = ''; btn.textContent = 'Delete';
    items = items.filter(i => i.id !== editingId); clearFired(editingId);
    persist(); closeEditor(); render();
  });

  // ---------- reminders ----------
  const clearFired = id => { Object.keys(fired).forEach(k => { if (k.startsWith(id + '@')) delete fired[k]; }); save(FIRED_KEY, fired); };

  function updateNotifyBtn() {
    const btn = $('p-notify-btn');
    const label = t => { btn.innerHTML = `${BELL_SVG}<span class="lbl">${t}</span>`; btn.setAttribute('aria-label', t); };
    if (!('Notification' in window)) { label('Reminders in app'); btn.disabled = true; return; }
    const p = Notification.permission;
    btn.classList.toggle('on', p === 'granted');
    label(p === 'granted' ? 'Reminders on' : p === 'denied' ? 'Pop-ups blocked' : 'Turn on reminders');
    btn.title = p === 'denied' ? 'Allow notifications for this site in your browser settings' : 'Show system pop-ups for reminders';
  }
  function maybeAskPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(updateNotifyBtn).catch(() => {});
    }
  }
  $('p-notify-btn').addEventListener('click', () => {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      showToast({ title: 'Reminders are on', sub: 'Keep this tab open (it can be in the background).', kind: 'info' });
      return;
    }
    if (Notification.permission === 'denied') {
      showToast({ title: 'Pop-ups are blocked', sub: 'Allow notifications for this site in your browser settings. In-page alerts still work.', kind: 'info' });
      return;
    }
    maybeAskPermission();
  });

  let audioCtx = null;
  function beep() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(audioCtx.destination);
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.2, audioCtx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.5);
      o.start(); o.stop(audioCtx.currentTime + 0.5);
    } catch { /* audio not available */ }
  }

  function checkReminders() {
    const now = Date.now();
    const t = todayStr();
    // look at yesterday..tomorrow+1 so "1 day before" reminders work
    for (let n = -1; n <= 2; n++) {
      const ds = addDays(t, n);
      for (const it of items) {
        if (it.remind < 0 || !occursOn(it, ds) || isDone(it, ds)) continue;
        const key = `${it.id}@${ds}`;
        if (fired[key]) continue;
        const occ = at(ds, it.time || DEFAULT_REMIND_HOUR).getTime();
        const trigger = occ - it.remind * 60000;
        if (now >= trigger && now < occ + 2 * 3600000) {
          fired[key] = now;
          fireReminder(it, ds);
        }
      }
    }
    // prune old keys
    const cutoff = now - 4 * 86400000;
    Object.keys(fired).forEach(k => { if (fired[k] < cutoff) delete fired[k]; });
    save(FIRED_KEY, fired);
  }

  function whenText(it, ds) {
    const t = todayStr();
    const day = ds === t ? 'Today' : ds === addDays(t, 1) ? 'Tomorrow' : fmtShort(ds);
    return it.time ? `${day} at ${fmtTime(it.time)}` : day;
  }

  function fireReminder(it, ds) {
    const label = it.type === 'task' ? 'Task' : 'Event';
    const sub = `${label} · ${whenText(it, ds)}`;
    if ('Notification' in window && Notification.permission === 'granted') {
      const opts = { body: sub, tag: `${it.id}@${ds}`, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: './#plan' } };
      const direct = () => {
        try { const n = new Notification(it.title, opts); n.onclick = () => { window.focus(); selectDay(ds); n.close(); }; } catch { /* needs the service worker */ }
      };
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then(reg => reg.showNotification(it.title, opts)).catch(direct);
      } else direct();
    }
    beep();
    showToast({
      title: it.title, sub, kind: 'reminder',
      actions: it.type === 'task'
        ? [{ label: 'Mark done', primary: true, fn: () => { if (!isDone(it, ds)) toggleDone(it.id, ds); } },
           { label: 'Snooze 10 min', fn: () => setTimeout(() => fireReminder(it, ds), 600000) }]
        : [{ label: 'Snooze 10 min', fn: () => setTimeout(() => fireReminder(it, ds), 600000) }],
    });
    if (document.hidden) document.title = '🔔 ' + it.title;
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) document.title = 'Daybook'; });

  function showToast({ title, sub, kind = 'reminder', actions = [] }) {
    const el = document.createElement('div');
    el.className = 'rtoast' + (kind === 'info' ? ' info' : '');
    el.setAttribute('role', kind === 'reminder' ? 'alert' : 'status');
    el.innerHTML = `<div class="rtoast-title">${kind === 'reminder' ? BELL_SVG : ''}${esc(title)}</div>
      <div class="rtoast-sub">${esc(sub)}</div><div class="rtoast-actions"></div>`;
    const bar = el.querySelector('.rtoast-actions');
    [...actions, { label: kind === 'reminder' ? 'Dismiss' : 'OK' }].forEach(a => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn btn-sm ' + (a.primary ? 'btn-gold' : 'btn-ghost');
      b.textContent = a.label;
      b.addEventListener('click', () => { a.fn && a.fn(); el.remove(); });
      bar.appendChild(b);
    });
    $('toasts').appendChild(el);
    if (kind === 'info') setTimeout(() => el.remove(), 6000);
  }

  // ---------- export / import ----------
  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const icsEsc = s => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const icsDate = s => s.replace(/-/g, '');
  const icsDateTime = (s, t) => `${icsDate(s)}T${t.replace(':', '')}00`;
  const RRULE = { daily: 'FREQ=DAILY', weekdays: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', weekly: 'FREQ=WEEKLY', monthly: 'FREQ=MONTHLY' };

  function buildIcs() {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Planner//EN', 'CALSCALE:GREGORIAN'];
    items.filter(i => !i.example).forEach(it => {
      lines.push('BEGIN:VEVENT', `UID:${it.id}@planner`, `DTSTAMP:${stamp}`);
      lines.push(`SUMMARY:${icsEsc((it.type === 'task' ? 'Task: ' : '') + it.title)}`);
      if (it.time) {
        let end = it.endTime;
        if (!end || end <= it.time) {
          const e = at(it.date, it.time); e.setMinutes(e.getMinutes() + (it.type === 'task' ? 15 : 60));
          end = `${pad(e.getHours())}:${pad(e.getMinutes())}`;
          if (end <= it.time) end = '23:59';
        }
        lines.push(`DTSTART:${icsDateTime(it.date, it.time)}`, `DTEND:${icsDateTime(it.date, end)}`);
      } else {
        lines.push(`DTSTART;VALUE=DATE:${icsDate(it.date)}`, `DTEND;VALUE=DATE:${icsDate(addDays(it.date, 1))}`);
      }
      if (RRULE[it.repeat]) lines.push(`RRULE:${RRULE[it.repeat]}`);
      if (it.notes) lines.push(`DESCRIPTION:${icsEsc(it.notes)}`);
      if (it.remind >= 0) {
        // all-day items: remind at 9:00 on the day (minus the lead time)
        const mins = it.time ? it.remind : it.remind - 9 * 60;
        const trig = mins >= 0 ? `-PT${mins}M` : `PT${-mins}M`;
        lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(it.title)}`, `TRIGGER:${trig}`, 'END:VALARM');
      }
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  $('p-export-ics-btn').addEventListener('click', () => {
    if (!items.some(i => !i.example)) { showToast({ title: 'Nothing to export yet', sub: 'Add your own items first. Examples are left out.', kind: 'info' }); return; }
    download('planner.ics', buildIcs(), 'text/calendar');
    showToast({ title: 'Calendar file downloaded', sub: 'Open planner.ics on your phone or computer to add everything to your calendar app.', kind: 'info' });
  });
  $('p-export-json-btn').addEventListener('click', () => {
    download(`planner-backup-${todayStr()}.json`, JSON.stringify({ version: 1, items }, null, 2), 'application/json');
  });
  $('p-import-json-btn').addEventListener('click', () => $('p-import-file').click());
  $('p-import-file').addEventListener('change', async e => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const incoming = Array.isArray(data) ? data : data.items;
      if (!Array.isArray(incoming)) throw new Error('bad file');
      const ok = incoming.filter(i => i && i.id && i.title && /^\d{4}-\d{2}-\d{2}$/.test(i.date))
        .map(i => ({ type: 'task', time: '', endTime: '', priority: 'normal', repeat: 'none', remind: -1, notes: '', doneDates: [], ...i }));
      const byId = new Map(items.map(i => [i.id, i]));
      ok.forEach(i => byId.set(i.id, i));
      items = [...byId.values()];
      persist(); render();
      showToast({ title: `Restored ${ok.length} item${ok.length === 1 ? '' : 's'}`, sub: 'Merged with what was already here.', kind: 'info' });
    } catch {
      showToast({ title: "That file couldn't be read", sub: 'Choose a backup file downloaded from this planner (.json).', kind: 'info' });
    }
  });

  // ---------- wiring ----------
  $('p-new-btn').addEventListener('click', () => openEditor(null));
  $('p-add-day-btn').addEventListener('click', () => openEditor(null, selected));
  $('p-today-btn').addEventListener('click', () => selectDay(todayStr()));
  $('p-prev-month').addEventListener('click', () => { viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear--; } renderCalendar(); });
  $('p-next-month').addEventListener('click', () => { viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++; } renderCalendar(); });
  $('p-clear-examples-btn').addEventListener('click', () => { items = items.filter(i => !i.example); persist(); render(); });

  // re-render at midnight so "Today" stays correct
  let lastDay = todayStr();
  setInterval(() => {
    if (todayStr() !== lastDay) { if (selected === lastDay) selected = todayStr(); lastDay = todayStr(); render(); }
    checkReminders();
  }, 20000);

  window.Daybook = window.Daybook || {};
  window.Daybook.plan = {
    itemsOn, isDone, todayStr, fmtTime, addDays, openEditor, runAutopay, billsBetween,
    addItem(data) {
      const it = { id: uid(), type: 'task', time: '', endTime: '', priority: 'normal', repeat: 'none', remind: -1, notes: '', doneDates: [], amount: 0, moneyCat: '', autopay: false, ...data };
      items.push(it); persist(); render();
      if (it.remind >= 0) maybeAskPermission();
      return it.id;
    },
    removeItem(id) { items = items.filter(i => i.id !== id); clearFired(id); persist(); render(); },
  };

  updateNotifyBtn();
  render();
  checkReminders();
})();
