/* =========================================================
   LiftLog  |  app.js
   Single-file vanilla JS workout tracker.
   Data persisted in localStorage as JSON array.
   ========================================================= */

'use strict';

/* ── Storage ──────────────────────────────────────────────── */
const STORAGE_KEY = 'liftlog_workouts';

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function persist(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/* workouts: Array<{id, date, exercise, sets:[{reps,weight}], notes}> */
let workouts = load();

/* ── Utilities ────────────────────────────────────────────── */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateLong(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

function relDate(iso) {
  const today = todayISO();
  if (iso === today) return 'Today';
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  const yesterdayISO = yest.toISOString().slice(0, 10);
  if (iso === yesterdayISO) return 'Yesterday';
  return formatDateLong(iso);
}

/** Epley estimated 1RM */
function e1rm(weight, reps) {
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;
  if (w <= 0 || r <= 0) return 0;
  return r === 1 ? w : Math.round(w * (1 + r / 30));
}

function setMaxWeight(sets) { return Math.max(0, ...sets.map(s => Number(s.weight) || 0)); }
function setMaxReps(sets)   { return Math.max(0, ...sets.map(s => Number(s.reps)   || 0)); }
function setVolume(sets)    { return sets.reduce((a, s) => a + (Number(s.reps) || 0) * (Number(s.weight) || 0), 0); }
function setBest1rm(sets)   { return Math.max(0, ...sets.map(s => e1rm(s.weight, s.reps))); }

function allExerciseNames() {
  return [...new Set(workouts.map(w => w.exercise))].sort((a, b) => a.localeCompare(b));
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtVol(v) {
  return v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(Math.round(v));
}

/* ── Toast ────────────────────────────────────────────────── */
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

/* ── Confirm Modal ────────────────────────────────────────── */
function openConfirm(title, body) {
  return new Promise(resolve => {
    const overlay = document.getElementById('modal-overlay');
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').textContent  = body;
    overlay.style.display = 'flex';

    const done = val => {
      overlay.style.display = 'none';
      resolve(val);
    };

    document.getElementById('modal-confirm').onclick = () => done(true);
    document.getElementById('modal-cancel').onclick  = () => done(false);
    overlay.onclick = e => { if (e.target === overlay) done(false); };
  });
}

/* ── Navigation ───────────────────────────────────────────── */
let currentSection = 'log';

function showSection(name) {
  currentSection = name;
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.section === name)
  );
  document.getElementById(`${name}-section`).classList.add('active');

  if (name === 'history')  renderHistory();
  if (name === 'progress') renderProgress();
  if (name === 'stats')    renderStats();
  if (name === 'log')      renderTodayList();
}

document.querySelectorAll('.nav-btn').forEach(btn =>
  btn.addEventListener('click', () => showSection(btn.dataset.section))
);

/* ── Date display ─────────────────────────────────────────── */
document.getElementById('log-date').textContent = formatDateLong(todayISO());

/* ── Sets Builder ─────────────────────────────────────────── */
let sets = [{ reps: '', weight: '' }];

function renderSets() {
  const list = document.getElementById('sets-list');
  list.innerHTML = '';
  sets.forEach((set, i) => {
    const ormVal = (set.reps && set.weight)
      ? e1rm(set.weight, set.reps) + ' kg' : '&#8212;';
    const row = document.createElement('div');
    row.className = 'set-row';
    row.innerHTML = `
      <span class="set-num">${i + 1}</span>
      <div class="set-field">
        <span class="set-label">Reps</span>
        <input type="number" min="1" step="1" placeholder="&#8212;" value="${escHtml(set.reps)}"
               data-idx="${i}" data-field="reps" />
      </div>
      <div class="set-field">
        <span class="set-label">Weight (kg)</span>
        <input type="number" min="0" step="0.5" placeholder="&#8212;" value="${escHtml(set.weight)}"
               data-idx="${i}" data-field="weight" />
      </div>
      <div class="set-field">
        <span class="set-label">Est. 1RM</span>
        <input type="text" readonly tabindex="-1"
               style="color:var(--text-muted)" value="${ormVal}" />
      </div>
      <button type="button" class="remove-set-btn" data-idx="${i}" title="Remove set">&#215;</button>
    `;
    list.appendChild(row);
  });
}

document.getElementById('sets-list').addEventListener('input', e => {
  const { idx, field } = e.target.dataset;
  if (field === 'reps' || field === 'weight') {
    const i = Number(idx);
    sets[i][field] = e.target.value;
    // Update 1RM read-only field in same row
    const row = e.target.closest('.set-row');
    const ormInput = row.querySelector('input[readonly]');
    if (ormInput) {
      const w = Number(sets[i].weight), r = Number(sets[i].reps);
      ormInput.value = (w > 0 && r > 0) ? e1rm(w, r) + ' kg' : '—';
    }
  }
});

document.getElementById('sets-list').addEventListener('click', e => {
  const btn = e.target.closest('.remove-set-btn');
  if (!btn) return;
  const i = Number(btn.dataset.idx);
  if (sets.length > 1) { sets.splice(i, 1); renderSets(); }
});

document.getElementById('add-set-btn').addEventListener('click', () => {
  const last = sets[sets.length - 1];
  sets.push({ reps: last.reps, weight: last.weight });
  renderSets();
  // Focus new reps input
  const rows = document.querySelectorAll('#sets-list .set-row');
  const newRow = rows[rows.length - 1];
  if (newRow) newRow.querySelector('input[type=number]').focus();
});

renderSets();

/* ── Exercise Autocomplete ────────────────────────────────── */
const PRESET_EXERCISES = [
  'Back Squat', 'Bench Press', 'Deadlift', 'Overhead Press', 'Romanian Deadlift',
  'Incline Bench Press', 'Decline Bench Press', 'Front Squat', 'Sumo Deadlift',
  'Pull-up', 'Chin-up', 'Lat Pulldown', 'Barbell Row', 'Dumbbell Row', 'Cable Row',
  'Hip Thrust', 'Glute Bridge', 'Bulgarian Split Squat', 'Hack Squat', 'Leg Press',
  'Leg Curl', 'Leg Extension', 'Calf Raise',
  'Dumbbell Curl', 'Barbell Curl', 'Hammer Curl',
  'Tricep Pushdown', 'Skull Crusher', 'Dip', 'Close-Grip Bench Press',
  'Lateral Raise', 'Face Pull', 'Shrug', 'Arnold Press',
  'Plank', 'Ab Wheel Rollout', 'Crunch',
];

const exerciseInput  = document.getElementById('exercise-input');
const autocompleteEl = document.getElementById('autocomplete-list');
let acHighlight = -1;

function acSuggestions(q) {
  if (!q) return [];
  const lq = q.toLowerCase();
  const combined = [...new Set([...allExerciseNames(), ...PRESET_EXERCISES])];
  return combined.filter(n => n.toLowerCase().includes(lq)).slice(0, 8);
}

function renderAC(items) {
  if (!items.length) { autocompleteEl.style.display = 'none'; return; }
  autocompleteEl.innerHTML = items.map(item =>
    `<div class="autocomplete-item" data-val="${escHtml(item)}">${escHtml(item)}</div>`
  ).join('');
  acHighlight = -1;
  autocompleteEl.style.display = 'block';
}

exerciseInput.addEventListener('input', () =>
  renderAC(acSuggestions(exerciseInput.value))
);

exerciseInput.addEventListener('keydown', e => {
  const items = autocompleteEl.querySelectorAll('.autocomplete-item');
  if (!items.length) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    acHighlight = Math.min(acHighlight + 1, items.length - 1);
    items.forEach((el, i) => el.classList.toggle('highlighted', i === acHighlight));
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    acHighlight = Math.max(acHighlight - 1, 0);
    items.forEach((el, i) => el.classList.toggle('highlighted', i === acHighlight));
  } else if (e.key === 'Enter' && acHighlight >= 0) {
    e.preventDefault();
    exerciseInput.value = items[acHighlight].dataset.val;
    autocompleteEl.style.display = 'none';
  } else if (e.key === 'Escape') {
    autocompleteEl.style.display = 'none';
  }
});

