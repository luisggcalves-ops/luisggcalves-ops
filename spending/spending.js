/*
  Spending — a money tracker that works like a small spreadsheet.
  Data lives in this browser's localStorage. Excel import/export uses SheetJS,
  loaded from cdnjs only when you press an Excel button.
*/
(() => {
  'use strict';

  const KEY = 'spending.v1';
  const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

  // ---------- helpers ----------
  const $ = id => document.getElementById(id);
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const todayStr = () => ymd(new Date());
  const monthOf = s => s.slice(0, 7);
  const shiftMonth = (m, n) => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
  const daysIn = m => { const [y, mo] = m.split('-').map(Number); return new Date(y, mo, 0).getDate(); };
  const monthName = (m, opts = { month: 'long', year: 'numeric' }) => { const [y, mo] = m.split('-').map(Number); return new Date(y, mo - 1, 1).toLocaleDateString([], opts); };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const round2 = n => Math.round(n * 100) / 100;

  // "12,50" "€ 1.234,50" "1,234.50" "-8" → number (NaN if not a number)
  function parseAmount(v) {
    if (typeof v === 'number') return v;
    let s = String(v ?? '').trim().replace(/[^\d.,\-]/g, '');
    if (!s) return NaN;
    const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');   // 1.234,50
    else s = s.replace(/,/g, '');                                          // 1,234.50
    return parseFloat(s);
  }

  function guessCurrency() {
    const region = (navigator.language || '').split('-')[1] || '';
    const map = { US: 'USD', GB: 'GBP', BR: 'BRL', CH: 'CHF', CA: 'CAD', AU: 'AUD', JP: 'JPY' };
    return map[region.toUpperCase()] || 'EUR';
  }

  // ---------- state ----------
  const DEFAULT_CATS = [
    ['groceries', 'Groceries', 'expense'], ['eating', 'Eating out', 'expense'], ['transport', 'Transport', 'expense'],
    ['home', 'Rent & bills', 'expense'], ['shopping', 'Shopping', 'expense'], ['health', 'Health & gym', 'expense'],
    ['fun', 'Going out', 'expense'], ['subs', 'Subscriptions', 'expense'], ['other', 'Other', 'expense'],
    ['salary', 'Salary', 'income'], ['extra', 'Other income', 'income'],
  ].map(([id, name, kind]) => ({ id, name, kind, budget: 0 }));

  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && Array.isArray(s.tx)) return s; } catch { /* ignore */ }
    return null;
  }
  let state = load() || seed();
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { toast('Could not save. Your browser storage may be full or blocked.'); } };
  persist();

  function seed() {
    const s = {
      version: 1, currency: guessCurrency(),
      goal: { name: 'Trip to Japan', target: 5000, start: 1500, example: true },
      categories: DEFAULT_CATS.map(c => ({ ...c })), exampleBudgets: true, tx: [],
    };
    const budgets = { groceries: 320, eating: 160, transport: 90, shopping: 120, fun: 120, subs: 40 };
    s.categories.forEach(c => { if (budgets[c.id]) c.budget = budgets[c.id]; });
    const cur = monthOf(todayStr()), prev = shiftMonth(cur, -1), today = new Date().getDate();
    const add = (m, day, desc, cat, amount) => s.tx.push({ id: uid(), date: `${m}-${pad(day)}`, desc, cat, amount, example: true });
    [[1, 'Salary', 'salary', 2150], [1, 'Rent', 'home', 750], [2, 'Supermarket', 'groceries', 64.3], [3, 'Metro card', 'transport', 40],
     [5, 'Dinner out', 'eating', 38.5], [7, 'Supermarket', 'groceries', 71.2], [9, 'Gym membership', 'health', 35], [10, 'Music + streaming', 'subs', 21.98],
     [12, 'Concert tickets', 'fun', 55], [14, 'Supermarket', 'groceries', 58.9], [16, 'New trainers', 'shopping', 89.99], [18, 'Lunch with team', 'eating', 22],
     [21, 'Electricity', 'home', 48.6], [23, 'Supermarket', 'groceries', 66.4], [25, 'Fuel', 'transport', 45], [27, 'Birthday dinner', 'eating', 61], [28, 'Freelance job', 'extra', 300]]
      .forEach(r => add(prev, ...r));
    [[1, 'Salary', 'salary', 2150], [1, 'Rent', 'home', 750], [2, 'Supermarket', 'groceries', 58.4], [3, 'Metro card', 'transport', 40],
     [4, 'Coffee beans', 'groceries', 14.5], [6, 'Sushi night', 'eating', 42], [8, 'Supermarket', 'groceries', 67.1], [9, 'Gym membership', 'health', 35],
     [10, 'Music + streaming', 'subs', 21.98], [11, 'Cinema', 'fun', 19], [13, 'Supermarket', 'groceries', 52.75], [15, 'Jacket', 'shopping', 79],
     [17, 'Taxi home', 'transport', 18.4], [19, 'Brunch', 'eating', 27.5], [20, 'Supermarket', 'groceries', 61.3], [22, 'Bowling', 'fun', 24]]
      .filter(r => r[0] <= today).forEach(r => add(cur, ...r));
    return s;
  }

  let view = monthOf(todayStr());
  let sort = { key: 'date', dir: 'desc' };
  let filterCat = '', search = '';

  const catById = id => state.categories.find(c => c.id === id);
  const kindOf = tx => (catById(tx.cat) || { kind: 'expense' }).kind;
  const fmt = (n, opts = {}) => new Intl.NumberFormat(undefined, { style: 'currency', currency: state.currency, ...opts }).format(n);
  const fmt0 = n => fmt(n, { maximumFractionDigits: 0, minimumFractionDigits: 0 });
  const monthTx = m => state.tx.filter(t => monthOf(t.date) === m);

  function totals(list) {
    let spent = 0, income = 0;
    list.forEach(t => { if (kindOf(t) === 'income') income += t.amount; else spent += t.amount; });
    return { spent: round2(spent), income: round2(income) };
  }

  // ---------- hero, goal, tiles ----------
  function renderHero() {
    const { spent, income } = totals(monthTx(view));
    const isCurrent = view === monthOf(todayStr());
    $('month-label').textContent = monthName(view, { month: 'short', year: 'numeric' });
    $('hero-eyebrow').textContent = monthName(view);
    const fig = document.querySelector('.hero-figure');
    let line;
    if (income > 0) {
      const left = round2(income - spent);
      fig.classList.toggle('over', left < 0);
      $('hero-amount').textContent = fmt0(Math.abs(left));
      $('hero-unit').textContent = left < 0 ? 'over' : (isCurrent ? 'left this month' : 'kept');
      const kept = Math.round((left / income) * 100);
      line = left >= 0
        ? `You've kept <strong>${kept}%</strong> of what came in. Spent <strong>${fmt0(spent)}</strong> of <strong>${fmt0(income)}</strong>.`
        : `Spending is <strong>${fmt0(-left)}</strong> above income this month. A few quiet days will turn it around.`;
    } else {
      fig.classList.remove('over');
      $('hero-amount').textContent = fmt0(spent);
      $('hero-unit').textContent = 'spent';
      line = spent ? 'Add your income to see how much you keep.' : 'Nothing here yet. Add your first entry in the sheet below.';
    }
    $('hero-line').innerHTML = line;

    const g = state.goal || {};
    const all = totals(state.tx);
    const saved = Math.max(0, round2((g.start || 0) + all.income - all.spent));
    const pct = g.target > 0 ? Math.min(100, Math.round((saved / g.target) * 100)) : 0;
    $('goal-name').textContent = g.name || 'Set a goal';
    $('goal-saved').textContent = g.target > 0 ? `${fmt0(saved)} of ${fmt0(g.target)}` : 'Choose a target in Settings';
    $('goal-pct').textContent = g.target > 0 ? (pct >= 100 ? 'Reached' : `${pct}%`) : '';
    $('goal-bar').setAttribute('aria-valuenow', String(pct));
    requestAnimationFrame(() => { $('goal-fill').style.width = pct + '%'; });
  }

  function renderTiles() {
    const list = monthTx(view);
    const { spent, income } = totals(list);
    const isCurrent = view === monthOf(todayStr());
    const today = new Date().getDate();
    const dayLimit = isCurrent ? today : daysIn(view);

    // spending vs last month (same days, when looking at the current month)
    const prevList = monthTx(shiftMonth(view, -1)).filter(t => !isCurrent || Number(t.date.slice(8)) <= today);
    const prevSpent = totals(prevList).spent;
    let delta = '', deltaCls = '';
    if (prevSpent > 0) {
      const d = Math.round(((spent - prevSpent) / prevSpent) * 100);
      const prevName = monthName(shiftMonth(view, -1), { month: 'long' });
      delta = d === 0 ? `Same as ${prevName}` : `${Math.abs(d)}% ${d < 0 ? 'less' : 'more'} than ${prevName}${isCurrent ? ' by now' : ''}`;
      deltaCls = d <= 0 ? 'good' : 'bad';
    }

    const budgetTotal = state.categories.filter(c => c.kind === 'expense').reduce((a, c) => a + (c.budget || 0), 0);
    const budgetedSpent = list.filter(t => kindOf(t) === 'expense' && (catById(t.cat)?.budget || 0) > 0).reduce((a, t) => a + t.amount, 0);

    const spendDays = new Set(list.filter(t => kindOf(t) === 'expense').map(t => t.date));
    let noSpend = 0;
    for (let d = 1; d <= dayLimit; d++) if (!spendDays.has(`${view}-${pad(d)}`)) noSpend++;

    const tiles = [
      { label: 'Spent', value: fmt0(spent), delta, cls: deltaCls },
      { label: 'Income', value: fmt0(income), delta: income ? `${list.filter(t => kindOf(t) === 'income').length} payment${list.filter(t => kindOf(t) === 'income').length === 1 ? '' : 's'}` : 'None added yet' },
      budgetTotal > 0
        ? { label: 'Budget left', value: fmt0(Math.max(0, budgetTotal - budgetedSpent)), delta: budgetedSpent > budgetTotal ? `${fmt0(budgetedSpent - budgetTotal)} over budget` : `of ${fmt0(budgetTotal)} planned`, cls: budgetedSpent > budgetTotal ? 'bad' : '' }
        : { label: 'Per day', value: fmt0(dayLimit ? spent / dayLimit : 0), delta: 'average so far' },
      { label: 'No-spend days', value: String(noSpend), delta: noSpend ? `out of ${dayLimit} day${dayLimit === 1 ? '' : 's'}` : 'Try one this week', cls: noSpend ? 'good' : '' },
    ];
    $('tiles').innerHTML = tiles.map(t => `<div class="tile"><div class="tile-label">${esc(t.label)}</div><div class="tile-value">${esc(t.value)}</div><div class="tile-delta ${t.cls || ''}">${esc(t.delta || '')}</div></div>`).join('');
  }

  // ---------- sheet ----------
  function catOptions(selected) {
    const group = (kind, label) => `<optgroup label="${label}">${state.categories.filter(c => c.kind === kind)
      .map(c => `<option value="${esc(c.id)}"${c.id === selected ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>`;
    return group('expense', 'Spending') + group('income', 'Income');
  }

  function visibleRows() {
    const q = search.trim().toLowerCase();
    let rows = monthTx(view).filter(t => (!filterCat || t.cat === filterCat) &&
      (!q || t.desc.toLowerCase().includes(q) || (catById(t.cat)?.name || '').toLowerCase().includes(q)));
    const dir = sort.dir === 'asc' ? 1 : -1;
    const val = t => sort.key === 'cat' ? (catById(t.cat)?.name || '') : sort.key === 'amount' ? (kindOf(t) === 'income' ? t.amount : -t.amount) : t[sort.key];
    rows.sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * dir || a.id.localeCompare(b.id); });
    return rows;
  }

  function renderSheet() {
    document.querySelectorAll('.sort').forEach(b => {
      if (b.dataset.key === sort.key) b.setAttribute('aria-sort', sort.dir === 'asc' ? 'ascending' : 'descending');
      else b.removeAttribute('aria-sort');
    });
    $('cat-filter').innerHTML = `<option value="">All categories</option>` + catOptions(filterCat);
    $('cat-filter').value = filterCat;
    $('e-cat').innerHTML = catOptions($('e-cat').value || 'groceries');

    const rows = visibleRows();
    const body = $('sheet-body');
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="6" class="sheet-empty">${monthTx(view).length ? 'No entries match your search.' : `No entries for ${esc(monthName(view, { month: 'long' }))} yet. Add one above.`}</td></tr>`;
    } else {
      body.innerHTML = rows.map((t, i) => {
        const inc = kindOf(t) === 'income';
        return `<tr data-id="${t.id}">
          <td class="rn">${i + 1}</td>
          <td class="date-td"><input class="cell" type="date" data-f="date" value="${t.date}" aria-label="Date" /></td>
          <td><input class="cell" type="text" data-f="desc" value="${esc(t.desc)}" aria-label="Description" /></td>
          <td class="cat-td"><select class="cell" data-f="cat" aria-label="Category">${catOptions(t.cat)}</select></td>
          <td class="amt-td"><input class="cell amt${inc ? ' income' : ''}" type="text" inputmode="decimal" data-f="amount" value="${esc((inc ? '+' : '') + fmt(t.amount))}" aria-label="Amount" /></td>
          <td><button type="button" class="row-del" aria-label="Delete ${esc(t.desc)}">&#215;</button></td>
        </tr>`;
      }).join('');
    }
    renderFoot(rows);
  }

  function renderFoot(rows = visibleRows()) {
    const { spent, income } = totals(rows);
    $('sheet-foot').innerHTML = `<tr>
      <td class="rn">&#931;</td>
      <td colspan="2">${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}${filterCat || search ? ' shown' : ''}</td>
      <td style="text-align:right">${income ? 'Income<br>Spent' : 'Spent'}</td>
      <td class="sum">${income ? `<span class="sum income">+${esc(fmt(income))}</span><br>` : ''}${esc(fmt(spent))}</td>
      <td></td></tr>`;
  }

  // live edits: update data + summaries without rebuilding rows (keeps focus while tabbing)
  const body = $('sheet-body');
  body.addEventListener('change', e => {
    const el = e.target, tr = el.closest('tr'); if (!tr || !el.dataset.f) return;
    const t = state.tx.find(x => x.id === tr.dataset.id); if (!t) return;
    const f = el.dataset.f;
    if (f === 'amount') {
      const n = parseAmount(el.value);
      if (!isFinite(n) || n === 0) { toast('Enter an amount, like 12.50'); el.value = fmt(t.amount); return; }
      t.amount = round2(Math.abs(n));
    } else if (f === 'desc') {
      t.desc = el.value.trim() || t.desc; el.value = t.desc;
    } else if (f === 'date') {
      if (!el.value) { el.value = t.date; return; }
      t.date = el.value;
    } else if (f === 'cat') {
      t.cat = el.value;
    }
    t.example = false;
    persist();
    const amt = tr.querySelector('[data-f="amount"]');
    const inc = kindOf(t) === 'income';
    amt.classList.toggle('income', inc);
    if (document.activeElement !== amt) amt.value = (inc ? '+' : '') + fmt(t.amount);
    if (f === 'date' && monthOf(t.date) !== view) { renderAll(); toast(`Moved to ${monthName(monthOf(t.date))}`); return; }
    renderSummaries(); renderFoot();
  });
  body.addEventListener('focusin', e => {
    const el = e.target;
    if (el.dataset.f === 'amount') {
      const t = state.tx.find(x => x.id === el.closest('tr').dataset.id);
      if (t) { el.value = String(t.amount); el.select(); }
    }
  });
  body.addEventListener('focusout', e => {
    const el = e.target;
    if (el.dataset.f === 'amount') {
      const t = state.tx.find(x => x.id === el.closest('tr').dataset.id);
      if (t) setTimeout(() => { if (document.activeElement !== el) el.value = (kindOf(t) === 'income' ? '+' : '') + fmt(t.amount); }, 0);
    }
  });
  body.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches('input.cell')) { e.preventDefault(); e.target.blur(); }
  });
  body.addEventListener('click', e => {
    const btn = e.target.closest('.row-del'); if (!btn) return;
    const id = btn.closest('tr').dataset.id;
    const idx = state.tx.findIndex(x => x.id === id); if (idx < 0) return;
    const [removed] = state.tx.splice(idx, 1);
    persist(); renderAll();
    toast(`Deleted “${removed.desc}”`, { label: 'Undo', fn: () => { state.tx.push(removed); persist(); renderAll(); } });
  });

  document.querySelectorAll('.sort').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.key;
    sort = sort.key === k ? { key: k, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: k === 'date' || k === 'amount' ? 'desc' : 'asc' };
    renderSheet();
  }));
  $('search').addEventListener('input', e => { search = e.target.value; renderSheet(); });
  $('cat-filter').addEventListener('change', e => { filterCat = e.target.value; renderSheet(); });

  // entry row
  function defaultEntryDate() {
    const t = todayStr();
    return monthOf(t) === view ? t : `${view}-01`;
  }
  $('entry-form').addEventListener('submit', e => {
    e.preventDefault();
    const amount = parseAmount($('e-amount').value);
    const desc = $('e-desc').value.trim();
    if (!desc) { $('e-desc').focus(); return; }
    if (!isFinite(amount) || amount === 0) { toast('Enter an amount, like 12.50'); $('e-amount').focus(); return; }
    const tx = { id: uid(), date: $('e-date').value || defaultEntryDate(), desc, cat: $('e-cat').value, amount: round2(Math.abs(amount)) };
    state.tx.push(tx); persist();
    if (monthOf(tx.date) !== view) view = monthOf(tx.date);
    $('e-desc').value = ''; $('e-amount').value = '';
    renderAll();
    $('e-desc').focus();
  });

  // ---------- categories breakdown ----------
  function renderCats() {
    const list = monthTx(view).filter(t => kindOf(t) === 'expense');
    const by = {};
    list.forEach(t => { by[t.cat] = (by[t.cat] || 0) + t.amount; });
    const cats = state.categories.filter(c => c.kind === 'expense' && (by[c.id] || c.budget > 0))
      .map(c => ({ ...c, spent: round2(by[c.id] || 0) }))
      .sort((a, b) => b.spent - a.spent);
    const maxSpent = Math.max(1, ...cats.map(c => c.spent));
    const budgeted = cats.filter(c => c.budget > 0).length;
    $('cat-sub').textContent = budgeted ? `${budgeted} with a budget` : 'Set budgets in Settings';
    if (!cats.length) { $('cat-list').innerHTML = '<p class="empty">Spending by category will show here.</p>'; return; }
    $('cat-list').innerHTML = cats.map(c => {
      let width, note, over = false;
      if (c.budget > 0) {
        width = Math.min(1, c.spent / c.budget);
        over = c.spent > c.budget;
        const leftAmt = round2(c.budget - c.spent);
        note = over ? `▲ ${fmt0(-leftAmt)} over a ${fmt0(c.budget)} budget` : `${fmt0(leftAmt)} left of ${fmt0(c.budget)}`;
      } else {
        width = c.spent / maxSpent;
        note = 'No budget';
      }
      return `<div class="cat-row">
        <span class="cat-name">${esc(c.name)}</span><span class="cat-amt">${esc(fmt(c.spent))}</span>
        <div class="meter${over ? ' over' : ''}"><div class="meter-fill" style="width:${(width * 100).toFixed(1)}%"></div></div>
        <span class="cat-note${over ? ' over' : ''}">${esc(note)}</span>
      </div>`;
    }).join('');
  }

  // ---------- daily chart ----------
  function niceMax(v) {
    if (v <= 0) return 10;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }
  const compact = n => n >= 1000 ? (n / 1000).toFixed(n % 1000 ? 1 : 0).replace(/\.0$/, '') + 'K' : String(Math.round(n));

  function renderDaily() {
    const box = $('daily-chart');
    const tip = $('daily-tip');
    box.querySelector('svg')?.remove();
    const days = daysIn(view);
    const isCurrent = view === monthOf(todayStr());
    const today = new Date().getDate();
    const sums = Array(days).fill(0), counts = Array(days).fill(0);
    monthTx(view).forEach(t => { if (kindOf(t) === 'expense') { const d = Number(t.date.slice(8)) - 1; sums[d] += t.amount; counts[d]++; } });
    // rent-sized days flatten everything else; scale to the 2nd-largest day ×1.6 if one day dominates
    const sorted = [...sums].sort((a, b) => b - a);
    const capped = sorted[0] > sorted[1] * 3 && sorted[1] > 0;
    const top = capped ? sorted[1] * 1.6 : sorted[0];
    const max = niceMax(top);
    const W = Math.max(260, box.clientWidth), H = 190;
    const m = { t: 18, r: 4, b: 20, l: 34 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const band = pw / days, bw = Math.max(2, Math.min(24, band - 2));
    const y = v => m.t + ph - (Math.min(v, max) / max) * ph;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Spending per day in ${esc(monthName(view))}">`;
    [0, 0.5, 1].forEach(f => {
      const v = max * f, yy = y(v);
      s += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${yy}" y2="${yy}" />`;
      s += `<text class="axis-label" x="${m.l - 6}" y="${yy + 3}" text-anchor="end">${compact(v)}</text>`;
    });
    const peak = sums.indexOf(sorted[0]);
    sums.forEach((v, i) => {
      const x = m.l + i * band + (band - bw) / 2;
      const future = isCurrent && i + 1 > today;
      const h = v > 0 ? Math.max(2, m.t + ph - y(v)) : 0;
      const r = Math.min(4, bw / 2, h);
      const x0 = x, x1 = x + bw, yb = m.t + ph, yt = yb - h;
      s += `<rect class="hit" data-i="${i}" x="${m.l + i * band}" y="${m.t}" width="${band}" height="${ph}" />`;
      if (h > 0) s += `<path class="bar" d="M${x0},${yb} V${yt + r} Q${x0},${yt} ${x0 + r},${yt} H${x1 - r} Q${x1},${yt} ${x1},${yt + r} V${yb} Z" />`;
      else s += `<rect class="bar${future ? ' future' : ''}" x="${x0}" y="${yb - 1}" width="${bw}" height="1" opacity="${future ? 1 : 0.4}" />`;
      if (i === peak && v > 0) {
        const label = esc(fmt0(v)) + (capped ? ' ↑' : '');
        const nearLeft = x < m.l + 40, nearRight = x > W - 60;
        const lx = nearLeft ? x : nearRight ? x + bw : x + bw / 2;
        const anchor = nearLeft ? 'start' : nearRight ? 'end' : 'middle';
        const ly = Math.max(10, yt - 6);
        s += `<text class="cap-label" x="${nearLeft ? x + bw + 4 : lx}" y="${nearLeft ? ly + 10 : ly}" text-anchor="${anchor}">${label}</text>`;
      }
      if ([0, 7, 14, 21, 28].includes(i)) s += `<text class="axis-label" x="${m.l + i * band + band / 2}" y="${H - 4}" text-anchor="middle">${i + 1}</text>`;
    });
    s += '</svg>';
    box.insertAdjacentHTML('afterbegin', s);
    const total = sums.reduce((a, b) => a + b, 0);
    const counted = isCurrent ? today : days;
    $('daily-sub').textContent = `avg ${fmt0(total / Math.max(1, counted))} a day`;

    box.querySelectorAll('.hit').forEach(h => {
      const i = Number(h.dataset.i);
      const show = () => {
        const d = new Date(Number(view.slice(0, 4)), Number(view.slice(5)) - 1, i + 1);
        tip.innerHTML = `<span>${esc(d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }))}</span><br><b>${esc(fmt(sums[i]))}</b> <span>· ${counts[i]} entr${counts[i] === 1 ? 'y' : 'ies'}</span>`;
        const bx = box.getBoundingClientRect(), hb = h.getBoundingClientRect();
        let left = hb.left - bx.left + hb.width / 2;
        left = Math.max(70, Math.min(bx.width - 70, left));
        tip.style.left = left + 'px';
        tip.style.top = Math.max(40, y(sums[i]) - 8) + 'px';
        tip.hidden = false;
      };
      h.addEventListener('mouseenter', show);
      h.addEventListener('click', show);
      h.addEventListener('mouseleave', () => { tip.hidden = true; });
    });
  }
  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(renderDaily, 120); });

  // ---------- render ----------
  function renderSummaries() {
    renderHero(); renderTiles(); renderCats(); renderDaily();
    $('example-banner').hidden = !state.tx.some(t => t.example);
  }
  function renderAll() {
    renderSummaries(); renderSheet();
    if (!$('e-date').value || monthOf($('e-date').value) !== view) $('e-date').value = defaultEntryDate();
  }

  $('prev-month').addEventListener('click', () => { view = shiftMonth(view, -1); renderAll(); });
  $('next-month').addEventListener('click', () => { view = shiftMonth(view, 1); renderAll(); });
  $('clear-examples-btn').addEventListener('click', () => {
    state.tx = state.tx.filter(t => !t.example);
    if (state.goal?.example) state.goal = { name: '', target: 0, start: 0 };
    if (state.exampleBudgets) { state.categories.forEach(c => { c.budget = 0; }); state.exampleBudgets = false; }
    persist(); renderAll();
    toast('Examples cleared. Set your goal and budgets in Settings.');
  });

  // ---------- toasts ----------
  function toast(msg, action) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span>${esc(msg)}</span>`;
    if (action) {
      const b = document.createElement('button');
      b.className = 'btn btn-gold btn-sm'; b.textContent = action.label;
      b.addEventListener('click', () => { action.fn(); el.remove(); });
      el.appendChild(b);
    }
    $('toasts').appendChild(el);
    setTimeout(() => el.remove(), action ? 7000 : 4000);
  }

  // ---------- settings ----------
  function openSettings() {
    const g = state.goal || {};
    $('s-goal-name').value = g.name || '';
    $('s-goal-target').value = g.target || '';
    $('s-goal-start').value = g.start || '';
    $('s-currency').value = state.currency;
    renderCatEdit();
    $('settings').hidden = false;
  }
  function closeSettings() { $('settings').hidden = true; renderAll(); }

  function renderCatEdit() {
    $('cat-edit').innerHTML = state.categories.map(c => `
      <div class="cat-edit-row" data-id="${esc(c.id)}">
        <input type="text" data-f="name" value="${esc(c.name)}" aria-label="Category name" />
        <select data-f="kind" aria-label="Type"><option value="expense"${c.kind === 'expense' ? ' selected' : ''}>Spending</option><option value="income"${c.kind === 'income' ? ' selected' : ''}>Income</option></select>
        <input type="text" inputmode="decimal" class="budget" data-f="budget" value="${c.budget ? c.budget : ''}" placeholder="${c.kind === 'income' ? '—' : 'No budget'}" aria-label="Monthly budget" ${c.kind === 'income' ? 'disabled' : ''} />
        ${['other', 'extra'].includes(c.id) ? '<span></span>' : `<button type="button" class="row-del" aria-label="Delete ${esc(c.name)}">&#215;</button>`}
      </div>`).join('');
  }

  $('cat-edit').addEventListener('change', e => {
    const row = e.target.closest('.cat-edit-row'); const c = catById(row.dataset.id); if (!c) return;
    const f = e.target.dataset.f;
    if (f === 'name') c.name = e.target.value.trim() || c.name;
    if (f === 'kind') { c.kind = e.target.value; if (c.kind === 'income') c.budget = 0; renderCatEdit(); }
    if (f === 'budget') { const n = parseAmount(e.target.value); c.budget = isFinite(n) && n > 0 ? round2(n) : 0; state.exampleBudgets = false; }
    persist();
  });
  $('cat-edit').addEventListener('click', e => {
    const btn = e.target.closest('.row-del'); if (!btn) return;
    const row = btn.closest('.cat-edit-row'); const c = catById(row.dataset.id); if (!c) return;
    if (btn.dataset.confirm !== '1') { btn.dataset.confirm = '1'; btn.textContent = '?'; btn.title = 'Tap again to delete'; setTimeout(() => { btn.dataset.confirm = ''; btn.innerHTML = '&#215;'; }, 3000); return; }
    const fallback = c.kind === 'income' ? 'extra' : 'other';
    const moved = state.tx.filter(t => t.cat === c.id).length;
    state.tx.forEach(t => { if (t.cat === c.id) t.cat = fallback; });
    state.categories = state.categories.filter(x => x.id !== c.id);
    if (filterCat === c.id) filterCat = '';
    persist(); renderCatEdit();
    toast(moved ? `Deleted ${c.name}. ${moved} entr${moved === 1 ? 'y moved' : 'ies moved'} to ${catById(fallback).name}.` : `Deleted ${c.name}.`);
  });
  $('new-cat-form').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('nc-name').value.trim(); if (!name) return;
    const kind = $('nc-kind').value;
    const n = parseAmount($('nc-budget').value);
    state.categories.push({ id: uid(), name, kind, budget: kind === 'expense' && isFinite(n) && n > 0 ? round2(n) : 0 });
    $('nc-name').value = ''; $('nc-budget').value = '';
    persist(); renderCatEdit();
  });
  ['s-goal-name', 's-goal-target', 's-goal-start'].forEach(id => $(id).addEventListener('change', () => {
    const t = parseAmount($('s-goal-target').value), st = parseAmount($('s-goal-start').value);
    state.goal = { name: $('s-goal-name').value.trim(), target: isFinite(t) && t > 0 ? round2(t) : 0, start: isFinite(st) && st > 0 ? round2(st) : 0 };
    persist();
  }));
  $('s-currency').addEventListener('change', e => { state.currency = e.target.value; persist(); });
  $('settings-btn').addEventListener('click', openSettings);
  $('goal-edit').addEventListener('click', () => { openSettings(); setTimeout(() => $('s-goal-name').focus(), 30); });
  $('settings-close').addEventListener('click', closeSettings);
  $('settings').addEventListener('click', e => { if (e.target.id === 'settings') closeSettings(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('settings').hidden) closeSettings(); });

  // ---------- files ----------
  function download(name, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }

  let xlsxPromise = null;
  function loadXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    xlsxPromise = xlsxPromise || new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = XLSX_URL; s.onload = () => res(window.XLSX);
      s.onerror = () => { xlsxPromise = null; rej(new Error('load')); };
      document.head.appendChild(s);
    });
    return xlsxPromise;
  }

  async function exportExcel() {
    if (!state.tx.length) { toast('Nothing to export yet.'); return; }
    let XLSX;
    try { XLSX = await loadXlsx(); } catch { toast('Could not load the Excel tool. Check your connection and try again.'); return; }
    const rows = [...state.tx].sort((a, b) => a.date.localeCompare(b.date));
    const cur = state.currency;
    const moneyFmt = { EUR: '#,##0.00 "€"', USD: '"$"#,##0.00', GBP: '"£"#,##0.00', BRL: '"R$" #,##0.00', JPY: '"¥"#,##0' }[cur] || `#,##0.00 "${cur}"`;

    // Sheet 1: every entry
    const txAoa = [['Date', 'Description', 'Category', 'Type', 'Amount', 'Month']];
    rows.forEach(t => txAoa.push([parseYmd(t.date), t.desc, catById(t.cat)?.name || 'Other', kindOf(t) === 'income' ? 'Income' : 'Spending', t.amount, monthOf(t.date)]));
    const ws1 = XLSX.utils.aoa_to_sheet(txAoa, { cellDates: true });
    for (let r = 2; r <= rows.length + 1; r++) {
      if (ws1['A' + r]) ws1['A' + r].z = 'yyyy-mm-dd';
      if (ws1['E' + r]) ws1['E' + r].z = moneyFmt;
    }
    ws1['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 18 }, { wch: 10 }, { wch: 13 }, { wch: 9 }];
    ws1['!autofilter'] = { ref: `A1:F${rows.length + 1}` };

    // Sheet 2: month summary with live formulas
    const months = [...new Set(rows.map(t => monthOf(t.date)))].sort();
    const ws2 = XLSX.utils.aoa_to_sheet([['Month', 'Income', 'Spent', 'Kept', 'Kept %']]);
    months.forEach((m, i) => {
      const r = i + 2, tt = totals(monthTx(m));
      XLSX.utils.sheet_add_aoa(ws2, [[m]], { origin: `A${r}` });
      ws2['B' + r] = { t: 'n', v: tt.income, f: `SUMIFS(Entries!E:E,Entries!F:F,A${r},Entries!D:D,"Income")`, z: moneyFmt };
      ws2['C' + r] = { t: 'n', v: tt.spent, f: `SUMIFS(Entries!E:E,Entries!F:F,A${r},Entries!D:D,"Spending")`, z: moneyFmt };
      ws2['D' + r] = { t: 'n', v: round2(tt.income - tt.spent), f: `B${r}-C${r}`, z: moneyFmt };
      ws2['E' + r] = { t: 'n', v: tt.income ? (tt.income - tt.spent) / tt.income : 0, f: `IF(B${r}=0,0,D${r}/B${r})`, z: '0%' };
    });
    const tr = months.length + 2, all = totals(state.tx);
    XLSX.utils.sheet_add_aoa(ws2, [['Total']], { origin: `A${tr}` });
    ws2['B' + tr] = { t: 'n', v: all.income, f: `SUM(B2:B${tr - 1})`, z: moneyFmt };
    ws2['C' + tr] = { t: 'n', v: all.spent, f: `SUM(C2:C${tr - 1})`, z: moneyFmt };
    ws2['D' + tr] = { t: 'n', v: round2(all.income - all.spent), f: `B${tr}-C${tr}`, z: moneyFmt };
    ws2['E' + tr] = { t: 'n', v: all.income ? (all.income - all.spent) / all.income : 0, f: `IF(B${tr}=0,0,D${tr}/B${tr})`, z: '0%' };
    ws2['!ref'] = `A1:E${tr}`;
    ws2['!cols'] = [{ wch: 10 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 8 }];

    // Sheet 3: category × month, with budgets
    const expCats = state.categories.filter(c => c.kind === 'expense');
    const ws3 = XLSX.utils.aoa_to_sheet([['Category', 'Budget / month', ...months]]);
    expCats.forEach((c, i) => {
      const r = i + 2;
      XLSX.utils.sheet_add_aoa(ws3, [[c.name]], { origin: `A${r}` });
      ws3['B' + r] = { t: 'n', v: c.budget || 0, z: moneyFmt };
      months.forEach((m, j) => {
        const col = XLSX.utils.encode_col(j + 2);
        const v = round2(monthTx(m).filter(t => t.cat === c.id).reduce((a, t) => a + t.amount, 0));
        ws3[col + r] = { t: 'n', v, f: `SUMIFS(Entries!E:E,Entries!C:C,$A${r},Entries!F:F,${col}$1)`, z: moneyFmt };
      });
    });
    ws3['!ref'] = `A1:${XLSX.utils.encode_col(months.length + 1)}${expCats.length + 1}`;
    ws3['!cols'] = [{ wch: 18 }, { wch: 14 }, ...months.map(() => ({ wch: 12 }))];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, 'Entries');
    XLSX.utils.book_append_sheet(wb, ws2, 'Months');
    XLSX.utils.book_append_sheet(wb, ws3, 'Categories');
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    download(`spending-${todayStr()}.xlsx`, new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    toast('Excel file downloaded');
  }
  $('excel-btn').addEventListener('click', exportExcel);
  $('excel-btn-2').addEventListener('click', exportExcel);

  // Import any sheet with Date / Description / Category / Amount-like columns
  function toYmd(v) {
    if (v instanceof Date && !isNaN(v)) return ymd(v);
    if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 86400000)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
    const s = String(v ?? '').trim();
    let m;
    if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
    if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/))) {
      let a = Number(m[1]), b = Number(m[2]), y = Number(m[3]); if (y < 100) y += 2000;
      const usFirst = /^en-US/i.test(navigator.language) && a <= 12;
      const [mo, d] = usFirst || b > 12 ? [a, b] : [b, a];
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${y}-${pad(mo)}-${pad(d)}`;
    }
    return null;
  }

  async function importSheet(file) {
    let XLSX;
    try { XLSX = await loadXlsx(); } catch { toast('Could not load the Excel tool. Check your connection and try again.'); return; }
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
      const name = wb.SheetNames.find(n => /entr|trans|spend|gasto|despesa/i.test(n)) || wb.SheetNames[0];
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' });
      const find = (row, re) => row.findIndex(c => re.test(String(c)));
      let h = -1, col = {};
      for (let i = 0; i < Math.min(15, aoa.length); i++) {
        const row = aoa[i];
        const c = {
          date: find(row, /^(date|data|fecha|day|dia)/i),
          desc: find(row, /desc|item|name|nome|note|memo|detail|payee|merchant|what/i),
          cat: find(row, /categ/i),
          amount: find(row, /amount|valor|value|price|pre[çc]o|cost|custo|total|spent|montante|quantia/i),
          type: find(row, /^(type|tipo|kind)$/i),
        };
        if (c.date >= 0 && c.amount >= 0) { h = i; col = c; break; }
      }
      if (h < 0) { toast('Could not find Date and Amount columns in that sheet.'); return; }
      let added = 0, skipped = 0, newCats = 0;
      const seen = new Set(state.tx.map(t => `${t.date}|${t.desc}|${t.amount}|${t.cat}`));
      for (const row of aoa.slice(h + 1)) {
        const date = toYmd(row[col.date]);
        const raw = parseAmount(row[col.amount]);
        if (!date || !isFinite(raw) || raw === 0) { if (row.some(c => c !== '')) skipped++; continue; }
        const typeTxt = col.type >= 0 ? String(row[col.type]) : '';
        const catName = col.cat >= 0 ? String(row[col.cat]).trim() : '';
        let cat = catName ? state.categories.find(c => c.name.toLowerCase() === catName.toLowerCase()) : null;
        const isIncome = /income|receita|entrada|ingreso|credit/i.test(typeTxt) || cat?.kind === 'income';
        if (!cat && catName) { cat = { id: uid(), name: catName, kind: isIncome ? 'income' : 'expense', budget: 0 }; state.categories.push(cat); newCats++; }
        if (!cat) cat = catById(isIncome ? 'extra' : 'other');
        const desc = col.desc >= 0 && String(row[col.desc]).trim() ? String(row[col.desc]).trim() : (catName || 'Imported');
        const amount = round2(Math.abs(raw));
        const k = `${date}|${desc}|${amount}|${cat.id}`;
        if (seen.has(k)) { skipped++; continue; }
        seen.add(k);
        state.tx.push({ id: uid(), date, desc, cat: cat.id, amount });
        added++;
      }
      persist(); renderAll();
      toast(`Imported ${added} entr${added === 1 ? 'y' : 'ies'}${newCats ? `, ${newCats} new categor${newCats === 1 ? 'y' : 'ies'}` : ''}${skipped ? `. Skipped ${skipped} (blank or already here).` : ''}`);
    } catch {
      toast('That file could not be read. Try an .xlsx or .csv file.');
    }
  }
  $('import-btn').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) importSheet(f); });

  $('backup-btn').addEventListener('click', () => {
    download(`spending-backup-${todayStr()}.json`, new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
  });
  $('restore-btn').addEventListener('click', () => $('restore-file').click());
  $('restore-file').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const s = JSON.parse(await f.text());
      if (!s || !Array.isArray(s.tx) || !Array.isArray(s.categories)) throw new Error('bad');
      state = { version: 1, currency: s.currency || state.currency, goal: s.goal || state.goal, categories: s.categories, tx: s.tx.filter(t => t && t.id && t.date && isFinite(t.amount)) };
      persist(); renderAll();
      toast(`Restored ${state.tx.length} entries`);
    } catch { toast('Choose a backup file downloaded from this page (.json).'); }
  });

  // ---------- go ----------
  $('e-date').value = defaultEntryDate();
  renderAll();
})();
