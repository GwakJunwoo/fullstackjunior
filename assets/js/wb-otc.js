/* ═══════════════════════════════════════════════════════════════════════════
   wb-otc.js — 장외 호가 탭(2026-11-04 사용자 지시) · 화면 = tools/otc/index.html
   ───────────────────────────────────────────────────────────────────────────
   화면 셋(해시): #bond 종목 분석 · #broker 브로커 분석 · #team 팀 해부(① 요약 ② 종목×일 ③ 장중 ④ 종목 시계열 ⑤ 일봉)
   ■ 데이터 = /otc/* (server/app/routers/otc.py → BQH otcdesk.api 그대로). 숫자 = 엔진 값 그대로(재계산 0).
     웹이 하는 일 = 고르기 · 표 배치 · 표기(− 기호 · 비율 → % 자리 이동 · 소수 자리 채우기)뿐.
   ■ 비공개: 모든 GET 에 X-QH-KEY(localStorage 'qh_ops_key' = quant-house 운용 콘솔과 같은 키 이름).
     키 없음 → 빈 껍데기 + 키 안내 · 403 → 저장된 키 지우고 다시 묻기.
   ■ 이 파일에는 사람 이름 · 회사 이름이 없다(공개 저장소 · 공개 사이트) — 팀 라벨 · 명단은 /otc/meta 에서.
   ■ 색: 사자 = 파랑(--wb-down) · 팔자 = 빨강(--wb-up) · bp 괴리 부호 = + 빨강 / − 파랑.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var doc = document;
  var $ = function (id) { return doc.getElementById(id); };
  var KEY_LS = 'qh_ops_key';
  var MINUS = '−';
  var DEF = {   // 엔진(otcdesk/api.py) 맨 위 정의 문장 그대로
    lines: '사자선/팔자선 = 그 종목·그 날 모든 브로커의 마지막 사자/팔자 금리(계단) · 미드 = 둘 평균',
    vsmid: 'vs Mid = 호가 − 그 호가 직전 미드(bp) — +면 사자는 덜 공격적/팔자는 더 공격적',
    vsmp: 'vs 민평 = 호가 − 전일민평(bp) · 전일민평 = ktb 직전 영업일 값',
    done: '체결(ㅎㅈ) = 호가 원문 안 ㅎㅈ/확정/거래 또는 15분 안 자기 직전 호가에 붙는 단독 ㅎㅈ — 호가 ≠ 체결, 표시된 것만',
    conc: '양보 bp = 같은 방향 연속 호가에서 첫 금리 → 마지막 금리로 시장 쪽으로 움직인 폭(+ = 가격 양보)',
    vx: 'vs 타사 미드(vx) = 호가 − 그 시각 팀 밖 브로커들의 마지막 사자·팔자 평균(bp) · 팀이 스스로 만든 미드에 기대지 않는 공격성 지표'
  };
  var NOTE = {
    obs: '호가 ≠ 체결 · 체결 = ㅎㅈ/확정/거래 표시만 · 액면은 적힌 것만 · 관찰 전용(추천 0)',
    rst: '복원 = 2025-06~11 등 kbond_quote 금리 빈 행을 원문+전일민평 정수부로 복원(검증 정확 일치 98.8%)',
    rstWhy: '근거 = 검증 2.8만 행(금리 있는 행 지우고 복원 후 대조)'
  };
  // 테너 버킷 → 표시 색(표현 전용 팔레트 · 데이터 아님 · 모르는 버킷 = 회색)
  var MIX_COLOR = { '통안': '--wb-series-5', '1년': '--wb-series-6', '2년': '--wb-series-1', '3년': '--wb-series-4', '5년': '--wb-series-3',
    '10년': '--wb-series-2', '20년': '--wb-ramp-6', '30년': '--wb-legacy-purple', '50년': '--wb-accent', '기타': '--wb-faint' };
  var MIX_ORDER = Object.keys(MIX_COLOR);
  function mixSort(keys) { return keys.slice().sort(function (a, b) { var x = MIX_ORDER.indexOf(a), y = MIX_ORDER.indexOf(b); return (x < 0 ? 99 : x) - (y < 0 ? 99 : y); }); }
  var TEAM_SECS = ['sum', 'map', 'intra', 'bond', 'daily'];

  var S = window.WB_OTC = {
    meta: null, view: null, charts: {}, cache: {}, seq: { bond: 0, broker: 0, team: 0 },
    bond: { alias: '', date: '', d: null },
    broker: { name: '', asof: '', period: '5d', d: null, filter: '' },
    team: { sec: 'sum', member: '', period: '60d', start: '', end: '', alias: '', agg: 'D', d: {} },
    tbl: {}
  };

  // ══ 표기 helper (값 무변형) ══════════════════════════════════════════
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function help(t) { return (window.WBShell && t) ? WBShell.helpBtn(String(t)) : ''; }
  function enc(s) { return encodeURIComponent(s); }
  function n0(v) { return isNum(v) ? (v < 0 ? MINUS : '') + Math.abs(v).toLocaleString('ko-KR') : '–'; }
  function fy(v) {   // 금리: 엔진 값 그대로 · 3자리 채우기(4자리 값은 4자리)
    if (!isNum(v)) return '–';
    var a = Math.abs(v), s = Math.abs(a * 1000 - Math.round(a * 1000)) < 1e-7 ? a.toFixed(3) : a.toFixed(4);
    return (v < 0 ? MINUS : '') + s;
  }
  function fnum(v, dec) { if (!isNum(v)) return '–'; var s = Math.abs(v).toFixed(dec == null ? 1 : dec); return (v < 0 && +s !== 0 ? MINUS : '') + s; }
  function fbp(v, dec) {
    if (!isNum(v)) return '–';
    var s = Math.abs(v).toFixed(dec == null ? 1 : dec);
    if (+s === 0) return s;
    return (v > 0 ? '+' : MINUS) + s;
  }
  function sgn(v) { return !isNum(v) || v === 0 ? '' : v > 0 ? 'wb-up' : 'wb-down'; }
  function bpTd(v, dec, extra) { return '<td class="num ' + sgn(v) + (extra ? ' ' + extra : '') + '">' + fbp(v, dec) + '</td>'; }
  function bpSpan(v, dec) { return '<span class="' + sgn(v) + '">' + fbp(v, dec) + '</span>'; }
  function pct(v) { return isNum(v) ? (v * 100).toFixed(1) + '%' : '–'; }
  function sideTxt(s, st) { return s === 1 ? '사자' : s === -1 ? '팔자' : (st === 'QUOTE_INQUIRY' ? '문의' : '–'); }
  function sideCls(s) { return s === 1 ? 'otc-buy' : s === -1 ? 'otc-sell' : 'wb-muted'; }
  function sideSpan(s, st) { return '<span class="' + sideCls(s) + '">' + sideTxt(s, st) + '</span>'; }
  function bs(b, s) { return '<span class="otc-buy">' + n0(b) + '</span><span class="wb-muted">/</span><span class="otc-sell">' + n0(s) + '</span>'; }
  function netSide(v) { return !isNum(v) ? '–' : v > 0 ? '<span class="otc-buy">사 ' + n0(v) + '</span>' : v < 0 ? '<span class="otc-sell">팔 ' + n0(-v) + '</span>' : '0'; }
  function mmdd(d) { return d ? String(d).slice(5, 10) : ''; }
  function tag(txt, kind) { return '<span class="otc-tag' + (kind ? ' otc-tag--' + kind : '') + '">' + esc(txt) + '</span>'; }
  // ── 엔진 규칙(meta.rules) — 툴팁 숫자 · 금리 출처(y_src) 문장 그대로 ──
  function RU(k) { var r = S.meta && S.meta.rules; return r && r[k] != null ? r[k] : null; }
  function ruMin(k, alt) { var v = RU(k); return isNum(v) ? v + '분' : alt; }
  function tailTxt() { var v = RU('done_tail_sec'); return isNum(v) ? v + '초' : '짧은 시간'; }
  function ysrcTxt(v) { var r = RU('y_src'); return r && r[String(v)] ? String(r[String(v)]) : ''; }
  function srcNote() {
    var a = [];
    [0, 1, 2].forEach(function (v) { var t = ysrcTxt(v); if (t) a.push('금리 출처 ' + v + ' = ' + t); });
    a.push(NOTE.rst); a.push(NOTE.rstWhy);
    var md = RU('max_dev_pct'); if (isNum(md)) a.push('복원 금리가 전일민평과 ' + md + '%p 넘게 떨어지면 금리 버림(엔진 가드)');
    return a.join('\n');
  }
  function srcTag(r) {   // y_src 1 = 복원 · 2 = 교정 (y_src 없는 옛 응답 = restored 불리언 → 복원)
    var v = isNum(r.y_src) ? r.y_src : (r.restored ? 1 : 0);
    if (v === 1) return '<span class="otc-tag otc-tag--rst" title="' + esc(ysrcTxt(1) || '복원') + '">복원</span>';
    if (v === 2) return '<span class="otc-tag otc-tag--fix" title="' + esc(ysrcTxt(2) || '교정') + '">교정</span>';
    return '';
  }
  function epDef() { return '에피소드 = 같은 날·같은 종목·같은 방향의 연속 호가(호가 간격 ' + ruMin('episode_gap_min', '엔진 기준') + ' 이내)'; }
  function chip(txt, cls) { return '<span class="wb-badge' + (cls ? ' ' + cls : '') + '">' + txt + '</span>'; }
  function emsg(e) { return (e && (e.message || e.detail)) ? String(e.message || e.detail) : String(e); }
  function errBox(title, e) { return '<div class="otc-err"><b>' + esc(title) + '</b>' + esc(emsg(e)) + '</div>'; }
  function skel(n) { var h = '<div class="otc-skel">'; for (var i = 0; i < (n || 3); i++) h += '<span class="wb-skel wb-skel--line"></span>'; return h + '</div>'; }
  function cardHead(title, tip, meta, sub) {
    return '<div class="wb-card-head"><span class="wb-card-title">' + esc(title) + help(tip) + '</span>' +
      (sub ? '<span class="wb-card-sub">' + sub + '</span>' : '') + (meta ? '<span class="wb-card-meta">' + meta + '</span>' : '') + '</div>';
  }
  function skelCard(title) { return cardHead(title) + skel(4); }
  function hms(t) { var a = String(t).split(':'); return (+a[0]) * 3600 + (+a[1] || 0) * 60 + (+a[2] || 0); }
  function hmLab(x) { x = Math.round(x); var h = Math.floor(x / 3600), m = Math.floor((x % 3600) / 60); return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m; }
  function cssv(n) { return window.WBChart ? WBChart.css(n) : ''; }
  function tk(c, a) { return WBChart.tok(c, a); }
  function mixBar(mix) {
    if (!mix) return '–';
    var ks = mixSort(Object.keys(mix)), tot = 0;
    ks.forEach(function (k) { tot += +mix[k] || 0; });
    if (!tot) return '–';
    var title = ks.map(function (k) { return k + ' ' + mix[k]; }).join(' · ');
    return '<span class="otc-mix" title="' + esc(title) + '">' + ks.map(function (k) {
      return '<i style="width:' + (100 * (+mix[k] || 0) / tot).toFixed(2) + '%;background:var(' + (MIX_COLOR[k] || '--wb-series-6') + ')"></i>';
    }).join('') + '</span>';
  }
  function mixLegend(keys) {
    keys = mixSort(keys);
    return '<div class="otc-legend-row">' + keys.map(function (k) { return '<span><i style="background:var(' + (MIX_COLOR[k] || '--wb-series-6') + ')"></i>' + esc(k) + '</span>'; }).join('') + '</div>';
  }
  function shareBar(v) {
    if (!isNum(v)) return '–';
    return '<span class="otc-share" title="사자 ' + pct(v) + ' · 팔자 ' + pct(1 - v) + '"><i style="width:' + (v * 100).toFixed(1) + '%"></i></span>';
  }
  function topList(top) {
    if (!top || !top.length) return '–';
    return top.map(function (t) { return '<span class="mono">' + esc(t.alias) + '</span> ' + bs(t.buy, t.sell); }).join(' · ');
  }

  // ══ 차트 ══════════════════════════════════════════════════════════════
  function mk(key, canvas, cfg) {
    if (!canvas || !window.Chart) return null;
    var prev = S.charts[key] || Chart.getChart(canvas);
    if (prev) { try { prev.destroy(); } catch (e) { /* noop */ } }
    S.charts[key] = new Chart(canvas, cfg);
    return S.charts[key];
  }
  function kill(key) { if (S.charts[key]) { try { S.charts[key].destroy(); } catch (e) { /* noop */ } delete S.charts[key]; } }
  // 툴팁 = 가장 가까운 '호가 점'만(계단선·밴드는 제외) — 데이터셋에 otcPts:true
  function regMode() {
    if (!window.Chart || !Chart.Interaction || !Chart.Interaction.modes || Chart.Interaction.modes.otcPt) return;
    Chart.Interaction.modes.otcPt = function (chart, e, options, useFinal) {
      var pos = (Chart.helpers && Chart.helpers.getRelativePosition) ? Chart.helpers.getRelativePosition(e, chart) : { x: e.x, y: e.y };
      var best = null, bd = Infinity;
      chart.getSortedVisibleDatasetMetas().forEach(function (meta) {
        var ds = chart.data.datasets[meta.index];
        if (!ds || !ds.otcPts) return;
        meta.data.forEach(function (el, idx) {
          if (!el || el.skip) return;
          var p = el.getProps(['x', 'y'], useFinal), dx = p.x - pos.x, dy = p.y - pos.y, dd = dx * dx + dy * dy;
          if (dd < bd) { bd = dd; best = { element: el, datasetIndex: meta.index, index: idx }; }
        });
      });
      return best && bd <= 36 * 36 ? [best] : [];
    };
  }
  function baseOpts(extra) {
    var o = { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false } } };
    return Object.assign(o, extra || {});
  }

  // ══ 키 · 호출 ══════════════════════════════════════════════════════════
  function getKey() { try { return localStorage.getItem(KEY_LS) || ''; } catch (e) { return ''; } }
  function dropKey() { try { localStorage.removeItem(KEY_LS); } catch (e) { /* noop */ } }
  function askKey(msg) {
    var k = window.prompt(msg || '장외 호가 키(X-QH-KEY) 입력 — 운용 콘솔과 같은 키(server/.env QH_OPS_KEY)');
    k = (k || '').trim();
    if (!k) return '';
    try { localStorage.setItem(KEY_LS, k); } catch (e) { /* 저장 불가 — 이번 호출만 */ S.memKey = k; }
    return k;
  }
  function KeyErr(msg, denied) { this.message = msg; this.nokey = true; this.denied = !!denied; }
  async function detailOf(res) { try { var j = await res.json(); return (j && j.detail) ? String(j.detail) : ''; } catch (e) { return ''; } }
  async function rawGet(base, path, key) {
    return fetch(base + path, { headers: { 'X-QH-KEY': key, 'ngrok-skip-browser-warning': '1' }, cache: 'no-store' });
  }
  async function oget(path, fresh) {
    if (!fresh && S.cache[path]) return S.cache[path];
    var p = (async function () {
      var key = getKey() || S.memKey || '';
      if (!key) throw new KeyErr('키 없음');
      var base = await getApiBase();
      if (!base) base = await getApiBase(true);
      if (!base) throw new Error('API 주소 없음 — /assets/api_base.txt 비었거나 서버·터널이 꺼짐');
      var res;
      try { res = await rawGet(base, path, key); }
      catch (e) {
        var fb = await getApiBase(true);
        if (fb && fb !== base) res = await rawGet(fb, path, key);
        else throw new Error('서버에 연결할 수 없음 — 터널/서버가 내려갔거나 주소가 바뀜');
      }
      if (res.status >= 500 && res.status !== 500) {   // 502/503/530 = 터널 회전 신호 → 새 주소로 1회
        var fb2 = await getApiBase(true);
        if (fb2 && fb2 !== base) res = await rawGet(fb2, path, key);
      }
      if (res.status === 403) { var d = await detailOf(res); dropKey(); S.memKey = ''; throw new KeyErr('키가 맞지 않음 — ' + (d || '403'), true); }
      if (!res.ok) { var d2 = await detailOf(res); throw new Error('서버 오류 ' + res.status + (d2 ? ' — ' + d2 : '')); }
      return res.json();
    })();
    S.cache[path] = p;
    p.catch(function () { if (S.cache[path] === p) delete S.cache[path]; });
    return p;
  }
  function dropCache(prefix) { Object.keys(S.cache).forEach(function (k) { if (k.indexOf(prefix) === 0) delete S.cache[k]; }); }
  function keyErr(e) {
    if (!e || !e.nokey) return false;
    showGate(e.denied ? '저장된 키가 맞지 않아 지웠습니다(' + emsg(e) + '). 다시 입력하세요.' : '이 화면은 키(X-QH-KEY)가 있어야 데이터가 보입니다.');
    return true;
  }
  function showGate(msg) {
    $('otcGateMsg').textContent = msg || '이 화면은 키(X-QH-KEY)가 있어야 데이터가 보입니다.';
    $('otcGate').hidden = false;
    ['vBond', 'vBroker', 'vTeam'].forEach(function (id) { $(id).hidden = true; });
    S.meta = null;
    if (window.WBShell) WBShell.setPage('otc-' + (parseHash().v));
  }

  // ══ 해시 라우터 ════════════════════════════════════════════════════════
  var VIEWS = { bond: { el: 'vBond', enter: bondEnter }, broker: { el: 'vBroker', enter: brokerEnter }, team: { el: 'vTeam', enter: teamEnter } };
  function parseHash() {
    var h = String(location.hash || '').replace(/^#/, ''), i = h.indexOf('?');
    var v = (i < 0 ? h : h.slice(0, i)) || 'bond';
    var p = new URLSearchParams(i < 0 ? '' : h.slice(i + 1));
    return { v: VIEWS[v] ? v : 'bond', p: p };
  }
  function hashOf(view, params) {
    var q = [];
    Object.keys(params || {}).forEach(function (k) { var v = params[k]; if (v != null && v !== '') q.push(k + '=' + enc(v)); });
    return '#' + view + (q.length ? '?' + q.join('&') : '');
  }
  function go(view, params) { location.hash = hashOf(view, params); }                 // 화면 이동(뒤로 가기 가능) → hashchange → route
  function stamp(view, params) { try { history.replaceState(null, '', hashOf(view, params)); } catch (e) { /* noop */ } }
  function route() {
    if (!S.meta) return;
    var r = parseHash();
    Object.keys(VIEWS).forEach(function (k) { $(VIEWS[k].el).hidden = (k !== r.v); });
    S.view = r.v;
    if (window.WBShell) WBShell.setPage('otc-' + r.v);
    hideHov();
    VIEWS[r.v].enter(r.p);
  }

  // ══ 시작 · meta ════════════════════════════════════════════════════════
  async function start() {
    $('otcGate').hidden = true; $('otcFatal').hidden = true;
    $('otcMeta').innerHTML = '<span class="wb-loading">불러오는 중… (첫 호출은 캐시 적재로 수십 초 걸릴 수 있음)</span>';
    var m;
    try { m = await oget('/otc/meta', true); }
    catch (e) {
      $('otcMeta').textContent = '';
      if (keyErr(e)) return;
      $('otcFatal').innerHTML = errBox('meta 불러오기 실패', e); $('otcFatal').hidden = false; return;
    }
    S.meta = m;
    applyMeta(m);
    route();
  }
  function applyMeta(m) {
    var team = m.team || {};
    var dl = (m.rules || {}).done_link_min;
    if (isNum(dl)) DEF.done = '체결(ㅎㅈ) = 호가 원문 안 ㅎㅈ/확정/거래 또는 ' + dl + '분 안 자기 직전 호가에 붙는 단독 ㅎㅈ — 호가 ≠ 체결, 표시된 것만';
    // 2차 내비 '팀 해부' 라벨 = meta.team.label(정적 파일엔 이름 없음 · 키 있는 사람에게만 보임)
    try {
      (WBShell.allAreas() || []).forEach(function (a) { (a.pages || []).forEach(function (p) { if (p.id === 'otc-team' && team.label) p.label = team.label; }); });
    } catch (e) { /* noop */ }
    $('otcMeta').innerHTML = esc((m.coverage || {}).start || '') + ' ~ ' + esc((m.coverage || {}).end || '') +
      ' · 최신 영업일 <b>' + esc(m.latest || '–') + '</b> · 캐시 ' + n0(m.rows) + '행(복원 ' + n0(m.restored_rows) + (isNum(m.corrected_rows) ? ' · 교정 ' + n0(m.corrected_rows) : '') + ')' + help(srcNote()) +
      ' · 갱신 ' + esc(String(m.refreshed || '').replace('T', ' ').slice(5, 16));
    $('otcBonds').innerHTML = (m.bonds || []).map(function (b) {
      return '<option value="' + esc(b.alias) + '">' + esc([b.nick, b.btype, isNum(b.rem) ? '잔존 ' + b.rem + '년' : '', '30일 ' + n0(b.n30) + '건'].filter(Boolean).join(' · ')) + '</option>';
    }).join('');
    $('otcBrokers').innerHTML = (team.label ? '<option value="' + esc(team.label) + '">팀 합산 · ' + esc((team.members || []).join('·')) + '</option>' : '') +
      (m.brokers || []).map(function (b) {
        return '<option value="' + esc(b.broker) + '">' + esc([b.firm, '30일 ' + n0(b.n30) + '건', b.team ? '팀' : ''].filter(Boolean).join(' · ')) + '</option>';
      }).join('');
    $('brPeriod').innerHTML = (m.periods || []).map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.label) + '</option>'; }).join('');
    $('tmMember').innerHTML = '<option value="">팀 전체' + (team.label ? ' · ' + esc(team.label) : '') + '</option>' +
      (team.members || []).map(function (n) { return '<option value="' + esc(n) + '">' + esc(n) + '</option>'; }).join('');
    $('tmPeriod').innerHTML = (m.periods || []).map(function (p) {
      var s = p.id === 'all' ? '전체' : p.id === '1d' ? '당일' : String(p.id).replace(/d$/, '일');
      return '<button type="button" data-p="' + esc(p.id) + '" title="' + esc(p.label) + '">' + esc(s) + '</button>';
    }).join('');
    ['bdDate', 'brAsof', 'tmStart', 'tmEnd'].forEach(function (id) {
      var el = $(id); if (!el) return;
      if (m.coverage && m.coverage.start) el.min = m.coverage.start;
      if (m.latest) el.max = m.latest;
    });
    $('vTeam').setAttribute('aria-label', team.label || '팀 해부');
  }

  // ══════════════════════════════════════════════════════════════════════
  // (A) 종목 분석
  // ══════════════════════════════════════════════════════════════════════
  function bondEnter(p) {
    var m = S.meta;
    var alias = p.get('alias') || S.bond.alias || ((m.bonds || [])[0] || {}).alias || '';
    var date = p.get('date') || '';
    $('bdAlias').value = alias;
    $('bdDate').value = date || m.latest || '';
    if (!alias) { $('bdSum').textContent = '종목을 고르세요'; return; }
    if (S.bond.d && S.bond.alias === alias && (S.bond.date || '') === date) { renderBond(S.bond.d); return; }
    loadBond(alias, date, false);
  }
  function bondFromBar(fresh, dateOverride) {
    var alias = $('bdAlias').value.trim(), date = dateOverride != null ? dateOverride : $('bdDate').value;
    if (!alias) return;
    stamp('bond', { alias: alias, date: date });
    loadBond(alias, date, fresh);
  }
  async function loadBond(alias, date, fresh) {
    S.bond.alias = alias; S.bond.date = date || '';
    var seq = ++S.seq.bond;
    $('bdSum').innerHTML = '<span class="wb-loading">불러오는 중…</span>';
    $('bdStream').innerHTML = skelCard('당일 호가 스트림(최신순)');
    $('bdRank').innerHTML = skelCard('서식 브로커 랭킹');
    var d;
    try { d = await oget('/otc/bond?alias=' + enc(alias) + (date ? '&date=' + enc(date) : ''), fresh); }
    catch (e) {
      if (seq !== S.seq.bond) return;
      if (keyErr(e)) return;
      $('bdSum').innerHTML = '<span class="wb-error">불러오기 실패</span>';
      $('bdStream').innerHTML = cardHead('당일 호가 스트림(최신순)') + '<div class="otc-card-body">' + errBox('종목 분석', e) + '</div>';
      $('bdRank').innerHTML = cardHead('서식 브로커 랭킹');
      kill('bd'); kill('bdSpr');
      return;
    }
    if (seq !== S.seq.bond) return;
    S.bond.d = d;
    renderBond(d);
  }
  function renderBond(d) {
    var h = d.head || {};
    $('bdDate').value = h.date || '';
    if (h.alias) $('bdAlias').value = h.alias;
    $('bdPrev').disabled = !h.prev; $('bdNext').disabled = !h.next;
    $('bdPrev').title = h.prev ? '전 영업일 ' + h.prev : '전 영업일 없음';
    $('bdNext').title = h.next ? '다음 영업일 ' + h.next : '다음 영업일 없음';
    var chips = [];
    if (h.nick) chips.push(chip(esc(h.nick)));
    if (isNum(h.rem)) chips.push(chip('잔존 ' + esc(h.rem) + '년'));
    if (h.bucket) chips.push(chip(esc(h.bucket)));
    if (h.btype && h.btype !== '국고채') chips.push(chip(esc(h.btype)));
    if (h.basket) chips.push(chip(esc(h.basket), 'otc-chip-basket'));
    if (h.restored) chips.push(chip('복원 ' + n0(h.restored) + '건' + help(srcNote()), 'wb-badge--warn'));
    if (h.corrected) chips.push(chip('교정 ' + n0(h.corrected) + '건' + help(srcNote()), 'otc-chip-fix'));
    $('bdSum').innerHTML = '<b>' + esc(h.alias) + '</b> · ' + esc(h.date || '') + ' · 호가 <b>' + n0(h.n_quotes) + '</b>건' +
      (h.n_valid !== h.n_quotes ? '(금리 ' + n0(h.n_valid) + ')' : '') +
      ' · 전일민평(참고) <b>' + fy(h.mp) + '</b>' + help(DEF.vsmp + (h.mp_date ? '\n이 화면 전일민평 = ' + h.mp_date + ' 값' : '')) + ' ' + chips.join(' ');
    $('bdChartTitle').innerHTML = esc(h.alias) + ' 호가 타임라인 · ' + esc(h.date || '') + help(DEF.lines + '\n점 = 브로커 호가(▲ 사자 파랑 · ▼ 팔자 빨강 · 진한 테두리 = 팀 멤버)\n회색 점선 = 전일민평(참고)\n' + NOTE.obs);
    renderBondChart(d);
    renderStream(d);
    renderRank(d);
  }
  function renderBondChart(d) {
    var pts = d.points || [], st = d.steps || [], h = d.head || {};
    var box = $('bdChartBox');
    var old = box.querySelector('.otc-empty'); if (old) old.remove();
    $('bdLegend').innerHTML = '<span class="otc-buy">▲ 사자</span> · <span class="otc-sell">▼ 팔자</span> · 계단 = 사자선/팔자선 · 점선 = 미드 · 회색 = 전일민평';
    if (!pts.length) {
      kill('bd'); kill('bdSpr');
      var em = doc.createElement('div'); em.className = 'otc-empty'; em.textContent = '이 날 금리가 있는 호가가 없습니다(문의·원 단위 호가만 있거나 거래 없음).';
      box.appendChild(em); $('bdSprCap').textContent = '';
      return;
    }
    var xs = pts.map(function (p) { return hms(p.t); });
    var x0 = Math.floor((Math.min.apply(null, xs) - 300) / 1800) * 1800, x1 = Math.ceil((Math.max.apply(null, xs) + 300) / 1800) * 1800;
    var buy = [], sell = [];
    pts.forEach(function (p, i) { var o = { x: xs[i], y: p.y, i: i }; if (p.side === 1) buy.push(o); else if (p.side === -1) sell.push(o); });
    function stepLine(k) {
      var a = st.map(function (s) { return { x: hms(s.t), y: isNum(s[k]) ? s[k] : null }; });
      if (a.length && a[a.length - 1].y != null) a.push({ x: x1, y: a[a.length - 1].y });   // 마지막 상태가 장 끝까지 유지(계단 끝 연장 · 값 무변형)
      return a;
    }
    function ptOpt(side) {
      var col = side === 1 ? '--wb-down' : '--wb-up';
      return {
        type: 'scatter', otcPts: true, data: side === 1 ? buy : sell, label: side === 1 ? '사자' : '팔자', order: 1,
        pointStyle: 'triangle', pointRotation: side === 1 ? 0 : 180,
        pointRadius: function (c) { var p = c.raw && pts[c.raw.i]; return p && p.team ? 6 : 4; },
        pointHoverRadius: function (c) { var p = c.raw && pts[c.raw.i]; return p && p.team ? 8 : 6; },
        pointBackgroundColor: tk(col, 0.85),
        pointBorderColor: function (c) { var p = c.raw && pts[c.raw.i]; return p && p.team ? cssv('--wb-ink') : cssv(col); },
        pointBorderWidth: function (c) { var p = c.raw && pts[c.raw.i]; return p && p.team ? 2 : 1; }
      };
    }
    var ds = [ptOpt(1), ptOpt(-1),
      { type: 'line', label: '사자선', data: stepLine('bid'), stepped: true, borderColor: tk('--wb-down', 0.9), borderWidth: 1.5, pointRadius: 0, pointHitRadius: 0, spanGaps: false, order: 3 },
      { type: 'line', label: '팔자선', data: stepLine('ask'), stepped: true, borderColor: tk('--wb-up', 0.9), borderWidth: 1.5, pointRadius: 0, pointHitRadius: 0, spanGaps: false, order: 3 },
      { type: 'line', label: '미드', data: stepLine('mid'), stepped: true, borderColor: tk('--wb-ink', 0.85), borderDash: [4, 3], borderWidth: 1, pointRadius: 0, pointHitRadius: 0, spanGaps: false, order: 2 }];
    if (isNum(h.mp)) ds.push({ type: 'line', label: '전일민평', data: [{ x: x0, y: h.mp }, { x: x1, y: h.mp }], borderColor: tk('--wb-muted', 0.8), borderDash: [2, 4], borderWidth: 1, pointRadius: 0, pointHitRadius: 0, order: 4 });
    regMode();
    mk('bd', $('bdChart'), {
      type: 'scatter', data: { datasets: ds },
      options: baseOpts({
        interaction: { mode: 'otcPt', intersect: false },
        scales: {
          x: { type: 'linear', min: x0, max: x1, ticks: { stepSize: 1800, callback: function (v) { return hmLab(v); } } },
          y: { ticks: { callback: function (v) { return fy(v); } } }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: function (items) { var p = items[0] && pts[items[0].raw.i]; return p ? p.t : ''; },
              label: function (it) {
                var p = pts[it.raw.i]; if (!p) return '';
                return sideTxt(p.side) + ' ' + fy(p.y) + ' · ' + p.broker + (p.firm ? ' (' + p.firm + ')' : '') + (p.team ? ' · 팀' : '');
              },
              afterBody: function (items) {
                var s = items[0] && st[items[0].raw.i]; if (!s) return '';
                return ['사자선 ' + fy(s.bid) + ' · 팔자선 ' + fy(s.ask), '미드 ' + fy(s.mid) + (isNum(s.spr) ? ' · 괴리 ' + fbp(s.spr, 2) + 'bp' : '')];
              }
            }
          }
        }
      })
    });
    $('bdSprCap').innerHTML = '사자−팔자 괴리(bp)' + help('그 시각 사자선 − 팔자선(bp) · 사자선/팔자선 = 모든 브로커의 마지막 사자/팔자 금리');
    var spr = st.map(function (s) { return { x: hms(s.t), y: isNum(s.spr) ? s.spr : null }; });
    if (spr.length && spr[spr.length - 1].y != null) spr.push({ x: x1, y: spr[spr.length - 1].y });
    mk('bdSpr', $('bdSpr'), {
      type: 'line', data: { datasets: [{ label: '사자−팔자 괴리(bp)', data: spr, stepped: true, fill: 'origin', borderColor: tk('--wb-legacy-purple'), backgroundColor: tk('--wb-legacy-purple', 0.22), borderWidth: 1.2, pointRadius: 0, spanGaps: false }] },
      options: baseOpts({
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        scales: { x: { type: 'linear', min: x0, max: x1, ticks: { stepSize: 1800, callback: function (v) { return hmLab(v); } } }, y: { ticks: { maxTicksLimit: 3 } } },
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: function (it) { return it[0] ? hmLab(it[0].parsed.x) : ''; }, label: function (it) { return '괴리 ' + fbp(it.parsed.y, 2) + 'bp'; } } } }
      })
    });
  }
  function renderStream(d) {
    var rows = d.stream || [], h = d.head || {};
    var nTeam = rows.filter(function (r) { return r.team; }).length, nDone = rows.filter(function (r) { return r.done; }).length;
    var html = cardHead('당일 호가 스트림(최신순)', DEF.vsmid + '\n' + DEF.done + '\n배지 복원/교정 = 금리 출처\n' + srcNote(),
      n0(rows.length) + '건' + (nTeam ? ' · 팀 ' + n0(nTeam) : '') + (nDone ? ' · 체결 표시 ' + n0(nDone) : ''));
    if (!rows.length) return void ($('bdStream').innerHTML = html + '<div class="otc-card-body"><div class="otc-empty">' + esc(h.date || '') + ' 호가 없음</div></div>');
    html += '<div class="wb-table-wrap otc-scroll otc-scroll--lg"><table class="wb-table otc-t"><thead><tr>' +
      '<th>시각</th><th>방향</th><th class="num">호가</th><th class="num">vs Mid' + help(DEF.vsmid) + '</th><th>브로커</th><th>소속</th><th>원문</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      html += '<tr class="' + (r.team ? 'is-team ' : '') + 'is-click" data-broker="' + esc(r.broker) + '">' +
        '<td class="mono">' + esc(r.t) + '</td><td>' + sideSpan(r.side, r.st) + '</td>' +
        '<td class="num">' + fy(r.y) + (r.done ? tag('✓ 체결', 'done') : '') + srcTag(r) +
        (isNum(r.size) ? '<span class="otc-sub">' + n0(r.size) + '억</span>' : '') + '</td>' +
        bpTd(r.vs_mid, 1) + '<td>' + esc(r.broker) + (r.team ? tag('팀', 'team') : '') + '</td><td class="wb-muted">' + esc(r.firm || '') + '</td>' +
        '<td class="raw">' + esc(r.content || '') + '</td></tr>';
    });
    $('bdStream').innerHTML = html + '</tbody></table></div>';
  }
  function renderRank(d) {
    var rows = d.rank || [], wk = d.week || [], h = d.head || {};
    var wl = wk.length ? mmdd(wk[0]) + '~' + mmdd(wk[wk.length - 1]) + ' · ' + wk.length + '영업일' : '';
    var html = cardHead('서식 브로커 랭킹', '당일 = ' + (h.date || '') + ' 그 종목 호가 · 주간 = ' + wl + '\n괴리 = 호가 − 그 시각 Mid(bp) 평균\n' + DEF.vsmid + '\n행 클릭 = 그 브로커 분석',
      n0(rows.length) + '명', '당일 실시간 + 주간 행태 · 괴리 = 호가 − 그 시각 Mid(bp)');
    if (!rows.length) return void ($('bdRank').innerHTML = html + '<div class="otc-card-body"><div class="otc-empty">주간 호가 브로커 없음</div></div>');
    html += '<div class="wb-table-wrap otc-scroll otc-scroll--lg"><table class="wb-table otc-t"><thead>' +
      '<tr><th rowspan="2">브로커</th><th rowspan="2">소속</th><th class="grp day" colspan="3">당일</th><th class="grp" colspan="4">주간(' + esc(wl) + ')</th></tr>' +
      '<tr><th class="num day">건</th><th class="num day">사/팔</th><th class="num day">괴리</th><th class="num">건</th><th class="num">사/팔</th><th class="num">일</th><th class="num">괴리</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      html += '<tr class="is-click' + (r.d_n ? '' : ' is-muted') + (r.team ? ' is-team' : '') + '" data-broker="' + esc(r.broker) + '">' +
        '<td>' + esc(r.broker) + (r.team ? tag('팀', 'team') : '') + '</td><td class="wb-muted">' + esc(r.firm || '') + '</td>' +
        '<td class="num day">' + n0(r.d_n) + '</td><td class="num day">' + bs(r.d_buy, r.d_sell) + '</td>' + bpTd(r.d_dev, 1, 'day') +
        '<td class="num">' + n0(r.w_n) + '</td><td class="num">' + bs(r.w_buy, r.w_sell) + '</td><td class="num">' + n0(r.w_days) + '</td>' + bpTd(r.w_dev, 1) + '</tr>';
    });
    $('bdRank').innerHTML = html + '</tbody></table></div>';
  }

  // ══════════════════════════════════════════════════════════════════════
  // (B) 브로커 분석
  // ══════════════════════════════════════════════════════════════════════
  function teamId() { return (S.meta && S.meta.team && S.meta.team.id) || ''; }
  function nameLabel(n) { var t = S.meta.team || {}; return n === t.id ? (t.label || n) : n; }
  function nameId(v) { var t = S.meta.team || {}; v = String(v || '').trim(); return (v && (v === t.label || v === t.id)) ? t.id : v; }
  function brokerEnter(p) {
    var name = p.get('name') || S.broker.name || teamId();
    var asof = p.get('asof') || '', period = p.get('period') || S.broker.period || '5d';
    $('brName').value = nameLabel(name);
    $('brAsof').value = asof || S.meta.latest || '';
    $('brPeriod').value = period;
    if (S.broker.d && S.broker.name === name && S.broker.asof === asof && S.broker.period === period) { renderBroker(S.broker.d); return; }
    loadBroker(name, asof, period, false);
  }
  function brokerFromBar(fresh, asofOverride) {
    var name = nameId($('brName').value), asof = asofOverride != null ? asofOverride : $('brAsof').value, period = $('brPeriod').value || '5d';
    if (!name) return;
    stamp('broker', { name: name, asof: asof, period: period });
    loadBroker(name, asof, period, fresh);
  }
  async function loadBroker(name, asof, period, fresh) {
    S.broker.name = name; S.broker.asof = asof || ''; S.broker.period = period;
    var seq = ++S.seq.broker;
    $('brSum').innerHTML = '<span class="wb-loading">불러오는 중…</span>';
    $('brKpi').innerHTML = skel(2); $('brCover').innerHTML = skelCard('종목 커버'); $('brRecent').innerHTML = skelCard('최근 호가');
    var d;
    try { d = await oget('/otc/broker?name=' + enc(name) + (asof ? '&asof=' + enc(asof) : '') + '&period=' + enc(period), fresh); }
    catch (e) {
      if (seq !== S.seq.broker) return;
      if (keyErr(e)) return;
      $('brSum').innerHTML = '<span class="wb-error">불러오기 실패</span>';
      $('brKpi').innerHTML = '<div class="otc-card-body">' + errBox('브로커 분석', e) + '</div>';
      $('brCover').innerHTML = cardHead('종목 커버'); $('brRecent').innerHTML = cardHead('최근 호가');
      kill('brD'); kill('brH');
      return;
    }
    if (seq !== S.seq.broker) return;
    S.broker.d = d;
    renderBroker(d);
  }
  function renderBroker(d) {
    var k = d.kpi || {};
    $('brAsof').value = k.asof || '';
    $('brSum').innerHTML = '<b>' + esc(k.name) + '</b>' + (k.firm ? '(' + esc(k.firm) + ')' : '') + ' · 기준 ' + esc(k.asof || '') +
      ' · ' + n0(k.n_days) + '일 메시지 <b>' + n0(k.n_msgs) + '</b>건' + (k.today && k.today !== k.asof ? ' · 당일 = 마지막 활동일 ' + esc(k.today) : '');
    var kp = [
      ['이름 · 소속', esc(k.name), esc(k.firm || ''), ''],
      ['메시지(' + n0(k.n_days) + '일)', n0(k.n_msgs), esc((k.start || '') + ' ~ ' + (k.asof || '')), '그 기간 그 사람(팀)의 메신저 메시지 전부 — 메시지 DB 전체(크레딧 등 포함)'],
      ['유효 호가', n0(k.n_valid), '', '파서가 금리 호가로 읽은 메시지(VALID · CREDIT_VALID) — 메시지 DB 전체 기준'],
      ['호가 문의', n0(k.n_inquiry), '', '파서가 문의(QUOTE_INQUIRY)로 읽은 메시지'],
      ['커버 종목', n0(k.n_bonds), '국고·통안', '그 기간 사자/팔자 호가를 낸 국고채·통안채 종목 수(이 도구 범위)'],
      ['체결 표시', n0(k.n_done_mk), 'ㅎㅈ 포함 메시지', "메시지 원문에 'ㅎㅈ' 가 들어간 건수 — 호가 ≠ 체결 · 팀 해부의 체결(호가에 연결된 것)과 다른 집계"]
    ];
    $('brKpi').innerHTML = '<dl class="wb-kpis otc-kpis">' + kp.map(function (x) {
      return '<div class="wb-kpi"><dt>' + x[0] + help(x[3]) + '</dt><dd><span class="wb-kpi-val"' + (x[0] === '이름 · 소속' ? ' style="font-size:16px"' : '') + '>' + x[1] + '</span>' + (x[2] ? '<span class="wb-kpi-sub">' + x[2] + '</span>' : '') + '</dd></div>';
    }).join('') + '</dl>';
    var dl = d.daily || [], hl = d.hourly || [];
    $('brDailyMeta').textContent = (k.period_label || '') + ' · 메시지';
    mk('brD', $('brDaily'), {
      type: 'bar', data: { labels: dl.map(function (x) { return mmdd(x.d); }), datasets: [{ label: '메시지', data: dl.map(function (x) { return x.n; }), backgroundColor: tk('--wb-series-1', 0.75), borderWidth: 0 }] },
      options: baseOpts({ scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } }, y: { beginAtZero: true, ticks: { precision: 0 } } },
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: function (it) { return dl[it[0].dataIndex] ? dl[it[0].dataIndex].d : ''; } } } } })
    });
    mk('brH', $('brHourly'), {
      type: 'bar', data: { labels: hl.map(function (x) { return x.h + '시'; }), datasets: [{ label: '메시지', data: hl.map(function (x) { return x.n; }), backgroundColor: tk('--wb-series-4', 0.75), borderWidth: 0 }] },
      options: baseOpts({ scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 } } } })
    });
    renderCover(d);
    renderRecent(d);
  }
  function renderCover(d) {
    var rows = d.cover || [], k = d.kpi || {};
    var html = cardHead('종목 커버', '당일(' + (k.today || '') + ') 우선 정렬 · 기간(' + (k.start || '') + '~' + (k.asof || '') + ') 행태 보조\n괴리 = 호가 − 전일민평(bp) 평균\n' + DEF.vsmp + '\n방향 막대 = 기간 사자 비중(파랑 = 사자 · 빨강 = 팔자)\n행 클릭 = 그 종목 · 그날 종목 분석',
      n0(rows.length) + '종목', '당일(' + esc(mmdd(k.today)) + ') 우선 · 기간 행태 보조 · 괴리 = 호가 − 전일민평 bp');
    if (!rows.length) return void ($('brCover').innerHTML = html + '<div class="otc-card-body"><div class="otc-empty">기간 안 국고·통안 호가 없음</div></div>');
    html += '<div class="wb-table-wrap otc-scroll otc-scroll--lg"><table class="wb-table otc-t"><thead>' +
      '<tr><th rowspan="2">종목</th><th rowspan="2">구분</th><th class="grp day" colspan="3">당일</th><th class="grp" colspan="5">기간</th></tr>' +
      '<tr><th class="num day">건</th><th class="num day">사/팔</th><th class="num day">괴리</th><th class="num">건</th><th class="num">사/팔</th><th>방향</th><th class="num">일</th><th class="num">괴리</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      html += '<tr class="is-click' + (r.d_n ? '' : ' is-muted') + '" data-alias="' + esc(r.alias) + '">' +
        '<td><span class="mono">' + esc(r.alias) + '</span>' + (r.basket ? tag(r.basket) : '') + (r.nick ? '<span class="otc-sub">' + esc(r.nick) + '</span>' : '') + '</td>' +
        '<td>' + esc(r.bucket || '') + (r.btype && r.btype !== '국고채' ? '<span class="otc-sub">' + esc(r.btype) + '</span>' : '') + '</td>' +
        '<td class="num day">' + n0(r.d_n) + '</td><td class="num day">' + bs(r.d_buy, r.d_sell) + '</td>' + bpTd(r.d_dev, 1, 'day') +
        '<td class="num">' + n0(r.p_n) + '</td><td class="num">' + bs(r.p_buy, r.p_sell) + '</td><td>' + shareBar(r.buy_share) + '</td>' +
        '<td class="num">' + n0(r.p_days) + '</td>' + bpTd(r.p_dev, 1) + '</tr>';
    });
    $('brCover').innerHTML = html + '</tbody></table></div>';
  }
  function renderRecent(d) {
    var all = d.recent || [], k = d.kpi || {};
    var multi = !!(k.is_team && (k.members || []).length > 1);
    var f = (S.broker.filter || '').trim();
    var rows = f ? all.filter(function (r) { return String(r.alias || '').indexOf(f) >= 0; }) : all;
    var html = cardHead('최근 호가', 'vsD−1 = ' + DEF.vsmp + '\n' + DEF.done + '\n최근 ' + all.length + '건까지(엔진 상한)',
      (f ? n0(rows.length) + ' / ' : '') + n0(all.length) + '건') +
      '<div class="otc-toolbar"><label class="wb-field"><span class="wb-label">종목 필터</span><input class="wb-input" id="brFilter" value="' + esc(f) + '" placeholder="예: 26-3" autocomplete="off"></label></div>';
    if (!rows.length) { $('brRecent').innerHTML = html + '<div class="otc-card-body"><div class="otc-empty">' + (f ? '필터에 맞는 호가 없음' : '기간 안 호가 없음') + '</div></div>'; bindRecentFilter(); return; }
    html += '<div class="wb-table-wrap otc-scroll otc-scroll--lg"><table class="wb-table otc-t"><thead><tr><th>시각</th>' + (multi ? '<th>브로커</th>' : '') +
      '<th>종목</th><th>방향</th><th class="num">호가</th><th class="num">vsD−1' + help(DEF.vsmp) + '</th><th>원문</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      html += '<tr class="is-click" data-alias="' + esc(r.alias) + '" data-date="' + esc(r.date) + '"><td class="mono">' + esc(r.t) + '</td>' + (multi ? '<td>' + esc(r.broker) + '</td>' : '') +
        '<td class="mono">' + esc(r.alias || '–') + '</td><td>' + sideSpan(r.side, r.st) + '</td>' +
        '<td class="num">' + fy(r.y) + (r.done ? tag('✓ 체결', 'done') : '') + srcTag(r) + '</td>' +
        bpTd(r.dev_mp, 1) + '<td class="raw">' + esc(r.content || '') + '</td></tr>';
    });
    $('brRecent').innerHTML = html + '</tbody></table></div>';
    bindRecentFilter();
  }
  function bindRecentFilter() {
    var el = $('brFilter'); if (!el) return;
    el.addEventListener('input', function () {
      S.broker.filter = el.value; var pos = el.selectionStart;
      renderRecent(S.broker.d);
      var n = $('brFilter'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { /* noop */ } }
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // (C) 팀 해부
  // ══════════════════════════════════════════════════════════════════════
  var SEC_EL = { sum: 'tmSecSum', map: 'tmSecMap', intra: 'tmSecIntra', bond: 'tmSecBond', daily: 'tmSecDaily' };
  function teamEnter(p) {
    var T = S.team;
    if (p.has('sec') && TEAM_SECS.indexOf(p.get('sec')) >= 0) T.sec = p.get('sec');
    ['member', 'period', 'start', 'end', 'alias', 'agg'].forEach(function (k) { if (p.has(k)) T[k] = p.get(k) || ''; });
    if (!T.period) T.period = '60d';
    if (!T.agg) T.agg = 'D';
    syncTeamBar();
    showSec(T.sec, false);
  }
  function syncTeamBar() {
    var T = S.team;
    $('tmMember').value = T.member || '';
    $('tmStart').value = T.start || '';
    $('tmEnd').value = T.end || '';
    Array.prototype.forEach.call($('tmPeriod').children, function (b) { b.classList.toggle('is-active', !T.start && b.getAttribute('data-p') === T.period); });
    Array.prototype.forEach.call($('tmTabs').children, function (b) { var on = b.getAttribute('data-sec') === T.sec; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
  }
  function teamQS() {
    var T = S.team, q = [];
    if (T.member) q.push('member=' + enc(T.member));
    if (T.start) q.push('start=' + enc(T.start)); else q.push('period=' + enc(T.period || '60d'));
    if (T.end) q.push('end=' + enc(T.end));
    return q.join('&');
  }
  function teamStamp() {
    var T = S.team;
    stamp('team', { sec: T.sec, member: T.member, period: T.start ? '' : T.period, start: T.start, end: T.end, alias: T.sec === 'bond' ? T.alias : '', agg: T.sec === 'daily' && T.agg !== 'D' ? T.agg : '' });
  }
  function teamFromBar() {
    var T = S.team;
    T.member = $('tmMember').value || '';
    T.start = $('tmStart').value || '';
    T.end = $('tmEnd').value || '';
    dropCache('/otc/team/');
    T.d = {};
    syncTeamBar(); teamStamp();
    showSec(T.sec, true);
  }
  function showSec(sec, fresh) {
    var T = S.team; T.sec = sec;
    Object.keys(SEC_EL).forEach(function (k) { $(SEC_EL[k]).hidden = (k !== sec); });
    syncTeamBar(); teamStamp(); hideHov();
    loadSec(sec, fresh);
  }
  function secPath(sec) {
    var T = S.team, qs = teamQS();
    if (sec === 'sum') return '/otc/team/overview?' + qs;
    if (sec === 'map') return '/otc/team/heatmap?' + qs;
    if (sec === 'intra') return '/otc/team/intraday?' + qs;
    if (sec === 'bond') return '/otc/team/bond?alias=' + enc(T.alias) + '&' + qs;
    return '/otc/team/daily?' + qs + '&agg=' + enc(T.agg || 'D');
  }
  async function loadSec(sec, fresh) {
    var T = S.team, el = $(SEC_EL[sec]);
    if (sec === 'bond' && !T.alias) T.alias = defaultTeamBond();
    var path = secPath(sec);
    if (!fresh && T.d[sec] && T.d[sec].path === path) { renderSec(sec, T.d[sec].data); return; }
    var seq = ++S.seq.team;
    el.innerHTML = '<section class="wb-card">' + skel(5) + '</section>';
    $('tmSum').innerHTML = '<span class="wb-loading">불러오는 중…</span>';
    var d;
    try { d = await oget(path, fresh); }
    catch (e) {
      if (seq !== S.seq.team) return;
      if (keyErr(e)) return;
      $('tmSum').innerHTML = '<span class="wb-error">불러오기 실패</span>';
      el.innerHTML = '<section class="wb-card"><div class="otc-card-body">' + errBox(secName(sec), e) +
        (/KeyError/.test(emsg(e)) ? '<div class="otc-foot">빈 구간(그 기간·멤버·종목에 팀 호가 없음)에서 엔진이 에러를 냄 — 기간·멤버를 바꿔 보세요(엔진 쪽 보고됨).</div>' : '') + '</div></section>';
      return;
    }
    if (seq !== S.seq.team) return;
    T.d[sec] = { path: path, data: d };
    renderSec(sec, d);
  }
  function secName(sec) { return { sum: '기간 요약', map: '종목×일 지도', intra: '장중 행태', bond: '종목 시계열', daily: '일봉' }[sec] || sec; }
  function renderSec(sec, d) {
    var k = d.kpi || d.head || d;
    var s = k.start, e = k.end, nd = k.n_days;
    if (!s && d.dates && d.dates.length) { s = d.dates[0]; e = d.dates[d.dates.length - 1]; nd = d.dates.length; }
    var mem = S.team.member || ((S.meta.team || {}).label || '팀 전체');
    $('tmSum').innerHTML = '<b>' + esc(mem) + '</b> · ' + esc(s || '–') + ' ~ ' + esc(e || '–') + (isNum(nd) ? ' · ' + n0(nd) + '영업일' : '') +
      (S.team.start ? ' · 시작일 지정(프리셋 무시)' : '') + help(NOTE.obs);
    if (sec === 'sum') renderSum(d);
    else if (sec === 'map') renderMap(d);
    else if (sec === 'intra') renderIntra(d);
    else if (sec === 'bond') renderTBond(d);
    else renderDaily(d);
  }
  function defaultTeamBond() {
    var sum = S.team.d.sum && S.team.d.sum.data;
    if (sum && sum.bonds && sum.bonds.length) return sum.bonds[0].alias;
    var map = S.team.d.map && S.team.d.map.data;
    if (map && map.bonds && map.bonds.length) return map.bonds.slice().sort(function (a, b) { return b.n - a.n; })[0].alias;
    return ((S.meta.bonds || [])[0] || {}).alias || '';
  }

  // ── ① 기간 요약 ──
  var EP_ROWS = [
    ['에피소드 수', 'n', 0, 'n'], ['체결률', 'done_rate', 0, 'pct', '에피소드 중 체결 표시가 하나라도 붙은 비율'],
    ['지속 중앙(분)', 'med_dur', 1, 'num'], ['호가 수 중앙', 'med_n', 1, 'num'], ['재게시(에피소드당)', 'repost', 2, 'num', '에피소드 안 첫 호가 뒤 다시 낸 횟수 평균'],
    ['양보 bp 중앙', 'med_conc', 2, 'bp', DEF.conc], ['양보 bp 평균', 'mean_conc', 2, 'bp', DEF.conc],
    ['vs 타사 미드 · 시작', 'med_vx0', 2, 'bp', DEF.vx], ['vs 타사 미드 · 끝', 'med_vx1', 2, 'bp', DEF.vx],
    ['vs Mid · 시작', 'med_vm0', 2, 'bp', DEF.vsmid], ['vs Mid · 끝', 'med_vm1', 2, 'bp', DEF.vsmid], ['vs 민평 · 시작', 'med_dm0', 2, 'bp', DEF.vsmp],
    ['체결 에피소드 · vs 타사 미드(끝)', 'vx_done', 2, 'bp'], ['미체결 에피소드 · vs 타사 미드(끝)', 'vx_open', 2, 'bp'],
    ['체결 에피소드 · 양보 bp', 'conc_done', 2, 'bp'], ['미체결 에피소드 · 양보 bp', 'conc_open', 2, 'bp'],
    ['공동(멤버 2명+)', 'multi_mem', 0, 'n', '서로 다른 멤버가 같이 낸 에피소드 수(팀 단위 에피소드에서만 의미)']
  ];
  function epStatsCard(es, title) {
    var html = cardHead(title || '에피소드 통계', epDef() + ' · 팀 전체 = 멤버 섞임 가능 · 멤버 선택 = 그 멤버만\n중앙 = 중앙값\n' + DEF.conc + '\n' + DEF.vx + '\n' + DEF.done);
    if (!es || !es.all || !es.all.n) return html + '<div class="otc-card-body"><div class="otc-empty">에피소드 없음</div></div>';
    html += '<div class="wb-table-wrap otc-scroll"><table class="wb-table otc-t"><thead><tr><th>지표</th><th class="num">전체</th><th class="num otc-buy">사자</th><th class="num otc-sell">팔자</th></tr></thead><tbody>';
    EP_ROWS.forEach(function (r) {
      html += '<tr><td>' + esc(r[0]) + help(r[4]) + '</td>';
      ['all', 'buy', 'sell'].forEach(function (g) {
        var v = (es[g] || {})[r[1]];
        if (r[3] === 'bp') html += bpTd(v, r[2]);
        else html += '<td class="num">' + (r[3] === 'pct' ? pct(v) : r[3] === 'n' ? n0(v) : fnum(v, r[2])) + '</td>';
      });
      html += '</tr>';
    });
    return html + '</tbody></table></div>';
  }
  function renderSum(d) {
    var k = d.kpi || {}, el = $('tmSecSum');
    var kp = [
      ['호가', n0(k.n_quotes), '유효 ' + n0(k.n_valid) + ' · 문의 ' + n0(k.n_inquiry), '사자/팔자 호가(금리 있는 것 + 원 단위 등 방향만 있는 것) · 유효 = 금리 있음'],
      ['종목', n0(k.n_bonds), '', ''],
      ['사자 비중', pct(k.buy_share), '사 ' + n0(k.buy) + ' / 팔 ' + n0(k.sell), ''],
      ['체결 표시 사/팔', bs(k.done_buy, k.done_sell), '합 ' + n0(k.n_done), DEF.done],
      ['체결 액면 사/팔(억)', bs(k.done_size_buy, k.done_size_sell), '액면 적힌 체결 ' + n0(k.done_size_known) + ' / ' + n0(k.n_done) + '건', '액면은 적힌 것만 합(체결 뒤 "N억" 또는 호가 원문의 액면) — 안 적힌 체결은 빠짐'],
      ['활동일', n0(k.active_days) + '<span class="wb-kpi-sub"> / ' + n0(k.n_days) + '</span>', '', '기간 영업일 중 호가가 있던 날'],
      ['에피소드', n0(k.n_episodes), '체결률 ' + pct(k.ep_done_rate), epDef()],
      ['공동 에피소드', n0(k.multi_mem_eps), '멤버 2명+', '']
    ];
    var html = '<section class="wb-card">' + cardHead('기간 요약', NOTE.obs + '\n' + DEF.done, esc((k.start || '') + ' ~ ' + (k.end || '')) + (k.restored ? ' · ' + tag('복원 ' + n0(k.restored), 'rst') + help(srcNote()) : '')) +
      '<dl class="wb-kpis otc-kpis">' + kp.map(function (x) {
        return '<div class="wb-kpi"><dt>' + esc(x[0]) + help(x[3]) + '</dt><dd><span class="wb-kpi-val">' + x[1] + '</span>' + (x[2] ? '<span class="wb-kpi-sub">' + x[2] + '</span>' : '') + '</dd></div>';
      }).join('') + '</dl></section>';
    // 멤버 역할
    var mem = d.members || [], mixKeys = [];
    mem.forEach(function (r) { Object.keys(r.mix || {}).forEach(function (b) { if (mixKeys.indexOf(b) < 0) mixKeys.push(b); }); });
    (d.mix || []).forEach(function (r) { if (mixKeys.indexOf(r.bucket) < 0) mixKeys.push(r.bucket); });
    html += '<section class="wb-card otc-mt">' + cardHead('멤버 역할', '행 클릭 = 그 멤버만 보기\n체결률 = 체결 표시 ÷ 호가\n순체결 액면 = Σ(액면 × 방향) · 액면 적힌 것만 · 사 = 사자 우위 / 팔 = 팔자 우위\n주력 종목 = 호가 많은 순 4개(사/팔)\n피크 = 호가가 가장 많은 시(時)\n' + DEF.vsmp + '\n' + DEF.vx) +
      '<div class="otc-card-body" style="padding-bottom:0">' + mixLegend(mixKeys) + '</div>' +
      '<div class="wb-table-wrap"><table class="wb-table otc-t"><thead><tr><th>멤버</th><th class="num">호가</th><th class="num">사/팔</th><th class="num">사자%</th>' +
      '<th class="num">체결</th><th class="num">체결 사/팔</th><th class="num">체결률</th><th class="num">순체결 액면(억)</th><th>주력 종목</th><th>테너 믹스</th><th class="num">피크</th>' +
      '<th class="num">vs 민평 사</th><th class="num">vs 민평 팔</th><th class="num">vs 타사 사</th><th class="num">vs 타사 팔</th><th class="num">활동일</th><th>처음 ~ 마지막</th></tr></thead><tbody>';
    mem.forEach(function (r) {
      if (!r.n && !r.n_done) { html += '<tr class="is-muted"><td>' + esc(r.broker) + '</td><td class="num">0</td><td colspan="15" class="wb-muted">기간 안 호가 없음</td></tr>'; return; }
      html += '<tr class="is-click" data-member="' + esc(r.broker) + '"><td>' + esc(r.broker) + '</td><td class="num">' + n0(r.n) + '</td><td class="num">' + bs(r.buy, r.sell) + '</td><td class="num">' + pct(r.buy_share) + '</td>' +
        '<td class="num">' + n0(r.n_done) + '</td><td class="num">' + bs(r.done_buy, r.done_sell) + '</td><td class="num">' + pct(r.done_rate) + '</td><td class="num">' + netSide(r.done_size_net) + '</td>' +
        '<td>' + topList(r.top) + '</td><td>' + mixBar(r.mix) + '</td><td class="num">' + (isNum(r.peak_h) ? r.peak_h + '시' : '–') + '</td>' +
        bpTd(r.dev_buy, 1) + bpTd(r.dev_sell, 1) + bpTd(r.vm_buy, 1) + bpTd(r.vm_sell, 1) +
        '<td class="num">' + n0(r.days) + '</td><td class="mono">' + esc(mmdd(r.first)) + ' ~ ' + esc(mmdd(r.last)) + '</td></tr>';
    });
    html += '</tbody></table></div></section>';
    // 테너 믹스 + 에피소드 통계
    html += '<div class="otc-grid"><section class="wb-card">' + cardHead('테너 믹스', '버킷별 호가 사/팔(막대) · 체결 표시(선)', n0((d.mix || []).length) + '버킷') +
      '<div class="otc-card-body"><div class="otc-chart otc-chart--md"><canvas id="tmMixC"></canvas></div></div></section>' +
      '<section class="wb-card">' + epStatsCard(d.ep_stats) + '</section></div>';
    // 종목 표
    var bonds = d.bonds || [];
    html += '<section class="wb-card otc-mt">' + cardHead('종목', '행 클릭 = 4 종목 시계열\n체결 = ' + DEF.done + '\n액면 = 적힌 것만 합(억)\n' + DEF.vsmp + '\n' + DEF.vx, n0(bonds.length) + '종목') +
      '<div class="wb-table-wrap otc-scroll otc-scroll--lg"><table class="wb-table otc-t"><thead><tr><th>종목</th><th>구분</th><th>바스켓</th><th class="num">호가</th><th class="num">사/팔</th>' +
      '<th class="num">체결 사/팔</th><th class="num">액면 사/팔(억)</th><th class="num">활동일</th><th>처음 ~ 마지막</th><th class="num">vs 민평 사</th><th class="num">vs 민평 팔</th><th class="num">vs 타사 사</th><th class="num">vs 타사 팔</th><th>멤버</th></tr></thead><tbody>';
    bonds.forEach(function (r) {
      html += '<tr class="is-click" data-tbond="' + esc(r.alias) + '"><td><span class="mono">' + esc(r.alias) + '</span>' + (r.nick ? '<span class="otc-sub">' + esc(r.nick) + '</span>' : '') + '</td>' +
        '<td>' + esc(r.bucket || '') + (isNum(r.rem) ? '<span class="otc-sub">잔존 ' + esc(r.rem) + '</span>' : '') + '</td><td>' + (r.basket ? tag(r.basket) : '') + '</td>' +
        '<td class="num">' + n0(r.n) + '</td><td class="num">' + bs(r.buy, r.sell) + '</td><td class="num">' + bs(r.done_buy, r.done_sell) + '</td><td class="num">' + bs(r.size_buy, r.size_sell) + '</td>' +
        '<td class="num">' + n0(r.days) + '</td><td class="mono">' + esc(mmdd(r.first)) + ' ~ ' + esc(mmdd(r.last)) + '</td>' +
        bpTd(r.dev_buy, 1) + bpTd(r.dev_sell, 1) + bpTd(r.vx_buy, 1) + bpTd(r.vx_sell, 1) + '<td class="wb-muted">' + esc(r.members || '') + '</td></tr>';
    });
    if (!bonds.length) html += '<tr><td colspan="14" class="wb-muted">기간 안 팀 호가 없음</td></tr>';
    html += '</tbody></table></div></section>';
    el.innerHTML = html;
    var mix = d.mix || [];
    if (mix.length) {
      mk('tmMix', $('tmMixC'), {
        type: 'bar', data: { labels: mix.map(function (r) { return r.bucket; }), datasets: [
          { label: '사자', data: mix.map(function (r) { return r.buy; }), backgroundColor: tk('--wb-down', 0.75), stack: 'q', order: 2 },
          { label: '팔자', data: mix.map(function (r) { return r.sell; }), backgroundColor: tk('--wb-up', 0.75), stack: 'q', order: 2 },
          { label: '체결 표시', type: 'line', data: mix.map(function (r) { return r.done; }), borderColor: tk('--wb-ink'), backgroundColor: tk('--wb-ink'), pointRadius: 3, borderWidth: 1.5, order: 1 }] },
        options: baseOpts({ scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } },
          plugins: { legend: { display: true, position: 'top', align: 'end' }, tooltip: { mode: 'index', intersect: false } } })
      });
    } else kill('tmMix');
  }

  // ── ② 종목×일 지도 ──
  var MAP = { d: null, geo: null };
  function renderMap(d) {
    var el = $('tmSecMap');
    MAP.d = d;
    var bonds = d.bonds || [], dates = d.dates || [];
    var posKeys = Object.keys(d.pos || {});
    var ord = {}; bonds.forEach(function (b, i) { ord[b.alias] = i; });
    posKeys.sort(function (a, b) { return (ord[a] == null ? 1e9 : ord[a]) - (ord[b] == null ? 1e9 : ord[b]); });
    var html = '<section class="wb-card">' + cardHead('종목×일 지도', '행 = 종목(버킷·잔존 순 · 선 = 버킷 경계) × 열 = 영업일\n색 = 순방향(사자 − 팔자): 파랑 = 사자 우위 · 빨강 = 팔자 우위 · 회색 = 같음\n진하기 = 호가 건수 · 가운데 점 = 체결 표시 있음\n칸 클릭 = 그 종목 · 그날 종목 분석 · 종목 이름 클릭 = 4 종목 시계열\n' + NOTE.obs,
      n0(bonds.length) + '종목 × ' + n0(dates.length) + '일') +
      '<div class="otc-card-body" style="padding-bottom:4px"><div class="otc-legend-row"><span><i style="background:var(--wb-down)"></i>사자 우위</span><span><i style="background:var(--wb-up)"></i>팔자 우위</span><span><i style="background:var(--wb-mark)"></i>같음</span><span>진하기 = 건수</span><span>● = 체결 표시</span></div></div>';
    if (!bonds.length) { el.innerHTML = html + '<div class="otc-card-body"><div class="otc-empty">기간 안 팀 호가 없음</div></div></section>'; kill('tmPos'); return; }
    html += '<div class="otc-map"><div class="otc-map-lab" id="tmMapLab"></div><div class="otc-map-canvas" id="tmMapScroll"><canvas id="tmMapC"></canvas></div></div></section>';
    html += '<section class="wb-card otc-mt">' + cardHead('추정 누적(체결 표시 기준 · 호가≠체결)', '종목별 체결 표시의 누적 — 기간 안 첫 체결일부터 0 에서 시작\n액면 = 적힌 것만(안 적힌 체결은 0 으로 더함 → 건수 선과 같이 볼 것)\n+ = 사자(매수) 우위 · − = 팔자(매도) 우위\n실제 보유·포지션이 아님(호가방 밖 거래·미표시 체결 모름)') +
      '<div class="otc-toolbar"><label class="wb-field"><span class="wb-label">종목</span><select class="wb-input" id="tmPosSel">' +
      posKeys.map(function (k) { return '<option value="' + esc(k) + '">' + esc(k) + '</option>'; }).join('') + '</select></label><span class="otc-cap" id="tmPosCap"></span></div>' +
      '<div class="otc-card-body">' + (posKeys.length ? '<div class="otc-chart otc-chart--md"><canvas id="tmPosC"></canvas></div>' : '<div class="otc-empty">기간 안 체결 표시 없음</div>') + '</div></section>';
    el.innerHTML = html;
    drawMap();
    if (posKeys.length) {
      var sel = $('tmPosSel'), pick = posKeys[0];
      var best = -1; posKeys.forEach(function (k) { var b = bonds[ord[k]]; if (b && b.n > best) { best = b.n; pick = k; } });
      sel.value = pick; drawPos(pick);
      sel.addEventListener('change', function () { drawPos(sel.value); });
    } else kill('tmPos');
  }
  function drawMap() {
    var d = MAP.d; if (!d) return;
    var lab = $('tmMapLab'), scr = $('tmMapScroll'), cv = $('tmMapC');
    if (!lab || !scr || !cv) return;
    var bonds = d.bonds || [], dates = d.dates || [], cells = d.cells || [];
    var HEAD = 30, RH = 16;
    var avail = Math.max(200, scr.clientWidth || 800);
    var CW = Math.max(6, Math.min(22, Math.floor(avail / Math.max(1, dates.length))));
    var W = CW * dates.length, H = HEAD + RH * bonds.length;
    var bi = {}, di = {};
    bonds.forEach(function (b, i) { bi[b.alias] = i; });
    dates.forEach(function (x, i) { di[x] = i; });
    var grid = {}, ns = [];
    cells.forEach(function (c) { if (bi[c.a] == null || di[c.d] == null) return; grid[bi[c.a] + ':' + di[c.d]] = c; ns.push(c.b + c.s); });
    ns.sort(function (a, b) { return a - b; });
    var ref = Math.max(1, ns.length ? ns[Math.floor(ns.length * 0.95)] : 1);
    // 라벨
    var lh = '<div class="hd" style="height:' + HEAD + 'px;line-height:' + HEAD + 'px">종목</div>';
    bonds.forEach(function (b, i) {
      var sep = i > 0 && bonds[i - 1].bucket !== b.bucket;
      lh += '<div class="' + (sep ? 'sep' : '') + '" data-tbond="' + esc(b.alias) + '" title="' + esc([b.alias, b.nick, b.bucket, b.basket, '호가 ' + b.n].filter(Boolean).join(' · ')) + '">' +
        esc(b.alias) + '<small>' + esc(b.bucket || '') + (b.basket ? ' · ' + esc(b.basket) : '') + '</small></div>';
    });
    lab.innerHTML = lh;
    var dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    var ctx = cv.getContext('2d'); if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    var cUp = cssv('--wb-up'), cDn = cssv('--wb-down'), cMk = cssv('--wb-mark'), cRule = cssv('--wb-rule'), cRuleS = cssv('--wb-rule-strong'), cMut = cssv('--wb-muted'), cInk = cssv('--wb-ink');
    ctx.font = '10px ' + (cssv('--wb-font') || 'sans-serif');
    ctx.textBaseline = 'middle';
    // 날짜 머리: 달 바뀜 = 굵은 선 + 'MM월' · 칸 넓으면 일(日)
    var lastM = '', every = CW >= 18 ? 1 : CW >= 12 ? 2 : CW >= 8 ? 5 : 10;
    dates.forEach(function (x, i) {
      var m = x.slice(0, 7), xx = i * CW;
      if (m !== lastM) {
        ctx.fillStyle = cRuleS; ctx.fillRect(xx, 0, 1, H);
        ctx.fillStyle = cMut; ctx.fillText((m.slice(2, 4) + '.' + m.slice(5, 7)), xx + 2, 8);
        lastM = m;
      }
      if (i % every === 0) { ctx.fillStyle = cMut; ctx.fillText(String(+x.slice(8, 10)), xx + 1, 22); }
    });
    ctx.fillStyle = cRuleS; ctx.fillRect(0, HEAD - 1, W, 1);
    // 버킷 경계
    bonds.forEach(function (b, i) { if (i > 0 && bonds[i - 1].bucket !== b.bucket) { ctx.fillStyle = cRuleS; ctx.fillRect(0, HEAD + i * RH, W, 1); } });
    // 칸
    Object.keys(grid).forEach(function (key) {
      var c = grid[key], p = key.split(':'), r = +p[0], ci = +p[1];
      var n = c.b + c.s, net = c.b - c.s;
      var x = ci * CW, y = HEAD + r * RH;
      if (n > 0) {
        var a = 0.22 + 0.78 * Math.min(1, Math.log(1 + n) / Math.log(1 + ref));
        ctx.globalAlpha = a;
        ctx.fillStyle = net > 0 ? cDn : net < 0 ? cUp : cMk;
        ctx.fillRect(x + 0.5, y + 1, CW - 1, RH - 2);
        ctx.globalAlpha = 1;
      }
      if ((c.db || 0) + (c.ds || 0) > 0) {
        ctx.fillStyle = cInk; ctx.beginPath(); ctx.arc(x + CW / 2, y + RH / 2, Math.min(2.6, CW / 3), 0, Math.PI * 2); ctx.fill();
      }
    });
    ctx.fillStyle = cRule;
    MAP.geo = { HEAD: HEAD, RH: RH, CW: CW, grid: grid, bonds: bonds, dates: dates };
    cv.onmousemove = function (ev) {
      var g = MAP.geo; if (!g) return;
      var rc = cv.getBoundingClientRect(), x = ev.clientX - rc.left, y = ev.clientY - rc.top;
      var ci = Math.floor(x / g.CW), r = Math.floor((y - g.HEAD) / g.RH);
      if (y < g.HEAD || r < 0 || r >= g.bonds.length || ci < 0 || ci >= g.dates.length) { hideHov(); return; }
      var b = g.bonds[r], dt = g.dates[ci], c = g.grid[r + ':' + ci];
      var h = '<b>' + esc(b.alias) + '</b>' + (b.nick ? ' ' + esc(b.nick) : '') + ' · ' + esc(dt) + '<br>';
      h += c ? '호가 사자 <span class="otc-buy">' + n0(c.b) + '</span> · 팔자 <span class="otc-sell">' + n0(c.s) + '</span><br>체결 표시 사 ' + n0(c.db) + ' · 팔 ' + n0(c.ds) + ' · 순체결 액면 ' + netSide(c.szn) + (c.szn ? '억' : '') : '<span class="wb-muted">팀 호가 없음</span>';
      showHov(h, ev.clientX, ev.clientY);
    };
    cv.onmouseleave = hideHov;
    cv.onclick = function (ev) {
      var g = MAP.geo; if (!g) return;
      var rc = cv.getBoundingClientRect(), x = ev.clientX - rc.left, y = ev.clientY - rc.top;
      var ci = Math.floor(x / g.CW), r = Math.floor((y - g.HEAD) / g.RH);
      if (y < g.HEAD || r < 0 || r >= g.bonds.length || ci < 0 || ci >= g.dates.length) return;
      hideHov(); go('bond', { alias: g.bonds[r].alias, date: g.dates[ci] });
    };
    scr.scrollLeft = scr.scrollWidth;   // 최근 날짜가 보이게
  }
  function drawPos(alias) {
    var ser = (MAP.d && MAP.d.pos && MAP.d.pos[alias]) || [];
    var last = ser[ser.length - 1];
    $('tmPosCap').innerHTML = last ? '마지막 ' + esc(last[0]) + ' · 누적 액면 ' + netSide(last[1]) + (last[1] ? '억' : '') + ' · 누적 건수 ' + fbp(last[2], 0) : '';
    mk('tmPos', $('tmPosC'), {
      type: 'line', data: { labels: ser.map(function (r) { return mmdd(r[0]); }), datasets: [
        { label: '누적 순체결 액면(억)', data: ser.map(function (r) { return r[1]; }), stepped: true, borderColor: tk('--wb-series-1'), backgroundColor: tk('--wb-series-1', 0.12), fill: 'origin', borderWidth: 1.5, pointRadius: 0, yAxisID: 'y' },
        { label: '누적 순체결 건수', data: ser.map(function (r) { return r[2]; }), stepped: true, borderColor: tk('--wb-series-3'), borderDash: [4, 3], borderWidth: 1.5, pointRadius: 0, yAxisID: 'y1' }] },
      options: baseOpts({ interaction: { mode: 'index', intersect: false },
        scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } }, y: { position: 'left', title: { display: true, text: '억' } }, y1: { position: 'right', grid: { display: false }, title: { display: true, text: '건' }, ticks: { precision: 0 } } },
        plugins: { legend: { display: true, position: 'top', align: 'end' }, tooltip: { callbacks: { title: function (it) { return it[0] && ser[it[0].dataIndex] ? ser[it[0].dataIndex][0] : ''; } } } } })
    });
  }

  // ── 표(에피소드 · 체결) 공통 ──
  function moreBtn(key, shown, total) { return shown < total ? '<button type="button" class="wb-btn wb-btn--sm otc-more" data-more="' + key + '">더 보기 (' + n0(shown) + ' / ' + n0(total) + ')</button>' : ''; }
  function epRows(key, rows, opts) {
    opts = opts || {};
    var st = S.tbl[key] || (S.tbl[key] = { lim: 200, alias: '', side: '', done: '', sort: 't' });
    var f = rows.filter(function (r) {
      if (st.alias && String(r.alias || '').indexOf(st.alias) < 0) return false;
      if (st.side && String(r.side) !== st.side) return false;
      if (st.done === '1' && !r.done) return false;
      if (st.done === '0' && r.done) return false;
      return true;
    });
    if (st.sort !== 't') {
      var k = st.sort;
      f = f.slice().sort(function (a, b) { var x = isNum(a[k]) ? a[k] : -Infinity, y = isNum(b[k]) ? b[k] : -Infinity; return y - x; });
    }
    var tb = '<div class="otc-toolbar" data-tbl="' + key + '">' +
      (opts.noAlias ? '' : '<label class="wb-field"><span class="wb-label">종목</span><input class="wb-input" data-f="alias" value="' + esc(st.alias) + '" placeholder="예: 26-3" autocomplete="off"></label>') +
      '<label class="wb-field"><span class="wb-label">방향</span><select class="wb-input" data-f="side"><option value="">전체</option><option value="1"' + (st.side === '1' ? ' selected' : '') + '>사자</option><option value="-1"' + (st.side === '-1' ? ' selected' : '') + '>팔자</option></select></label>' +
      '<label class="wb-field"><span class="wb-label">체결</span><select class="wb-input" data-f="done"><option value="">전체</option><option value="1"' + (st.done === '1' ? ' selected' : '') + '>체결 표시</option><option value="0"' + (st.done === '0' ? ' selected' : '') + '>미체결</option></select></label>' +
      '<label class="wb-field"><span class="wb-label">정렬</span><select class="wb-input" data-f="sort">' +
      [['t', '최신순'], ['conc', '양보 bp 큰 순'], ['dur', '지속 긴 순'], ['n', '횟수 많은 순']].map(function (o) { return '<option value="' + o[0] + '"' + (st.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
      '</select></label><span class="otc-cap">' + n0(f.length) + ' / ' + n0(rows.length) + '건</span></div>';
    var html = tb + '<div class="wb-table-wrap otc-scroll otc-scroll--lg"><table class="wb-table otc-t"><thead><tr><th>날짜</th><th>종목</th><th>방향</th><th>시작~끝</th><th class="num">분</th><th class="num">횟수</th><th>멤버</th>' +
      '<th class="num">첫 → 끝 금리</th><th class="num">양보 bp' + help(DEF.conc) + '</th><th class="num">vs 타사 시작' + help(DEF.vx) + '</th><th class="num">vs 타사 끝</th><th class="num">vs 민평' + help(DEF.vsmp + ' (에피소드 첫 호가)') + '</th>' +
      '<th class="num">호가 액면</th><th>체결' + help(DEF.done) + '</th></tr></thead><tbody>';
    f.slice(0, st.lim).forEach(function (r) {
      html += '<tr class="is-click" data-alias="' + esc(r.alias) + '" data-date="' + esc(r.d) + '"><td class="mono">' + esc(r.d) + '</td><td><span class="mono">' + esc(r.alias) + '</span>' + (r.basket ? tag(r.basket) : '') + '</td>' +
        '<td>' + sideSpan(r.side) + (r.odd ? tag('자투리') : '') + '</td><td class="mono">' + esc(r.t0) + '~' + esc(r.t1) + '</td><td class="num">' + fnum(r.dur, 0) + '</td><td class="num">' + n0(r.n) + '</td>' +
        '<td class="wb-muted">' + esc(r.members || '') + '</td><td class="num">' + fy(r.y0) + ' → ' + fy(r.y1) + '</td>' + bpTd(r.conc, 1) + bpTd(r.vx0, 1) + bpTd(r.vx1, 1) + bpTd(r.dm0, 1) +
        '<td class="num">' + (isNum(r.size_q) ? n0(r.size_q) + '억' : '–') + '</td>' +
        '<td>' + (r.done ? tag('✓', 'done') + ' <span class="mono">' + esc(r.done_t || '') + '</span> ' + fy(r.done_y) + (r.cp ? ' · ' + esc(r.cp) : '') + (isNum(r.done_size) ? ' · ' + n0(r.done_size) + '억' : '') : '<span class="wb-muted">–</span>') + '</td></tr>';
    });
    if (!f.length) html += '<tr><td colspan="14" class="wb-muted">조건에 맞는 에피소드 없음</td></tr>';
    return html + '</tbody></table></div>' + moreBtn(key, Math.min(st.lim, f.length), f.length);
  }
  function doneRows(key, rows) {
    var st = S.tbl[key] || (S.tbl[key] = { lim: 200 });
    var html = '<div class="wb-table-wrap otc-scroll otc-scroll--lg"><table class="wb-table otc-t"><thead><tr><th>시각</th><th>멤버</th><th>종목</th><th>방향</th><th class="num">금리</th>' +
      '<th class="num">vs 타사' + help(DEF.vx) + '</th><th class="num">vs Mid' + help(DEF.vsmid) + '</th><th class="num">vs 민평' + help(DEF.vsmp) + '</th><th class="num">액면(출처)</th><th>상대</th><th class="num">지연 초' + help('체결 표시 시각 − 그 호가 시각(초) · 원문 안 표기 = 0') + '</th><th>표기</th></tr></thead><tbody>';
    rows.slice(0, st.lim).forEach(function (r) {
      html += '<tr class="is-click" data-alias="' + esc(r.alias) + '" data-date="' + esc(r.d) + '"><td class="mono">' + esc(r.t) + '</td><td>' + esc(r.broker) + '</td><td><span class="mono">' + esc(r.alias) + '</span>' + (r.basket ? tag(r.basket) : '') + '</td><td>' + sideSpan(r.side) + '</td>' +
        '<td class="num">' + fy(r.y) + '</td>' + bpTd(r.vx, 1) + bpTd(r.vs_mid, 1) + bpTd(r.dev_mp, 1) +
        '<td class="num">' + (isNum(r.size) ? n0(r.size) + '억<span class="otc-sub">' + esc(r.size_src || '') + '</span>' : '–') + '</td><td>' + esc(r.cp || '') + '</td>' +
        '<td class="num">' + n0(r.lag_s) + '</td><td class="wb-muted">' + (r.inline ? '원문 안' : '단독 ㅎㅈ') + '</td></tr>';
    });
    if (!rows.length) html += '<tr><td colspan="12" class="wb-muted">기간 안 체결 표시 없음</td></tr>';
    return html + '</tbody></table></div>' + moreBtn(key, Math.min(st.lim, rows.length), rows.length);
  }
  function listRows(rows, empty) {
    if (!rows || !rows.length) return '<div class="otc-card-body"><div class="otc-empty">' + esc(empty) + '</div></div>';
    return '<div class="wb-table-wrap otc-scroll otc-scroll--sm"><table class="wb-table otc-t"><thead><tr><th>시각</th><th>멤버</th><th>원문</th></tr></thead><tbody>' +
      rows.map(function (r) { return '<tr><td class="mono">' + esc(r.t) + '</td><td>' + esc(r.broker) + '</td><td class="raw">' + esc(r.content || '') + '</td></tr>'; }).join('') + '</tbody></table></div>';
  }

  // ── ③ 장중 행태 ──
  function renderIntra(d) {
    var el = $('tmSecIntra'), tod = d.tod || [];
    var html = '<div class="otc-grid"><section class="wb-card">' + cardHead('시간대', ruMin('tod_bucket_min', '엔진') + ' 버킷 · 막대 = 호가 사자/팔자 · 선 = 체결 표시\n' + NOTE.obs) +
      '<div class="otc-card-body"><div class="otc-chart otc-chart--md" style="height:300px"><canvas id="tmTodC"></canvas></div></div></section>' +
      '<section class="wb-card">' + epStatsCard(d.ep_stats) + '</section></div>';
    var eps = d.episodes || [], epTot = d.ep_stats && d.ep_stats.all ? d.ep_stats.all.n : null;
    html += '<section class="wb-card otc-mt">' + cardHead('에피소드', epDef() + '\n양보 bp = ' + DEF.conc + '\n엔진은 최신부터 상한까지만 행을 보냄(통계 표는 전체 기준)\n행 클릭 = 그 종목 · 그날 종목 분석',
      isNum(epTot) && epTot > eps.length ? '행 ' + n0(eps.length) + ' / 전체 ' + n0(epTot) + '건(최신부터 · 엔진 상한)' : n0(eps.length) + '건') +
      '<div id="tmEpTbl">' + epRows('ep', eps) + '</div></section>';
    var dn = d.done || [];
    html += '<section class="wb-card otc-mt">' + cardHead('체결 표시', DEF.done + '\n엔진은 최신부터 상한까지만 행을 보냄 — 긴 기간은 기간 요약 KPI 의 체결 수와 비교\n액면 출처 = 체결 뒤 ' + tailTxt() + ' 안 "N억" 또는 호가 원문\n상대 = 체결 뒤 ' + tailTxt() + ' 안 짧은 메시지(없으면 빈칸)\n행 클릭 = 그 종목 · 그날 종목 분석', n0(dn.length) + '건') +
      '<div id="tmDoneTbl">' + doneRows('done', dn) + '</div>';
    var un = d.done_unlinked;
    if (un && isNum(un.n)) {
      html += '<details class="otc-details"><summary>연결 못 한 체결 표시 ' + n0(un.n) + '건' + help(un.rule || '') +
        '<span class="otc-sub">' + ((un.rows || []).length < un.n ? '최근 ' + n0((un.rows || []).length) + '건 표시' : '') + '</span></summary>' + listRows(un.rows, '없음') + '</details>';
    }
    html += '</section>';
    var coord = d.coord || [], cps = d.counterparties || [];
    html += '<div class="otc-grid otc-grid--3">' +
      '<section class="wb-card">' + cardHead('멤버 공조 쌍', '같은 날·같은 종목·같은 방향 호가를 서로 다른 두 멤버가 ' + ruMin('coord_win_min', '엔진 공조 창') + ' 안에 이어 낸 횟수', n0(coord.length) + '쌍') +
      (coord.length ? '<div class="wb-table-wrap otc-scroll otc-scroll--sm"><table class="wb-table otc-t"><thead><tr><th>멤버 A</th><th>멤버 B</th><th class="num">횟수</th></tr></thead><tbody>' +
        coord.map(function (r) { return '<tr><td>' + esc(r.a) + '</td><td>' + esc(r.b) + '</td><td class="num">' + n0(r.n) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="otc-card-body"><div class="otc-empty">공조 없음(멤버 1명 선택이면 항상 비어 있음)</div></div>') + '</section>' +
      '<section class="wb-card">' + cardHead('체결 상대', '체결 뒤 ' + tailTxt() + ' 안 짧은 메시지로 적힌 상대 · (미상) = 안 적힘\n액면 = 적힌 것만 합(억)', n0(cps.length) + '곳') +
      (cps.length ? '<div class="wb-table-wrap otc-scroll otc-scroll--sm"><table class="wb-table otc-t"><thead><tr><th>상대</th><th class="num">건</th><th class="num">사/팔</th><th class="num">액면(억)</th></tr></thead><tbody>' +
        cps.map(function (r) { return '<tr><td>' + esc(r.cp) + '</td><td class="num">' + n0(r.n) + '</td><td class="num">' + bs(r.buy, r.sell) + '</td><td class="num">' + n0(r.size) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="otc-card-body"><div class="otc-empty">없음</div></div>') + '</section>' +
      '<section class="wb-card">' + cardHead('교체 · 문의 원문', '교체 = 원문에 "교체" 또는 두 종목 ± 가 같이 있는 메시지 · 문의 = 파서가 문의로 읽은 메시지 · 최신 300건까지') +
      '<div class="otc-cap" style="padding:6px 16px 0">교체 ' + n0((d.switches || []).length) + '건</div>' + listRows(d.switches, '교체 없음') +
      '<div class="otc-cap" style="padding:6px 16px 0">문의 ' + n0((d.inquiries || []).length) + '건</div>' + listRows(d.inquiries, '문의 없음') + '</section></div>';
    el.innerHTML = html;
    if (tod.length) {
      mk('tmTod', $('tmTodC'), {
        type: 'bar', data: { labels: tod.map(function (r) { return r.lab; }), datasets: [
          { label: '사자', data: tod.map(function (r) { return r.buy; }), backgroundColor: tk('--wb-down', 0.75), stack: 'q', order: 2 },
          { label: '팔자', data: tod.map(function (r) { return r.sell; }), backgroundColor: tk('--wb-up', 0.75), stack: 'q', order: 2 },
          { label: '체결 표시', type: 'line', data: tod.map(function (r) { return r.done; }), borderColor: tk('--wb-ink'), backgroundColor: tk('--wb-ink'), pointRadius: 2, borderWidth: 1.5, order: 1 }] },
        options: baseOpts({ scales: { x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } },
          plugins: { legend: { display: true, position: 'top', align: 'end' }, tooltip: { mode: 'index', intersect: false } } })
      });
    } else kill('tmTod');
  }

  // ── ④ 종목 시계열 ──
  function renderTBond(d) {
    var el = $('tmSecBond'), h = d.head || {}, pts = d.points || [], daily = d.daily || [];
    var opts = [], seen = {};
    function addOpt(a, lab) { if (a && !seen[a]) { seen[a] = 1; opts.push('<option value="' + esc(a) + '">' + esc(lab || '') + '</option>'); } }
    var sum = S.team.d.sum && S.team.d.sum.data;
    ((sum && sum.bonds) || []).forEach(function (b) { addOpt(b.alias, '팀 ' + b.n + '건 · ' + (b.nick || b.bucket || '')); });
    (S.meta.bonds || []).forEach(function (b) { addOpt(b.alias, b.nick || ''); });
    var chips = [];
    if (h.nick) chips.push(chip(esc(h.nick)));
    if (h.bucket) chips.push(chip(esc(h.bucket)));
    if (isNum(h.rem)) chips.push(chip('잔존 ' + esc(h.rem) + '년'));
    if (h.basket) chips.push(chip(esc(h.basket), 'otc-chip-basket'));
    var html = '<section class="wb-card">' + cardHead('종목 시계열', '가로 = 기간 전체 시각(장 시간 08~18시만 · 하루 = 한 칸 · 세로 선 = 날짜 경계)\n점 = 팀 호가(▲ 사자 파랑 · ▼ 팔자 빨강 · 채운 큰 점 = 체결 표시 · 빈 점 = 호가만)\n회색 계단 = 일별 전일민평 · 짧은 가로 막대 = 그날 종가 미드(전 브로커 마지막 사자·팔자 평균)\n옅은 띠 = 그날 전 브로커(팀 포함) 사자 범위(파랑) · 팔자 범위(빨강)\n' + NOTE.obs) +
      '<div class="otc-toolbar"><label class="wb-field"><span class="wb-label">종목</span><input class="wb-input" id="tmBondIn" list="otcTmBonds" value="' + esc(S.team.alias) + '" autocomplete="off"></label>' +
      '<button type="button" class="wb-btn wb-btn--sm" id="tmBondGo">보기</button><datalist id="otcTmBonds">' + opts.join('') + '</datalist>' +
      '<span class="otc-sum"><b>' + esc(h.alias || '') + '</b> · 팀 호가 ' + n0(h.n) + '건 · 체결 표시 ' + n0(h.n_done) + '건 · ' + esc((h.start || '') + ' ~ ' + (h.end || '')) + ' ' + chips.join(' ') +
      ' · <a href="' + esc(hashOf('bond', { alias: h.alias || S.team.alias, date: h.end || '' })) + '">종목 분석 ›</a></span></div>' +
      '<div class="otc-card-body">' + (pts.length || daily.length ? '<div class="otc-chart otc-chart--lg"><canvas id="tmBondC"></canvas></div>' : '<div class="otc-empty">기간 안 이 종목 팀 호가·시장 호가 없음</div>') + '</div></section>';
    var eps = d.episodes || [], dn = d.done || [];
    html += '<div class="otc-grid"><section class="wb-card">' + cardHead('이 종목 에피소드', DEF.conc, n0(eps.length) + '건') + '<div id="tmBEpTbl">' + epRows('bep', eps, { noAlias: true }) + '</div></section>' +
      '<section class="wb-card">' + cardHead('이 종목 체결 표시', DEF.done, n0(dn.length) + '건') + '<div id="tmBDoneTbl">' + doneRows('bdone', dn) + '</div></section></div>';
    el.innerHTML = html;
    var inp = $('tmBondIn');
    function goBond() { var a = inp.value.trim(); if (!a) return; S.team.alias = a; S.tbl.bep = null; S.tbl.bdone = null; teamStamp(); loadSec('bond', false); }
    $('tmBondGo').addEventListener('click', goBond);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') goBond(); });
    if (pts.length || daily.length) drawTBond(d); else kill('tmBond');
  }
  function drawTBond(d) {
    var pts = d.points || [], daily = d.daily || [];
    var days = {}; daily.forEach(function (r) { days[r.d] = 1; }); pts.forEach(function (p) { days[p.d] = 1; });
    var dl = Object.keys(days).sort(), di = {}; dl.forEach(function (x, i) { di[x] = i; });
    var T0 = 8 * 3600, TS = 10 * 3600;
    function xOf(iso) { var dd = iso.slice(0, 10), s = hms(iso.slice(11, 19)); var f = Math.max(0, Math.min(1, (s - T0) / TS)); return di[dd] + 0.04 + f * 0.92; }
    var buy = [], sell = [];
    pts.forEach(function (p, i) { if (!isNum(p.y)) return; var o = { x: xOf(p.t), y: p.y, i: i }; if (p.side === 1) buy.push(o); else if (p.side === -1) sell.push(o); });
    var mp = [], cm = [];
    daily.forEach(function (r) {
      var i = di[r.d];
      if (isNum(r.mp)) { mp.push({ x: i, y: r.mp }); mp.push({ x: i + 1, y: r.mp }); mp.push({ x: i + 1, y: null }); }
      if (isNum(r.close_mid)) cm.push({ x: i + 0.97, y: r.close_mid, r: r });
    });
    function ptDs(side) {
      var col = side === 1 ? '--wb-down' : '--wb-up';
      return { type: 'scatter', otcPts: true, label: side === 1 ? '팀 사자' : '팀 팔자', data: side === 1 ? buy : sell, order: 1,
        pointStyle: 'triangle', pointRotation: side === 1 ? 0 : 180,
        pointRadius: function (c) { var p = c.raw && pts[c.raw.i]; return p && p.done ? 6 : 3.5; },
        pointHoverRadius: function (c) { var p = c.raw && pts[c.raw.i]; return p && p.done ? 8 : 6; },
        pointBackgroundColor: function (c) { var p = c.raw && pts[c.raw.i]; return p && p.done ? cssv(col) : 'transparent'; },
        pointBorderColor: tk(col), pointBorderWidth: function (c) { var p = c.raw && pts[c.raw.i]; return p && p.done ? 1.5 : 1.2; } };
    }
    var bandPlugin = {
      id: 'otcBand',
      beforeDatasetsDraw: function (chart) {
        var xa = chart.scales.x, ya = chart.scales.y, ctx = chart.ctx, ca = chart.chartArea;
        ctx.save(); ctx.beginPath(); ctx.rect(ca.left, ca.top, ca.right - ca.left, ca.bottom - ca.top); ctx.clip();
        daily.forEach(function (r) {
          var i = di[r.d], xl = xa.getPixelForValue(i), xr = xa.getPixelForValue(i + 1);
          if (isNum(r.bid_lo) && isNum(r.bid_hi)) { ctx.fillStyle = WBChart.alpha('--wb-down', 0.08); var y1 = ya.getPixelForValue(r.bid_hi), y2 = ya.getPixelForValue(r.bid_lo); ctx.fillRect(xl, Math.min(y1, y2), xr - xl, Math.max(1, Math.abs(y2 - y1))); }
          if (isNum(r.ask_lo) && isNum(r.ask_hi)) { ctx.fillStyle = WBChart.alpha('--wb-up', 0.08); var y3 = ya.getPixelForValue(r.ask_hi), y4 = ya.getPixelForValue(r.ask_lo); ctx.fillRect(xl, Math.min(y3, y4), xr - xl, Math.max(1, Math.abs(y4 - y3))); }
        });
        ctx.fillStyle = cssv('--wb-rule');
        for (var k = 1; k < dl.length; k++) { var xx = Math.round(xa.getPixelForValue(k)); ctx.fillRect(xx, ca.top, 1, ca.bottom - ca.top); }
        ctx.restore();
      }
    };
    var step = Math.max(1, Math.ceil(dl.length / 14));
    // y 범위 = 데이터셋(팀 호가 · 민평 · 종가 미드)만으로 자동 — 밴드(플러그인)의 먼 꼬리는 잘림 · 잘린 값은 툴팁에 그대로
    regMode();
    mk('tmBond', $('tmBondC'), {
      type: 'scatter', plugins: [bandPlugin],
      data: { datasets: [ptDs(1), ptDs(-1),
        { type: 'line', label: '전일민평', data: mp, borderColor: tk('--wb-muted', 0.9), borderDash: [3, 3], borderWidth: 1.2, pointRadius: 0, pointHitRadius: 0, spanGaps: false, order: 3 },
        { type: 'scatter', label: '종가 미드', data: cm, pointStyle: 'line', pointRadius: 7, pointBorderWidth: 2, pointBorderColor: tk('--wb-ink'), pointHitRadius: 0, order: 2 }] },
      options: baseOpts({
        interaction: { mode: 'otcPt', intersect: false },
        scales: {
          x: { type: 'linear', min: 0, max: dl.length, grid: { display: false },
            afterBuildTicks: function (ax) { var t = []; for (var i = 0; i < dl.length; i += step) t.push({ value: i + 0.5 }); ax.ticks = t; },
            ticks: { autoSkip: false, maxRotation: 0, callback: function (v) { return mmdd(dl[Math.floor(v)] || ''); } } },
          y: { grace: '4%', ticks: { callback: function (v) { return fy(v); } } }
        },
        plugins: { legend: { display: false }, tooltip: { callbacks: {
          title: function (it) { var p = it[0] && pts[it[0].raw.i]; return p ? p.t.replace('T', ' ') : ''; },
          label: function (it) {
            var p = pts[it.raw.i]; if (!p) return '';
            return [sideTxt(p.side) + ' ' + fy(p.y) + ' · ' + p.broker + (p.done ? ' · ✓ 체결 표시' : '') + (isNum(p.size) ? ' · ' + p.size + '억' : ''),
              'vs 타사 ' + fbp(p.vx) + ' · vs Mid ' + fbp(p.vs_mid) + ' · vs 민평 ' + fbp(p.dev_mp) + 'bp',
              '그 시각 타사 사자 ' + fy(p.bid_x) + ' · 팔자 ' + fy(p.ask_x)];
          },
          afterBody: function (it) {
            var p = it[0] && pts[it[0].raw.i]; if (!p) return '';
            var r = daily.filter(function (x) { return x.d === p.d; })[0]; if (!r) return '';
            return ['그날 전일민평 ' + fy(r.mp) + ' · 종가 미드 ' + fy(r.close_mid), '전 브로커 사자 ' + fy(r.bid_lo) + '~' + fy(r.bid_hi) + ' · 팔자 ' + fy(r.ask_lo) + '~' + fy(r.ask_hi), '시장 호가 ' + n0(r.n_mkt) + '건(팀 ' + n0(r.n_team) + ')'];
          } } } }
      })
    });
  }

  // ── ⑤ 일봉 ──
  function renderDaily(d) {
    var el = $('tmSecDaily'), rows = d.rows || [], agg = d.agg || S.team.agg || 'D';
    var asc = rows.slice().reverse();
    var mixKeys = []; rows.forEach(function (r) { Object.keys(r.mix || {}).forEach(function (b) { if (mixKeys.indexOf(b) < 0) mixKeys.push(b); }); });
    function lab(r) { return agg === 'D' ? r.k : (r.d0 === r.d1 ? r.d0 : r.d0 + '~' + mmdd(r.d1)); }
    var html = '<section class="wb-card">' + cardHead('일봉', '하루(주·월) 단위 팀 요약 · 체결 = ' + DEF.done + '\n액면 = 적힌 것만(억)\n3선/10선 = 그 선물 바스켓 종목 호가 수\n3년/10년 Δ = 그 구간 지표 금리 변화 합(bp · ktb 종가 · 오늘처럼 종가 전이면 –)\n행 클릭 = 그 구간 3 장중 행태',
      n0(rows.length) + '행') +
      '<div class="otc-toolbar"><div class="wb-seg" id="tmAgg" role="group" aria-label="집계 단위">' + [['D', '일'], ['W', '주'], ['M', '월']].map(function (a) { return '<button type="button" data-agg="' + a[0] + '" class="' + (a[0] === agg ? 'is-active' : '') + '">' + a[1] + '</button>'; }).join('') + '</div></div>' +
      '<div class="otc-card-body"><div class="otc-cap">호가 사자/팔자</div><div class="otc-chart otc-chart--md" style="height:170px"><canvas id="tmDq"></canvas></div>' +
      '<div class="otc-cap">체결 표시 사자/팔자</div><div class="otc-chart otc-chart--md" style="height:130px"><canvas id="tmDd"></canvas></div></div></section>';
    html += '<section class="wb-card otc-mt">' + cardHead('일봉 표', DEF.vsmp, esc((d.start || '') + ' ~ ' + (d.end || ''))) + '<div class="otc-card-body" style="padding-bottom:0">' + mixLegend(mixKeys) + '</div>' +
      '<div class="wb-table-wrap otc-scroll otc-scroll--lg"><table class="wb-table otc-t"><thead><tr><th>' + (agg === 'D' ? '날짜' : '구간') + '</th>' + (agg === 'D' ? '' : '<th class="num">일</th>') +
      '<th class="num">호가</th><th class="num">종목</th><th class="num">사/팔</th><th class="num">체결 사/팔</th><th class="num">액면 사/팔(억)</th><th>주력 종목 top3</th><th>테너 믹스</th>' +
      '<th class="num">통안</th><th class="num">3선</th><th class="num">10선</th><th class="num">vs 민평 사</th><th class="num">vs 민평 팔</th>' + (agg === 'D' ? '<th>첫 / 마지막</th>' : '') +
      '<th>활동 멤버</th><th class="num">3년 Δbp</th><th class="num">10년 Δbp</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      html += '<tr class="is-click' + (r.n ? '' : ' is-muted') + '" data-d0="' + esc(r.d0) + '" data-d1="' + esc(r.d1) + '"><td class="mono">' + esc(lab(r)) + '</td>' + (agg === 'D' ? '' : '<td class="num">' + n0(r.n_days) + '</td>') +
        '<td class="num">' + n0(r.n) + '</td><td class="num">' + n0(r.n_bonds) + '</td><td class="num">' + bs(r.buy, r.sell) + '</td><td class="num">' + bs(r.done_buy, r.done_sell) + '</td><td class="num">' + bs(r.size_buy, r.size_sell) + '</td>' +
        '<td>' + topList(r.top) + '</td><td>' + mixBar(r.mix) + '</td><td class="num">' + n0(r.tong) + '</td><td class="num">' + n0(r.b3) + '</td><td class="num">' + n0(r.b10) + '</td>' +
        bpTd(r.dev_buy, 1) + bpTd(r.dev_sell, 1) + (agg === 'D' ? '<td class="mono">' + esc(r.first_t || '–') + ' / ' + esc(r.last_t || '–') + '</td>' : '') +
        '<td class="wb-muted">' + esc(r.members || '') + '</td>' + bpTd(r.d3, 1) + bpTd(r.d10, 1) + '</tr>';
    });
    if (!rows.length) html += '<tr><td colspan="18" class="wb-muted">행 없음</td></tr>';
    html += '</tbody></table></div></section>';
    el.innerHTML = html;
    var labels = asc.map(function (r) { return agg === 'D' ? mmdd(r.k) : r.k; });
    function bars(id, key, a, b) {
      mk(key, $(id), {
        type: 'bar', data: { labels: labels, datasets: [
          { label: '사자', data: asc.map(function (r) { return r[a]; }), backgroundColor: tk('--wb-down', 0.75), stack: 's' },
          { label: '팔자', data: asc.map(function (r) { return r[b]; }), backgroundColor: tk('--wb-up', 0.75), stack: 's' }] },
        options: baseOpts({ scales: { x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0, maxTicksLimit: 4 } } },
          plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false, callbacks: { title: function (it) { return it[0] ? lab(asc[it[0].dataIndex]) : ''; } } } } })
      });
    }
    bars('tmDq', 'tmDq', 'buy', 'sell');
    bars('tmDd', 'tmDd', 'done_buy', 'done_sell');
  }

  // ══ 떠 있는 툴팁(지도) ═════════════════════════════════════════════════
  function showHov(html, cx, cy) {
    var el = $('otcHov'); el.innerHTML = html; el.hidden = false;
    var w = el.offsetWidth, h = el.offsetHeight, vw = doc.documentElement.clientWidth, vh = window.innerHeight;
    var x = cx + 14, y = cy + 14;
    if (x + w > vw - 8) x = cx - w - 14;
    if (y + h > vh - 8) y = cy - h - 14;
    el.style.left = Math.max(8, x) + 'px'; el.style.top = Math.max(8, y) + 'px';
  }
  function hideHov() { var el = $('otcHov'); if (el) el.hidden = true; }

  // ══ 이벤트 ═════════════════════════════════════════════════════════════
  function onEnter(id, fn) { var el = $(id); if (el) el.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); fn(); } }); }
  function bind() {
    $('otcKeyBtn').addEventListener('click', function () { if (askKey()) start(); });
    // (A)
    $('bdLoad').addEventListener('click', function () { bondFromBar(true); });
    $('bdLatest').addEventListener('click', function () { $('bdDate').value = (S.meta && S.meta.latest) || ''; bondFromBar(true, ''); });
    $('bdPrev').addEventListener('click', function () { var h = S.bond.d && S.bond.d.head; if (h && h.prev) { $('bdDate').value = h.prev; bondFromBar(false, h.prev); } });
    $('bdNext').addEventListener('click', function () { var h = S.bond.d && S.bond.d.head; if (h && h.next) { $('bdDate').value = h.next; bondFromBar(false, h.next); } });
    onEnter('bdAlias', function () { bondFromBar(false); });
    onEnter('bdDate', function () { bondFromBar(false); });
    $('bdAlias').addEventListener('change', function () { if ($('bdAlias').value.trim()) bondFromBar(false); });
    $('bdStream').addEventListener('click', rowNav);
    $('bdRank').addEventListener('click', rowNav);
    // (B)
    $('brLoad').addEventListener('click', function () { brokerFromBar(true); });
    $('brLatest').addEventListener('click', function () { $('brAsof').value = (S.meta && S.meta.latest) || ''; brokerFromBar(true, ''); });
    $('brPeriod').addEventListener('change', function () { brokerFromBar(false); });
    onEnter('brName', function () { brokerFromBar(false); });
    onEnter('brAsof', function () { brokerFromBar(false); });
    $('brName').addEventListener('change', function () { if ($('brName').value.trim()) brokerFromBar(false); });
    $('brCover').addEventListener('click', rowNav);
    $('brRecent').addEventListener('click', rowNav);
    // (C)
    $('tmLoad').addEventListener('click', teamFromBar);
    $('tmMember').addEventListener('change', teamFromBar);
    onEnter('tmStart', teamFromBar); onEnter('tmEnd', teamFromBar);
    $('tmPeriod').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-p]'); if (!b) return;
      S.team.period = b.getAttribute('data-p'); $('tmStart').value = ''; teamFromBar();
    });
    $('tmTabs').addEventListener('click', function (e) { var b = e.target.closest('button[data-sec]'); if (b) showSec(b.getAttribute('data-sec'), false); });
    $('vTeam').addEventListener('click', teamClick);
    $('vTeam').addEventListener('input', tblFilter);
    $('vTeam').addEventListener('change', tblFilter);
    window.addEventListener('hashchange', route);
    doc.addEventListener('wb-themechange', function () { if (S.view === 'team' && S.team.sec === 'map') drawMap(); });
    var rt = null;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { if (S.view === 'team' && S.team.sec === 'map') drawMap(); }, 200); }, { passive: true });
  }
  function rowNav(e) {
    if (e.target.closest('.wb-help, a, input, select, button')) return;
    var tr = e.target.closest('tr[data-broker], tr[data-alias]'); if (!tr) return;
    if (tr.hasAttribute('data-broker')) {
      var h = S.bond.d && S.bond.d.head;
      go('broker', { name: tr.getAttribute('data-broker'), asof: h ? h.date : '', period: S.broker.period || '5d' });
    } else {
      var k = S.broker.d && S.broker.d.kpi;
      go('bond', { alias: tr.getAttribute('data-alias'), date: tr.getAttribute('data-date') || (k ? k.today : '') });
    }
  }
  function teamClick(e) {
    if (e.target.closest('.wb-help, input, select, summary')) return;
    var mb = e.target.closest('[data-more]');
    if (mb) { var key = mb.getAttribute('data-more'); var st = S.tbl[key]; if (st) { st.lim += 300; rerenderTbl(key); } return; }
    var ag = e.target.closest('button[data-agg]');
    if (ag) { S.team.agg = ag.getAttribute('data-agg'); teamStamp(); loadSec('daily', false); return; }
    if (e.target.closest('a, button')) return;
    var t = e.target.closest('[data-tbond]');
    if (t) { S.team.alias = t.getAttribute('data-tbond'); S.tbl.bep = null; S.tbl.bdone = null; showSec('bond', false); return; }
    var m = e.target.closest('tr[data-member]');
    if (m) { S.team.member = m.getAttribute('data-member'); syncTeamBar(); teamFromBar(); return; }
    var dr = e.target.closest('tr[data-d0]');
    if (dr) { S.team.start = dr.getAttribute('data-d0'); S.team.end = dr.getAttribute('data-d1'); syncTeamBar(); $('tmStart').value = S.team.start; $('tmEnd').value = S.team.end; S.team.sec = 'intra'; teamFromBar(); return; }
    var a = e.target.closest('tr[data-alias]');
    if (a) go('bond', { alias: a.getAttribute('data-alias'), date: a.getAttribute('data-date') || '' });
  }
  function curData(sec) { return S.team.d[sec] && S.team.d[sec].data; }
  function rerenderTbl(key) {
    var map = { ep: ['tmEpTbl', 'intra', 'episodes', 'ep'], done: ['tmDoneTbl', 'intra', 'done', 'done'], bep: ['tmBEpTbl', 'bond', 'episodes', 'ep'], bdone: ['tmBDoneTbl', 'bond', 'done', 'done'] }[key];
    if (!map) return;
    var d = curData(map[1]), box = $(map[0]); if (!d || !box) return;
    var focus = doc.activeElement && box.contains(doc.activeElement) ? doc.activeElement.getAttribute('data-f') : null, pos = focus ? doc.activeElement.selectionStart : null;
    box.innerHTML = map[3] === 'ep' ? epRows(key, d[map[2]] || [], { noAlias: key === 'bep' }) : doneRows(key, d[map[2]] || []);
    if (focus) { var n = box.querySelector('[data-f="' + focus + '"]'); if (n) { n.focus(); if (pos != null && n.setSelectionRange) { try { n.setSelectionRange(pos, pos); } catch (er) { /* noop */ } } } }
  }
  function tblFilter(e) {
    var f = e.target.getAttribute && e.target.getAttribute('data-f'); if (!f) return;
    var bar = e.target.closest('[data-tbl]'); if (!bar) return;
    if (e.type === 'input' && e.target.tagName === 'SELECT') return;
    if (e.type === 'change' && e.target.tagName === 'INPUT') return;
    var key = bar.getAttribute('data-tbl'), st = S.tbl[key]; if (!st) return;
    st[f] = e.target.value; st.lim = 200;
    rerenderTbl(key);
  }

  // ══ 부팅 ═══════════════════════════════════════════════════════════════
  function boot() {
    bind();
    var r = parseHash();
    if (window.WBShell) WBShell.setPage('otc-' + r.v);
    if (!getKey()) { if (!askKey()) { showGate(); return; } }
    start();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
})();
