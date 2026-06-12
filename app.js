// ── Storage ──────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'liftlog_entries';

function loadEntries() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function saveEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

// entry shape: { id, date, exercise, sets:[{reps,weight,unit}], notes }

// ── Helpers ──────────────────────────────────────────────────────────────────
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

function fmtDate(iso) {
  const [y, m, d] = iso.split('-');
  return new Date(+y, +m - 1, +d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function maxWeight(sets) { return Math.max(...sets.map(s => +s.weight || 0)); }
function totalVolume(sets) { return sets.reduce((a, s) => a + (+s.reps||0) * (+s.weight||0), 0); }
function maxReps(sets) { return Math.max(...sets.map(s => +s.reps || 0)); }

function allExercises(entries) {
  return [...new Set(entries.map(e => e.exercise))].sort((a, b) => a.localeCompare(b));
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// ── Confirm Modal ─────────────────────────────────────────────────────────────
function confirm(title, body) {
  return new Promise(resolve => {
    const overlay = document.getElementById('modal-overlay');
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').textContent = body;
    overlay.style.display = 'flex';
    const cleanup = (val) => { overlay.style.display = 'none'; resolve(val); };
    document.getElementById('modal-confirm').onclick = () => cleanup(true);
    document.getElementById('modal-cancel').onclick  = () => cleanup(false);
    overlay.onclick = e => { if (e.target === overlay) cleanup(false); };
  });
}

// ── Nav ───────────────────────────────────────────────────────────────────────
function showSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.section === name));
  document.getElementById(`${name}-section`).classList.add('active');
  if (name === 'history')  renderHistory();
  if (name === 'progress') renderProgressSection();
  if (name === 'stats')    renderStats();
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => showSection(btn.dataset.section));
});

// ── Log Form ──────────────────────────────────────────────────────────────────
const COMMON_EXERCISES = [
  'Back Squat','Bench Press','Deadlift','Overhead Press','Romanian Deadlift',
  'Pull-Up','Barbell Row','Incline Bench Press','Front Squat','Hip Thrust',
  'Dumbbell Curl','Tricep Dip','Lat Pulldown','Cable Row','Face Pull',
  'Leg Press','Leg Curl','Leg Extension','Calf Raise','Chest Fly',
  'Arnold Press','Lateral Raise','Rear Delt Fly','Shrug','Good Morning',
  'Power Clean','Snatch','Push Press','Sumo Deadlift','Bulgarian Split Squat',
];

let setCount = 0;

function addSetRow(defaultReps = '', defaultWeight = '', defaultUnit = 'kg') {
  setCount++;
  const list = document.getElementById('sets-list');
  const row = document.createElement('div');
  row.className = 'set-row';
  row.dataset.setId = setCount;
  row.innerHTML = `
    <span class="set-num">${list.children.length + 1}</span>
    <div class="set-field">
      <span class="set-label">Reps</span>
      <input type="number" min="1" step="1" placeholder="0" value="${defaultReps}" class="set-reps" />
    </div>
    <div class="set-field">
      <span class="set-label">Weight</span>
      <input type="number" min="0" step="0.5" placeholder="0" value="${defaultWeight}" class="set-weight" />
    </div>
    <div class="set-field">
      <span class="set-label">Unit</span>
      <select class="set-unit">
        <option value="kg" ${defaultUnit==='kg'?'selected':''}>kg</option>
        <option value="lb" ${defaultUnit==='lb'?'selected':''}>lb</option>
        <option value="bw" ${defaultUnit==='bw'?'selected':''}>BW</option>
      </select>
    </div>
    <button type="button" class="remove-set-btn" title="Remove set">×</button>
  `;
  row.querySelector('.remove-set-btn').addEventListener('click', () => {
    row.remove();
    renumberSets();
  });
  list.appendChild(row);
}

function renumberSets() {
  document.querySelectorAll('#sets-list .set-num').forEach((el, i) => { el.textContent = i + 1; });
}

function readSets() {
  return [...document.querySelectorAll('#sets-list .set-row')].map(row => ({
    reps:   row.querySelector('.set-reps').value,
    weight: row.querySelector('.set-weight').value,
    unit:   row.querySelector('.set-unit').value,
  })).filter(s => s.reps || s.weight);
}

document.getElementById('add-set-btn').addEventListener('click', () => {
  const rows = document.querySelectorAll('#sets-list .set-row');
  if (rows.length > 0) {
    const last = rows[rows.length - 1];
    addSetRow(last.querySelector('.set-reps').value, last.querySelector('.set-weight').value, last.querySelector('.set-unit').value);
  } else {
    addSetRow();
  }
});

