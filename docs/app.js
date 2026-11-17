/* TIPSTAT – osobná analytická appka. Dáta: docs/data/app.json (generuje GitHub Actions). */
(function () {
  'use strict';
  var D = null, RES = null, ST = {};
  var app = document.getElementById('app');
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem('tipstat_' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('tipstat_' + k, JSON.stringify(v)); } catch (e) {} }
  };
  var settings = LS.get('settings', { reserve: 5, sports: ['Futbal', 'Hokej'] });
  var SPORTS = ['Futbal', 'Hokej', 'Tenis', 'Basketbal'];
  var READY = { Futbal: true, Hokej: true };
  var ICON = {
    Futbal: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 7l4 3l-1.5 4.5h-5L8 10z',
    Hokej: 'M8 3l5.5 13H20v3h-8.5L5.5 4M3 20.5h6',
    Tenis: 'M14.5 3a6 6 0 1 0 0 12a6 6 0 1 0 0-12zM10.3 13.2L4 19.5l1.5 1.5l6.3-6.3',
    Basketbal: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM3 12h18M12 3v18'
  };

  // ---------- pomocné ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function f2(x) { return (Math.round(x * 100) / 100).toFixed(2).replace('.', ','); }
  function f1(x) { return String(Math.round(x * 10) / 10).replace('.', ','); }
  function fl(x) { return String(x).replace('.', ','); }
  function pct(k, n) { return n ? Math.round(k / n * 100) : 0; }
  function cls(v) { return v >= 80 ? 'c-hi' : (v >= 60 ? 'c-mid' : 'c-lo'); }
  function minOdds(p) { return p > 0 ? (1 / p) * (1 + settings.reserve / 100) : 99; }
  function svg(d, sz) { return '<svg width="' + (sz || 20) + '" height="' + (sz || 20) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"></path></svg>'; }
  var BACK = svg('M15 5l-7 7l7 7');
  function todayStr(off) { var d = new Date(); d.setDate(d.getDate() + (off || 0)); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  var DN = ['ne', 'po', 'ut', 'st', 'št', 'pi', 'so'];
  function dayLabel(ds) {
    if (ds === todayStr(0)) return 'Dnes'; if (ds === todayStr(1)) return 'Zajtra'; if (ds === todayStr(-1)) return 'Včera';
    var d = new Date(ds + 'T12:00:00'); return DN[d.getDay()] + ' ' + d.getDate() + '.' + (d.getMonth() + 1) + '.';
  }
  function plural(n, a, b, c) { return n === 1 ? a : (n >= 2 && n <= 4 ? b : c); }
  // pravdepodobnosť P(X > line) – negatívne binomické / Poisson
  function over(mean, disp, line) {
    if (mean <= 0) return 0;
    var k = Math.floor(line), cdf = 0, i, pmf;
    if (disp < 1e-4) { pmf = Math.exp(-mean); for (i = 0; i <= k; i++) { cdf += pmf; pmf = pmf * mean / (i + 1); } }
    else { var r = 1 / disp, p = r / (r + mean); pmf = Math.pow(p, r); for (i = 0; i <= k; i++) { cdf += pmf; pmf = pmf * (i + r) / (i + 1) * (1 - p); } }
    return Math.max(0, Math.min(1, 1 - cdf));
  }
  function upd() { var m = /(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2})/.exec(D && D.updated || ''); return m ? (+m[3]) + '. ' + (+m[2]) + '. o ' + m[4] : (D && D.updated) || ''; }
  function toast(t) { var el = document.createElement('div'); el.className = 'toast'; el.textContent = t; document.body.appendChild(el); setTimeout(function () { el.remove(); }, 1800); }

  // ---------- tiket ----------
  function ticket() { return LS.get('ticket', []); }
  function setTicket(t) { LS.set('ticket', t); }
  function tipId(m, label) { return m.id + '|' + label; }
  function inTicket(id) { return ticket().some(function (x) { return x.id === id; }); }
  function toggleTip(m, t) {
    var id = tipId(m, t.label), l = ticket();
    if (l.some(function (x) { return x.id === id; })) { setTicket(l.filter(function (x) { return x.id !== id; })); return false; }
    l.push({ id: id, mid: m.id, match: m.home + ' – ' + m.away, league: m.league, sport: m.sport, date: m.date, time: m.time, tip: t.label, cat: t.cat, p: t.p, hk: t.hk, hn: t.hn, ev: t.ev });
    setTicket(l); return true;
  }
  function chanceOf(items) {
    var by = {}; items.forEach(function (x) { (by[x.mid] = by[x.mid] || []).push(x.p); });
    var c = 1; Object.keys(by).forEach(function (k) { var ps = by[k].sort(function (a, b) { return b - a; }); c *= ps[0]; for (var i = 1; i < ps.length; i++) c *= Math.sqrt(ps[i]); });
    return c;
  }

  // ---------- dáta ----------
  function load() {
    fetch('data/app.json?t=' + Date.now()).then(function (r) { return r.json(); }).then(function (d) { D = d; LS.set('cache', d); route(); })
      .catch(function () { D = LS.get('cache', null); ST.offline = true; route(); });
  }
  function loadResults(cb) {
    if (RES) return cb();
    fetch('data/results.json?t=' + Date.now()).then(function (r) { return r.json(); }).then(function (r) { RES = r; LS.set('rescache', r); cb(); })
      .catch(function () { RES = LS.get('rescache', {}); cb(); });
  }
  function evalTip(ev, res) {
    if (!res || !ev) return null;
    if (ev.k === 'btts') { var s = res.score.split(':'); return +s[0] > 0 && +s[1] > 0; }
    var v = res.tot && res.tot[ev.c]; if (!v) return null;
    var x = ev.k === 'tot' ? v[0] + v[1] : (ev.k === 'home' ? v[0] : v[1]);
    return x > ev.l;
  }
  function actualOf(ev, res) {
    if (!res || !ev) return '';
    if (ev.k === 'btts') return 'skóre ' + res.score;
    var v = res.tot && res.tot[ev.c]; if (!v) return '';
    return 'skutočne ' + fl(ev.k === 'tot' ? v[0] + v[1] : (ev.k === 'home' ? v[0] : v[1]));
  }
  function matchById(id) { return D && D.matches.filter(function (m) { return m.id === id; })[0]; }

  // ---------- spoločné časti ----------
  function nav(active) {
    var n = ticket().length;
    var items = [['Zápasy', '#/', 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4'], ['Tipy dňa', '#/tipy', 'M13 2L4 14h7l-1 8l9-12h-7z'],
      ['Tiket', '#/tiket', 'M4 5h16v4a3 3 0 0 0 0 6v4H4v-4a3 3 0 0 0 0-6zM14 5v14'], ['Profil', '#/profil', 'M12 12a4 4 0 1 0 0-8a4 4 0 1 0 0 8zM4 21c1-4 4-6 8-6s7 2 8 6']];
    return '<nav class="nav">' + items.map(function (t) {
      return '<a href="' + t[1] + '" class="' + (t[0] === active ? 'on' : '') + '">' + svg(t[2], 22) + '<span>' + t[0] + '</span>' + (t[0] === 'Tiket' && n ? '<span class="badge">' + n + '</span>' : '') + '</a>';
    }).join('') + '</nav>';
  }
  function ticketBar() {
    var l = ticket(); if (!l.length) return '';
    var c = chanceOf(l);
    return '<a class="ticketbar" href="#/tiket"><span style="display:flex;flex-direction:column;gap:2px"><b style="font-size:14px">Môj tiket · ' + l.length + ' ' + plural(l.length, 'tip', 'tipy', 'tipov') + '</b><span class="sub">šanca ' + Math.round(c * 100) + ' % · hraj od ' + f2(minOdds(c)) + '</span></span><span class="chip c-hi" style="height:34px">Otvoriť →</span></a>';
  }
  function offlineBanner() { return ST.offline ? '<div class="banner">Bez pripojenia – zobrazujú sa uložené dáta z ' + esc(D ? upd() : '') + '.</div>' : ''; }
  function infoBtn() { return '<a href="#/info" aria-label="Čo znamenajú čísla" style="width:26px;height:26px;border-radius:13px;border:1.5px solid #4B5563;color:#4B5563;display:inline-flex;align-items:center;justify-content:center;font:italic 800 13px Georgia,serif">i</a>'; }
  function backBtn() { return '<button class="back" data-act="back" aria-label="Späť">' + BACK + '</button>'; }

  // ---------- ZÁPASY ----------
  function viewMatches() {
    var sel = ST.sports || settings.sports.slice();
    var days = ST.days || [todayStr(0)];
    var mode = ST.mode || 'prog';
    var q = (ST.q || '').toLowerCase();
    var dayList = [-1, 0, 1, 2, 3, 4, 5].map(todayStr);
    var ms = D.matches.filter(function (m) {
      if (sel.indexOf(m.sport) < 0) return false;
      if (q.length >= 2) return (m.home + ' ' + m.away + ' ' + m.league).toLowerCase().indexOf(q) >= 0;
      if (days.indexOf(m.date) < 0) return false;
      return mode === 'fin' ? m.status === 'fin' : m.status !== 'fin';
    });
    var groups = {};
    ms.forEach(function (m) { var k = m.sport + '|' + m.league; (groups[k] = groups[k] || { m: m, list: [] }).list.push(m); });
    var keys = Object.keys(groups).sort(function (a, b) { var A = groups[a].m, B = groups[b].m; return SPORTS.indexOf(A.sport) - SPORTS.indexOf(B.sport) || A.rank - B.rank; });
    var h = '<div class="top"><div class="row between"><div><div class="title">TIPSTAT</div><div class="sub">dáta aktualizované ' + esc(upd()) + '</div></div>' + infoBtnLight() + '</div>';
    h += '<input class="search" data-inp="q" placeholder="Hľadať tím alebo súťaž…" value="' + esc(ST.q || '') + '">';
    h += '<div class="seg">' + SPORTS.map(function (s) { return '<button data-act="sport" data-v="' + s + '" class="' + (sel.indexOf(s) >= 0 ? 'on' : '') + '">' + s + (READY[s] ? '' : ' · čoskoro') + '</button>'; }).join('') + '</div>';
    h += '<div class="seg">' + dayList.map(function (d) { return '<button data-act="day" data-v="' + d + '" class="' + (days.indexOf(d) >= 0 ? 'on' : '') + '">' + dayLabel(d) + '</button>'; }).join('') + '</div>';
    h += '<div class="seg"><button data-act="mode" data-v="prog" class="' + (mode === 'prog' ? 'on' : '') + '">Program</button><button data-act="mode" data-v="fin" class="' + (mode === 'fin' ? 'on' : '') + '">Dohrané</button></div></div>';
    h += '<div class="main">' + offlineBanner();
    if (D.log && D.log.length) h += '<div class="banner">' + D.log.map(esc).join('<br>') + '</div>';
    sel.forEach(function (s) { if (!READY[s]) h += '<div class="banner">' + s + ' pribudne v ďalšej verzii.</div>'; });
    if (!keys.length) h += '<div class="card empty">' + (q.length >= 2 ? 'Nič sa nenašlo.' : 'Pre zvolené dni a športy nie sú žiadne zápasy.') + '</div>';
    keys.forEach(function (k) {
      var g = groups[k];
      h += '<div class="card"><div class="chead"><span class="row" style="gap:6px">' + svg(ICON[g.m.sport], 16) + esc((g.m.country ? g.m.country + ': ' : '') + g.m.league) + '</span><span class="tiny">' + g.list.length + '</span></div>';
      g.list.forEach(function (m) { h += matchRow(m, days.length > 1 || q.length >= 2); });
      h += '</div>';
    });
    h += '</div>' + ticketBar() + nav('Zápasy');
    return h;
  }
  function infoBtnLight() { return '<a href="#/info" aria-label="Čo znamenajú čísla" style="width:30px;height:30px;border-radius:15px;border:1.5px solid #B8C4D0;color:#B8C4D0;display:inline-flex;align-items:center;justify-content:center;font:italic 800 14px Georgia,serif">i</a>'; }
  function matchRow(m, showDay) {
    var t = m.time || '–';
    var left = '<div class="mt">' + (showDay ? '<div class="tiny">' + dayLabel(m.date) + '</div>' : '') + esc(t) + '</div>';
    var body, right = '';
    if (m.status === 'fin') {
      var e = m.topEval && m.topEval[0];
      body = '<div class="mb"><span class="tn">' + esc(m.home) + ' – ' + esc(m.away) + '</span><span class="small">' + (e ? 'tip č. 1: ' + esc(e.label) : 'koniec zápasu') + '</span></div>';
      right = '<span class="chip c-lo" style="font-size:14px">' + esc(m.score) + '</span>' + (e && e.ok !== null ? '<span class="chip ' + (e.ok ? 'c-ok' : 'c-no') + '" style="min-width:34px">' + (e.ok ? '✓' : '✗') + '</span>' : '');
      return '<div class="m" style="' + (e && e.ok !== null ? (e.ok ? 'background:#F1FBF1' : 'background:#FEF4F4') : '') + '">' + left + body + right + '</div>';
    }
    if (!m.hasData) {
      body = '<a class="mb" href="#/zapas/' + encodeURIComponent(m.id) + '"><span class="tn">' + esc(m.home) + ' – ' + esc(m.away) + '</span><span class="small">málo dát na analýzu</span></a>';
      return '<div class="m">' + left + body + '<span class="chip c-lo" style="font-size:11px">len výsledky</span></div>';
    }
    var tp = m.top && m.top[0];
    body = '<a class="mb" href="#/zapas/' + encodeURIComponent(m.id) + '"><span class="tn">' + esc(m.home) + ' – ' + esc(m.away) + '</span>' +
      (tp ? '<span class="small"><b style="color:#111827">' + esc(tp.label) + '</b> · vyšlo ' + tp.hk + '/' + tp.hn + ' · od ' + f2(minOdds(tp.p)) + '</span>' : '<span class="small">bez silného tipu</span>') + '</a>';
    if (tp) { var on = inTicket(tipId(m, tp.label)); right = '<span class="chip ' + cls(tp.hv) + '">' + tp.hv + ' %</span><button class="add' + (on ? ' on' : '') + '" data-act="add" data-m="' + esc(m.id) + '" data-t="' + esc(tp.label) + '" aria-label="' + (on ? 'Odobrať z tiketu' : 'Pridať na tiket') + '">' + (on ? '✓' : '+ Tip') + '</button>'; }
    return '<div class="m">' + left + body + right + '</div>';
  }

  // ---------- DETAIL ZÁPASU ----------
  function viewMatch(id) {
    var m = matchById(id);
    if (!m) return '<div class="top"><div class="row">' + backBtn() + '<div class="title">Zápas</div></div></div><div class="main"><div class="card empty">Zápas sa nenašiel – možno už nie je v aktuálnych dátach.</div></div>' + nav('Zápasy');
    var tab = ST.tab || 'Tipy';
    var lab = m.sport === 'Hokej' ? ['domáci', 'predĺženie', 'hostia'] : ['domáci', 'remíza', 'hostia'];
    var h = '<div class="top"><div class="row">' + backBtn() + '<div style="flex:1;text-align:center" class="sub">' + esc((m.country ? m.country + ': ' : '') + m.league) + '</div><div style="width:44px"></div></div>';
    h += '<div class="row between" style="align-items:flex-start"><div style="flex:1;text-align:center;font-weight:800;font-size:16px">' + esc(m.home) + '</div><div style="text-align:center"><div style="font-size:24px;font-weight:800">' + esc(m.status === 'fin' ? m.score : (m.time || '–')) + '</div><div class="sub">' + dayLabel(m.date) + '</div></div><div style="flex:1;text-align:center;font-weight:800;font-size:16px">' + esc(m.away) + '</div></div>';
    if (m.probs) {
      var p = m.probs;
      h += '<div><div class="bar"><span style="flex:' + p.h + ';background:#E8343B"></span><span style="flex:' + p.d + ';background:#9DB3CC"></span><span style="flex:' + p.a + ';background:#4A8FE7"></span></div><div class="row between" style="font-size:12px;font-weight:700;margin-top:5px"><span>' + lab[0] + ' ' + p.h + ' %</span><span style="color:#B8C4D0">' + lab[1] + ' ' + p.d + ' %</span><span>' + lab[2] + ' ' + p.a + ' %</span></div></div>';
    }
    h += '<div class="sub" style="text-align:center;font-size:11px">dáta ' + esc(upd()) + '</div>';
    if (m.hasData) h += '<div class="tabs">' + ['Tipy', 'Štatistiky', 'Forma a H2H'].map(function (t) { return '<button data-act="tab" data-v="' + t + '" class="' + (tab === t ? 'on' : '') + '">' + t + '</button>'; }).join('') + '</div>';
    h += '</div><div class="main">';
    if (!m.hasData) h += '<div class="card empty">Pre tento zápas nemáme dosť dát na analýzu (napríklad málo odohraných zápasov alebo súťaž bez štatistík). Zobrazujeme len program a výsledok.</div>';
    else if (tab === 'Tipy') h += tipsTab(m);
    else if (tab === 'Štatistiky') h += statsTab(m);
    else h += formTab(m);
    h += '</div>' + ticketBar() + nav('Zápasy');
    return h;
  }
  function splitWhy(m, t) {
    var d = m.data[t.cat]; if (!d || !t.ev) return '';
    var L = t.ev.l;
    if (t.ev.k === 'tot') { var a = d.hv.filter(function (v) { return v > L; }).length, b = d.av.filter(function (v) { return v > L; }).length; return esc(m.home) + ' doma: ' + a + ' z ' + d.hv.length + ' · ' + esc(m.away) + ' vonku: ' + b + ' z ' + d.av.length + '.'; }
    if (t.ev.k === 'home') return esc(m.home) + ' doma dal(a) viac ako ' + fl(L) + ' v ' + t.hk + ' z ' + t.hn + ' zápasov.';
    if (t.ev.k === 'away') return esc(m.away) + ' vonku dal(a) viac ako ' + fl(L) + ' v ' + t.hk + ' z ' + t.hn + ' zápasov.';
    return 'Vyšlo v ' + t.hk + ' z ' + t.hn + ' zápasov.';
  }
  function h2hWarn(t) {
    if (!t.h2h || t.h2h[1] < 3) return '';
    var hp = pct(t.h2h[0], t.h2h[1]);
    var txt = 'Vzájomné zápasy: ' + t.h2h[0] + ' z ' + t.h2h[1] + ' (' + hp + ' %).';
    if (Math.abs(hp - t.hv) >= 30) return '<div class="warn">' + (hp < t.hv ? 'Pozor na H2H: ' : 'H2H je ešte silnejšie: ') + txt + '</div>';
    return '<div class="note">' + txt + '</div>';
  }
  function tipsTab(m) {
    var h = '<div class="row between"><span class="h">TOP 5 tipov na zápas</span>' + infoBtn() + '</div>';
    if (!m.top.length) h += '<div class="card empty">Žiadny tip nespĺňa podmienky.</div>';
    m.top.forEach(function (t, i) {
      var on = inTicket(tipId(m, t.label));
      h += '<div class="card tip"><div class="row" style="align-items:flex-start"><span class="rank">' + (i + 1) + '</span><div style="flex:1;display:flex;flex-direction:column;gap:3px"><span class="tiny" style="font-weight:800;text-transform:uppercase">' + esc(t.cat) + '</span><b style="font-size:16px">' + esc(t.label) + '</b><span class="small" style="color:#1F2A37;font-weight:700">vyšlo v ' + t.hk + ' z ' + t.hn + ' zápasov</span><span class="small">hraj od kurzu ' + f2(minOdds(t.p)) + '</span></div><span class="chip ' + cls(t.hv) + '" style="height:30px;font-size:16px">' + t.hv + ' %</span></div>';
      h += '<div class="note">' + splitWhy(m, t) + '</div>' + h2hWarn(t);
      h += '<button class="btn' + (on ? ' dark' : '') + '" data-act="add" data-m="' + esc(m.id) + '" data-t="' + esc(t.label) + '">' + (on ? '✓ Na tikete' : '+ Pridať tip') + '</button></div>';
    });
    h += customTip(m);
    var ids = m.top.map(function (t) { return t.label; });
    var others = m.tips.filter(function (t) { return ids.indexOf(t.label) < 0; });
    h += '<span class="h">Ostatné tipy · podľa %</span><div class="card">' + others.map(function (t) {
      var on = inTicket(tipId(m, t.label));
      return '<div class="m"><div class="mb"><span class="tn" style="white-space:normal">' + esc(t.label) + '</span><span class="tiny">' + esc(t.cat) + ' · vyšlo v ' + t.hk + ' z ' + t.hn + ' · hraj od ' + f2(minOdds(t.p)) + '</span></div><span class="chip ' + cls(t.hv) + '">' + t.hv + ' %</span><button class="add' + (on ? ' on' : '') + '" data-act="add" data-m="' + esc(m.id) + '" data-t="' + esc(t.label) + '">' + (on ? '✓' : '+ Tip') + '</button></div>';
    }).join('') + '</div>';
    return h;
  }
  function customTip(m) {
    var cats = Object.keys(m.data); if (!cats.length) return '';
    var c = ST.cCat && m.data[ST.cCat] ? ST.cCat : cats[0], d = m.data[c];
    var team = ST.cTeam || 'all';
    var key = m.id + c + team;
    var def = team === 'all' ? d.line : Math.max(0.5, Math.floor(d.line / 2) + 0.5);
    var L = ST.cLine && ST.cLine[key] != null ? ST.cLine[key] : def;
    var arr = team === 'all' ? d.hv.concat(d.av) : (team === 'h' ? d.hOwn : d.aOwn);
    var over_ = arr.filter(function (v) { return v > L; }).length, n = arr.length;
    var h2 = team === 'all' ? d.h2h : [];
    var h2o = h2.filter(function (v) { return v > L; }).length;
    var mean = team === 'all' ? d.mh + d.ma : (team === 'h' ? d.mh : d.ma);
    var disp = team === 'all' ? d.disp : d.disp * 1.3;
    var pO = over(mean, disp, L), pU = 1 - pO;
    var who = team === 'all' ? '' : (team === 'h' ? m.home : m.away) + ' ';
    var ev = { k: team === 'all' ? 'tot' : (team === 'h' ? 'home' : 'away'), c: c, l: L };
    function side(label, k, p, isOver) {
      var t = { cat: c, label: who + label + ' ' + d.unit, p: p, hk: k, hn: n, ev: isOver ? ev : null };
      var on = inTicket(tipId(m, t.label)), v = pct(k, n);
      return '<div class="card pad" style="display:flex;flex-direction:column;gap:6px"><span class="small" style="font-weight:700;color:#374151">' + label + '</span><span class="chip ' + cls(v) + '" style="align-self:flex-start;height:30px;font-size:17px">' + v + ' %</span><span class="tiny">vyšlo ' + k + ' z ' + n + (h2.length ? ' · H2H ' + (isOver ? h2o : h2.length - h2o) + ' z ' + h2.length : '') + ' · hraj od ' + f2(minOdds(Math.max(p, 0.01))) + '</span>' +
        (isOver ? '<button class="btn' + (on ? ' dark' : '') + '" style="height:40px" data-act="addc" data-m="' + esc(m.id) + '" data-c="' + esc(c) + '" data-team="' + team + '" data-l="' + L + '">' + (on ? '✓ Na tikete' : '+ Pridať') + '</button>' : '<span class="tiny">„menej ako“ si zapíš ručne</span>') + '</div>';
    }
    var h = '<span class="h">Vytvor si vlastný tip</span>';
    h += '<div class="chips">' + cats.map(function (k) { return '<button data-act="ccat" data-v="' + esc(k) + '" class="' + (k === c ? 'on' : '') + '">' + esc(k) + '</button>'; }).join('') + '</div>';
    h += '<div class="seg light"><button data-act="cteam" data-v="all" class="' + (team === 'all' ? 'on' : '') + '">Zápas spolu</button><button data-act="cteam" data-v="h" class="' + (team === 'h' ? 'on' : '') + '">' + esc(m.home) + '</button><button data-act="cteam" data-v="a" class="' + (team === 'a' ? 'on' : '') + '">' + esc(m.away) + '</button></div>';
    h += '<div class="card pad" style="display:flex;flex-direction:column;gap:10px"><div class="line"><button class="step" data-act="cline" data-k="' + esc(key) + '" data-v="' + (L - 1) + '" aria-label="Znížiť">−</button><div style="flex:1;text-align:center"><div style="font-size:28px;font-weight:800">' + fl(L) + '</div><div class="tiny">' + esc(c) + ' · nastav čiaru podľa stávkovky</div></div><button class="step" data-act="cline" data-k="' + esc(key) + '" data-v="' + (L + 1) + '" aria-label="Zvýšiť">+</button></div>';
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' + side('Viac ako ' + fl(L), over_, pO, true) + side('Menej ako ' + fl(L), n - over_, pU, false) + '</div>';
    if (h2.length >= 3 && Math.abs(pct(h2o, h2.length) - pct(over_, n)) >= 30) h += '<div class="warn">Vzájomné zápasy sa líšia od formy: H2H ' + pct(h2o, h2.length) + ' %, forma ' + pct(over_, n) + ' %.</div>';
    h += '</div>';
    return h;
  }
  function statsTab(m) {
    var per = ST.per || 10;
    var h = '<div class="seg light"><button data-act="per" data-v="5" class="' + (per === 5 ? 'on' : '') + '">Posledných 5</button><button data-act="per" data-v="10" class="' + (per === 10 ? 'on' : '') + '">Posledných 10</button></div>';
    h += '<div class="small">' + esc(m.home) + ' – zápasy doma, ' + esc(m.away) + ' – zápasy vonku.</div>';
    h += '<div class="card"><div class="chead"><span>' + esc(m.home) + '</span><span class="tiny">priemer</span><span>' + esc(m.away) + '</span></div>';
    function avg(a) { a = a.slice(0, per); return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : 0; }
    Object.keys(m.data).forEach(function (c) {
      var d = m.data[c];
      [['dáva', d.hOwn, d.aOwn], ['dostáva', d.hAg, d.aAg]].forEach(function (r) {
        var a = avg(r[1]), b = avg(r[2]), mx = Math.max(a, b, 0.01);
        h += '<div class="scale"><div class="row between"><b style="width:50px">' + f1(a) + '</b><span style="font-size:13px;font-weight:800;text-align:center">' + esc(c) + ' – ' + r[0] + '</span><b style="width:50px;text-align:right">' + f1(b) + '</b></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px"><div class="track" style="justify-content:flex-end"><div style="width:' + Math.round(a / mx * 100) + '%;background:#0D1B2A;border-radius:3px"></div></div><div class="track"><div style="width:' + Math.round(b / mx * 100) + '%;background:#7BA7D9;border-radius:3px"></div></div></div>' + (r[0] === 'dáva' ? '<span class="tiny" style="text-align:center">priemer ligy na tím ' + f1(d.lg / 2) + '</span>' : '') + '</div>';
      });
    });
    h += '</div>';
    return h;
  }
  function formTab(m) {
    var h = '';
    [['h', m.home], ['a', m.away]].forEach(function (x) {
      var f = (m.form && m.form[x[0]]) || [];
      var w = f.filter(function (r) { return r[0] === 'V'; }).length, d = f.filter(function (r) { return r[0] === 'R'; }).length;
      h += '<div class="card"><div class="chead"><span>' + esc(x[1]) + '</span><span class="tiny">' + w + 'V ' + d + (m.sport === 'Hokej' ? 'PP ' : 'R ') + (f.length - w - d) + 'P · posledných ' + f.length + '</span></div>';
      f.forEach(function (r) {
        h += '<div class="m" style="min-height:46px"><b class="chip ' + (r[0] === 'V' ? 'c-ok' : (r[0] === 'P' ? 'c-no' : 'c-mid')) + '" style="min-width:30px">' + r[0] + '</b><div class="mb"><span class="tn" style="font-size:13px">' + (r[4] === 'D' ? 'doma' : 'vonku') + ' · ' + esc(r[2]) + '</span><span class="tiny">' + esc(r[3]) + '</span></div><b style="padding-right:8px">' + esc(r[1]) + '</b></div>';
      });
      h += '</div>';
    });
    h += '<div class="card"><div class="chead"><span>Vzájomné zápasy</span><span class="tiny">' + (m.h2h || []).length + '</span></div>';
    if (!m.h2h || !m.h2h.length) h += '<div class="empty">Tímy spolu v posledných sezónach nehrali.</div>';
    (m.h2h || []).forEach(function (r) { h += '<div class="m" style="min-height:46px"><span class="tiny" style="width:74px">' + esc(r[0]) + '</span><span style="flex:1;text-align:right;font-size:13px">' + esc(r[1]) + '</span><b class="chip c-lo">' + esc(r[3]) + '</b><span style="flex:1;font-size:13px">' + esc(r[2]) + '</span></div>'; });
    h += '</div>';
    return h;
  }

  // ---------- TIPY DŇA ----------
  function allTips(day) {
    var out = [];
    D.matches.forEach(function (m) {
      if (m.status !== 'upc' || !m.hasData) return;
      if (day === 'dnes' && m.date !== todayStr(0)) return;
      if (day === 'zajtra' && m.date !== todayStr(1)) return;
      if (day === 'dalsie' && m.date <= todayStr(1)) return;
      m.top.forEach(function (t) { out.push({ m: m, t: t }); });
    });
    return out;
  }
  function viewDaily() {
    var day = ST.dday || 'dnes';
    var target = ST.target || 3, maxN = ST.maxN || 4;
    var sp = ST.dsports || settings.sports.slice();
    var minP = ST.minP || 70;
    var all = allTips(day).filter(function (x) { return sp.indexOf(x.m.sport) >= 0; });
    // návrh tiketu: najlepší tip z každého zápasu, zoradené podľa šance modelu
    var best = {};
    all.forEach(function (x) { var b = best[x.m.id]; if (!b || x.t.p > b.t.p) best[x.m.id] = x; });
    var cand = Object.keys(best).map(function (k) { return best[k]; }).sort(function (a, b) { return b.t.p - a.t.p || b.t.hv - a.t.hv; });
    var pick = [], odds = 1;
    for (var i = 0; i < cand.length && pick.length < maxN && odds < target; i++) { pick.push(cand[i]); odds *= 1 / cand[i].t.p; }
    var ok = odds >= target;
    var chance = pick.reduce(function (c, x) { return c * x.t.p; }, 1);
    var h = '<div class="top"><div class="row">' + backBtn() + '<div><div class="title">Tipy dňa</div><div class="sub">' + Object.keys(best).length + ' zápasov s tipmi</div></div></div>';
    h += '<div class="seg">' + [['dnes', 'Dnes'], ['zajtra', 'Zajtra'], ['dalsie', 'Ďalšie dni']].map(function (x) { return '<button data-act="dday" data-v="' + x[0] + '" class="' + (day === x[0] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div></div>';
    h += '<div class="main">' + offlineBanner();
    h += '<div class="card" style="border-color:#0D1B2A"><div style="background:#0D1B2A;color:#fff;padding:12px"><b style="font-size:16px">Postav mi tiket</b><div class="sub">Zvoľ kurz a appka zloží tiket s najvyššou šancou.</div></div><div class="pad" style="display:flex;flex-direction:column;gap:10px">';
    h += '<span class="tiny" style="font-weight:800;text-transform:uppercase">Cieľový kurz</span><div class="chips">' + [1.5, 2, 3, 5, 10].map(function (v) { return '<button data-act="target" data-v="' + v + '" class="' + (target === v ? 'on' : '') + '">' + fl(v) + '</button>'; }).join('') + '</div>';
    h += '<span class="tiny" style="font-weight:800;text-transform:uppercase">Najviac zápasov</span><div class="line"><button class="step" data-act="maxn" data-v="' + Math.max(1, maxN - 1) + '">−</button><b style="font-size:22px;min-width:40px;text-align:center">' + maxN + '</b><button class="step" data-act="maxn" data-v="' + Math.min(10, maxN + 1) + '">+</button></div>';
    h += '<span class="tiny" style="font-weight:800;text-transform:uppercase">Športy</span><div class="chips">' + SPORTS.filter(function (s) { return READY[s]; }).map(function (s) { return '<button data-act="dsport" data-v="' + s + '" class="' + (sp.indexOf(s) >= 0 ? 'on' : 'off') + '">' + s + '</button>'; }).join('') + '</div>';
    if (!pick.length) h += '<div class="empty">Na zvolený deň nie sú tipy.</div>';
    else {
      h += '<div class="card">' + pick.map(function (x) { return '<div class="m"><div class="mb"><span class="tn" style="white-space:normal">' + esc(x.t.label) + '</span><span class="tiny">' + esc(x.m.home + ' – ' + x.m.away) + ' · ' + dayLabel(x.m.date) + ' ' + esc(x.m.time) + '</span></div><span class="chip ' + cls(x.t.hv) + '">' + x.t.hv + ' %</span></div>'; }).join('') + '</div>';
      h += '<div class="kpis"><div class="kpi"><b>' + Math.round(chance * 100) + ' %</b><span class="tiny">šanca</span></div><div class="kpi"><b>' + f2(odds) + '</b><span class="tiny">férový kurz</span></div><div class="kpi"><b>' + pick.length + '</b><span class="tiny">zápasov</span></div></div>';
      if (!ok) h += '<div class="warn">Kurz ' + fl(target) + ' sa s najviac ' + maxN + ' zápasmi nedá dosiahnuť – pridaj zápasy alebo zníž kurz.</div>';
      h += '<button class="btn pri" data-act="addbuilt">Pridať na tiket (' + pick.length + ')</button>';
      ST._pick = pick;
    }
    h += '</div></div>';
    var list = all.filter(function (x) { return x.t.hv >= minP; }).sort(function (a, b) { return b.t.hv - a.t.hv || b.t.p - a.t.p; });
    h += '<div class="row between"><span class="h">Najsilnejšie tipy · ' + list.length + '</span>' + infoBtn() + '</div>';
    h += '<div class="chips">' + [60, 70, 80, 90].map(function (v) { return '<button data-act="minp" data-v="' + v + '" class="' + (minP === v ? 'on' : '') + '">od ' + v + ' %</button>'; }).join('') + '</div>';
    h += '<div class="card">' + (list.length ? list.slice(0, 60).map(function (x) {
      var on = inTicket(tipId(x.m, x.t.label));
      return '<div class="m"><a class="mb" href="#/zapas/' + encodeURIComponent(x.m.id) + '"><span class="tn" style="white-space:normal">' + esc(x.t.label) + '</span><span class="tiny">' + esc(x.m.home + ' – ' + x.m.away) + ' · ' + esc(x.m.time) + ' · vyšlo ' + x.t.hk + '/' + x.t.hn + ' · od ' + f2(minOdds(x.t.p)) + '</span></a><span class="chip ' + cls(x.t.hv) + '">' + x.t.hv + ' %</span><button class="add' + (on ? ' on' : '') + '" data-act="add" data-m="' + esc(x.m.id) + '" data-t="' + esc(x.t.label) + '">' + (on ? '✓' : '+ Tip') + '</button></div>';
    }).join('') : '<div class="empty">Žiadne tipy nad zvolenú hranicu.</div>') + '</div>';
    h += '</div>' + ticketBar() + nav('Tipy dňa');
    return h;
  }

  // ---------- TIKET ----------
  function placed() { return LS.get('placed', []); }
  function itemState(x) {
    var r = RES && RES[x.mid];
    if (!r) return { st: 'wait', txt: 'čaká na zápas' };
    var ok = evalTip(x.ev, r);
    if (ok === null) return { st: 'na', txt: 'nedá sa vyhodnotiť automaticky' };
    return { st: ok ? 'ok' : 'no', txt: (ok ? '✓ vyšiel' : '✗ nevyšiel') + ' · ' + actualOf(x.ev, r) };
  }
  function ticketState(t) {
    var s = t.items.map(itemState);
    if (s.some(function (x) { return x.st === 'no'; })) return 'no';
    if (s.every(function (x) { return x.st === 'ok'; })) return 'ok';
    return 'wait';
  }
  function viewTicket() {
    var tab = ST.ttab || 'akt';
    var h = '<div class="top"><div class="row">' + backBtn() + '<div><div class="title">Tiket</div><div class="sub">' + ticket().length + ' ' + plural(ticket().length, 'tip', 'tipy', 'tipov') + ' na aktuálnom tikete</div></div></div>';
    h += '<div class="seg">' + [['akt', 'Aktuálny'], ['bet', 'Stavené'], ['track', 'Sledované'], ['hist', 'Vyhodnotené']].map(function (x) { return '<button data-act="ttab" data-v="' + x[0] + '" class="' + (tab === x[0] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div></div><div class="main">';
    if (tab === 'akt') h += currentTicket();
    else if (tab === 'hist') h += histView();
    else h += placedList(tab);
    h += '</div>' + nav('Tiket');
    return h;
  }
  function currentTicket() {
    var l = ticket();
    if (!l.length) return '<div class="card empty">Tiket je prázdny.<br>Tipy pridáš tlačidlom <b>+ Tip</b> pri zápasoch, v detaile zápasu alebo v Tipoch dňa.</div>';
    var by = {}, order = [];
    l.forEach(function (x) { if (!by[x.mid]) { by[x.mid] = []; order.push(x.mid); } by[x.mid].push(x); });
    var h = '';
    order.forEach(function (mid) {
      var g = by[mid], f = g[0];
      h += '<div class="card"><div class="chead"><a href="#/zapas/' + encodeURIComponent(mid) + '">' + esc(f.match) + '</a><span class="tiny">' + (g.length > 1 ? 'Bet Builder · ' : '') + dayLabel(f.date) + ' ' + esc(f.time) + '</span></div>';
      g.forEach(function (x) { h += '<div class="m"><div class="mb"><span class="tn" style="white-space:normal">' + esc(x.tip) + '</span><span class="tiny">' + esc(x.cat) + ' · vyšlo ' + x.hk + ' z ' + x.hn + ' · hraj od ' + f2(minOdds(x.p)) + '</span></div><span class="chip ' + cls(pct(x.hk, x.hn)) + '">' + pct(x.hk, x.hn) + ' %</span><button class="add" data-act="rm" data-id="' + esc(x.id) + '" aria-label="Odstrániť">✕</button></div>'; });
      if (g.length > 1) h += '<div class="tiny" style="padding:8px 12px;border-top:1px solid #EEF1F4">Tipy z jedného zápasu spolu súvisia – spoločná šanca je odhad.</div>';
      h += '</div>';
    });
    var c = chanceOf(l);
    h += '<div class="card pad" style="display:flex;flex-direction:column;gap:10px"><div class="row between"><span class="h" style="padding:0">Súhrn tiketu</span>' + infoBtn() + '</div><div class="kpis"><div class="kpi"><b>' + Math.round(c * 100) + ' %</b><span class="tiny">šanca (odhad)</span></div><div class="kpi"><b>' + f2(1 / c) + '</b><span class="tiny">férový kurz</span></div><div class="kpi"><b>' + f2(minOdds(c)) + '</b><span class="tiny">hraj od</span></div></div>';
    h += '<input class="inp" type="number" inputmode="decimal" min="0" step="0.5" placeholder="Vklad v € (nepovinné)" data-inp="stake" value="' + esc(ST.stake || '') + '">';
    var st = parseFloat(String(ST.stake || '').replace(',', '.')) || 0;
    if (st > 0) h += '<div class="small">Pri kurze ' + f2(minOdds(c)) + ' by výhra bola <b>' + f2(st * minOdds(c)) + ' €</b>.</div>';
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="btn" data-act="place" data-v="track">Sledovať</button><button class="btn pri" data-act="place" data-v="bet">Staviť</button></div><button class="btn" style="border-color:#DDE2E8;color:#B91C1C" data-act="clear">Vymazať tiket</button></div>';
    return h;
  }
  function placedList(mode) {
    var l = placed().filter(function (t) { return t.mode === mode && ticketState(t) === 'wait'; });
    if (!l.length) return '<div class="card empty">' + (mode === 'bet' ? 'Žiadne stavené tikety čakajúce na výsledok.' : 'Žiadne sledované tikety čakajúce na výsledok.') + '</div>';
    return l.map(ticketCard).join('');
  }
  function ticketCard(t) {
    var s = ticketState(t);
    var open = ST.open === t.no;
    var h = '<div class="card" style="' + (s === 'ok' ? 'background:#F1FBF1' : (s === 'no' ? 'background:#FEF4F4' : '')) + '"><button data-act="open" data-v="' + t.no + '" style="width:100%;border:none;background:transparent;display:flex;align-items:center;gap:10px;padding:12px;text-align:left">';
    h += '<span class="chip ' + (s === 'ok' ? 'c-ok' : (s === 'no' ? 'c-no' : 'c-lo')) + '" style="min-width:34px">' + (s === 'ok' ? '✓' : (s === 'no' ? '✗' : '…')) + '</span><span class="mb"><b>Tiket #' + t.no + '</b><span class="tiny">' + esc(t.created) + ' · ' + t.items.length + ' ' + plural(t.items.length, 'tip', 'tipy', 'tipov') + '</span></span>';
    var prof = s === 'ok' ? t.stake * t.odds - t.stake : (s === 'no' ? -t.stake : 0);
    h += '<b style="' + (s === 'ok' ? 'color:#166534' : (s === 'no' ? 'color:#B91C1C' : '')) + '">' + (s === 'wait' ? 'kurz ' + f2(t.odds) : (t.stake ? (prof >= 0 ? '+' : '−') + f2(Math.abs(prof)) + ' €' : (s === 'ok' ? 'vyšiel' : 'nevyšiel'))) + '</b></button>';
    if (open) {
      h += '<div class="tiny" style="padding:0 12px 8px">' + (t.mode === 'bet' ? 'Stavený' : 'Sledovaný') + ' · kurz ' + f2(t.odds) + (t.stake ? ' · vklad ' + f2(t.stake) + ' €' : '') + ' · šanca ' + Math.round(t.chance * 100) + ' %</div>';
      t.items.forEach(function (x) { var is = itemState(x); h += '<div class="m" style="min-height:48px;' + (is.st === 'ok' ? 'background:#F1FBF1' : (is.st === 'no' ? 'background:#FEF4F4' : '')) + '"><b style="width:18px;color:' + (is.st === 'ok' ? '#166534' : (is.st === 'no' ? '#B91C1C' : '#6B7280')) + '">' + (is.st === 'ok' ? '✓' : (is.st === 'no' ? '✗' : '○')) + '</b><div class="mb"><span class="tn" style="white-space:normal;font-size:13px">' + esc(x.match) + ': ' + esc(x.tip) + '</span><span class="tiny">' + esc(is.txt) + '</span></div></div>'; });
      if (s === 'wait') h += '<div style="padding:8px 12px"><button class="btn" style="width:100%;height:40px;border-color:#DDE2E8;color:#B91C1C" data-act="delplaced" data-v="' + t.no + '">Odstrániť tiket</button></div>';
    }
    return h + '</div>';
  }
  function histView() {
    var fm = ST.hmode || 'all', fr = ST.hres || 'all';
    var l = placed().filter(function (t) { return ticketState(t) !== 'wait' && (fm === 'all' || t.mode === fm); });
    var h = '<div class="seg light">' + [['all', 'Všetky'], ['bet', 'Stavené'], ['track', 'Sledované']].map(function (x) { return '<button data-act="hmode" data-v="' + x[0] + '" class="' + (fm === x[0] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div>';
    if (!l.length) return h + '<div class="card empty">Zatiaľ nemáš vyhodnotené tikety. Po skončení zápasov sa tu objavia samé.</div>';
    var won = l.filter(function (t) { return ticketState(t) === 'ok'; });
    var staked = l.reduce(function (s, t) { return s + (t.stake || 0); }, 0);
    var ret = won.reduce(function (s, t) { return s + (t.stake || 0) * t.odds; }, 0);
    var tips = [], bySport = {}, byCat = {};
    l.forEach(function (t) { t.items.forEach(function (x) { var s = itemState(x); if (s.st !== 'ok' && s.st !== 'no') return; var ok = s.st === 'ok'; tips.push(ok); [[bySport, x.sport], [byCat, x.cat]].forEach(function (p) { var o = p[0][p[1]] = p[0][p[1]] || [0, 0]; o[1]++; if (ok) o[0]++; }); }); });
    h += '<div class="kpis"><div class="kpi"><b>' + l.length + '</b><span class="tiny">tiketov</span></div><div class="kpi"><b>' + pct(won.length, l.length) + ' %</b><span class="tiny">tiketov vyšlo</span></div><div class="kpi"><b>' + pct(tips.filter(Boolean).length, tips.length) + ' %</b><span class="tiny">tipov vyšlo</span></div>' +
      '<div class="kpi"><b style="color:' + (ret - staked >= 0 ? '#166534' : '#B91C1C') + '">' + (ret - staked >= 0 ? '+' : '−') + f2(Math.abs(ret - staked)) + ' €</b><span class="tiny">zisk</span></div><div class="kpi"><b>' + f2(staked) + ' €</b><span class="tiny">vložené</span></div><div class="kpi"><b>' + (staked ? Math.round((ret - staked) / staked * 100) : 0) + ' %</b><span class="tiny">ROI</span></div></div>';
    h += '<div class="row between"><span class="h">Tikety a tipy</span><span class="tiny">ťukni pre detail</span></div>';
    h += '<div class="seg light">' + [['all', 'Všetky'], ['ok', '✓ Vyšli'], ['no', '✗ Nevyšli']].map(function (x) { return '<button data-act="hres" data-v="' + x[0] + '" class="' + (fr === x[0] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div>';
    h += l.filter(function (t) { return fr === 'all' || ticketState(t) === fr; }).slice().reverse().map(ticketCard).join('');
    function table(title, o) {
      var ks = Object.keys(o).sort(function (a, b) { return o[b][1] - o[a][1]; });
      return '<span class="h">' + title + '</span><div class="card">' + ks.map(function (k) { var v = pct(o[k][0], o[k][1]); return '<div class="scale"><div class="row between"><b style="font-size:13px">' + esc(k) + '</b><span class="small">' + o[k][0] + ' z ' + o[k][1] + ' · <b style="color:#111827">' + v + ' %</b></span></div><div class="track"><div style="width:' + v + '%;background:' + (v >= 70 ? '#9BCB2E' : (v >= 50 ? '#7BA7D9' : '#F5B94A')) + ';border-radius:3px"></div></div></div>'; }).join('') + '</div>';
    }
    h += table('Úspešnosť tipov podľa športu', bySport) + table('Úspešnosť tipov podľa kategórie', byCat);
    return h;
  }

  // ---------- INFO a PROFIL ----------
  function viewInfo() {
    var S = [['Percento pri tipe', ['Ako často tip vyšiel v posledných zápasoch: 10 domácich zápasov domáceho tímu + 10 vonkajších zápasov hosťa. „Vyšlo v 17 z 20“ = 85 %.', 'Pri tipe na jeden tím sa počíta len z jeho zápasov.']],
      ['Hraj od kurzu', ['Najnižší kurz, pri ktorom sa tip oplatí. Počíta ho štatistický model zo sily útoku a obrany oboch tímov plus rezerva ' + settings.reserve + ' % (zmeníš v Profile).']],
      ['Farby', ['Zelené percento 80 % a viac, modré 60 – 79 %, sivé menej.', '✓ zelená = tip vyšiel, ✗ červená = nevyšiel.']],
      ['Forma a H2H', ['Forma = posledné zápasy tímu. H2H = vzájomné zápasy. Ak sa výrazne líšia, appka zobrazí oranžové upozornenie.']],
      ['Bet Builder a tiket', ['Viac tipov z jedného zápasu je Bet Builder – spoločná šanca je len odhad, súvisiace tipy často vyjdú alebo nevyjdú spolu.']],
      ['Odkiaľ sú dáta', ['Len bezplatné verejné zdroje: futbal football-data.co.uk, hokej oficiálne rozhranie NHL. Aktualizácia prebieha automaticky niekoľkokrát denne.', 'Live zápasy appka nesleduje – vyhodnocuje sa po skončení.']],
      ['Keď dáta chýbajú', ['Zápas s malým množstvom dát má značku „len výsledky“ a nemá tipy.', 'Bez internetu appka ukáže posledné uložené dáta.']]];
    var h = '<div class="top"><div class="row">' + backBtn() + '<div><div class="title">Čo znamenajú čísla</div><div class="sub">ako appka počíta a odkiaľ berie dáta</div></div></div></div><div class="main">';
    S.forEach(function (s) { h += '<div class="card"><div class="chead">' + s[0] + '</div>' + s[1].map(function (t) { return '<div class="m" style="min-height:0;font-size:13px;line-height:1.45">' + t + '</div>'; }).join('') + '</div>'; });
    h += '<div class="card"><div class="chead" style="background:#0D1B2A;color:#C5F04A">Overenie na skutočných dátach</div><div class="m" style="font-size:12px;line-height:1.45;min-height:0">Premier League 2021 – 2026, 1 743 zápasov. Keď história alebo model sľubovali 70 – 84 %, koľko naozaj vyšlo:</div>';
    [['Tip', 'História', 'Vyšlo', 'Model', 'Vyšlo'], ['Góly 2,5+', '73 %', '59 %', '74 %', '69 %'], ['Rohy 9,5+', '73 %', '61 %', '74 %', '65 %'], ['Karty 3,5+', '73 %', '67 %', '75 %', '74 %'], ['Strely na bránu 8,5+', '73 %', '59 %', '74 %', '64 %'], ['Fauly 21,5+', '73 %', '72 %', '77 %', '72 %']].forEach(function (r, i) {
      h += '<div class="m" style="min-height:38px;font-size:12px;' + (i === 0 ? 'background:#E6EDF5;font-weight:800' : '') + '"><span style="flex:1;font-weight:700">' + r[0] + '</span>' + r.slice(1).map(function (v, j) { return '<span style="width:50px;text-align:right;' + (j % 2 && i ? 'font-weight:800' : '') + '">' + v + '</span>'; }).join('') + '</div>';
    });
    h += '</div></div>' + nav('');
    return h;
  }
  function viewProfile() {
    var h = '<div class="top"><div class="row">' + backBtn() + '<div><div class="title">Profil</div><div class="sub">nastavenia appky</div></div></div></div><div class="main">';
    h += '<div class="card pad" style="display:flex;flex-direction:column;gap:8px"><b>Rezerva pre „hraj od“</b><span class="small">O koľko vyšší kurz než férový chceš, aby sa tip oplatil.</span><div class="seg light">' + [3, 5, 8, 10].map(function (v) { return '<button data-act="reserve" data-v="' + v + '" class="' + (settings.reserve === v ? 'on' : '') + '">' + v + ' %</button>'; }).join('') + '</div></div>';
    h += '<div class="card pad" style="display:flex;flex-direction:column;gap:8px"><b>Športy, ktoré ťa zaujímajú</b><span class="small">Podľa nich sa predvolene filtrujú Zápasy a Tipy dňa.</span><div class="chips">' + SPORTS.filter(function (s) { return READY[s]; }).map(function (s) { return '<button data-act="psport" data-v="' + s + '" class="' + (settings.sports.indexOf(s) >= 0 ? 'on' : 'off') + '">' + s + '</button>'; }).join('') + '</div><span class="tiny">Tenis a basketbal pribudnú v ďalšej verzii.</span></div>';
    h += '<div class="card"><div class="chead">Dáta</div><div class="m" style="min-height:44px"><span style="flex:1">Posledná aktualizácia</span><b>' + esc(upd()) + '</b></div><div class="m" style="min-height:44px"><span style="flex:1">Zápasov v appke</span><b>' + D.matches.length + '</b></div><div class="m" style="min-height:44px"><span style="flex:1">Zdroje</span><b style="font-size:12px;text-align:right">football-data.co.uk · NHL API</b></div></div>';
    h += '<a class="btn" href="#/info" style="display:flex;align-items:center;justify-content:center">Čo znamenajú čísla</a>';
    h += '<button class="btn" style="border-color:#DDE2E8;color:#B91C1C" data-act="wipe">Vymazať všetky moje tikety</button>';
    h += '</div>' + nav('Profil');
    return h;
  }

  // ---------- smerovanie a udalosti ----------
  var lastRoute = '';
  function route() {
    if (!D) { app.innerHTML = '<div class="empty">Dáta sa nepodarilo načítať. Skontroluj pripojenie.</div>'; return; }
    var hsh = location.hash.replace(/^#\/?/, '');
    var parts = hsh.split('/');
    if (hsh !== lastRoute) { if (parts[0] === 'zapas') { ST.tab = 'Tipy'; ST.cCat = null; ST.cTeam = 'all'; } window.scrollTo(0, 0); lastRoute = hsh; }
    var y = window.scrollY;
    var needRes = parts[0] === 'tiket';
    var render = function () {
      if (parts[0] === 'zapas') app.innerHTML = viewMatch(decodeURIComponent(parts[1] || ''));
      else if (parts[0] === 'tipy') app.innerHTML = viewDaily();
      else if (parts[0] === 'tiket') app.innerHTML = viewTicket();
      else if (parts[0] === 'info') app.innerHTML = viewInfo();
      else if (parts[0] === 'profil') app.innerHTML = viewProfile();
      else app.innerHTML = viewMatches();
      window.scrollTo(0, y);
    };
    if (needRes) loadResults(render); else render();
  }
  function rerender() { route(); }
  window.addEventListener('hashchange', route);
  app.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    var a = b.getAttribute('data-act'), v = b.getAttribute('data-v');
    if (a === 'back') { if (window.history.length > 1) window.history.back(); else location.hash = '#/'; return; }
    if (a === 'sport') { var s = (ST.sports || settings.sports.slice()); ST.sports = s.indexOf(v) >= 0 ? s.filter(function (x) { return x !== v; }) : s.concat([v]); if (!ST.sports.length) ST.sports = [v]; }
    else if (a === 'day') { var d = ST.days || [todayStr(0)]; ST.days = d.indexOf(v) >= 0 ? d.filter(function (x) { return x !== v; }) : d.concat([v]); if (!ST.days.length) ST.days = [v]; }
    else if (a === 'mode') ST.mode = v;
    else if (a === 'add') { var m = matchById(b.getAttribute('data-m')); var t = m && m.tips.filter(function (x) { return x.label === b.getAttribute('data-t'); })[0]; if (m && t) toast(toggleTip(m, t) ? 'Pridané na tiket' : 'Odobrané z tiketu'); }
    else if (a === 'addc') {
      var mm = matchById(b.getAttribute('data-m')), c = b.getAttribute('data-c'), team = b.getAttribute('data-team'), L = parseFloat(b.getAttribute('data-l')), dd = mm.data[c];
      var arr = team === 'all' ? dd.hv.concat(dd.av) : (team === 'h' ? dd.hOwn : dd.aOwn);
      var mean = team === 'all' ? dd.mh + dd.ma : (team === 'h' ? dd.mh : dd.ma);
      var who = team === 'all' ? '' : (team === 'h' ? mm.home : mm.away) + ' ';
      toast(toggleTip(mm, { cat: c, label: who + 'Viac ako ' + fl(L) + ' ' + dd.unit, p: over(mean, team === 'all' ? dd.disp : dd.disp * 1.3, L), hk: arr.filter(function (x) { return x > L; }).length, hn: arr.length, ev: { k: team === 'all' ? 'tot' : (team === 'h' ? 'home' : 'away'), c: c, l: L } }) ? 'Pridané na tiket' : 'Odobrané z tiketu');
    }
    else if (a === 'tab') ST.tab = v;
    else if (a === 'ccat') ST.cCat = v;
    else if (a === 'cteam') ST.cTeam = v;
    else if (a === 'cline') { ST.cLine = ST.cLine || {}; ST.cLine[b.getAttribute('data-k')] = Math.max(0.5, parseFloat(v)); }
    else if (a === 'per') ST.per = +v;
    else if (a === 'dday') ST.dday = v;
    else if (a === 'target') ST.target = +v;
    else if (a === 'maxn') ST.maxN = +v;
    else if (a === 'minp') ST.minP = +v;
    else if (a === 'dsport') { var ds = ST.dsports || settings.sports.slice(); ST.dsports = ds.indexOf(v) >= 0 ? ds.filter(function (x) { return x !== v; }) : ds.concat([v]); }
    else if (a === 'addbuilt') { var n0 = 0; (ST._pick || []).forEach(function (x) { if (!inTicket(tipId(x.m, x.t.label))) { toggleTip(x.m, x.t); n0++; } }); toast(n0 ? 'Na tiket pridaných ' + n0 + ' ' + plural(n0, 'tip', 'tipy', 'tipov') : 'Tipy už na tikete sú'); }
    else if (a === 'ttab') ST.ttab = v;
    else if (a === 'rm') setTicket(ticket().filter(function (x) { return x.id !== b.getAttribute('data-id'); }));
    else if (a === 'clear') { if (confirm('Vymazať celý aktuálny tiket?')) setTicket([]); }
    else if (a === 'place') {
      var l = ticket(); if (!l.length) return;
      var ch = chanceOf(l), pl = placed(), st = parseFloat(String(ST.stake || '').replace(',', '.')) || 0;
      var now = new Date();
      pl.push({ no: pl.length ? pl[pl.length - 1].no + 1 : 1, mode: v, created: now.getDate() + '. ' + (now.getMonth() + 1) + '. ' + now.getFullYear(), stake: v === 'bet' ? st : st, odds: Math.round(minOdds(ch) * 100) / 100, chance: ch, items: l });
      LS.set('placed', pl); setTicket([]); ST.stake = ''; ST.ttab = v; toast(v === 'bet' ? 'Tiket stavený' : 'Tiket sledovaný');
    }
    else if (a === 'open') ST.open = ST.open === +v ? null : +v;
    else if (a === 'delplaced') { if (confirm('Odstrániť tento tiket?')) LS.set('placed', placed().filter(function (t) { return t.no !== +v; })); }
    else if (a === 'hmode') ST.hmode = v;
    else if (a === 'hres') ST.hres = v;
    else if (a === 'reserve') { settings.reserve = +v; LS.set('settings', settings); }
    else if (a === 'psport') { var ps = settings.sports; settings.sports = ps.indexOf(v) >= 0 ? ps.filter(function (x) { return x !== v; }) : ps.concat([v]); if (!settings.sports.length) settings.sports = [v]; LS.set('settings', settings); ST.sports = null; ST.dsports = null; }
    else if (a === 'wipe') { if (confirm('Naozaj vymazať všetky tikety (aktuálny, stavené, sledované aj vyhodnotené)?')) { setTicket([]); LS.set('placed', []); } }
    rerender();
  });
  app.addEventListener('input', function (e) {
    var k = e.target.getAttribute('data-inp'); if (!k) return;
    ST[k] = e.target.value;
    if (k === 'q') { var pos = e.target.selectionStart; rerender(); var el = app.querySelector('[data-inp="q"]'); if (el) { el.focus(); el.setSelectionRange(pos, pos); } }
  });
  app.addEventListener('change', function (e) { if (e.target.getAttribute('data-inp') === 'stake') rerender(); });
  window.addEventListener('online', function () { ST.offline = false; load(); });
  load();
})();
