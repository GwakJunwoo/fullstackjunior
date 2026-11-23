/* ═══════════════════════════════════════════════════════════════════════════
   wb-paper.js — 조간 탭(발화점 계층 · 박대기 기자) · tools/quant-house/#paper
   2026-11-23 사용자 지시("fullstackjunior 에 보이게" → 같은 날 "비밀번호를 넣어야만 보이게")
   ───────────────────────────────────────────────────────────────────────────
   데이터 = 백엔드 GET 4개 그대로(웹 재계산 0):
     /quant-house/ignition/paper[?date=YYYY-MM-DD]  조간 HTML 원문 + 날짜 목록 + 견본 여부
     /quant-house/ignition/state                     엔진 상태(본인 관련 필드는 서버가 뺌) + 이름표(labels) + 유사 국면 문장(analog_text)
     /quant-house/ignition/form                      본인 확률 입력 화면(엔진 api.form — 대상일 · 마감 · 봉인 여부 · 사건 · 이미 적은 값)
     /quant-house/ignition/mine                      내 기록(엔진 api.mine — 내 확률·시스템 기대·실현·오차 · 발화점 판정)
   쓰기 = POST 2개(2026-11-23 사용자 지시 "웹에서 본인 확률·발화점 판정 입력") — 같은 비밀번호 뒤 · JSON 본문만:
     /quant-house/ignition/view   {views:{사건 id: 확률 0~1}, memo?}   적은 칸·바꾼 칸만 보낸다
     /quant-house/ignition/taste  {ignition_id, verdict: pick|drop, memo?}
     유효(마감 전)·먼저 적음(봉인 전)·확률 범위·없는 발화점은 엔진 원장이 판정한다 — 화면은 돌려받은 값과 문구를 그대로 보여 준다.
     대상일은 화면이 정하지 않는다(엔진이 다음 거래일을 고른다). 화면의 남은 시간은 표시일 뿐이다.
   비밀번호: 서버가 X-IGN-PASS 헤더를 검증한다(401 = 틀림). 값은 이 파일·정적 파일 어디에도 없다.
             맞은 값만 sessionStorage 에 둔다(탭을 닫으면 사라짐 · localStorage 안 씀). 주소(URL)에는 싣지 않는다.
   조간 본문: <iframe sandbox="allow-same-origin" srcdoc> — 스크립트 불허(allow-scripts 없음).
             same-origin 은 바깥에서 높이를 재고 신문 자체의 밝은/어두운 테마 속성(data-theme)을 맞추는 데만 쓴다.
             본문 HTML 문자열은 한 글자도 바꾸지 않는다. 인증된 응답으로만 채운다.
   표시 규칙: 확률 = 값×100 을 소수 1자리까지(표시만) · 그 밖의 숫자는 json 값 그대로 · 없는 값은 '—'.
             입력 칸도 % 소수 1자리(70.5 → 0.705 로 보냄 · 엔진이 소수 3자리로 받는다).
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var doc = document, root = doc.documentElement;
  var SS = 'ign.pass', FOLD_LS = 'paper.fold';
  var P = { mem: '', busy: false, seq: 0, started: false, date: null, dates: [], paper: null, state: null, frame: null, ro: null,
            form: null, formAt: 0, formErr: '', mine: null, mineErr: '', draft: {}, memo: '', viewRes: null, vmsg: null, wbusy: false,
            tdraft: {}, tmsg: {}, tbusy: '', tick: null };
  var KIND = { miss: '하루 오답', cum: '누적 어긋남', thread: '서사 줄기 무효' };
  var STAGE = { 1: '기록', 2: '제안', 3: '한도 내 자율', 4: '다시장' };
  var VERDICT = { pick: '집음', drop: '버림' };
  var FATE = { confirmed: '맞음', invalidated: '틀림', expired: '판가름 안 남', closed_by_model: '닫음' };
  var FOLD_DEFAULT = { view: true, expect: false, ign: true, threads: false, outlook: false, cum: false, score: false, hist: false };
  var STEP = 5, STEP_MIN = 5, STEP_MAX = 95, STEP_START = 50;    // − / + 버튼의 걸음(%p)과 멈추는 곳 — 누르기 편하라고 둔 것일 뿐, 받는 범위는 엔진이 정한다
  var FORM_STALE_MS = 60000, TICK_MS = 20000;

  function $(id) { return doc.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function num(v) { return (v == null || v === '') ? '—' : (isNum(v) ? String(v) : esc(v)); }
  function pct(p) { return isNum(p) ? (Math.round(p * 1000) / 10) + '%' : '—'; }
  function hm(ts) { return (typeof ts === 'string' && ts.length >= 16) ? ts.slice(11, 16) : '—'; }
  function todayKst() { return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); }
  function isDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }
  function help(text) { return (window.WBShell && window.WBShell.helpBtn) ? window.WBShell.helpBtn(text) : ''; }

  // ── 비밀번호(세션에만) ────────────────────────────────────────────────
  function pw() { try { return window.sessionStorage.getItem(SS) || ''; } catch (e) { return P.mem || ''; } }
  function pwSet(v) {
    try { if (v) window.sessionStorage.setItem(SS, v); else window.sessionStorage.removeItem(SS); } catch (e) { /* 저장 불가 — 이 화면 동안만 */ }
    P.mem = v || '';
  }

  // ── 요청(GET · 쓰기는 POST JSON 본문) ─────────────────────────────────
  function E(kind, msg) { var e = new Error(msg || kind); e.kind = kind; e.detail = msg || ''; return e; }
  function xget(path, pass) { return xsend('GET', path, pass); }
  function xpost(path, pass, body) { return xsend('POST', path, pass, body); }
  async function xsend(method, path, pass, body) {
    if (!pass || /[^\x20-\x7e]/.test(pass)) throw E('pw');           // 헤더에 실을 수 없는 글자 = 틀린 값(요청 안 보냄)
    var base = await getApiBase();
    if (!base) base = await getApiBase(true);
    if (!base) throw E('net');
    var hd = { 'X-IGN-PASS': pass, 'ngrok-skip-browser-warning': '1' };
    var opt = { headers: hd };
    if (method === 'POST') { hd['Content-Type'] = 'application/json'; opt.method = 'POST'; opt.body = JSON.stringify(body); }
    // 다시 보내기는 '주소가 바뀌었을 때만'(옛 터널 주소로 간 요청은 서버에 닿지 못했다) — 같은 주소로는 다시 보내지 않는다(쓰기 중복 방지).
    var call = function (b) { return fetch(b + path, opt); };
    var res;
    try { res = await call(base); }
    catch (e) {
      var fb = await getApiBase(true);
      if (fb && fb !== base) { try { res = await call(fb); } catch (e2) { throw E('net'); } }
      else throw E('net');
    }
    if (res.status === 404 || res.status === 502 || res.status === 503 || res.status === 530) {   // 터널 주소가 바뀐 신호 → 새 주소로 1회
      var fb2 = await getApiBase(true);
      if (fb2 && fb2 !== base) { try { res = await call(fb2); } catch (e3) { throw E('net'); } }
    }
    if (res.status === 401) throw E('pw');
    if (res.ok) return res.json();
    if (method === 'POST') {                                           // 쓰기 거부 사유 = 서버(엔진) 문구 그대로
      var why = '';
      try { var dj = await res.json(); if (dj && typeof dj.detail === 'string') why = dj.detail; } catch (e4) { /* 본문 없음 */ }
      throw E('write', why || ('기록하지 못했습니다(서버 응답 ' + res.status + ')'));
    }
    if (res.status === 429) throw E('lock');
    if (res.status === 403) throw E('unset');
    throw E('http', String(res.status));
  }
  function emsg(e) {
    var k = e && e.kind;
    if (k === 'write') return e.detail || '기록하지 못했습니다';
    if (k === 'pw') return '비밀번호가 맞지 않습니다';
    if (k === 'lock') return '연속으로 틀렸습니다 — 잠시 뒤 다시 시도하세요';
    if (k === 'unset') return '서버에 비밀번호가 설정되지 않았습니다';
    if (k === 'net') return '서버에 연결할 수 없습니다';
    if (k === 'http') return '서버 오류 ' + (e.message || '');
    return '불러오기 실패';
  }

  // ── 비밀번호 칸 ↔ 본문 ───────────────────────────────────────────────
  function gate(show, msg, err) {
    var g = $('ppGate'), b = $('ppBody'), m = $('ppPwMsg');
    if (!g || !b) return;
    g.hidden = !show; b.hidden = !!show;
    if (m) { m.textContent = msg || ''; m.classList.toggle('is-err', !!err); }
    if (show) { var sb = $('ppSample'); if (sb) sb.hidden = true; }
  }
  function clearContent() {       // 잠그면 받은 내용도 화면에서 지운다
    P.paper = null; P.state = null; P.dates = []; P.date = null; P.seq++;
    P.form = null; P.formAt = 0; P.formErr = ''; P.mine = null; P.mineErr = ''; P.draft = {}; P.memo = ''; P.viewRes = null; P.vmsg = null;
    P.wbusy = false; P.tdraft = {}; P.tmsg = {}; P.tbusy = '';
    if (P.tick) { clearInterval(P.tick); P.tick = null; }
    dropFrame();
    ['ppPaper', 'ppView', 'ppState', 'ppHist', 'ppNotice', 'ppStNotice'].forEach(function (id) { var el = $(id); if (el) el.innerHTML = ''; });
    var sm = $('ppStMeta'); if (sm) sm.textContent = '';
    var sel = $('ppDate'); if (sel) sel.innerHTML = '';
    setMsg('');
  }
  function lock(msg) { pwSet(''); clearContent(); gate(true, msg == null ? '잠겼습니다 — 다시 보려면 비밀번호' : msg, false); }
  async function submit(ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    if (P.busy) return;
    var inp = $('ppPw'), v = inp ? inp.value : '';
    if (!v) { gate(true, '비밀번호를 넣으세요', true); return; }
    P.busy = true; gate(true, '확인 중…', false);
    try {
      var j = await xget(paperPath(hashDate()), v);
      pwSet(v);                                                        // 서버가 맞다고 한 값만 세션에
      if (inp) inp.value = '';
      P.busy = false; gate(false, '', false);
      renderPaper(j);
      loadState(); loadInput();
    } catch (e) {
      P.busy = false; pwSet('');
      gate(true, emsg(e), true);
      if (inp && e && e.kind === 'pw') { inp.value = ''; try { inp.focus(); } catch (e4) { /* noop */ } }
    }
  }

  // ── 조간 본문 ────────────────────────────────────────────────────────
  function paperPath(date) { return '/quant-house/ignition/paper' + (isDate(date) ? '?date=' + date : ''); }
  function hashDate() { var d = (location.hash || '').slice(1).split('/')[1]; return isDate(d) ? d : null; }
  function setMsg(t, err) { var el = $('ppMsg'); if (!el) return; el.textContent = t || ''; el.classList.toggle('wb-error', !!err); }
  function dropFrame() {
    if (P.ro) { try { P.ro.disconnect(); } catch (e) { /* noop */ } P.ro = null; }
    if (P.frame && P.frame.parentNode) P.frame.parentNode.removeChild(P.frame);
    P.frame = null;
  }
  function frameDoc() { try { return P.frame ? P.frame.contentDocument : null; } catch (e) { return null; } }
  function fit() {                 // 높이 = 신문 내용 높이(안쪽 스크롤 없음). 안을 못 읽으면 고정 높이 + 안쪽 스크롤로 물러난다.
    var f = P.frame; if (!f) return;
    var d = frameDoc();
    if (!d || !d.body) { f.classList.add('is-fixed'); return; }
    if (f.offsetParent === null) return;                               // 탭이 숨겨져 있으면 폭이 0 — 다시 보일 때 잰다
    var h = Math.ceil(Math.max(d.body.scrollHeight || 0, d.body.getBoundingClientRect().height || 0));
    if (h > 0) { f.classList.remove('is-fixed'); f.style.height = (h + 1) + 'px'; }
  }
  function themeSync() {           // 신문이 스스로 가진 밝은/어두운 판형을 사이트 테마에 맞춘다(신문 CSS 가 읽는 속성만 · 본문 무변경)
    var d = frameDoc(); if (!d || !d.documentElement) return;
    d.documentElement.setAttribute('data-theme', root.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
  }
  function mountFrame(html, date) {
    var host = $('ppPaper'); if (!host) return;
    dropFrame(); host.innerHTML = '';
    var f = doc.createElement('iframe');
    f.className = 'pp-frame';
    f.setAttribute('sandbox', 'allow-same-origin');                    // allow-scripts 없음 = 스크립트 불허
    f.setAttribute('title', '조간 본문 ' + (date || ''));
    f.setAttribute('referrerpolicy', 'no-referrer');
    f.addEventListener('load', function () {
      if (P.frame !== f) return;
      themeSync(); fit();
      var d = frameDoc();
      if (d && d.body && window.ResizeObserver) {
        try { P.ro = new ResizeObserver(function () { fit(); }); P.ro.observe(d.body); } catch (e) { P.ro = null; }
      }
      setTimeout(fit, 300); setTimeout(fit, 1200);                     // 글꼴이 늦게 잡히는 경우
    });
    P.frame = f;
    f.srcdoc = html;
    host.appendChild(f);
  }
  function renderPaper(j) {
    P.paper = j || {};
    var dates = Array.isArray(P.paper.dates) ? P.paper.dates.filter(isDate) : [];
    P.dates = dates; P.date = isDate(P.paper.date) ? P.paper.date : (dates[0] || null);
    var sel = $('ppDate');
    if (sel) {
      sel.innerHTML = dates.map(function (d) { return '<option value="' + esc(d) + '"' + (d === P.date ? ' selected' : '') + '>' + esc(d) + '</option>'; }).join('');
      sel.disabled = dates.length < 2;
    }
    var i = dates.indexOf(P.date);
    var prev = $('ppPrev'), next = $('ppNext');
    if (prev) prev.disabled = !(i >= 0 && i < dates.length - 1);       // 목록은 최신 먼저 → 이전 = 뒤쪽
    if (next) next.disabled = !(i > 0);
    var sb = $('ppSample'); if (sb) sb.hidden = !P.paper.sample;
    var note = $('ppNotice'), host = $('ppPaper');
    var nh = '';
    if (P.paper.sample) {
      nh += '<div class="wb-notice wb-notice--warn pp-notice"><b>견본(시험 발행) — 운영 기록 아님.</b> 성적 의미가 없습니다. 운영 조간이 아직 없어 견본을 보여 줍니다 — 첫 운영 조간이 생기면 견본은 자동으로 빠집니다.</div>';
    }
    var today = todayKst();
    if (!P.paper.sample && dates.length && dates[0] !== today) {
      nh += '<div class="wb-notice pp-notice">오늘(' + esc(today) + ') 발행분은 없습니다 · 최신 발행 ' + esc(dates[0]) + '</div>';
    }
    if (note) note.innerHTML = nh;
    if (P.paper.available && typeof P.paper.html === 'string' && P.paper.html) {
      mountFrame(P.paper.html, P.date);
      setMsg((P.paper.sample ? '견본 · ' : '') + '발행일 ' + (P.date || '—') + (P.paper.written_at ? ' · 파일 기록 ' + String(P.paper.written_at).slice(0, 16).replace('T', ' ') : ''));
    } else {
      dropFrame();
      var none = P.paper.source === 'none';
      if (host) host.innerHTML = '<div class="wb-empty"><div class="wb-empty-title">' + (none ? '아직 첫 발행 전입니다' : '이 날짜의 조간이 없습니다') + '</div>' +
        '<div class="wb-empty-text">' + (none ? '조간은 평일 아침 일일 갱신 때 만들어집니다.' : esc(P.paper.note || '')) + '</div></div>';
      setMsg(none ? '조간 없음' : (P.date ? P.date + ' 없음' : '조간 없음'), !none);
    }
  }
  async function loadPaper(date) {
    var pass = pw(); if (!pass) { gate(true, '', false); return; }
    var seq = ++P.seq;
    setMsg('불러오는 중…');
    try {
      var j = await xget(paperPath(date), pass);
      if (seq !== P.seq) return;
      renderPaper(j);
      if (isDate(P.date) && (location.hash || '').slice(1).split('/')[0] === 'paper') {
        try { history.replaceState(null, '', '#paper/' + P.date); } catch (e) { /* noop */ }
      }
    } catch (e) {
      if (seq !== P.seq) return;
      if (e && e.kind === 'pw') { lock(emsg(e)); gate(true, emsg(e), true); return; }
      setMsg(emsg(e), true);
      if (!P.paper) { var host = $('ppPaper'); if (host) host.innerHTML = '<div class="wb-empty"><div class="wb-empty-title">조간을 불러오지 못했습니다</div><div class="wb-empty-text">' + esc(emsg(e)) + '</div></div>'; }
    }
  }
  function step(dir) {             // dir = -1 이전(더 옛날) · +1 다음(더 최근)
    var i = P.dates.indexOf(P.date); if (i < 0) return;
    var d = P.dates[i - dir]; if (d) loadPaper(d);
  }

  // ── 현황(상태 json 그대로) ───────────────────────────────────────────
  function folds() {
    var o = {}; try { o = JSON.parse(window.localStorage.getItem(FOLD_LS) || '{}') || {}; } catch (e) { o = {}; }
    var out = {}; Object.keys(FOLD_DEFAULT).forEach(function (k) { out[k] = (typeof o[k] === 'boolean') ? o[k] : FOLD_DEFAULT[k]; });
    return out;
  }
  function foldSave(k, open) {     // 접기 상태(화면 취향)만 기억 — 비밀번호와 무관
    var o = folds(); o[k] = !!open;
    try { window.localStorage.setItem(FOLD_LS, JSON.stringify(o)); } catch (e) { /* noop */ }
  }
  function card(key, title, meta, body, open, helpText) {
    return '<details class="wb-card pp-fold" data-k="' + esc(key) + '"' + (open ? ' open' : '') + '>' +
      '<summary class="wb-card-head"><span class="wb-card-title">' + esc(title) + '</span>' + (helpText ? help(helpText) : '') +
      '<span class="wb-card-meta">' + (meta || '') + '</span></summary>' +
      '<div class="pp-fold-body">' + body + '</div></details>';
  }
  function empty(t) { return '<div class="pp-empty">' + esc(t) + '</div>'; }
  function table(heads, rows, cls) {
    return '<div class="wb-table-wrap"><table class="wb-table pp-table' + (cls ? ' ' + cls : '') + '"><thead><tr>' +
      heads.map(function (h) { return '<th' + (h.num ? ' class="num"' : '') + '>' + esc(h.t) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.join('') + '</tbody></table></div>';
  }
  function obsLabel(L, id) { return (L && L.obs && L.obs[id]) ? L.obs[id] : id; }
  function metricLabel(L, id) { return (L && L.thread_metrics && L.thread_metrics[id]) ? L.thread_metrics[id] : id; }
  function cond(L, iv) { return iv ? (metricLabel(L, iv.metric) + ' ' + (iv.op == null ? '' : iv.op) + ' ' + (iv.value == null ? '—' : iv.value)) : '—'; }
  function sealClass(c) { return c === 'on_time' ? '정시 봉인' : '늦은 봉인(성적표 미산입)'; }

  function blockExpect(s, L) {
    var seal = s.seal;
    if (!seal) return card('expect', '오늘의 기대', '봉인된 기대 없음', empty(s.skip_reason ? '오늘 기대는 봉인하지 않았습니다 — ' + s.skip_reason : '봉인된 기대가 없습니다.'), folds().expect);
    var ex = seal.expect || {}, bl = seal.baselines || {};
    var rows = Object.keys(ex).map(function (id) {
      var e = ex[id] || {}, b = bl[id] || {};
      var note = e.no_view ? ('뷰 없음' + (e.reason ? ' — ' + e.reason : '')) : (e.why || '');
      return '<tr><td>' + esc(obsLabel(L, id)) + '</td><td class="num">' + pct(e.p) + '</td><td class="num">' + pct(b.p_clim) + '</td>' +
        '<td class="pp-wrap' + (e.no_view ? ' pp-warn' : '') + '">' + esc(note) + '</td></tr>';
    });
    var body = (seal.narrative ? '<p class="pp-narr">' + esc(seal.narrative) + '</p>' : '') +
      table([{ t: '사건' }, { t: '확률', num: 1 }, { t: '평소 빈도', num: 1 }, { t: '비고' }], rows);
    var dv = Array.isArray(seal.devil) ? seal.devil : [];
    if (dv.length) {
      var tmap = {}; (s.threads || []).forEach(function (t) { if (t && t.id) tmap[t.id] = t.title; });
      body += '<details class="pp-sub"><summary>반대 논리 ' + dv.length + '건</summary><ul class="pp-list">' + dv.map(function (d) {
        var who = d.target === 'narrative' ? '서사 전체' : (tmap[d.target] ? '줄기: ' + tmap[d.target] : '줄기');
        return '<li><span class="pp-tag">' + esc(who) + '</span> ' + esc(d['case']) + '<div class="pp-dim">이렇게 보이면 틀린 것: ' + esc(d.would_show) + '</div></li>';
      }).join('') + '</ul></details>';
    }
    if (Array.isArray(seal.inputs_missing) && seal.inputs_missing.length) body += '<div class="pp-dim pp-pad">입력 누락: ' + esc(seal.inputs_missing.join(' / ')) + '</div>';
    var meta = '대상일 ' + esc(seal.target) + ' · ' + esc(hm(seal.sealed_at)) + ' ' + sealClass(seal.seal_class) +
      (seal.no_view != null ? ' · 뷰 없음 ' + esc(seal.no_view) + '건' : '') + (seal.scored ? ' · 채점됨' : '');
    return card('expect', '오늘의 기대', meta, body, folds().expect,
      '사건마다 일어날 확률을 대상일 아침에 먼저 적어 봉인한 것. 평소 빈도 = 최근 250거래일에 그 사건이 일어난 비율. 뷰 없음 = 표현을 바꿔 다시 물었을 때 답이 뒤집혔거나 응답이 없어 평소 빈도로 대신 적은 사건. 값은 엔진 상태 그대로.');
  }
  function pointBody(p, L) {
    if (p.kind === 'miss') return '일어날 확률 ' + pct(p.p) + ' 로 봤는데 ' + (p.outcome === 1 ? '일어남' : '안 일어남') + '.';
    if (p.kind === 'cum') return esc(p.start) + ' 부터 ' + num(p.n_days) + '거래일째 ' + esc(p.way) + '(누적 ' + num(p.s) + ').';
    if (p.kind === 'thread') return esc(p.opened) + ' 에 연 줄기. 무효 조건 ' + esc(cond(L, p.invalidation)) + ' 충족(현재 ' + num(p.inv_value) + '). 그동안 가리킨 방향 적중 ' + num(p.hits) + '/' + num(p.n) + '.';
    return '';
  }
  function blockIgn(s, L) {
    var ign = Array.isArray(s.ignitions) ? s.ignitions : [];
    if (!ign.length) {
      var lt = s.last_score && s.last_score.target;
      return card('ign', '발화점', '0건', empty(lt ? lt + ' 채점까지 발화점이 없습니다(기대와 크게 어긋난 곳 없음).' : '아직 채점된 기대가 없습니다.'), folds().ign);
    }
    var latest = ign[0].target, nLatest = ign.filter(function (p) { return p.target === latest; }).length;
    var html = '', cur = null;
    ign.forEach(function (p) {
      if (p.target !== cur) { if (cur !== null) html += '</ul>'; cur = p.target; html += '<div class="pp-group">' + esc(p.target) + ' 채점</div><ul class="pp-points">'; }
      var flags = [];
      if (p.late_seal) flags.push('늦은 봉인의 기대 — 참고만');
      if (p.obvious) flags.push('기사에 이미 설명 있음' + (p.obvious_note ? ': ' + p.obvious_note : ''));
      if (p.price_setter) flags.push('가격을 정하는 주체의 행동');
      if (Array.isArray(p.also) && p.also.length) flags.push('같이 어긋남: ' + p.also.join(' · '));
      html += '<li class="pp-point"><div class="pp-point-head"><span class="wb-badge' + (p.kind === 'thread' ? ' wb-badge--warn' : '') + '">' + esc(KIND[p.kind] || '발화점') + '</span>' +
        '<b>' + esc(p.label) + '</b><span class="pp-dim">' + esc(p.id) + '</span></div>' +
        '<div class="pp-point-body">' + pointBody(p, L) + (flags.length ? ' <span class="pp-dim">(' + esc(flags.join(' · ')) + ')</span>' : '') + '</div>';
      var hy = Array.isArray(p.hypotheses) ? p.hypotheses : [];
      var an = (typeof p.analog_text === 'string' && p.analog_text) ? '<li><span class="pp-tag">유사 국면</span> ' + esc(p.analog_text) + '</li>'
        : (p.analog_text_note ? '<li><span class="pp-tag">유사 국면</span> <span class="pp-dim">' + esc(p.analog_text_note) + '</span></li>' : '');
      if (an || hy.length || p.need_data || p.next_question) {
        html += '<ul class="pp-list">' + an + hy.map(function (h, i) {
          var cr = h.check_result, crh = '';                            // 조회 결과 = 엔진이 돌린 문장 그대로(못 돌렸으면 엔진이 적은 사유)
          if (cr) crh = '<div class="pp-dim">조회: ' + (cr.ok ? esc(cr.text) : '조회 안 됨(' + esc(cr.why == null ? '사유 없음' : cr.why) + ')') + '</div>';
          return '<li><span class="pp-tag">가설 ' + (i + 1) + '</span> ' + esc(h.h) + ' <span class="pp-dim">→ 맞다면 ' + esc(h.if_true_then) + '</span>' + crh + '</li>';
        }).join('') +
          (p.need_data ? '<li><span class="pp-tag">가를 데이터</span> ' + esc(p.need_data) + '</li>' : '') +
          (p.next_question ? '<li><span class="pp-tag">다음 질문</span> ' + esc(p.next_question) + '</li>' : '') + '</ul>';
      }
      html += tasteBox(p) + '</li>';
    });
    html += '</ul>';
    return card('ign', '발화점', esc(latest) + ' 채점에서 ' + nLatest + '건', html, folds().ign,
      '기대와 실제가 어긋난 곳. 하루 오답 = 실현된 쪽에 준 확률이 낮았고 평소 빈도보다 더 틀린 날. 누적 어긋남 = 같은 방향의 작은 오차가 쌓여 문턱을 넘음. 서사 줄기 무효 = 줄기를 열 때 적어 둔 무효 조건 충족. 가설은 가설일 뿐 — 매매 제안이 아니다. ' +
      '유사 국면 · 조회 = 엔진이 과거 날들을 찾아본 문장 그대로(조회일 뿐 검정이 아니다 — 창이 겹치고 여러 번 들여다본다). ' +
      '집음 / 버림 = 이 발화점을 볼 만하다고 봤는지 남기는 기록. 다시 누르면 새 판정이 덧붙고 마지막 것이 유효하다(지난 판정은 원장에 남는다). 지금은 기록만 — 발화점 순위에 반영하지 않는다.');
  }
  // ── 발화점 판정(집음 / 버림) ─────────────────────────────────────────
  function stamp(ts) { return (typeof ts === 'string' && ts.length >= 16) ? ts.slice(5, 16).replace('T', ' ') : '—'; }
  function tasteBox(p) {
    if (p == null || p.id == null || p.id === '') return '';
    var id = String(p.id), t = (P.mine && P.mine.tastes) ? P.mine.tastes[id] : null, m = P.tmsg[id], busy = P.tbusy === id;
    var now = !P.mine ? (P.mineErr ? '<span class="pp-warn">판정 기록을 불러오지 못했습니다 — ' + esc(P.mineErr) + '</span>' : '판정 기록 읽는 중')
      : (t ? '내 판정 <b>' + esc(VERDICT[t.verdict] || t.verdict) + '</b> · ' + esc(stamp(t.ts)) + (t.memo ? ' · ' + esc(t.memo) : '') : '아직 판정 없음');
    var btn = function (v) {
      return '<button type="button" class="wb-chip pp-tbtn" data-v="' + v + '" aria-pressed="' + (t && t.verdict === v ? 'true' : 'false') + '"' + (busy ? ' disabled' : '') +
        ' title="다시 누르면 새 판정이 덧붙는다(마지막 것이 유효)">' + VERDICT[v] + '</button>';
    };
    return '<div class="pp-taste" data-id="' + esc(id) + '"><span class="pp-dim pp-taste-now">' + now + '</span>' +
      '<span class="pp-taste-ctl">' + btn('pick') + btn('drop') +
      '<input class="wb-input pp-taste-memo" type="text" maxlength="300" autocomplete="off" placeholder="메모 · 선택" aria-label="판정 메모(선택)" value="' + esc(P.tdraft[id] || '') + '">' +
      '</span><span class="pp-msg pp-taste-msg' + (m && m.err ? ' is-err' : '') + '" role="status">' + esc(busy ? '기록 중…' : (m ? m.t : '')) + '</span></div>';
  }
  async function sendTaste(id, verdict) {
    if (P.tbusy || !VERDICT[verdict]) return;
    var pass = pw(); if (!pass) { gate(true, '', false); return; }
    var body = { ignition_id: id, verdict: verdict }, memo = String(P.tdraft[id] || '').trim();
    if (memo) body.memo = memo;
    P.tbusy = id; delete P.tmsg[id]; reState();
    try {
      var r = await xpost('/quant-house/ignition/taste', pass, body);
      if (!pw()) return;                                               // 그 사이 잠김
      P.tmsg[id] = { t: '기록됨 — ' + (VERDICT[r && r.verdict] || (r && r.verdict) || '') + ' · ' + stamp(r && r.ts), err: false };
      delete P.tdraft[id];
      P.tbusy = '';
      await loadMine();                                                // 화면의 '내 판정'은 엔진 기록에서 다시 읽은 값
    } catch (e) {
      P.tbusy = '';
      if (e && e.kind === 'pw') { lock(emsg(e)); gate(true, emsg(e), true); return; }
      P.tmsg[id] = { t: emsg(e), err: true };
      reState();
    }
  }
  function reState() { if (P.state && P.state.available) renderState(P.state); }
  function blockThreads(s, L) {
    var th = Array.isArray(s.threads) ? s.threads : [];
    if (!th.length) return card('threads', '서사 줄기', '0개', empty('열린 서사 줄기가 없습니다.'), folds().threads);
    var nOpen = th.filter(function (t) { return t.status === 'open'; }).length;
    var rows = th.map(function (t) {
      var iv = t.invalidation || {}, cf = t.confirm || null, open = t.status === 'open', so = t.since_open || {};
      var nowOf = function (c) { return (open && c && c.metric != null && so[c.metric] != null) ? '<div class="pp-dim">지금 ' + num(so[c.metric]) + '</div>' : ''; };
      var fate = t.fate != null ? t.fate : (open ? (t.invalidated ? 'invalidated' : null) : t.close_type);
      var st = open
        ? (fate === 'invalidated' ? '<span class="pp-warn">틀렸다고 볼 선에 닿음</span>' : fate === 'confirmed' ? '<b>맞았다고 볼 선에 닿음</b>' : fate === 'expired' ? '<span class="pp-warn">기한 넘김</span>' : '열림')
        : ('<b>' + esc(FATE[fate] || '닫음') + '</b>' + (t.close_reason ? ' — ' + esc(t.close_reason) : ''));
      var age = (t.age_days != null || t.horizon != null) ? '<div class="pp-dim">' + (t.age_days != null ? num(t.age_days) + '거래일째' : '') + (t.age_days != null && t.horizon != null ? ' · ' : '') + (t.horizon != null ? '기한 ' + num(t.horizon) + '일' : '') + '</div>' : '';
      return '<tr' + (open ? '' : ' class="pp-closed"') + '><td class="pp-wrap"><b>' + esc(t.title) + '</b>' + (t.claim ? '<div class="pp-dim">' + esc(t.claim) + '</div>' : '') + '</td>' +
        '<td>' + esc(t.opened) + age + '</td>' +
        '<td class="pp-wrap">' + (cf ? esc(cond(L, cf)) + nowOf(cf) + (isNum(t.progress) ? '<div class="pp-dim">확증선까지 ' + pct(t.progress) + '</div>' : '') : '—') + '</td>' +
        '<td class="pp-wrap">' + esc(cond(L, iv)) + nowOf(iv) + '</td>' +
        '<td class="num">' + (open ? num(t.hits) + '/' + num(t.n) : '—') + '</td><td class="pp-wrap">' + st + '</td></tr>';
    });
    var tl = (s.scoreboard && s.scoreboard.threads) || null;
    var tally = tl ? ' · 지금까지 맞음 ' + num(tl.confirmed) + ' · 틀림 ' + num(tl.invalidated) + ' · 판가름 안 남 ' + num(tl.expired) : '';
    return card('threads', '서사 줄기', '열림 ' + nOpen + '개 · 전체 ' + th.length + '개' + tally,
      table([{ t: '줄기' }, { t: '연 날' }, { t: '맞았다고 볼 선' }, { t: '틀렸다고 볼 선' }, { t: '적중', num: 1 }, { t: '상태' }], rows), folds().threads,
      '며칠~몇 주짜리 이야기. 열 때 맞았다고 볼 선(확증 조건) · 틀렸다고 볼 선(무효 조건) · 기한을 같이 적고, 그 뒤로는 못 바꾼다(바꾸려면 닫고 새로 연다). 지금 = 연 날 이후 누적. ' +
      '확증선까지 % = 그 누적이 확증선의 몇 %까지 왔나(반대쪽이면 0% · 엔진 값). 둘 다 닿으면 틀린 것으로 본다. 기한을 넘기면 \'판가름 안 남\'으로 닫는다. 적중 = 줄기가 가리킨 방향이 맞은 채점 수 / 전체. 값은 엔진 상태 그대로.');
  }
  function blockOutlook(s) {
    var ol = (s.outlook && typeof s.outlook === 'object' && !Array.isArray(s.outlook)) ? s.outlook : null, ks = ol ? Object.keys(ol) : [];
    if (!ks.length) return '';                                         // 엔진이 전망을 안 실은 상태(옛 상태 파일 · 봉인 없는 날)면 카드 자체를 안 그린다
    var rows = ks.map(function (k) { return '<tr><td>' + esc(k) + '</td><td class="pp-wrap">' + esc(ol[k]) + '</td></tr>'; });
    return card('outlook', '흐름 전망', '계열 ' + ks.length + '개 · 조회일 뿐 검정 아님',
      table([{ t: '계열' }, { t: '비슷한 흐름 뒤 과거에는' }], rows), folds().outlook,
      '지금 흐름(마지막 전환 이후 며칠 · 얼마)과 방향 · 길이 · 크기가 비슷했던 과거 흐름들 뒤의 5일 · 21일. 문장은 엔진이 만든 그대로. 조회일 뿐 검정이 아니다 — 같은 흐름은 한 번만 세었고, 8번 미만이면 판단을 보류한다. 매매 제안이 아니다.');
  }
  function blockCum(s, L) {
    var cu = s.cusum || {}, hot = [];
    Object.keys(cu).forEach(function (id) {
      var v = cu[id] || {}, up = isNum(v.up) ? v.up : 0, dn = isNum(v.dn) ? v.dn : 0;
      if (Math.max(up, dn) > 0) hot.push(up >= dn ? { id: id, side: '기대보다 자주', val: v.up, start: v.up_start, n: v.up_n } : { id: id, side: '기대보다 덜', val: v.dn, start: v.dn_start, n: v.dn_n });
    });
    hot.sort(function (a, b) { return b.val - a.val; });
    var h = (L && isNum(L.cusum_h)) ? L.cusum_h : null;
    if (!hot.length) return card('cum', '쌓이는 중인 어긋남', '0건', empty('쌓이는 중인 어긋남이 없습니다.'), folds().cum);
    var rows = hot.map(function (r) {
      return '<tr><td>' + esc(obsLabel(L, r.id)) + '</td><td>' + esc(r.side) + '</td><td>' + esc(r.start == null ? '—' : r.start) + '</td>' +
        '<td class="num">' + num(r.n) + '</td><td class="num">' + num(r.val) + (h != null ? ' / ' + num(h) : '') + '</td></tr>';
    });
    return card('cum', '쌓이는 중인 어긋남', hot.length + '건' + (h != null ? ' · 문턱 ' + num(h) : ''),
      table([{ t: '사건' }, { t: '방향' }, { t: '시작' }, { t: '거래일', num: 1 }, { t: h != null ? '누적 / 문턱' : '누적', num: 1 }], rows), folds().cum,
      '하루하루는 작아도 같은 방향으로 계속 틀리면 쌓인다. 누적이 문턱을 넘으면 발화점으로 올라가고 0 으로 돌아간다. 기대보다 자주 = 적어 둔 확률보다 실제로 더 자주 일어남.');
  }
  function blockScore(s, L) {
    var sb = s.scoreboard || {}, br = sb.brier || {}, stg = sb.stage || {}, ls = s.last_score;
    var now = stg.now != null ? stg.now : s.stage;
    var kp = function (dt, val, sub) { return '<div class="wb-kpi"><dt>' + esc(dt) + '</dt><dd><span class="wb-kpi-val">' + val + '</span>' + (sub ? '<span class="wb-kpi-sub">' + sub + '</span>' : '') + '</dd></div>'; };
    var body = '<dl class="wb-kpis pp-kpis">' +
      kp('정시 채점일', num(sb.days) + '일', '늦은 봉인 ' + num(sb.late_days) + '일') +
      kp('오차 점수 · 기대', num(br.narr), '낮을수록 좋음') +
      kp('평소 빈도', num(br.clim)) +
      kp('전일 조건부', num(br.markov)) +
      kp('평소 빈도 대비 개선', num(sb.skill_vs_clim)) +
      kp('단계', num(now) + '/4', esc(STAGE[now] || '') + ' · 승급 검토 최소 ' + num(stg.need_days) + '일 중 ' + num(stg.have_days) + '일') +
      '</dl>';
    var extra = [];
    if (isNum(sb.no_view) && sb.no_view > 0) extra.push('뷰 없음 ' + sb.no_view + '건');
    if (isNum(sb.all_no_view_days) && sb.all_no_view_days > 0) extra.push('전부 뷰 없음인 날 ' + sb.all_no_view_days + '일');
    if (isNum(sb.other_spec_days) && sb.other_spec_days > 0) extra.push('규칙이 달라 뺀 날 ' + sb.other_spec_days + '일');
    if (isNum(sb.not_live_days) && sb.not_live_days > 0) extra.push('운영 실행이 아니라 뺀 날 ' + sb.not_live_days + '일');
    if (extra.length) body += '<div class="pp-dim pp-pad">' + esc(extra.join(' · ')) + '</div>';
    if (ls) {
      var b = ls.brier || {};
      body += '<div class="pp-pad">직전 채점 ' + esc(ls.target) + ' — 기대 ' + num(b.narr) + ' · 평소 빈도 ' + num(b.clim) + ' · 전일 조건부 ' + num(b.markov) +
        ' <span class="pp-dim">(' + (ls.seal_class === 'on_time' ? '정시 봉인' : '늦은 봉인 — 참고만') + ')</span></div>';
    }
    var cal = Array.isArray(sb.calibration) ? sb.calibration : [];
    if (cal.length) {
      body += '<details class="pp-sub"><summary>확률 구간별 실제 빈도 ' + cal.length + '구간</summary>' + table([{ t: '확률 구간' }, { t: '건수', num: 1 }, { t: '평균 확률', num: 1 }, { t: '실제 빈도', num: 1 }],
        cal.map(function (c) { return '<tr><td>' + esc(c.bin) + '</td><td class="num">' + num(c.n) + '</td><td class="num">' + num(c.p_mean) + '</td><td class="num">' + num(c.freq) + '</td></tr>'; })) + '</details>';
    }
    return card('score', '성적표', '정시 채점일 ' + num(sb.days) + '일 · 단계 ' + num(now) + '/4', body, folds().score,
      '정시(대상일 09:00 전) 봉인만 센다. 오차 점수 = 확률과 실제(0/1)의 차이 제곱 평균 — 낮을수록 좋다. 평소 빈도·전일 조건부 = 비교용 단순 기준선. ' +
      (stg.note ? stg.note + ' ' : '') + '단계 1 = 기록만(매매 제안 없음). 승급은 사람이 정한다.');
  }
  function renderState(s) {
    P.state = s || null;
    var host = $('ppState'), meta = $('ppStMeta'), nt = $('ppStNotice');
    if (!host) return;
    if (!s || !s.available) {
      if (meta) meta.textContent = '';
      if (nt) nt.innerHTML = '';
      host.innerHTML = '<div class="wb-card"><div class="wb-empty"><div class="wb-empty-title">아직 첫 실행 전입니다</div>' +
        '<div class="wb-empty-text">오늘의 기대 · 발화점 · 서사 줄기 · 쌓이는 어긋남 · 성적표는 첫 실행(평일 아침 일일 갱신) 뒤에 생깁니다. 그 전에는 아무 숫자도 보여 주지 않습니다.</div></div></div>';
      return;
    }
    var L = (s.labels && s.labels.available) ? s.labels : null;
    var ch = s.chain || {}, today = todayKst();
    if (meta) meta.textContent = '상태 기준 ' + (s.today || '—') + ' · 자료 기준 ' + (s.db_max || '—') + ' 종가 · 생성 ' + hm(s.generated_at) +
      ' · 원장 ' + (ch.n == null ? '—' : ch.n) + '줄';
    var n = '';
    if (s.mode === 'shadow') n += '<div class="wb-notice wb-notice--warn pp-notice"><b>시험 실행</b> — 운영 기록이 아니며 성적 의미가 없습니다.</div>';
    if (ch.ok === false) n += '<div class="wb-notice wb-notice--warn pp-notice"><b>원장 체인 손상</b> — 아래 숫자를 믿기 전에 원장 확인이 필요합니다.' + (ch.err ? ' (' + esc(ch.err) + ')' : '') + '</div>';
    if (s.today && s.today !== today) n += '<div class="wb-notice pp-notice">오늘(' + esc(today) + ') 실행분이 아닙니다 · 마지막 실행 ' + esc(s.today) + '</div>';
    if (s.skip_reason) n += '<div class="wb-notice pp-notice">오늘 기대는 봉인하지 않았습니다 — ' + esc(s.skip_reason) + '</div>';
    if (!L) n += '<div class="wb-notice wb-notice--warn pp-notice">사건 이름표를 불러오지 못해 일부 이름이 기호로 보입니다.</div>';
    else if (L.stale) n += '<div class="wb-notice wb-notice--warn pp-notice">서버가 들고 있는 규칙이 상태보다 오래됐습니다(규칙이 바뀜) — 서버를 다시 띄우기 전까지 ' +
      (L.source === 'state' ? '무효 조건 이름 · 누적 문턱이 틀릴 수 있습니다(사건 이름은 상태 파일 것이라 맞습니다).' : '사건 이름 · 무효 조건 이름 · 누적 문턱이 틀릴 수 있습니다.') + '</div>';
    var notes = Array.isArray(s.notes) ? s.notes : [];
    if (notes.length) n += '<details class="pp-sub pp-notes"><summary>실행 메모 ' + notes.length + '건</summary><ul class="pp-list">' + notes.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></details>';
    if (nt) nt.innerHTML = n;
    host.innerHTML = blockExpect(s, L) + blockIgn(s, L) + blockThreads(s, L) + blockOutlook(s) + blockCum(s, L) + blockScore(s, L);
    bindFolds(host);
  }
  function bindFolds(host) {
    host.querySelectorAll('details.pp-fold').forEach(function (d) {
      d.addEventListener('toggle', function () { foldSave(d.getAttribute('data-k'), d.open); });
    });
  }

  // ── 내 확률(입력) ────────────────────────────────────────────────────
  //   대상일·마감·봉인 여부·사건 목록·이미 적은 값 = 엔진 form() 그대로. 화면은 %로 받아 0~1 로 보낼 뿐이다.
  function tms(s) {                // 'YYYY-MM-DD HH:MM:SS' → 비교용 숫자(둘 다 같은 틀로 읽으므로 기기 시간대와 무관)
    var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(typeof s === 'string' ? s : '');
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null;
  }
  function serverNow() {           // 서버 시계(받은 시각 + 그 뒤 흐른 시간). 못 받았으면 이 기기의 한국 시각으로 어림.
    var s = P.form ? tms(P.form.server_now) : null;
    return (s != null && P.formAt) ? s + (Date.now() - P.formAt) : Date.now() + 9 * 3600 * 1000;
  }
  function leftMs() { var d = P.form ? tms(P.form.deadline) : null; return d == null ? null : d - serverNow(); }
  function leftText(ms) {
    if (ms == null) return '';
    if (ms <= 0) return '마감 지남';
    var m = Math.floor(ms / 60000);
    if (m < 1) return '마감까지 1분 미만';
    var d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
    return '마감까지 ' + (d ? d + '일 ' : '') + (h ? h + '시간 ' : '') + (m % 60) + '분';
  }
  function deadlineHm(f) { return (f && typeof f.deadline === 'string' && f.deadline.length >= 16) ? f.deadline.slice(11, 16) : '—'; }
  function p2s(p) { return isNum(p) ? String(Math.round(p * 1000) / 10) : ''; }
  function s2p(s) {                // '70' · '70.5' · '70%' → 0.7 · 0.705 · 빈칸 = null · 숫자 모양이 아니면 NaN
    s = String(s == null ? '' : s).trim().replace(/%$/, '').trim();
    if (s === '') return null;
    if (!/^\d{1,3}(\.\d)?$/.test(s)) return NaN;
    return Math.round(parseFloat(s) * 10) / 1000;
  }
  function obsList() { return (P.form && Array.isArray(P.form.observables)) ? P.form.observables : []; }
  function cellText(o) { return Object.prototype.hasOwnProperty.call(P.draft, o.id) ? P.draft[o.id] : p2s(o.mine); }
  function cellState(o) {          // '' 그대로 · 'dirty' 보낼 값 · 'bad' 숫자 아님
    var p = s2p(cellText(o));
    if (p === null) return '';
    if (isNaN(p)) return 'bad';
    return (isNum(o.mine) && Math.abs(p - o.mine) < 1e-9) ? '' : 'dirty';
  }
  function formNotes(f) {
    var h = '', left = leftMs();
    if (f.scored) h += '<div class="wb-notice wb-notice--warn pp-vnote">이 대상일(' + esc(f.target) + ')은 이미 채점됐습니다 — 더 적을 수 없습니다.</div>';
    else if (left != null && left <= 0) h += '<div class="wb-notice wb-notice--warn pp-vnote"><b>마감(' + esc(deadlineHm(f)) + ')이 지났습니다.</b> 지금 적는 값은 기록은 남지만 채점에 들어가지 않습니다. 다음 대상일 칸은 ' + esc(f.target) + ' 종가 자료가 들어온 뒤 열립니다.</div>';
    if (!f.scored) {                                                   // 마감이 지났으면 '먼저 적으면 따로 채점' 줄은 내지 않는다(채점에 안 들어가는 값이다)
      if (f.sealed) h += '<div class="wb-notice wb-notice--warn pp-vnote">이미 시스템 기대가 나와 있습니다 — 지금 적는 값은 \'본 뒤\'로 기록됩니다.</div>';
      else if (!(left != null && left <= 0)) h += '<div class="wb-notice pp-vnote">시스템 기대가 아직 봉인되기 전입니다 — 먼저 적으면 따로 채점됩니다.</div>';
    }
    return h;
  }
  function viewResHtml() {
    var v = P.viewRes; if (!v || !v.r) return '';
    var r = v.r, bd = function (ok, yes, no) { return ok === true ? '<span class="wb-badge">' + yes + '</span>' : (ok === false ? '<span class="wb-badge wb-badge--warn">' + no + '</span>' : '<span class="wb-badge wb-badge--warn">응답에 값 없음</span>'); };
    return '<div class="pp-vres"><b>저장됨</b> · 대상일 ' + esc(r.target) + ' · ' + num(r.n) + '칸 · ' + esc(stamp(r.ts)) + ' ' +
      bd(r.valid, '유효 — 채점에 들어감', '마감 뒤라 채점에 안 들어감') + ' ' + bd(r.blind, '시스템 기대보다 먼저 적음', '시스템 기대가 봉인된 뒤에 적음') +
      (v.shown && r.target !== v.shown ? '<div class="pp-warn">화면에 보이던 대상일(' + esc(v.shown) + ')과 기록된 대상일(' + esc(r.target) + ')이 다릅니다 — 그 사이 대상일이 넘어갔습니다.</div>' : '') + '</div>';
  }
  function formMeta(f) { return '대상일 ' + esc(f.target) + ' · 마감 ' + esc(deadlineHm(f)) + ' · <span id="ppVLeft">' + esc(leftText(leftMs())) + '</span>'; }
  var VIEW_HELP = '사건마다 일어날 확률을 %로 적는다(엔진이 받는 범위 5~95% · 소수 1자리까지). 적은 칸 · 바꾼 칸만 보낸다 — 비운 칸은 보내지 않고, 이미 저장한 값은 그대로 남는다(기록은 덧붙기만 하고 지워지지 않는다). ' +
    '마감 = 대상일 08:45(국채선물 개장). 마감 전에 적은 값만 채점에 들어간다. 시스템 기대가 봉인되기 전에 적은 값은 \'먼저 적은 것\'으로 따로 채점된다. ' +
    '유효 · 먼저 적음 여부는 서버 원장이 받은 시각으로 판정해 돌려준 값 그대로 보여 준다(화면의 남은 시간은 표시일 뿐). 칸에 채워진 값 = 마감 전에 적은 것 중 마지막 값. 대상일은 엔진이 정한다(자료가 있는 마지막 거래일의 다음 거래일).';
  function renderForm() {
    var host = $('ppView'); if (!host) return;
    var f = P.form, open = folds().view;
    if (!f) {
      host.innerHTML = card('view', '내 확률', '', P.formErr
        ? '<div class="wb-empty"><div class="wb-empty-title">입력 화면을 불러오지 못했습니다</div><div class="wb-empty-text">' + esc(P.formErr) + '</div></div>'
        : '<div class="wb-empty"><div class="wb-empty-title wb-loading">읽는 중</div></div>', open, VIEW_HELP);
      bindFolds(host); return;
    }
    var rows = obsList().map(function (o, i) {
      var st = cellState(o), inId = 'ppVIn' + i;
      return '<li class="pp-vrow' + (st ? ' is-' + st : '') + '" data-i="' + i + '">' +
        '<label class="pp-vlab" for="' + inId + '">' + esc(o.label == null ? o.id : o.label) + (o.kind === 'event' ? ' <span class="wb-badge">그 날만</span>' : '') +
        (isNum(o.mine) ? ' <span class="pp-dim pp-vsaved">저장된 값 ' + pct(o.mine) + '</span>' : '') + '</label>' +
        '<span class="pp-vctl"><button type="button" class="wb-btn pp-vstep" data-d="-1" aria-label="' + STEP + '%p 내리기">−</button>' +
        '<input class="wb-input pp-vin" id="' + inId + '" type="text" inputmode="decimal" autocomplete="off" maxlength="5" placeholder="—" value="' + esc(cellText(o)) + '">' +
        '<span class="pp-vunit">%</span><button type="button" class="wb-btn pp-vstep" data-d="1" aria-label="' + STEP + '%p 올리기">+</button></span></li>';
    });
    var body = '<div id="ppVNotes">' + formNotes(f) + '</div>' +
      (rows.length ? '<form id="ppVForm" autocomplete="off" novalidate><ul class="pp-vlist">' + rows.join('') + '</ul>' +
        '<div class="pp-vfoot"><label class="wb-field pp-vmemo"><span class="wb-label">메모 · 선택</span><input class="wb-input" id="ppVMemo" type="text" maxlength="300" autocomplete="off" value="' + esc(P.memo) + '"></label>' +
        '<button type="submit" class="wb-btn wb-btn--primary" id="ppVSave"' + ((P.wbusy || f.scored) ? ' disabled' : '') + '>저장</button>' +
        '<span class="pp-msg' + (P.vmsg && P.vmsg.err ? ' is-err' : '') + '" id="ppVMsg" role="status" aria-live="polite">' + esc(P.vmsg ? P.vmsg.t : '') + '</span></div></form>'
        : empty('적을 사건이 없습니다.')) +
      '<div id="ppVRes" role="status" aria-live="polite">' + viewResHtml() + '</div>' +
      '<div class="pp-dim pp-pad">이 대상일에 적은 횟수 ' + num(f.n_entries) + '회' + (f.note ? ' · ' + esc(f.note) : '') + '</div>';
    host.innerHTML = card('view', '내 확률', formMeta(f), body, open, VIEW_HELP);
    bindFolds(host);
    if (!P.tick) P.tick = setInterval(tickForm, TICK_MS);
  }
  function vmsg(t, err) { P.vmsg = t ? { t: t, err: !!err } : null; var el = $('ppVMsg'); if (el) { el.textContent = t || ''; el.classList.toggle('is-err', !!err); } }
  function tickForm() {            // 남은 시간 · 마감 문구만 갱신(입력 칸은 건드리지 않는다)
    if (!P.form || doc.hidden) return;
    var l = $('ppVLeft'); if (l) l.textContent = leftText(leftMs());
    var n = $('ppVNotes'); if (n) { var h = formNotes(P.form); if (n.innerHTML !== h) n.innerHTML = h; }
    if (Date.now() - P.formAt > 5 * FORM_STALE_MS) refreshForm();     // 열어 둔 채 오래됐으면 봉인 여부를 다시 읽는다
  }
  function rowOf(el) { var li = el && el.closest ? el.closest('.pp-vrow') : null; if (!li) return null; var o = obsList()[+li.getAttribute('data-i')]; return o ? { li: li, o: o, inp: li.querySelector('.pp-vin') } : null; }
  function rowMark(r) { var st = cellState(r.o); r.li.classList.toggle('is-dirty', st === 'dirty'); r.li.classList.toggle('is-bad', st === 'bad'); }
  function onViewInput(ev) {
    var t = ev.target; if (!t || !t.classList) return;
    if (t.id === 'ppVMemo') { P.memo = t.value; return; }
    if (!t.classList.contains('pp-vin')) return;
    var r = rowOf(t); if (!r) return;
    P.draft[r.o.id] = t.value; rowMark(r);
    if (P.vmsg) vmsg('');
  }
  function onViewClick(ev) {
    var b = ev.target && ev.target.closest ? ev.target.closest('.pp-vstep') : null; if (!b) return;
    var r = rowOf(b); if (!r || !r.inp) return;
    var p = s2p(r.inp.value), cur = (p === null || isNaN(p)) ? null : p * 100, d = +b.getAttribute('data-d') * STEP;
    var nx = cur == null ? STEP_START : Math.max(STEP_MIN, Math.min(STEP_MAX, Math.round((cur + d) * 10) / 10));
    r.inp.value = String(nx); P.draft[r.o.id] = r.inp.value; rowMark(r);
    if (P.vmsg) vmsg('');
  }
  async function saveView(ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    var f = P.form; if (!f || P.wbusy) return;
    var pass = pw(); if (!pass) { gate(true, '', false); return; }
    var views = {}, bad = [];
    obsList().forEach(function (o) {
      var st = cellState(o);
      if (st === 'bad') bad.push(o.label == null ? o.id : o.label);
      else if (st === 'dirty') views[o.id] = s2p(cellText(o));
    });
    if (bad.length) { vmsg('숫자가 아닌 칸이 있습니다 — ' + bad.join(' · '), true); return; }
    var ids = Object.keys(views);
    if (!ids.length) { vmsg('새로 적거나 바꾼 칸이 없습니다 — 보낸 것 없음', false); return; }
    var body = { views: views }, memo = String(P.memo || '').trim();
    if (memo) body.memo = memo;
    P.wbusy = true; vmsg('저장 중…');
    var sv = $('ppVSave'); if (sv) sv.disabled = true;
    try {
      var r = await xpost('/quant-house/ignition/view', pass, body);
      if (!pw()) return;                                               // 그 사이 잠김
      P.viewRes = { r: r || {}, shown: f.target };
      P.draft = {};                                                    // 보낸 칸·비운 칸 모두 엔진 값으로 다시 채운다
      P.memo = ''; P.wbusy = false; P.vmsg = null;
      renderForm();
      loadInput();                                                     // 칸에 채울 값·횟수·내 기록을 엔진에서 다시 읽는다
    } catch (e) {
      P.wbusy = false;
      if (e && e.kind === 'pw') { lock(emsg(e)); gate(true, emsg(e), true); return; }
      vmsg(emsg(e), true);
      var sv2 = $('ppVSave'); if (sv2) sv2.disabled = !!(P.form && P.form.scored);
    }
  }
  function sameRows(a, b) { try { return JSON.stringify(a && a.observables) === JSON.stringify(b && b.observables) && !!a && !!b && a.target === b.target && a.scored === b.scored && a.n_entries === b.n_entries; } catch (e) { return false; } }
  async function loadForm(soft) {
    var pass = pw(); if (!pass) return;
    if (!P.form && !soft) { P.formErr = ''; renderForm(); }
    try {
      var j = await xget('/quant-house/ignition/form', pass);
      if (!pw()) return;
      var prev = P.form;
      if (prev && j && prev.target !== j.target) { P.draft = {}; }     // 대상일이 넘어가면 적다 만 값은 버린다(다른 날 것)
      P.form = j; P.formAt = Date.now(); P.formErr = '';
      if (soft && sameRows(prev, j) && $('ppVNotes')) {                // 칸이 그대로면 입력 중인 칸을 건드리지 않고 문구만
        var m = doc.querySelector('#ppView .wb-card-meta'); if (m) m.innerHTML = formMeta(j);
        $('ppVNotes').innerHTML = formNotes(j);
      } else renderForm();
    } catch (e) {
      if (e && e.kind === 'pw') { lock(emsg(e)); gate(true, emsg(e), true); return; }
      if (!pw()) return;
      if (!P.form) { P.formErr = emsg(e); renderForm(); }             // 이미 받은 화면이 있으면 그대로 둔다(저장 응답이 진실)
    }
  }
  function refreshForm() { if (!P.wbusy && pw() && P.form) loadForm(true); }

  // ── 내 기록(엔진 mine() 그대로) ──────────────────────────────────────
  function outcomeText(v, scored) { return v === 1 ? '일어남' : (v === 0 ? '안 일어남' : (scored ? '자료 없음' : '—')); }
  function renderHist() {
    var host = $('ppHist'); if (!host) return;
    var m = P.mine, open = folds().hist;
    var helpText = '대상일별로 내가 적은 확률을 시스템 기대와 나란히. 값은 엔진 기록 그대로(화면에서 다시 계산하지 않음 · 확률만 %로 표시). 오차 = (확률 − 실제 0/1)의 제곱 — 낮을수록 좋다. ' +
      '내 확률 = 마감 전에 적은 것 중 마지막 값. 먼저 적음 = 그 대상일의 유효한 기입이 전부 시스템 기대 봉인 전. 실현 \'자료 없음\' = 채점은 됐지만 그 사건의 자료가 없었던 경우.';
    if (!m) {
      host.innerHTML = card('hist', '내 기록', '', P.mineErr
        ? '<div class="wb-empty"><div class="wb-empty-title">내 기록을 불러오지 못했습니다</div><div class="wb-empty-text">' + esc(P.mineErr) + '</div></div>'
        : '<div class="wb-empty"><div class="wb-empty-title wb-loading">읽는 중</div></div>', open, helpText);
      bindFolds(host); return;
    }
    var vs = Array.isArray(m.views) ? m.views : [], ts = (m.tastes && typeof m.tastes === 'object') ? m.tastes : {}, tk = Object.keys(ts);
    var body = '';
    if (!vs.length) body += empty('아직 적은 확률이 없습니다.');
    vs.forEach(function (v) {
      var items = Array.isArray(v.items) ? v.items : [];
      body += '<div class="pp-group"><b>' + esc(v.target) + '</b> · 적은 횟수 ' + num(v.n_entries) + '회(마감 전 ' + num(v.n_valid) + '회) · ' +
        (v.blind === true ? '시스템 기대보다 먼저 적음' : (v.blind === false ? '<span class="pp-warn">시스템 기대가 봉인된 뒤에 적은 값 있음</span>' : '마감 전에 적은 값 없음')) +
        ' · ' + (v.scored ? '채점됨' : '채점 전') + '</div>';
      body += items.length ? table([{ t: '사건' }, { t: '내 확률', num: 1 }, { t: '시스템 확률', num: 1 }, { t: '실현' }, { t: '내 오차', num: 1 }, { t: '시스템 오차', num: 1 }],
        items.map(function (it) {
          return '<tr><td class="pp-wrap">' + esc(it.label == null ? it.id : it.label) + '</td><td class="num">' + pct(it.mine) + '</td><td class="num">' + pct(it.system) + '</td>' +
            '<td>' + outcomeText(it.outcome, v.scored) + '</td><td class="num">' + num(it.b_mine) + '</td><td class="num">' + num(it.b_system) + '</td></tr>';
        })) : '<div class="pp-dim pp-pad">채점에 들어갈 값이 없습니다(마감 뒤에만 적음).</div>';
    });
    if (tk.length) {
      body += '<details class="pp-sub"><summary>발화점 판정 ' + tk.length + '건(발화점마다 마지막 판정)</summary>' + table([{ t: '발화점' }, { t: '판정' }, { t: '시각' }, { t: '메모' }],
        tk.sort().reverse().map(function (id) { var t = ts[id] || {}; return '<tr><td>' + esc(id) + '</td><td>' + esc(VERDICT[t.verdict] || t.verdict) + '</td><td>' + esc(stamp(t.ts)) + '</td><td class="pp-wrap">' + esc(t.memo == null ? '' : t.memo) + '</td></tr>'; })) + '</details>';
    }
    host.innerHTML = card('hist', '내 기록', '대상일 ' + vs.length + '개 · 발화점 판정 ' + tk.length + '건', body, open, helpText);
    bindFolds(host);
  }
  async function loadMine() {
    var pass = pw(); if (!pass) return;
    if (!P.mine) { P.mineErr = ''; renderHist(); }
    try {
      var j = await xget('/quant-house/ignition/mine', pass);
      if (!pw()) return;
      P.mine = j || {}; P.mineErr = '';
    } catch (e) {
      if (e && e.kind === 'pw') { lock(emsg(e)); gate(true, emsg(e), true); return; }
      if (!pw()) return;
      if (!P.mine) P.mineErr = emsg(e);
    }
    renderHist(); reState();                                           // 발화점 카드의 '내 판정'도 같은 기록에서
  }
  function loadInput() { loadForm(false); loadMine(); }
  async function loadState() {
    var pass = pw(); if (!pass) return;
    var host = $('ppState');
    if (host && !P.state) host.innerHTML = '<div class="wb-card"><div class="wb-empty"><div class="wb-empty-title wb-loading">읽는 중</div></div></div>';
    try { renderState(await xget('/quant-house/ignition/state', pass)); }
    catch (e) {
      if (e && e.kind === 'pw') { lock(emsg(e)); gate(true, emsg(e), true); return; }
      if (!pw()) return;                                               // 그 사이 잠김
      if (host) host.innerHTML = '<div class="wb-card"><div class="wb-empty"><div class="wb-empty-title">현황을 불러오지 못했습니다</div><div class="wb-empty-text">' + esc(emsg(e)) + '</div></div></div>';
    }
  }

  // ── 진입점 ───────────────────────────────────────────────────────────
  function wire() {
    if (P.started) return; P.started = true;
    var f = $('ppPwForm'); if (f) f.addEventListener('submit', submit);
    var inp = $('ppPw'); if (inp) inp.addEventListener('input', function () { var m = $('ppPwMsg'); if (m && m.textContent && !P.busy) gate(true, '', false); });
    var sel = $('ppDate'); if (sel) sel.addEventListener('change', function () { if (isDate(sel.value)) loadPaper(sel.value); });
    var pv = $('ppPrev'); if (pv) pv.addEventListener('click', function () { step(-1); });
    var nx = $('ppNext'); if (nx) nx.addEventListener('click', function () { step(1); });
    var rf = $('ppReload'); if (rf) rf.addEventListener('click', function () { load(true); });
    var lk = $('ppLock'); if (lk) lk.addEventListener('click', function () { lock(); });
    var vw = $('ppView');
    if (vw) {
      vw.addEventListener('input', onViewInput);
      vw.addEventListener('click', onViewClick);
      vw.addEventListener('submit', saveView);
    }
    var sh = $('ppState');
    if (sh) {
      sh.addEventListener('input', function (ev) {
        var t2 = ev.target; if (!t2 || !t2.classList || !t2.classList.contains('pp-taste-memo')) return;
        var bx = t2.closest('.pp-taste'); if (bx) P.tdraft[bx.getAttribute('data-id')] = t2.value;
      });
      sh.addEventListener('click', function (ev) {
        var b = ev.target && ev.target.closest ? ev.target.closest('.pp-tbtn') : null; if (!b) return;
        var bx = b.closest('.pp-taste'); if (bx) sendTaste(bx.getAttribute('data-id'), b.getAttribute('data-v'));
      });
    }
    doc.addEventListener('visibilitychange', function () {           // 다시 볼 때: 남은 시간 바로 맞추고, 오래됐으면 봉인 여부를 다시 읽는다
      if (doc.hidden || !P.form) return;
      tickForm();
      if (Date.now() - P.formAt > FORM_STALE_MS) refreshForm();
    });
    var t = null;
    window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(fit, 120); }, { passive: true });
    doc.addEventListener('wb-themechange', function () { themeSync(); fit(); });
  }
  function load(force) {
    wire();
    if (!pw()) { clearContent(); gate(true, '', false); return; }      // 세션에 비밀번호 없음 → 칸만(요청 0)
    gate(false, '', false);
    if (force || !P.paper) { loadPaper(force ? P.date : hashDate()); loadState(); if (force && P.form) { loadForm(true); loadMine(); } else loadInput(); }
  }
  function show() {               // 탭이 보일 때마다(switchTab) — 처음이면 불러오고, 아니면 높이만 다시
    wire();
    if (!pw()) { if (P.paper || P.state) clearContent(); gate(true, '', false); return; }
    if (!P.paper) { load(false); return; }
    gate(false, '', false);
    if (P.form) { tickForm(); if (Date.now() - P.formAt > FORM_STALE_MS) refreshForm(); }
    var hd = hashDate();
    if (hd && hd !== P.date && P.dates.indexOf(hd) >= 0) loadPaper(hd);
    else setTimeout(fit, 0);
  }

  window.PAPER = { show: show, load: load, lock: lock, fit: fit };
})();