document.getElementById('clear-form-btn').addEventListener('click', resetForm);

function resetForm() {
  document.getElementById('log-form').reset();
  document.getElementById('date-input').value = todayISO();
  document.getElementById('sets-list').innerHTML = '';
  setCount = 0;
  addSetRow();
}

// Autocomplete
const exerciseInput = document.getElementById('exercise-input');
const acList = document.getElementById('autocomplete-list');
let acHighlight = -1;

exerciseInput.addEventListener('input', () => {
  const q = exerciseInput.value.trim().toLowerCase();
  acHighlight = -1;
  if (!q) { acList.style.display = 'none'; return; }
  const entries = loadEntries();
  const used = allExercises(entries);
  const all = [...new Set([...used, ...COMMON_EXERCISES])].sort();
  const matches = all.filter(e => e.toLowerCase().includes(q));
  if (!matches.length) { acList.style.display = 'none'; return; }
  acList.innerHTML = matches.slice(0, 8).map(m =>
    `<div class="autocomplete-item">${m}</div>`
  ).join('');
  acList.style.display = 'block';
  acList.querySelectorAll('.autocomplete-item').forEach(item => {
    item.addEventListener('mousedown', e => {
      e.preventDefault();
      exerciseInput.value = item.textContent;
      acList.style.display = 'none';
    });
  });
});

exerciseInput.addEventListener('keydown', e => {
  const items = [...acList.querySelectorAll('.autocomplete-item')];
  if (!items.length) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); acHighlight = Math.min(acHighlight+1, items.length-1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); acHighlight = Math.max(acHighlight-1, -1); }
  else if (e.key === 'Enter' && acHighlight >= 0) { e.preventDefault(); exerciseInput.value = items[acHighlight].textContent; acList.style.display = 'none'; return; }
  else if (e.key === 'Escape') { acList.style.display = 'none'; return; }
  items.forEach((it, i) => it.classList.toggle('highlighted', i === acHighlight));
});

document.addEventListener('click', e => {
  if (!e.target.closest('.autocomplete-wrapper')) acList.style.display = 'none';
});

// Submit
document.getElementById('log-form').addEventListener('submit', e => {
  e.preventDefault();
  const exercise = exerciseInput.value.trim();
  const date = document.getElementById('date-input').value;
  const notes = document.getElementById('notes-input').value.trim();
  const sets = readSets();
  if (!exercise) { toast('Enter an exercise name.', 'error'); return; }
  if (!date) { toast('Pick a date.', 'error'); return; }
  if (!sets.length) { toast('Add at least one set.', 'error'); return; }
  const entry = { id: genId(), date, exercise, sets, notes };
  const entries = loadEntries();
  entries.push(entry);
  saveEntries(entries);
  toast(`${exercise} saved!`, 'success');
  resetForm();
});

// ── History ───────────────────────────────────────────────────────────────────
function renderHistory() {
  const entries = loadEntries();
  const search = document.getElementById('history-search').value.trim().toLowerCase();
  const from   = document.getElementById('history-date-from').value;
  const to     = document.getElementById('history-date-to').value;

  let filtered = entries.filter(e => {
    if (search && !e.exercise.toLowerCase().includes(search)) return false;
    if (from && e.date < from) return false;
    if (to   && e.date > to)   return false;
    return true;
  });

  filtered.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  const container = document.getElementById('history-list');
  if (!filtered.length) {
    container.innerHTML = `<div class="empty-state"><span class="empty-icon">📭</span><p>No entries yet. Log your first workout!</p></div>`;
    return;
  }

  // Group by date
  const grouped = {};
  filtered.forEach(e => { (grouped[e.date] = grouped[e.date] || []).push(e); });

  // Compute PRs across ALL entries for badge display
  const prMap = computePRMap(entries);

  container.innerHTML = Object.keys(grouped).sort((a,b) => b.localeCompare(a)).map(date => `
    <div class="workout-day">
      <div class="workout-day-header">
        <span class="day-label">${fmtDate(date)}</span>
        <div class="day-divider"></div>
      </div>
      ${grouped[date].map(entry => renderEntryCard(entry, prMap)).join('')}
    </div>
  `).join('');

  container.querySelectorAll('.delete-entry-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await confirm('Delete Entry', `Delete "${btn.dataset.exercise}" on ${fmtDate(btn.dataset.date)}?`);
      if (!ok) return;
      const all = loadEntries().filter(e => e.id !== btn.dataset.id);
      saveEntries(all);
      toast('Entry deleted.', 'info');
      renderHistory();
    });
  });
}