autocompleteEl.addEventListener('mousedown', e => {
  const item = e.target.closest('.autocomplete-item');
  if (!item) return;
  e.preventDefault();
  exerciseInput.value = item.dataset.val;
  autocompleteEl.style.display = 'none';
  exerciseInput.focus();
});

document.addEventListener('click', e => {
  if (!exerciseInput.contains(e.target) && !autocompleteEl.contains(e.target)) {
    autocompleteEl.style.display = 'none';
  }
});

/* ── Log Form Submit ──────────────────────────────────────── */
document.getElementById('log-form').addEventListener('submit', e => {
  e.preventDefault();

  const exercise = exerciseInput.value.trim();
  if (!exercise) { toast('Enter an exercise name.', 'error'); return; }

  const validSets = sets
    .filter(s => s.reps || s.weight)
    .map(s => ({ reps: Number(s.reps) || 0, weight: Number(s.weight) || 0 }));

  if (!validSets.length) { toast('Add at least one set with reps or weight.', 'error'); return; }

  const entry = {
    id:       uid(),
    date:     todayISO(),
    exercise,
    sets:     validSets,
    notes:    document.getElementById('notes-input').value.trim(),
  };

  workouts.unshift(entry);
  persist(workouts);

  const isNewPR = checkIsPR(entry);
  toast(
    isNewPR ? `New PR on ${exercise}! Entry saved.` : `Entry saved — ${exercise}`,
    'success'
  );

  clearForm();
  renderTodayList();
});

