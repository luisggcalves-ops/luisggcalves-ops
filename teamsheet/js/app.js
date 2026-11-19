/*
 * Teamsheet app.
 *
 * There are three screens, chosen by the address in the browser:
 *   /                 Home: create a squad, see squads on this phone
 *   /?s=CODE          Player page: the link you share in WhatsApp
 *   /#o=TOKEN         Organiser page: the secret link only you keep
 *
 * Each screen is drawn by a render...() function that builds HTML from
 * the current "state". Buttons carry data-action="..." and one click
 * handler per screen decides what to do.
 */
(function () {
  'use strict';

  var api = window.TeamsheetAPI;
  var app = document.getElementById('app');
  var REFRESH_MS = 15000; // backup refresh in case live updates are blocked

  // ===================================================================
  //  Small helpers
  // ===================================================================

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var store = {
    get: function (key, fallback) {
      try {
        var v = localStorage.getItem(key);
        return v == null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
    }
  };

  // Squads remembered on this phone: [{ code, name, token? }]
  function rememberSquad(entry) {
    var list = store.get('ts.squads', []).filter(function (s) { return s.code !== entry.code; });
    var old = store.get('ts.squads', []).filter(function (s) { return s.code === entry.code; })[0] || {};
    list.unshift(Object.assign({}, old, entry));
    store.set('ts.squads', list.slice(0, 20));
  }

  var toastTimer;
  function toast(message, isError) {
    var el = document.getElementById('toast');
    el.textContent = message;
    el.className = 'show' + (isError ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = ''; }, isError ? 4500 : 2200);
  }

  function money(amount, currency) {
    if (amount == null || amount === '') return '';
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency', currency: currency || 'GBP',
        minimumFractionDigits: Number(amount) % 1 ? 2 : 0
      }).format(Number(amount));
    } catch (e) { return String(amount); }
  }

  function fmtDay(iso) {
    return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function fmtTime(iso) {
    return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  function fmtKickoff(iso) { return fmtDay(iso) + ' · ' + fmtTime(iso); }

  // <input type="datetime-local"> wants "2026-11-20T19:00" in local time
  function toLocalInput(date) {
    var d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 16);
  }

  function baseUrl() { return location.origin + location.pathname; }
  function playerLink(code) { return baseUrl() + '?s=' + code; }
  function organiserLink(token) { return baseUrl() + '#o=' + token; }

  async function copyText(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      toast((label || 'Link') + ' copied');
    } catch (e) {
      window.prompt('Copy this:', text);
    }
  }

  function openWhatsApp(text) {
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
  }

  function formValues(form) {
    var out = {};
    new FormData(form).forEach(function (v, k) { out[k] = typeof v === 'string' ? v.trim() : v; });
    return out;
  }

  function setBusy(el, busy) {
    if (!el) return;
    el.disabled = busy;
    el.classList.toggle('busy', busy);
  }

  // Run an action, show any error as a toast, and disable the button meanwhile.
  async function attempt(button, fn) {
    setBusy(button, true);
    try {
      return await fn();
    } catch (e) {
      toast(e.message, true);
    } finally {
      setBusy(button, false);
    }
  }

  // ===================================================================
  //  Who is playing? (shared by the player and organiser pages)
  // ===================================================================

  // Splits replies into playing / reserves / maybe / out / no reply.
  // "In" players are ordered by when they said In; the first
  // `capacity` play, the rest are reserves (and move up if someone drops).
  function lineup(game, players) {
    var byId = {};
    players.forEach(function (p) { byId[p.id] = p; });
    var replies = {};
    (game.responses || []).forEach(function (r) { replies[r.player_id] = r; });

    var ins = (game.responses || [])
      .filter(function (r) { return r.status === 'in' && byId[r.player_id]; })
      .sort(function (a, b) { return new Date(a.in_since) - new Date(b.in_since); })
      .map(function (r) { return { player: byId[r.player_id], reply: r }; });

    function withStatus(status) {
      return (game.responses || [])
        .filter(function (r) { return r.status === status && byId[r.player_id]; })
        .map(function (r) { return { player: byId[r.player_id], reply: r }; });
    }

    var cap = game.capacity || 10;
    return {
      capacity: cap,
      playing: ins.slice(0, cap),
      reserves: ins.slice(cap),
      maybe: withStatus('maybe'),
      out: withStatus('out'),
      noReply: players
        .filter(function (p) { return p.active && !(replies[p.id] && replies[p.id].status); })
        .map(function (p) { return { player: p, reply: replies[p.id] || null }; }),
      replies: replies,
      byId: byId
    };
  }

  function statusOf(L, playerId) {
    for (var i = 0; i < L.playing.length; i++) if (L.playing[i].player.id === playerId) return 'playing';
    for (var j = 0; j < L.reserves.length; j++) if (L.reserves[j].player.id === playerId) return 'reserve' + (j + 1);
    var r = L.replies[playerId];
    return r && r.status ? r.status : null;
  }

  function counterHtml(L) {
    var n = L.playing.length, cap = L.capacity;
    var need = Math.max(0, cap - n);
    var slots = '';
    for (var i = 0; i < cap; i++) slots += '<span class="slot' + (i < n ? ' filled' : '') + '"></span>';
    var line = need > 0
      ? '<strong>need ' + need + ' more</strong>'
      : '<strong class="ok">Game on!</strong>' +
        (L.reserves.length ? ' · ' + L.reserves.length + ' reserve' + (L.reserves.length > 1 ? 's' : '') : '');
    return '<div class="counter">' +
      '<div class="count"><span class="big">' + n + '/' + cap + '</span> playing</div>' +
      '<div class="need">' + line + '</div>' +
      '<div class="slots" aria-hidden="true">' + slots + '</div>' +
      (L.maybe.length ? '<div class="muted small">' + L.maybe.length + ' maybe</div>' : '') +
    '</div>';
  }

  function gameInfoHtml(game, currency) {
    return '<div class="game-when">' + esc(fmtDay(game.kickoff)) +
             ' <span class="time">' + esc(fmtTime(game.kickoff)) + '</span></div>' +
      '<div class="game-meta">' +
        (game.venue ? '<span>📍 ' + esc(game.venue) + '</span>' : '') +
        (game.price ? '<span>💷 ' + esc(money(game.price, currency)) + ' each</span>' : '') +
      '</div>' +
      (game.note ? '<p class="note">' + esc(game.note) + '</p>' : '');
  }

  function nameHtml(player) {
    return esc(player.name) + (player.is_keeper ? ' <span class="badge gk" title="Goalkeeper">GK</span>' : '');
  }

  function listSection(title, entries, opts) {
    opts = opts || {};
    if (!entries.length && !opts.always) return '';
    var items = entries.map(function (e, i) {
      return '<li' + (opts.meId === e.player.id ? ' class="me"' : '') + '>' +
        (opts.numbered ? '<span class="num">' + (i + 1 + (opts.offset || 0)) + '</span>' : '') +
        '<span class="name">' + nameHtml(e.player) + '</span></li>';
    }).join('');
    return '<div class="list-block ' + (opts.cls || '') + '">' +
      '<h3>' + esc(title) + ' <span class="muted">' + entries.length + '</span></h3>' +
      (entries.length ? '<ol class="names">' + items + '</ol>' : '<p class="muted small">Nobody yet</p>') +
    '</div>';
  }

  function teamsHtml(teams, byId, opts) {
    opts = opts || {};
    function col(ids, gk, key, label) {
      var total = 0;
      var rows = ids.map(function (id) {
        var p = byId[id];
        if (!p) return '';
        total += Number(p.skill) || 0;
        var selected = opts.swapSel === id ? ' selected' : '';
        var inner = '<span>' + esc(p.name) + (id === gk ? ' <span class="badge gk">GK</span>' : '') + '</span>' +
          (opts.showSkill ? '<span class="skill-num" title="Skill">' + p.skill + '</span>' : '');
        return '<li>' + (opts.swappable
          ? '<button class="team-player' + selected + '" data-action="swap" data-id="' + esc(id) + '">' + inner + '</button>'
          : inner) + '</li>';
      }).join('');
      return '<div class="team team-' + key + '"><h3>' + label +
        (opts.showSkill ? ' <span class="muted small">skill ' + total + '</span>' : '') +
        '</h3><ul>' + rows + '</ul></div>';
    }
    return '<div class="teams">' + col(teams.a, teams.gk_a, 'a', '🟧 Bibs') + col(teams.b, teams.gk_b, 'b', '⬜ No bibs') + '</div>';
  }

  function dots(n) {
    var s = '';
    for (var i = 1; i <= 5; i++) s += i <= n ? '●' : '○';
    return s;
  }

  function whatsappMessage(squad, game, L) {
    var lines = ['⚽ ' + squad.name + ' — ' + fmtKickoff(game.kickoff)];
    if (game.venue) lines.push('📍 ' + game.venue);
    var need = L.capacity - L.playing.length;
    lines.push(need > 0 ? '✅ ' + L.playing.length + '/' + L.capacity + ' playing, need ' + need + ' more'
                        : '✅ ' + L.capacity + '/' + L.capacity + ' — game on!');
    if (L.playing.length) {
      lines.push('');
      L.playing.forEach(function (e, i) { lines.push((i + 1) + '. ' + e.player.name + (e.player.is_keeper ? ' (GK)' : '')); });
    }
    if (L.reserves.length) {
      lines.push('Reserves: ' + L.reserves.map(function (e) { return e.player.name; }).join(', '));
    }
    lines.push('', '👉 In / Maybe / Out: ' + playerLink(squad.code));
    return lines.join('\n');
  }

  function topbar(title, subtitle, extra) {
    return '<header class="topbar"><a class="brand" href="' + esc(location.pathname) + '">⚽ <span>Teamsheet</span></a>' +
      (extra || '') + '</header>' +
      (title ? '<div class="page-title"><h1>' + esc(title) + '</h1>' +
        (subtitle ? '<div class="muted">' + subtitle + '</div>' : '') + '</div>' : '');
  }

  // ===================================================================
  //  Live refresh: Realtime ping + a slower backup timer
  // ===================================================================

  var liveConn = null, timer = null;
  function startLive(code, reload) {
    stopLive();
    liveConn = api.live(code, reload);
    timer = setInterval(function () { if (!document.hidden) reload(); }, REFRESH_MS);
    document.onvisibilitychange = function () { if (!document.hidden) reload(); };
  }
  function stopLive() {
    if (liveConn) liveConn.stop();
    liveConn = null;
    clearInterval(timer);
    document.onvisibilitychange = null;
  }
  function pingOthers() { if (liveConn) liveConn.ping(); }

  // ===================================================================
  //  Screen 1: Home
  // ===================================================================

  function renderHome() {
    stopLive();
    document.title = 'Teamsheet';
    var squads = store.get('ts.squads', []);
    var mine = squads.map(function (s) {
      var href = s.token ? '#o=' + encodeURIComponent(s.token) : '?s=' + encodeURIComponent(s.code);
      return '<a class="row-link" href="' + esc(href) + '"><span>' + esc(s.name || s.code) + '</span>' +
        '<span class="badge ' + (s.token ? 'org' : '') + '">' + (s.token ? 'Organiser' : 'Player') + '</span></a>';
    }).join('');

    app.innerHTML = topbar() +
      '<main class="wrap">' +
        '<section class="hero"><h1>Five-a-side, sorted.</h1>' +
          '<p>Make a squad, post one link in WhatsApp, and watch the teamsheet fill up. No accounts, no app to install.</p>' +
          '<ol class="steps"><li>Create your squad</li><li>Schedule this week\'s game</li><li>Share the link. Players tap <b>In</b>, <b>Maybe</b> or <b>Out</b></li></ol>' +
        '</section>' +
        (mine ? '<section class="card"><h2>On this phone</h2><div class="rows">' + mine + '</div></section>' : '') +
        '<section class="card"><h2>Start a squad</h2>' +
          '<form id="create-form" class="form">' +
            '<label>Squad name<input name="name" required maxlength="60" placeholder="e.g. Thursday Ballers" autocomplete="off"></label>' +
            '<label>Players <span class="muted">(one name per line, you can add more later)</span>' +
              '<textarea name="players" rows="6" placeholder="Ana&#10;Ben&#10;Cal"></textarea></label>' +
            '<label>Currency<select name="currency"><option value="GBP">£ Pound</option><option value="EUR">€ Euro</option><option value="USD">$ Dollar</option></select></label>' +
            '<button class="btn primary block" type="submit">Create squad</button>' +
          '</form>' +
        '</section>' +
      '</main>';

    document.getElementById('create-form').onsubmit = function (ev) {
      ev.preventDefault();
      var v = formValues(ev.target);
      var names = v.players.split(/\n|,/).map(function (s) { return s.trim(); }).filter(Boolean);
      attempt(ev.target.querySelector('button'), async function () {
        var res = await api.call('create_squad', { p_name: v.name, p_players: names, p_currency: v.currency });
        rememberSquad({ code: res.share_code, name: v.name, token: res.admin_token });
        store.set('ts.justCreated', res.admin_token);
        location.hash = 'o=' + res.admin_token;
      });
    };
  }

  // ===================================================================
  //  Screen 2: Player page (?s=CODE)
  // ===================================================================

  var P = null; // player page state

  async function startPlayer(code) {
    P = { code: code, data: null, me: store.get('ts.me.' + code, null), joining: false, error: null };
    app.innerHTML = topbar() + '<main class="wrap"><div class="loading">Loading the teamsheet…</div></main>';
    app.onclick = onPlayerClick;
    app.onsubmit = onPlayerSubmit;
    await loadPlayer();
    startLive(code, loadPlayer);
  }

  async function loadPlayer() {
    try {
      P.data = await api.call('get_squad', { p_code: P.code });
      P.error = null;
      rememberSquad({ code: P.data.squad.code, name: P.data.squad.name });
    } catch (e) {
      if (!P.data) P.error = e.message; else return; // keep showing last good data
    }
    renderPlayer();
  }

  function renderPlayer() {
    if (P.error) {
      app.innerHTML = topbar() + '<main class="wrap"><div class="card empty"><h2>Hmm.</h2><p>' + esc(P.error) + '</p></div></main>';
      return;
    }
    var d = P.data, game = d.game, squad = d.squad;
    var players = d.players;
    var me = players.filter(function (p) { return p.id === P.me && p.active; })[0] || null;
    document.title = squad.name + ' · Teamsheet';

    var body = '';
    if (!game) {
      body = '<div class="card empty"><h2>No game scheduled yet</h2><p class="muted">The organiser will post this week\'s game soon. Keep this link handy.</p></div>';
    } else {
      var L = lineup(game, players);
      body += '<section class="card game-card">' + gameInfoHtml(game, squad.currency) + counterHtml(L) + '</section>';

      // "Who are you?" / "Are you playing?"
      if (!me) {
        var chips = players.filter(function (p) { return p.active; }).map(function (p) {
          return '<button class="chip" data-action="pick-me" data-id="' + esc(p.id) + '">' + esc(p.name) + '</button>';
        }).join('');
        body += '<section class="card"><h2>Who are you?</h2><p class="muted small">Tap your name. We\'ll remember it on this phone.</p>' +
          '<div class="chips">' + chips + '</div>' +
          (P.joining
            ? '<form class="form inline-form" data-form="join"><input name="name" maxlength="40" placeholder="Your name" required autocomplete="off"><button class="btn primary" type="submit">Add me</button></form>'
            : '<button class="link-btn" data-action="show-join">Not on the list? Add yourself</button>') +
        '</section>';
      } else {
        var st = statusOf(L, me.id);
        var reply = L.replies[me.id];
        var current = reply && reply.status;
        var msg = '';
        if (st === 'playing') msg = '✅ You\'re playing. See you there!';
        else if (st && st.indexOf('reserve') === 0) msg = '⏳ You\'re reserve #' + st.slice(7) + '. You move up automatically if someone drops out.';
        else if (st === 'maybe') msg = '🤔 Marked as maybe. Let the lads know soon!';
        else if (st === 'out') msg = '❌ You\'re out this week.';
        else msg = 'Tap to reply. You can change your mind any time.';

        body += '<section class="card you-card">' +
          '<div class="you-head"><h2>Hi ' + esc(me.name) + '</h2><button class="link-btn" data-action="not-me">Not you?</button></div>' +
          (game.closed ? '<p class="muted">This game has finished.</p>' :
          '<div class="rsvp">' +
            rsvpButton('in', 'In', current) + rsvpButton('maybe', 'Maybe', current) + rsvpButton('out', 'Out', current) +
          '</div>') +
          '<p class="you-msg">' + msg + '</p>' +
        '</section>';
      }

      if (game.teams && game.teams.a) {
        body += '<section class="card"><h2>Teams</h2>' + teamsHtml(game.teams, L.byId) + '</section>';
      }

      body += '<section class="card lists">' +
        listSection('Playing', L.playing, { numbered: true, always: true, meId: P.me, cls: 'playing' }) +
        listSection('Reserves', L.reserves, { numbered: true, offset: L.capacity, meId: P.me, cls: 'reserves' }) +
        listSection('Maybe', L.maybe, { meId: P.me, cls: 'maybe' }) +
        listSection('Out', L.out, { meId: P.me, cls: 'out' }) +
        listSection('No reply yet', L.noReply, { meId: P.me, cls: 'noreply' }) +
      '</section>' +
      '<button class="btn whatsapp block" data-action="share">Share in WhatsApp</button>';
    }

    app.innerHTML = topbar(squad.name) + '<main class="wrap">' + body + '</main>';
  }

  function rsvpButton(value, label, current) {
    return '<button class="rsvp-btn ' + value + (current === value ? ' active' : '') + '" data-action="rsvp" data-status="' + value + '" aria-pressed="' + (current === value) + '">' + label + '</button>';
  }

  async function onPlayerClick(ev) {
    var btn = ev.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.dataset.action;
    if (action === 'pick-me') {
      P.me = btn.dataset.id;
      store.set('ts.me.' + P.code, P.me);
      renderPlayer();
    } else if (action === 'not-me') {
      P.me = null;
      store.set('ts.me.' + P.code, null);
      renderPlayer();
    } else if (action === 'show-join') {
      P.joining = true;
      renderPlayer();
      var input = app.querySelector('[data-form="join"] input');
      if (input) input.focus();
    } else if (action === 'rsvp') {
      var status = btn.dataset.status;
      // Tapping your current answer again does nothing (keeps your place).
      await attempt(btn, async function () {
        P.data = await api.call('set_response', {
          p_code: P.code, p_game: P.data.game.id, p_player: P.me, p_status: status
        });
        renderPlayer();
        pingOthers();
      });
    } else if (action === 'share') {
      var L = lineup(P.data.game, P.data.players);
      shareOrWhatsApp(whatsappMessage(P.data.squad, P.data.game, L));
    }
  }

  async function onPlayerSubmit(ev) {
    var form = ev.target.closest('[data-form="join"]');
    if (!form) return;
    ev.preventDefault();
    var name = formValues(form).name;
    await attempt(form.querySelector('button'), async function () {
      var res = await api.call('join_squad', { p_code: P.code, p_name: name });
      P.me = res.player_id;
      P.data = res.data;
      P.joining = false;
      store.set('ts.me.' + P.code, P.me);
      renderPlayer();
      pingOthers();
    });
  }

  function shareOrWhatsApp(text) {
    // On phones this opens the share sheet; otherwise straight to WhatsApp.
    if (navigator.share && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
      navigator.share({ text: text }).catch(function () { /* cancelled */ });
    } else {
      openWhatsApp(text);
    }
  }

  // ===================================================================
  //  Screen 3: Organiser page (#o=TOKEN)
  // ===================================================================

  var O = null; // organiser page state

  async function startOrganiser(token) {
    var justCreated = store.get('ts.justCreated', null) === token;
    store.set('ts.justCreated', null);
    O = {
      token: token, data: null, tab: store.get('ts.tab', 'game'), error: null,
      editingGame: false, editingPlayer: null, swapSel: null,
      historyOpen: null, historyGame: null, justCreated: justCreated,
      attendance: {} // gameId -> { playerId: true } while ticking boxes
    };
    app.innerHTML = topbar() + '<main class="wrap"><div class="loading">Loading your squad…</div></main>';
    app.onclick = onOrgClick;
    app.onsubmit = onOrgSubmit;
    app.onchange = onOrgChange;
    await loadOrganiser();
    if (O.data) startLive(O.data.squad.code, loadOrganiser);
  }

  async function loadOrganiser() {
    try {
      O.data = await api.call('admin_get', { p_token: O.token });
      O.error = null;
      rememberSquad({ code: O.data.squad.code, name: O.data.squad.name, token: O.token });
      if (O.historyOpen) O.historyGame = await api.call('admin_get_game', { p_token: O.token, p_game: O.historyOpen });
    } catch (e) {
      if (!O.data) O.error = e.message; else return;
    }
    // Don't redraw while the organiser is typing in a form.
    var typing = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) &&
                 app.contains(document.activeElement);
    if (!typing) renderOrganiser();
  }

  // After any organiser change: reload, redraw, tell the other phones.
  async function orgChanged() {
    await loadOrganiser();
    renderOrganiser();
    pingOthers();
  }

  function renderOrganiser() {
    if (O.error) {
      app.innerHTML = topbar() + '<main class="wrap"><div class="card empty"><h2>Can\'t open this squad</h2><p>' + esc(O.error) +
        '</p><a class="btn" href="' + esc(location.pathname) + '">Go home</a></div></main>';
      return;
    }
    var d = O.data;
    document.title = d.squad.name + ' · Organiser';
    var tabs = [['game', '📅', 'Game'], ['teams', '⚖️', 'Teams'], ['squad', '👥', 'Squad'], ['history', '📒', 'History']];
    var nav = '<nav class="tabbar">' + tabs.map(function (t) {
      return '<button class="' + (O.tab === t[0] ? 'active' : '') + '" data-action="tab" data-tab="' + t[0] + '">' +
        '<span class="ico">' + t[1] + '</span>' + t[2] + '</button>';
    }).join('') + '</nav>';

    var body = O.tab === 'teams' ? orgTeams() : O.tab === 'squad' ? orgSquad() : O.tab === 'history' ? orgHistory() : orgGame();
    app.innerHTML = topbar(d.squad.name, '', '<span class="badge org">Organiser</span>') +
      '<main class="wrap has-tabbar">' + welcomeHtml() + body + '</main>' + nav;
  }

  function welcomeHtml() {
    if (!O.justCreated) return '';
    return '<section class="card callout">' +
      '<h2>🎉 Squad created</h2>' +
      '<p><b>Save your organiser link.</b> It\'s the only way back into this page (there\'s no password). Bookmark it, or send it to yourself in WhatsApp.</p>' +
      '<div class="btn-row"><button class="btn primary" data-action="copy-org">Copy organiser link</button>' +
      '<button class="btn ghost" data-action="dismiss-welcome">Done</button></div>' +
      '<p class="muted small">Next: schedule a game below, then tap "Share in WhatsApp".</p>' +
    '</section>';
  }

  // ---------- Game tab ----------

  function orgGame() {
    var d = O.data, game = d.game;
    if (!game || O.editingGame) return gameForm(O.editingGame ? game : null);
    var L = lineup(game, d.players);

    var rows = [];
    function addGroup(title, entries, kind) {
      if (!entries.length) return;
      rows.push('<li class="group-title">' + esc(title) + ' <span class="muted">' + entries.length + '</span></li>');
      entries.forEach(function (e, i) {
        var r = e.reply || {};
        var payBtn = (kind === 'playing' && game.price)
          ? '<button class="pay ' + (r.paid ? 'paid' : '') + '" data-action="paid" data-id="' + esc(e.player.id) + '" data-paid="' + (r.paid ? '0' : '1') + '">' + (r.paid ? 'Paid' : 'Unpaid') + '</button>'
          : '';
        rows.push('<li class="org-row">' +
          '<span class="name">' + (kind === 'playing' || kind === 'reserve' ? '<span class="num">' + (i + 1) + '</span>' : '') + nameHtml(e.player) + '</span>' +
          payBtn +
          '<span class="mini-seg">' +
            ['in', 'maybe', 'out'].map(function (s) {
              return '<button class="' + s + (r.status === s ? ' active' : '') + '" data-action="set-status" data-id="' + esc(e.player.id) + '" data-status="' + s + '" aria-label="' + s + '">' +
                { in: '✓', maybe: '?', out: '✕' }[s] + '</button>';
            }).join('') +
          '</span></li>');
      });
    }
    addGroup('Playing', L.playing, 'playing');
    addGroup('Reserves', L.reserves, 'reserve');
    addGroup('Maybe', L.maybe, 'maybe');
    addGroup('Out', L.out, 'out');
    addGroup('No reply yet', L.noReply, 'none');

    var paidCount = L.playing.filter(function (e) { return e.reply && e.reply.paid; }).length;
    var moneyLine = game.price
      ? '<div class="paid-summary">💷 Paid ' + paidCount + '/' + L.playing.length + ' · ' +
        esc(money(paidCount * game.price, d.squad.currency)) + ' of ' + esc(money(L.playing.length * game.price, d.squad.currency)) + '</div>'
      : '';

    return '<section class="card game-card">' + gameInfoHtml(game, d.squad.currency) + counterHtml(L) +
        '<div class="btn-row">' +
          '<button class="btn whatsapp" data-action="share">Share in WhatsApp</button>' +
          '<button class="btn ghost" data-action="copy-player">Copy link</button>' +
          '<button class="btn ghost" data-action="edit-game">Edit</button>' +
        '</div>' +
      '</section>' +
      '<section class="card"><h2>Replies</h2><p class="muted small">Tap ✓ ? ✕ to answer for someone who replied in the chat.' +
        (game.price ? ' Tap Unpaid when they pay.' : '') + '</p>' + moneyLine +
        '<ul class="org-list">' + rows.join('') + '</ul>' +
      '</section>' +
      '<button class="btn ghost block" data-action="tab" data-tab="history">Game played? Log attendance →</button>';
  }

  function gameForm(game) {
    var d = O.data, last = d.history[0];
    var kickoff, venue = '', capacity = 10, price = '', note = '';
    if (game) {
      kickoff = new Date(game.kickoff); venue = game.venue || ''; capacity = game.capacity;
      price = game.price == null ? '' : game.price; note = game.note || '';
    } else if (last) {
      // Same time and place as last time, one week later.
      kickoff = new Date(new Date(last.kickoff).getTime() + 7 * 86400000);
      while (kickoff < new Date()) kickoff = new Date(kickoff.getTime() + 7 * 86400000);
      venue = last.venue || ''; capacity = last.capacity || 10; price = last.price == null ? '' : last.price;
      note = last.note || '';
    } else {
      kickoff = new Date(); kickoff.setDate(kickoff.getDate() + 1); kickoff.setHours(19, 0, 0, 0);
    }
    return '<section class="card"><h2>' + (game ? 'Edit game' : 'Schedule a game') + '</h2>' +
      (!game && !last ? '<p class="muted small">Players see this when they open your link.</p>' : '') +
      '<form class="form" data-form="game">' +
        '<label>Kick-off<input type="datetime-local" name="kickoff" required value="' + esc(toLocalInput(kickoff)) + '"></label>' +
        '<label>Venue<input name="venue" maxlength="80" placeholder="e.g. Powerleague, pitch 3" value="' + esc(venue) + '"></label>' +
        '<div class="two">' +
          '<label>Players<input type="number" name="capacity" min="2" max="30" required value="' + esc(capacity) + '"></label>' +
          '<label>Price each<input type="number" name="price" min="0" max="1000" step="0.01" inputmode="decimal" placeholder="0" value="' + esc(price) + '"></label>' +
        '</div>' +
        '<label>Note <span class="muted">(optional)</span><input name="note" maxlength="200" placeholder="e.g. Bring both shirts" value="' + esc(note) + '"></label>' +
        '<div class="btn-row">' +
          '<button class="btn primary" type="submit">' + (game ? 'Save changes' : 'Create game') + '</button>' +
          (game ? '<button class="btn ghost" type="button" data-action="cancel-edit">Cancel</button>' +
                  '<button class="btn danger-ghost" type="button" data-action="delete-game">Delete game</button>' : '') +
        '</div>' +
      '</form></section>';
  }

  // ---------- Teams tab ----------

  function orgTeams() {
    var d = O.data, game = d.game;
    if (!game) return '<div class="card empty"><h2>No game yet</h2><p class="muted">Schedule a game first, then pick teams once people are in.</p></div>';
    var L = lineup(game, d.players);
    var playing = L.playing.map(function (e) { return e.player; });
    var keepers = playing.filter(function (p) { return p.is_keeper; }).length;
    var teams = game.teams && game.teams.a ? game.teams : null;

    var html = '<section class="card"><h2>Fair teams</h2>' +
      '<p class="muted small">Balances the ' + playing.length + ' confirmed players by skill, with one keeper per side. ' +
      'Set skills and keepers in the Squad tab.</p>';
    if (keepers < 2 && playing.length >= 4) {
      html += '<p class="warn">' + (keepers === 0 ? 'No keepers' : 'Only one keeper') + ' in the confirmed players. ' +
        (keepers === 0 ? 'Teams will rotate in goal.' : 'The other side will rotate in goal.') + '</p>';
    }
    if (playing.length < 4) {
      return html + '<p class="warn">You need at least 4 confirmed players to pick teams.</p></section>';
    }

    if (!teams) {
      return html + '<button class="btn primary block" data-action="pick-teams">Pick fair teams</button></section>';
    }

    var inTeams = {};
    teams.a.concat(teams.b).forEach(function (id) { inTeams[id] = true; });
    var stale = playing.length !== teams.a.length + teams.b.length ||
                playing.some(function (p) { return !inTeams[p.id]; });

    html += (stale ? '<p class="warn">The line-up has changed since these teams were picked. Reshuffle to include everyone.</p>' : '') +
      teamsHtml(teams, L.byId, { showSkill: true, swappable: true, swapSel: O.swapSel }) +
      '<p class="muted small center">' + (O.swapSel ? 'Now tap a player on the other team to swap.' : 'Tap one player on each team to swap them.') + '</p>' +
      '<div class="btn-row">' +
        '<button class="btn" data-action="pick-teams">🔀 Reshuffle</button>' +
        (teams.published
          ? '<button class="btn ghost" data-action="publish" data-on="0">Hide from players</button>'
          : '<button class="btn primary" data-action="publish" data-on="1">Show to players</button>') +
      '</div>' +
      '<p class="muted small">' + (teams.published ? '✅ Players can see these teams on their page.' : 'Only you can see these teams for now.') + '</p>' +
    '</section>';
    return html;
  }

  // ---------- Squad tab ----------

  function orgSquad() {
    var d = O.data;
    var active = d.players.filter(function (p) { return p.active; });
    var rows = active.map(function (p) {
      if (O.editingPlayer === p.id) return '<li class="edit-row">' + playerForm(p) + '</li>';
      return '<li class="squad-row"><button class="squad-btn" data-action="edit-player" data-id="' + esc(p.id) + '">' +
        '<span class="name">' + nameHtml(p) + '</span><span class="skill-dots" title="Skill ' + p.skill + '/5">' + dots(p.skill) + '</span>' +
        '</button></li>';
    }).join('');

    return '<section class="card"><h2>Add a player</h2>' + playerForm(null) + '</section>' +
      '<section class="card"><h2>Squad <span class="muted">' + active.length + '</span></h2>' +
        '<p class="muted small">Skill is only visible to you. 1 = casual, 5 = best on the pitch. Tap a player to edit.</p>' +
        (rows ? '<ul class="squad-list">' + rows + '</ul>' : '<p class="muted">No players yet.</p>') +
      '</section>' +
      '<section class="card"><h2>Links</h2>' +
        '<p class="small"><b>Player link</b>: post this in the WhatsApp group.</p>' +
        '<div class="link-box">' + esc(playerLink(d.squad.code)) + '</div>' +
        '<div class="btn-row"><button class="btn" data-action="copy-player">Copy player link</button></div>' +
        '<p class="small"><b>Organiser link</b>: keep it secret. Anyone with it can manage the squad.</p>' +
        '<div class="btn-row"><button class="btn ghost" data-action="copy-org">Copy organiser link</button></div>' +
      '</section>';
  }

  function playerForm(p) {
    var skill = p ? p.skill : 3;
    var seg = '';
    for (var i = 1; i <= 5; i++) {
      seg += '<label class="seg-opt"><input type="radio" name="skill" value="' + i + '"' + (i === skill ? ' checked' : '') + '><span>' + i + '</span></label>';
    }
    return '<form class="form" data-form="player" data-id="' + (p ? esc(p.id) : '') + '">' +
      '<label>Name<input name="name" required maxlength="40" autocomplete="off" value="' + esc(p ? p.name : '') + '"' + (p ? '' : ' placeholder="Player name"') + '></label>' +
      '<fieldset class="seg"><legend>Skill</legend>' + seg + '</fieldset>' +
      '<label class="check"><input type="checkbox" name="is_keeper"' + (p && p.is_keeper ? ' checked' : '') + '> Plays in goal (keeper)</label>' +
      '<div class="btn-row">' +
        '<button class="btn primary" type="submit">' + (p ? 'Save' : 'Add player') + '</button>' +
        (p ? '<button class="btn ghost" type="button" data-action="cancel-player">Cancel</button>' +
             '<button class="btn danger-ghost" type="button" data-action="remove-player" data-id="' + esc(p.id) + '">Remove</button>' : '') +
      '</div></form>';
  }

  // ---------- History tab ----------

  function orgHistory() {
    var d = O.data, html = '';
    if (d.game) html += attendanceCard(d.game, true);

    // Past games
    var past = d.history.map(function (g) {
      var open = O.historyOpen === g.id;
      return '<li class="past' + (open ? ' open' : '') + '">' +
        '<button class="past-head" data-action="toggle-past" data-id="' + esc(g.id) + '">' +
          '<span><b>' + esc(fmtDay(g.kickoff)) + '</b> <span class="muted">' + esc(g.venue || '') + '</span></span>' +
          '<span class="muted small">' + g.attended + ' played' + (g.price ? ' · ' + g.paid + ' paid' : '') + '</span>' +
        '</button>' +
        (open ? (O.historyGame && O.historyGame.id === g.id ? attendanceCard(O.historyGame, false) : '<div class="loading small">Loading…</div>') : '') +
      '</li>';
    }).join('');
    html += '<section class="card"><h2>Past games</h2>' +
      (past ? '<ul class="past-list">' + past + '</ul>' : '<p class="muted">Finished games appear here after you log attendance.</p>') +
    '</section>';

    // Player stats
    var statsById = {};
    d.stats.forEach(function (s) { statsById[s.player_id] = s; });
    var totalOwed = 0;
    var rows = d.players.filter(function (p) { return p.active || (statsById[p.id] && statsById[p.id].played); })
      .map(function (p) { return { p: p, s: statsById[p.id] || { played: 0, owed_amount: 0 } }; })
      .sort(function (a, b) { return b.s.played - a.s.played || a.p.name.localeCompare(b.p.name); })
      .map(function (x) {
        var owed = Number(x.s.owed_amount) || 0;
        totalOwed += owed;
        var rate = d.closed_games ? Math.round(100 * x.s.played / d.closed_games) : 0;
        return '<tr><td>' + esc(x.p.name) + '</td><td class="num-col">' + x.s.played + '</td>' +
          '<td class="num-col"><span class="bar"><span style="width:' + rate + '%"></span></span>' + rate + '%</td>' +
          '<td class="num-col ' + (owed ? 'owes' : 'muted') + '">' + (owed ? esc(money(owed, d.squad.currency)) : '–') + '</td></tr>';
      }).join('');
    html += '<section class="card"><h2>Attendance</h2>' +
      '<p class="muted small">Over ' + d.closed_games + ' finished game' + (d.closed_games === 1 ? '' : 's') + '.' +
      (totalOwed ? ' <b class="owes">' + esc(money(totalOwed, d.squad.currency)) + ' unpaid</b>. Open a past game to mark payments.' : '') + '</p>' +
      '<div class="table-wrap"><table class="stats"><thead><tr><th>Player</th><th class="num-col">Played</th><th class="num-col">Rate</th><th class="num-col">Owes</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></section>';
    return html;
  }

  // Tick who turned up (pre-ticked with the confirmed players) + paid.
  function attendanceCard(game, isCurrent) {
    var d = O.data;
    var L = lineup(game, d.players);
    if (!O.attendance[game.id]) {
      var ids = {};
      var logged = (game.responses || []).some(function (r) { return r.attended !== null && r.attended !== undefined; });
      if (logged) (game.responses || []).forEach(function (r) { if (r.attended) ids[r.player_id] = true; });
      else L.playing.forEach(function (e) { ids[e.player.id] = true; });
      O.attendance[game.id] = ids;
    }
    var ticked = O.attendance[game.id];
    // Everyone active plus anyone who replied to this game.
    var seen = {}, list = [];
    L.playing.concat(L.reserves, L.maybe, L.out).forEach(function (e) { seen[e.player.id] = true; list.push(e.player); });
    d.players.forEach(function (p) {
      if (!seen[p.id] && (p.active || ticked[p.id])) { seen[p.id] = true; list.push(p); }
    });
    var count = Object.keys(ticked).length;

    var rows = list.map(function (p) {
      var r = L.replies[p.id] || {};
      return '<li class="att-row"><label class="check"><input type="checkbox" data-att="' + esc(p.id) + '"' + (ticked[p.id] ? ' checked' : '') + '> ' + nameHtml(p) + '</label>' +
        (game.price && ticked[p.id] ? '<button class="pay ' + (r.paid ? 'paid' : '') + '" data-action="paid" data-game="' + esc(game.id) + '" data-id="' + esc(p.id) + '" data-paid="' + (r.paid ? '0' : '1') + '">' + (r.paid ? 'Paid' : 'Unpaid') + '</button>' : '') +
      '</li>';
    }).join('');

    return '<section class="' + (isCurrent ? 'card' : 'inner') + '" data-att-game="' + esc(game.id) + '">' +
      (isCurrent ? '<h2>Log attendance</h2><p class="muted small">' + esc(fmtKickoff(game.kickoff)) +
        '. Untick anyone who didn\'t show, tick anyone who filled in.</p>' : '') +
      '<ul class="att-list">' + rows + '</ul>' +
      '<div class="btn-row">' +
        (isCurrent
          ? '<button class="btn primary" data-action="save-att" data-game="' + esc(game.id) + '" data-close="1">Save · ' + count + ' played · finish game</button>'
          : '<button class="btn" data-action="save-att" data-game="' + esc(game.id) + '" data-close="1">Save attendance (' + count + ')</button>' +
            '<button class="btn ghost" data-action="reopen" data-game="' + esc(game.id) + '">Reopen game</button>') +
      '</div></section>';
  }

  // ---------- Organiser events ----------

  async function onOrgClick(ev) {
    var btn = ev.target.closest('[data-action]');
    if (!btn) return;
    var a = btn.dataset.action, d = O.data, game = d && d.game;

    if (a === 'tab') {
      O.tab = btn.dataset.tab; O.swapSel = null; O.editingPlayer = null;
      store.set('ts.tab', O.tab);
      renderOrganiser();
      window.scrollTo(0, 0);
    } else if (a === 'dismiss-welcome') {
      O.justCreated = false; renderOrganiser();
    } else if (a === 'copy-org') {
      copyText(organiserLink(O.token), 'Organiser link');
    } else if (a === 'copy-player') {
      copyText(playerLink(d.squad.code), 'Player link');
    } else if (a === 'share') {
      shareOrWhatsApp(whatsappMessage(d.squad, game, lineup(game, d.players)));
    } else if (a === 'edit-game') {
      O.editingGame = true; renderOrganiser();
    } else if (a === 'cancel-edit') {
      O.editingGame = false; renderOrganiser();
    } else if (a === 'delete-game') {
      if (!confirm('Delete this game and all its replies?')) return;
      await attempt(btn, async function () {
        await api.call('admin_delete_game', { p_token: O.token, p_game: game.id });
        O.editingGame = false; toast('Game deleted'); await orgChanged();
      });
    } else if (a === 'set-status') {
      var cur = (lineup(game, d.players).replies[btn.dataset.id] || {}).status;
      var next = cur === btn.dataset.status ? null : btn.dataset.status; // tap again to clear
      await attempt(btn, async function () {
        await api.call('admin_set_response', { p_token: O.token, p_game: game.id, p_player: btn.dataset.id, p_status: next });
        await orgChanged();
      });
    } else if (a === 'paid') {
      await attempt(btn, async function () {
        await api.call('admin_set_paid', {
          p_token: O.token, p_game: btn.dataset.game || game.id, p_player: btn.dataset.id, p_paid: btn.dataset.paid === '1'
        });
        await orgChanged();
      });
    } else if (a === 'pick-teams') {
      var playing = lineup(game, d.players).playing.map(function (e) { return e.player; });
      var picked = window.TeamPicker.pick(playing, { avoid: game.teams && game.teams.a ? game.teams : null });
      var teams = { a: picked.a, b: picked.b, gk_a: picked.gk_a, gk_b: picked.gk_b,
                    published: Boolean(game.teams && game.teams.published) };
      O.swapSel = null;
      await saveTeams(btn, teams);
    } else if (a === 'swap') {
      var id = btn.dataset.id, t = game.teams;
      if (!O.swapSel || O.swapSel === id) {
        O.swapSel = O.swapSel === id ? null : id; renderOrganiser(); return;
      }
      var first = O.swapSel, sameTeam = (t.a.indexOf(first) >= 0) === (t.a.indexOf(id) >= 0);
      if (sameTeam) { O.swapSel = id; renderOrganiser(); return; }
      var swapped = JSON.parse(JSON.stringify(t));
      ['a', 'b'].forEach(function (k) {
        swapped[k] = swapped[k].map(function (x) { return x === first ? id : x === id ? first : x; });
      });
      // Gloves stay with the keeper: recompute which side each keeper is on.
      if (swapped.gk_a === first || swapped.gk_a === id || swapped.gk_b === first || swapped.gk_b === id) {
        var gks = [t.gk_a, t.gk_b].filter(Boolean);
        swapped.gk_a = swapped.a.filter(function (x) { return gks.indexOf(x) >= 0; })[0] || null;
        swapped.gk_b = swapped.b.filter(function (x) { return gks.indexOf(x) >= 0; })[0] || null;
      }
      O.swapSel = null;
      await saveTeams(null, swapped);
    } else if (a === 'publish') {
      var t2 = Object.assign({}, game.teams, { published: btn.dataset.on === '1' });
      await saveTeams(btn, t2);
      toast(t2.published ? 'Players can now see the teams' : 'Teams hidden');
    } else if (a === 'edit-player') {
      O.editingPlayer = btn.dataset.id; renderOrganiser();
    } else if (a === 'cancel-player') {
      O.editingPlayer = null; renderOrganiser();
    } else if (a === 'remove-player') {
      var who = d.players.filter(function (p) { return p.id === btn.dataset.id; })[0];
      if (!confirm('Remove ' + (who ? who.name : 'this player') + ' from the squad? Their history is kept.')) return;
      await attempt(btn, async function () {
        await api.call('admin_remove_player', { p_token: O.token, p_player: btn.dataset.id });
        O.editingPlayer = null; toast('Player removed'); await orgChanged();
      });
    } else if (a === 'toggle-past') {
      var gid = btn.dataset.id;
      if (O.historyOpen === gid) { O.historyOpen = null; O.historyGame = null; renderOrganiser(); return; }
      O.historyOpen = gid; O.historyGame = null; renderOrganiser();
      try {
        O.historyGame = await api.call('admin_get_game', { p_token: O.token, p_game: gid });
      } catch (e) { toast(e.message, true); O.historyOpen = null; }
      renderOrganiser();
    } else if (a === 'save-att' || a === 'reopen') {
      var gameId = btn.dataset.game;
      var ids = Object.keys(O.attendance[gameId] || {});
      var closing = a === 'save-att';
      var isCurrent = game && game.id === gameId;
      await attempt(btn, async function () {
        await api.call('admin_log_attendance', { p_token: O.token, p_game: gameId, p_attended: ids, p_close: closing });
        delete O.attendance[gameId];
        if (a === 'reopen') { O.historyOpen = null; O.historyGame = null; O.tab = 'game'; toast('Game reopened'); }
        else if (isCurrent) { O.tab = 'game'; toast('Saved. Schedule next week\'s game when ready.'); }
        else toast('Attendance saved');
        await orgChanged();
      });
    }
  }

  async function saveTeams(btn, teams) {
    await attempt(btn, async function () {
      await api.call('admin_save_teams', { p_token: O.token, p_game: O.data.game.id, p_teams: teams });
      await orgChanged();
    });
  }

  function onOrgChange(ev) {
    var box = ev.target.closest('[data-att]');
    if (!box) return;
    var card = box.closest('[data-att-game]');
    var ticks = card && O.attendance[card.dataset.attGame];
    if (!ticks) return;
    if (box.checked) ticks[box.dataset.att] = true;
    else delete ticks[box.dataset.att];
    renderOrganiser();
  }

  async function onOrgSubmit(ev) {
    var form = ev.target.closest('form[data-form]');
    if (!form) return;
    ev.preventDefault();
    var v = formValues(form), button = form.querySelector('button[type="submit"]');

    if (form.dataset.form === 'game') {
      var editing = O.editingGame && O.data.game;
      await attempt(button, async function () {
        await api.call('admin_save_game', {
          p_token: O.token, p_game: editing ? O.data.game.id : null,
          p_kickoff: new Date(v.kickoff).toISOString(), p_venue: v.venue,
          p_capacity: Number(v.capacity) || 10, p_price: v.price === '' ? null : Number(v.price), p_note: v.note
        });
        O.editingGame = false;
        toast(editing ? 'Game updated' : 'Game created. Now share it!');
        await orgChanged();
      });
    } else if (form.dataset.form === 'player') {
      await attempt(button, async function () {
        await api.call('admin_save_player', {
          p_token: O.token, p_player: form.dataset.id || null, p_name: v.name,
          p_skill: Number(v.skill) || 3, p_is_keeper: Boolean(form.querySelector('[name="is_keeper"]').checked)
        });
        toast(form.dataset.id ? 'Saved' : v.name + ' added');
        O.editingPlayer = null;
        if (document.activeElement) document.activeElement.blur();
        await orgChanged();
        if (!form.dataset.id) {
          var input = app.querySelector('form[data-form="player"][data-id=""] input[name="name"]');
          if (input) input.focus();
        }
      });
    }
  }

  // ===================================================================
  //  Start: pick the screen from the address
  // ===================================================================

  function route() {
    stopLive();
    app.onclick = app.onsubmit = app.onchange = null;
    if (!api.configured) {
      app.innerHTML = topbar() + '<main class="wrap"><div class="card empty"><h2>Almost there</h2>' +
        '<p>Teamsheet isn\'t connected to a database yet. Open <code>config.js</code> and paste your Supabase Project URL and publishable key (see README, step 3).</p></div></main>';
      return;
    }
    var hash = new URLSearchParams(location.hash.slice(1));
    var search = new URLSearchParams(location.search);
    if (hash.get('o')) return startOrganiser(hash.get('o'));
    if (search.get('s')) return startPlayer(search.get('s'));
    renderHome();
  }

  window.addEventListener('hashchange', route);
  route();
})();
