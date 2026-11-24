/* ═══════════════════════════════════════════════════════════════════════════
   wb-paper.js — 조간 탭(발화점 계층 · 박대기 기자) · tools/quant-house/#paper
   2026-11-23 사용자 지시("fullstackjunior 에 보이게" → 같은 날 "비밀번호를 넣어야만 보이게")
   ───────────────────────────────────────────────────────────────────────────
   데이터 = 백엔드 GET 4개 그대로(웹 재계산 0):
     /quant-house/ignition/paper[?date=YYYY-MM-DD]  조간 HTML 원문 + 날짜 목록 + 견본 여부
     /quant-house/ignition/state                     엔진 상태(본인 관련 필드는 서버가 뺌) + 이름표(labels) + 유사 국면 문장(analog_text)
     /quant-house/ignition/form                      본인 확률 입력 화면(엔진 api.form — 대상일 · 마감 · 봉인 여부 · 사건 · 이미 적은 값)
     /quant-house/ignition/mine                      내 기록(엔진 api.mine — 내 확률·시스템 기대·실현·오차 · 발화점 판정)
     /quant-house/ignition/research                  리서치 창고 목록(엔진 inhouse.catalog — 번호순) + 주제 이름표 + 견본 여부
     /quant-house/ignition/research/note?id=IHR-0001 리서치 노트 한 장(엔진 inhouse.render_page 의 HTML 원문)
     /quant-house/ignition/paper/pdf?date=YYYY-MM-DD 조간 PDF(엔진이 조간과 같이 만든 파일 그대로 · 내려받기)
   PDF 내려받기(2026-11-24 사용자 지시): 발행일 옆 단추. 서버가 그 날짜에 PDF 가 있다고 알려 준 날(pdf_dates · pdf)만 켠다 — 없으면 눌리지 않고
     '이 날짜는 PDF 가 없습니다' · 견본 · 리서치 창고 · 서버가 PDF 여부를 안 알려 준 경우에는 단추를 숨긴다.
     받기 = fetch(X-IGN-PASS 헤더) → blob → 임시 주소(createObjectURL) → <a download> 누름 → 임시 주소 해제. 비밀번호는 주소에 싣지 않는다(새 창으로 직접 열지 않는다).
     파일 이름은 화면이 날짜로 짓는다(BQH_조간_날짜.pdf · 응답 헤더를 읽지 않는다). PDF 안의 파란 리서치 번호 → 부록의 그 리서치로 가는 연결은 엔진이 만든 파일 안에 있다.
   리서치 창고(2026-11-23 밤 사용자 지시): 보기 [조간 | 리서치 창고](#paper/research[/IHR-0001]). 목록은 최신 번호부터(순서만 뒤집음),
     줄을 누르면 노트를 조간과 같은 틀(<iframe sandbox srcdoc> · 스크립트 불허 · 문서 무변경)로 띄운다. '아직 못 푼 물음' = 상태 json research.open.
   조간 안의 리서치 팝업(파란 번호 → 체크박스로 여닫는 창 · 스크립트 0)은 엔진 HTML 그대로 동작한다. 팝업이 든 신문은 틀을 고정 높이로 둔다
     (틀을 내용만큼 늘리면 position:fixed 팝업이 신문 전체의 가운데에 떠서 화면 밖으로 나간다).
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
   낡은 주소(2026-11-24 — 견본 → 운영 전환 때 주소에 남은 견본 날짜가 '이 날짜의 조간이 없습니다'로 떴다):
     주소에서 온 날짜(#paper/날짜 · 새로고침 버튼 · 열려 있던 탭의 다시 읽기)가 서버 날짜 목록(dates)에 없으면 서버가 준 최신(latest)으로 한 번만 다시 받고
     주소도 그 날짜로 고친다 + 한 줄 알림. 다시 받는 것은 그 한 번뿐(두 번째도 없으면 없다고 보여 준다). 목록에서 직접 고른 날짜는 그대로 '없습니다'.
     리서치 창고도 같다 — 주소에 남은 번호가 지금 목록에 없으면 목록으로(노트 요청 0) + 한 줄 · 창고 출처(견본 ↔ 운영)가 바뀌었으면 같은 번호라도 다른 노트라 열지 않는다.
   표시 규칙: 확률 = 값×100 을 소수 1자리까지(표시만) · 그 밖의 숫자는 json 값 그대로 · 없는 값은 '—'.
             입력 칸도 % 소수 1자리(70.5 → 0.705 로 보냄 · 엔진이 소수 3자리로 받는다).
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var doc = document, root = doc.documentElement;
  var SS = 'ign.pass', FOLD_LS = 'paper.fold';
  var P = { mem: '', busy: false, seq: 0, started: false, date: null, dates: [], paper: null, state: null, frame: null, ro: null,
            form: null, formAt: 0, formErr: '', mine: null, mineErr: '', draft: {}, memo: '', viewRes: null, vmsg: null, wbusy: false,
            tdraft: {}, tmsg: {}, tbusy: '', tick: null, crossed: '',
            mode: 'paper', res: null, resErr: '', noteId: null, noteMsg: '', nframe: null, nro: null, nseq: 0,
            moved: null, rmsg: '',                                 // moved = 낡은 주소 날짜 → 최신으로 옮긴 기록({from,to}) · rmsg = 리서치 창고 한 줄 알림
            pdfBusy: false, pdfDate: null, pdfMsg: null, pdfSeq: 0 }; // PDF 내려받기 — 받는 중 · 받는 날짜 · 마지막 결과 한 줄({date,t,err})
  var PDF_HINT = 'PDF 에서는 파란 리서치 번호를 누르면 아래 부록의 그 리서치로 갑니다';
  var PDF_NONE = '이 날짜는 PDF 가 없습니다';
  var PDF_REVOKE_MS = 30000;                                     // 임시 주소는 저장이 시작된 뒤에 해제한다(바로 해제하면 저장이 끊기는 브라우저가 있다)
  var KIND = { miss: '하루 오답', cum: '누적 어긋남', thread: '서사 줄기 무효' };
  var STAGE = { 1: '기록', 2: '제안', 3: '한도 내 자율', 4: '다시장' };
  var VERDICT = { pick: '집음', drop: '버림' };
  var FATE = { confirmed: '맞음', invalidated: '틀림', expired: '판가름 안 남', closed_by_model: '닫음' };
  var FOLD_DEFAULT = { view: true, expect: false, ign: true, threads: false, outlook: false, cum: false, score: false, hist: false };
  var STEP = 5, STEP_START = 50;                                 // − / + 버튼의 걸음(%p) · 빈 칸에서 처음 누르면 서는 곳. 멈추는 곳 = 엔진 form() 의 p_min · p_max
  var FORM_STALE_MS = 60000, TICK_MS = 20000;
  var NOTE_RE = /^IHR-[0-9]{4,12}$/;

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
  // 응답 객체까지(주소 해석 · 주소가 바뀌었을 때만 다시 보내기) — json 은 xsend · PDF 는 xblob 이 읽는다.
  async function xres(method, path, pass, body) {
    if (!pass || /[^\x20-\x7e]/.test(pass)) throw E('pw');           // 헤더에 실을 수 없는 글자 = 틀린 값(요청 안 보냄)
    var base = await getApiBase();
    if (!base) base = await getApiBase(true);
    if (!base) throw E('net');
    var hd = { 'X-IGN-PASS': pass, 'ngrok-skip-browser-warning': '1' };
    var opt = { headers: hd };
    if (method === 'POST') { hd['Content-Type'] = 'application/json'; opt.method = 'POST'; opt.body = JSON.stringify(body); }
    // 다시 보내기는 '주소가 바뀌었을 때만'(옛 터널 주소로 간 요청은 서버에 닿지 못했다) — 같은 주소로는 다시 보내지 않는다(쓰기 중복 방지).
    var call = function (b) { return fetch(b + path, opt); };
    var res, moved = false;
    try { res = await call(base); }
    catch (e) {
      var fb = await getApiBase(true);
      if (fb && fb !== base) { moved = true; try { res = await call(fb); } catch (e2) { throw E('net'); } }
      else throw E('net');
    }
    if (!moved && (res.status === 404 || res.status === 502 || res.status === 503 || res.status === 530)) {   // 터널 주소가 바뀐 신호 → 새 주소로 1회(이미 옮겨 보냈으면 다시 안 보낸다)
      var fb2 = await getApiBase(true);
      if (fb2 && fb2 !== base) { try { res = await call(fb2); } catch (e3) { throw E('net'); } }
    }
    return res;
  }
  // 조간 PDF — 파일 바이트를 blob 으로. 비밀번호는 헤더로만 간다(주소에 안 실음).
  async function xblob(path, pass) {
    var res = await xres('GET', path, pass);
    if (res.status === 401) throw E('pw');
    if (res.status === 404) throw E('nopdf');
    if (res.status === 413) throw E('big');
    if (res.status === 429) throw E('lock');
    if (res.status === 403) throw E('unset');
    if (!res.ok) throw E('http', String(res.status));
    var ct = '';
    try { ct = String((res.headers && res.headers.get && res.headers.get('content-type')) || '').toLowerCase(); } catch (e) { ct = ''; }
    if (ct.indexOf('application/pdf') !== 0) throw E('badpdf');        // PDF 가 아닌 응답(중간 안내 쪽 등)을 PDF 이름으로 저장하지 않는다
    var b;
    try { b = await res.blob(); } catch (e2) { throw E('net'); }       // 받는 도중 끊김
    if (!b || !b.size) throw E('badpdf');
    return b;
  }
  async function xsend(method, path, pass, body) {
    var res = await xres(method, path, pass, body);
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
    if (k === 'nopdf') return PDF_NONE;
    if (k === 'big') return 'PDF 가 너무 커서 서버가 내보내지 않습니다';
    if (k === 'badpdf') return 'PDF 가 아닌 응답을 받았습니다 — 저장하지 않았습니다';
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
    P.wbusy = false; P.tdraft = {}; P.tmsg = {}; P.tbusy = ''; P.crossed = '';
    P.res = null; P.resErr = ''; P.noteId = null; P.noteMsg = ''; P.nseq++;
    P.moved = null; P.rmsg = '';
    P.pdfSeq++; P.pdfBusy = false; P.pdfDate = null; P.pdfMsg = null; syncPdf();   // 받던 PDF 는 버린다(잠근 뒤에는 저장하지 않는다)
    if (P.tick) { clearInterval(P.tick); P.tick = null; }
    dropFrame(); dropNote();
    ['ppPaper', 'ppView', 'ppState', 'ppHist', 'ppNotice', 'ppStNotice', 'ppResNotice', 'ppResOpen', 'ppResList', 'ppResNote'].forEach(function (id) { var el = $(id); if (el) el.innerHTML = ''; });
    var rn = $('ppResNote'); if (rn) rn.hidden = true;
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
      var hd = hashDate();
      var j = await xget(paperPath(hd), v);
      pwSet(v);                                                        // 서버가 맞다고 한 값만 세션에
      if (inp) inp.value = '';
      P.busy = false; gate(false, '', false);
      var to = staleTo(j, hd);                                         // 주소에 남은 날짜가 목록에 없다 → 최신으로 한 번(다시 옮기지 않는다)
      if (to) loadPaper(to, false, { from: hd, to: to, held: j });
      else renderPaper(j);
      loadState(); loadInput();
      syncMode();
    } catch (e) {
      P.busy = false; pwSet('');
      gate(true, emsg(e), true);
      if (inp && e && e.kind === 'pw') { inp.value = ''; try { inp.focus(); } catch (e4) { /* noop */ } }
    }
  }

  // ── 조간 본문 ────────────────────────────────────────────────────────
  function paperPath(date) { return '/quant-house/ignition/paper' + (isDate(date) ? '?date=' + date : ''); }
  function hashDate() { var d = (location.hash || '').slice(1).split('/')[1]; return isDate(d) ? d : null; }
  function showMsg(t, err) { var el = $('ppMsg'); if (!el) return; el.textContent = t || ''; el.classList.toggle('wb-error', !!err); }
  function setMsg(t, err) { P.pmsg = [t || '', !!err]; if (P.mode !== 'research') showMsg(t, err); }   // 조간 쪽 상태 줄(리서치 창고를 보는 동안은 기억만)
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
    // 리서치 팝업(.ihr-t — 체크박스로 여닫는 position:fixed 창 · 스크립트 0)이 든 신문은 고정 높이 + 안쪽 스크롤로 둔다.
    // 틀 높이를 내용만큼 늘리면 팝업이 '신문 전체'의 가운데에 떠서 화면 밖으로 나간다 — 틀이 화면 안에 있어야 팝업도 보이는 자리에 뜬다.
    if (d.querySelector('input.ihr-t')) { f.classList.add('is-fixed'); f.style.height = ''; return; }
    if (f.offsetParent === null) return;                               // 탭이 숨겨져 있으면 폭이 0 — 다시 보일 때 잰다
    var h = Math.ceil(Math.max(d.body.scrollHeight || 0, d.body.getBoundingClientRect().height || 0));
    if (h > 0) { f.classList.remove('is-fixed'); f.style.height = (h + 1) + 'px'; }
  }
  function themeOf(d) {            // 문서가 스스로 가진 밝은/어두운 판형을 사이트 테마에 맞춘다(그 문서의 CSS 가 읽는 속성만 · 본문 무변경)
    if (!d || !d.documentElement) return;
    d.documentElement.setAttribute('data-theme', root.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
  }
  function themeSync() { themeOf(frameDoc()); themeOf(noteDoc()); }
  // 리서치 노트 틀 — 조간과 같은 방식(sandbox · 스크립트 불허 · 문서 문자열 무변경). 노트 문서에는 팝업이 없어 높이를 내용에 맞춘다.
  function dropNote() {
    if (P.nro) { try { P.nro.disconnect(); } catch (e) { /* noop */ } P.nro = null; }
    if (P.nframe && P.nframe.parentNode) P.nframe.parentNode.removeChild(P.nframe);
    P.nframe = null;
  }
  function noteDoc() { try { return P.nframe ? P.nframe.contentDocument : null; } catch (e) { return null; } }
  function fitNote() {
    var f = P.nframe; if (!f) return;
    var d = noteDoc();
    if (!d || !d.body) { f.classList.add('is-fixed'); return; }
    if (f.offsetParent === null) return;
    var h = Math.ceil(Math.max(d.body.scrollHeight || 0, d.body.getBoundingClientRect().height || 0));
    if (h > 0) { f.classList.remove('is-fixed'); f.style.height = (h + 1) + 'px'; }
  }
  function mountNote(html, id) {
    var host = $('ppResNoteBody'); if (!host) return;
    dropNote(); host.innerHTML = '';
    var f = doc.createElement('iframe');
    f.className = 'pp-frame';
    f.setAttribute('sandbox', 'allow-same-origin');                    // allow-scripts 없음 = 스크립트 불허
    f.setAttribute('title', '리서치 노트 ' + (id || ''));
    f.setAttribute('referrerpolicy', 'no-referrer');
    f.addEventListener('load', function () {
      if (P.nframe !== f) return;
      themeOf(noteDoc()); fitNote();
      var d = noteDoc();
      if (d && d.body && window.ResizeObserver) {
        try { P.nro = new ResizeObserver(function () { fitNote(); }); P.nro.observe(d.body); } catch (e) { P.nro = null; }
      }
      setTimeout(fitNote, 300);
    });
    P.nframe = f;
    f.srcdoc = html;
    host.appendChild(f);
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
    if (P.moved && P.paper.available && P.moved.to === P.date) {       // 낡은 주소에서 옮겨 온 경우만(옮긴 날짜가 실제로 열렸을 때)
      nh += '<div class="wb-notice pp-notice" id="ppMoved">' + esc(P.moved.from) + ' 조간은 없습니다 — 가장 최근 발행분(' + esc(P.moved.to) + ')을 엽니다.</div>';
    }
    if (note) note.innerHTML = nh;
    if (P.paper.available && typeof P.paper.html === 'string' && P.paper.html) {
      mountFrame(P.paper.html, P.date);
      setMsg((P.paper.sample ? '견본 · ' : '') + '발행일 ' + (P.date || '—') + (P.paper.written_at ? ' · 파일 기록 ' + String(P.paper.written_at).slice(0, 16).replace('T', ' ') : '') +
        (P.paper.html.indexOf('class="ihr-t"') >= 0 ? ' · 파란 번호 = 리서치 팝업(신문은 틀 안에서 스크롤)' : ''));
    } else {
      dropFrame();
      var none = P.paper.source === 'none';
      if (host) host.innerHTML = '<div class="wb-empty"><div class="wb-empty-title">' + (none ? '아직 첫 발행 전입니다' : '이 날짜의 조간이 없습니다') + '</div>' +
        '<div class="wb-empty-text">' + (none ? '조간은 평일 아침 일일 갱신 때 만들어집니다.' : esc(P.paper.note || '')) + '</div></div>';
      setMsg(none ? '조간 없음' : (P.date ? P.date + ' 없음' : '조간 없음'), !none);
    }
    syncPdf();
  }
  // ── PDF 내려받기 ─────────────────────────────────────────────────────
  //   켜는 기준 = 서버 응답(pdf_dates · pdf) 그대로. 서버가 PDF 여부를 안 알려 줬으면(옛 서버) 모르는 것이므로 단추를 숨긴다.
  function pdfState() {            // 'hide' | 'on' | 'off'
    var j = P.paper;
    if (P.mode === 'research' || !j || !j.available || j.sample || j.source !== 'live' || !isDate(P.date)) return 'hide';
    var list = Array.isArray(j.pdf_dates) ? j.pdf_dates : null, flag = typeof j.pdf === 'boolean';
    if (!list && !flag) return 'hide';
    if (list ? list.indexOf(P.date) >= 0 : (j.pdf === true && j.date === P.date)) return 'on';
    return 'off';
  }
  function pdfName(date) { return 'BQH_조간_' + date + '.pdf'; }
  function syncPdf() {
    var box = $('ppPdfField'), btn = $('ppPdf'), msg = $('ppPdfMsg');
    if (!box || !btn) return;
    var st = pdfState();
    box.hidden = st === 'hide';
    if (st === 'hide') { btn.disabled = true; if (msg) { msg.textContent = ''; msg.classList.toggle('is-err', false); } return; }
    btn.disabled = st !== 'on' || P.pdfBusy;
    btn.textContent = P.pdfBusy ? '받는 중…' : 'PDF 내려받기';
    btn.setAttribute('aria-busy', P.pdfBusy ? 'true' : 'false');
    btn.setAttribute('title', st === 'on' ? (P.date + ' 조간을 PDF 파일로 받는다(' + pdfName(P.date) + ')') : PDF_NONE);
    if (!msg) return;
    var m = P.pdfBusy ? { t: P.pdfDate + ' PDF 받는 중…', err: false } : ((P.pdfMsg && P.pdfMsg.date === P.date) ? P.pdfMsg : null);
    msg.textContent = m ? m.t : (st === 'on' ? PDF_HINT : PDF_NONE);
    msg.classList.toggle('is-err', !!(m && m.err));
  }
  function saveBlob(blob, name) {  // 받은 바이트를 파일로 — 임시 주소(blob:)는 이 탭 안에서만 통하고 비밀번호가 들어 있지 않다
    var U = window.URL || window.webkitURL;
    var url = U.createObjectURL(blob);
    var a = doc.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener';
    if (a.style) a.style.display = 'none';
    var host = doc.body || root;
    host.appendChild(a);
    a.click();
    if (a.parentNode) a.parentNode.removeChild(a);
    setTimeout(function () { try { U.revokeObjectURL(url); } catch (e) { /* noop */ } }, PDF_REVOKE_MS);
  }
  function mb(n) { return isNum(n) ? (Math.round(n / 104857.6) / 10) + 'MB' : ''; }
  async function downloadPdf() {
    if (P.pdfBusy || pdfState() !== 'on') return;                      // 받는 중에는 다시 누를 수 없다 · PDF 없는 날짜는 요청하지 않는다
    var pass = pw(); if (!pass) { gate(true, '', false); return; }
    var date = P.date, seq = ++P.pdfSeq;
    P.pdfBusy = true; P.pdfDate = date; P.pdfMsg = null; syncPdf();
    try {
      var blob = await xblob('/quant-house/ignition/paper/pdf?date=' + date, pass);
      if (seq !== P.pdfSeq || !pw()) return;                           // 그 사이 잠김 — 저장하지 않는다
      saveBlob(blob, pdfName(date));
      P.pdfMsg = { date: date, t: pdfName(date) + ' 받음' + (mb(blob.size) ? ' · ' + mb(blob.size) : '') + ' — 브라우저 내려받기 목록에서 확인', err: false };
    } catch (e) {
      if (seq !== P.pdfSeq) return;
      if (e && e.kind === 'pw') { P.pdfBusy = false; lock(emsg(e)); gate(true, emsg(e), true); return; }
      if (e && e.kind === 'nopdf' && P.paper) {                        // 서버가 지금은 없다고 한다 — 단추도 끈다
        if (Array.isArray(P.paper.pdf_dates)) P.paper.pdf_dates = P.paper.pdf_dates.filter(function (d) { return d !== date; });
        if (P.paper.date === date) P.paper.pdf = false;
      }
      P.pdfMsg = { date: date, t: (e && e.kind) ? emsg(e) : 'PDF 를 저장하지 못했습니다', err: true };
    } finally {
      if (seq === P.pdfSeq) { P.pdfBusy = false; P.pdfDate = null; syncPdf(); }
    }
  }
  // 주소에서 온 날짜가 서버 날짜 목록에 없을 때 대신 열 날짜(서버가 준 latest) — 그 밖에는 null.
  //   null 인 경우: 날짜를 안 물었다 · 그 날짜가 열렸다 · 목록이 비었다(첫 발행 전) · 목록에 있는데 못 읽었다(읽기 실패는 그대로 보여 준다).
  function staleTo(j, asked) {
    if (!isDate(asked) || !j || j.available || j.source === 'none') return null;
    var dates = Array.isArray(j.dates) ? j.dates.filter(isDate) : [];
    if (!dates.length || dates.indexOf(asked) >= 0) return null;
    return (isDate(j.latest) && dates.indexOf(j.latest) >= 0) ? j.latest : dates[0];
  }
  // fromAddr = 날짜가 주소에서 왔다(해시 · 새로고침 버튼 · 열려 있던 탭의 다시 읽기) — 목록에 없으면 최신으로 한 번 옮긴다.
  //            목록에서 직접 고른 날짜(고르기 칸 · ‹ ›)는 fromAddr 없이 부른다 → 없으면 '없습니다' 그대로.
  // mv       = 이미 옮겨서 부르는 경우({from,to,held} — 비밀번호 확인 응답에서 낡은 날짜를 본 뒤). 이때는 다시 옮기지 않는다.
  async function loadPaper(date, fromAddr, mv) {
    var pass = pw(); if (!pass) { gate(true, '', false); return; }
    var seq = ++P.seq;
    P.moved = null;
    setMsg('불러오는 중…');
    try {
      var j = await xget(paperPath(date), pass);
      if (seq !== P.seq) return;
      if (!mv && fromAddr) {
        var to = staleTo(j, date);
        if (to) {                                                      // 한 번만 — 두 번째 응답은 무엇이든 그대로 그린다
          mv = { from: date, to: to, held: j };
          j = await xget(paperPath(to), pass);
          if (seq !== P.seq) return;
        }
      }
      if (mv) P.moved = { from: mv.from, to: mv.to };
      renderPaper(j);
      if (P.mode !== 'research' && (location.hash || '').slice(1).split('/')[0] === 'paper') {   // 주소 = 지금 보이는 날짜(없으면 날짜 없이)
        setHash(isDate(P.date) ? '#paper/' + P.date : '#paper');
      }
    } catch (e) {
      if (seq !== P.seq) return;
      if (e && e.kind === 'pw') { lock(emsg(e)); gate(true, emsg(e), true); return; }
      if (mv && mv.held) renderPaper(mv.held);                         // 옮겨 받기가 실패 — 서버가 준 '없음' 응답을 그대로(낡은 본문을 남기지 않는다)
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
    renderResOpen();                                                   // 리서치 창고의 '아직 못 푼 물음'도 같은 상태에서
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
    else if (left != null && left <= 0) h += '<div class="wb-notice wb-notice--warn pp-vnote"><b>이 대상일(' + esc(f.target) + ')의 마감(' + esc(deadlineHm(f)) + ')이 지났습니다.</b> 이 칸에 적는 값은 채점에 들어가지 않습니다. 새로고침하면 엔진이 주는 다음 대상일 칸으로 바뀝니다.</div>';
    if (!f.scored) {                                                   // 마감이 지났으면 '먼저 적은 것' 줄은 내지 않는다(채점에 안 들어가는 값이다)
      if (f.sealed) h += '<div class="wb-notice wb-notice--warn pp-vnote">이미 시스템 기대가 나와 있습니다 — 지금 적는 값은 \'본 뒤\'로 기록됩니다.</div>';
      else if (!(left != null && left <= 0)) h += '<div class="wb-notice pp-vnote">시스템 기대가 아직 봉인되기 전입니다 — 지금 적으면 \'먼저 적은 것\'으로 표시가 남습니다.</div>';
    }
    return h;
  }
  function pRange() {              // 엔진이 받는 확률 범위(%) — form() 의 p_min · p_max. 없으면 null(걸음 버튼은 0~100 에서만 멈춘다 · 판정은 엔진)
    var f = P.form;
    return (f && isNum(f.p_min) && isNum(f.p_max)) ? [Math.round(f.p_min * 1000) / 10, Math.round(f.p_max * 1000) / 10] : null;
  }
  function viewResHtml() {
    var v = P.viewRes; if (!v || !v.r) return '';
    var r = v.r, bd = function (ok, yes, no) { return ok === true ? '<span class="wb-badge">' + yes + '</span>' : (ok === false ? '<span class="wb-badge wb-badge--warn">' + no + '</span>' : '<span class="wb-badge wb-badge--warn">응답에 값 없음</span>'); };
    return '<div class="pp-vres"><b>저장됨</b> · 대상일 ' + esc(r.target) + ' · ' + num(r.n) + '칸 · ' + esc(stamp(r.ts)) + ' ' +
      bd(r.valid, '유효 — 채점에 들어감', '마감 뒤라 채점에 안 들어감') + ' ' + bd(r.blind, '시스템 기대보다 먼저 적음', '시스템 기대가 봉인된 뒤에 적음') +
      (v.shown && r.target !== v.shown ? '<div class="pp-warn">화면에 보이던 대상일(' + esc(v.shown) + ')과 기록된 대상일(' + esc(r.target) + ')이 다릅니다 — 그 사이 대상일이 넘어갔습니다.</div>' : '') + '</div>';
  }
  function formMeta(f) { return '대상일 ' + esc(f.target) + ' · 마감 ' + esc(deadlineHm(f)) + ' · <span id="ppVLeft">' + esc(leftText(leftMs())) + '</span>'; }
  function viewHelp() {
    var r = pRange();
    return '사건마다 일어날 확률을 %로 적는다(' + (r ? '엔진이 받는 범위 ' + r[0] + '~' + r[1] + '% · ' : '') + '소수 1자리까지). 적은 칸 · 바꾼 칸만 보낸다 — 비운 칸은 보내지 않고, 이미 저장한 값은 그대로 남는다(기록은 덧붙기만 하고 지워지지 않는다). ' +
      '마감 = 대상일 08:45(국채선물 개장). 채점은 마감 전에 적은 마지막 값으로 한다. 시스템 기대가 봉인되기 전에 적으면 \'먼저 적은 것\'으로 표시가 남는다. ' +
      '유효 · 먼저 적음 여부는 서버 원장이 받은 시각으로 판정해 돌려준 값 그대로 보여 준다(화면의 남은 시간은 표시일 뿐). 칸에 채워진 값 = 마감 전에 적은 것 중 마지막 값. ' +
      '대상일은 엔진이 정한다 — 거래일 08:45 전이면 오늘, 그 뒤면 다음 거래일.';
  }
  function renderForm() {
    var host = $('ppView'); if (!host) return;
    var f = P.form, open = folds().view, VIEW_HELP = viewHelp();
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
    var left = leftMs();
    if (left != null && left <= 0 && P.crossed !== P.form.target) { P.crossed = P.form.target; refreshForm(); }   // 마감을 넘긴 순간 한 번 — 엔진이 다음 대상일을 준다
    else if (Date.now() - P.formAt > 5 * FORM_STALE_MS) refreshForm(); // 열어 둔 채 오래됐으면 봉인 여부를 다시 읽는다
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
    var rg = pRange() || [0, 100];
    var nx = Math.max(rg[0], Math.min(rg[1], cur == null ? STEP_START : Math.round((cur + d) * 10) / 10));
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

  // ── 리서치 창고(인하우스 리서치 노트) ─────────────────────────────────
  //   목록 = 엔진 inhouse.catalog() 그대로(순서만 최신 번호부터) · 노트 = 엔진 render_page() 문서 그대로 · 아직 못 푼 물음 = 상태 json research.open 그대로.
  function hashRes() {
    var p = (location.hash || '').slice(1).split('/');
    return (p[0] === 'paper' && p[1] === 'research') ? { on: true, id: NOTE_RE.test(p[2] || '') ? p[2] : null } : { on: false, id: null };
  }
  function setHash(h) { try { history.replaceState(null, '', h); } catch (e) { /* noop */ } }
  function applyMode() {
    var res = P.mode === 'research', r = $('ppRes'), m = $('ppMain'), df = $('ppDateField'), seg = $('ppMode');
    if (r) r.hidden = !res;
    if (m) m.hidden = res;
    if (df) df.hidden = res;
    if (seg) seg.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-m') === P.mode ? 'true' : 'false'); });
    if (res) showMsg(resMsg(), false);
    else { showMsg(P.pmsg ? P.pmsg[0] : '', P.pmsg ? P.pmsg[1] : false); if (P.paper) setTimeout(fit, 0); }
    syncPdf();                                                         // PDF 단추는 조간 보기에서만
  }
  function resMsg() {
    var j = P.res; if (!j) return P.resErr ? '' : '불러오는 중…';
    var n = Array.isArray(j.notes) ? j.notes.length : 0;
    return (j.sample ? '견본 · ' : '') + '리서치 노트 ' + n + '장';
  }
  function syncMode() {            // 주소(#paper/research[/IHR-0001])가 가리키는 보기로 맞춘다
    var h = hashRes();
    P.mode = h.on ? 'research' : 'paper';
    applyMode();
    if (!h.on || !pw()) return;
    if (!P.res) loadRes(h.id);
    else if (h.id && h.id !== P.noteId) openNote(h.id, true);
  }
  function setMode(m) {
    if (m !== 'paper' && m !== 'research') return;
    P.mode = m;
    if ((location.hash || '').slice(1).split('/')[0] === 'paper') {
      setHash(m === 'research' ? '#paper/research' + (P.noteId ? '/' + P.noteId : '') : '#paper' + (isDate(P.date) ? '/' + P.date : ''));
    }
    applyMode();
    if (m === 'research' && !P.res && pw()) loadRes(null);
    if (m === 'research') setTimeout(fitNote, 0);
  }
  function renderResOpen() {
    var host = $('ppResOpen'); if (!host) return;
    var s = P.state, op = (s && s.available && s.research && Array.isArray(s.research.open)) ? s.research.open : [];
    if (!op.length || !P.res) { host.innerHTML = ''; return; }
    var known = {}; ((P.res && P.res.notes) || []).forEach(function (n) { known[n.id] = 1; });
    host.innerHTML = '<section class="wb-card"><div class="wb-card-head"><span class="wb-card-title">아직 못 푼 물음</span>' +
      help('오늘 리서치가 답하지 못하고 남긴 물음 — 엔진 상태(research.open) 그대로. 번호는 그 물음을 남긴 노트.') +
      '<span class="wb-card-meta">' + op.length + '건 · 상태 기준 ' + esc(s.today || '—') + '</span></div><ul class="pp-ropen">' +
      op.map(function (o) {
        var id = o && o['번호'], q = o && o['물음'];
        return '<li>' + esc(q == null ? '' : q) + ' ' + (id != null && known[id] ? '<button type="button" class="pp-rlink pp-rid" data-id="' + esc(id) + '">' + esc(id) + '</button>'
          : '<span class="pp-dim">' + esc(id == null ? '' : id) + '</span>') + '</li>';
      }).join('') + '</ul></section>';
  }
  function renderRes() {
    var host = $('ppResList'), nt = $('ppResNotice'); if (!host) return;
    var j = P.res;
    if (P.mode === 'research') showMsg(resMsg(), false);
    if (!j) {
      if (nt) nt.innerHTML = '';
      host.innerHTML = P.resErr
        ? '<div class="wb-empty"><div class="wb-empty-title">리서치 창고를 불러오지 못했습니다</div><div class="wb-empty-text">' + esc(P.resErr) + '</div></div>'
        : '<div class="wb-empty"><div class="wb-empty-title wb-loading">읽는 중</div></div>';
      renderResOpen(); return;
    }
    resNotice();
    var notes = Array.isArray(j.notes) ? j.notes.slice().reverse() : [], kinds = (j.kinds && typeof j.kinds === 'object') ? j.kinds : {};
    var head = '<div class="wb-card-head"><span class="wb-card-title">리서치 창고</span>' +
      help('조간이 중요한 말을 쓰기 전에 그 말을 따로 연구해 남긴 노트(인하우스 리서치 · IHR). 번호는 계속 쌓이고 지우지 않는다. 같은 주제의 결론이 그대로면 번호를 유지하고 날짜만 보탠다 — 결론이 바뀌면 새 번호를 딴다. ' +
        '며칠째 = 같은 결론이 이어진 날 수(엔진 값). 줄을 누르면 노트 전문이 아래에 열린다(엔진이 만든 문서 그대로). 관측 기록 — 매매 권유가 아니다.') +
      '<span class="wb-card-meta">' + (j.sample ? '견본 · ' : '') + notes.length + '장 · 최신 번호부터</span></div>';
    if (!notes.length) {
      host.innerHTML = head + '<div class="wb-empty"><div class="wb-empty-title">아직 쌓인 리서치 노트가 없습니다</div><div class="wb-empty-text">' + esc(j.note || '평일 아침 일일 갱신 때 쌓입니다.') + '</div></div>';
      renderResOpen(); return;
    }
    var rows = notes.map(function (n) {
      var chain = (n.supersedes ? '<div class="pp-dim">앞 노트 ' + esc(n.supersedes) + ' 의 결론이 바뀌어 새로 땀</div>' : '') +
        (n.superseded_by ? '<div class="pp-dim">뒤 노트 ' + esc(n.superseded_by) + ' 로 이어짐</div>' : '');
      return '<tr class="pp-rrow' + (n.id === P.noteId ? ' is-selected' : '') + '" data-id="' + esc(n.id) + '" tabindex="0" role="button" aria-label="' + esc(n.id) + ' 노트 열기">' +
        '<td><span class="pp-rid">' + esc(n.id) + '</span></td><td class="pp-wrap"><b>' + esc(n.title) + '</b>' + chain + '</td>' +
        '<td>' + esc(kinds[n.kind] != null ? kinds[n.kind] : n.kind) + '</td><td>' + esc(n.first_seen) + '</td><td>' + esc(n.last_seen) + '</td>' +
        '<td class="num">' + (n.n_seen == null ? '—' : num(n.n_seen) + '일째') + '</td></tr>';
    });
    host.innerHTML = head + table([{ t: '번호' }, { t: '제목' }, { t: '주제' }, { t: '처음 본 날' }, { t: '마지막 날' }, { t: '며칠째', num: 1 }], rows);
    renderResOpen();
  }
  function resNotice() {           // 리서치 창고 위 띠 = 견본 표시 + 한 줄 알림(낡은 주소 번호 · 창고 출처 바뀜)
    var nt = $('ppResNotice'); if (!nt) return;
    var j = P.res;
    nt.innerHTML = ((j && j.sample) ? '<div class="wb-notice wb-notice--warn pp-notice"><b>견본(시험 발행) 노트 — 운영 기록 아님.</b> 운영 노트가 아직 없어 견본을 보여 줍니다 — 첫 운영 노트가 생기면 견본은 자동으로 빠집니다.</div>' : '') +
      (P.rmsg ? '<div class="wb-notice pp-notice" id="ppResMoved">' + esc(P.rmsg) + '</div>' : '');
  }
  function srcOf(j) { return !j ? null : (typeof j.source === 'string' ? j.source : (j.sample ? 'sample' : 'live')); }
  function hasNote(id) { return ((P.res && P.res.notes) || []).some(function (x) { return x && x.id === id; }); }
  function swapMsg(id, from, to) { // 창고 출처가 바뀐 뒤에는 같은 번호라도 다른 노트다
    return (from === 'sample' && to === 'live')
      ? '리서치 창고가 견본에서 운영 기록으로 바뀌었습니다 — 견본 때의 ' + id + ' 은 같은 번호라도 다른 노트라 열지 않고 목록을 보여 줍니다.'
      : '리서치 창고가 바뀌었습니다 — 앞서 보던 ' + id + ' 은 같은 번호라도 다른 노트일 수 있어 열지 않고 목록을 보여 줍니다.';
  }
  function noteGone(id, why) {     // 주소에 남은 번호를 열 수 없다 → 노트를 닫고 목록으로 + 한 줄(주소도 목록으로)
    P.nseq++; P.noteId = null; dropNote(); markRow();
    var box = $('ppResNote'); if (box) { box.innerHTML = ''; box.hidden = true; }
    P.rmsg = why || (id + ' 노트는 지금 창고에 없어 목록을 보여 줍니다.');
    if (P.mode === 'research' && (location.hash || '').slice(1).split('/')[0] === 'paper') setHash('#paper/research');
    resNotice();
  }
  async function loadRes(openId) {
    var pass = pw(); if (!pass) return;
    if (!P.res) { P.resErr = ''; renderRes(); }
    var was = srcOf(P.res), fresh = false;
    try {
      var j = await xget('/quant-house/ignition/research', pass);
      if (!pw()) return;
      P.res = j || {}; P.resErr = ''; fresh = true;
    } catch (e) {
      if (e && e.kind === 'pw') { lock(emsg(e)); gate(true, emsg(e), true); return; }
      if (!pw()) return;
      if (!P.res) P.resErr = emsg(e);
    }
    renderRes();
    if (openId && P.res) {
      if (fresh && was && srcOf(P.res) !== was) noteGone(openId, swapMsg(openId, was, srcOf(P.res)));   // 열려 있던 탭: 그 사이 견본 → 운영
      else openNote(openId, true);                                     // 주소 · 다시 읽기에서 온 번호
    }
  }
  function noteTitle(id) {
    var n = ((P.res && P.res.notes) || []).filter(function (x) { return x.id === id; })[0];
    return n ? n.title : '';
  }
  function noteShell(id, bodyHtml) {
    var box = $('ppResNote'); if (!box) return;
    var t = noteTitle(id);
    box.hidden = false;
    box.innerHTML = '<div class="wb-card-head"><span class="wb-card-title">' + esc(id) + (t ? ' · ' + esc(t) : '') + '</span>' +
      '<span class="wb-card-meta">' + (P.res && P.res.sample ? '견본 · ' : '') + '<button type="button" class="wb-btn wb-btn--sm" id="ppResNoteClose">닫기</button></span></div>' +
      '<div id="ppResNoteBody">' + (bodyHtml || '') + '</div>';
  }
  function markRow() {
    var host = $('ppResList'); if (!host) return;
    host.querySelectorAll('.pp-rrow').forEach(function (tr) { tr.classList.toggle('is-selected', tr.getAttribute('data-id') === P.noteId); });
  }
  // fromAddr = 번호가 주소(#paper/research/IHR-…)나 다시 읽기에서 왔다 — 지금 목록에 없으면 요청 없이 목록으로 + 한 줄.
  //            목록에서 직접 누른 번호는 fromAddr 없이 부른다 → 없으면 '이 번호의 노트가 없습니다' 그대로.
  async function openNote(id, fromAddr) {
    if (!NOTE_RE.test(String(id || ''))) return;                       // 번호 모양이 아니면 요청하지 않는다
    var pass = pw(); if (!pass) { gate(true, '', false); return; }
    if (fromAddr && P.res && Array.isArray(P.res.notes) && !hasNote(id)) { noteGone(id); return; }
    if (P.rmsg) { P.rmsg = ''; resNotice(); }
    var seq = ++P.nseq;
    P.noteId = id; markRow(); dropNote();
    noteShell(id, '<div class="wb-empty"><div class="wb-empty-title wb-loading">읽는 중</div></div>');
    if (P.mode === 'research' && (location.hash || '').slice(1).split('/')[0] === 'paper') setHash('#paper/research/' + id);
    try {
      var j = await xget('/quant-house/ignition/research/note?id=' + id, pass);
      if (seq !== P.nseq || !pw()) return;
      if (j && P.res && srcOf(j) !== srcOf(P.res)) {                   // 들고 있던 목록이 낡았다(그 사이 견본 ↔ 운영) — 낡은 제목·견본 표시로 다른 노트를 띄우지 않는다
        noteGone(id, swapMsg(id, srcOf(P.res), srcOf(j)));
        loadRes(null);                                                 // 목록만 새로(노트는 다시 열지 않는다)
        return;
      }
      if (fromAddr && !(j && j.available)) { noteGone(id); return; }   // 목록에는 있었는데 그 사이 사라진 번호
      if (j && j.available && typeof j.html === 'string' && j.html) {
        noteShell(id, '');
        mountNote(j.html, id);
        var box = $('ppResNote'); if (box && box.scrollIntoView && P.mode === 'research') { try { box.scrollIntoView({ block: 'nearest' }); } catch (e5) { /* noop */ } }
      } else {
        noteShell(id, '<div class="wb-empty"><div class="wb-empty-title">이 번호의 노트가 없습니다</div><div class="wb-empty-text">' + esc((j && j.note) || '') + '</div></div>');
      }
    } catch (e) {
      if (seq !== P.nseq) return;
      if (e && e.kind === 'pw') { lock(emsg(e)); gate(true, emsg(e), true); return; }
      if (!pw()) return;
      noteShell(id, '<div class="wb-empty"><div class="wb-empty-title">노트를 불러오지 못했습니다</div><div class="wb-empty-text">' + esc(emsg(e)) + '</div></div>');
    }
  }
  function closeNote() {
    P.nseq++; P.noteId = null; dropNote(); markRow();
    var box = $('ppResNote'); if (box) { box.innerHTML = ''; box.hidden = true; }
    if (P.mode === 'research' && (location.hash || '').slice(1).split('/')[0] === 'paper') setHash('#paper/research');
  }
  function onResClick(ev) {
    var t = ev.target; if (!t || !t.closest) return;
    if (t.closest('#ppResNoteClose')) { closeNote(); return; }
    var el = t.closest('.pp-rlink') || t.closest('.pp-rrow');
    if (el && el.getAttribute('data-id')) openNote(el.getAttribute('data-id'));
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
    var pd = $('ppPdf'); if (pd) pd.addEventListener('click', function () { downloadPdf(); });
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
    var md = $('ppMode'); if (md) md.addEventListener('click', function (ev) { var b = ev.target && ev.target.closest ? ev.target.closest('button[data-m]') : null; if (b) setMode(b.getAttribute('data-m')); });
    var rs = $('ppRes');
    if (rs) {
      rs.addEventListener('click', onResClick);
      rs.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        var tr = ev.target && ev.target.closest ? ev.target.closest('.pp-rrow') : null;
        if (tr && ev.target === tr) { ev.preventDefault(); openNote(tr.getAttribute('data-id')); }
      });
    }
    var t = null;
    window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(function () { fit(); fitNote(); }, 120); }, { passive: true });
    doc.addEventListener('wb-themechange', function () { themeSync(); fit(); fitNote(); });
  }
  function load(force) {
    wire();
    if (!pw()) { clearContent(); gate(true, '', false); return; }      // 세션에 비밀번호 없음 → 칸만(요청 0)
    gate(false, '', false);
    if (force || !P.paper) { loadPaper(force ? P.date : hashDate(), true); loadState(); if (force && P.form) { loadForm(true); loadMine(); } else loadInput(); }
    if (force && P.res) { loadRes(P.noteId); } else syncMode();
  }
  function show() {               // 탭이 보일 때마다(switchTab) — 처음이면 불러오고, 아니면 높이만 다시
    wire();
    if (!pw()) { if (P.paper || P.state || P.res) clearContent(); P.mode = hashRes().on ? 'research' : 'paper'; applyMode(); gate(true, '', false); return; }
    if (!P.paper) { load(false); return; }
    gate(false, '', false);
    syncMode();
    if (P.form) { tickForm(); if (Date.now() - P.formAt > FORM_STALE_MS) refreshForm(); }
    var hd = hashDate();
    if (hd && hd !== P.date) loadPaper(hd, true);                      // 주소가 다른 날짜를 가리킨다 — 목록에 없으면 최신으로 한 번 + 주소 교정
    else setTimeout(fit, 0);
  }

  window.PAPER = { show: show, load: load, lock: lock, fit: fit };
})();