function clearForm() {
  exerciseInput.value = '';
  document.getElementById('notes-input').value = '';
  autocompleteEl.style.display = 'none';
  sets = [{ reps: '', weight: '' }];
  renderSets();
}

document.getElementById('clear-form-btn').addEventListener('click', clearForm);

/** True if this entry's max weight beats all previous entries for the same exercise */
function checkIsPR(entry) {
  const prev = workouts.filter(w => w.exercise === entry.exercise && w.id !== entry.id);
  if (!prev.length) return false;
  const prevBest = Math.max(0, ...prev.map(w => setMaxWeight(w.sets)));
  return setMaxWeight(entry.sets) > prevBest;
}

/** True if this entry currently holds the max weight record for its exercise */
function isCurrentPR(entry) {
  const all = workouts.filter(w => w.exercise === entry.exercise);
  if (all.length <= 1) return true;
  const best = Math.max(...all.map(w => setMaxWeight(w.sets)));
  return setMaxWeight(entry.sets) >= best;
}

/* ── Today List ───────────────────────────────────────────── */
function renderTodayList() {
  const container = document.getElementById('today-list');
  const today = workouts.filter(w => w.date === todayISO());

  if (!today.length) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">&#128170;</span>
        <p>No workouts logged today yet. Fill the form above to start!</p>
      </div>`;
    return;
  }

  container.innerHTML = today.map(w => buildWorkoutCard(w)).join('');
  attachCardActions(container);
}

/* ── Workout Card ─────────────────────────────────────────── */
function buildWorkoutCard(entry) {
  const vol  = setVolume(entry.sets);
  const rm   = setBest1rm(entry.sets);
  const isPR = isCurrentPR(entry);

  const rows = entry.sets.map((s, i) => `
    <tr>
      <td>Set ${i + 1}</td>
      <td>${s.reps || '&#8212;'}</td>
      <td>${s.weight ? s.weight + ' kg' : '&#8212;'}</td>
      <td>${(s.reps && s.weight) ? (s.reps * s.weight).toFixed(0) + ' kg' : '&#8212;'}</td>
    </tr>
  `).join('');

  return `
    <div class="workout-card" data-id="${entry.id}">
      <div class="workout-card-header">
        <div>
          <div class="exercise-name">${escHtml(entry.exercise)}</div>
          ${entry.notes ? `<div style="font-size:0.78rem;color:var(--text-muted);margin-top:0.15rem">${escHtml(entry.notes)}</div>` : ''}
        </div>
        <div class="exercise-meta">
          ${isPR ? '<span class="badge badge-pr">&#127942; PR</span>' : ''}
          ${vol > 0 ? `<span class="badge badge-volume">${fmtVol(vol)} kg</span>` : ''}
          ${rm  > 0 ? `<span style="font-size:0.75rem;color:var(--text-muted)">1RM ~${rm} kg</span>` : ''}
        </div>
      </div>
      <div class="workout-sets">
        <table class="sets-table">
          <thead><tr><th>Set</th><th>Reps</th><th>Weight</th><th>Volume</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="workout-card-actions">
        <button class="btn btn-secondary btn-sm" data-action="duplicate" data-id="${entry.id}">Duplicate to Today</button>
        <button class="btn btn-danger btn-sm" data-action="delete" data-id="${entry.id}">Delete</button>
      </div>
    </div>
  `;
}

function attachCardActions(container) {
  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { action, id } = btn.dataset;

      if (action === 'delete') {
        const ok = await openConfirm('Delete entry?', 'This entry will be permanently removed.');
        if (!ok) return;
        workouts = workouts.filter(w => w.id !== id);
        persist(workouts);
        toast('Entry deleted.', 'info');
        if (currentSection === 'history') renderHistory();
        renderTodayList();
      }

      if (action === 'duplicate') {
        const src = workouts.find(w => w.id === id);
        if (!src) return;
        const copy = { ...src, id: uid(), date: todayISO() };
        workouts.unshift(copy);
        persist(workouts);
        toast(`Duplicated "${src.exercise}" to today.`, 'success');
        renderTodayList();
        if (currentSection === 'history') renderHistory();
      }
    });
  });
}

/* ── History ──────────────────────────────────────────────── */
let histSearch = '';
let histDate   = '';

document.getElementById('history-search').addEventListener('input', e => {
  histSearch = e.target.value;
  renderHistory();
});

document.getElementById('history-date').addEventListener('change', e => {
  histDate = e.target.value;
  renderHistory();
});

document.getElementById('clear-all-btn').addEventListener('click', async () => {
  const ok = await openConfirm(
    'Clear all data?',
    'This permanently deletes every workout entry. This cannot be undone.'
  );
  if (!ok) return;
  workouts = [];
  persist(workouts);
  toast('All data cleared.', 'info');
  renderHistory();
  renderTodayList();
});

function renderHistory() {
  const container = document.getElementById('history-list');
  let filtered = workouts.slice(); // already newest-first

  if (histSearch.trim()) {
    const q = histSearch.toLowerCase();
    filtered = filtered.filter(w => w.exercise.toLowerCase().includes(q));
  }
  if (histDate) {
    filtered = filtered.filter(w => w.date === histDate);
  }

  if (!filtered.length) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">&#128203;</span>
        <p>No workouts found.</p>
      </div>`;
    return;
  }

  // Group by date (sorted newest first)
  const byDate = Object.groupBy
    ? Object.groupBy(filtered, w => w.date)
    : filtered.reduce((acc, w) => { (acc[w.date] = acc[w.date] || []).push(w); return acc; }, {});

  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  container.innerHTML = dates.map(date => `
    <div class="workout-day">
      <div class="workout-day-header">
        <span class="day-label">${relDate(date)}</span>
        <span class="day-divider"></span>
      </div>
      ${byDate[date].map(w => buildWorkoutCard(w)).join('')}
    </div>
  `).join('');

  attachCardActions(container);
}