function computePRMap(entries) {
  // prMap[exercise] = { maxWeight, maxReps, maxVolume }
  const map = {};
  entries.forEach(e => {
    if (!map[e.exercise]) map[e.exercise] = { weight: 0, reps: 0, volume: 0 };
    const w = maxWeight(e.sets), r = maxReps(e.sets), v = totalVolume(e.sets);
    if (w > map[e.exercise].weight) map[e.exercise].weight = w;
    if (r > map[e.exercise].reps)   map[e.exercise].reps   = r;
    if (v > map[e.exercise].volume) map[e.exercise].volume = v;
  });
  return map;
}

function renderEntryCard(entry, prMap) {
  const pr = prMap[entry.exercise] || {};
  const mw = maxWeight(entry.sets);
  const mr = maxReps(entry.sets);
  const vol = totalVolume(entry.sets);
  const isPRWeight = mw > 0 && mw >= pr.weight;
  const isPRVol    = vol > 0 && vol >= pr.volume;
  const unit = entry.sets[0]?.unit || 'kg';

  const setsHTML = entry.sets.map((s, i) => {
    const isSetPR = (+s.weight||0) > 0 && (+s.weight||0) >= pr.weight;
    return `<tr class="${isSetPR ? 'is-pr' : ''}">
      <td>Set ${i+1}</td>
      <td>${s.reps || '—'} reps</td>
      <td>${s.weight ? s.weight + ' ' + s.unit : '—'}</td>
      <td>${s.weight && s.reps ? (s.reps * s.weight).toFixed(1) + ' ' + s.unit : '—'}</td>
    </tr>`;
  }).join('');

  return `
    <div class="workout-card">
      <div class="workout-card-header">
        <span class="exercise-name">${entry.exercise}</span>
        <div class="exercise-meta">
          ${isPRWeight ? '<span class="badge badge-pr">🏆 PR</span>' : ''}
          ${vol > 0 ? `<span class="badge badge-volume">${vol.toLocaleString()} ${unit} vol</span>` : ''}
        </div>
      </div>
      <div class="workout-sets">
        <table class="sets-table">
          <thead><tr><th>#</th><th>Reps</th><th>Weight</th><th>Volume</th></tr></thead>
          <tbody>${setsHTML}</tbody>
        </table>
        ${entry.notes ? `<p style="margin-top:0.6rem;font-size:0.82rem;color:var(--text-muted)">📝 ${entry.notes}</p>` : ''}
      </div>
      <div class="workout-card-actions">
        <button class="btn btn-danger btn-sm delete-entry-btn"
          data-id="${entry.id}" data-exercise="${entry.exercise}" data-date="${entry.date}">
          Delete
        </button>
      </div>
    </div>
  `;
}

['history-search','history-date-from','history-date-to'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', renderHistory);
});

// Export JSON
document.getElementById('export-btn').addEventListener('click', () => {
  const data = loadEntries();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'liftlog-export.json';
  a.click();
  toast('Exported!', 'success');
});

// ── Share (URL-based) ─────────────────────────────────────────────────────────
document.getElementById('share-btn').addEventListener('click', openShareModal);
document.getElementById('share-stats-btn').addEventListener('click', openShareModal);

function openShareModal() {
  const entries = loadEntries();
  if (!entries.length) { toast('No entries to share yet.', 'error'); return; }
  const prMap = computePRMap(entries);
  const payload = {
    owner: 'LiftLog User',
    prs: prMap,
    totalEntries: entries.length,
    exercises: allExercises(entries).length,
    exported: new Date().toISOString().slice(0,10),
  };
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  const url = `${location.href.split('?')[0]}?share=${encoded}`;
  document.getElementById('share-link-input').value = url;
  document.getElementById('share-modal-overlay').style.display = 'flex';
}

document.getElementById('share-modal-close').addEventListener('click', () => {
  document.getElementById('share-modal-overlay').style.display = 'none';
});

document.getElementById('copy-link-btn').addEventListener('click', () => {
  const inp = document.getElementById('share-link-input');
  inp.select();
  navigator.clipboard.writeText(inp.value).then(() => toast('Link copied!', 'success'));
});

document.getElementById('share-modal-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('share-modal-overlay'))
    document.getElementById('share-modal-overlay').style.display = 'none';
});

