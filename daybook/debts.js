/*
  Debts: what you owe (and what friends owe you), ticked off payment by payment.
  Each debt is drawn as a row of boxes, one per instalment, that fill in gold.
  Payments can be recorded in Money; a monthly payment can live in Plan as a bill,
  and ticking that bill counts as a payment here.
*/
(() => {
  'use strict';
  const KEY = 'debts.v1';
  const D = window.Daybook;
  const M = () => D.money;
  const P = () => D.plan;
  const $ = id => document.getElementById(id);
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayStr = () => ymd(new Date());
  const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const round2 = n => Math.round(n * 100) / 100;
  const parseAmount = v => { let s = String(v ?? '').trim().replace(/[^\d.,-]/g, ''); if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,/g, ''); return parseFloat(s); };
  const changed = () => document.dispatchEvent(new CustomEvent('daybook:change', { detail: { source: 'debts' } }));
  const monthLabel = d => d.toLocaleDateString([], { month: 'long', year: 'numeric' });
  const shortDate = s => parseYmd(s).toLocaleDateString([], { day: 'numeric', month: 'short', year: parseYmd(s).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });

  // ---------- state ----------
  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && Array.isArray(s.debts)) return s; } catch { /* ignore */ }
    return null;
  }
  let state = load() || seed();
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage blocked */ } changed(); };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }

  function seed() {
    const t = new Date();
    const monthsAgo = (n, day) => ymd(new Date(t.getFullYear(), t.getMonth() - n, day));
    const pays = (n, amount, day) => Array.from({ length: n }, (_, i) => ({ id: uid(), date: monthsAgo(n - i - 1 + (t.getDate() < day ? 1 : 0), day), amount }));
    return {
      version: 1,
      debts: [
        { id: uid(), example: true, kind: 'owe', name: 'Credit card', who: 'Bank', total: 2000, before: 0, monthly: 150, day: 5, note: '', payments: pays(7, 150, 5), created: monthsAgo(7, 1) },
        { id: uid(), example: true, kind: 'owe', name: 'Laptop instalments', who: 'Store', total: 1200, before: 0, monthly: 100, day: 15, note: '', payments: pays(4, 100, 15), created: monthsAgo(4, 1) },
        { id: uid(), example: true, kind: 'owed', name: 'Concert tickets', who: 'Rui', total: 80, before: 0, monthly: 0, day: 0, note: '', payments: [{ id: uid(), date: monthsAgo(0, 1), amount: 20 }], created: monthsAgo(1, 10) },
      ],
    };
  }

  const fmt = n => (M() ? M().fmt(n) : n.toFixed(2));
  const fmt0 = n => (M() ? M().fmt0(n) : String(Math.round(n)));
  const paidOf = d => round2((d.before || 0) + d.payments.reduce((a, p) => a + p.amount, 0));
  const leftOf = d => Math.max(0, round2(d.total - paidOf(d)));
  const isCleared = d => leftOf(d) <= 0.004;
  const byId = id => state.debts.find(d => d.id === id);

  // average paid per month over the last 3 months (or the planned monthly amount)
  function pacePerMonth(list) {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 91);
    const cs = ymd(cutoff);
    const recent = list.reduce((a, d) => a + d.payments.filter(p => p.date >= cs).reduce((x, p) => x + p.amount, 0), 0) / 3;
    const planned = list.reduce((a, d) => a + (isCleared(d) ? 0 : d.monthly || 0), 0);
    return Math.max(recent, planned);
  }
  function clearDate(left, perMonth) {
    if (left <= 0) return null;
    if (!(perMonth > 0)) return null;
    const months = Math.ceil(left / perMonth);
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + months - 1);
    return d;
  }
  function nextDue(d) {
    if (!d.day) return null;
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const n = new Date(t.getFullYear(), t.getMonth(), Math.min(d.day, 28));
    if (n < t) n.setMonth(n.getMonth() + 1);
    return n;
  }

  // ---------- payments (also used by Plan bills and quick add) ----------
  function pay(debtId, { amount, date, record = true, link = null }) {
    const d = byId(debtId); if (!d) return null;
    if (link && d.payments.some(p => p.link === link)) return null;
    const amt = round2(Math.min(Math.abs(amount), leftOf(d) || Math.abs(amount)));
    if (!(amt > 0)) return null;
    const wasCleared = isCleared(d);
    const p = { id: uid(), date: date || todayStr(), amount: amt };
    if (link) p.link = link;
    if (record && M() && !d.example) {
      if (d.kind === 'owe') {
        M().ensureCategory({ id: 'debt', name: 'Debt payments', kind: 'expense' });
        const key = link || `debt:${d.id}:${p.id}`;
        M().addLinked(key, { date: p.date, desc: `${d.name} payment`, cat: 'debt', amount: amt });
        p.moneyKey = key;
      } else {
        const key = `debt:${d.id}:${p.id}`;
        M().addLinked(key, { date: p.date, desc: `${d.who ? d.who + ' paid back' : 'Paid back'}: ${d.name}`, cat: 'extra', amount: amt });
        p.moneyKey = key;
      }
    }
    d.payments.push(p);
    d.example = false;
    if (!wasCleared && isCleared(d)) {
      d.clearedAt = p.date;
      if (d.planItemId && P()) { P().removeItem(d.planItemId); d.planItemId = null; }
      celebrate(d);
    }
    persist(); render();
    return p.id;
  }
  function unpay(debtId, paymentId) {
    const d = byId(debtId); if (!d) return;
    const p = d.payments.find(x => x.id === paymentId); if (!p) return;
    d.payments = d.payments.filter(x => x.id !== paymentId);
    if (p.moneyKey && M()) M().removeLinked(p.moneyKey);
    if (!isCleared(d)) d.clearedAt = null;
    persist(); render();
  }
  function unpayLinked(link) {
    for (const d of state.debts) {
      const p = d.payments.find(x => x.link === link);
      if (p) { unpay(d.id, p.id); return true; }
    }
    return false;
  }
  function match(text) {
    const t = ' ' + String(text || '').toLowerCase().replace(/\s+/g, ' ') + ' ';
    const active = state.debts.filter(d => !isCleared(d) && !d.example);
    return active.find(d => t.includes(' ' + d.name.toLowerCase() + ' ')) ||
           active.find(d => d.who && d.kind === 'owed' && t.includes(' ' + d.who.toLowerCase() + ' ')) || null;
  }

  // ---------- render ----------
  function ticksHtml(d) {
    const total = d.total;
    const n = Math.max(4, Math.min(48, d.monthly > 0 ? Math.ceil(total / d.monthly) : 10));
    const per = total / n;
    const paid = paidOf(d);
    let html = '';
    for (let i = 0; i < n; i++) {
      const fill = Math.max(0, Math.min(1, (paid - i * per) / per));
      html += `<i class="tick${fill >= 0.999 ? ' on' : fill > 0 ? ' part' : ''}"${fill > 0 && fill < 0.999 ? ` style="--f:${Math.round(fill * 100)}%"` : ''}></i>`;
    }
    return `<div class="ticks" role="img" aria-label="${Math.round((paid / total) * 100)}% paid">${html}</div>`;
  }

  function card(d) {
    const left = leftOf(d), paid = paidOf(d);
    const pct = Math.min(100, Math.round((paid / d.total) * 100));
    const owed = d.kind === 'owed';
    const cleared = isCleared(d);
    const due = nextDue(d);
    const who = [d.who, d.monthly ? `${fmt0(d.monthly)}/month` : '', !cleared && due ? `next ${due.toLocaleDateString([], { day: 'numeric', month: 'short' })}` : ''].filter(Boolean).join(' · ');
    const when = cleared ? `Cleared ${d.clearedAt ? shortDate(d.clearedAt) : ''}` : (() => { const c = clearDate(left, pacePerMonth([d])); return c ? `Clear by ${c.toLocaleDateString([], { month: 'short', year: 'numeric' })}` : 'Add a payment to see your pace'; })();
    const hist = [...d.payments].sort((a, b) => b.date.localeCompare(a.date));
    const recordDefault = !owed;
    return `<article class="debt${cleared ? ' cleared' : ''}${owed ? ' owed' : ''}" data-id="${d.id}">
      <div class="debt-top">
        <div class="debt-id"><div class="debt-name">${esc(d.name)}</div>${who ? `<div class="debt-who">${esc(who)}</div>` : ''}</div>
        ${cleared ? '<span class="stamp">Cleared</span>' : ''}
        <button type="button" class="icon-btn icon-btn-sm debt-edit" aria-label="Edit ${esc(d.name)}">&#8943;</button>
      </div>
      <div class="debt-left"><span class="debt-amt">${esc(fmt(left))}</span><span class="debt-of">${owed ? 'still owed' : 'left'} of ${esc(fmt0(d.total))}</span></div>
      ${ticksHtml(d)}
      <div class="debt-meta"><span>${pct}% ${owed ? 'paid back' : 'paid'}</span><span>${esc(when)}</span></div>
      <div class="debt-actions">
        ${cleared ? '' : `<button type="button" class="btn btn-gold btn-sm debt-pay">${owed ? 'Got paid' : 'Pay'}</button>`}
        ${hist.length ? `<button type="button" class="link-btn debt-hist" aria-expanded="false">History (${hist.length})</button>` : ''}
      </div>
      <form class="pay-form" hidden autocomplete="off">
        <label class="field"><span>Amount</span><input class="pay-amt" type="text" inputmode="decimal" value="${round2(Math.min(d.monthly || left, left))}" /></label>
        <label class="field"><span>Date</span><input class="pay-date" type="date" value="${todayStr()}" /></label>
        <label class="check-field"><input type="checkbox" class="pay-record" ${recordDefault ? 'checked' : ''} /><span>${owed ? 'Count it as income in Money' : 'Record in Money'}</span></label>
        <div class="pay-btns"><button type="button" class="btn btn-ghost btn-sm pay-cancel">Cancel</button><button type="submit" class="btn btn-gold btn-sm">Save</button></div>
      </form>
      <ol class="debt-history" hidden>
        ${hist.map(p => `<li data-pid="${p.id}"><span>${esc(shortDate(p.date))}</span><span class="h-amt">${esc(fmt(p.amount))}</span>${p.link ? '<span class="h-tag">from Plan</span>' : ''}<button type="button" class="row-del" aria-label="Remove this payment">&#215;</button></li>`).join('')}
        ${d.before ? `<li><span>Before tracking</span><span class="h-amt">${esc(fmt(d.before))}</span></li>` : ''}
      </ol>
    </article>`;
  }

  function render() {
    const owe = state.debts.filter(d => d.kind === 'owe');
    const owed = state.debts.filter(d => d.kind === 'owed');
    const activeOwe = owe.filter(d => !isCleared(d)), activeOwed = owed.filter(d => !isCleared(d));
    const cleared = state.debts.filter(isCleared);

    const left = round2(activeOwe.reduce((a, d) => a + leftOf(d), 0));
    const total = round2(owe.reduce((a, d) => a + d.total, 0));
    const paid = round2(owe.reduce((a, d) => a + paidOf(d), 0));
    const pct = total ? Math.min(100, Math.round((paid / total) * 100)) : 0;
    const pace = pacePerMonth(activeOwe);
    const free = clearDate(left, pace);

    const fig = document.querySelector('#view-debts .hero-figure');
    if (left > 0) {
      $('d-hero-amount').textContent = fmt0(left);
      $('d-hero-unit').textContent = 'left to pay';
      const smallest = [...activeOwe].sort((a, b) => leftOf(a) - leftOf(b))[0];
      $('d-hero-line').innerHTML = `You've paid off <strong>${esc(fmt0(paid))}</strong> of <strong>${esc(fmt0(total))}</strong>. ` +
        (activeOwe.length > 1 && smallest ? `Closest to done: <strong>${esc(smallest.name)}</strong>, ${esc(fmt0(leftOf(smallest)))} to go.` : 'Every payment is one more box ticked.');
    } else {
      $('d-hero-amount').textContent = owe.length ? 'Free' : fmt0(0);
      $('d-hero-unit').textContent = owe.length ? 'of every debt you tracked' : 'owed';
      $('d-hero-line').innerHTML = owe.length ? `You cleared <strong>${esc(fmt0(total))}</strong>. Keep it that way.` : 'No debts tracked. Add one with <strong>+ Add debt</strong> and tick it off payment by payment.';
    }
    fig.classList.toggle('free', left <= 0 && owe.length > 0);

    $('d-free-date').textContent = left <= 0 ? (owe.length ? 'Done' : '—') : free ? monthLabel(free) : 'Set a monthly payment';
    $('d-free-pace').textContent = left > 0 && pace > 0 ? `at ${fmt0(pace)}/month` : '';
    $('d-total-paid').textContent = total ? `${fmt0(paid)} of ${fmt0(total)} paid` : 'Nothing tracked yet';
    $('d-total-pct').textContent = total ? `${pct}%` : '';
    $('d-total-bar').setAttribute('aria-valuenow', String(pct));
    requestAnimationFrame(() => { $('d-total-fill').style.width = pct + '%'; });

    const list = (el, arr, emptyMsg) => { $(el).innerHTML = arr.length ? arr.map(card).join('') : `<p class="empty">${emptyMsg}</p>`; };
    list('d-owe-list', activeOwe.sort((a, b) => leftOf(a) - leftOf(b)), owe.length ? 'All paid off. Nicely done.' : 'Nothing here. Tap “+ Add debt” to add a loan, a card or money you owe a friend.');
    $('d-owe-sub').textContent = activeOwe.length ? `${activeOwe.length} active · smallest first` : '';
    $('d-owed-section').hidden = !activeOwed.length;
    list('d-owed-list', activeOwed, '');
    const owedLeft = activeOwed.reduce((a, d) => a + leftOf(d), 0);
    $('d-owed-sub').textContent = activeOwed.length ? `${fmt0(owedLeft)} coming back to you` : '';
    $('d-cleared-section').hidden = !cleared.length;
    list('d-cleared-list', cleared, '');
    $('d-example-banner').hidden = !state.debts.some(d => d.example);
  }

  // ---------- celebration ----------
  function celebrate(d) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span><strong>${esc(d.name)}</strong> is ${d.kind === 'owe' ? 'paid off' : 'paid back'}. One less weight.</span>`;
    $('toasts').appendChild(el);
    setTimeout(() => el.remove(), 6000);
    requestAnimationFrame(() => {
      const c = document.querySelector(`.debt[data-id="${d.id}"]`);
      if (c) { c.classList.add('just-cleared'); setTimeout(() => c.classList.remove('just-cleared'), 1600); }
    });
  }
  function toast(msg, undo) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span>${esc(msg)}</span>`;
    if (undo) {
      const b = document.createElement('button');
      b.className = 'btn btn-gold btn-sm'; b.textContent = 'Undo';
      b.addEventListener('click', () => { undo(); el.remove(); });
      el.appendChild(b);
    }
    $('toasts').appendChild(el);
    setTimeout(() => el.remove(), 6000);
  }

  // ---------- card interactions ----------
  const view = $('view-debts');
  view.addEventListener('click', e => {
    const cardEl = e.target.closest('.debt'); if (!cardEl) return;
    const d = byId(cardEl.dataset.id); if (!d) return;
    if (e.target.closest('.debt-pay')) {
      const f = cardEl.querySelector('.pay-form'); f.hidden = !f.hidden;
      if (!f.hidden) setTimeout(() => f.querySelector('.pay-amt').select(), 20);
    } else if (e.target.closest('.pay-cancel')) {
      cardEl.querySelector('.pay-form').hidden = true;
    } else if (e.target.closest('.debt-hist')) {
      const h = cardEl.querySelector('.debt-history'); h.hidden = !h.hidden;
      e.target.closest('.debt-hist').setAttribute('aria-expanded', String(!h.hidden));
    } else if (e.target.closest('.debt-edit')) {
      openEditor(d.id);
    } else if (e.target.closest('.debt-history .row-del')) {
      const pid = e.target.closest('li').dataset.pid;
      const p = d.payments.find(x => x.id === pid);
      if (p && p.link && P()) { toast('This payment came from a Plan bill. Untick the bill in Plan to remove it.'); return; }
      unpay(d.id, pid);
      const again = document.querySelector(`.debt[data-id="${d.id}"] .debt-history`); if (again) again.hidden = false;
    }
  });
  view.addEventListener('submit', e => {
    const cardEl = e.target.closest('.debt'); if (!cardEl) return;
    e.preventDefault();
    const d = byId(cardEl.dataset.id); if (!d) return;
    const amt = parseAmount(cardEl.querySelector('.pay-amt').value);
    if (!(amt > 0)) { cardEl.querySelector('.pay-amt').focus(); return; }
    const pid = pay(d.id, { amount: amt, date: cardEl.querySelector('.pay-date').value || todayStr(), record: cardEl.querySelector('.pay-record').checked });
    const done = pid && d.payments.find(x => x.id === pid);
    if (done && !isCleared(d)) toast(`${fmt(done.amount)} ticked off ${d.name}. ${fmt0(leftOf(d))} to go.`, () => unpay(d.id, pid));
  });

  // ---------- editor ----------
  let editingId = null;
  const form = $('d-form');
  function syncForm() {
    const owe = $('d-f-kind').value === 'owe';
    $('d-f-who-label').textContent = owe ? 'Lender (optional)' : 'Who owes you';
    const canPlan = owe && parseAmount($('d-f-monthly').value) > 0 && Number($('d-f-day').value) >= 1;
    $('d-f-plan-row').hidden = !canPlan;
  }
  ['d-f-kind', 'd-f-monthly', 'd-f-day'].forEach(id => $(id).addEventListener('input', syncForm));
  function openEditor(id) {
    editingId = id || null;
    const d = id ? byId(id) : null;
    $('d-modal-title').textContent = d ? 'Edit debt' : 'Add a debt';
    $('d-f-name').value = d ? d.name : '';
    $('d-f-kind').value = d ? d.kind : 'owe';
    $('d-f-who').value = d ? d.who || '' : '';
    $('d-f-total').value = d ? d.total : '';
    $('d-f-before').value = d && d.before ? d.before : '';
    $('d-f-monthly').value = d && d.monthly ? d.monthly : '';
    $('d-f-day').value = d && d.day ? d.day : '';
    $('d-f-plan').checked = d ? !!d.planItemId : true;
    $('d-f-note').value = d ? d.note || '' : '';
    $('d-delete').hidden = !d;
    $('d-delete').textContent = 'Delete'; $('d-delete').dataset.confirm = '';
    syncForm();
    $('d-modal').hidden = false;
    setTimeout(() => $('d-f-name').focus(), 30);
  }
  const closeEditor = () => { $('d-modal').hidden = true; editingId = null; };
  $('d-cancel').addEventListener('click', closeEditor);
  $('d-modal').addEventListener('click', e => { if (e.target.id === 'd-modal') closeEditor(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('d-modal').hidden) closeEditor(); });

  function syncPlanBill(d, want) {
    if (!P()) return;
    const ok = want && d.kind === 'owe' && d.monthly > 0 && d.day >= 1 && !isCleared(d);
    if (d.planItemId) { P().removeItem(d.planItemId); d.planItemId = null; }
    if (ok) {
      if (M()) M().ensureCategory({ id: 'debt', name: 'Debt payments', kind: 'expense' });
      d.planItemId = P().addItem({ title: `${d.name} payment`, date: ymd(nextDue(d)), repeat: 'monthly', amount: d.monthly, moneyCat: 'debt', debtId: d.id, remind: 0 });
    }
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    const name = $('d-f-name').value.trim();
    const total = parseAmount($('d-f-total').value);
    if (!name) { $('d-f-name').focus(); return; }
    if (!(total > 0)) { $('d-f-total').focus(); return; }
    const before = parseAmount($('d-f-before').value);
    const monthly = parseAmount($('d-f-monthly').value);
    const day = Math.max(0, Math.min(31, Number($('d-f-day').value) || 0));
    const data = {
      name, kind: $('d-f-kind').value, who: $('d-f-who').value.trim(), total: round2(total),
      before: before > 0 ? round2(before) : 0, monthly: monthly > 0 ? round2(monthly) : 0, day, note: $('d-f-note').value.trim(),
    };
    let d;
    if (editingId) {
      d = byId(editingId);
      const planChanged = d.monthly !== data.monthly || d.day !== data.day || d.name !== data.name || d.kind !== data.kind;
      Object.assign(d, data, { example: false });
      const want = !$('d-f-plan-row').hidden && $('d-f-plan').checked;
      if (planChanged || want !== !!d.planItemId) syncPlanBill(d, want);
      if (!isCleared(d)) d.clearedAt = null; else if (!d.clearedAt) d.clearedAt = todayStr();
    } else {
      d = { id: uid(), ...data, payments: [], created: todayStr() };
      state.debts.push(d);
      if (!$('d-f-plan-row').hidden && $('d-f-plan').checked) syncPlanBill(d, true);
    }
    persist(); closeEditor(); render();
  });
  $('d-delete').addEventListener('click', () => {
    const b = $('d-delete');
    if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Tap again to delete'; setTimeout(() => { b.dataset.confirm = ''; b.textContent = 'Delete'; }, 3000); return; }
    const d = byId(editingId);
    if (d && d.planItemId && P()) P().removeItem(d.planItemId);
    state.debts = state.debts.filter(x => x.id !== editingId);
    persist(); closeEditor(); render();
    toast('Debt deleted. Payments already in Money stay there.');
  });
  $('d-add-btn').addEventListener('click', () => openEditor(null));
  $('d-clear-examples-btn').addEventListener('click', () => { state.debts = state.debts.filter(d => !d.example); persist(); render(); });
  // Money's currency can change; redraw when it does
  document.addEventListener('daybook:change', e => { if (e.detail && e.detail.source === 'money' && !view.hidden) render(); });

  window.Daybook.debts = { pay, unpay, unpayLinked, match, render, left: id => { const d = byId(id); return d ? leftOf(d) : 0; }, name: id => (byId(id) || {}).name };
  render();
})();