/* ── Progress Section ─────────────────────────────────────── */
let progressChart = null;
let activeMetric  = 'weight';

document.querySelectorAll('.metric-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.metric-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeMetric = tab.dataset.metric;
    drawChart();
  });
});

document.getElementById('progress-exercise').addEventListener('change', () => {
  drawChart();
  renderPRCards();
  renderBestSets();
});

function populateExerciseSelect() {
  const sel  = document.getElementById('progress-exercise');
  const prev = sel.value;
  sel.innerHTML = '<option value="">-- Select exercise --</option>';
  allExerciseNames().forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    if (name === prev) opt.selected = true;
    sel.appendChild(opt);
  });
}

function renderProgress() {
  populateExerciseSelect();
  drawChart();
  renderPRCards();
  renderBestSets();
}

function exerciseTimeSeries(exercise) {
  if (!exercise) return [];
  return workouts
    .filter(w => w.exercise === exercise)
    .map(w => ({
      date:   w.date,
      weight: setMaxWeight(w.sets),
      reps:   setMaxReps(w.sets),
      volume: setVolume(w.sets),
      orm:    setBest1rm(w.sets),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function drawChart() {
  const exercise    = document.getElementById('progress-exercise').value;
  const canvas      = document.getElementById('progress-chart');
  const placeholder = document.getElementById('chart-placeholder');

  if (progressChart) { progressChart.destroy(); progressChart = null; }

  if (!exercise) {
    canvas.style.display      = 'none';
    placeholder.style.display = 'block';
    placeholder.textContent   = 'Select an exercise above to view your progress chart.';
    return;
  }

  const series = exerciseTimeSeries(exercise);

  if (series.length < 1) {
    canvas.style.display      = 'none';
    placeholder.style.display = 'block';
    placeholder.textContent   = 'No data yet for this exercise. Log some sets first!';
    return;
  }

  canvas.style.display      = 'block';
  placeholder.style.display = 'none';

  const metricConfig = {
    weight: { key: 'weight', label: 'Max Weight (kg)', color: '#6c63ff' },
    reps:   { key: 'reps',   label: 'Max Reps',        color: '#3ecf8e' },
    volume: { key: 'volume', label: 'Session Volume (kg)', color: '#f4c430' },
    '1rm':  { key: 'orm',    label: 'Est. 1RM (kg)',    color: '#e05c5c' },
  };

  const m      = metricConfig[activeMetric];
  const values = series.map(d => d[m.key]);
  const labels = series.map(d => {
    const [, mo, dy] = d.date.split('-');
    return `${Number(mo)}/${Number(dy)}`;
  });

  const ctx      = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 280);
  gradient.addColorStop(0, m.color + '55');
  gradient.addColorStop(1, m.color + '00');

  progressChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label:              m.label,
        data:               values,
        borderColor:        m.color,
        backgroundColor:    gradient,
        borderWidth:        2.5,
        pointBackgroundColor: m.color,
        pointRadius:        values.length > 30 ? 2 : 5,
        pointHoverRadius:   7,
        fill:               true,
        tension:            0.35,
      }],
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#20243a',
          borderColor:     '#2e3352',
          borderWidth:     1,
          titleColor:      '#e8eaf6',
          bodyColor:       '#9ba3c7',
          padding:         10,
          callbacks: {
            label: ctx => ` ${ctx.parsed.y}${activeMetric === 'reps' ? ' reps' : ' kg'}`,
          },
        },
      },
      scales: {
        x: {
          grid:  { color: '#2e3352' },
          ticks: { color: '#5c6383', font: { size: 11 }, maxTicksLimit: 10 },
        },
        y: {
          grid:       { color: '#2e3352' },
          ticks:      { color: '#5c6383', font: { size: 11 } },
          beginAtZero: false,
        },
      },
    },
  });
}