// Shared view
function checkSharedView() {
  const params = new URLSearchParams(location.search);
  const share = params.get('share');
  if (!share) return;
  try {
    const data = JSON.parse(decodeURIComponent(escape(atob(share))));
    document.getElementById('shared-banner').style.display = 'block';
    document.getElementById('shared-owner-name').textContent = data.owner || 'someone';
    // Show shared PRs in stats section
    showSection('stats');
    renderSharedStats(data);
    // Disable nav to log/history
    document.querySelectorAll('.nav-btn[data-section="log"], .nav-btn[data-section="history"]').forEach(b => {
      b.style.opacity = '0.4';
      b.style.pointerEvents = 'none';
    });
  } catch { /* invalid share link, ignore */ }
}

function renderSharedStats(data) {
  const grid = document.getElementById('stats-grid');
  grid.innerHTML = `
    <div class="stat-card"><div class="stat-label">Total Entries</div><div class="stat-value">${data.totalEntries}</div></div>
    <div class="stat-card"><div class="stat-label">Exercises Tracked</div><div class="stat-value">${data.exercises}</div></div>
    <div class="stat-card"><div class="stat-label">Shared On</div><div class="stat-value" style="font-size:1rem">${data.exported}</div></div>
  `;
  const prsEl = document.getElementById('all-prs');
  const prs = data.prs || {};
  const exercises = Object.keys(prs).sort();
  if (!exercises.length) { prsEl.innerHTML = '<p style="color:var(--text-muted)">No PRs shared.</p>'; return; }
  prsEl.innerHTML = `<div class="pr-banner" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr))">
    ${exercises.map(ex => {
      const p = prs[ex];
      return `<div class="pr-card">
        <div class="pr-card-label">${ex}</div>
        <div class="pr-card-value">${p.weight > 0 ? p.weight + ' kg' : p.reps + ' reps'}</div>
        <div class="pr-card-sub">Best weight · ${p.reps} max reps</div>
      </div>`;
    }).join('')}
  </div>`;
}

// ── Progress ──────────────────────────────────────────────────────────────────
let progressChart = null;
let activeMetric = 'weight';

function renderProgressSection() {
  const entries = loadEntries();
  const exercises = allExercises(entries);
  const sel = document.getElementById('progress-exercise-select');
  const current = sel.value;
  sel.innerHTML = '<option value="">— Select Exercise —</option>' +
    exercises.map(e => `<option value="${e}" ${e===current?'selected':''}>${e}</option>`).join('');
  updateProgressChart();
}

document.getElementById('progress-exercise-select').addEventListener('change', updateProgressChart);

document.querySelectorAll('.metric-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.metric-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeMetric = btn.dataset.metric;
    updateProgressChart();
  });
});

