/*
  Quick add: one line in, the right thing out.
    "coffee 3.50"                 -> Money, Eating out, today
    "uber 12 yesterday"           -> Money, Transport, yesterday
    "+300 freelance"              -> Money, income
    "dentist fri 3pm"             -> Plan, event Friday 15:00, reminder
    "call mum tomorrow"           -> Plan, task tomorrow
    "rent 750 every month on the 1st" -> Plan bill (task with amount), monthly
*/
(() => {
  'use strict';
  const D = window.Daybook;
  const $ = id => document.getElementById(id);
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const WEEKDAYS = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3, wednesday: 3,
    thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 };
  const MONTHS = { jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
    jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12 };
  const WD = Object.keys(WEEKDAYS).join('|');
  const MO = Object.keys(MONTHS).join('|');

  const CAT_WORDS = {
    salary: ['salary', 'paycheck', 'payday', 'wage', 'wages', 'ordenado', 'salário'],
    extra: ['refund', 'freelance', 'sold', 'cashback', 'bonus', 'income', 'received', 'got paid', 'paid me', 'tips'],
    subs: ['netflix', 'spotify', 'subscription', 'icloud', 'youtube', 'prime', 'disney', 'hbo', 'chatgpt', 'apple music', 'phone plan', 'phone bill', 'patreon'],
    home: ['rent', 'renda', 'electricity', 'water bill', 'internet', 'wifi', 'edp', 'gas bill', 'insurance', 'bills', 'bill', 'condo', 'mortgage'],
    groceries: ['supermarket', 'groceries', 'grocery', 'market', 'lidl', 'aldi', 'continente', 'pingo doce', 'mercadona', 'auchan', 'bread', 'bakery', 'padaria', 'fruit', 'milk'],
    eating: ['coffee', 'café', 'cafe', 'lunch', 'dinner', 'breakfast', 'brunch', 'restaurant', 'pizza', 'burger', 'sushi', 'takeaway', 'uber eats', 'glovo', 'mcdonalds', "mcdonald's", 'kfc', 'snack', 'croissant', 'tea', 'pastry', 'kebab', 'ramen'],
    transport: ['uber', 'bolt', 'taxi', 'metro', 'bus', 'train', 'fuel', 'petrol', 'gasolina', 'diesel', 'parking', 'toll', 'portagem', 'flight', 'scooter', 'via verde', 'car wash'],
    health: ['gym', 'pharmacy', 'farmácia', 'farmacia', 'doctor', 'dentist', 'physio', 'vitamins', 'protein', 'medicine', 'creatine', 'haircut', 'barber'],
    fun: ['cinema', 'movie', 'movies', 'concert', 'bowling', 'drinks', 'beer', 'beers', 'bar', 'club', 'party', 'game', 'games', 'festival', 'tickets', 'museum', 'padel', 'football'],
    shopping: ['clothes', 'shoes', 'amazon', 'zara', 'trainers', 'sneakers', 'jacket', 'shirt', 't-shirt', 'jeans', 'ikea', 'gift', 'present', 'hoodie', 'headphones'],
  };

  const hasWord = (text, w) => new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'iu').test(text);

  function guessCategory(text) {
    const cats = D.money ? D.money.categories() : [];
    const has = id => cats.some(c => c.id === id);
    const t = String(text || '').toLowerCase();
    // the person's own category names first ("groceries 20", "going out 15")
    const own = cats.filter(c => c.name.length > 2 && hasWord(t, c.name.toLowerCase().replace(/ & .*/, '')));
    if (own.length) return own[0].id;
    for (const [id, words] of Object.entries(CAT_WORDS)) {
      if (has(id) && words.some(w => hasWord(t, w))) return id;
    }
    return 'other';
  }

  // ---------- parsing ----------
  function nextWeekday(from, wd, allowToday) {
    const d = new Date(from); d.setHours(0, 0, 0, 0);
    let diff = (wd - d.getDay() + 7) % 7;
    if (diff === 0 && !allowToday) diff = 7;
    d.setDate(d.getDate() + diff); return d;
  }
  function lastWeekday(from, wd) {
    const d = new Date(from); d.setHours(0, 0, 0, 0);
    const diff = (d.getDay() - wd + 7) % 7;
    d.setDate(d.getDate() - diff); return d;
  }
  const to24 = (h, m, ap) => {
    h = Number(h); m = Number(m || 0);
    if (ap) { ap = ap.toLowerCase(); if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0; }
    if (h > 23 || m > 59) return null;
    return `${pad(h)}:${pad(m)}`;
  };

  function parse(input, now = new Date()) {
    let s = ' ' + String(input || '').replace(/\s+/g, ' ').trim() + ' ';
    if (!s.trim()) return null;
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const cut = re => { const m = s.match(re); if (m) s = s.replace(m[0], ' '); return m; };
    let date = null, time = '', repeat = 'none', when = null, priority = 'normal', m, bareWeekday = null;

    // priority
    if (cut(/\s(!+|urgent|asap|important)(?=\s)/i) || /!\s*$/.test(s)) { priority = 'high'; s = s.replace(/!/g, ' '); }

    // repeat
    if ((m = cut(/\s(every ?day|daily)(?=\s)/i))) repeat = 'daily';
    else if ((m = cut(/\s(every weekday|weekdays|on weekdays)(?=\s)/i))) repeat = 'weekdays';
    else if ((m = cut(new RegExp(`\\severy (${WD})(?=\\s)`, 'i')))) { repeat = 'weekly'; date = nextWeekday(today, WEEKDAYS[m[1].toLowerCase()], true); }
    else if ((m = cut(/\s(every week|weekly)(?=\s)/i))) repeat = 'weekly';
    else if ((m = cut(/\s(?:every month |monthly )?on the (\d{1,2})(?:st|nd|rd|th)?(?=\s)/i)) || (m = cut(/\severy (\d{1,2})(?:st|nd|rd|th)(?=\s)/i))) {
      repeat = /every|monthly/i.test(m[0]) || /\s(every month|monthly)(?=\s)/i.test(s) ? 'monthly' : 'none';
      const day = Number(m[1]);
      if (day >= 1 && day <= 31) {
        const d = new Date(today.getFullYear(), today.getMonth(), day);
        if (d < today) d.setMonth(d.getMonth() + 1);
        date = d;
      }
    }
    if ((m = cut(/\s(every month|monthly)(?=\s)/i))) repeat = 'monthly';

    // time
    if ((m = cut(/\s(?:at )?(\d{1,2})[:h](\d{2}) ?(am|pm)?(?=\s)/i))) time = to24(m[1], m[2], m[3]) || '';
    else if ((m = cut(/\s(?:at )?(\d{1,2})\.(\d{2}) ?(am|pm)(?=\s)/i))) time = to24(m[1], m[2], m[3]) || '';
    else if ((m = cut(/\s(?:at )?(\d{1,2}) ?(am|pm)(?=\s)/i))) time = to24(m[1], 0, m[2]) || '';
    else if ((m = cut(/\sat (\d{1,2})(?=\s)/i))) {
      const h = Number(m[1]);
      const evening = /\b(dinner|drinks|party|night|evening|movie|cinema|concert|bar|date|game|match)\b/i.test(s);
      time = to24(h >= 1 && h <= 7 ? h + 12 : (h >= 8 && h <= 11 && evening ? h + 12 : h), 0) || '';
    }
    else if ((m = cut(/\s(?:at )?(noon|midday)(?=\s)/i))) time = '12:00';
    if ((m = cut(/\s(tonight)(?=\s)/i))) { date = date || today; if (!time) time = '20:00'; }

    // date
    if (!date) {
      if ((m = cut(/\s(today)(?=\s)/i))) date = today;
      else if ((m = cut(/\s(tomorrow|tomorow|tmrw|tmr)(?=\s)/i))) { date = new Date(today); date.setDate(date.getDate() + 1); }
      else if ((m = cut(/\s(yesterday)(?=\s)/i))) { date = new Date(today); date.setDate(date.getDate() - 1); when = 'past'; }
      else if ((m = cut(/\sin (\d{1,2}|a|one|two|three) (day|days|week|weeks)(?=\s)/i))) {
        const n = { a: 1, one: 1, two: 2, three: 3 }[m[1].toLowerCase()] || Number(m[1]);
        date = new Date(today); date.setDate(date.getDate() + n * (/week/i.test(m[2]) ? 7 : 1));
      }
      else if ((m = cut(/\s(next week)(?=\s)/i))) { date = nextWeekday(today, 1, false); }
      else if ((m = cut(new RegExp(`\\s(?:on |next |last )?(${WD})(?=\\s)`, 'i')))) {
        const wd = WEEKDAYS[m[1].toLowerCase()];
        if (/last/i.test(m[0])) { date = lastWeekday(today, wd); when = 'past'; }
        else date = nextWeekday(today, wd, !/next/i.test(m[0]));
        if (!/next|last/i.test(m[0])) bareWeekday = wd;
      }
      else if ((m = s.match(/\s(?:on )?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?(?=\s)/))) {
        let y = m[3] ? Number(m[3]) : today.getFullYear(); if (y < 100) y += 2000;
        const usFirst = /^en-US/i.test(navigator.language || '');
        const a = Number(m[1]), b = Number(m[2]);
        const [mo, d] = usFirst && a <= 12 ? [a, b] : [b, a];
        if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
          s = s.replace(m[0], ' ');
          date = new Date(y, mo - 1, d); if (!m[3] && date < today) date.setFullYear(y + 1);
        }
      }
      else if ((m = cut(new RegExp(`\\s(?:on )?(\\d{1,2})(?:st|nd|rd|th)? (${MO})(?=\\s)`, 'i'))) || (m = cut(new RegExp(`\\s(?:on )?(${MO}) (\\d{1,2})(?:st|nd|rd|th)?(?=\\s)`, 'i')))) {
        const [dd, mm] = /^\d/.test(m[1]) ? [Number(m[1]), MONTHS[m[2].toLowerCase()]] : [Number(m[2]), MONTHS[m[1].toLowerCase()]];
        date = new Date(today.getFullYear(), mm - 1, dd); if (date < today) date.setFullYear(date.getFullYear() + 1);
      }
    }

    // amount: "3.50", "€3,50", "12€", "+300", "15 euros"
    let amount = null, income = false;
    const AMT = /\s(\+|-)? ?(€|\$|£|eur )? ?(\d{1,6}(?:[.,]\d{1,2})?) ?(€|\$|£|eur\b|euros?\b)?(?=\s)/gi;
    for (const c of s.matchAll(AMT)) {
      const marked = c[1] || c[2] || c[4] || /[.,]/.test(c[3]);
      const atEnd = !s.slice(c.index + c[0].length).trim();
      if (marked || atEnd) {
        amount = parseFloat(c[3].replace(',', '.'));
        if (c[1] === '+') income = true;
        s = s.slice(0, c.index) + ' ' + s.slice(c.index + c[0].length);
        break;
      }
    }

    let title = s.replace(/\s(on|at|by|for|in|the|every)(?=\s*$)/gi, ' ').replace(/^\s*(on|at|for)\s/i, ' ').replace(/\s+/g, ' ').trim();
    title = title.replace(/^[-–—:,.]+|[-–—:,.]+$/g, '').trim();
    title = title ? title[0].toUpperCase() + title.slice(1) : '';

    // "lunch 12 fri" means last Friday's lunch, not a future bill
    if (amount && repeat === 'none' && bareWeekday !== null) date = lastWeekday(today, bareWeekday);
    const isFuture = date && date > today;
    const isBill = amount && (repeat !== 'none' || isFuture);

    if (amount && !isBill) {
      const cat = guessCategory(title);
      const cats = D.money ? D.money.categories() : [];
      const catObj = cats.find(c => c.id === cat);
      if (catObj && catObj.kind === 'income') income = true;
      const finalCat = income && (!catObj || catObj.kind !== 'income') ? 'extra' : cat;
      const d = date || today;
      return { kind: 'money', desc: title || (catObj ? catObj.name : 'Spending'), amount, cat: finalCat, income, date: ymd(d) };
    }
    if (!title) return null;
    const d = date || today;
    if (isBill) {
      return { kind: 'plan', bill: true, title, type: 'task', date: ymd(d), time, repeat, priority, amount, moneyCat: guessCategory(title), remind: time ? 60 : 0 };
    }
    return { kind: 'plan', title, type: time ? 'event' : 'task', date: ymd(d), time, repeat, priority, remind: time ? 15 : -1 };
  }

  // ---------- UI ----------
  const fmtDay = ds => {
    const t = ymd(new Date());
    const d = new Date(ds + 'T00:00');
    const tm = new Date(); tm.setDate(tm.getDate() + 1);
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (ds === t) return 'Today';
    if (ds === ymd(tm)) return 'Tomorrow';
    if (ds === ymd(y)) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  };
  const REPEAT = { daily: 'Every day', weekdays: 'Weekdays', weekly: 'Every week', monthly: 'Every month' };
  const catName = id => (D.money.categories().find(c => c.id === id) || { name: 'Other' }).name;

  function describe(r) {
    if (!r) return '';
    const parts = [];
    if (r.kind === 'money') {
      parts.push(`<span class="qp-kind">Money</span>`, `<span class="qp-part">${esc(r.desc)}</span>`,
        `<span class="qp-part">${r.income ? '+' : ''}${esc(D.money.fmt(r.amount))}</span>`, esc(r.income && r.cat === 'extra' ? 'Income' : catName(r.cat)), esc(fmtDay(r.date)));
    } else {
      parts.push(`<span class="qp-kind plan">${r.bill ? 'Plan · bill' : 'Plan'}</span>`, `<span class="qp-part">${esc(r.title)}</span>`);
      if (r.bill) parts.push(`<span class="qp-part">${esc(D.money.fmt(r.amount))}</span>`, esc(catName(r.moneyCat)));
      else parts.push(r.type === 'event' ? 'Event' : 'Task');
      parts.push(esc(fmtDay(r.date) + (r.time ? ', ' + D.plan.fmtTime(r.time) : '')));
      if (r.repeat !== 'none') parts.push(esc(REPEAT[r.repeat]));
      if (r.priority === 'high') parts.push('High priority');
    }
    return parts.join('<span class="qp-sep">·</span>');
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

  const input = $('q-input'), preview = $('q-preview');
  input.addEventListener('input', () => {
    const v = input.value.trim();
    if (!v) { preview.innerHTML = ''; return; }
    const r = parse(v);
    preview.innerHTML = r ? describe(r) + '<span class="qp-sep">·</span><span class="qp-tip">Enter to add</span>' : '<span class="qp-tip">Add a few words, like “gym tomorrow 7am” or “lunch 9.80”.</span>';
  });
  $('q-form').addEventListener('submit', e => {
    e.preventDefault();
    const r = parse(input.value);
    if (!r) { input.focus(); return; }
    if (r.kind === 'money') {
      const id = D.money.addTx({ date: r.date, desc: r.desc, cat: r.cat, amount: r.amount });
      toast(`Added to Money: ${r.desc} · ${r.income ? '+' : ''}${D.money.fmt(r.amount)}`, () => D.money.removeTx(id));
    } else {
      const { kind, bill, ...data } = r;
      const id = D.plan.addItem(data);
      if (data.amount && D.plan.runAutopay) D.plan.runAutopay();
      toast(`Added to Plan: ${r.title} · ${fmtDay(r.date)}${r.time ? ', ' + D.plan.fmtTime(r.time) : ''}`, () => D.plan.removeItem(id));
    }
    input.value = ''; preview.innerHTML = '';
  });
  input.addEventListener('keydown', e => { if (e.key === 'Escape') { input.value = ''; preview.innerHTML = ''; input.blur(); } });

  window.Daybook.quick = { parse, guessCategory };
})();