function renderPRCards() {
  const exercise = document.getElementById('progress-exercise').value;
  const banner   = document.getElementById('exercise-prs');
  if (!exercise) { banner.style.display = 'none'; return; }

  const series = exerciseTimeSeries(exercise);
  if (!series.length) { banner.style.display = 'none'; return; }

  const prWeight = Math.max(...series.map(d => d.weight));
  const prReps   = Math.max(...series.map(d => d.reps));
  const prVol    = Math.max(...series.map(d => d.volume));
  const pr1rm    = Math.max(...series.map(d => d.orm));

  const prWeightDate = series.find(d => d.weight === prWeight)?.date;
  const pr1rmDate    = series.find(d => d.orm    === pr1rm)?.date;

  banner.style.display = 'grid';
  banner.innerHTML = `
    <div class="pr-card">
      <div class="pr-card-label">&#127942; Max Weight</div>
      <div class="pr-card-value">${prWeight} <span style="font-size:1rem;font-weight:600">kg</span></div>
      <div class="pr-card-sub">${prWeightDate ? relDate(prWeightDate) : ''}</div>
    </div>
    <div class="pr-card">
      <div class="pr-card-label">&#128293; Max Reps</div>
      <div class="pr-card-value">${prReps}</div>
      <div class="pr-card-sub">reps in one set</div>
    </div>
    <div class="pr-card">
      <div class="pr-card-label">&#128230; Best Volume</div>
      <div class="pr-card-value">${fmtVol(prVol)} <span style="font-size:1rem;font-weight:600">kg</span></div>
      <div class="pr-card-sub">in one session</div>
    </div>
    <div class="pr-card">
      <div class="pr-card-label">&#9889; Est. 1RM</div>
      <div class="pr-card-value">${pr1rm} <span style="font-size:1rem;font-weight:600">kg</span></div>
      <div class="pr-card-sub">${pr1rmDate ? relDate(pr1rmDate) : ''}</div>
    </div>
  `;
}