function updateProgressChart() {
  const exercise = document.getElementById('progress-exercise-select').value;
  const placeholder = document.getElementById('chart-placeholder');
  const prBanner = document.getElementById('pr-banner');

  if (!exercise) {
    placeholder.style.display = 'block';
    prBanner.innerHTML = '';
    if (progressChart) { progressChart.destroy(); progressChart = null; }
    return;
  }

  const entries = loadEntries()
    .filter(e => e.exercise === exercise)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!entries.length) {
    placeholder.textContent = 'No data for this exercise.';
    placeholder.style.display = 'block';
    prBanner.innerHTML = '';
    return;
  }

  placeholder.style.display = 'none';

  // PRs
  const allW = entries.map(e => maxWeight(e.sets));
  const allR = entries.map(e => maxReps(e.sets));
  const allV = entries.map(e => totalVolume(e.sets));
  const prWeight = Math.max(...allW);
  const prReps   = Math.max(...allR);
  const prVol    = Math.max(...allV);
  const unit = entries[0].sets[0]?.unit || 'kg';
  const prWeightDate = entries[allW.indexOf(prWeight)].date;
  const prRepsDate   = entries[allR.indexOf(prReps)].date;

  prBanner.innerHTML = `
    <div class="pr-card"><div class="pr-card-label">🏆 Best Weight</div><div class="pr-card-value">${prWeight} <small style="font-size:1rem">${unit}</small></div><div class="pr-card-sub">${fmtDate(prWeightDate)}</div></div>
    <div class="pr-card"><div class="pr-card-label">🔥 Best Reps (1 set)</div><div class="pr-card-value">${prReps}</div><div class="pr-card-sub">${fmtDate(prRepsDate)}</div></div>
    <div class="pr-card"><div class="pr-card-label">📦 Best Volume</div><div class="pr-card-value">${prVol.toLocaleString()} <small style="font-size:1rem">${unit}</small></div><div class="pr-card-sub">Single session</div></div>
    <div class="pr-card"><div class="pr-card-label">Sessions</div><div class="pr-card-value">${entries.length}</div><div class="pr-card-sub">Total logged</div></div>
  `;

  const labels = entries.map(e => e.date);
  const metricFn = { weight: maxWeight, volume: totalVolume, reps: maxReps };
  const values = entries.map(e => metricFn[activeMetric](e.sets));
  const metricLabel = { weight: `Max Weight (${unit})`, volume: `Total Volume (${unit})`, reps: 'Max Reps' };

  const ctx = document.getElementById('progress-chart').getContext('2d');
  if (progressChart) progressChart.destroy();

  progressChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: metricLabel[activeMetric],
        data: values,
        borderColor: '#6c63ff',
        backgroundColor: 'rgba(108,99,255,0.12)',
        borderWidth: 2.5,
        pointRadius: 5,
        pointHoverRadius: 7,
        pointBackgroundColor: values.map((v, i) => v === Math.max(...values) ? '#f4c430' : '#6c63ff'),
        pointBorderColor: '#0f1117',
        pointBorderWidth: 2,
        fill: true,
        tension: 0.3,
      }]
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#20243a',
          borderColor: '#2e3352',
          borderWidth: 1,
          titleColor: '#e8eaf6',
          bodyColor: '#9ba3c7',
          callbacks: {
            title: items => fmtDate(items[0].label),
            label: item => ` ${item.dataset.label}: ${item.parsed.y}`,
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#5c6383', font: { size: 11 }, maxRotation: 45 },
          grid: { color: '#2e3352' }
        },
        y: {
          ticks: { color: '#5c6383', font: { size: 11 } },
          grid: { color: '#2e3352' },
          beginAtZero: false,
        }
      }
    }
  });
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function renderStats() {
  const entries = loadEntries();
  const grid = document.getElementById('stats-grid');
  const prsEl = document.getElementById('all-prs');

  if (!entries.length) {
    grid.innerHTML = '';
    prsEl.innerHTML = `<div class="empty-state"><span class="empty-icon">🏆</span><p>Log some workouts to see your PRs!</p></div>`;
    return;
  }

  const totalSets = entries.reduce((a, e) => a + e.sets.length, 0);
  const totalVol  = entries.reduce((a, e) => a + totalVolume(e.sets), 0);
  const days = new Set(entries.map(e => e.date)).size;
  const exCount = allExercises(entries).length;

  grid.innerHTML = `
    <div class="stat-card"><div class="stat-label">Total Sessions</div><div class="stat-value">${entries.length}</div><div class="stat-sub">${days} unique days</div></div>
    <div class="stat-card"><div class="stat-label">Total Sets</div><div class="stat-value">${totalSets}</div></div>
    <div class="stat-card"><div class="stat-label">Total Volume</div><div class="stat-value">${(totalVol/1000).toFixed(1)}k</div><div class="stat-sub">combined kg</div></div>
    <div class="stat-card"><div class="stat-label">Exercises</div><div class="stat-value">${exCount}</div><div class="stat-sub">unique lifts</div></div>
  `;

  const prMap = computePRMap(entries);
  const exercises = Object.keys(prMap).sort();

  prsEl.innerHTML = `<div class="pr-banner" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr))">
    ${exercises.map(ex => {
      const p = prMap[ex];
      const lastEntry = entries.filter(e => e.exercise === ex).sort((a,b) => b.date.localeCompare(a.date))[0];
      const unit = lastEntry?.sets[0]?.unit || 'kg';
      return `<div class="pr-card" style="cursor:pointer" onclick="goToProgress('${ex}')">
        <div class="pr-card-label">${ex}</div>
        <div class="pr-card-value">${p.weight > 0 ? p.weight + ' ' + unit : '—'}</div>
        <div class="pr-card-sub">${p.reps} max reps · ${p.volume.toLocaleString()} ${unit} vol</div>
      </div>`;
    }).join('')}
  </div>`;
}

function goToProgress(exercise) {
  showSection('progress');
  setTimeout(() => {
    document.getElementById('progress-exercise-select').value = exercise;
    updateProgressChart();
  }, 50);
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.getElementById('date-input').value = todayISO();
addSetRow();
checkSharedView();
