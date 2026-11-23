/* ═══════════════════════════════════════════════════════════════════════════
   wb-paper.js — 조간 탭(발화점 계층 · 박대기 기자) · tools/quant-house/#paper
   2026-11-23 사용자 지시("fullstackjunior 에 보이게" → 같은 날 "비밀번호를 넣어야만 보이게")
   ───────────────────────────────────────────────────────────────────────────
   읽기 전용. 화면에서 기록·판정·입력 없음(쓰기 요청 0).
   데이터 = 백엔드 GET 2개 그대로(웹 재계산 0):
     /quant-house/ignition/paper[?date=YYYY-MM-DD]  조간 HTML 원문 + 날짜 목록 + 견본 여부
     /quant-house/ignition/state                     엔진 상태(본인 관련 필드는 서버가 뺌) + 엔진 이름표(labels)
   비밀번호: 서버가 X-IGN-PASS 헤더를 검증한다(401 = 틀림). 값은 이 파일·정적 파일 어디에도 없다.
             맞은 값만 sessionStorage 에 둔다(탭을 닫으면 사라짐 · localStorage 안 씀). 주소(URL)에는 싣지 않는다.
   조간 본문: <iframe sandbox="allow-same-origin" srcdoc> — 스크립트 불허(allow-scripts 없음).
             same-origin 은 바깥에서 높이를 재고 신문 자체의 밝은/어두운 테마 속성(data-theme)을 맞추는 데만 쓴다.
             본문 HTML 문자열은 한 글자도 바꾸지 않는다. 인증된 응답으로만 채운다.
   표시 규칙: 확률 = 값×100 을 소수 1자리까지(표시만) · 그 밖의 숫자는 json 값 그대로 · 없는 값은 '—'.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var doc = document, root = doc.documentElement;
  var SS = 'ign.pass', FOLD_LS = 'paper.fold';
  var P = { mem: '', busy: false, seq: 0, started: false, date: null, dates: [], paper: null, state: null, frame: null, ro: null };
  var KIND = { miss: '하루 오답', cum: '누적 어긋남', thread: '서사 줄기 무효' };
  var STAGE = { 1: '기록', 2: '제안', 3: '한도 내 자율', 4: '다시장' };
  var FOLD_DEFAULT = { expect: false, ign: true, threads: false, cum: false, score: false };

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

  // ── 요청(GET 만) ──────────────────────────────────────────────────────
  function E(kind, msg) { var e = new Error(msg || kind); e.kind = kind; return e; }
  async function xget(path, pass) {
    if (!pass || /[^\x20-\x7e]/.test(pass)) throw E('pw');           // 헤더에 실을 수 없는 글자 = 틀린 값(요청 안 보냄)
    var base = await getApiBase();
    if (!base) base = await getApiBase(true);
    if (!base) throw E('net');
    var hd = { 'X-IGN-PASS': pass, 'ngrok-skip-browser-warning': '1' };
    var call = function (b) { return fetch(b + path, { headers: hd }); };
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
    if (res.status === 429) throw E('lock');
    if (res.status === 403) throw E('unset');
    if (!res.ok) throw E('http', String(res.status));
    return res.json();
  }
  function emsg(e) {
    var k = e && e.kind;
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
    dropFrame();
    ['ppPaper', 'ppState', 'ppNotice', 'ppStNotice'].forEach(function (id) { var el = $(id); if (el) el.innerHTML = ''; });
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
      loadState();
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
      html += '<li class="pp-point"><div class="pp-point-head"><span class="wb-badge' + (p.kind === 'thread' ? ' wb-badge--warn' : '') + '">' + esc(KIND[p.kind] || '발화점') + '</span>' +
        '<b>' + esc(p.label) + '</b><span class="pp-dim">' + esc(p.id) + '</span></div>' +
        '<div class="pp-point-body">' + pointBody(p, L) + (flags.length ? ' <span class="pp-dim">(' + esc(flags.join(' · ')) + ')</span>' : '') + '</div>';
      var hy = Array.isArray(p.hypotheses) ? p.hypotheses : [];
      if (hy.length || p.need_data || p.next_question) {
        html += '<ul class="pp-list">' + hy.map(function (h, i) { return '<li><span class="pp-tag">가설 ' + (i + 1) + '</span> ' + esc(h.h) + ' <span class="pp-dim">→ 맞다면 ' + esc(h.if_true_then) + '</span></li>'; }).join('') +
          (p.need_data ? '<li><span class="pp-tag">가를 데이터</span> ' + esc(p.need_data) + '</li>' : '') +
          (p.next_question ? '<li><span class="pp-tag">다음 질문</span> ' + esc(p.next_question) + '</li>' : '') + '</ul>';
      }
      html += '</li>';
    });
    html += '</ul>';
    return card('ign', '발화점', esc(latest) + ' 채점에서 ' + nLatest + '건', html, folds().ign,
      '기대와 실제가 어긋난 곳. 하루 오답 = 실현된 쪽에 준 확률이 낮았고 평소 빈도보다 더 틀린 날. 누적 어긋남 = 같은 방향의 작은 오차가 쌓여 문턱을 넘음. 서사 줄기 무효 = 줄기를 열 때 적어 둔 무효 조건 충족. 가설은 가설일 뿐 — 매매 제안이 아니다.');
  }
  function blockThreads(s, L) {
    var th = Array.isArray(s.threads) ? s.threads : [];
    if (!th.length) return card('threads', '서사 줄기', '0개', empty('열린 서사 줄기가 없습니다.'), folds().threads);
    var nOpen = th.filter(function (t) { return t.status === 'open'; }).length;
    var rows = th.map(function (t) {
      var iv = t.invalidation || {}, open = t.status === 'open';
      var cur = (open && t.since_open && iv.metric != null) ? t.since_open[iv.metric] : null;
      var st = open ? (t.invalidated ? '<span class="pp-warn">무효 조건 충족</span>' : '열림') : ('닫힘' + (t.close_reason ? ' — ' + esc(t.close_reason) : ''));
      return '<tr' + (open ? '' : ' class="pp-closed"') + '><td class="pp-wrap"><b>' + esc(t.title) + '</b>' + (t.claim ? '<div class="pp-dim">' + esc(t.claim) + '</div>' : '') + '</td>' +
        '<td>' + esc(t.opened) + '</td><td class="pp-wrap">' + esc(cond(L, iv)) + '</td><td class="num">' + num(cur) + '</td>' +
        '<td class="num">' + (open ? num(t.hits) + '/' + num(t.n) : '—') + '</td><td class="pp-wrap">' + st + '</td></tr>';
    });
    return card('threads', '서사 줄기', '열림 ' + nOpen + '개 · 전체 ' + th.length + '개',
      table([{ t: '줄기' }, { t: '연 날' }, { t: '무효 조건' }, { t: '현재 값', num: 1 }, { t: '적중', num: 1 }, { t: '상태' }], rows), folds().threads,
      '며칠~몇 주짜리 이야기. 열 때 무효 조건을 같이 적고, 그 뒤로는 못 바꾼다(바꾸려면 닫고 새로 연다). 현재 값 = 연 날 이후 누적. 적중 = 줄기가 가리킨 방향이 맞은 채점 수 / 전체.');
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
    else if (L.stale) n += '<div class="wb-notice wb-notice--warn pp-notice">이름표가 상태보다 오래됐습니다(규칙이 바뀜) — 서버를 다시 띄우기 전까지 일부 이름이 틀릴 수 있습니다.</div>';
    var notes = Array.isArray(s.notes) ? s.notes : [];
    if (notes.length) n += '<details class="pp-sub pp-notes"><summary>실행 메모 ' + notes.length + '건</summary><ul class="pp-list">' + notes.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></details>';
    if (nt) nt.innerHTML = n;
    host.innerHTML = blockExpect(s, L) + blockIgn(s, L) + blockThreads(s, L) + blockCum(s, L) + blockScore(s, L);
    host.querySelectorAll('details.pp-fold').forEach(function (d) {
      d.addEventListener('toggle', function () { foldSave(d.getAttribute('data-k'), d.open); });
    });
  }
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
    var t = null;
    window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(fit, 120); }, { passive: true });
    doc.addEventListener('wb-themechange', function () { themeSync(); fit(); });
  }
  function load(force) {
    wire();
    if (!pw()) { clearContent(); gate(true, '', false); return; }      // 세션에 비밀번호 없음 → 칸만(요청 0)
    gate(false, '', false);
    if (force || !P.paper) { loadPaper(force ? P.date : hashDate()); loadState(); }
  }
  function show() {               // 탭이 보일 때마다(switchTab) — 처음이면 불러오고, 아니면 높이만 다시
    wire();
    if (!pw()) { if (P.paper || P.state) clearContent(); gate(true, '', false); return; }
    if (!P.paper) { load(false); return; }
    gate(false, '', false);
    var hd = hashDate();
    if (hd && hd !== P.date && P.dates.indexOf(hd) >= 0) loadPaper(hd);
    else setTimeout(fit, 0);
  }

  window.PAPER = { show: show, load: load, lock: lock, fit: fit };
})();