function renderBestSets() {
  const exercise = document.getElementById('progress-exercise').value;
  const section  = document.getElementById('best-sets-section');
  if (!exercise) { section.style.display = 'none'; return; }

  const entries = workouts.filter(w => w.exercise === exercise);
  if (!entries.length) { section.style.display = 'none'; return; }

  const allSets = [];
  entries.forEach(w => {
    w.sets.forEach((s, i) => {
      allSets.push({
        date:   w.date,
        setNum: i + 1,
        reps:   Number(s.reps)   || 0,
        weight: Number(s.weight) || 0,
        vol:    (Number(s.reps) || 0) * (Number(s.weight) || 0),
        orm:    e1rm(s.weight, s.reps),
      });
    });
  });

  allSets.sort((a, b) => b.orm - a.orm);
  const top    = allSets.slice(0, 10);
  const maxOrm = top[0]?.orm || 0;

  section.style.display = 'block';
  document.getElementById('best-sets-body').innerHTML = top.map((s, idx) => `
    <tr ${s.orm === maxOrm && idx === 0 ? 'class="is-pr"' : ''}>
      <td>${relDate(s.date)}</td>
      <td>${s.setNum}</td>
      <td>${s.reps}</td>
      <td>${s.weight} kg</td>
      <td>${s.vol.toFixed(0)} kg</td>
      <td>${s.orm} kg${idx === 0 ? ' &#127942;' : ''}</td>
    </tr>
  `).join('');
}

/* ── Stats Section ────────────────────────────────────────── */
function renderStats() {
  renderStatsGrid();
  renderAllPRs();
}

function calcStreak() {
  const days = [...new Set(workouts.map(w => w.date))].sort((a, b) => b.localeCompare(a));
  if (!days.length) return 0;
  let streak = 0;
  let cursor = todayISO();
  for (const day of days) {
    if (day === cursor) {
      streak++;
      const d = new Date(cursor + 'T00:00:00');
      d.setDate(d.getDate() - 1);
      cursor = d.toISOString().slice(0, 10);
    } else {
      break;
    }
  }
  return streak;
}

function renderStatsGrid() {
  const totalEntries    = workouts.length;
  const uniqueDays      = new Set(workouts.map(w => w.date)).size;
  const uniqueExercises = new Set(workouts.map(w => w.exercise)).size;
  const totalSets       = workouts.reduce((a, w) => a + w.sets.length, 0);
  const totalReps       = workouts.reduce((a, w) => a + w.sets.reduce((b, s) => b + (Number(s.reps) || 0), 0), 0);
  const totalVol        = workouts.reduce((a, w) => a + setVolume(w.sets), 0);
  const streak          = calcStreak();

  // Most-logged exercise
  const freq = {};
  workouts.forEach(w => { freq[w.exercise] = (freq[w.exercise] || 0) + 1; });
  const fav = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];

  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Workouts</div>
      <div class="stat-value">${totalEntries}</div>
      <div class="stat-sub">entries logged</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Active Days</div>
      <div class="stat-value">${uniqueDays}</div>
      <div class="stat-sub">training days</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Exercises</div>
      <div class="stat-value">${uniqueExercises}</div>
      <div class="stat-sub">unique lifts</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Total Sets</div>
      <div class="stat-value">${totalSets}</div>
      <div class="stat-sub">sets performed</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Total Reps</div>
      <div class="stat-value">${totalReps.toLocaleString()}</div>
      <div class="stat-sub">reps performed</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Total Volume</div>
      <div class="stat-value">${fmtVol(totalVol)}</div>
      <div class="stat-sub">kg moved</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Streak</div>
      <div class="stat-value">${streak} &#128293;</div>
      <div class="stat-sub">consecutive days</div>
    </div>
    ${fav ? `
    <div class="stat-card">
      <div class="stat-label">Favourite</div>
      <div class="stat-value" style="font-size:1rem;line-height:1.3">${escHtml(fav[0])}</div>
      <div class="stat-sub">${fav[1]} sessions</div>
    </div>` : ''}
  `;
}

function renderAllPRs() {
  const container  = document.getElementById('all-prs-list');
  const exercises  = allExerciseNames();

  if (!exercises.length) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">&#127942;</span>
        <p>Log some workouts to start tracking PRs!</p>
      </div>`;
    return;
  }

  container.innerHTML = exercises.map(ex => {
    const entries = workouts.filter(w => w.exercise === ex);
    const prW     = Math.max(...entries.map(w => setMaxWeight(w.sets)));
    const prR     = Math.max(...entries.map(w => setMaxReps(w.sets)));
    const pr1     = Math.max(...entries.map(w => setBest1rm(w.sets)));
    const prEntry = entries
      .filter(w => setMaxWeight(w.sets) === prW)
      .sort((a, b) => b.date.localeCompare(a.date))[0];

    return `
      <div class="workout-card" style="margin-bottom:0.75rem">
        <div class="workout-card-header">
          <div>
            <div class="exercise-name">${escHtml(ex)}</div>
            <div style="font-size:0.75rem;color:var(--text-muted)">
              ${entries.length} session${entries.length !== 1 ? 's' : ''}
              &middot; PR set ${prEntry ? relDate(prEntry.date) : ''}
            </div>
          </div>
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center">
            <span class="badge badge-pr">&#127942; ${prW} kg</span>
            <span style="font-size:0.75rem;color:var(--text-muted)">1RM ~${pr1} kg</span>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.5rem;padding:0.75rem 1.1rem">
          <div style="text-align:center">
            <div style="font-size:0.68rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em">Max Weight</div>
            <div style="font-size:1.15rem;font-weight:700">${prW} kg</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:0.68rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em">Max Reps</div>
            <div style="font-size:1.15rem;font-weight:700">${prR}</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:0.68rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em">Est. 1RM</div>
            <div style="font-size:1.15rem;font-weight:700">${pr1} kg</div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

/* ── Initialise ───────────────────────────────────────────── */
renderTodayList();
