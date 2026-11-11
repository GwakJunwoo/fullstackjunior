/* ═══════════════════════════════════════════════════════════════════════════
   wb-otc.js — 장외 호가 탭(2026-11-04 사용자 지시) · 화면 = tools/otc/index.html
   ───────────────────────────────────────────────────────────────────────────
   화면 셋(해시): #board 보드 · #spread 종목 스프레드 · #pnl 내 포지션(등록한 현물·선물의 장중 실시간 손익 · 등록/삭제 · 5초 갱신 · 2026-11-11) · #bond 종목 분석 · #broker 브로커 분석 · #team 팀 해부(① 요약 ② 종목×일 ③ 장중 ④ 종목 시계열 ⑤ 일봉 ⑥ 포지션 추정)
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
  var TEAM_SECS = ['sum', 'map', 'intra', 'bond', 'daily', 'pos'];

  var S = window.WB_OTC = {
    meta: null, on: false, view: null, charts: {}, cache: {}, seq: { bond: 0, broker: 0, team: 0 },
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
  function outTag(r) { return r && r.out ? '<span class="otc-tag otc-tag--out" title="' + esc(RU('outlier') || '이상치') + '">이상치</span>' : ''; }
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
  // 작은 차트 공통(막대·선): 십자선(otcCross) + index 툴팁 + 범례 오른쪽 위 한 줄
  function regPlugins() {
    if (!window.Chart || S.plugOk) return;
    S.plugOk = true;
    Chart.register({
      id: 'otcCross', defaults: { on: false },
      afterDatasetsDraw: function (ch, args, o) {
        if (!o || !o.on || !ch.tooltip || !ch.tooltip.getActiveElements) return;
        var act = ch.tooltip.getActiveElements(); if (!act.length) return;
        var x = Math.round(act[0].element.x) + 0.5, ca = ch.chartArea, ctx = ch.ctx;
        ctx.save(); ctx.strokeStyle = cssv('--wb-mark'); ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(x, ca.top); ctx.lineTo(x, ca.bottom); ctx.stroke(); ctx.restore();
      }
    });
  }
  var LEG = { display: true, position: 'top', align: 'end', labels: { usePointStyle: true, pointStyle: 'rectRounded', boxWidth: 10, boxHeight: 8, padding: 12 } };
  function baseOpts(extra) {   // 막대·선 공통 톤: 세로 십자선 + index 툴팁 + 범례(있으면) 오른쪽 위 한 줄
    regPlugins();
    extra = extra || {};
    var pl = Object.assign({ legend: { display: false } }, extra.plugins || {});
    if (pl.legend && pl.legend.display) pl.legend = LEG;
    pl.otcCross = { on: true };
    pl.tooltip = Object.assign({ mode: 'index', intersect: false }, pl.tooltip || {});
    var o = Object.assign({ responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false } }, extra);
    o.plugins = pl;
    return o;
  }

  // ══ 이벤트 축 호가 타임라인(참고 화면 문법) ═════════════════════════════
  // x = 호가 이벤트 순번(같은 간격 · 실시각 아님 → 점심·장마감 공백 사라짐) · 눈금 = 그 이벤트 시각(솎음)
  // 사자선/팔자선/미드/괴리/전일민평 = 엔진이 준 '그 이벤트 직후 상태' 그대로의 계단 — 값 변형 0 · 보이는 범위(창)만 조절
  // 십자선·툴팁 = 메인/괴리 패널 동기 · 날 경계(day_start) = 선 끊김 + 세로 구분선 + 날짜 라벨
  S.ev = {};
  function evSeries(arr, ds, n) {   // 전체 계단 점열(한 번만) — 날 경계에서 끊김(앞날 마지막 상태는 경계까지)
    var out = [], last = null;
    for (var i = 0; i < n; i++) {
      if (ds && ds[i] && i > 0) { if (last != null) out.push({ x: i - 0.5, y: last }); out.push({ x: i - 0.5, y: null }); last = null; }
      var v = isNum(arr[i]) ? arr[i] : null;
      out.push({ x: i, y: v }); last = v;
    }
    return out;
  }
  function lowerX(a, x) { var lo = 0, hi = a.length; while (lo < hi) { var m = (lo + hi) >> 1; if (a[m].x < x) lo = m + 1; else hi = m; } return lo; }
  function evSlice(a, lo, hi) {
    var out = a.slice(lowerX(a, lo - 0.25), lowerX(a, hi + 0.25));
    var last = out.length ? out[out.length - 1].y : null;
    if (last != null) out.push({ x: hi + 0.5, y: last });   // 마지막 상태를 창 끝까지(값 그대로)
    return out;
  }
  function evLegend(key, nOut, outLabel, doneRing) {
    return '<span class="otc-leg">' +
      '<span><b class="otc-sell">▼</b>팔자</span><span><b class="otc-buy">▲</b>사자</span>' +
      (doneRing ? '<span><i class="ring"></i>체결 표시</span>' : '') +
      '<span><i class="ln" style="border-color:var(--wb-down)"></i>사자선</span>' +
      '<span><i class="ln" style="border-color:var(--wb-up)"></i>팔자선</span>' +
      '<span><i class="ln dash" style="border-color:var(--wb-ink)"></i>미드</span>' +
      '<span><i class="blk"></i>사자−팔자(bp)</span>' +
      '<span><i class="ln dot" style="border-color:var(--wb-muted)"></i>전일민평</span>' +
      (nOut ? '<button type="button" class="wb-chip otc-outbtn" data-evout="' + esc(key) + '" aria-pressed="false">' + esc(outLabel || '이상치') + ' ' + n0(nOut) + '건 보기</button>' + help(RU('outlier') || '이상치 = 엔진 판정') : '') +
      '</span>';
  }
  function killEv(key) { if (S.ev[key]) S.ev[key].destroy(); }
  function evChart(key, host, src, opt) {
    // opt: h · hs(괴리 패널 높이) · noSpr(괴리 패널 없음) · nav(축약 내비) · win · onWindow · onClick
    //      fitY(y 범위 = 선·호가 마커만으로 · 흐린(fade) 마커는 범위에서 뺌) · endLabels(오른쪽 끝 최신 사자/팔자 값)
    //      mpFree(fitY 와 함께 · 전일민평을 y 범위에서 뺌 — 범위 밖이면 가장자리에 '전일민평 값 ▲/▼')
    // 마커: {x, y, side, r, a(채움 투명도), ink(배경과 구분되는 테두리), bw(테두리 굵기), ring(바깥 고리 = 체결 표시), rc·rw(고리 색 토큰·굵기), fade(흐리게), hollow(속 빔), z(맨 위 층)}
    // 그리는 순서(Chart.js: order 가 작을수록 위): 선 3 → 점·이상치 2 → 체결 고리 1 → 맨 위 층(z) 0.
    // 팀 화살표 = 전부 속 채움(사자 파랑 · 팔자 빨강) + 얇은 ink 테두리 · 체결 표시 = 굵은 테두리 + 바깥 고리.
    // 장내(선택): src.xb(매수호가) · src.xa(매도호가) · src.xl(현재가) = 가는 선(장외 굵은 선 아래) · src.unit 'p' = 가격 축(소수 2자리)
    //      src.key[i] = '날짜 시:분:초' → ctl.syncTo(key) 로 다른 차트가 가리킨 시각에 십자선 · opt.onHover(i|null)
    opt = opt || {};
    killEv(key);
    if (!window.Chart) { host.innerHTML = '<div class="otc-empty">차트 라이브러리를 못 불러옴</div>'; return null; }
    regPlugins();
    var n = src.n, hasSpr = !opt.noSpr;
    host.innerHTML = '<div class="otc-ev-box" style="height:' + (opt.h || 400) + 'px"><canvas></canvas><canvas class="otc-ev-ov"></canvas></div>' +
      (hasSpr ? '<div class="otc-cap">사자−팔자 괴리(bp)' + help('그 이벤트 직후 사자선 − 팔자선(bp) · 엔진 값 그대로(음수 = 사자선이 팔자선보다 낮은 교차 상태)') + '</div>' +
        '<div class="otc-ev-box" style="height:' + (opt.hs || 110) + 'px"><canvas></canvas><canvas class="otc-ev-ov"></canvas></div>' : '') +
      (opt.nav ? '<div class="otc-ev-nav" title="드래그 = 보여 줄 구간 고르기 · 창 안 드래그 = 옮기기 · 창 가장자리 = 넓히기/좁히기 · 클릭 = 그 자리로"><canvas></canvas></div>' : '');
    var boxes = host.querySelectorAll('.otc-ev-box');
    var cvM = boxes[0].children[0], ovM = boxes[0].children[1];
    var cvS = hasSpr ? boxes[1].children[0] : null, ovS = hasSpr ? boxes[1].children[1] : null;
    var navCv = opt.nav ? host.querySelector('.otc-ev-nav canvas') : null;
    var byX = function (a, b) { return a.x - b.x; };
    var full, buyM, sellM, outM, ringM, topB, topS, dsIdx;
    var w0 = opt.win || [0, n - 1];
    var ctl = { key: key, lo: Math.max(0, w0[0]), hi: Math.min(n - 1, w0[1]), showOut: false, src: src, cur: null, dsIdx: null };
    function build() {   // src → 계단 점열·마커(한 번) — setSrc 로 데이터만 갈아 끼울 때도 여기
      n = src.n;
      full = { bid: evSeries(src.bid, src.ds, n), ask: evSeries(src.ask, src.ds, n), mid: evSeries(src.mid, src.ds, n),
        spr: hasSpr ? evSeries(src.spr, src.ds, n) : [], mp: src.mp ? evSeries(src.mp, src.ds, n) : null,
        xb: src.xb ? evSeries(src.xb, src.ds, n) : null, xa: src.xa ? evSeries(src.xa, src.ds, n) : null, xl: src.xl ? evSeries(src.xl, src.ds, n) : null };
      buyM = src.marks.filter(function (m) { return m.side === 1 && !m.z; }).sort(byX);
      topB = src.marks.filter(function (m) { return m.side === 1 && m.z; }).sort(byX);
      topS = src.marks.filter(function (m) { return m.side === -1 && m.z; }).sort(byX);
      sellM = src.marks.filter(function (m) { return m.side === -1 && !m.z; }).sort(byX);
      outM = (src.outs || []).slice().sort(byX);
      ringM = src.marks.filter(function (m) { return m.ring; }).sort(byX);
      dsIdx = [0];
      if (src.ds) for (var k = 1; k < n; k++) if (src.ds[k]) dsIdx.push(k);
      ctl.dsIdx = dsIdx; ctl.src = src;
    }
    build();
    function daysIn() { var c = 1; for (var j = 0; j < dsIdx.length; j++) if (dsIdx[j] > ctl.lo && dsIdx[j] <= ctl.hi) c++; return c; }
    function mSlice(a) { return a.slice(lowerX(a, ctl.lo - 0.5), lowerX(a, ctl.hi + 0.51)); }
    function tickLab(v) {
      var i = Math.round(v); if (i < 0 || i >= n) return '';
      return (src.multiDay && ctl.nd > 5) ? mmdd(src.day[i]) : src.hm[i];
    }
    function xScale() {
      return { type: 'linear', min: ctl.lo - 0.5, max: ctl.hi + 0.5, grid: { display: false },
        afterBuildTicks: function (ax) {
          var w = ax.maxWidth || ax.width || 800, maxL = Math.max(2, Math.floor(w / 68)), t = [], i;
          ctl.nd = src.multiDay ? daysIn() : 1;
          if (src.multiDay && ctl.nd > 5) {   // 긴 창 = 날짜 눈금(날 시작) 솎음
            var ds = dsIdx.filter(function (x) { return x >= ctl.lo && x <= ctl.hi; });
            if (!ds.length || ds[0] > ctl.lo) ds.unshift(ctl.lo);
            var span = ctl.hi - ctl.lo + 1, lastPx = -1e9;   // 날 시작 눈금을 픽셀 간격으로 솎음(이벤트 적은 날이 몰려도 안 겹치게)
            for (i = 0; i < ds.length; i++) { var px = (ds[i] - ctl.lo + 0.5) / span * w; if (px - lastPx >= 66) { t.push({ value: ds[i] }); lastPx = px; } }
          } else {
            var step = Math.max(1, Math.ceil((ctl.hi - ctl.lo + 1) / maxL));
            for (i = ctl.lo; i <= ctl.hi; i += step) t.push({ value: i });
          }
          var seen = null; ax.ticks = t.filter(function (o) { var l = tickLab(o.value); if (l === seen) return false; seen = l; return true; });   // 같은 라벨 연속 = 하나만
        },
        ticks: { autoSkip: false, maxRotation: 0, callback: function (v) { return tickLab(v); } } };
    }
    function yFit(sc) { sc.width = 62; }   // 두 패널 x 픽셀 정렬(십자선 동기)
    var dayPlug = { id: 'otcDays', beforeDatasetsDraw: function (ch) {
      if (!src.multiDay || !n) return;
      var xs = ch.scales.x, ca = ch.chartArea, ctx = ch.ctx, lastLx = -1e9, isMain = ch.canvas === cvM;
      ctx.save(); ctx.font = '600 10px ' + (cssv('--wb-font') || 'sans-serif'); ctx.textBaseline = 'top';
      var col = cssv('--wb-rule-strong'), mut = cssv('--wb-muted');
      function lab(i, x) { if (!isMain || x - lastLx < 44) return; ctx.fillStyle = mut; ctx.fillText(mmdd(src.day[i]), x + 3, ca.top + 2); lastLx = x; }
      lab(ctl.lo, ca.left);
      ctx.strokeStyle = col; ctx.lineWidth = 1;
      var monthOnly = (ca.right - ca.left) / Math.max(1, ctl.nd || 1) < 10;   // 하루 폭 < 10px = 달 경계만(빗금 방지)
      for (var j = 0; j < dsIdx.length; j++) {
        var i = dsIdx[j]; if (i <= ctl.lo || i > ctl.hi) continue;
        if (monthOnly && String(src.day[i]).slice(0, 7) === String(src.day[i - 1]).slice(0, 7)) continue;
        var x = Math.round(xs.getPixelForValue(i - 0.5)) + 0.5;
        ctx.beginPath(); ctx.moveTo(x, ca.top); ctx.lineTo(x, ca.bottom); ctx.stroke(); lab(i, x);
      }
      ctx.restore();
    } };
    var endPlug = { id: 'otcEnd', afterDatasetsDraw: function (ch) {   // 오른쪽 끝 = 마지막 이벤트 직후 값(엔진 값 그대로): 장외 사자선/팔자선 + 장내 현재가
      if (!opt.endLabels || !n || !ch.chartArea) return;
      var ca = ch.chartArea, ys = ch.scales.y, ctx = ch.ctx, hi = ctl.hi, fx = src.unit === 'p' ? fp : fy, it = [];
      if (src.endOk !== false) {
        if (isNum(src.bid[hi])) it.push({ y: ys.getPixelForValue(src.bid[hi]), t: fy(src.bid[hi]), c: cssv('--wb-down') });
        if (isNum(src.ask[hi])) it.push({ y: ys.getPixelForValue(src.ask[hi]), t: fy(src.ask[hi]), c: cssv('--wb-up') });
      }
      if (src.xl && src.xEnd && isNum(src.xl[hi])) it.push({ y: ys.getPixelForValue(src.xl[hi]), t: fx(src.xl[hi]), c: cssv('--wb-series-5') });
      it.sort(function (p, q) { return p.y - q.y; });
      for (var k = 1; k < it.length; k++) if (it[k].y - it[k - 1].y < 12) it[k].y = it[k - 1].y + 12;   // 겹치면 아래로 밀어 띄움
      ctx.save(); ctx.font = '600 11px ' + (cssv('--wb-font') || 'sans-serif'); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      it.forEach(function (o) { ctx.fillStyle = o.c; ctx.fillText(o.t, ca.right + 6, Math.max(ca.top + 6, Math.min(ca.bottom - 6, o.y))); });
      ctx.restore();
    } };
    function markDs(label, data, side, ord) {
      var col = side === 1 ? '--wb-down' : '--wb-up';
      return { type: 'scatter', label: label, data: data, order: ord == null ? 2 : ord, pointStyle: 'triangle', pointRotation: side === 1 ? 0 : 180,
        pointRadius: function (c) { var m = c.raw || {}; return m.r || 5.5; },
        pointBackgroundColor: function (c) { var m = c.raw || {}; return m.hollow ? cssv('--wb-surface') : WBChart.alpha(col, m.fade ? 0.28 : (m.a != null ? m.a : 0.96)); },
        pointBorderColor: function (c) { var m = c.raw || {}; return m.fade ? WBChart.alpha(col, 0.45) : m.ink ? WBChart.alpha('--wb-ink', m.a != null ? 0.6 : 1) : cssv(col); },
        pointBorderWidth: function (c) { var m = c.raw || {}; return m.bw || (m.ink ? 2.2 : m.hollow ? 1.8 : 1.2); } };
    }
    function lineDs(label, col, a, w, dash) {
      return { type: 'line', label: label, data: a, stepped: true, order: 3, borderColor: tk(col, col === '--wb-muted' ? 0.95 : 1), borderWidth: w, borderDash: dash || [],
        pointRadius: 0, pointHoverRadius: 0, pointHitRadius: 0, spanGaps: false, fill: false };
    }
    function exLine(label, col, a, w) {   // 장내 선 = 가는 실선(장외 선 아래 층)
      return { type: 'line', label: label, data: [], stepped: true, order: 4, borderColor: tk(col, a), borderWidth: w || function () { return src.xw || 1.1; },
        pointRadius: 0, pointHoverRadius: 0, pointHitRadius: 0, spanGaps: false, fill: false };
    }
    var mpPlug = { id: 'otcMpEdge', afterDatasetsDraw: function (ch) {   // mpFree: 전일민평이 보이는 범위 밖이면 그쪽 가장자리에 값과 방향만(엔진 값 그대로)
      if (!opt.mpFree || !n || !ch.chartArea || !src.mp) return;
      var v = src.mp[ctl.hi], ys = ch.scales.y, ca = ch.chartArea; if (!isNum(v) || (v >= ys.min && v <= ys.max)) return;
      var up = v > ys.max, ctx = ch.ctx, txt = '전일민평 ' + fy(v) + (up ? ' ▲' : ' ▼'), ty = up ? ca.top + 3 : ca.bottom - 3;
      ctx.save(); ctx.font = '600 10px ' + (cssv('--wb-font') || 'sans-serif'); ctx.textAlign = 'right'; ctx.textBaseline = up ? 'top' : 'bottom'; ctx.fillStyle = cssv('--wb-muted');
      if (up && src.multiDay) {   // 여러 날 = 위 가장자리에 날짜 라벨(otcDays)이 있음 → 글자 자리에 날 경계가 걸리면 한 줄 아래로(겹침 방지)
        var xl = ca.right - 6 - ctx.measureText(txt).width - 34;
        for (var j = 0; j < dsIdx.length; j++) if (dsIdx[j] > ctl.lo && dsIdx[j] <= ctl.hi && ch.scales.x.getPixelForValue(dsIdx[j] - 0.5) > xl) { ty = ca.top + 15; break; }
      }
      ctx.fillText(txt, ca.right - 6, ty);
      ctx.restore();
    } };
    var common = { responsive: true, maintainAspectRatio: false, animation: false, parsing: false, normalized: true, events: [],
      plugins: { legend: { display: false }, tooltip: { enabled: false } }, layout: { padding: { right: opt.endLabels ? 46 : 6 } } };
    var main = new Chart(cvM, { type: 'line', plugins: [dayPlug, endPlug, mpPlug], data: { datasets: [
      lineDs('사자선', '--wb-down', [], 2.2), lineDs('팔자선', '--wb-up', [], 2.2), lineDs('미드', '--wb-ink', [], 1.5, [5, 4]),
      lineDs('전일민평', '--wb-muted', [], 1.4, [2, 4]),
      markDs('사자', [], 1), markDs('팔자', [], -1),
      { type: 'scatter', label: '이상치', data: [], order: 2, pointStyle: 'crossRot', pointRadius: 6.5, pointBorderWidth: 2.2,
        pointBorderColor: tk('--wb-muted'), pointBackgroundColor: 'transparent' },
      { type: 'scatter', label: '체결 표시 고리', data: [], order: 1, pointStyle: 'circle', pointBackgroundColor: 'transparent',
        pointBorderColor: function (c) { var m = c.raw || {}; return m.rc ? cssv(m.rc) : cssv('--wb-ink'); },   // rc = 고리 색 토큰(없으면 ink) · rw = 고리 굵기
        pointBorderWidth: function (c) { var m = c.raw || {}; return m.rw || 1.6; },
        pointRadius: function (c) { var m = c.raw || {}; return (m.r || 6) + 5; } },
      markDs('팀 사자', [], 1, 0), markDs('팀 팔자', [], -1, 0),
      exLine('장내 매수호가', '--wb-down', 0.62), exLine('장내 매도호가', '--wb-up', 0.62), exLine('장내 현재가', '--wb-series-5', 1, 1.4)] },
      options: Object.assign({}, common, { onResize: function () { requestAnimationFrame(function () { drawCross(ctl.cur); drawNav(); }); },
        scales: { x: xScale(), y: { grace: opt.fitY ? 0 : '6%', afterFit: yFit, ticks: { includeBounds: !opt.fitY, maxTicksLimit: opt.yTicks || (opt.fitY ? 6 : 11), callback: function (v) { return src.unit === 'p' ? fp(v) : fy(v); } } } } }) });
    var spr = hasSpr ? new Chart(cvS, { type: 'line', plugins: [dayPlug], data: { datasets: [
      { type: 'line', label: '사자−팔자(bp)', data: [], stepped: true, fill: 'origin', borderColor: tk('--wb-legacy-purple'), backgroundColor: tk('--wb-legacy-purple', 0.3),
        borderWidth: 1.6, pointRadius: 0, pointHitRadius: 0, spanGaps: false }] },
      options: Object.assign({}, common, { scales: { x: xScale(), y: { afterFit: yFit, ticks: { maxTicksLimit: 4, callback: function (v) { return fbp(v, 1); } } } } }) }) : null;
    var charts = spr ? [main, spr] : [main];
    ctl.main = main; ctl.spr = spr;
    function fill() {
      var d = main.data.datasets, lo = ctl.lo, hi = ctl.hi;
      d[0].data = evSlice(full.bid, lo, hi); d[1].data = evSlice(full.ask, lo, hi); d[2].data = evSlice(full.mid, lo, hi);
      d[3].data = full.mp ? evSlice(full.mp, lo, hi) : [];
      d[4].data = mSlice(buyM); d[5].data = mSlice(sellM); d[6].data = ctl.showOut ? mSlice(outM) : []; d[7].data = mSlice(ringM); d[8].data = mSlice(topB); d[9].data = mSlice(topS);
      d[10].data = full.xb ? evSlice(full.xb, lo, hi) : []; d[11].data = full.xa ? evSlice(full.xa, lo, hi) : []; d[12].data = full.xl ? evSlice(full.xl, lo, hi) : [];
      if (spr) spr.data.datasets[0].data = evSlice(full.spr, lo, hi);
      charts.forEach(function (c) { c.options.scales.x.min = lo - 0.5; c.options.scales.x.max = hi + 0.5; });
      if (opt.fitY) {   // y 범위 = 보이는 선 + 마커(흐린 것 제외) · 여백 12%
        var mn = Infinity, mx = -Infinity, ys = main.options.scales.y;
        var hard = [d[0].data, d[1].data, d[2].data, d[4].data, d[5].data, d[8].data, d[9].data, d[12].data], soft = [d[10].data, d[11].data];
        hard.push(opt.mpFree ? d[6].data : d[3].data);   // mpFree = 전일민평은 범위에서 뺌(멀면 호가 선이 눌림 → 가장자리 글자로) · 켜 둔 이상치 × 는 범위에 넣음
        var scan = function (arr, lim) {
          for (var q = 0; q < arr.length; q++) { var p = arr[q]; if (p.fade || !isNum(p.y)) continue; if (lim && (p.y < lim[0] || p.y > lim[1])) continue; if (p.y < mn) mn = p.y; if (p.y > mx) mx = p.y; }
        };
        hard.forEach(function (arr) { scan(arr, null); });
        if (!isFinite(mn) || !src.xSoft) soft.forEach(function (arr) { scan(arr, null); });   // 장외 선이 없으면(지표·선물) 장내 호가가 곧 범위
        else { var sp = Math.max(mx - mn, 0.01), lim = [mn - sp, mx + sp]; soft.forEach(function (arr) { scan(arr, lim); }); }   // 장외 선이 있으면 장내 호가는 범위의 1배 밖까지만 포함(더 먼 값은 잘림 · 값은 툴팁·머리에)
        if (isFinite(mn)) { var pad = Math.max((mx - mn) * 0.12, 0.003); ys.min = mn - pad; ys.max = mx + pad; }
        else { delete ys.min; delete ys.max; }
      }
    }
    function sizeOv(cv, ov) {
      var dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
      if (ov.width !== Math.round(w * dpr) || ov.height !== Math.round(h * dpr)) {
        ov.width = Math.round(w * dpr); ov.height = Math.round(h * dpr); ov.style.width = w + 'px'; ov.style.height = h + 'px';
      }
      var ctx = ov.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      return ctx;
    }
    function dot(ctx, x, y, col) { ctx.beginPath(); ctx.arc(x, y, 3.6, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = cssv('--wb-surface'); ctx.stroke(); }
    function drawCross(i) {
      (spr ? [[main, ovM], [spr, ovS]] : [[main, ovM]]).forEach(function (p) {
        var ch = p[0], ctx = sizeOv(ch.canvas, p[1]);
        if (i == null || !n || !ch.chartArea) return;
        var ca = ch.chartArea, x = Math.round(ch.scales.x.getPixelForValue(i)) + 0.5;
        ctx.strokeStyle = cssv('--wb-mark'); ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(x, ca.top); ctx.lineTo(x, ca.bottom); ctx.stroke(); ctx.setLineDash([]);
        var ys = ch.scales.y;
        if (ch === main) {
          if (isNum(src.mid[i])) dot(ctx, x, ys.getPixelForValue(src.mid[i]), cssv('--wb-ink'));
          if (isNum(src.ask[i])) dot(ctx, x, ys.getPixelForValue(src.ask[i]), cssv('--wb-up'));
          if (isNum(src.bid[i])) dot(ctx, x, ys.getPixelForValue(src.bid[i]), cssv('--wb-down'));
          if (src.xl && isNum(src.xl[i])) dot(ctx, x, ys.getPixelForValue(src.xl[i]), cssv('--wb-series-5'));
        } else if (isNum(src.spr[i])) dot(ctx, x, ys.getPixelForValue(src.spr[i]), cssv('--wb-legacy-purple'));
      });
    }
    function idxAt(ch, ev) {
      if (!n || !ch.chartArea) return null;
      var r = ch.canvas.getBoundingClientRect(), px = ev.clientX - r.left, xs = ch.scales.x;
      if (px < xs.left - 2 || px > xs.right + 2) return null;
      return Math.max(ctl.lo, Math.min(ctl.hi, Math.round(xs.getValueForPixel(px))));
    }
    var hovRaf = 0, hovEv = null;
    function onMove(ev) {
      var ch = ev.currentTarget === cvM ? main : spr;
      hovEv = { i: idxAt(ch, ev), x: ev.clientX, y: ev.clientY };
      if (hovRaf) return;
      hovRaf = requestAnimationFrame(function () {
        hovRaf = 0; var h = hovEv; if (!h) return;
        if (h.i == null) { onLeave(); return; }
        ctl.cur = h.i; ctl.hx = h.x; ctl.hy = h.y; drawCross(h.i); showHov(src.tip(h.i, ctl), h.x, h.y);
        if (opt.onHover) opt.onHover(h.i);
      });
    }
    function onLeave() { hovEv = null; ctl.cur = null; drawCross(null); hideHov(); if (opt.onHover) opt.onHover(null); }
    (cvS ? [cvM, cvS] : [cvM]).forEach(function (cv) { cv.addEventListener('mousemove', onMove); cv.addEventListener('mouseleave', onLeave); });
    if (opt.onClick) { cvM.style.cursor = 'pointer'; cvM.addEventListener('click', function (ev) { var i = idxAt(main, ev); if (i != null) { hideHov(); opt.onClick(i); } }); }
    // ── 내비게이터(전체 축약 + 창) ──
    var navCache = null, drag = null, winRaf = 0, pend = null;
    function drawNav() {
      if (!navCv) return;
      var dpr = window.devicePixelRatio || 1, w = navCv.clientWidth, h = navCv.clientHeight; if (!w || !h) return;
      if (navCv.width !== Math.round(w * dpr) || navCv.height !== Math.round(h * dpr)) { navCv.width = Math.round(w * dpr); navCv.height = Math.round(h * dpr); navCache = null; }
      var ctx = navCv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      if (!navCache || navCache.w !== w) {
        var mn = [], mx = [], gmin = Infinity, gmax = -Infinity, c, v;
        for (c = 0; c < w; c++) { mn.push(Infinity); mx.push(-Infinity); }
        for (var i = 0; i < n; i++) {
          v = isNum(src.mid[i]) ? src.mid[i] : isNum(src.bid[i]) ? src.bid[i] : src.ask[i];
          if (!isNum(v)) continue;
          c = n > 1 ? Math.min(w - 1, Math.floor(i / (n - 1) * (w - 1))) : 0;
          if (v < mn[c]) mn[c] = v; if (v > mx[c]) mx[c] = v; if (v < gmin) gmin = v; if (v > gmax) gmax = v;
        }
        navCache = { w: w, mn: mn, mx: mx, gmin: gmin, gmax: gmax };
      }
      var NC = navCache, top = 3, bot = h - 13, rng = (NC.gmax - NC.gmin) || 1;
      var Y = function (v) { return top + (1 - (v - NC.gmin) / rng) * (bot - top); };
      ctx.fillStyle = cssv('--wb-subtle'); ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = cssv('--wb-muted'); ctx.lineWidth = 1;
      ctx.beginPath();
      for (var cc = 0; cc < w; cc++) { if (!isFinite(NC.mn[cc])) continue; var y1 = Y(NC.mx[cc]), y2 = Y(NC.mn[cc]); ctx.moveTo(cc + 0.5, y1); ctx.lineTo(cc + 0.5, Math.max(y2, y1 + 1)); }
      ctx.stroke();
      var x0 = n > 1 ? ctl.lo / (n - 1) * w : 0, x1 = n > 1 ? ctl.hi / (n - 1) * w : w;
      ctx.fillStyle = WBChart.alpha('--wb-series-1', 0.22); ctx.fillRect(x0, 0, Math.max(3, x1 - x0), h);
      ctx.strokeStyle = cssv('--wb-mark'); ctx.lineWidth = 1.2; ctx.strokeRect(Math.round(x0) + 0.5, 0.5, Math.max(3, Math.round(x1 - x0)), h - 1);
      ctx.fillStyle = cssv('--wb-mark'); ctx.fillRect(Math.round(x0) - 1, h / 2 - 7, 3, 14); ctx.fillRect(Math.round(x1) - 1, h / 2 - 7, 3, 14);
      ctx.font = '10px ' + (cssv('--wb-font') || 'sans-serif'); ctx.textBaseline = 'bottom'; ctx.fillStyle = cssv('--wb-muted');
      if (src.day && n) { ctx.fillText(mmdd(src.day[0]), 3, h - 1); var e = mmdd(src.day[n - 1]); ctx.fillText(e, w - ctx.measureText(e).width - 3, h - 1); }
    }
    function setWindow(lo, hi, silent) {
      lo = Math.max(0, Math.min(n - 1, Math.round(lo))); hi = Math.max(lo, Math.min(n - 1, Math.round(hi)));
      ctl.lo = lo; ctl.hi = hi; fill(); charts.forEach(function (c) { c.update('none'); }); drawNav(); drawCross(null);
      if (opt.onWindow && !silent) opt.onWindow(ctl);
    }
    function schedule(lo, hi) { pend = [lo, hi]; if (winRaf) return; winRaf = requestAnimationFrame(function () { winRaf = 0; if (pend) setWindow(pend[0], pend[1]); pend = null; }); }
    function cl(v, a, b) { return Math.max(a, Math.min(b, v)); }
    function onDrag(ev) {
      if (!drag) return;
      var x = ev.clientX - drag.left, di = Math.round((x - drag.x) / drag.w * (n - 1)), MIN = Math.min(n - 1, 20), lo = drag.lo, hi = drag.hi;
      if (Math.abs(x - drag.x) > 2) drag.moved = true;
      if (drag.mode === 'pan') { var sp = hi - lo; lo = cl(lo + di, 0, n - 1 - sp); hi = lo + sp; }
      else if (drag.mode === 'l') lo = cl(lo + di, 0, hi - MIN);
      else if (drag.mode === 'r') hi = cl(hi + di, lo + MIN, n - 1);
      else {
        var a = cl(Math.round(drag.x / drag.w * (n - 1)), 0, n - 1), b = cl(Math.round(x / drag.w * (n - 1)), 0, n - 1);
        lo = Math.min(a, b); hi = Math.max(a, b);
        if (hi - lo < MIN) { hi = Math.min(n - 1, lo + MIN); lo = Math.max(0, hi - MIN); }
        if (!drag.moved) return;
      }
      schedule(lo, hi);
    }
    function onUp() {
      window.removeEventListener('mousemove', onDrag); window.removeEventListener('mouseup', onUp);
      if (drag && drag.mode === 'new' && !drag.moved) {   // 클릭 = 지금 창 폭 그대로 그 자리로
        var sp = drag.hi - drag.lo, c = Math.round(drag.x / drag.w * (n - 1)), lo = cl(c - Math.round(sp / 2), 0, Math.max(0, n - 1 - sp));
        schedule(lo, lo + sp);
      }
      drag = null;
    }
    if (navCv) {
      navCv.addEventListener('mousedown', function (ev) {
        ev.preventDefault();
        var r = navCv.getBoundingClientRect(), x = ev.clientX - r.left, w = r.width || 1;
        var x0 = n > 1 ? ctl.lo / (n - 1) * w : 0, x1 = n > 1 ? ctl.hi / (n - 1) * w : w;
        var mode = Math.abs(x - x0) <= 6 ? 'l' : Math.abs(x - x1) <= 6 ? 'r' : (x > x0 && x < x1) ? 'pan' : 'new';
        drag = { mode: mode, x: x, lo: ctl.lo, hi: ctl.hi, w: w, left: r.left, moved: false };
        window.addEventListener('mousemove', onDrag); window.addEventListener('mouseup', onUp);
      });
      navCv.addEventListener('mousemove', function (ev) {
        if (drag) return;
        var r = navCv.getBoundingClientRect(), x = ev.clientX - r.left, w = r.width || 1;
        var x0 = n > 1 ? ctl.lo / (n - 1) * w : 0, x1 = n > 1 ? ctl.hi / (n - 1) * w : w;
        navCv.style.cursor = (Math.abs(x - x0) <= 6 || Math.abs(x - x1) <= 6) ? 'ew-resize' : (x > x0 && x < x1) ? 'grab' : 'crosshair';
      });
    }
    ctl.setWindow = setWindow;
    ctl.setOut = function (on) { ctl.showOut = !!on; fill(); main.update('none'); };
    ctl.syncTo = function (k) {   // 다른 차트가 가리킨 시각(k = '날짜 시:분:초') → 그 이전 마지막 이벤트에 십자선만(툴팁 없음)
      if (ctl.cur != null) return;
      if (k == null || !src.key || !n) { drawCross(null); return; }
      var lo = 0, hi = n; while (lo < hi) { var m = (lo + hi) >> 1; if (src.key[m] <= k) lo = m + 1; else hi = m; }
      var i = lo - 1; drawCross((i >= ctl.lo && i <= ctl.hi) ? i : null);
    };
    ctl.redraw = function () { navCache = null; drawNav(); drawCross(null); };
    ctl.dayLo = function (k) { return dsIdx[Math.max(0, dsIdx.length - k)]; };   // 마지막 k 일의 첫 이벤트
    ctl.setSrc = function (ns) {   // 데이터만 갈아 끼움(차트를 다시 만들지 않음 · 애니메이션 없음) — 창: 전체였으면 전체 · 끝에 붙어 있었으면 끝 유지
      var whole = ctl.lo === 0 && ctl.hi >= n - 1, atEnd = ctl.hi >= n - 1, span = ctl.hi - ctl.lo, keep = ctl.cur;
      src = ns; build(); navCache = null;
      if (whole || !n) setWindow(0, n - 1, true);
      else if (atEnd) setWindow(Math.max(0, n - 1 - span), n - 1, true);
      else setWindow(ctl.lo, Math.min(ctl.hi, n - 1), true);
      if (keep != null && keep < n) {   // 마우스가 올라가 있으면 십자선·툴팁도 새 값으로
        ctl.cur = keep; drawCross(keep);
        var hv = $('otcHov'); if (hv && !hv.hidden && ctl.hx != null) showHov(src.tip(keep, ctl), ctl.hx, ctl.hy);
      }
    };
    ctl.destroy = function () {
      charts.forEach(function (c) { try { c.destroy(); } catch (e) { /* noop */ } });
      window.removeEventListener('mousemove', onDrag); window.removeEventListener('mouseup', onUp);
      if (S.ev[key] === ctl) delete S.ev[key];
    };
    S.ev[key] = ctl;
    setWindow(ctl.lo, ctl.hi, true);
    if (opt.onWindow) opt.onWindow(ctl);
    return ctl;
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
  async function xget(path, extra, init) {   // 공통: 키 · 주소 · 터널 회전 1회 재시도 · 403 = 저장 키 폐기 · init = fetch 옵션(POST 등)
    var key = getKey() || S.memKey || '';
    if (!key) throw new KeyErr('키 없음');
    if (!S.baseP) S.baseP = getApiBase();            // 첫 화면의 동시 호출(meta · board · basis)이 api_base.txt 를 한 번만 읽게
    var base = await S.baseP;
    if (!base) { S.baseP = null; base = await getApiBase(true); }
    if (!base) throw new Error('API 주소 없음 — /assets/api_base.txt 비었거나 서버·터널이 꺼짐');
    var hd = Object.assign({ 'X-QH-KEY': key, 'ngrok-skip-browser-warning': '1' }, extra || {});
    var call = function (b) { return fetch(b + path, Object.assign({ headers: hd }, init || {})); };   // cache:'no-store' 를 주면 Chromium 이 CORS 사전요청 캐시도 건너뛴다(5초마다 OPTIONS) — 응답 헤더가 no-store 라 저장은 안 된다
    var res;
    try { res = await call(base); }
    catch (e) {
      var fb = await getApiBase(true);
      if (fb && fb !== base) res = await call(fb);
      else throw new Error('서버에 연결할 수 없음 — 터널/서버가 내려갔거나 주소가 바뀜');
    }
    if (res.status >= 500 && res.status !== 500) {   // 502/503/530 = 터널 회전 신호 → 새 주소로 1회
      var fb2 = await getApiBase(true);
      if (fb2 && fb2 !== base) res = await call(fb2);
    }
    if (res.status === 401) { var d0 = await detailOf(res); var pe = new Error(d0 || '401'); pe.pw = true; throw pe; }   // 내 포지션 두 번째 문(X-OTC-PW) — 키는 그대로 두고 비밀번호 카드로
    if (res.status === 403) {
      var d = await detailOf(res);
      if (/OTC_PNL_PW/.test(d)) throw new Error(d);                      // 서버에 비밀번호 미설정(403) — 키 문제가 아니므로 저장 키는 지우지 않는다
      dropKey(); S.memKey = ''; throw new KeyErr('키가 맞지 않음 — ' + (d || '403'), true);
    }
    if (!res.ok) { var d2 = await detailOf(res); throw new Error('서버 오류 ' + res.status + (d2 ? ' — ' + d2 : '')); }
    return res.json();
  }
  function oget(path, fresh) {   // 한 번 받은 응답은 재사용(탭을 오가도 다시 부르지 않음) · fresh = LOAD
    if (!fresh && S.cache[path]) return S.cache[path];
    var p = xget(path);
    S.cache[path] = p;
    p.catch(function () { if (S.cache[path] === p) delete S.cache[path]; });
    return p;
  }
  // 폴링(보드): 직전 응답의 cursor 를 쿼리가 아니라 헤더로 — URL 이 매번 같아야 브라우저가 CORS 사전요청을 캐시한다.
  // 헤더는 처음부터 늘 붙인다('-' = 없음) → 사전요청이 허용한 헤더 목록이 바뀌지 않는다. 값은 한글 별칭 대비 encodeURIComponent.
  function pget(path, since) { return xget(path, { 'X-OTC-Since': since ? encodeURIComponent(since) : '-' }); }
  function xpost(path, body, extra) { return xget(path, Object.assign({ 'Content-Type': 'application/json' }, extra || {}), { method: 'POST', body: JSON.stringify(body) }); }   // 쓰기 = 3선 키인 · 내 포지션 등록/삭제(2026-11-11 · extra = X-OTC-PW)
  function dropCache(prefix) { Object.keys(S.cache).forEach(function (k) { if (k.indexOf(prefix) === 0) delete S.cache[k]; }); }
  function keyErr(e) {
    if (!e || !e.nokey) return false;
    showGate(e.denied ? '저장된 키가 맞지 않아 지웠습니다(' + emsg(e) + '). 다시 입력하세요.' : '이 화면은 키(X-QH-KEY)가 있어야 데이터가 보입니다.');
    return true;
  }
  function showGate(msg) {
    $('otcGateMsg').textContent = msg || '이 화면은 키(X-QH-KEY)가 있어야 데이터가 보입니다.';
    $('otcGate').hidden = false;
    ['vBoard', 'vSpread', 'vPnl', 'vBond', 'vBroker', 'vTeam'].forEach(function (id) { $(id).hidden = true; });
    S.meta = null; S.on = false; boStop(); prStopAll(); pnStop();
    if (window.WBShell) WBShell.setPage('otc-' + (parseHash().v));
  }

  // ══ 해시 라우터 ════════════════════════════════════════════════════════
  var VIEWS = { board: { el: 'vBoard', enter: boardEnter, noMeta: true }, spread: { el: 'vSpread', enter: pairEnter, noMeta: true }, pnl: { el: 'vPnl', enter: pnlEnter, noMeta: true }, bond: { el: 'vBond', enter: bondEnter }, broker: { el: 'vBroker', enter: brokerEnter }, team: { el: 'vTeam', enter: teamEnter } };
  function parseHash() {
    var h = String(location.hash || '').replace(/^#/, ''), i = h.indexOf('?');
    var v = (i < 0 ? h : h.slice(0, i)) || 'board';
    var p = new URLSearchParams(i < 0 ? '' : h.slice(i + 1));
    return { v: VIEWS[v] ? v : 'board', p: p };
  }
  function hashOf(view, params) {
    var q = [];
    Object.keys(params || {}).forEach(function (k) { var v = params[k]; if (v != null && v !== '') q.push(k + '=' + enc(v)); });
    return '#' + view + (q.length ? '?' + q.join('&') : '');
  }
  function go(view, params) { location.hash = hashOf(view, params); }                 // 화면 이동(뒤로 가기 가능) → hashchange → route
  function stamp(view, params) { try { history.replaceState(null, '', hashOf(view, params)); } catch (e) { /* noop */ } }
  function route() {
    if (!S.on) return;
    var r = parseHash(), prev = S.view;
    Object.keys(VIEWS).forEach(function (k) { $(VIEWS[k].el).hidden = (k !== r.v); });
    S.view = r.v;
    if (window.WBShell) WBShell.setPage('otc-' + r.v);
    hideHov();
    if (prev === 'board' && r.v !== 'board') boLeave();
    if (prev === 'spread' && r.v !== 'spread') prLeave();
    if (prev === 'pnl' && r.v !== 'pnl') pnLeave();
    boFit();   // 보드가 아니면 왼쪽 붙임·오른쪽 비움을 푼다
    if (VIEWS[r.v].noMeta || S.meta) VIEWS[r.v].enter(r.p);
    else if (S.metaP) S.metaP.then(function () { if (S.on && S.meta && S.view === r.v) VIEWS[r.v].enter(parseHash().p); });   // 종목·브로커·팀 = meta(기본값·자동완성)가 온 뒤
  }

  // ══ 시작 · meta ════════════════════════════════════════════════════════
  function start() {   // meta 와 첫 화면(보드)을 동시에 부른다 — 보드는 meta 를 기다리지 않는다
    $('otcGate').hidden = true; $('otcFatal').hidden = true; S.on = true;
    $('otcMeta').innerHTML = '<span class="wb-loading">불러오는 중…</span>';
    S.metaP = oget('/otc/meta', true).then(function (m) { S.meta = m; applyMeta(m); }, function (e) {
      $('otcMeta').textContent = '';
      if (keyErr(e)) return;
      $('otcFatal').innerHTML = errBox('meta 불러오기 실패(종목·브로커·팀 탭과 자동완성이 비어 있음)', e); $('otcFatal').hidden = false;
    });
    route();
  }
  function applyMeta(m) {
    var team = m.team || {};
    var dl = (m.rules || {}).done_link_min;
    if (isNum(dl)) DEF.done = '체결(ㅎㅈ) = 호가 원문 안 ㅎㅈ/확정/거래 또는 ' + dl + '분 안 자기 직전 호가에 붙는 단독 ㅎㅈ — 호가 ≠ 체결, 표시된 것만';
    teamLabel(team.label);   // 2차 내비 팀 탭 이름 = 응답의 team.label(정적 파일엔 이름 없음 · 키 있는 사람에게만 보임)
    $('otcMeta').innerHTML = ''; $('otcMeta').hidden = true;   // 기간 · 캐시 행수 · 이상치 · 갱신 시각 줄은 없앰(사용자 2026-11-06)
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
    prList();   // 종목 스프레드 다리 자동완성(meta.bonds + fut_choices)
  }

  // ══════════════════════════════════════════════════════════════════════
  // (0) 보드 — 첫 화면: 종목 5칸 동시 · 당일/3/5/10일 · 5초 갱신 · 차트를 누르면 그 종목 전체 호가(상세 서랍)
  //   데이터 = /otc/board · /otc/board/detail (엔진 board · bond_span 그대로 · 웹 계산 0).
  //   cursor 는 헤더(X-OTC-Since) — same = 시각만 · full:false = 오늘 블록·head 만 교체 · full:true = 전부 교체.
  //   차트는 다시 만들지 않고 데이터만 갈아 끼운다(setSrc). meta 를 기다리지 않는다(병렬).
  //   종목 칸 설정(별칭 목록 · 기간 · 갱신 켬/끔)만 localStorage 에 기억한다 — 데이터는 저장하지 않는다.
  // ══════════════════════════════════════════════════════════════════════
  var BO_LS = 'otc_board_v1', BO_MS = 5000, BO_H = 150;
  var B = S.board = { aliases: null, days: 1, auto: true, choices: [1, 3, 5, 10], cursor: '', cpath: '', data: null, last: null,
    inflight: 0, fails: 0, err: '', timer: 0, rows: 0, slots: [],
    panes: [paneNew(0), paneNew(1)], pseq: 0, restore: null };   // panes = 상세 서랍 위·아래 2칸
  (function () {
    try {
      var o = JSON.parse(localStorage.getItem(BO_LS) || 'null');
      if (!o) return;
      if (Array.isArray(o.aliases) && o.aliases.length) B.aliases = o.aliases.map(String).slice(0, 12);
      if (isNum(o.days) && o.days >= 1) B.days = o.days;
      if (o.auto === false) B.auto = false;
      if (Array.isArray(o.open) && o.open.length) B.restore = o.open.map(String).slice(0, 2);   // 열려 있던 상세 칸(별칭만)
    } catch (e) { /* 저장값 없음 */ }
  })();
  function boSave() { try { localStorage.setItem(BO_LS, JSON.stringify({ aliases: B.aliases, days: B.days, auto: B.auto, open: B.restore || panesOpen().map(function (p) { return p.alias; }), rbOpen: B.rb ? B.rb.open : true, rbLegs: B.rb ? B.rb.legs : false, rbRef: B.rb ? B.rb.ref : false, rbStat: B.rb ? B.rb.stat : false, rbDays: B.rb ? B.rb.days : 1 })); } catch (e) { /* noop */ } }
  function boPath() { return '/otc/board?' + (B.aliases ? 'aliases=' + enc(B.aliases.join(',')) + '&' : '') + 'days=' + enc(B.days); }
  function hmsOf(iso) { return iso ? String(iso).slice(11, 19) : '–'; }
  function dayLab(n) { return n === 1 ? '당일' : n + '일'; }
  function boH() {   // 차트 높이: 화면 높이에 맞춤(150~180px) — 표현만
    var rows = $('boRows'), n = Math.max(1, B.rows || 5), top = rows ? rows.getBoundingClientRect().top + (window.pageYOffset || 0) : 240;
    var per = (window.innerHeight - top - 12) / n - 8 - 26 - 10;   // 칸 간격 · 머리 한 줄 · 안쪽 여백
    return Math.round(Math.max(150, Math.min(180, per)));
  }
  function boResize() {
    var h = boH(); if (h === BO_H) return; BO_H = h;
    Array.prototype.forEach.call($('boRows').querySelectorAll('.otc-ev-box, .otc-bo-ph'), function (el) { el.style.height = h + 'px'; });
  }
  function boIn(i) { return $('boRows').querySelector('input[data-boslot="' + i + '"]'); }
  function teamLabel(label) {   // 2차 내비 팀 탭 이름 = 응답의 team.label(정적 파일엔 이름 없음)
    if (!label || S.teamLab === label) return;
    S.teamLab = label;
    try {
      (WBShell.allAreas() || []).forEach(function (a) { (a.pages || []).forEach(function (p) { if (p.id === 'otc-team') p.label = label; }); });
      if (S.on && S.view) WBShell.setPage('otc-' + S.view);
    } catch (e) { /* noop */ }
  }

  function boBuild(n) {   // 뼈대(칸 + 차트 틀) — 응답을 기다리지 않고 먼저 그린다
    for (var i = 0; i < B.rows; i++) killEv('bo' + i);
    var h = '';
    for (var k = 0; k < n; k++) {
      h += '<div class="otc-bo-row" data-slot="' + k + '">' +
        '<div class="otc-bo-cell"><input class="wb-input otc-bo-in" data-boslot="' + k + '" list="otcBonds" autocomplete="off" spellcheck="false" placeholder="종목" aria-label="' + (k + 1) + '번 칸 종목">' +
        '<div class="otc-bo-chips" id="boChips' + k + '"></div><div class="otc-bo-mid" id="boMid' + k + '"><span class="wb-skel wb-skel--fig"></span></div><div class="otc-bo-team" id="boTeam' + k + '"></div></div>' +
        '<div class="otc-bo-main" title="누르면 이 종목 전체 호가"><div class="otc-bo-head" id="boHead' + k + '"><span class="wb-skel"></span></div>' +
        '<div class="otc-bo-ev" id="boEv' + k + '"><div class="otc-bo-ph"><span class="wb-loading">불러오는 중…</span></div></div></div></div>';
    }
    B.rows = n; BO_H = boH();
    $('boRows').innerHTML = h.split('otc-bo-ph">').join('otc-bo-ph" style="height:' + BO_H + 'px">'); B.slots = [];
    if (B.aliases) B.aliases.forEach(function (a, j) { var inp = boIn(j); if (inp) inp.value = a; });
  }
  function boSyncBar() {
    $('boDays').innerHTML = B.choices.map(function (n) { return '<button type="button" data-days="' + esc(n) + '"' + (n === B.days ? ' class="is-active"' : '') + '>' + esc(dayLab(n)) + '</button>'; }).join('');
    var a = $('boAuto'); a.setAttribute('aria-pressed', B.auto ? 'true' : 'false'); a.classList.toggle('is-active', B.auto);
  }
  function boStatus() {   // 점: 초록 = 정상 · 회색 = 꺼짐 · 주황 = 엔진 지연/백그라운드 꺼짐 · 빨강 = 에러
    var d = B.last, st = (d && d.status) || {}, cls = '', txt = [];
    if (d) { txt.push('확인 ' + hmsOf(d.now)); txt.push('새 호가 ' + hmsOf(st.last_new)); }
    var lag = (d && st.last_tick) ? Math.round((Date.parse(d.now) - Date.parse(st.last_tick)) / 1000) : null;
    if (B.fails >= 3) { cls = 'err'; txt.push('연결 실패 ' + B.fails + '회 연속 — ' + B.err); }
    else if (st.err) { cls = 'err'; txt.push('엔진 오류: ' + st.err); }
    else if (d && st.background === false) { cls = 'warn'; txt.push('엔진 백그라운드 갱신 꺼짐 — 새 호가가 안 들어올 수 있음'); }
    else if (isNum(lag) && lag > 30) { cls = 'warn'; txt.push('엔진 갱신 지연 ' + lag + '초'); }
    else if (!B.auto) txt.push('자동 갱신 꺼짐');
    else if (d) cls = 'ok';
    $('boDot').className = 'otc-dot' + (cls ? ' ' + cls : '');
    $('boStat').textContent = txt.join(' · ');
  }
  function bk3(b) { return (b && String(b).indexOf('3선') === 0) ? b : null; }   // 3선 차익만 본다(사용자 2026-11-05) — 바스켓 표시는 화면 전체에서 3선 바스켓(3선1/2/3)만
  function fp(v) { return isNum(v) ? v.toFixed(2) : '–'; }                       // 선물 가격(호가 단위 0.01)
  function boSlotInfo(i, a, sv, flash) {   // 왼쪽 칸 + 차트 머리 — head 값 그대로
    var h = (sv && sv.head) || { alias: a, empty: true }, def = null, fut = h.kind === 'fut', fx = fut ? fp : fy;
    ((B.data && B.data.default) || []).forEach(function (x) { if (x.alias === a) def = x; });
    var inp = boIn(i); if (inp && doc.activeElement !== inp) inp.value = a;
    var hasEx = isNum(h.ex_last) || isNum(h.ex_bid) || isNum(h.ex_ask), chips = [];
    if (h.nick) chips.push(chip(esc(h.nick)));
    if (bk3(h.basket)) chips.push(chip(esc(h.basket), 'otc-chip-basket'));
    if (h.ex_live) chips.push(chip('장내 수신', 'wb-badge--open'));
    if (def) chips.push((def.rule ? '' : tag('칸 채움')) + help('기본 세트: ' + (def.why || '') + (def.from ? ' (' + def.from + ' ~ ' + def.to + ')' : '') + (def.rule ? '' : '\n칸 채움 = 현·직전 3선 바스켓 비지표만으로 칸이 안 차서 더 과거 3선 바스켓에서 채운 종목')));
    $('boChips' + i).innerHTML = chips.join('');
    $('boMid' + i).innerHTML = fut ? (isNum(h.ex_last) ? '<span class="otc-bo-lab">현재</span><span class="otc-bo-midv">' + fp(h.ex_last) + '</span>' : '<span class="wb-muted">장내 실시간 없음</span>') :
      h.empty ? '<span class="wb-muted">호가 없음</span>' :
      '<span class="otc-bo-lab">미드</span><span class="otc-bo-midv">' + fy(h.mid) + '</span><span class="otc-bo-bp ' + sgn(h.mid_vs_mp) + '" title="미드 − 전일민평(bp)">' + (isNum(h.mid_vs_mp) ? fbp(h.mid_vs_mp) + 'bp' : '') + '</span>';
    $('boTeam' + i).innerHTML = fut ? (hasEx ? '매수 <b class="otc-buy">' + fp(h.ex_bid) + '</b> / 매도 <b class="otc-sell">' + fp(h.ex_ask) + '</b>' : '') :
      h.empty ? '' : '팀 사 <b class="otc-buy">' + n0(h.team_buy) + '</b> / 팔 <b class="otc-sell">' + n0(h.team_sell) + '</b>' + (isNum(h.ex_last) ? ' · 장내 <b>' + fy(h.ex_last) + '</b>' : '');
    var ex = hasEx ? '<span class="otc-bo-ex">장내 매수 <b class="otc-buy">' + fx(h.ex_bid) + '</b> / 매도 <b class="otc-sell">' + fx(h.ex_ask) + '</b> / 현재 <b>' + fx(h.ex_last) + '</b>' + (h.ex_t ? ' · ' + esc(h.ex_t) : '') + '</span>' : '';
    var hd = $('boHead' + i);
    hd.innerHTML = fut ? '<b class="otc-bo-al">' + esc(a) + '</b>' + (h.nick ? '<span>' + esc(h.nick) + '</span>' : '') + (ex || '<span>장내 실시간 없음(엑셀이 열려 있을 때만) — 지난 날은 1분 종가</span>') :
      h.empty ? '<b class="otc-bo-al">' + esc(a) + '</b><span>최근 호가가 없는 이름입니다 — 종목 칸을 확인하세요</span>' :
      '<b class="otc-bo-al">' + esc(a) + '</b>' + (h.nick ? '<span>' + esc(h.nick) + '</span>' : '') + (bk3(h.basket) ? chip(esc(h.basket), 'otc-chip-basket') : '') +
      '<span>사자 <b class="otc-buy">' + fy(h.bid) + '</b></span><span>팔자 <b class="otc-sell">' + fy(h.ask) + '</b></span><span>미드 <b>' + fy(h.mid) + '</b></span>' +
      '<span>미드−민평 <b class="' + sgn(h.mid_vs_mp) + '">' + (isNum(h.mid_vs_mp) ? fbp(h.mid_vs_mp) + 'bp' : '–') + '</b></span>' +
      '<span>오늘 <b>' + n0(h.n_today) + '</b>건</span><span>팀 사 <b class="otc-buy">' + n0(h.team_buy) + '</b> / 팔 <b class="otc-sell">' + n0(h.team_sell) + '</b></span>' + ex +
      (h.last_t ? '<span class="otc-bo-t" title="마지막 장외 금리 호가 시각">' + esc(h.last_t) + '</span>' : '');
    if (flash) { hd.classList.add('is-flash'); clearTimeout(hd._ft); hd._ft = setTimeout(function () { hd.classList.remove('is-flash'); }, 2000); }
  }
  function boSrc(sv) {   // 블록(종목×날) 이어 붙이기 — 이벤트 축(장내가 있으면 장외 이벤트 + 장내 틱을 합친 축 = 엔진) · 값 그대로
    var nb = ((sv && sv.blocks) || []).length, rs = nb >= 5 ? 0.78 : nb >= 3 ? 0.88 : 1;   // 화살표 크기(여러 날 = 조금 작게)
    var t = [], day = [], bid = [], ask = [], mid = [], mp = [], ds = [], marks = [], tqAt = {}, blocks = (sv && sv.blocks) || [];
    var xb = [], xa = [], xl = [], key = [], hasX = false, hasOtc = false, unit = (sv && sv.head && sv.head.unit) || 'y';
    blocks.forEach(function (b) {
      var off = t.length, m = (b.t || []).length;
      if (b.ex && m) { hasX = true; if (b.ex.unit === 'p') unit = 'p'; }
      for (var i = 0; i < m; i++) {
        t.push(b.t[i]); day.push(b.d); bid.push(b.bid[i]); ask.push(b.ask[i]); mid.push(b.mid[i]); mp.push(b.mp); ds.push(i === 0 && off > 0);
        xb.push(b.xb ? b.xb[i] : null); xa.push(b.xa ? b.xa[i] : null); xl.push(b.xl ? b.xl[i] : null); key.push(b.d + ' ' + b.t[i]);
        if (!hasOtc && (isNum(b.bid[i]) || isNum(b.ask[i]))) hasOtc = true;
      }
      if (!m) return;
      (b.tq || []).forEach(function (q) {   // 팀 호가 = 화살표(그 호가 금리 높이) · np = 금리 없이 방향만 → 그 자리 미드 높이에 작게
        if (q.side !== 1 && q.side !== -1) return;
        var li = Math.max(0, Math.min(m - 1, q.i)), gi = off + li, y = q.y;
        if (q.np || !isNum(y)) y = isNum(b.mid[li]) ? b.mid[li] : isNum(b.bid[li]) ? b.bid[li] : isNum(b.ask[li]) ? b.ask[li] : b.mp;
        (tqAt[gi] = tqAt[gi] || []).push(q);
        if (!isNum(y)) return;
        marks.push(q.np ? { x: gi, y: y, side: q.side, r: 6 * rs, a: 0.45, ink: true, bw: 1, fade: !!q.out, z: 1 }
          : { x: gi, y: y, side: q.side, r: (q.done ? 11.5 : 10) * rs, ink: true, bw: q.done ? 2.6 : 1.2, ring: !!q.done && !q.out, fade: !!q.out, z: 1 });
      });
    });
    var multi = blocks.length > 1, n = t.length, lastB = blocks[blocks.length - 1], fx = unit === 'p' ? fp : fy;
    var endOk = !!(n && lastB && day[n - 1] === lastB.d);   // 오늘 이벤트가 없으면 끝 값 라벨을 달지 않는다(옛 날 값을 '지금'처럼 보이게 하지 않음)
    return { n: n, multiDay: multi, day: day, ds: ds, hm: t.map(function (x) { return String(x).slice(0, 5); }),
      bid: bid, ask: ask, mid: mid, spr: null, mp: mp, marks: marks, outs: [], key: key, unit: unit,
      xb: hasX ? xb : null, xa: hasX ? xa : null, xl: hasX ? xl : null, xw: hasOtc ? 1.1 : 1.8, xSoft: hasOtc,
      endOk: endOk, xEnd: endOk && !!(lastB && lastB.ex),
      tip: function (i) {
        var h = '<b>' + (multi ? esc(mmdd(day[i])) + ' ' : '') + esc(t[i]) + '</b>';
        if (unit !== 'p') h += '<br>사자선 <span class="otc-buy">' + fy(bid[i]) + '</span> · 팔자선 <span class="otc-sell">' + fy(ask[i]) + '</span> · 미드 ' + fy(mid[i]);
        if (hasX && (isNum(xl[i]) || isNum(xb[i]) || isNum(xa[i])))
          h += '<br>장내 ' + ((isNum(xb[i]) || isNum(xa[i])) ? '매수 <span class="otc-buy">' + fx(xb[i]) + '</span> · 매도 <span class="otc-sell">' + fx(xa[i]) + '</span> · ' : '') + '현재 ' + fx(xl[i]);
        (tqAt[i] || []).forEach(function (q) {
          h += '<br>' + tag('팀', 'team') + ' <span class="' + sideCls(q.side) + '">' + (q.side === 1 ? '▲ 사자 ' : '▼ 팔자 ') + ((q.np || !isNum(q.y)) ? '(금리 없이 방향만)' : fy(q.y)) + '</span> · ' + esc(q.broker || '') +
            ((q.t && q.t !== t[i]) ? ' <span class="wb-muted">' + esc(q.t) + '</span>' : '') + (isNum(q.size) ? ' · ' + n0(q.size) + '억' : '') +
            ' · ' + (q.out ? tag('이상치', 'out') : q.done ? tag('✓ 체결 표시', 'done') : '<span class="wb-muted">호가만</span>');
        });
        return h + '<br><span class="wb-muted">' + (isNum(mp[i]) ? '전일민평 ' + fy(mp[i]) + ' · ' : '') + '누르면 전체 호가</span>';
      } };
  }
  function boSync(from, idx) {   // 한 차트에서 가리킨 시각 → 다른 차트도 그 시각(그 이전 마지막 이벤트)에 십자선
    var c = S.ev['bo' + from], k = (idx != null && c && c.src.key) ? c.src.key[idx] : null;
    for (var j = 0; j < B.rows; j++) if (j !== from && S.ev['bo' + j]) S.ev['bo' + j].syncTo(k);
  }
  function boDraw(i) {
    var a = B.data.aliases[i], sv = B.data.series[a], st = B.slots[i] || (B.slots[i] = {});
    var src = boSrc(sv), host = $('boEv' + i), key = 'bo' + i, h = (sv && sv.head) || {};
    if (!src.n) {
      killEv(key);
      host.innerHTML = '<div class="otc-bo-ph" style="height:' + BO_H + 'px">' + (h.kind === 'fut' ? '이 기간 장내 가격이 없습니다(오늘 = 엑셀이 열려 있을 때만 · 지난 날 = 1분 종가)' :
        h.empty ? '호가 없음' : '이 기간에 사자선·팔자선을 만든 금리 호가가 없습니다' + (isNum(h.mp) ? ' · 전일민평 ' + fy(h.mp) : '')) + '</div>';
      st.alias = a; st.has = false; return;
    }
    if (st.has && st.alias === a && S.ev[key]) S.ev[key].setSrc(src);
    else evChart(key, host, src, { h: BO_H, noSpr: true, fitY: true, endLabels: true, onHover: function (idx) { boSync(i, idx); } });
    st.alias = a; st.has = true;
  }
  function boTq(sv) { var b = sv && sv.blocks && sv.blocks[sv.blocks.length - 1]; return (b && b.tq) ? b.tq.length : 0; }
  function mergeBlocks(old, add) {   // 같은 날 블록은 통째 교체 · 없던 날은 뒤에 붙임
    (add || []).forEach(function (nb) {
      var k = -1; old.forEach(function (b, j) { if (b.d === nb.d) k = j; });
      if (k >= 0) old[k] = nb; else old.push(nb);
    });
  }
  function boApply(d, path) {
    B.last = d;
    if (d.exch) { var keep = (B.exch || {}).live; B.exch = d.exch; if (!d.exch.live && keep) B.exch.live = keep; }   // same 응답 = 상태만 · 칩 목록은 유지
    if (d.team && d.team.label) teamLabel(d.team.label);
    if (d.same) { boQuick(); return; }
    var prev = B.data, was = {};
    if (prev) prev.aliases.forEach(function (a) { was[a] = boTq(prev.series[a]); });
    if (d.full || !prev) B.data = { aliases: d.aliases || [], series: d.series || {}, days: d.days, hot_day: d.hot_day, default: d.default || [] };
    else {
      (d.aliases || []).forEach(function (a) {
        var nv = (d.series || {})[a], ov = prev.series[a]; if (!nv) return;
        if (!ov) { prev.series[a] = nv; return; }
        ov.head = nv.head; mergeBlocks(ov.blocks, nv.blocks);
      });
      prev.days = d.days; prev.hot_day = d.hot_day; if (d.default) prev.default = d.default;
    }
    if (Array.isArray(d.day_choices) && d.day_choices.length) B.choices = d.day_choices;
    B.cursor = d.cursor; B.cpath = path;
    var D = B.data;
    if (D.aliases.length !== B.rows) boBuild(D.aliases.length);
    D.aliases.forEach(function (a, i) {
      var st = B.slots[i], fl = !!(prev && st && st.alias === a && was[a] != null && boTq(D.series[a]) > was[a]);   // 새 팀 화살표 → 머리 강조
      boSlotInfo(i, a, D.series[a], fl);
      boDraw(i);
    });
    boSyncBar(); boMarkOpen(); boQuick(); if (B.sel != null) boSel(B.sel);
  }
  function boFetch(user) {   // user = 사람이 누른 것(기간·종목·켬) → 바로 · 아니면 5초 주기(진행 중·탭 가림·끔이면 건너뜀)
    if (!S.on || S.view !== 'board') return;
    if (!user && (B.inflight || doc.hidden || !B.auto)) return;
    var path = boPath(), since = (B.data && B.cpath === path) ? B.cursor : '';
    B.inflight++;
    pget(path, since).then(function (d) {
      if (path !== boPath()) return;                                      // 그 사이 종목·기간이 바뀜 → 버림
      if (!d.same && !d.full && !(B.data && B.cpath === path)) { B.cursor = ''; B.cpath = ''; setTimeout(function () { boFetch(true); }, 0); return; }
      B.fails = 0; B.err = '';
      boApply(d, path);
    }).catch(function (e) {
      if (keyErr(e)) return;
      B.fails++; B.err = emsg(e);                                          // 조용히 다음 주기에 재시도 · 3회 연속이면 빨간 점 + 문구
      if (!B.data && B.fails === 1) Array.prototype.forEach.call($('boRows').querySelectorAll('.otc-bo-ph'), function (el) { el.innerHTML = '<span class="wb-error">불러오기 실패 — ' + esc(emsg(e)) + ' · 다시 시도 중</span>'; });
    }).then(function () { B.inflight = Math.max(0, B.inflight - 1); boStatus(); });
    panesOpen().forEach(function (p) { spFetch(p, user); });
    rbFetch(user);
  }
  function boStart() { boStop(); if (B.auto) B.timer = setInterval(function () { boFetch(false); }, BO_MS); }
  function boStop() { if (B.timer) { clearInterval(B.timer); B.timer = 0; } }
  function boardEnter(p) {
    var qd = p && +p.get('days');
    if (qd && B.choices.indexOf(qd) >= 0) B.days = qd;
    if (!B.rows) boBuild(B.aliases ? B.aliases.length : 5);
    boSyncBar(); boStatus(); rbFoldSync(); boQuick();
    boFetch(true); boStart();
    var want = (p && p.get('open')) ? String(p.get('open')).split(',') : B.restore;   // 주소의 open=종목[,종목] 또는 지난번에 열려 있던 칸
    B.restore = null;
    (want || []).slice(0, 2).forEach(function (a) { boOpen(a); });
  }
  function boLeave() { boStop(); hideHov(); }
  function boSetSlot(i, val) {
    val = String(val || '').trim();
    var cur = B.data ? B.data.aliases.slice() : (B.aliases ? B.aliases.slice() : null), inp = boIn(i);
    if (!cur) { if (inp) inp.value = ''; return; }                         // 첫 응답 전
    if (!val || val === cur[i]) { if (inp) inp.value = cur[i] || ''; return; }
    var j = cur.indexOf(val);
    if (j >= 0) cur[j] = cur[i];                                           // 이미 다른 칸에 있는 종목 = 두 칸 맞바꿈
    cur[i] = val;
    B.aliases = cur; boSave(); boFetch(true);
  }
  function boMarkOpen() {
    Array.prototype.forEach.call($('boRows').children, function (r, i) { r.classList.toggle('is-open', !!(B.data && B.data.aliases[i] && paneOf(B.data.aliases[i]))); });   // 열려 있는 종목(최대 2)의 줄 = 선택 표시
  }
  function boFit() {   // 서랍이 열리면 보드를 그만큼 좁혀 5칸이 계속 보이게(가리지 않음) + 왼쪽 끝까지 씀(가운데 정렬·최대 폭 풀기 · 닫히면 원래대로)
    var v = $('vBoard'), dr = $('boDrawer'), m = $('otcMain'), hd = m.querySelector('.otc-head'); v.style.paddingRight = ''; if (hd) hd.style.paddingRight = '';
    var on = S.view === 'board' && panesOpen().length > 0 && window.innerWidth >= 900;
    m.classList.toggle('is-dr', on);   // 페이지 머리도 같은 왼쪽 선
    if (!on) return;
    var pr = Math.round(v.getBoundingClientRect().right - (window.innerWidth - dr.offsetWidth) + 24);   // 보드 오른쪽 끝과 서랍 경계 사이 24px
    if (pr > 0) { v.style.paddingRight = pr + 'px'; if (hd) hd.style.paddingRight = pr + 'px'; }   // 머리 줄 오른쪽 글자도 서랍에 가리지 않게
  }

  // ── 실시간 저평(3선) 패널 — /otc/basis (엔진 rt_basis 그대로) ──
  //   웹이 하는 계산은 '진입 문턱까지 거리' 뺄셈 한 줄뿐(엔진 under 와 엔진 thresholds) — 나머지 숫자는 전부 응답 값 그대로.
  //   엑셀(장내 실시간)이 닫혀 있으면 엔진이 ok:false + why 를 준다 → 숫자 자리에 그대로 보여 준다(가짜 값 없음).
  var RB = B.rb = { cursor: '', data: null, busy: false, open: true, legs: false, ref: false, stat: false, exch: null, now: '', err: '', days: 1, choices: [1, 3, 5, 10],
    seq: 0, minSeq: 0, kBusy: false, kDirty: false, kMsg: null };   // seq/minSeq = 키인 직후 늦게 온 옛 응답 버리기 · kMsg = 엔진 why 그대로
  // 주 표시 = 응답 primary 가 'mix' 면 혼합(지표물 = 장내 호가 · 비지표 = 장외 메신저 호가 · 사용자 2026-11-05 확정) — 전부 장내 호가 값(sell/buy)은 작게 참고
  function rbMix(d) { return !!(d && d.primary === 'mix' && (d.sell_mix || d.buy_mix)); }
  (function () {
    try { var o = JSON.parse(localStorage.getItem(BO_LS) || 'null'); if (o) { if (o.rbOpen === false) RB.open = false; if (o.rbLegs === true) RB.legs = true; if (o.rbRef === true) RB.ref = true; if (o.rbStat === true) RB.stat = true; if (o.rbDays > 1) RB.days = +o.rbDays; } } catch (e) { /* noop */ }
  })();
  function rbDaysSync() {   // 저평 차트 기간(당일/3일/5일/10일 · 사용자 2026-11-11) — 보드 기간 버튼과 같은 모양 · 선택지는 엔진 day_choices
    $('rbDays').innerHTML = RB.choices.map(function (n) { return '<button type="button" data-days="' + esc(n) + '"' + (n === RB.days ? ' class="is-active"' : '') + '>' + esc(dayLab(n)) + '</button>'; }).join('');
  }
  function fjn(v, dec) { return isNum(v) ? fbp(v, dec == null ? 2 : dec) : '–'; }   // 전(錢) 단위 부호 표기
  function rbFetch(user) {
    if (!S.on || S.view !== 'board' || (!user && RB.busy)) return;
    RB.busy = true;
    var my = ++RB.seq;
    pget('/otc/basis' + (RB.days > 1 ? '?days=' + RB.days : ''), RB.data ? RB.cursor : '').then(function (d) {
      if (my < RB.minSeq) return;                                          // 키인 적용/해제 전에 떠난 응답 — 버림
      RB.err = ''; if (d.exch) RB.exch = d.exch; RB.now = d.now || '';
      if (Array.isArray(d.day_choices) && d.day_choices.length && d.day_choices.join() !== RB.choices.join()) { RB.choices = d.day_choices; rbDaysSync(); }
      if (!d.same) { RB.data = d; RB.cursor = d.cursor; }
      rbRender(!d.same);
    }).catch(function (e) { if (keyErr(e)) return; RB.err = emsg(e); rbRender(false); }).then(function () { RB.busy = false; });
  }
  function boStrip(d) {   // 만기순 금리 변동 띠(2년 지표 ~ 3선 바스켓 ~ 3선 ~ 5년 지표) — 엔진 strip 그대로(정렬 · 변동 bp 포함 · 웹 계산 0)
    var st = (d && d.strip) || [], defs = (d && d.defs) || {};
    $('boStrip').innerHTML = !st.length ? '' : st.map(function (s) {
      var fut = s.kind === 'fut';
      var tip = (s.nick || s.label || '') + ' · 전일 민평 ' + fy(s.prev) + ' → 지금 ' + fy(s.y) + (s.src ? ' · 출처 ' + s.src : '') + (s.t ? ' · 호가 ' + s.t : '') +
        ((fut && isNum(s.px)) ? ' · 선물 ' + fp(s.prev_px) + ' → ' + fp(s.px) : '') + (isNum(s.rem) ? ' · 잔존 ' + s.rem + '년' : '');
      return '<div class="otc-st-cell' + (s.basket ? ' is-bk' : '') + (fut ? ' is-fut' : '') + '" title="' + esc(tip) + '">' +
        '<div class="otc-st-lab">' + esc(s.label || '') + ((s.alias && s.alias !== s.label) ? ' <b class="mono">' + esc(s.alias) + '</b>' : '') + '</div>' +
        '<div class="otc-st-val ' + sgn(s.d_bp) + '">' + (isNum(s.d_bp) ? fbp(s.d_bp) + '<small>bp</small>' : '–') + '</div>' +
        '<div class="otc-st-sub">' + fy(s.y) + ((fut && isNum(s.d_tick)) ? ' · <span class="' + sgn(s.d_tick) + '">' + fjn(s.d_tick, 0) + '틱</span>' : '') + '</div></div>';
    }).join('') + '<span class="otc-st-help">' + help((defs.strip || '만기순 금리 변동 = 지금 금리 − 전일 민평(bp)') + '\n왼쪽 → 오른쪽 = 만기순 · 노랑 테두리 = 3선 바스켓 종목 · 점선 테두리 = 3선 선물\n칸에 마우스를 올리면 전일 민평 · 출처 · 호가 시각') + '</span>';
  }
  function rbFoldSync() {
    $('rbBody').hidden = !RB.open;
    var b = $('rbFold'); b.textContent = RB.open ? '접기 ▴' : '펼치기 ▾'; b.setAttribute('aria-expanded', RB.open ? 'true' : 'false');
    var l = $('rbLegsBtn'); l.setAttribute('aria-pressed', RB.legs ? 'true' : 'false'); l.classList.toggle('is-active', RB.legs);
    var rf = $('rbRefBtn'); rf.setAttribute('aria-pressed', RB.ref ? 'true' : 'false'); rf.classList.toggle('is-active', RB.ref);
    rbStatSync();
  }
  function rbStatSync() {   // 맨 아래 '계산 입력 · 조달 · 검증' 덩이: 기본 접힘(기억) · 패널 전체 접기와 별개 · 접혀 있어도 이상 신호(정본 대조 · 엑셀)는 머리 줄에 보인다
    var b = $('rbStatBtn'), d = RB.data, x = RB.exch || (d && d.exch) || {}, ck = d && d.check, f = [];
    $('rbStat').hidden = !RB.stat;
    b.textContent = '계산 입력 · 조달 · 검증 ' + (RB.stat ? '▾' : '▸'); b.setAttribute('aria-expanded', RB.stat ? 'true' : 'false');
    if (ck && ck.ok === false)   // 엔진 check.ok 그대로 — err 가 있으면 대조 자체가 실패한 것(불일치와 구분)
      f.push('<span class="otc-rb-stf" title="' + esc(ck.err || ('최대차 ' + (isNum(ck.max_diff) ? ck.max_diff.toExponential(1) : '–') + '전')) + (ck.t ? ' · ' + esc(ck.t) : '') + '"><span class="otc-dot err" aria-hidden="true"></span>정본 대조 ' + (ck.err ? '실패' : '불일치') + '</span>');
    if (x.open === false && x.expected !== false) {   // 엑셀이 수신 중이어야 할 시간대(엔진 exch.expected)인데 수신 중이 아님 — 장 마감 뒤·개장 전·주말은 경고 아님(expected 가 없는 옛 응답이면 표시) · 엔진 상태 문장의 앞마디(전체 문장은 툴팁)
      var st = String(x.status || '수신 안 됨'), sh = st.split(' — ')[0];
      f.push('<span class="otc-rb-stf" title="' + esc(st) + '"><span class="otc-dot warn" aria-hidden="true"></span>' + esc(sh.indexOf('엑셀') === 0 ? sh : '엑셀 · ' + sh) + '</span>');
    }
    $('rbStatFlag').innerHTML = f.join('');
  }
  // ── 3선 선물 키인(사용자 2026-11-05) — 허용 시각·범위·숫자 판정은 전부 엔진(session.keyin · POST 응답 why 그대로) ──
  function rbSess(d) { return (d && d.session) || null; }
  function rbKeySync() {
    var d = RB.data, ss = rbSess(d), k = (ss && ss.keyin) || null, defs = (d && d.defs) || {};
    var allowed = !!(k && k.allowed), act = !!(k && k.active), inp = $('rbKeyIn');
    inp.disabled = !allowed || RB.kBusy;
    $('rbKeyApply').disabled = !allowed || RB.kBusy;
    $('rbKeyClear').disabled = !allowed || !act || RB.kBusy;
    if (k && k.range && k.range.length === 2) { inp.min = k.range[0]; inp.max = k.range[1]; }
    var fu = (d && d.inputs && d.inputs.fut_used) || {};
    inp.placeholder = isNum(fu.last) ? fp(fu.last) : '';
    if (doc.activeElement !== inp && !RB.kDirty) inp.value = (act && isNum(k.price)) ? fp(k.price) : '';
    var bd = $('rbKeyBadge');
    bd.hidden = !act; bd.textContent = act ? '선물 키인 ' + fp(k.price) + (k.t ? ' · ' + k.t : '') : '';
    $('rbCard').classList.toggle('is-keyin', act);
    var note = '';
    if (d && !ss) note = '이 응답에 키인 정보 없음 — 엔진 갱신(서버 재시작) 전';
    else if (ss) {
      note = (allowed ? '' : esc((k && k.cutoff) || ss.cutoff || '') + ' 이후 키인 가능 — 지금은 장내 엑셀 가격 · ') +
        '계산 선물 = ' + esc(ss.fut_src || '–') +
        help((defs.after_close || '') + (ss.bond_rule ? '\n바스켓: ' + ss.bond_rule : '') + (k && k.range ? '\n키인 범위(엔진): ' + k.range[0] + ' ~ ' + k.range[1] : ''));
    }
    $('rbKeyNote').innerHTML = note;
    var m = $('rbKeyMsg');
    m.textContent = RB.kBusy ? '보내는 중…' : (RB.kMsg ? RB.kMsg.text : '');
    m.classList.toggle('is-err', !RB.kBusy && !!(RB.kMsg && RB.kMsg.err));
  }
  function rbKeySend(price) {
    if (RB.kBusy) return;
    RB.kBusy = true; RB.kMsg = null; rbKeySync();
    xpost('/otc/basis/keyin', { price: price }).then(function (r) {
      if (r && r.ok) RB.kDirty = false;                                    // 거절이면 친 값은 칸에 남겨 둔다(고쳐서 다시)
      RB.kMsg = (r && r.ok) ? null : { err: true, text: (r && r.why) || '엔진이 받지 않음(사유 없음)' };
    }).catch(function (e) {
      if (keyErr(e)) return;
      RB.kMsg = { err: true, text: '키인 전송 실패 — ' + emsg(e) };
    }).then(function () {
      RB.kBusy = false;
      RB.minSeq = RB.seq + 1; RB.cursor = '';                             // 엔진이 그 자리에서 다시 계산해 둔다 → 바로 다시 받기
      rbKeySync(); rbFetch(true);
    });
  }
  function rbKeyApply() {
    var inp = $('rbKeyIn');
    if (inp.disabled) return;
    var v = String(inp.value || '').trim();
    if (!v) {   // type=number 는 숫자가 아니면 값을 비운다 → 빈 값을 '해제'로 보내지 않는다(해제는 [해제] 버튼만)
      RB.kMsg = { err: true, text: (inp.validity && inp.validity.badInput) ? '숫자가 아닙니다' : '가격을 넣으세요 — 키인을 끄려면 [해제]' };
      rbKeySync(); return;
    }
    inp.blur();
    rbKeySend(Number(v));
  }
  function rbKeyClear() { if (!$('rbKeyClear').disabled) { RB.kDirty = false; rbKeySend(null); } }
  function rbSide(d, kind) {   // 제목 한 줄 + 큰 숫자만(사용자 2026-11-05) — 정의·문턱·참고 값은 ? 툴팁으로
    var mix = rbMix(d), x = d[kind + (mix ? '_mix' : '')] || {}, alt = mix ? d[kind] : null;
    var ref = d[kind === 'sell' ? 'ref_sell' : 'ref_buy'] || {}, th = d.thresholds || {}, defs = d.defs || {};
    var enter = kind === 'sell' ? th.sell_enter : th.buy_enter, exit = (kind === 'sell' ? th.sell_exit : th.buy_exit) || [];
    var ss = rbSess(d), kin = (ss && ss.keyin) || {}, fs = (ss && ss.fut_src) ? '(' + ss.fut_src + ')' : '';
    var rule = (ss && ss.bond_rule) || '지표물 = 장내 호가 · 비지표 = 장외 메신저 호가';   // 15:45 전/후 규칙 문장 = 엔진 session.bond_rule
    var how = kind === 'sell' ? (mix ? '선물 매도호가' + fs + ' · 현물 매수(사자선): ' + rule : '선물 매도호가' + fs + ' · 현물 매수호가(장내)')
      : (mix ? '선물 매수호가' + fs + ' · 현물 매도(팔자선): ' + rule : '선물 매수호가' + fs + ' · 현물 매도호가(장내)');
    var pc = d.prev_close || {};
    var tip = how + ' · 조달 ' + (isNum((d.funding || {})[kind]) ? fnum(d.funding[kind], 4) + '%' : '–') + '\n' + (defs[kind] || '') + '\n' + (defs.mix || '') + (defs.d_prev ? '\n' + defs.d_prev : '') +
      (pc.ok ? '\n전일(' + (pc.date || '') + ') 종가: 선물 ' + fp(pc.fut) + ' · U ' + fjn(pc.U) + ' · Ub ' + fjn(pc.Ub) + (isNum(pc.d_fut) ? ' · 선물 전일 대비 ' + fjn(pc.d_fut, 0) + '틱' : '') : '') +
      (x.ok ? '\n지금: 선물 ' + fp(x.fut) + ' · 이론가 ' + fnum(x.theo, 4) + ' · 평균 선도수익률 ' + fnum(x.avg_fwd_ytm, 4) : '') +
      (isNum(enter) ? '\n진입 문턱 ' + fjn(enter, 1) + (exit.length ? ' · 청산 문턱 ' + exit.join(' ~ ') : '') : '') +
      '\n참고 · 전부 장내 호가 ' + ((alt && alt.ok) ? fjn(alt.under) : '–') + ' · 현재가 ' + (ref.ok ? fjn(ref.under) : '–') + ' — ' + (defs.ref || '') +
      '\n' + (defs.limits || '') + '\n관찰 전용 — 추천·주문 아님';
    return '<div class="otc-rb-lab">' + (kind === 'sell' ? '매도차익 저평 U' : '매수차익 저평 Ub') + help(tip) +
        (kin.active ? '<span class="otc-tag otc-tag--key" title="' + esc('선물 가격 = 키인 ' + fp(kin.price) + (kin.t ? ' (' + kin.t + ')' : '') + ' — 매도·매수 좌표 모두') + '">키인 기준</span>' : '') + '</div>' +
      (x.ok ? '<div class="otc-rb-val ' + sgn(x.under) + '"' + (isNum(x.d_prev) ? ' title="' + esc('전일 대비 ' + fjn(x.d_prev) + '전 · 전일 종가 ' + fjn(x.prev) + (pc.date ? '(' + mmdd(pc.date) + ')' : '')) + '"' : '') + '>' + fjn(x.under) + '<small>전</small></div>'   // 전일 대비 · 가장 강해짐/약해짐 글자 줄은 없앰(사용자 2026-11-06) — 값은 툴팁 · 종목 표에
        : '<div class="otc-rb-val wb-muted">–</div><div class="otc-rb-sub">' + esc(x.why || '값 없음 — 아래 사유') + '</div>');
  }
  function rbLegs(d, stack) {   // 종목별 저평 · 전일 대비 — 원인 종목 행 = 노랑 강조 · 가장 약해짐(매수 좌표)/강해짐(매도 좌표) 배지 · stack = 매도/매수 좌표 표 두 덩이(좁은 폭)
    var mix = rbMix(d), sl = {}, bl = {}, defs = d.defs || {}, drv = (d.driver && d.driver.alias) || null;
    var sub = function (b, l) {   // 비지표인데 오늘 장외 호가가 없어 장내로 대체된 종목(엔진 legs[].fallback) = 눈에 띄게
      return (l && l.fallback === true) ? ' ' + tag('장외 호가 없음 → 장내', 'rst') : '';
    };
    (((d[mix ? 'sell_mix' : 'sell'] || {}).legs) || []).forEach(function (l) { sl[l.alias] = l; });
    (((d[mix ? 'buy_mix' : 'buy'] || {}).legs) || []).forEach(function (l) { bl[l.alias] = l; });
    var cell = function (l, c, warn, badge) {
      return l ? '<td class="' + c + 'num ' + sgn(l.under) + '"><b>' + fjn(l.under) + '</b></td>' +
          '<td class="' + c + 'num ' + sgn(l.d_prev) + '"' + (isNum(l.prev) ? ' title="전일 종가 저평 ' + esc(fjn(l.prev)) + '"' : '') + '>' + (badge ? badge + ' ' : '') + '<b>' + fjn(l.d_prev) + '</b></td>' +   // 배지는 숫자 앞 — 숫자는 칸 오른쪽 끝에 그대로 맞춰짐(사용자 2026-11-06)
          '<td class="' + c + 'num">' + fy(l.ytm) + (isNum(l.d_ytm_bp) ? ' <small class="otc-rb-dy ' + sgn(l.d_ytm_bp) + '" title="쓴 수익률 − 전일 민평 종가(bp)">' + fbp(l.d_ytm_bp) + '</small>' : '') + '</td>' +
          '<td class="' + c + 'lt">' + (l.src ? esc(l.src) + (l.src_t ? ' <span class="wb-muted">' + esc(l.src_t) + '</span>' : '') + (warn || '') : '<span class="wb-muted">–</span>') + '</td>' +
          '<td class="' + c + 'num">' + fy(l.fwd_ytm) + '</td><td class="' + c + 'num">' + fnum(l.theo, 4) + '</td>'
        : '<td class="' + c + 'num wb-muted">–</td><td class="' + c + 'num wb-muted">–</td><td class="' + c + 'num wb-muted">–</td><td class="' + c + 'wb-muted">–</td><td class="' + c + 'num wb-muted">–</td><td class="' + c + 'num wb-muted">–</td>';
    };
    var tip = help((defs.leg || '') + '\n' + (defs.d_prev || '') + '\n' + (defs.driver || '') + (defs.weak ? '\n' + defs.weak : '') + (defs.strong ? '\n' + defs.strong : '') + '\n' + (defs.mix || '') + (defs.cpn_yn ? '\n' + defs.cpn_yn : '') +
      '\n쓴 수익률: 매도 좌표 = 현물 매수호가(사자) · 매수 좌표 = 현물 매도호가(팔자) · 옆 작은 ±bp = 쓴 수익률 − 전일 민평 종가\n출처 = 그 수익률을 가져온 곳(장내 호가 · 장외 선 + 그 호가 시각)\n함의 가격 = 그 종목 선도수익률이 함의하는 표준물 가격');
    var cols = function (c) { return '<th class="num' + c + '">저평(전)</th><th class="num' + c + '">전일 대비</th><th class="num' + c + '">쓴 수익률</th><th' + (c ? ' class="' + c.trim() + '"' : '') + '>출처</th><th class="num' + c + '">선도</th><th class="num' + c + '">함의 가격</th>'; };
    var lab = function (k) { return (k === 'sell' ? '매도 좌표 · 현물 매수(사자)' : '매수 좌표 · 현물 매도(팔자)') + (mix ? '' : ' · 전부 장내 호가'); };
    var name = function (b, isD) {
      return '<td>' + chip(esc(b.tag), 'otc-chip-basket') + ' <b class="mono">' + esc(b.alias) + '</b>' +
        (isD ? ' <span class="otc-tag otc-tag--drv">원인</span>' + help((defs.driver || '원인 종목 = 엔진이 고른 종목') + (isNum(d.driver.score) ? '\n점수 ' + d.driver.score : '')) : '') + '</td>';
    };
    var trOpen = function (b, isD) { return '<tr' + (isD ? ' class="is-driver"' : '') + ' title="' + esc('표면 ' + b.coupon + '% · 만기 ' + b.mat + ' · 전일 종가수익률 ' + b.close_ytm + ' · ' + b.code) + '">'; };
    var sBadge = function (b) { return (d.strong && d.strong.alias === b.alias) ? '<span class="otc-tag otc-tag--strong otc-tag--lead">가장 강해짐</span>' + help(defs.strong || '') : ''; };
    var wBadge = function (b) { return (d.weak && d.weak.alias === b.alias) ? '<span class="otc-tag otc-tag--weak otc-tag--lead">가장 약해짐</span>' + help(defs.weak || '') : ''; };
    var bk = d.basket || [];
    if (!bk.length) return '<table class="wb-table otc-t otc-rb-t"><tbody><tr><td class="wb-muted">바스켓 정보 없음</td></tr></tbody></table>';
    if (stack) {   // 좁은 폭: 매도 좌표 표 / 매수 좌표 표를 위아래로(글자 크기 그대로)
      return ['sell', 'buy'].map(function (k, n) {
        var c = k === 'sell' ? ' day' : '';
        return '<table class="wb-table otc-t otc-rb-t"><thead><tr><th rowspan="2">바스켓 종목' + (n === 0 ? tip : '') + '</th><th class="grp' + c + '" colspan="6">' + lab(k) + '</th></tr><tr>' + cols(c) + '</tr></thead><tbody>' +
          bk.map(function (b) {
            var isD = drv != null && b.alias === drv;
            return trOpen(b, isD) + name(b, isD) + (k === 'sell' ? cell(sl[b.alias], 'day ', sub(b, sl[b.alias]), sBadge(b)) : cell(bl[b.alias], '', sub(b, bl[b.alias]), wBadge(b))) + '</tr>';
          }).join('') + '</tbody></table>';
      }).join('');
    }
    return '<table class="wb-table otc-t otc-rb-t"><thead><tr><th rowspan="2">바스켓 종목' + tip + '</th>' +
      '<th class="grp day" colspan="6">' + lab('sell') + '</th><th class="grp" colspan="6">' + lab('buy') + '</th></tr><tr>' + cols(' day') + cols('') + '</tr></thead><tbody>' +
      bk.map(function (b) {
        var isD = drv != null && b.alias === drv;
        return trOpen(b, isD) + name(b, isD) + cell(sl[b.alias], 'day ', sub(b, sl[b.alias]), sBadge(b)) + cell(bl[b.alias], '', sub(b, bl[b.alias]), wBadge(b)) + '</tr>';
      }).join('') + '</tbody></table>';
  }
  // 패널 자신의 폭 기준 배치(뷰포트 아님 — 상세 서랍이 열리면 패널이 좁아진다): 표가 안 잘릴 때까지 한 단계씩
  //   side(큰 숫자 옆) → below(큰 숫자 아래 · 패널 전체 폭) → stack(매도/매수 표 두 덩이) → wrap(칸 안 줄바꿈 · 마지막 수단 전 단계). 글자 크기는 안 줄인다.
  var RB_MODES = ['side', 'below', 'stack', 'wrap'];
  function rbLayout(force) {
    var card = $('rbCard'), box = $('rbLegs'), d = RB.data;
    if (!d || !RB.open || !card.clientWidth) return;
    var w = card.clientWidth, i = (force || RB.layW !== w) ? 0 : Math.max(0, RB_MODES.indexOf(RB.lay));
    for (; i < RB_MODES.length; i++) {
      var m = RB_MODES[i];
      card.classList.toggle('rb-below', m !== 'side'); card.classList.toggle('rb-stack', m === 'stack' || m === 'wrap'); card.classList.toggle('rb-wrap', m === 'wrap');
      box.innerHTML = rbLegs(d, m === 'stack' || m === 'wrap');
      if (box.scrollWidth <= box.clientWidth + 1) break;
    }
    RB.lay = RB_MODES[Math.min(i, RB_MODES.length - 1)]; RB.layW = w;
  }
  function rbChart(d) {   // 왼쪽 축 = 저평(전 · 그려진 선에 맞춰 좁게) · 오른쪽 축 = 3선 선물 가격
    var s = d.series || {}, t = s.t || [], box = $('rbChartBox');
    var multi = !!(s.day && s.day.length === t.length && (s.days || 1) > 1);   // 여러 날: 라벨 = MM-DD HH:MM · 날 경계선(엔진 ds)
    var labels = multi ? t.map(function (x, i) { return mmdd(s.day[i]) + ' ' + String(x).slice(0, 5); }) : t;
    RB.multi = multi; RB.ds = multi ? s.ds : null; RB.dayOf = multi ? s.day : null;
    if (!t.length) {
      kill('rb'); RB.hasChart = false;
      var ss0 = rbSess(d);
      box.innerHTML = '<div class="otc-bo-ph" style="height:110px">오늘 저평 시계열이 아직 없습니다 — ' +
        ((ss0 && ss0.after_close) ? esc(ss0.cutoff || '') + ' 이후엔 장외 호가·키인이 바뀔 때마다 쌓입니다' : '엑셀(장내 실시간)이 열려 있는 동안 쌓입니다') + '</div>';
      return;
    }
    var th = d.thresholds || {}, flat = function (v) { return t.map(function () { return v; }); };
    var line = function (label, data, col, w, dash, a) { return { label: label, data: data || [], yAxisID: 'y', borderColor: tk(col, a == null ? 1 : a), backgroundColor: tk(col, a == null ? 1 : a), borderWidth: w, borderDash: dash || [], pointRadius: 0, pointHoverRadius: 4, spanGaps: false }; };
    var mix = rbMix(d) && !!(s.U_mix || s.Ub_mix);
    var ds = [line('매도차익 저평 U', mix ? s.U_mix : s.U, '--wb-down', 2.4), line('매수차익 저평 Ub', mix ? s.Ub_mix : s.Ub, '--wb-up', 2.4)];
    if (RB.ref) {   // 참고 선(토글): 전부 장내 호가로 낸 U/Ub · 현재가 U
      if (mix) { ds.push(line('참고 U(전부 장내 호가)', s.U, '--wb-down', 1.1, [4, 3], 0.6)); ds.push(line('참고 Ub(전부 장내 호가)', s.Ub, '--wb-up', 1.1, [4, 3], 0.6)); }
      ds.push(line('참고 U(현재가)', s.U_last, '--wb-muted', 1.1, [2, 3]));
    }
    if (RB.legs) (d.basket || []).forEach(function (b, i) {
      var col = '--wb-series-' + (3 + (i % 3));
      var lm = mix && s.legs_sell_mix && s.legs_buy_mix, tail = lm ? '' : (mix ? '(전부 장내 호가)' : '');
      ds.push(line(b.alias + ' 매도 좌표' + tail, ((lm ? s.legs_sell_mix : s.legs_sell) || {})[b.alias], col, 1.3));
      ds.push(line(b.alias + ' 매수 좌표' + tail, ((lm ? s.legs_buy_mix : s.legs_buy) || {})[b.alias], col, 1.3, [5, 3]));
    });
    // 왼쪽 축 범위 = 그려진 저평 선의 최소~최대 + 여백(범위의 15% · 최소 폭 1전) — 문턱·0선 때문에 넓히지 않는다(표현만 · 값 그대로)
    var mn = Infinity, mx = -Infinity;
    ds.forEach(function (o) { (o.data || []).forEach(function (v) { if (isNum(v)) { if (v < mn) mn = v; if (v > mx) mx = v; } }); });
    var ax = { ymin: undefined, ymax: undefined, step: undefined, fmin: undefined, fmax: undefined, hasFut: false };
    if (isFinite(mn)) {
      var w = mx - mn, pad = Math.max(w * 0.15, (1 - w) / 2, 0.1);
      ax.ymin = Math.floor((mn - pad) * 2) / 2; ax.ymax = Math.ceil((mx + pad) * 2) / 2;
      var span = ax.ymax - ax.ymin; ax.step = span <= 7 ? 0.5 : span <= 16 ? 1 : undefined;   // 눈금 0.5전 / 1전(더 넓으면 자동)
      if (ax.step !== 0.5) { ax.ymin = Math.floor(ax.ymin); ax.ymax = Math.ceil(ax.ymax); }
    }
    // 문턱 점선 · 0선 = 범위 안에 들어올 때만 · 범위 밖 문턱은 축 가장자리에 작은 표시
    var edge = [];
    [[th.sell_enter, '--wb-down', '매도 진입 문턱'], [th.buy_enter, '--wb-up', '매수 진입 문턱'], [0, '--wb-rule-strong', '0']].forEach(function (r) {
      if (!isNum(r[0])) return;
      if (ax.ymin == null || (r[0] >= ax.ymin && r[0] <= ax.ymax)) {
        var o = line(r[2], flat(r[0]), r[1], 1, r[2] === '0' ? [] : [6, 4], r[2] === '0' ? 1 : 0.75); o.rbRef = true; o.pointHoverRadius = 0; ds.push(o);
      } else if (r[2] !== '0') edge.push({ up: r[0] > ax.ymax, text: r[2] + ' ' + fjn(r[0], 0) + (r[0] > ax.ymax ? ' ↑' : ' ↓'), col: r[1] });
    });
    RB.edge = edge;
    // 오른쪽 축 = 3선 선물 현재가(엔진 series.fut) — 값에 맞춰 좁게
    var fut = s.fut || [], fmn = Infinity, fmx = -Infinity;
    fut.forEach(function (v) { if (isNum(v)) { if (v < fmn) fmn = v; if (v > fmx) fmx = v; } });
    if (isFinite(fmn)) {
      var fw = fmx - fmn, fpad = Math.max(fw * 0.15, (0.04 - fw) / 2, 0.005);
      ax.hasFut = true; ax.fmin = Math.floor((fmn - fpad) * 100) / 100; ax.fmax = Math.ceil((fmx + fpad) * 100) / 100;
      ds.push({ label: '3선', data: fut, yAxisID: 'y1', rbFut: true, borderColor: tk('--wb-series-5'), backgroundColor: tk('--wb-series-5'), borderWidth: 1.6, stepped: true, pointRadius: 0, pointHoverRadius: 4, spanGaps: false });
    }
    var dl = s.day_list || [];
    $('rbChartCap').textContent = '왼쪽 = 저평(전) · 오른쪽 = 3선 가격' + (rbSess(d) ? '(계산에 쓴 값 · 키인 포함)' : '') + ' · 점선 = 진입 문턱 ' + fjn(th.sell_enter, 0) + ' / ' + fjn(th.buy_enter, 0) + '(범위 안일 때만) · ' +
      (multi ? mmdd(dl[0]) + ' ~ ' + mmdd(dl[dl.length - 1]) + '(' + dl.length + '일 · 기록 있는 날만) ' + t[0] + ' ~ ' + t[t.length - 1] : t[0] + ' ~ ' + t[t.length - 1]) + ' · ' + n0(t.length) + '점(' + (s.bucket || 5) + '초 솎음)';
    var setAx = function (sc) {
      sc.y.min = ax.ymin; sc.y.max = ax.ymax; sc.y.ticks.stepSize = ax.step;
      sc.y1.display = ax.hasFut; sc.y1.min = ax.fmin; sc.y1.max = ax.fmax;
    };
    var ch = S.charts.rb;
    if (RB.hasChart && ch) { ch.data.labels = labels; ch.data.datasets = ds; setAx(ch.options.scales); ch.options.scales.x.ticks.maxTicksLimit = multi ? 8 : 12; ch.update('none'); return; }
    box.innerHTML = '<div class="otc-chart" style="height:250px"><canvas id="rbChart"></canvas></div>';
    var o = baseOpts({
      scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: multi ? 8 : 12, callback: function (v) { var l = String(this.getLabelForValue(v)); return RB.multi ? l : l.slice(0, 5); } } },
        y: { position: 'left', title: { display: true, text: '저평(전)' }, ticks: { includeBounds: false, maxTicksLimit: 18, callback: function (v) { return fjn(v, Math.abs(v * 2 - Math.round(v * 2)) < 1e-9 && Math.abs(v - Math.round(v)) > 1e-9 ? 1 : 0); } } },
        y1: { position: 'right', display: false, grid: { drawOnChartArea: false }, title: { display: true, text: '3선' }, ticks: { maxTicksLimit: 7, includeBounds: false, callback: function (v) { return fp(v); } } } },
      plugins: { legend: { display: true }, tooltip: { filter: function (it) { return !it.dataset.rbRef; },
        callbacks: { label: function (it) { return it.dataset.rbFut ? '3선 ' + fp(it.parsed.y) : it.dataset.label + ' ' + fjn(it.parsed.y) + '전'; } } } }
    });
    setAx(o.scales);
    o.plugins.legend = Object.assign({}, LEG, { labels: Object.assign({}, LEG.labels, { filter: function (it, data) { return !data.datasets[it.datasetIndex].rbRef; } }) });
    mk('rb', $('rbChart'), { type: 'line', data: { labels: labels, datasets: ds }, options: o, plugins: [{ id: 'rbDays', beforeDatasetsDraw: function (c) {   // 여러 날: 날 경계 세로선 + 날짜(엔진 ds 그대로)
      var dsx = RB.ds, ca = c.chartArea, xs = c.scales.x; if (!dsx || !ca || !xs) return;
      var ctx = c.ctx, lastX = -1e9;
      ctx.save(); ctx.strokeStyle = cssv('--wb-rule-strong'); ctx.lineWidth = 1; ctx.font = '600 10px ' + (cssv('--wb-font') || 'sans-serif'); ctx.textBaseline = 'top'; ctx.fillStyle = cssv('--wb-muted');
      for (var i = 0; i < dsx.length; i++) {
        if (!dsx[i]) continue;
        var x = Math.round(xs.getPixelForValue(i)) + 0.5;
        if (i > 0) { ctx.beginPath(); ctx.moveTo(x, ca.top); ctx.lineTo(x, ca.bottom); ctx.stroke(); }
        if (x - lastX >= 44) { ctx.fillText(mmdd(RB.dayOf[i]), Math.max(x, ca.left) + 3, ca.top + 2); lastX = x; }
      }
      ctx.restore();
    } }, { id: 'rbEdge', afterDatasetsDraw: function (c) {
      var e = RB.edge || [], ca = c.chartArea; if (!e.length || !ca) return;
      var ctx = c.ctx, up = 0, dn = 0;
      ctx.save(); ctx.font = '600 10px ' + (cssv('--wb-font') || 'sans-serif'); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      e.forEach(function (m) { ctx.fillStyle = cssv(m.col); ctx.fillText(m.text, ca.left + 6, m.up ? ca.top + 8 + 12 * (up++) : ca.bottom - 8 - 12 * (dn++)); });
      ctx.restore();
    } }] });
    RB.hasChart = true;
  }
  function rbRender(full) {
    var d = RB.data, x = RB.exch || (d && d.exch) || {};
    var live = !!x.open && !RB.err;   // 머리 상태 = '연결' / '연결실패' 두 가지만(사용자 2026-11-06) · 엔진 상태 문장·읽은 시각·확인 시각·불러오기 오류는 툴팁에 그대로
    var rm = $('rbMeta');   // 툴팁은 #rbMeta 자체에 — 점·글자가 전처럼 머리 줄 flex 의 직접 자식(가운데 맞춤 · 간격 6px 그대로)
    rm.title = '엑셀 ' + (x.status || '–') + (x.last_read ? ' · 읽음 ' + hmsOf(x.last_read) : '') + (RB.now ? ' · 확인 ' + RB.now : '') + (RB.err ? ' · 불러오기 실패 — ' + RB.err : '');
    rm.innerHTML = '<span class="otc-dot' + (live ? ' ok' : (RB.err || x.expected !== false) ? ' warn' : '') + '" aria-hidden="true"></span> ' + (live ? '연결' : '연결실패');
    boQuick(); rbStatSync();
    if (!d) { if (RB.err) $('rbWhy').innerHTML = errBox('실시간 저평', { message: RB.err }); return; }
    if (!full) return;
    var ss = rbSess(d), kin = (ss && ss.keyin) || {};
    var ttl = $('rbCard').querySelector('.wb-card-title'); if (RB.subDef == null) RB.subDef = ttl.getAttribute('title') || '';
    ttl.setAttribute('title', (ss && ss.bond_rule) ? '집행 가능한 값 · ' + ss.bond_rule + ' · 우리 조달' : RB.subDef);   // 부제 글자는 없앰(사용자 2026-11-06) — 15:45 전/후 규칙(엔진 문장 그대로)은 제목 툴팁에
    rbKeySync();
    var s = d[rbMix(d) ? 'sell_mix' : 'sell'] || {}, b = d[rbMix(d) ? 'buy_mix' : 'buy'] || {}, defs = d.defs || {};
    var dp = function (z) { return (z.ok && isNum(z.d_prev)) ? ' <small class="' + sgn(z.d_prev) + '" title="전일 대비(전)">(' + fjn(z.d_prev) + ')</small>' : ''; };
    $('rbMini').innerHTML = (kin.active ? '<span class="otc-tag otc-tag--key">키인 ' + esc(fp(kin.price)) + '</span> ' : '') + (d.ok ? 'U <b class="' + sgn(s.under) + '">' + (s.ok ? fjn(s.under) : '–') + '</b>' + dp(s) + ' · Ub <b class="' + sgn(b.under) + '">' + (b.ok ? fjn(b.under) : '–') + '</b>' + dp(b) + '전' + (d.t ? ' <span class="wb-muted">' + esc(d.t) + '</span>' : '')
      : '<span class="wb-muted">값 없음 — ' + esc(d.why || x.status || '입력 부족') + '</span>');
    boStrip(d);
    $('rbSell').innerHTML = rbSide(d, 'sell');
    $('rbBuy').innerHTML = rbSide(d, 'buy');
    rbLayout(false);   // 종목별 표: 패널 폭에 맞는 배치로 그림
    var why = $('rbWhy');
    if (d.ok) { why.hidden = true; why.innerHTML = ''; }
    else {
      why.hidden = false;
      var dup = !!(x.status && String(d.why || '').indexOf(x.status) >= 0);   // 엔진 why 가 이미 엑셀 상태 문장을 담고 있으면 또 붙이지 않는다
      why.innerHTML = '<b>지금 저평을 낼 수 없습니다.</b> ' + ((x.open || dup) ? '' : '엑셀: ' + esc(x.status || '') + ' — ') + esc(d.why || '') + (x.file ? ' <span class="wb-muted">(' + esc(x.file) + ')</span>' : '') +
        ((d.missing || []).length ? '<ul>' + d.missing.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul>' : '');
    }
    rbChart(d);
    var f = d.funding || {}, inp = d.inputs || {}, fu = inp.fut || {}, fz = inp.fut_used, ck = d.check;
    var parts = ['계약 <b>' + esc(d.contract || '–') + '</b> · 만기 ' + esc(d.expiry || '–') + ' · 잔존 ' + (isNum(d.t_days) ? d.t_days + '일' : '–'),
      '조달 매도 <b>' + fnum(f.sell, 4) + '</b>%(' + esc(f.sell_note || '') + (isNum(f.cp_prev_month_avg) ? ' = ' + fnum(f.cp_prev_month_avg, 4) + ' − ' + f.lending_fee : '') + ') / 매수 <b>' + fnum(f.buy, 4) + '</b>%(' + esc(f.buy_note || '') + ')'];
    if (fz) parts.push('계산에 쓴 선물 매수 <b class="otc-buy">' + fp(fz.bid) + '</b> / 매도 <b class="otc-sell">' + fp(fz.ask) + '</b> / 현재 <b>' + fp(fz.last) + '</b>' + (ss && ss.fut_src ? ' · ' + esc(ss.fut_src) : ''));
    parts.push(
      '엑셀 선물 매수 <b class="otc-buy">' + fp(fu.bid) + '</b> / 매도 <b class="otc-sell">' + fp(fu.ask) + '</b>' +
        (inp.bonds || []).map(function (r) { return ' · ' + esc(r.alias) + ' 매수 <b class="otc-buy">' + fy(r.bid) + '</b> / 매도 <b class="otc-sell">' + fy(r.ask) + '</b>'; }).join(''),
      '정본 대조 ' + (ck ? '최대차 <b>' + (isNum(ck.max_diff) ? ck.max_diff.toExponential(1) : '–') + '</b>' + (ck.ok === false ? ' <span class="wb-error">' + (ck.err ? '실패 — ' + esc(ck.err) : '불일치') + '</span>' : '') + (ck.t ? '(' + esc(ck.t) + (isNum(ck.n) ? ' · ' + ck.n + '건' : '') + ')' : '') : '아직 없음') +
        help('엔진이 1분마다 빠른 계산(C)과 파이썬 정본 프라이서 결과를 대조한 최대 차이(전) — 엔진 값 그대로'));
    if (d.basket_date) parts.push('바스켓 기준 ' + esc(d.basket_date));
    $('rbStat').innerHTML = parts.map(function (p) { return '<span>' + p + '</span>'; }).join('');
    $('rbTitleHelp').innerHTML = help((defs.sell || '') + '\n' + (defs.buy || '') + '\n' + (defs.leg || '') + '\n' + (defs.mix || '') + '\n' + (defs.ref || '') + (defs.after_close ? '\n' + defs.after_close : '') + '\n' + (defs.limits || '') + '\n5초 갱신이 켜져 있는 동안 계속 갱신 · 관찰 전용(추천·주문 아님)');
  }
  // ── 엑셀에 있는 종목 빠른 넣기(칩) + 엑셀 상태 점 ──
  function boQuick() {
    var x = B.exch || {}, st = RB.exch || x, on = (B.data && B.data.aliases) || [];
    var live = (x.live || []).filter(function (r) { return !(r.kind === 'FUT' && r.alias !== '3선'); });   // 3선 차익만 — 다른 선물은 칩에서 뺀다
    if (!live.some(function (r) { return r.alias === '3선'; })) live.unshift({ alias: '3선', kind: 'FUT', n: 0 });
    $('boQuick').innerHTML = '<span class="otc-dot' + (st.open ? ' ok' : '') + '" aria-hidden="true"></span><span class="otc-bo-qlab">엑셀 ' + esc(st.status || '확인 중') + '</span>' +
      '<span class="otc-bo-qlab">칸에 넣기' + help('엑셀(장내 실시간)에 올라와 있는 종목 — 누르면 고른 칸(종목 칸을 한 번 눌러 고름 · 안 골랐으면 마지막 칸)에 들어간다. 3선 = 3년 국채선물(가격). 장내 값은 차트에 가는 선으로 겹쳐 그린다(오늘 = 엑셀 실시간 · 지난 날 = 1분 종가 · 지표 종목과 3선만).') + '</span>' +
      live.map(function (r) {
        var fx = r.kind === 'FUT' ? fp : fy, has = on.indexOf(r.alias) >= 0;
        return '<button type="button" class="wb-chip' + (has ? ' is-active' : '') + '" data-boadd="' + esc(r.alias) + '" title="' +
          esc(isNum(r.last) ? '장내 현재 ' + fx(r.last) + ' · 매수 ' + fx(r.bid) + ' / 매도 ' + fx(r.ask) + (r.t ? ' · ' + r.t : '') : '지금 엑셀 값 없음') + '">' + esc(r.alias) + '</button>';
      }).join('');
  }
  function boAdd(alias) {
    if (!B.data) return;
    var j = B.data.aliases.indexOf(alias);
    if (j >= 0) { var hd = $('boHead' + j); if (hd) { hd.classList.add('is-flash'); setTimeout(function () { hd.classList.remove('is-flash'); }, 1200); } return; }   // 이미 있음 → 그 칸 강조
    boSetSlot((B.sel != null && B.sel < B.rows) ? B.sel : B.rows - 1, alias);
  }
  function boSel(i) {
    B.sel = i;
    Array.prototype.forEach.call($('boRows').children, function (r, k) { r.classList.toggle('is-sel', k === i); });
  }

  // ── 상세 서랍: 그 종목 전체 호가(전 브로커) + 당일 스트림 + 브로커 랭킹 ──
  // 서랍 = 위·아래 2칸(사용자 2026-11-06). 칸마다 종목 · cursor · 이상치 토글 · 괴리 패널 펼침을 따로 든다. 기간은 보드와 같다.
  //   하나만 열리면 그 칸이 전체 높이 · 둘이면 반씩(차트는 항상 보이고 스트림·랭킹이 칸 안에서 스크롤). 열린 종목 별칭만 기억(localStorage).
  function paneNew(i) { return { i: i, alias: '', data: null, cursor: '', cpath: '', busy: false, has: false, nOut: -1, seq: 0, spr: false, half: null }; }
  function panesOpen() { return B.panes.filter(function (p) { return !!p.alias; }); }
  function paneOf(alias) { for (var k = 0; k < B.panes.length; k++) if (B.panes[k].alias === alias) return B.panes[k]; return null; }
  function spPath(p) { return '/otc/board/detail?alias=' + enc(p.alias) + '&days=' + enc(B.days); }
  function panesBuild() {   // 칸 틀(한 번)
    $('boDrawer').innerHTML = [0, 1].map(function (i) {
      return '<div class="otc-pane" id="spPane' + i + '" data-pane="' + i + '" hidden>' +
        '<div class="otc-dr-head"><div class="otc-dr-title" id="spTitle' + i + '"></div><span class="otc-dr-legend" id="spLegend' + i + '"></span>' +
        '<button type="button" class="wb-btn wb-btn--sm" data-spspr="' + i + '" hidden title="사자−팔자 괴리 패널 펼치기/접기">괴리 ▾</button>' +
        '<button type="button" class="wb-btn wb-btn--sm" data-spclose="' + i + '" aria-label="이 칸 닫기" title="닫기(Esc = 마지막에 연 칸부터)">닫기 ×</button></div>' +
        '<div class="otc-dr-fix"><div class="otc-dr-sum" id="spSum' + i + '"></div><div id="spEv' + i + '"></div></div>' +
        '<div class="otc-dr-body"><section class="wb-card" id="spStream' + i + '"></section><section class="wb-card otc-mt" id="spRank' + i + '"></section></div></div>';
    }).join('');
  }
  function panesSync() {   // 보임/숨김 · 반 높이 여부 · 보드 폭 · 선택 표시 · 기억
    var open = panesOpen(), half = open.length > 1;
    B.panes.forEach(function (p) {
      $('spPane' + p.i).hidden = !p.alias;
      var sb = $('boDrawer').querySelector('[data-spspr="' + p.i + '"]');
      if (sb) { sb.hidden = !half; sb.textContent = p.spr ? '괴리 ▴' : '괴리 ▾'; sb.setAttribute('aria-pressed', p.spr ? 'true' : 'false'); }
    });
    $('boDrawer').hidden = !open.length;
    $('boDrawer').classList.toggle('is-two', half);
    B.panes.forEach(function (p) { if (p.alias && p.data && p.half !== half) spRender(p); });   // 칸 높이가 바뀌면 차트를 그 높이로 다시(글자 크기는 그대로)
    boFit(); boMarkOpen(); boSave();
  }
  function boOpen(alias) {
    alias = String(alias || '').trim(); if (!alias) return;
    var p = paneOf(alias);
    if (p) {   // 이미 열려 있는 종목 = 새로 열지 않고 그 칸을 잠깐 강조
      var el = $('spPane' + p.i); el.classList.add('is-flash'); setTimeout(function () { el.classList.remove('is-flash'); }, 1200);
      return;
    }
    p = B.panes.filter(function (x) { return !x.alias; })[0] || B.panes.slice().sort(function (a, b) { return a.seq - b.seq; })[0];   // 빈 칸 → 없으면 더 먼저 연 쪽
    paneReset(p); p.alias = alias; p.seq = ++B.pseq;
    $('spTitle' + p.i).innerHTML = '<b>' + esc(alias) + '</b>'; $('spSum' + p.i).innerHTML = '<span class="wb-loading">불러오는 중…</span>'; $('spLegend' + p.i).innerHTML = '';
    $('spEv' + p.i).innerHTML = skel(4); $('spStream' + p.i).innerHTML = skelCard('당일 호가 스트림(최신순)'); $('spRank' + p.i).innerHTML = skelCard('서식 브로커 랭킹');
    panesSync(); spFetch(p, true);
  }
  function paneReset(p) { killEv('sp' + p.i); p.alias = ''; p.data = null; p.cursor = ''; p.cpath = ''; p.busy = false; p.has = false; p.nOut = -1; p.half = null; p.spr = false; }
  function boClose(i) {   // i 없으면 마지막에 연 칸(Esc)
    var p = (i != null) ? B.panes[i] : panesOpen().sort(function (a, b) { return b.seq - a.seq; })[0];
    if (!p || !p.alias) return;
    paneReset(p); panesSync(); hideHov();
  }
  function outBtnSync(key) {
    var b = doc.querySelector('[data-evout="' + key + '"]'), c = S.ev[key]; if (!b || !c) return;
    var on = !!c.showOut; b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.classList.toggle('is-active', on);
    b.textContent = b.textContent.replace(on ? '보기' : '숨기기', on ? '숨기기' : '보기');
  }
  function swapKeep(el, html) { var sc = el.querySelector('.otc-scroll'), top = sc ? sc.scrollTop : 0; el.innerHTML = html; var s2 = el.querySelector('.otc-scroll'); if (s2 && top) s2.scrollTop = top; }
  function spSrc(data) {   // 이벤트 = 금리 있는 호가 하나(전 브로커) · 이상치는 축에서 빼고 그 시각 자리(직전 이벤트 다음 칸 사이)에
    var ev = [], outs = [], marks = [], blocks = data.blocks || [], multi = blocks.length > 1, np = 0;
    blocks.forEach(function (b) { np += (b.t || []).length; });
    var pr = np > 1500 ? 2.6 : np > 700 ? 3.2 : np > 300 ? 4 : 5;   // 점 크기(많을수록 작게 · 표현만)
    blocks.forEach(function (b) {
      var first = true, last = -1, m = (b.t || []).length;
      for (var i = 0; i < m; i++) {
        var bk = (b.brokers || [])[b.bk[i]] || {};
        if (b.out[i]) { outs.push({ x: last >= 0 ? last + 0.5 : ev.length - 0.35, y: b.y[i], side: b.side[i], slot: last >= 0 ? last : ev.length, t: b.t[i], bk: bk }); continue; }
        var idx = ev.length;
        ev.push({ t: b.t[i], d: b.d, side: b.side[i], y: b.y[i], bk: bk, done: !!b.done[i], bid: b.bid[i], ask: b.ask[i], mid: b.mid[i], spr: b.spr[i], mp: b.mp, ds: first && idx > 0 });
        first = false; last = idx;
        if ((b.side[i] === 1 || b.side[i] === -1) && isNum(b.y[i])) marks.push(bk.team ? { x: idx, y: b.y[i], side: b.side[i], r: pr + (b.done[i] ? 5.5 : 4.5), ink: true, bw: b.done[i] ? 2.6 : 1.2, ring: !!b.done[i], rc: '--wb-open', rw: 2.4, z: 1 }
          : b.done[i] ? { x: idx, y: b.y[i], side: b.side[i], r: pr + 2.5, ink: true, bw: 1.8, ring: true, rc: '--wb-open', rw: 2.4, z: 1 }   // 시장(팀 아님) 체결 표시 = 조금 큰 화살표 + 초록 고리 · 맨 위 층(사용자 2026-11-06)
          : { x: idx, y: b.y[i], side: b.side[i], r: pr, a: 0.8, bw: pr < 4 ? 0.8 : 1.2 });
      }
    });
    var n = ev.length, pick = function (k) { return ev.map(function (e) { return e[k]; }); };
    return { n: n, multiDay: multi, day: pick('d'), ds: pick('ds'), hm: ev.map(function (e) { return String(e.t).slice(0, 5); }),
      bid: pick('bid'), ask: pick('ask'), mid: pick('mid'), spr: pick('spr'), mp: pick('mp'), marks: marks, outs: outs, nOut: outs.length,
      tip: function (i, ctl) {
        var e = ev[i];
        var h = '<b>' + (multi ? esc(mmdd(e.d)) + ' ' : '') + esc(e.t) + '</b> · <span class="' + sideCls(e.side) + '">' + sideTxt(e.side) + ' ' + fy(e.y) + '</span> · ' + esc(e.bk.broker || '') +
          (e.bk.firm ? ' <span class="wb-muted">' + esc(e.bk.firm) + '</span>' : '') + (e.bk.team ? ' ' + tag('팀', 'team') : '') + (e.done ? ' ' + tag('✓ 체결 표시', 'done') : '');
        h += '<br>사자선 <span class="otc-buy">' + fy(e.bid) + '</span> · 팔자선 <span class="otc-sell">' + fy(e.ask) + '</span> · 미드 ' + fy(e.mid) +
          ' · 사자−팔자 ' + (isNum(e.spr) ? fbp(e.spr, 2) + 'bp' : '–');
        h += '<br><span class="wb-muted">전일민평 ' + fy(e.mp) + ' · 이벤트 ' + n0(i + 1) + ' / ' + n0(n) + '</span>';
        if (ctl.showOut) outs.forEach(function (o) {
          if (o.slot === i) h += '<br><span class="wb-muted">× 이상치 ' + esc(o.t) + ' ' + sideTxt(o.side) + ' ' + fy(o.y) + ' · ' + esc(o.bk.broker || '') + '</span>';
        });
        return h;
      } };
  }
  function spH(p) {   // 2칸일 때 차트 높이 = 160~190px(차트 우선 · 사용자 2026-11-06) — 칸이 넉넉하면 190, 낮으면 160 · 스트림은 남는 높이만큼(칸 안 스크롤)
    var el = $('spPane' + p.i), H = el ? el.clientHeight : 0;
    if (!H) return 180;
    var head = el.querySelector('.otc-dr-head').offsetHeight, sum = $('spSum' + p.i).offsetHeight;
    return Math.round(Math.max(160, Math.min(190, H - head - sum - 200 - (p.spr ? 78 : 0))));
  }
  function spRender(p) {
    var d = p.data, h = d.head || {}, a = p.alias, i = p.i, key = 'sp' + i, chips = [], half = panesOpen().length > 1;
    if (h.nick) chips.push(chip(esc(h.nick)));
    if (h.bucket) chips.push(chip(esc(h.bucket)));
    if (isNum(h.rem)) chips.push(chip('잔존 ' + esc(h.rem) + '년'));
    if (bk3(h.basket)) chips.push(chip(esc(h.basket), 'otc-chip-basket'));   // 3선 바스켓 표시만
    var days = d.days || [];
    $('spTitle' + i).innerHTML = '<b>' + esc(a) + '</b> ' + chips.join(' ') + '<span class="otc-dr-sub">전체 호가 동향(전 브로커) · ' + esc(dayLab(days.length || B.days)) +
      (days.length ? ' ' + esc(mmdd(days[0])) + (days.length > 1 ? '~' + esc(mmdd(days[days.length - 1])) : '') : '') + '</span>';
    $('spSum' + i).innerHTML = (h.empty ? '<span>최근 호가가 없는 이름입니다</span>' :
      '<span>사자 <b class="otc-buy">' + fy(h.bid) + '</b></span><span>팔자 <b class="otc-sell">' + fy(h.ask) + '</b></span><span>미드 <b>' + fy(h.mid) + '</b></span>' +
      '<span>사자−팔자 <b>' + (isNum(h.spr) ? fbp(h.spr, 2) + 'bp' : '–') + '</b></span>' +
      '<span>전일민평 <b>' + fy(h.mp) + '</b></span><span>미드−민평 <b class="' + sgn(h.mid_vs_mp) + '">' + (isNum(h.mid_vs_mp) ? fbp(h.mid_vs_mp) + 'bp' : '–') + '</b></span>' +
      '<span>오늘 <b>' + n0(h.n_today) + '</b>건</span><span>팀 사 <b class="otc-buy">' + n0(h.team_buy) + '</b> / 팔 <b class="otc-sell">' + n0(h.team_sell) + '</b></span>') +
      '<a href="' + esc(hashOf('bond', { alias: a, date: d.today || '' })) + '">종목 분석 탭에서 열기 ›</a>';
    var hh = half ? spH(p) : 300;
    var src = spSrc(d), relay = p.half !== half || p.sprWas !== p.spr || p.hWas !== hh;   // 높이·괴리 패널이 바뀌면 차트를 그 틀로 다시(이상치 토글은 유지)
    if (src.nOut !== p.nOut) { $('spLegend' + i).innerHTML = evLegend(key, src.nOut, '이상치', true); p.nOut = src.nOut; }
    if (!src.n) { killEv(key); p.has = false; $('spEv' + i).innerHTML = '<div class="otc-empty">이 기간에 금리가 있는 호가가 없습니다.</div>'; }
    else if (p.has && S.ev[key] && !relay) S.ev[key].setSrc(src);
    else {
      var out = !!(S.ev[key] && S.ev[key].showOut);
      var c = evChart(key, $('spEv' + i), src, half ? { h: hh, hs: 54, noSpr: !p.spr, yTicks: 6, fitY: true, mpFree: true } : { h: 300, hs: 90, yTicks: 9, fitY: true, mpFree: true });   // 2칸 = 차트 낮게(눈금도 줄임) · 괴리 패널은 버튼으로 펼침
      p.has = true; if (c && out) c.setOut(true);
    }
    p.half = half; p.sprWas = p.spr; p.hWas = hh;
    outBtnSync(key);
    swapKeep($('spStream' + i), streamCard(d.stream || [], d.today, d.n_stream, 'otc-scroll--pane'));
    swapKeep($('spRank' + i), rankCard(d.rank || [], d.week || [], d.today, 'otc-scroll--pane'));
  }
  function spFetch(p, user) {   // 칸마다 종목별 cursor — same 이면 건드리지 않는다
    if (!S.on || !p.alias || (!user && p.busy)) return;
    var path = spPath(p), alias = p.alias, since = (p.data && p.cpath === path) ? p.cursor : '';
    p.busy = true;
    pget(path, since).then(function (d) {
      if (p.alias !== alias || path !== spPath(p) || d.same) return;      // 그 사이 칸이 닫혔거나 종목·기간이 바뀜
      if (d.full) p.data = d;
      else if (p.data && p.cpath === path) {   // 오늘 블록·머리·스트림·랭킹만 교체
        mergeBlocks(p.data.blocks, d.blocks);
        ['head', 'stream', 'n_stream', 'rank', 'week', 'today', 'days'].forEach(function (k) { if (d[k] !== undefined) p.data[k] = d[k]; });
      } else { p.cursor = ''; p.cpath = ''; setTimeout(function () { spFetch(p, true); }, 0); return; }
      p.cursor = d.cursor; p.cpath = path;
      spRender(p);
    }).catch(function (e) {
      if (keyErr(e)) return;
      if (p.alias === alias && !p.data) { $('spSum' + p.i).innerHTML = ''; $('spEv' + p.i).innerHTML = errBox('상세 불러오기 실패', e); }
    }).then(function () { if (p.alias === alias) p.busy = false; });
  }
  function spNav(e) {   // 서랍 안 클릭: 칸 닫기 · 괴리 패널 펼침 · 표의 브로커 행 → 브로커 분석
    var cb = e.target.closest('[data-spclose]'); if (cb) { boClose(+cb.getAttribute('data-spclose')); return; }
    var sb = e.target.closest('[data-spspr]');
    if (sb) { var q = B.panes[+sb.getAttribute('data-spspr')]; q.spr = !q.spr; sb.textContent = q.spr ? '괴리 ▴' : '괴리 ▾'; sb.setAttribute('aria-pressed', q.spr ? 'true' : 'false'); if (q.data) spRender(q); return; }
    if (e.target.closest('.wb-help, a, input, select, button')) return;
    var tr = e.target.closest('tr[data-broker]'), pn = e.target.closest('[data-pane]'); if (!tr || !pn) return;
    var d = B.panes[+pn.getAttribute('data-pane')].data;
    go('broker', { name: tr.getAttribute('data-broker'), asof: (d && d.today) || '', period: S.broker.period || '5d' });
  }

  // ══════════════════════════════════════════════════════════════════════
  // (0b) 종목 스프레드 — 종목−3선 / 종목−종목 장중 금리 스프레드(사용자 2026-11-10)
  //   데이터 = /otc/pair (엔진 pair_live 그대로 · 웹 계산 0): 선1 = A 매도호가 − B 매수호가 · 선2 = A 매수호가 − B 매도호가 · 미드(bp)
  //   다리 값 · 출처 코드(장외/장내/장내 1분 종가/키인) · 대체(fb) · 15:45 이후 첫 행(cut_i)도 응답 그대로 — 웹은 x 배치(시각/이벤트)·표기만.
  //   cursor 는 헤더(X-OTC-Since) — same = 상태(엑셀 · 확인 시각)만 · full:false = 오늘 블록만 교체 · full:true = 전부 교체.
  //   계단 = 그 행의 값이 다음 행(또는 그 날 마지막 행 뒤 짧은 여백)까지 유지 — 엔진 행 사이를 메우거나 지금 시각까지 늘리지 않는다.
  //   입력(다리 · 기간 · 출처 모드 · 가로축 · 갱신 · 선 켬/끔)만 localStorage + 주소 해시에 기억 — 데이터는 저장하지 않는다.
  //   패널 최대 2개(사용자 2026-11-10 "최대 2개까지 · 오른쪽 왼쪽으로 구분"): 왼쪽(L) / 오른쪽(R) 패널마다 상태 전부 따로(prNew 클로저 —
  //   다리 · 기간 · 모드 · cursor · 폴링 타이머 · 데이터 · 차트 · 십자선 · 선 켬/끔 · 툴팁 주인) · 같은 /otc/pair 를 패널마다 따로 부름(엔진·라우터 변경 0).
  //   늦게 온 응답 = 그 패널의 그 요청 세대(gen) · 그 경로일 때만 반영. 왼쪽 = 기존 저장값(otc_pair_v1)·주소 키 그대로 · 오른쪽 = otc_pair_r_v1 · 주소 키 r 접두사 + n=2.
  // ══════════════════════════════════════════════════════════════════════
  var PR_LS = { L: 'otc_pair_v1', R: 'otc_pair_r_v1' }, PR_LS_N = 'otc_pair_n_v1', PR_MS = 3000;
  var PR_HP = { L: '', R: 'r' };   // 주소 해시 키 접두사 — 왼쪽 = 기존 형식(a · b · days · ma · mb · v) 그대로 · 오른쪽 = ra · rb · rdays · rma · rmb · rv
  var PR_MODES = [['auto', '자동'], ['otc', '장외만'], ['exch', '장내만']];
  var PR_SRC_COL = { '0': '--wb-series-4', '1': '--wb-series-5', '2': '--wb-series-6', '3': '--wb-warn' };   // 출처 띠 색(표현 전용 · 이름은 응답 src_codes)
  var PR_CUT_LAB = '15:45 이후 지표도 장외 · 선물 마지막 값';
  // 레벨 / 변동(사용자 2026-11-10): 변동 = 엔진 *_chg(그 호가 금리 − 그날 전일 기준값 · bp) — 웹은 어느 배열을 그릴지만 고른다
  var PR_KL = { l1: 'l1', l2: 'l2', mid: 'mid', ab: 'ab', aa: 'aa', bb: 'bb', ba: 'ba' }, PR_KC = { l1: 'l1c', l2: 'l2c', mid: 'midc', ab: 'abc', aa: 'aac', bb: 'bbc', ba: 'bac' };
  // ── 상태 없는 helper(두 패널 공용) ──
  function prMode(v) { v = String(v || '').toLowerCase(); return PR_MODES.some(function (m) { return m[0] === v; }) ? v : 'auto'; }
  function prSec(s) { s = String(s || ''); return (+s.slice(0, 2)) * 3600 + (+s.slice(3, 5)) * 60 + (+s.slice(6, 8) || 0); }
  function prHM(sec) { var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60); return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m; }
  function prBp(v) { return isNum(v) ? fbp(v, 2) + 'bp' : '–'; }
  function prKind(k) { return { fut: '선물', idx: '현 지표', bond: '종목', fut_off: '선물(지원 안 됨)' }[k] || (k || ''); }
  function prL1(A, B) { return '선1 ' + A + ' 매도−' + B + ' 매수'; }
  function prL2(A, B) { return '선2 ' + A + ' 매수−' + B + ' 매도'; }
  function prPvLeg(pv, leg) {   // 다리 하나의 전일 기준값 — 종목 = 전일 민평 · 선물 = 전일 선물 종가 내재수익률(가격 병기) · 없으면 엔진 why
    var base = (leg && (leg.kind === 'fut' || leg.kind === 'fut_off')) ? '전일 선물 종가' : '전일 민평';
    if (!pv) return base + ' –';
    if (!isNum(pv.y)) return base + ' 없음' + (pv.why ? ' — ' + pv.why : '');
    return base + ' ' + fy(pv.y) + ' (' + mmdd(pv.d) + (isNum(pv.px) ? ' · ' + fp(pv.px) : '') + ')';
  }
  function prPvDays(pv) {   // 날짜 칸 라벨용 '전일 d 기준'
    if (!pv) return '';
    var a = pv.a || {}, b = pv.b || {};
    if (a.d && a.d === b.d) return '전일 ' + mmdd(a.d) + ' 기준';
    return 'A 전일 ' + (a.d ? mmdd(a.d) : '없음') + ' · B 전일 ' + (b.d ? mmdd(b.d) : '없음') + ' 기준';
  }
  function prTodayBlk(d) { var tb = null; ((d && d.blocks) || []).forEach(function (b) { if (b.d === d.today) tb = b; }); return tb; }
  function prPts(R, arr) {   // 계단 점열 — v_i 는 x_i 부터 다음 행(또는 날 끝)까지 · 값 없음/날 경계 = 끊김
    var out = [];
    R.full.forEach(function (g) {
      for (var i = g.i0; i <= g.i1; i++) {
        var v = arr[i];
        if (!isNum(v)) { out.push({ x: R.x[i], y: null }); continue; }
        out.push({ x: R.x[i], y: v });
        if (i === g.i1 || !isNum(arr[i + 1])) out.push({ x: i === g.i1 ? g.hi : R.x[i + 1], y: v });
      }
      out.push({ x: g.hi, y: null });
    });
    return out;
  }
  function prH() { var h = window.innerHeight || 900; return { main: Math.round(Math.max(240, Math.min(340, h * 0.34))), leg: h < 760 ? 100 : 120 }; }   // 패널 1개 · 2개 같은 높이
  var PRS = S.pair = { n: 1, fut: ['3선'], listKey: '', P: {} };   // P.L · P.R = 패널(상태는 P.x.st)
  try { PRS.n = localStorage.getItem(PR_LS_N) === '2' ? 2 : 1; } catch (e) { /* noop */ }
  function prList() {   // 다리 자동완성(두 패널 공용 datalist) = 응답 fut_choices + meta.bonds 별칭
    var bonds = (S.meta && S.meta.bonds) || [], k = PRS.fut.join(',') + '|' + bonds.length;
    if (k === PRS.listKey) return; PRS.listKey = k;
    $('otcPairLegs').innerHTML = PRS.fut.map(function (f) { return '<option value="' + esc(f) + '">국채선물</option>'; }).join('') +
      bonds.map(function (b) { return '<option value="' + esc(b.alias) + '">' + esc([b.nick, b.btype, isNum(b.rem) ? '잔존 ' + b.rem + '년' : ''].filter(Boolean).join(' · ')) + '</option>'; }).join('');
  }

  // ── 패널 하나(side = 'L' | 'R' · root = 패널 DOM) — 아래 함수·상태는 전부 이 패널 것 ──
  function prNew(side, root) {
    var PR = { side: side, a: '', b: '3선', days: 1, ma: 'auto', mb: 'auto', axis: 'time', yfit: 'fit', val: 'lvl', auto: true, hide: { l1: false, l2: false, mid: false },
      choices: [1, 3, 5, 10], cursor: '', cpath: '', data: null, last: null, R: null, ctl: null,
      inflight: 0, fails: 0, err: '', timer: 0, gen: 0, open: false, el: {} };
    function pid(k) { return 'pr' + side + '-' + k; }   // DOM id = 패널 접두사(prL-… / prR-…)
    function E(k) { return PR.el[k]; }
    Array.prototype.forEach.call(root.querySelectorAll('[data-k]'), function (el) { var k = el.getAttribute('data-k'); el.id = pid(k); PR.el[k] = el; });
    E('Side').textContent = side; E('Side').title = side === 'L' ? '왼쪽 패널' : '오른쪽 패널';
    (function () {
      try {
        var o = JSON.parse(localStorage.getItem(PR_LS[side]) || 'null'); if (!o) return;
        if (typeof o.a === 'string') PR.a = o.a;
        if (typeof o.b === 'string' && o.b) PR.b = o.b;
        if (isNum(o.days) && o.days >= 1) PR.days = o.days;
        PR.ma = prMode(o.ma); PR.mb = prMode(o.mb);
        if (o.axis === 'ev') PR.axis = 'ev';
        if (o.yfit === 'all') PR.yfit = 'all';
        if (o.val === 'chg') PR.val = 'chg';
        if (o.auto === false) PR.auto = false;
        if (o.hide && typeof o.hide === 'object') ['l1', 'l2', 'mid'].forEach(function (k) { PR.hide[k] = o.hide[k] === true; });
      } catch (e) { /* 저장값 없음 */ }
    })();
    function prSave() { try { localStorage.setItem(PR_LS[side], JSON.stringify({ a: PR.a, b: PR.b, days: PR.days, ma: PR.ma, mb: PR.mb, axis: PR.axis, yfit: PR.yfit, val: PR.val, auto: PR.auto, hide: PR.hide })); } catch (e) { /* noop */ } }
    function prPath() { return '/otc/pair?a=' + enc(PR.a) + '&b=' + enc(PR.b) + '&days=' + enc(PR.days) + '&mode_a=' + enc(PR.ma) + '&mode_b=' + enc(PR.mb); }
    function prHash() {   // 이 패널의 주소 해시 키(빈 값은 hashOf 가 뺌)
      var p = PR_HP[side], o = {};
      o[p + 'a'] = PR.a; o[p + 'b'] = PR.b; o[p + 'days'] = PR.days; o[p + 'ma'] = PR.ma === 'auto' ? '' : PR.ma; o[p + 'mb'] = PR.mb === 'auto' ? '' : PR.mb; o[p + 'v'] = PR.val === 'chg' ? 'chg' : '';
      return o;
    }
    function hov(html, x, y) { showHov(html, x, y, side); }       // 떠 있는 툴팁은 한 장 — 주인(패널)을 적어 두고
    function unhov() { if (S.hovBy === side) hideHov(); }          // 내 것일 때만 닫는다(다른 패널 툴팁을 건드리지 않음)
    function prSrcName(c) { var m = (PR.data && PR.data.src_codes) || {}; return (!isNum(c) || c < 0) ? '값 없음' : (m[String(c)] || ('출처 ' + c)); }
    function prChg() { return PR.val === 'chg'; }
    function prK() { return prChg() ? PR_KC : PR_KL; }
    function prSuf() { return prChg() ? ' (전일 대비)' : ''; }
    function prNames() { var d = PR.data || {}; return { a: (d.a && d.a.alias) || PR.a || 'A', b: (d.b && d.b.alias) || PR.b || 'B' }; }
    function prSyncBar() {
      var ia = E('A'), ib = E('B'), d = PR.data;
      if (doc.activeElement !== ia) ia.value = PR.a;
      if (doc.activeElement !== ib) ib.value = PR.b;
      E('Days').innerHTML = PR.choices.map(function (n) { return '<button type="button" data-prdays="' + esc(n) + '"' + (n === PR.days ? ' class="is-active"' : '') + '>' + esc(dayLab(n)) + '</button>'; }).join('');
      ['a', 'b'].forEach(function (k) {
        var cur = k === 'a' ? PR.ma : PR.mb, leg = d && d.ok && d[k], same = leg && leg.spec === (k === 'a' ? PR.a : PR.b);
        var fut = !!(same && (leg.kind === 'fut' || leg.kind === 'fut_off'));
        E('Mode' + k.toUpperCase()).innerHTML = PR_MODES.map(function (m) {
          return '<button type="button" data-prmode="' + k + '" data-v="' + m[0] + '"' + (m[0] === cur ? ' class="is-active"' : '') + (fut ? ' disabled title="선물 다리는 출처 고정 — 엔진 규칙(장내)"' : '') + '>' + m[1] + '</button>';
        }).join('');
      });
      Array.prototype.forEach.call(E('Axis').children, function (b) { b.classList.toggle('is-active', b.getAttribute('data-praxis') === PR.axis); });
      Array.prototype.forEach.call(E('Yfit').children, function (b) { b.classList.toggle('is-active', b.getAttribute('data-pryfit') === PR.yfit); });
      Array.prototype.forEach.call(E('Val').children, function (b) { b.classList.toggle('is-active', b.getAttribute('data-prval') === PR.val); });
      var au = E('Auto'); au.setAttribute('aria-pressed', PR.auto ? 'true' : 'false'); au.classList.toggle('is-active', PR.auto);
      E('Card').classList.toggle('is-stale', !!(PR.data && PR.cpath !== prPath()));   // 입력을 바꿨는데 새 응답이 아직 = 흐리게(옛 다리 값을 새 다리처럼 보이지 않게)
    }
    function prStatus() {   // 점: 초록 = 정상 · 회색 = 꺼짐 · 주황 = 불러오기 실패(재시도 중) · 빨강 = 3회 연속 실패
      var d = PR.last, L = PR.data && PR.data.ok && PR.data.last, cls = '', txt = [];
      if (d) txt.push('확인 ' + hmsOf(d.now));
      if (L && L.t) txt.push('오늘 마지막 행 ' + L.t);
      if (PR.inflight && !(PR.data && PR.cpath === prPath())) txt.unshift('불러오는 중…');
      if (PR.fails >= 3) { cls = 'err'; txt.push('연결 실패 ' + PR.fails + '회 연속 — ' + PR.err); }
      else if (PR.err) { cls = 'warn'; txt.push('불러오기 실패 — ' + PR.err + ' · 다시 시도 중'); }
      else if (!PR.auto) txt.push('자동 갱신 꺼짐');
      else if (d) cls = 'ok';
      E('Dot').className = 'otc-dot' + (cls ? ' ' + cls : '');
      E('Stat').textContent = txt.join(' · ');
    }
    function prExch() {   // 상태 한 줄(same 응답에서도 갱신) — 정상 = ● 실시간 + 오늘 마지막 행 시각 · 문제(엑셀 끊김 · 다리 warn · 오늘 전일 기준 없음)만 주황 점 + 짧은 글 · 엔진 문장·시각·파일은 툴팁 그대로
      var el = $(pid('St')); if (!el) return;
      var d = PR.data || {}, x = (PR.last && PR.last.exch) || d.exch || {}, L = d.last, on = !!x.open, tb = prTodayBlk(d);
      var pv = (L && L.prev) || (tb && tb.prev) || {}, probs = [];
      if (!on && x.expected === true) probs.push(['엑셀 끊김', '수신 중이어야 할 시간인데 연결 안 됨 — 오늘 장내 값이 멈춰 있을 수 있음\n엑셀 ' + (x.status || '–')]);
      [['A', d.a, 'a'], ['B', d.b, 'b']].forEach(function (q) {
        if (q[1] && q[1].warn) probs.push([q[0] + ' ' + (q[1].alias || q[1].spec || '') + ' — ' + q[1].warn, q[1].warn]);
        var r = pv[q[2]]; if (r && !isNum(r.y)) probs.push([q[0] + ' 전일 기준 없음', r.why || '엔진 prev.y 없음']);
      });
      var tip = ['엑셀(장내) ' + (x.status || '–') + (x.last_read ? ' · 읽음 ' + hmsOf(x.last_read) : '') + (x.file ? ' · ' + x.file : ''),
        PR.last ? '장외 스냅샷 ' + hmsOf(PR.last.asof) + ' · 확인 ' + hmsOf(PR.last.now) : '', L ? '오늘 마지막 행 ' + L.t : '오늘 행 없음 — 오늘 두 다리 모두 값이 아직 없습니다'].filter(Boolean).join('\n');
      var dc = probs.length ? ' warn' : (on && L) ? ' ok' : '', lab = L ? (on ? '실시간 ' : '마지막 행 ') + L.t : '오늘 행 없음';
      var kin = d.keyin || {}, k3 = (d.a && d.a.spec === '3선') || (d.b && d.b.spec === '3선');
      el.innerHTML = '<span class="otc-pr-stl" title="' + esc(tip) + '"><span class="otc-dot' + dc + '" aria-hidden="true"></span>' + esc(lab) + '</span>' +
        probs.map(function (q) { return '<span class="otc-pr-prob" title="' + esc(q[1]) + '">' + esc(q[0]) + '</span>'; }).join('') +
        (kin.active && k3 ? '<span class="otc-tag otc-tag--key" title="15:45 이후 3선 키인(엔진 keyin 그대로)">3선 키인 ' + esc(fp(kin.price)) + (kin.t ? ' · ' + esc(kin.t) : '') + '</span>' : '');
    }
    function prLegQ(k, leg, L, tb, pv) {   // 다리 호가 한 줄 조각: [A] 종목명 별칭(3선 바스켓) · 출처 점 + 매수/매도 금리 — 종류·잔존·엑셀·원 계열·전일 기준은 툴팁
      var ns = (tb && tb.n_src) || {}, xs = (tb && tb.exch_src) || {}, i = tb && tb.n ? tb.n - 1 : -1, q = pv && pv[k];
      var tip = [leg.nick, leg.known !== false ? prKind(leg.kind) : '모르는 이름', isNum(leg.rem) ? '잔존 ' + leg.rem + '년' : (isNum(leg.years) ? leg.years + '년 표준물(5% 반기) 내재수익률' : ''),
        leg.in_sheet ? '엑셀 행 있음' + (leg.ex_code ? ' · ' + leg.ex_code : '') : '엑셀 행 없음',
        '출처 모드 = ' + ((PR_MODES.filter(function (m) { return m[0] === leg.mode; })[0] || [0, leg.mode])[1]),
        '오늘 원 계열 — 장외 ' + n0(ns[k + '_otc']) + '행 · 장내 ' + n0(ns[k + '_exch']) + '행' + (xs[k] ? '(' + xs[k] + ')' : ''),
        q ? prPvLeg(q, leg) : ''].filter(Boolean).join('\n');
      var code = function (key) { return (i >= 0 && tb[key]) ? tb[key][i] : -1; }, fb = i >= 0 && tb[k + '_fb'] ? !!tb[k + '_fb'][i] : false;
      var one = function (nmS, cls, lv, cv, c) {
        var col = PR_SRC_COL[String(c)] || '--wb-faint', has = isNum(c) && c >= 0;
        var t = nmS + '호가 · 출처 ' + prSrcName(c) + (fb ? ' · 대체(고른 쪽 값이 비어 다른 쪽으로 채움 · 엔진 fb)' : '') + ' · 금리 ' + fy(lv) + ' · 전일 대비 ' + prBp(cv);
        return '<span class="otc-pr-q" title="' + esc(t) + '">' + (has ? '<i class="otc-pr-sd' + (fb ? ' is-fb' : '') + '" style="--sd:var(' + col + ')"></i>' : '') + '<b class="' + cls + '">' + fy(lv) + '</b></span>';
      };
      return '<span class="otc-pr-lq"><span class="otc-pr-ab">' + k.toUpperCase() + '</span><b class="otc-pr-al" title="' + esc(tip) + '">' + esc(leg.alias || leg.spec || '') + '</b>' +
        (leg.nick ? '<span class="otc-pr-nk" title="' + esc(tip) + '">' + esc(leg.nick) + '</span>' : '') + (bk3(leg.basket) ? chip(esc(leg.basket), 'otc-chip-basket') : '') +
        one('매수', 'otc-buy', L && L[k + '_bid'], L && L[k + '_bid_chg'], code(k + '_bsrc')) + '<span class="otc-pr-sl">/</span>' +
        one('매도', 'otc-sell', L && L[k + '_ask'], L && L[k + '_ask_chg'], code(k + '_asrc')) + '</span>';
    }
    function prHead() {
      var d = PR.data, host = E('Head'), nm = prNames();
      if (!d) { host.innerHTML = ''; return; }
      if (!d.ok) { host.innerHTML = ''; E('Title').innerHTML = '종목 스프레드'; E('Legend').innerHTML = ''; E('Limits').textContent = ''; return; }
      var defs = d.defs || {}, L = d.last, tb = prTodayBlk(d);
      E('Title').innerHTML = esc(nm.a) + ' − ' + esc(nm.b) + ' 장중 스프레드' + help([defs.quote, defs.rule, defs.src].filter(Boolean).join('\n') + '\n관찰 전용(추천·주문 아님)');
      var chg = prChg(), sf = prSuf(), pvT = (L && L.prev) || (tb && tb.prev) || null, pa = (pvT && pvT.a) || null, pb = (pvT && pvT.b) || null;
      E('ValHelp').innerHTML = help(defs.chg || '변동 = 엔진 *_chg 값');
      var big = function (lab, v, col, tip) {   // 변동 모드에서만: 차트가 그리는 값(선1/선2 전일 대비) 강조
        return '<div class="otc-pr-big"><div class="otc-pr-lab"><i class="otc-pr-sw" style="background:var(' + col + ')"></i>' + esc(lab) + help(tip) + '</div>' +
          '<div class="otc-pr-val">' + (isNum(v) ? fbp(v, 2) + '<small>bp</small>' : '<span class="wb-muted">–</span>') + '</div></div>';
      };
      var bp = function (v) { return isNum(v) ? fbp(v, 2) + '<small>bp</small>' : '<span class="wb-muted">–</span>'; };
      var blk = function (lab, col, v, cv, tip, ttl) {   // 늘 레벨(엔진 값 그대로) · 옆에 작게 전일 대비
        // 변동 모드면 '큰 = 전일 대비 · 작은 = 레벨' 판(otc-pr-tv--chg)도 함께 그려 둔다 — 좌우 반쪽 폭에서만 CSS 가 이 판을 보이고 큰 선1/선2 카드를 숨김(머리 높이 = 레벨 모드와 같음 · 숫자 같음 · 배치만)
        var two = chg && cv !== undefined;
        return '<div class="otc-pr-tb"' + (ttl ? ' title="' + esc(ttl) + '"' : '') + '><div class="otc-pr-tl">' + (col ? '<i class="otc-pr-sw" style="background:var(' + col + ')"></i>' : '') + esc(lab) + help(tip) + '</div>' +
          '<div class="otc-pr-tv' + (two ? ' otc-pr-tv--lvl' : '') + '">' + bp(v) + (cv !== undefined ? '<span class="otc-pr-tc">전일 대비 <b>' + (isNum(cv) ? fbp(cv, 2) : '–') + '</b></span>' : '') + '</div>' +
          (two ? '<div class="otc-pr-tv otc-pr-tv--chg">' + bp(cv) + '<span class="otc-pr-tc">전일 대비 · 레벨 <b>' + (isNum(v) ? fbp(v, 2) : '–') + '</b></span></div>' : '') + '</div>';
      };
      var pvTip = '전일 스프레드 = A 전일 − B 전일(bp · 엔진 prev.spr)\nA ' + nm.a + ' ' + prPvLeg(pa, d.a) + '\nB ' + nm.b + ' ' + prPvLeg(pb, d.b);
      host.innerHTML = '<div class="otc-pr-top' + (chg ? ' is-chg' : '') + '">' +
        (chg ? '<div class="otc-pr-bigs"><div class="otc-pr-bigrow">' +
          big(prL1(nm.a, nm.b) + sf, L && L.l1_chg, '--wb-up', (defs.l1 || '') + '\n' + (defs.chg || '')) +
          big(prL2(nm.a, nm.b) + sf, L && L.l2_chg, '--wb-down', (defs.l2 || '') + '\n' + (defs.chg || '')) + '</div></div>' : '') +
        '<div class="otc-pr-info">' +
          '<div class="otc-pr-trio">' +
            blk('전일 스프레드', '', pvT && pvT.spr, undefined, pvTip + '\n' + (defs.chg || ''), pvTip) +
            blk(nm.a + ' 사고 ' + nm.b + ' 팔 때', '--wb-up', L && L.l1, L && L.l1_chg, (defs.l1 || '') + '\n' + (defs.chg || '') + '\n차트 선1과 같은 값') +
            blk(nm.a + ' 팔고 ' + nm.b + ' 살 때', '--wb-down', L && L.l2, L && L.l2_chg, (defs.l2 || '') + '\n' + (defs.chg || '') + '\n차트 선2와 같은 값') +
          '</div>' +
          '<div class="otc-pr-qline">' + (d.a ? prLegQ('a', d.a, L, tb, pvT) : '') + (d.b ? prLegQ('b', d.b, L, tb, pvT) : '') + '</div>' +
          '<div class="otc-pr-st" id="' + pid('St') + '"></div>' +
        '</div></div>';
      prExch();
      E('Legend').innerHTML = prLegend(defs, nm);
      E('Limits').textContent = defs.limits || '';
    }
    function prLegend(defs, nm) {   // 1개 화면 = 전과 같은 한 덩어리 · 좌우 반쪽 폭 = CSS 가 두 줄 고정(1줄 = 선 · 2줄 = 15:45 · 출처 띠 — otc-pr-lgbr) · 선 이름의 '(전일 대비)' 는 반쪽 폭에선 한 번만(0선 항목 앞)
      var lb = function (k, txt, sty, tip) { return '<button type="button" class="otc-pr-lgb" data-prline="' + k + '" aria-pressed="' + (PR.hide[k] ? 'false' : 'true') + '" title="누르면 켜고 끔">' + '<i class="ln' + sty + '"></i>' + esc(txt) + (prSuf() ? '<span class="otc-pr-sf">' + esc(prSuf()) + '</span>' : '') + '</button>' + help(tip); };
      var codes = (PR.data && PR.data.src_codes) || {}, hasCut = ((PR.data && PR.data.blocks) || []).some(function (b) { return b.n && b.cut_i != null; });
      return '<span class="otc-leg">' +
        '<span>' + lb('l1', prL1(nm.a, nm.b), '" style="border-color:var(--wb-up)', defs.l1 || '') + '</span>' +
        '<span>' + lb('l2', prL2(nm.a, nm.b), '" style="border-color:var(--wb-down)', defs.l2 || '') + '</span>' +
        '<span>' + lb('mid', '미드', ' dot" style="border-color:var(--wb-ink)', defs.mid || '') + '</span>' +
        (prChg() ? '<span><i class="ln" style="border-color:var(--wb-muted);border-top-width:3px"></i><span class="otc-pr-sf2">전일 대비 · </span>0 = 전일과 같음</span>' : '') +
        '<i class="otc-pr-lgbr" aria-hidden="true"></i>' +
        (hasCut ? '<span><i class="otc-pr-cutl"></i>' + esc(PR_CUT_LAB) + help('세로 점선 = 그 날 15:45 이후 첫 행(엔진 cut_i)\n' + (defs.rule || '')) + '</span>' : '') +
        '<span>출처 띠' + Object.keys(codes).map(function (c) { return ' <i class="otc-pr-band" style="background:var(' + (PR_SRC_COL[c] || '--wb-faint') + ')"></i>' + esc(codes[c]); }).join('') +
          ' <i class="otc-pr-band is-fb"></i>대체' + help((defs.src || '') + '\n띠 위 칸 = 매수호가 출처 · 아래 칸 = 매도호가 출처\n빗금 = 대체(고른 쪽 값이 비어 다른 쪽으로 채움 · 엔진 fb)') + '</span>' +
        '</span>';
    }
    function prSeries(d) {   // 블록(날) 이어 붙이기 — x = 시각(초 · 날마다 칸 · 장중 공백 그대로) 또는 이벤트(행 순번) · 값은 응답 그대로
      var ev = PR.axis === 'ev', off = 0;
      var R = { n: 0, x: [], t: [], day: [], l1: [], l2: [], mid: [], ab: [], aa: [], bb: [], ba: [], abs: [], aas: [], bbs: [], bas: [], afb: [], bfb: [], post: [], segs: [], cuts: [], today: d.today,
        l1c: [], l2c: [], midc: [], abc: [], aac: [], bbc: [], bac: [], pv: {} };
      var ck = function (b, k, i) { return b[k] ? b[k][i] : null; };   // 변동 배열이 없는 옛 응답 = 값 없음(지어내지 않음)
      (d.blocks || []).forEach(function (b) {
        var m = b.n || 0;
        if (!m) { R.segs.push({ d: b.d, n: 0 }); return; }
        var t0 = prSec(b.t[0]), t1 = prSec(b.t[m - 1]), base = R.n;
        for (var i = 0; i < m; i++) {
          R.x.push(ev ? off + i : off + (prSec(b.t[i]) - t0)); R.t.push(b.t[i]); R.day.push(b.d);
          R.l1.push(b.l1[i]); R.l2.push(b.l2[i]); R.mid.push(b.mid[i]);
          R.ab.push(b.a_bid[i]); R.aa.push(b.a_ask[i]); R.bb.push(b.b_bid[i]); R.ba.push(b.b_ask[i]);
          R.abs.push(b.a_bsrc[i]); R.aas.push(b.a_asrc[i]); R.bbs.push(b.b_bsrc[i]); R.bas.push(b.b_asrc[i]);
          R.afb.push(b.a_fb[i]); R.bfb.push(b.b_fb[i]); R.post.push(b.cut_i != null && i >= b.cut_i);
          R.l1c.push(ck(b, 'l1_chg', i)); R.l2c.push(ck(b, 'l2_chg', i)); R.midc.push(ck(b, 'mid_chg', i));
          R.abc.push(ck(b, 'a_bid_chg', i)); R.aac.push(ck(b, 'a_ask_chg', i)); R.bbc.push(ck(b, 'b_bid_chg', i)); R.bac.push(ck(b, 'b_ask_chg', i));
        }
        R.pv[b.d] = b.prev || null;
        R.n += m;
        var hi = ev ? off + m : off + (t1 - t0) + Math.max(60, (t1 - t0) * 0.015);   // 마지막 행 뒤 짧은 여백(표현 · 이벤트 축은 한 칸)
        if (b.cut_i != null && b.cut_i < m) R.cuts.push({ x: R.x[base + b.cut_i], d: b.d });
        R.segs.push({ d: b.d, n: m, lo: off, hi: hi, i0: base, i1: base + m - 1, t0: t0, prev: b.prev || null });
        off = hi;
      });
      R.lo = 0; R.hi = Math.max(off, 1);
      R.full = R.segs.filter(function (g) { return g.n; });
      R.multi = R.full.length > 1;
      var lg = R.full[R.full.length - 1];
      R.endOk = !!(lg && lg.d === d.today);   // 오늘 행이 없으면 오른쪽 끝 값 라벨을 달지 않는다(옛 날 값을 '지금'처럼 보이게 하지 않음)
      return R;
    }
    function prTicks(R, ax, lab) {   // 눈금: 시각 축 = 둥근 시각(5분~3시간) · 이벤트 축 = 그 행 시각 · 날 칸이 좁으면 날짜만
      Object.keys(lab).forEach(function (k) { delete lab[k]; });
      var w = ax.width || ax.maxWidth || 800, ppu = w / ((R.hi - R.lo) || 1), t = [], add = function (v, l) { t.push({ value: v }); lab[v] = l; };
      var steps = [300, 600, 900, 1800, 3600, 7200, 10800], st = 10800, per = Math.max(1, Math.ceil(70 / ppu));
      for (var s = 0; s < steps.length; s++) if (steps[s] * ppu >= 64) { st = steps[s]; break; }
      R.full.forEach(function (g) {   // 칸마다: 좁은 날(여러 날 중 150px 미만) = 날짜 눈금 하나 · 아니면 시각(이벤트 축 = 그 행 시각)
        if (R.multi && (g.hi - g.lo) * ppu < 150) { add(g.lo, mmdd(g.d)); return; }
        if (PR.axis === 'ev') { for (var i = g.i0; i <= g.i1; i += per) add(R.x[i], String(R.t[i]).slice(0, 5)); return; }
        for (var ts = Math.ceil(g.t0 / st) * st; ts <= g.t0 + (g.hi - g.lo); ts += st) add(g.lo + (ts - g.t0), prHM(ts));
      });
      var last = -1e9, seen = null;
      return t.filter(function (o) { var px = (o.value - R.lo) * ppu, l = lab[o.value]; if (px - last < 52 || l === seen) return false; last = px; seen = l; return true; });
    }
    function prYR(arrs, minPad, incl0) {   // 세로 범위(표현만 · 값 무변형): 전체 = 최소~최대 · 맞춤 = 행의 2~98% 범위(전체 폭이 그 3배를 넘을 때만) + 벗어난 행 수·극값은 가장자리 글자로
      var v = [];
      arrs.forEach(function (a) { for (var i = 0; i < a.length; i++) if (isNum(a[i])) v.push(a[i]); });
      if (!v.length) return null;
      v.sort(function (p, q) { return p - q; });
      var mn = v[0], mx = v[v.length - 1], lo = mn, hi = mx, out = null;
      if (PR.yfit === 'fit' && v.length >= 40) {
        var ql = v[Math.floor(v.length * 0.02)], qh = v[Math.ceil(v.length * 0.98) - 1];
        if (qh > ql && (mx - mn) > 3 * (qh - ql)) {
          lo = ql; hi = qh;
          var pd0 = Math.max((hi - lo) * 0.12, minPad), nHi = 0, nLo = 0;
          v.forEach(function (x) { if (x > hi + pd0) nHi++; else if (x < lo - pd0) nLo++; });
          out = { nHi: nHi, max: mx, nLo: nLo, min: mn };
        }
      }
      if (incl0) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }   // 변동 모드: 0(전일과 같음) 기준선이 늘 보이게
      var pad = Math.max((hi - lo) * 0.12, minPad);
      return { min: lo - pad, max: hi + pad, out: out };
    }
    function prKill() { if (PR.ctl) { PR.ctl.destroy(); PR.ctl = null; } }
    function prMake(host, R0) {
      regPlugins();
      var R = R0, H = prH(), lab = {}, nm = prNames();
      host.innerHTML =
        '<div class="otc-ev-box" style="height:' + H.main + 'px"><canvas></canvas><canvas class="otc-ev-ov"></canvas></div>' +
        '<div class="otc-cap" id="' + pid('CapA') + '"></div><div class="otc-ev-box" style="height:' + H.leg + 'px"><canvas></canvas><canvas class="otc-ev-ov"></canvas></div>' +
        '<div class="otc-cap" id="' + pid('CapB') + '"></div><div class="otc-ev-box" style="height:' + H.leg + 'px"><canvas></canvas><canvas class="otc-ev-ov"></canvas></div>';
      var boxes = host.querySelectorAll('.otc-ev-box'), cv = [], ov = [];
      for (var q = 0; q < 3; q++) { cv.push(boxes[q].children[0]); ov.push(boxes[q].children[1]); }
      var ctl = { axis: PR.axis, cur: null, hx: null, hy: null }, dead = false;   // dead = 차트 해제됨(늦게 도는 rAF 가 해제된 차트를 그리지 않게)
      function xScale(show) {
        return { type: 'linear', min: R.lo, max: R.hi, grid: { display: false },
          afterBuildTicks: function (ax) { ax.ticks = prTicks(R, ax, lab); },
          ticks: { display: show, autoSkip: false, maxRotation: 0, callback: function (v) { return lab[v] != null ? lab[v] : ''; } } };
      }
      function yFit(sc) { sc.width = 62; }   // 세 패널 x 픽셀 정렬(십자선 동기)
      function plate(ctx, txt, x, y, align) {   // 글자 + 바탕색 받침(선 위에서도 읽히게 · 표현만)
        var w = ctx.measureText(txt).width, x0 = align === 'right' ? x - w : x;
        ctx.save(); ctx.fillStyle = WBChart.alpha('--wb-surface', 0.92); ctx.fillRect(x0 - 2, y - 1, w + 4, 13); ctx.restore();
        ctx.textAlign = align || 'left'; ctx.fillText(txt, x, y);
      }
      var dayPlug = { id: 'prDays', beforeDatasetsDraw: function (ch) {   // 날 경계 세로선(선 아래 층)
        if (!R.multi || !ch.chartArea) return;
        var xs = ch.scales.x, ca = ch.chartArea, ctx = ch.ctx;
        ctx.save(); ctx.strokeStyle = cssv('--wb-rule-strong'); ctx.lineWidth = 1;
        R.full.forEach(function (g, j) {
          if (!j) return;
          var x = Math.round(xs.getPixelForValue(g.lo)) + 0.5;
          ctx.beginPath(); ctx.moveTo(x, ca.top); ctx.lineTo(x, ca.bottom); ctx.stroke();
        });
        ctx.restore();
      }, afterDatasetsDraw: function (ch) {   // (주 패널) 날짜 라벨 = 선 위 층 · 변동 모드 = 그날 전일 기준일도 작게
        var chg = prChg();
        if ((!R.multi && !chg) || !ch.chartArea || ch.canvas !== cv[0]) return;
        var xs = ch.scales.x, ca = ch.chartArea, ctx = ch.ctx, fn = cssv('--wb-font') || 'sans-serif', f1 = '600 10px ' + fn, f2 = '400 9px ' + fn;
        ctx.save(); ctx.textBaseline = 'top'; ctx.textAlign = 'left';
        R.full.forEach(function (g) {
          var x = Math.max(ca.left, Math.round(xs.getPixelForValue(g.lo))) + 3, d1 = R.multi ? mmdd(g.d) : '', d2 = chg ? prPvDays(g.prev) : '';
          ctx.font = f1; var w1 = d1 ? ctx.measureText(d1 + ' ').width : 0; ctx.font = f2; var w2 = d2 ? ctx.measureText(d2).width : 0;
          if (!w1 && !w2) return;
          if (x + w1 + w2 + 2 > ca.right) x = Math.max(ca.left + 3, ca.right - w1 - w2 - 4);   // 오른쪽 끝 좁은 날 = 안쪽으로 당김(잘리지 않게)
          ctx.fillStyle = WBChart.alpha('--wb-surface', 0.92); ctx.fillRect(x - 2, ca.top + 1, w1 + w2 + 4, 13);
          ctx.fillStyle = cssv('--wb-muted');
          if (d1) { ctx.font = f1; ctx.fillText(d1, x, ca.top + 2); }
          if (d2) { ctx.font = f2; ctx.fillText(d2, x + w1, ca.top + 3); }
        });
        ctx.restore();
      } };
      var cutPlug = { id: 'prCut', afterDatasetsDraw: function (ch) {   // 15:45 이후 첫 행(엔진 cut_i) = 세로 점선 · 주 패널엔 라벨
        if (!R.cuts.length || !ch.chartArea) return;
        var xs = ch.scales.x, ca = ch.chartArea, ctx = ch.ctx, isMain = ch.canvas === cv[0];
        ctx.save(); ctx.strokeStyle = WBChart.alpha('--wb-warn', 0.85); ctx.lineWidth = 1.2; ctx.setLineDash([5, 4]);
        ctx.font = '600 10px ' + (cssv('--wb-font') || 'sans-serif'); ctx.textBaseline = 'top'; ctx.fillStyle = cssv('--wb-warn');
        R.cuts.forEach(function (c) {
          var x = Math.round(xs.getPixelForValue(c.x)) + 0.5; if (x < ca.left - 1 || x > ca.right + 1) return;
          ctx.beginPath(); ctx.moveTo(x, ca.top); ctx.lineTo(x, ca.bottom); ctx.stroke();
          if (!isMain) return;
          var g = null; R.full.forEach(function (s) { if (s.d === c.d) g = s; });
          var room = (g ? xs.getPixelForValue(g.hi) : ca.right) - x - 6, full = ctx.measureText(PR_CUT_LAB).width, y = ca.top + 15;
          if (room >= full) plate(ctx, PR_CUT_LAB, x + 4, y, 'left');
          else if (x - ca.left - 6 >= full) plate(ctx, PR_CUT_LAB, x - 4, y, 'right');   // 오른쪽 칸이 좁으면 선 왼쪽에
          else plate(ctx, '15:45', x + 4, y, 'left');   // 둘 다 좁으면 시각만(뜻은 범례·툴팁)
        });
        ctx.restore();
      } };
      var zeroPlug = { id: 'prZero', beforeDatasetsDraw: function (ch) {   // 0bp 가로선(범위 안일 때만) · 변동 모드 = 굵게(0 = 전일과 같음) · 다리 패널도
        var ys = ch.scales.y, ca = ch.chartArea, chg = prChg(); if (!ca || !(ys.min < 0 && ys.max > 0) || (ch.canvas !== cv[0] && !chg)) return;
        var y = Math.round(ys.getPixelForValue(0)) + 0.5, ctx = ch.ctx;
        ctx.save(); ctx.strokeStyle = chg ? WBChart.alpha('--wb-ink', 0.5) : cssv('--wb-rule-strong'); ctx.lineWidth = chg ? 2.2 : 1; ctx.beginPath(); ctx.moveTo(ca.left, y); ctx.lineTo(ca.right, y); ctx.stroke(); ctx.restore();
      } };
      function prevPlug(which) {   // 변동 모드: 그날 전일 기준값이 없는 다리(엔진 prev.y = null) = 그 칸 변동 선이 비어 있음 → 칸 안에 엔진 why
        return { id: 'prPrev', afterDatasetsDraw: function (ch) {
          if (!prChg() || !ch.chartArea) return;
          var xs = ch.scales.x, ca = ch.chartArea, ctx = ch.ctx;
          ctx.save(); ctx.font = '600 11px ' + (cssv('--wb-font') || 'sans-serif'); ctx.fillStyle = cssv('--wb-warn'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          R.full.forEach(function (g) {
            var pv = g.prev, miss = []; if (!pv) return;
            which.forEach(function (k) { var q = pv[k]; if (q && !isNum(q.y)) miss.push(k.toUpperCase() + ' 전일 기준 없음' + (q.why ? ' — ' + q.why : '')); });
            if (!miss.length) return;
            var x0 = Math.max(ca.left, xs.getPixelForValue(g.lo)), x1 = Math.min(ca.right, xs.getPixelForValue(g.hi)); if (x1 - x0 < 8) return;
            ctx.save(); ctx.beginPath(); ctx.rect(x0, ca.top, x1 - x0, ca.bottom - ca.top); ctx.clip();
            miss.forEach(function (t, j) { ctx.fillText(t, (x0 + x1) / 2, (ca.top + ca.bottom) / 2 + (j - (miss.length - 1) / 2) * 15); });
            ctx.restore();
          });
          ctx.restore();
        } };
      }
      var nullPlug = { id: 'prNull', afterDatasetsDraw: function (ch) {   // 선1·선2 값이 하나도 없으면 그 사실을 글자로(빈 차트를 '평온'처럼 보이게 하지 않음)
        var ca = ch.chartArea, K = prK(), chg = prChg(); if (!ca || R[K.l1].some(isNum) || R[K.l2].some(isNum)) return;
        if (chg && R.full.some(function (g) { return g.prev && ((g.prev.a && !isNum(g.prev.a.y)) || (g.prev.b && !isNum(g.prev.b.y))); })) return;   // 사유는 칸 안 글자(prevPlug)가 말함
        var ctx = ch.ctx; ctx.save(); ctx.font = '12px ' + (cssv('--wb-font') || 'sans-serif'); ctx.fillStyle = cssv('--wb-muted'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText((chg ? '선1 · 선2 변동 값 없음' : '선1 · 선2 값 없음') + ' — 이 기간 두 다리 값이 같은 시각에 함께 있었던 적이 없음(아래 다리 패널 · 다리 경고 확인)', (ca.left + ca.right) / 2, (ca.top + ca.bottom) / 2); ctx.restore();
      } };
      function endPlug(keys) {   // 오른쪽 끝 = 오늘 마지막 행 값(엔진 값 그대로)
        return { id: 'prEnd', afterDatasetsDraw: function (ch) {
          if (!R.endOk || !R.n || !ch.chartArea) return;
          var ca = ch.chartArea, ys = ch.scales.y, ctx = ch.ctx, i = R.n - 1, it = [];
          keys.forEach(function (k) {
            if (k[3] && PR.hide[k[3]]) return;
            var v = R[prK()[k[0]]][i]; if (!isNum(v)) return;
            it.push({ y: ys.getPixelForValue(v), t: (k[2] === 'bp' || prChg()) ? fbp(v, 2) : fy(v), c: cssv(k[1]) });
          });
          it.sort(function (p, r) { return p.y - r.y; });
          for (var m = 1; m < it.length; m++) if (it[m].y - it[m - 1].y < 12) it[m].y = it[m - 1].y + 12;
          ctx.save(); ctx.font = '600 11px ' + (cssv('--wb-font') || 'sans-serif'); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
          it.forEach(function (o) { ctx.fillStyle = o.c; ctx.fillText(o.t, ca.right + 5, Math.max(ca.top + 6, Math.min(ca.bottom - 6, o.y))); });
          ctx.restore();
        } };
      }
      var hatch = null;
      function hatchPat(ctx) {
        if (hatch && hatch.col === cssv('--wb-ink')) return hatch.p;
        var c = doc.createElement('canvas'); c.width = 6; c.height = 6; var g = c.getContext('2d');
        g.strokeStyle = WBChart.alpha('--wb-ink', 0.75); g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, 6); g.lineTo(6, 0); g.moveTo(-3, 3); g.lineTo(3, -3); g.moveTo(3, 9); g.lineTo(9, 3); g.stroke();
        hatch = { col: cssv('--wb-ink'), p: ctx.createPattern(c, 'repeat') }; return hatch.p;
      }
      function bandPlug(bk, ak, fk) {   // 다리 패널 위 여백 = 출처 띠(위 칸 매수호가 · 아래 칸 매도호가) · 대체 = 빗금
        return { id: 'prBand', afterDatasetsDraw: function (ch) {
          var ca = ch.chartArea; if (!ca || !R.n) return;
          var xs = ch.scales.x, ctx = ch.ctx, y0 = ca.top - 11, hh = 4;
          ctx.save();
          R.full.forEach(function (g) {
            for (var i = g.i0; i <= g.i1; i++) {
              var x0 = xs.getPixelForValue(R.x[i]), x1 = xs.getPixelForValue(i === g.i1 ? g.hi : R.x[i + 1]), w = Math.max(1, x1 - x0);
              [[R[bk][i], y0], [R[ak][i], y0 + hh + 1]].forEach(function (p) {
                if (!isNum(p[0]) || p[0] < 0) return;
                ctx.fillStyle = WBChart.alpha(PR_SRC_COL[String(p[0])] || '--wb-faint', 0.9); ctx.fillRect(x0, p[1], w, hh);
              });
              if (R[fk][i]) { ctx.fillStyle = hatchPat(ctx); ctx.fillRect(x0, y0, w, hh * 2 + 1); }
            }
          });
          ctx.restore();
        } };
      }
      function edgePlug(bp) {   // 맞춤 범위 밖 행 = 가장자리 글자(개수 · 극값 · 엔진 값 그대로) — 숨기지 않고 알린다
        return { id: 'prEdge', afterDatasetsDraw: function (ch) {
          var o = ch.$prOut, ca = ch.chartArea; if (!o || !ca) return;
          var ctx = ch.ctx, f = (bp || prChg()) ? function (x) { return fbp(x, 2); } : fy;
          ctx.save(); ctx.font = '600 10px ' + (cssv('--wb-font') || 'sans-serif'); ctx.textAlign = 'right'; ctx.fillStyle = cssv('--wb-muted');
          if (o.nHi) { ctx.textBaseline = 'top'; ctx.fillText('▲ 범위 밖 ' + o.nHi + '행 · 최고 ' + f(o.max), ca.right - 4, ca.top + 2); }
          if (o.nLo) { ctx.textBaseline = 'bottom'; ctx.fillText('▼ 범위 밖 ' + o.nLo + '행 · 최저 ' + f(o.min), ca.right - 4, ca.bottom - 2); }
          ctx.restore();
        } };
      }
      function line(label, col, w, dash) {
        return { type: 'line', label: label, data: [], stepped: true, borderColor: tk(col), borderWidth: w, borderDash: dash || [], pointRadius: 0, pointHoverRadius: 0, pointHitRadius: 0, spanGaps: false, fill: false };
      }
      var common = function (padTop) { return { responsive: true, maintainAspectRatio: false, animation: false, parsing: false, normalized: true, events: [],
        plugins: { legend: { display: false }, tooltip: { enabled: false } }, layout: { padding: { right: 50, top: padTop || 4 } },
        onResize: function () { requestAnimationFrame(function () { if (!dead) drawCross(ctl.cur); }); } }; };
      var main = new Chart(cv[0], { type: 'line', plugins: [dayPlug, zeroPlug, cutPlug, nullPlug, prevPlug(['a', 'b']), edgePlug(true), endPlug([['l1', '--wb-up', 'bp', 'l1'], ['l2', '--wb-down', 'bp', 'l2'], ['mid', '--wb-ink', 'bp', 'mid']])],
        data: { datasets: [line(prL1(nm.a, nm.b), '--wb-up', 2.2), line(prL2(nm.a, nm.b), '--wb-down', 2.2), line('미드', '--wb-ink', 1.1, [2, 3])] },
        options: Object.assign(common(4), { scales: { x: xScale(true), y: { afterFit: yFit, ticks: { includeBounds: false, maxTicksLimit: 8, callback: function (v) { return fbp(v, 1); } } } } }) });
      var legY = { afterFit: yFit, ticks: { includeBounds: false, maxTicksLimit: 4, callback: function (v) { return prChg() ? fbp(v, 1) : fy(v); } } };
      var pa = new Chart(cv[1], { type: 'line', plugins: [dayPlug, zeroPlug, cutPlug, bandPlug('abs', 'aas', 'afb'), prevPlug(['a']), edgePlug(false), endPlug([['ab', '--wb-down'], ['aa', '--wb-up']])],
        data: { datasets: [line('A 매수호가', '--wb-down', 1.6), line('A 매도호가', '--wb-up', 1.6)] },
        options: Object.assign(common(14), { scales: { x: xScale(false), y: Object.assign({}, legY) } }) });
      var pb = new Chart(cv[2], { type: 'line', plugins: [dayPlug, zeroPlug, cutPlug, bandPlug('bbs', 'bas', 'bfb'), prevPlug(['b']), edgePlug(false), endPlug([['bb', '--wb-down'], ['ba', '--wb-up']])],
        data: { datasets: [line('B 매수호가', '--wb-down', 1.6), line('B 매도호가', '--wb-up', 1.6)] },
        options: Object.assign(common(14), { scales: { x: xScale(true), y: Object.assign({}, legY, { ticks: Object.assign({}, legY.ticks) }) } }) });
      var charts = [main, pa, pb];
      function caps() {
        var n2 = prNames(), chg = prChg(), D = PR.data || {}, lg = R.full[R.full.length - 1], pv = (lg && lg.prev) || {};
        var unit = chg ? ' 변동 bp' : ' 금리 %', more = R.multi ? ' · 지난 날은 그날 전일 기준' : '';
        var base = function (k, leg) { return chg ? ' <span class="wb-muted">(' + esc(prPvLeg(pv[k], leg)) + ' 대비' + more + ')</span>' : ''; };
        $(pid('CapA')).innerHTML = '<b>A ' + esc(n2.a) + '</b> 매수호가 <span class="otc-buy">━</span> · 매도호가 <span class="otc-sell">━</span>' + unit + base('a', D.a) + help('위 띠 = 출처(위 칸 매수호가 · 아래 칸 매도호가 · 빗금 = 대체) · 값은 엔진 그대로\n' + ((D.defs && D.defs.quote) || '') + (chg ? '\n' + ((D.defs && D.defs.chg) || '') : ''));
        $(pid('CapB')).innerHTML = '<b>B ' + esc(n2.b) + '</b> 매수호가 <span class="otc-buy">━</span> · 매도호가 <span class="otc-sell">━</span>' + unit + base('b', D.b) + ((D.b && D.b.kind === 'fut') ? ' <span class="wb-muted">(선물 = 표준물 내재수익률)</span>' : '');
      }
      function fill() {
        var n2 = prNames(), md = main.data.datasets, K = prK(), chg = prChg(), sf = prSuf();
        md[0].label = prL1(n2.a, n2.b) + sf; md[1].label = prL2(n2.a, n2.b) + sf; md[2].label = '미드' + sf;
        md[0].data = prPts(R, R[K.l1]); md[1].data = prPts(R, R[K.l2]); md[2].data = prPts(R, R[K.mid]);
        md[0].hidden = PR.hide.l1; md[1].hidden = PR.hide.l2; md[2].hidden = PR.hide.mid;
        pa.data.datasets[0].data = prPts(R, R[K.ab]); pa.data.datasets[1].data = prPts(R, R[K.aa]);
        pb.data.datasets[0].data = prPts(R, R[K.bb]); pb.data.datasets[1].data = prPts(R, R[K.ba]);
        charts.forEach(function (c) { c.options.scales.x.min = R.lo; c.options.scales.x.max = R.hi; });
        var yr = function (c, arrs, mp) { var r = prYR(arrs, mp, chg), y = c.options.scales.y; c.$prOut = r && r.out; if (r) { y.min = r.min; y.max = r.max; } else { delete y.min; delete y.max; } };
        var shown = []; if (!PR.hide.l1) shown.push(R[K.l1]); if (!PR.hide.l2) shown.push(R[K.l2]); if (!PR.hide.mid) shown.push(R[K.mid]);
        var lp = chg ? 0.3 : 0.003;
        yr(main, shown.length ? shown : [R[K.l1], R[K.l2]], 0.3); yr(pa, [R[K.ab], R[K.aa]], lp); yr(pb, [R[K.bb], R[K.ba]], lp);
        caps();
      }
      function sizeOv(c, o) {
        var dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
        if (o.width !== Math.round(w * dpr) || o.height !== Math.round(h * dpr)) { o.width = Math.round(w * dpr); o.height = Math.round(h * dpr); o.style.width = w + 'px'; o.style.height = h + 'px'; }
        var ctx = o.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h); return ctx;
      }
      function dot(ctx, x, y, col) { ctx.beginPath(); ctx.arc(x, y, 3.6, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = cssv('--wb-surface'); ctx.stroke(); }
      function drawCross(i) {
        if (dead) return;
        var vals = [[['l1', '--wb-up', 'l1'], ['l2', '--wb-down', 'l2'], ['mid', '--wb-ink', 'mid']], [['ab', '--wb-down'], ['aa', '--wb-up']], [['bb', '--wb-down'], ['ba', '--wb-up']]];
        charts.forEach(function (ch, k) {
          var ctx = sizeOv(ch.canvas, ov[k]);
          if (i == null || !R.n || !ch.chartArea) return;
          var ca = ch.chartArea, x = Math.round(ch.scales.x.getPixelForValue(R.x[i])) + 0.5, ys = ch.scales.y;
          ctx.strokeStyle = cssv('--wb-mark'); ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
          ctx.beginPath(); ctx.moveTo(x, ca.top); ctx.lineTo(x, ca.bottom); ctx.stroke(); ctx.setLineDash([]);
          vals[k].forEach(function (s) { if (s[2] && PR.hide[s[2]]) return; var v = R[prK()[s[0]]][i]; if (isNum(v)) dot(ctx, x, ys.getPixelForValue(v), cssv(s[1])); });
        });
      }
      function idxAt(ch, ev) {   // 가리킨 x → 그 시각 이전 마지막 행(as-of)
        if (!R.n || !ch.chartArea) return null;
        var r = ch.canvas.getBoundingClientRect(), px = ev.clientX - r.left, xs = ch.scales.x;
        if (px < xs.left - 2 || px > xs.right + 2) return null;
        var xv = xs.getValueForPixel(px), lo = 0, hi = R.n;
        while (lo < hi) { var m = (lo + hi) >> 1; if (R.x[m] <= xv) lo = m + 1; else hi = m; }
        return Math.max(0, lo - 1);
      }
      var raf = 0, hv = null;
      function onMove(ev) {
        var ch = charts[cv.indexOf(ev.currentTarget)];
        hv = { i: idxAt(ch, ev), x: ev.clientX, y: ev.clientY };
        if (raf) return;
        raf = requestAnimationFrame(function () {
          raf = 0; var h = hv; if (!h || dead) return;
          if (h.i == null) { onLeave(); return; }
          ctl.cur = h.i; ctl.hx = h.x; ctl.hy = h.y; drawCross(h.i); hov(prTip(R, h.i), h.x, h.y);
        });
      }
      function onLeave() { hv = null; ctl.cur = null; drawCross(null); unhov(); }
      cv.forEach(function (c) { c.addEventListener('mousemove', onMove); c.addEventListener('mouseleave', onLeave); });
      ctl.set = function (nr) {   // 데이터만 갈아 끼움(차트를 다시 만들지 않음) — 마우스가 올라가 있으면 십자선·툴팁도 새 값으로
        R = nr; fill(); charts.forEach(function (c) { c.update('none'); });
        if (ctl.cur != null && ctl.cur < R.n) { drawCross(ctl.cur); var hb = $('otcHov'); if (hb && !hb.hidden && S.hovBy === side && ctl.hx != null) hov(prTip(R, ctl.cur), ctl.hx, ctl.hy); }
        else { ctl.cur = null; drawCross(null); }
      };
      ctl.redraw = function () { hatch = null; drawCross(null); };
      ctl.destroy = function () { dead = true; hv = null; charts.forEach(function (c) { try { c.destroy(); } catch (e) { /* noop */ } }); };
      fill(); charts.forEach(function (c) { c.update('none'); });
      return ctl;
    }
    function prTip(R, i) {   // 십자선 툴팁 — 시각 · A 매수/매도(출처) · B 매수/매도(출처) · 선1 · 선2 · 미드(엔진 값 그대로)
      var nm = prNames(), sp = function (c) { return ' <span class="wb-muted">(' + esc(prSrcName(c)) + ')</span>'; };
      var fb = function (v) { return v ? ' ' + tag('대체', 'rst') : ''; };
      if (prChg()) {   // 변동 = bp 값 + 괄호로 레벨 값(엔진 값 그대로) · 그날 전일 기준
        var pv = R.pv[R.day[i]] || {}, D = PR.data || {}, mu = function (t) { return ' <span class="wb-muted">(' + t + ')</span>'; };
        var sd = function (cv, lv, c) { return prBp(cv) + '</span>' + mu(fy(lv) + ' · ' + esc(prSrcName(c))); };
        return '<b>' + (R.multi ? esc(mmdd(R.day[i])) + ' ' : '') + esc(R.t[i]) + '</b> <span class="wb-muted">· 전일 대비' + (R.post[i] ? ' · 15:45 이후' : '') + '</span>' +
          '<br>A ' + esc(nm.a) + ' 매수 <span class="otc-buy">' + sd(R.abc[i], R.ab[i], R.abs[i]) + ' · 매도 <span class="otc-sell">' + sd(R.aac[i], R.aa[i], R.aas[i]) + fb(R.afb[i]) +
          '<br>B ' + esc(nm.b) + ' 매수 <span class="otc-buy">' + sd(R.bbc[i], R.bb[i], R.bbs[i]) + ' · 매도 <span class="otc-sell">' + sd(R.bac[i], R.ba[i], R.bas[i]) + fb(R.bfb[i]) +
          '<br>' + esc(prL1(nm.a, nm.b)) + ' <b>' + prBp(R.l1c[i]) + '</b>' + mu('레벨 ' + prBp(R.l1[i])) +
          '<br>' + esc(prL2(nm.a, nm.b)) + ' <b>' + prBp(R.l2c[i]) + '</b>' + mu('레벨 ' + prBp(R.l2[i])) +
          '<br>미드 ' + prBp(R.midc[i]) + mu('레벨 ' + prBp(R.mid[i])) +
          '<br><span class="wb-muted">전일 기준 A ' + esc(prPvLeg(pv.a, D.a)) + ' · B ' + esc(prPvLeg(pv.b, D.b)) + ' · 전일 스프레드 ' + prBp(pv.spr) + '</span>' +
          (R.afb[i] || R.bfb[i] ? '<br><span class="wb-muted">대체 = 고른 쪽 값이 비어 다른 쪽으로 채움(엔진 fb)</span>' : '');
      }
      return '<b>' + (R.multi ? esc(mmdd(R.day[i])) + ' ' : '') + esc(R.t[i]) + '</b>' + (R.post[i] ? ' <span class="wb-muted">· 15:45 이후</span>' : '') +
        '<br>A ' + esc(nm.a) + ' 매수 <span class="otc-buy">' + fy(R.ab[i]) + '</span>' + sp(R.abs[i]) + ' · 매도 <span class="otc-sell">' + fy(R.aa[i]) + '</span>' + sp(R.aas[i]) + fb(R.afb[i]) +
        '<br>B ' + esc(nm.b) + ' 매수 <span class="otc-buy">' + fy(R.bb[i]) + '</span>' + sp(R.bbs[i]) + ' · 매도 <span class="otc-sell">' + fy(R.ba[i]) + '</span>' + sp(R.bas[i]) + fb(R.bfb[i]) +
        '<br>' + esc(prL1(nm.a, nm.b)) + ' <b>' + prBp(R.l1[i]) + '</b>' +
        '<br>' + esc(prL2(nm.a, nm.b)) + ' <b>' + prBp(R.l2[i]) + '</b>' +
        '<br>미드 ' + prBp(R.mid[i]) + (R.afb[i] || R.bfb[i] ? '<br><span class="wb-muted">대체 = 고른 쪽 값이 비어 다른 쪽으로 채움(엔진 fb)</span>' : '');
    }
    function prChart() {
      var d = PR.data, host = E('Chart');
      if (!d || !d.ok) { prKill(); PR.R = null; host.innerHTML = '<div class="otc-bo-ph" style="height:200px">' + esc((d && d.why) || 'A 다리에 종목 별칭을 넣으세요(예: 26-3) — B 기본 = 3선 · 종목−종목도 됨') + '</div>'; return; }
      var R = PR.R = prSeries(d);
      if (!R.n) {
        prKill();
        host.innerHTML = '<div class="otc-bo-ph" style="height:200px">이 기간 두 다리 모두 행이 없습니다' + (d.a && d.a.warn ? ' — A: ' + esc(d.a.warn) : '') + (d.b && d.b.warn ? ' — B: ' + esc(d.b.warn) : '') + '</div>';
        return;
      }
      if (PR.ctl && PR.ctl.axis === PR.axis && host.querySelector('.otc-ev-box')) { PR.ctl.set(R); return; }
      prKill();
      PR.ctl = prMake(host, R);
    }
    function prRender() { prHead(); prChart(); prSyncBar(); prStatus(); }
    function prApply(d, path) {
      PR.last = d;
      if (d.same) { prExch(); return; }   // 같음 = 상태(엑셀 · 확인 시각)만
      if (d.ok === false || d.full !== false || !PR.data || !PR.data.ok || PR.cpath !== path) PR.data = d;
      else { var bl = (PR.data.blocks || []).slice(); mergeBlocks(bl, d.blocks); PR.data = Object.assign({}, d, { blocks: bl }); }   // 오늘 블록만 교체
      if (Array.isArray(d.day_choices) && d.day_choices.length) PR.choices = d.day_choices;
      if (Array.isArray(d.fut_choices) && d.fut_choices.length) PRS.fut = d.fut_choices;
      PR.cursor = d.cursor; PR.cpath = path;
      prList(); prRender();
    }
    function prFetch(user) {   // user = 사람이 바꾼 것 → 바로 · 아니면 3초 주기(진행 중 · 탭 가림 · 끔 · 닫힌 패널이면 건너뜀)
      if (!S.on || S.view !== 'spread' || !PR.open) return;
      if (!PR.a) { PR.data = null; PR.cpath = ''; prRender(); return; }
      if (!user && (PR.inflight || doc.hidden || !PR.auto)) return;
      var path = prPath(), gen = PR.gen, since = (PR.data && PR.cpath === path) ? PR.cursor : '';
      var live = function () { return gen === PR.gen && PR.open && path === prPath(); };   // 이 패널 · 이 세대 · 이 경로의 응답만 반영
      PR.inflight++; prStatus();
      pget(path, since).then(function (d) {
        if (!live()) return;                                                 // 그 사이 다리·기간·모드가 바뀌었거나 패널을 닫음 → 버림
        if (!d.same && d.full === false && !(PR.data && PR.data.ok && PR.cpath === path)) { PR.cursor = ''; PR.cpath = ''; setTimeout(function () { prFetch(true); }, 0); return; }
        if (d.same && !(PR.data && PR.cpath === path)) return;              // 옛 cursor 로 온 same — 다음 주기에 전체
        PR.fails = 0; PR.err = '';
        prApply(d, path);
      }).catch(function (e) {
        if (keyErr(e) || !live()) return;
        PR.fails++; PR.err = emsg(e);
        if (!PR.data || PR.cpath !== path) E('Chart').innerHTML = '<div class="otc-bo-ph" style="height:200px"><span class="wb-error">불러오기 실패 — ' + esc(emsg(e)) + ' · 다시 시도 중</span></div>';
      }).then(function () { PR.inflight = Math.max(0, PR.inflight - 1); if (PR.open) { prStatus(); prSyncBar(); } });
    }
    function prStart() { prStop(); if (PR.auto && PR.open) PR.timer = setInterval(function () { prFetch(false); }, PR_MS); }
    function prStop() { if (PR.timer) { clearInterval(PR.timer); PR.timer = 0; } }
    function prChanged() { PR.gen++; prSave(); prStamp(); prSyncBar(); prFetch(true); }
    function prSetLeg(k, val) {
      val = String(val || '').trim();
      if (val === PR[k]) return;
      PR[k] = val; prChanged();
    }
    function enter(p) {   // 주소 해시(p · 이 패널 접두사 키) → 상태 · 없으면 저장값 그대로
      var pre = PR_HP[side], g = function (k) { return p ? p.get(pre + k) : null; };
      var qa = g('a'), qb = g('b'), qd = +g('days');
      if (qa) PR.a = String(qa).trim();
      if (qb) PR.b = String(qb).trim();
      if (qd && PR.choices.indexOf(qd) >= 0) PR.days = qd;
      if (p && (g('ma') || g('mb') || qa)) { PR.ma = prMode(g('ma')); PR.mb = prMode(g('mb')); }   // 주소에 다리가 있으면 모드도 주소 기준(없으면 자동)
      if (p && (g('v') || qa)) PR.val = g('v') === 'chg' ? 'chg' : 'lvl';                          // 레벨/변동도 같은 규칙(없으면 레벨)
      PR.open = true; root.hidden = false;
      prSave(); prSyncBar(); prStatus();
      if (PR.data && PR.cpath === prPath()) prRender();
      prFetch(true); prStart();
    }
    function close() {   // 오른쪽 닫기 = 폴링 멈춤 · 진행 중 응답 버림(gen) · 차트 해제 · 데이터 비움(다시 열면 새로 전체)
      PR.open = false; PR.gen++; prStop(); unhov(); prKill();
      PR.R = null; PR.data = null; PR.last = null; PR.cursor = ''; PR.cpath = ''; PR.fails = 0; PR.err = '';
      E('Chart').innerHTML = ''; E('Head').innerHTML = ''; root.hidden = true;
    }
    // 입력 — 전부 이 패널 요소에만 붙는다(다른 패널에 영향 0)
    ['a', 'b'].forEach(function (k) {
      var inp = E(k.toUpperCase());
      inp.addEventListener('change', function () { prSetLeg(k, inp.value); });
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); prSetLeg(k, inp.value); } });
    });
    E('Swap').addEventListener('click', function () { var t = PR.a; PR.a = PR.b; PR.b = t; var m = PR.ma; PR.ma = PR.mb; PR.mb = m; prChanged(); });   // 출처 모드도 다리와 함께
    E('Days').addEventListener('click', function (e) { var b = e.target.closest('button[data-prdays]'); if (!b) return; var n = +b.getAttribute('data-prdays'); if (n === PR.days) return; PR.days = n; prChanged(); });
    ['A', 'B'].forEach(function (K) {
      E('Mode' + K).addEventListener('click', function (e) {
        var b = e.target.closest('button[data-prmode]'); if (!b || b.disabled) return;
        var k = K === 'A' ? 'ma' : 'mb', v = prMode(b.getAttribute('data-v')); if (v === PR[k]) return; PR[k] = v; prChanged();
      });
    });
    E('Axis').addEventListener('click', function (e) { var b = e.target.closest('button[data-praxis]'); if (!b) return; var v = b.getAttribute('data-praxis') === 'ev' ? 'ev' : 'time'; if (v === PR.axis) return; PR.axis = v; prSave(); prSyncBar(); unhov(); prKill(); prChart(); });
    E('Val').addEventListener('click', function (e) {   // 레벨 / 변동 — 다시 부르지 않고 이미 받은 배열만 바꿔 그림(폴링·cursor 그대로)
      var b = e.target.closest('button[data-prval]'); if (!b) return; var v = b.getAttribute('data-prval') === 'chg' ? 'chg' : 'lvl'; if (v === PR.val) return;
      PR.val = v; prSave(); prStamp(); prSyncBar(); unhov(); prHead(); if (PR.ctl && PR.R) PR.ctl.set(PR.R);
    });
    E('Yfit').addEventListener('click', function (e) { var b = e.target.closest('button[data-pryfit]'); if (!b) return; var v = b.getAttribute('data-pryfit') === 'all' ? 'all' : 'fit'; if (v === PR.yfit) return; PR.yfit = v; prSave(); prSyncBar(); if (PR.ctl && PR.R) PR.ctl.set(PR.R); });
    E('Auto').addEventListener('click', function () { PR.auto = !PR.auto; prSave(); prSyncBar(); if (PR.auto) { prFetch(true); prStart(); } else prStop(); prStatus(); });
    E('Legend').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-prline]'); if (!b) return;
      var k = b.getAttribute('data-prline'); PR.hide[k] = !PR.hide[k]; prSave(); b.setAttribute('aria-pressed', PR.hide[k] ? 'false' : 'true');
      if (PR.ctl && PR.R) PR.ctl.set(PR.R);
    });
    if (E('Close')) E('Close').addEventListener('click', function () { prSetN(1); });
    return { side: side, st: PR, root: root, enter: enter, close: close, stop: prStop, fetch: prFetch, hash: prHash,
      isOpen: function () { return PR.open; }, redraw: function () { if (PR.ctl) PR.ctl.redraw(); } };
  }

  // ── 패널 관리(1개 | 2개) — 왼쪽은 늘 열림 · 오른쪽은 2개일 때만(닫으면 폴링 멈춤) ──
  function prStamp() {   // 주소 해시 = 왼쪽 키(기존 형식) + 2개면 n=2 · 오른쪽 r 접두사 키
    if (S.view !== 'spread' || !PRS.P.L) return;
    var o = PRS.P.L.hash(); if (PRS.n === 2) { o.n = 2; Object.assign(o, PRS.P.R.hash()); }
    stamp('spread', o);
  }
  function prLaySync() {
    var two = PRS.n === 2;
    $('prWrap').classList.toggle('is-two', two);
    Array.prototype.forEach.call($('prN').children, function (b) { var on = +b.getAttribute('data-prn') === PRS.n; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    PRS.P.R.root.hidden = !two;
  }
  function prSetN(n) {
    n = n === 2 ? 2 : 1; if (n === PRS.n) return;
    PRS.n = n; try { localStorage.setItem(PR_LS_N, String(n)); } catch (e) { /* noop */ }
    prLaySync();
    if (n === 2) PRS.P.R.enter(null); else PRS.P.R.close();
    prStamp();
  }
  function prBuild() {   // 왼쪽 = index.html 패널 그대로 · 오른쪽 = 그리기 전 왼쪽 틀 복제(id 는 prNew 가 data-k 로 접두사 붙임)
    var L = $('prPaneL'), R = L.cloneNode(true);
    Array.prototype.forEach.call(R.querySelectorAll('[data-wb-sentinel]'), function (s) { s.remove(); });   // shell 의 sticky 감시 표식은 왼쪽 것
    R.id = 'prPaneR'; R.setAttribute('data-side', 'R'); R.setAttribute('aria-label', '오른쪽 패널'); R.hidden = true;
    var x = L.querySelector('.otc-pr-x'); if (x) x.remove();   // 닫기(×) = 오른쪽에만
    L.parentNode.appendChild(R);
    PRS.P.L = prNew('L', L); PRS.P.R = prNew('R', R);
    $('prN').addEventListener('click', function (e) { var b = e.target.closest('button[data-prn]'); if (b) prSetN(+b.getAttribute('data-prn')); });
  }
  function prEach(fn) { ['L', 'R'].forEach(function (s) { if (PRS.P[s]) fn(PRS.P[s]); }); }
  function prStopAll() { prEach(function (P) { P.stop(); }); }
  function prFetchAll() { prEach(function (P) { P.fetch(false); }); }   // 닫힌 패널은 fetch 안에서 건너뜀
  function prRedrawAll() { prEach(function (P) { P.redraw(); }); }
  function prLeave() { prStopAll(); hideHov(); }
  function pairEnter(p) {
    if (p && (p.get('a') || p.get('n') || p.get('ra'))) PRS.n = (p.get('n') === '2' || (!p.get('n') && p.get('ra'))) ? 2 : 1;   // 주소에 상태가 있으면 패널 수도 주소 기준(n 없는 옛 주소 = 1개)
    try { localStorage.setItem(PR_LS_N, String(PRS.n)); } catch (e) { /* noop */ }
    prList(); prLaySync();
    PRS.P.L.enter(p);
    if (PRS.n === 2) PRS.P.R.enter(p); else PRS.P.R.close();
    prStamp();
  }

  // ══════════════════════════════════════════════════════════════════════
  // (0c) 내 포지션 — 등록한 현물(억)·선물(계약)의 장중 실시간 손익(사용자 2026-11-11)
  //   데이터 = /otc/pnl (엔진 pnl.live 그대로 · 웹 계산 0 · 표기 = 쉼표 · − 기호 · 소수 자리뿐).
  //   쓰기 = /otc/pnl/add · /otc/pnl/del — 응답의 live(= GET /otc/pnl 응답 그대로)로 바로 그림(추가 GET 없음) · 엔진 why 는 폼 옆에 그대로.
  //   탭이 보일 때 5초마다 전체 응답(cursor 없음 · 작음) · 탭 떠나면 멈춤 · busy 로 겹침 방지 · 등록/삭제 전에 떠난 옛 GET 응답은 seq 로 버림.
  //   지금 값 = 엔진 mark(mid · liq · src · t · warn) 그대로 — 폴백(전일 민평 · 전일 종가 · 오늘 마지막 틱)은 엔진 warn 을 주황 점 + 툴팁으로 그대로 보인다.
  // ══════════════════════════════════════════════════════════════════════
  //   ★두 번째 문(사용자 2026-11-11): 세 요청 모두 X-OTC-PW 헤더(서버 .env OTC_PNL_PW 와 대조 · 값은 이 파일 어디에도 없음). 비밀번호는 sessionStorage(탭 닫으면 소멸)에만 —
  //     없으면 본문 대신 비밀번호 카드 · 401 이 오면 언제든 저장을 지우고 카드로 되돌아감 · [잠그기] = 저장 지우고 카드로.
  var PN_MS = 5000, PN_PW_SS = 'otc.pnl.pw';
  var PN = S.pnl = { kind: 'bond', fut: '3선', side: 1, data: null, err: '', busy: false, timer: 0, seq: 0, minSeq: 0, wBusy: false, msg: null, helpTxt: '', pwBusy: false, locked: true };
  function pnPw() { try { return sessionStorage.getItem(PN_PW_SS) || ''; } catch (e) { return PN.memPw || ''; } }
  function pnPwSet(v) { try { if (v) sessionStorage.setItem(PN_PW_SS, v); else sessionStorage.removeItem(PN_PW_SS); } catch (e) { /* 저장 불가 — 이 화면 동안만 */ } PN.memPw = v || ''; }
  function pnHdr() { return { 'X-OTC-PW': pnPw() }; }
  function pwErr(e, msg) {   // 401 = 비밀번호 없음/불일치 → 저장 지우고 비밀번호 카드(키는 그대로)
    if (!e || !e.pw) return false;
    pnPwSet(''); pnStop(); PN.data = null; PN.err = '';
    pnGate(true, msg || ('비밀번호가 틀렸습니다 — ' + emsg(e)), true);
    return true;
  }
  function pnGate(show, msg, err) {   // show = 본문 대신 비밀번호 카드
    PN.locked = !!show;
    $('pnGate').hidden = !show; $('pnBody').hidden = !!show;
    var m = $('pnPwMsg'); m.textContent = msg || ''; m.classList.toggle('is-err', !!err);
    $('pnPwBtn').disabled = PN.pwBusy; $('pnPw').disabled = PN.pwBusy;
    if (show) { $('pnTbl').innerHTML = '<div class="otc-skel"><span class="wb-loading">불러오는 중…</span></div>'; $('pnTot').hidden = true; $('pnTot').innerHTML = ''; $('pnFoot').innerHTML = ''; $('pnMeta').innerHTML = ''; $('pnMeta').title = ''; PN.helpTxt = ''; $('pnHelp').innerHTML = ''; }
    if (show && S.view === 'pnl') { try { $('pnPw').focus(); } catch (e) { /* noop */ } }
  }
  function pnUnlock() {   // 입력한 비밀번호를 세션에 저장하고 GET /otc/pnl 로 검증 — 맞으면 본문 + 5초 갱신 · 401 이면 지우고 다시
    if (PN.pwBusy) return;
    var v = String($('pnPw').value || '');
    if (!v) { pnGate(true, '비밀번호를 넣으세요', true); return; }
    pnPwSet(v); PN.pwBusy = true; pnGate(true, '확인 중…', false);
    var my = ++PN.seq;
    xget('/otc/pnl', pnHdr()).then(function (d) {
      $('pnPw').value = '';
      PN.pwBusy = false; pnGate(false, '', false);
      if (S.view !== 'pnl') return;
      if (my >= PN.minSeq) pnApply(d);
      pnStart();
    }).catch(function (e) {
      PN.pwBusy = false;
      if (pwErr(e, '비밀번호가 틀렸습니다')) { $('pnPw').value = ''; return; }
      if (keyErr(e)) return;
      pnPwSet('');                                                        // 서버/터널 오류 — 저장은 지우고(검증 안 됨) 사유 그대로
      pnGate(true, '확인 실패 — ' + emsg(e), true);
    });
  }
  function pnLock() { pnPwSet(''); pnStop(); PN.data = null; PN.err = ''; PN.msg = null; pnMsgSync(); pnGate(true, '잠겼습니다 — 다시 보려면 비밀번호', false); }
  function pnlEnter() {
    pnFormSync(); pnMsgSync();
    if (!pnPw()) { pnGate(true, '', false); return; }                      // 세션에 비밀번호 없음 → 카드만(요청 0)
    pnGate(false, '', false); pnFetch(true); pnStart();
  }
  function pnLeave() { pnStop(); hideHov(); }
  function pnStart() { pnStop(); PN.timer = setInterval(function () { pnFetch(false); }, PN_MS); }
  function pnStop() { if (PN.timer) { clearInterval(PN.timer); PN.timer = 0; } }
  function pnFetch(user) {
    if (!S.on || S.view !== 'pnl' || PN.locked || !pnPw()) return;
    if (!user && (PN.busy || doc.hidden)) return;
    PN.busy = true;
    var my = ++PN.seq;
    xget('/otc/pnl', pnHdr()).then(function (d) {
      if (my < PN.minSeq || S.view !== 'pnl' || PN.locked) return;        // 등록/삭제 응답(live)이 먼저 그려졌거나 그 사이 잠겼으면 버림
      pnApply(d);
    }).catch(function (e) {
      if (pwErr(e) || keyErr(e) || my < PN.minSeq) return;
      PN.err = emsg(e); pnRender();                                       // 조용히 다음 주기에 재시도 · 머리에 빨간 점 + 사유
    }).then(function () { PN.busy = false; });
  }
  function pnApply(d) { PN.err = ''; PN.data = d; pnRender(); }
  function won(v) {   // 원 → 천 단위 쉼표 · + / − 기호(표기만)
    if (!isNum(v)) return '–';
    var r = Math.round(v), s = Math.abs(r).toLocaleString('ko-KR');
    return (r < 0 ? MINUS : r > 0 ? '+' : '') + s;
  }
  function fq(v) { return !isNum(v) ? '–' : Number.isInteger(v) ? v.toLocaleString('ko-KR') : v.toLocaleString('ko-KR', { maximumFractionDigits: 2 }); }
  function pnFormSync() {   // 종류(현물/선물)에 따라 종목 칸 ↔ 선물 세그 · 단위 라벨
    var fut = PN.kind === 'fut';
    Array.prototype.forEach.call($('pnKind').children, function (b) { b.classList.toggle('is-active', b.getAttribute('data-kind') === PN.kind); });
    Array.prototype.forEach.call($('pnFut').children, function (b) { b.classList.toggle('is-active', b.getAttribute('data-fut') === PN.fut); });
    Array.prototype.forEach.call($('pnSide').children, function (b) { b.classList.toggle('is-active', +b.getAttribute('data-side') === PN.side); });
    $('pnBondF').hidden = fut; $('pnFutF').hidden = !fut;
    $('pnQtyLab').textContent = fut ? '수량(계약)' : '수량(억)';
    $('pnEntryLab').textContent = fut ? '진입 가격' : '진입 금리(%)';
    $('pnQty').placeholder = fut ? '예: 10' : '예: 100';
    $('pnEntry').placeholder = fut ? '예: 106.45' : '예: 3.720';
    $('pnAdd').disabled = PN.wBusy;
    Array.prototype.forEach.call($('pnTbl').querySelectorAll('button[data-pndel]'), function (b) { b.disabled = PN.wBusy; });   // 등록/삭제 응답(live)으로 그린 표는 wBusy 중에 그려지므로 끝나면 × 를 다시 켠다
  }
  function pnMsgSync() {
    var m = $('pnMsg');
    m.textContent = PN.wBusy ? '보내는 중…' : (PN.msg ? PN.msg.text : '');
    m.classList.toggle('is-err', !PN.wBusy && !!(PN.msg && PN.msg.err));
  }
  function pnSubmit() {
    if (PN.wBusy) return;
    var fut = PN.kind === 'fut', alias = fut ? PN.fut : String($('pnAlias').value || '').trim();
    var qty = String($('pnQty').value || '').trim(), entry = String($('pnEntry').value || '').trim();
    if (!alias) { PN.msg = { err: true, text: '종목을 넣으세요' }; pnMsgSync(); $('pnAlias').focus(); return; }
    if (!qty) { PN.msg = { err: true, text: ($('pnQty').validity && $('pnQty').validity.badInput) ? '수량이 숫자가 아닙니다' : '수량을 넣으세요' }; pnMsgSync(); $('pnQty').focus(); return; }
    if (!entry) { PN.msg = { err: true, text: ($('pnEntry').validity && $('pnEntry').validity.badInput) ? '진입 값이 숫자가 아닙니다' : (fut ? '진입 가격을 넣으세요' : '진입 금리를 넣으세요') }; pnMsgSync(); $('pnEntry').focus(); return; }
    var body = { kind: PN.kind, alias: alias, side: PN.side, qty: Number(qty), entry: Number(entry) };
    var date = String($('pnDate').value || '').trim(), note = String($('pnNote').value || '').trim();
    if (date) body.date = date;
    if (note) body.note = note;
    PN.wBusy = true; PN.msg = null; pnFormSync(); pnMsgSync();
    xpost('/otc/pnl/add', body, pnHdr()).then(function (r) {
      if (r && r.ok) {   // 등록됨 — 입력 비우고(종류·방향·선물 종류는 그대로) 응답 live 로 바로 그림
        ['pnAlias', 'pnQty', 'pnEntry', 'pnNote'].forEach(function (id) { $(id).value = ''; });
        var p = r.position || {};
        PN.msg = { err: false, text: '등록 ' + (p.alias || alias) + ' ' + (p.side === -1 || PN.side === -1 ? '매도' : '매수') + ' ' + fq(isNum(p.qty) ? p.qty : Number(qty)) + (fut ? '계약' : '억') + (p.id != null ? ' (#' + p.id + ')' : '') };
        if (r.live) { PN.minSeq = PN.seq + 1; pnApply(r.live); } else pnFetch(true);
      } else PN.msg = { err: true, text: (r && r.why) || '엔진이 받지 않음(사유 없음)' };   // 거절이면 친 값은 칸에 남겨 둔다(고쳐서 다시)
    }).catch(function (e) {
      if (pwErr(e) || keyErr(e)) return;
      PN.msg = { err: true, text: '등록 전송 실패 — ' + emsg(e) };
    }).then(function () { PN.wBusy = false; pnFormSync(); pnMsgSync(); });
  }
  function pnDel(id, btn) {
    if (PN.wBusy || id == null) return;
    PN.wBusy = true; PN.msg = null; pnFormSync(); pnMsgSync();
    if (btn) btn.disabled = true;
    xpost('/otc/pnl/del', { id: id }, pnHdr()).then(function (r) {
      if (r && r.ok) {
        var dl = r.deleted || {};
        PN.msg = { err: false, text: '삭제 #' + (dl.id != null ? dl.id : id) + (dl.alias ? ' ' + dl.alias : '') };
        if (r.live) { PN.minSeq = PN.seq + 1; pnApply(r.live); } else pnFetch(true);
      } else { PN.msg = { err: true, text: '삭제 안 됨 — ' + ((r && r.why) || '사유 없음') }; if (btn) btn.disabled = false; }
    }).catch(function (e) {
      if (pwErr(e) || keyErr(e)) return;
      PN.msg = { err: true, text: '삭제 전송 실패 — ' + emsg(e) }; if (btn) btn.disabled = false;
    }).then(function () { PN.wBusy = false; pnFormSync(); pnMsgSync(); });
  }
  function pnRow(r) {   // 한 줄 = 엔진 positions[i] 그대로(표기만)
    var fut = r.kind === 'fut', mk = r.mark || {}, unit = r.unit || (fut ? '계약' : '억');
    var sideCl = r.side === 1 ? 'otc-buy' : 'otc-sell', sideTx = r.side === 1 ? '매수' : '매도';
    var sub = [r.nick, isNum(r.rem) ? '잔존 ' + r.rem + '년' : '', r.date ? '진입 ' + r.date : ''].filter(Boolean).join(' · ');
    var head = '<td class="lt otc-pn-al" title="' + esc([r.name, r.mat ? '만기 ' + r.mat : '', isNum(r.coupon) ? '표면 ' + r.coupon : '', isNum(r.mp) ? (fut ? '전일 종가 ' : '전일 민평 ') + (fut ? fp(r.mp) : fy(r.mp)) : '', r.added ? '등록 ' + r.added : ''].filter(Boolean).join(' · ')) + '"><b>' + esc(r.alias) + '</b>' + (sub ? '<span class="otc-sub">' + esc(sub) + '</span>' : '') + '</td>' +
      '<td class="' + sideCl + '">' + sideTx + '</td>' +
      '<td class="num">' + fq(r.qty) + '<small class="wb-muted"> ' + esc(unit) + '</small></td>' +
      '<td class="num" title="진입 ' + esc(r.entry_unit || (fut ? '가격' : '%')) + '">' + (fut ? fp(r.entry) : fy(r.entry)) + '</td>';
    var tail = '<td class="note lt" title="' + esc(r.note || '') + '">' + esc(r.note || '') + '</td>' +
      '<td><button type="button" class="wb-btn wb-btn--icon otc-pn-x" data-pndel="' + esc(r.id) + '" title="삭제(바로 · 확인 없음)" aria-label="삭제"' + (PN.wBusy ? ' disabled' : '') + '>×</button></td>';
    if (r.err || !r.mark) return '<tr class="is-err" data-pnid="' + esc(r.id) + '">' + head + '<td class="err lt" colspan="5">평가 실패 — ' + esc(r.err || '지금 값 없음') + '</td>' + tail + '</tr>';
    var chg = fut ? r.chg_tick : r.chg_bp, chgL = fut ? r.chg_liq_tick : r.chg_liq_bp, cu = fut ? '틱' : 'bp';
    var midTx = fut ? fp(mk.mid) : fy(mk.mid), liqTx = fut ? fp(mk.liq) : fy(mk.liq);
    var srcTip = '출처 ' + (mk.src || '–') + (mk.t ? ' · ' + mk.t : '') + ' · 미드 ' + midTx + ' · 청산 ' + liqTx +
      ((mk.bid != null || mk.ask != null) ? ' · bid ' + (fut ? fp(mk.bid) : fy(mk.bid)) + ' / ask ' + (fut ? fp(mk.ask) : fy(mk.ask)) : '') + (mk.warn ? '\n' + mk.warn : '');
    return '<tr data-pnid="' + esc(r.id) + '">' + head +
      '<td class="num src" title="' + esc(srcTip) + '"><b>' + midTx + '</b><span class="otc-sub">' + esc(mk.src || '–') + (mk.t ? ' ' + esc(mk.t) : '') + (mk.warn ? '<span class="otc-dot warn" aria-label="경고"></span>' : '') + '</span></td>' +
      '<td class="num" title="미드 − 진입 ' + esc(fbp(chg, fut ? 0 : 1)) + cu + ' · 청산 − 진입 ' + esc(fbp(chgL, fut ? 0 : 1)) + cu + '"><span class="' + sgn(chg) + '">' + fbp(chg, fut ? 0 : 1) + '</span><small class="wb-muted"> ' + cu + '</small><span class="otc-sub">청산 ' + bpSpan(chgL, fut ? 0 : 1) + '</span></td>' +
      '<td class="num pnl ' + sgn(r.pnl_liq) + '" title="청산 ' + liqTx + ' 기준">' + won(r.pnl_liq) + '</td>' +
      '<td class="num ' + sgn(r.pnl_mid) + '" title="미드 ' + midTx + ' 기준">' + won(r.pnl_mid) + '</td>' +
      '<td class="num" title="DV01(원/bp) · 부호 = 방향">' + won(r.dv01) + '</td>' + tail + '</tr>';
  }
  function pnRender() {
    var d = PN.data, x = (d && d.exch) || {}, defs = (d && d.defs) || {};
    var live = !!x.open && !PN.err;   // 머리 상태 = '연결' / '연결실패'(실시간 저평 패널과 같은 문법) · 엑셀 상태 · 평가 시각 · 불러오기 오류는 툴팁
    var meta = $('pnMeta');
    meta.title = '엑셀 ' + (x.status || '–') + (d && d.value_date ? ' · 평가일 ' + d.value_date : '') + (d && d.after_close ? ' · 15:45 이후(선물 = 키인/마지막 틱/전일 종가)' : '') + (PN.err ? ' · 불러오기 실패 — ' + PN.err : '');
    meta.innerHTML = (d && d.t ? '<span>평가 ' + esc(d.t) + '</span>' : '') + (d && d.after_close ? '<span class="otc-tag otc-tag--key">15:45 이후</span>' : '') +
      '<span class="otc-dot' + (PN.err ? ' err' : live ? ' ok' : (x.expected !== false ? ' warn' : '')) + '" aria-hidden="true"></span> ' + (PN.err ? '불러오기 실패' : live ? '연결' : '연결실패');
    var ht = ['pnl', 'mid', 'liq', 'src', 'dv01', 'obs'].map(function (k) { return defs[k]; }).filter(Boolean).join('\n');   // ? = 엔진 defs 6문장 그대로
    if (ht && ht !== PN.helpTxt) { PN.helpTxt = ht; $('pnHelp').innerHTML = help(ht); }
    if (!d) { if (PN.err) $('pnTbl').innerHTML = errBox('내 포지션', { message: PN.err }); return; }
    var rows = d.positions || [], tot = d.total || {};
    if (!rows.length) $('pnTbl').innerHTML = '<div class="otc-empty" style="padding:var(--wb-s4)">등록된 포지션 없음 — 위에서 등록</div>';
    else $('pnTbl').innerHTML = '<table class="wb-table otc-t otc-pn-t"><thead><tr>' +
      '<th class="lt">종목</th><th>방향</th><th class="num">수량</th><th class="num">진입</th><th class="num">지금 미드' + help(defs.mid ? defs.mid + (defs.src ? '\n' + defs.src : '') : '') + '</th><th class="num">변동</th>' +
      '<th class="num">손익(청산)' + help(defs.liq ? defs.liq + (defs.pnl ? '\n' + defs.pnl : '') : '') + '</th><th class="num">손익(미드)</th><th class="num">DV01' + help(defs.dv01) + '</th><th class="lt">메모</th><th></th></tr></thead><tbody>' +
      rows.map(pnRow).join('') + '</tbody></table>';
    var tt = $('pnTot');
    if (!rows.length) { tt.hidden = true; tt.innerHTML = ''; }
    else {
      var kp = [
        ['손익(청산)', '<span class="wb-kpi-val ' + sgn(tot.pnl_liq) + '">' + won(tot.pnl_liq) + '<small>원</small></span>', isNum(tot.n_ok) && isNum(tot.n) && tot.n_ok < tot.n ? '평가 ' + tot.n_ok + ' / ' + tot.n + ' (실패 제외)' : '', defs.liq],
        ['손익(미드)', '<span class="wb-kpi-val ' + sgn(tot.pnl_mid) + '">' + won(tot.pnl_mid) + '<small>원</small></span>', '', defs.mid],
        ['순 DV01', '<span class="wb-kpi-val">' + won(tot.dv01) + '<small>원/bp</small></span>', '', defs.dv01],
        ['3선 환산', '<span class="wb-kpi-val">' + (isNum(tot.eq_3y_contracts) ? fbp(tot.eq_3y_contracts, 1) : '–') + '<small>계약</small></span>', isNum(tot.dv01_3y_contract) ? '3선 1계약 DV01 ' + won(tot.dv01_3y_contract) + '원/bp' : '', '순 DV01 ÷ 3선 1계약 DV01(엔진 값 · 참고)']
      ];
      tt.hidden = false;
      tt.innerHTML = kp.map(function (k) { return '<div class="wb-kpi"><dt>' + esc(k[0]) + help(k[3]) + '</dt><dd>' + k[1] + (k[2] ? '<span class="wb-kpi-sub">' + esc(k[2]) + '</span>' : '') + '</dd></div>'; }).join('');
    }
    var errs = d.errors || [];
    $('pnFoot').innerHTML = (defs.obs ? esc(defs.obs) + ' · ' : '') + '숫자는 엔진(otcdesk/pnl.py) 값 그대로 · 저장 = 서버(이 PC) positions.json' +
      (errs.length ? '<br><span class="wb-error">평가 실패 ' + errs.length + '건: ' + esc(errs.map(function (e) { return '#' + e.id + ' ' + (e.alias || '') + ' — ' + e.err; }).join(' · ')) + '</span>' : '');
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
      killEv('bd'); $('bdEv').innerHTML = ''; $('bdLegend').innerHTML = '';
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
    if (bk3(h.basket)) chips.push(chip(esc(h.basket), 'otc-chip-basket'));
    if (h.restored) chips.push(chip('복원 ' + n0(h.restored) + '건' + help(srcNote()), 'wb-badge--warn'));
    if (h.corrected) chips.push(chip('교정 ' + n0(h.corrected) + '건' + help(srcNote()), 'otc-chip-fix'));
    if (h.n_out) chips.push(chip('이상치 ' + n0(h.n_out) + '건' + help(RU('outlier') || ''), 'otc-chip-out'));
    $('bdSum').innerHTML = '<b>' + esc(h.alias) + '</b> · ' + esc(h.date || '') + ' · 호가 <b>' + n0(h.n_quotes) + '</b>건' +
      (h.n_valid !== h.n_quotes ? '(금리 ' + n0(h.n_valid) + ')' : '') +
      ' · 전일민평(참고) <b>' + fy(h.mp) + '</b>' + help(DEF.vsmp + (h.mp_date ? '\n이 화면 전일민평 = ' + h.mp_date + ' 값' : '')) + ' ' + chips.join(' ');
    $('bdChartTitle').innerHTML = esc(h.alias) + ' 호가 타임라인 · ' + esc(h.date || '') + help('가로 = 호가 이벤트 순서(금리 있는 호가 하나 = 한 칸 · 같은 간격 · 실시각 아님 → 점심·장마감 공백 없음) · 눈금 = 그 이벤트 시각\n' + DEF.lines + '\n▲ 사자 · ▼ 팔자(진한 테두리 = 팀 멤버) · 회색 점선 = 전일민평(참고)\n이상치는 선·미드·괴리에서 빠져 있음(엔진) — 오른쪽 위 버튼으로 × 표시\n' + NOTE.obs);
    renderBondChart(d);
    renderStream(d);
    renderRank(d);
  }
  function renderBondChart(d) {
    var pts = d.points || [], st = d.steps || [], h = d.head || {}, outs = d.outliers || [];
    var host = $('bdEv');
    if (!pts.length) {
      killEv('bd'); $('bdLegend').innerHTML = '';
      host.innerHTML = '<div class="otc-empty">이 날 금리가 있는 호가가 없습니다(문의·원 단위 호가만 있거나 거래 없음).</div>';
      return;
    }
    // 이벤트 = 금리 있는 호가 하나(points[i] ↔ steps[i] 1:1 · 이상치 제외 = 엔진)
    var n = pts.length;
    var marks = [];
    pts.forEach(function (p, i) { if (p.side === 1 || p.side === -1) marks.push({ x: i, y: p.y, side: p.side, ink: !!p.team, r: p.team ? 6.5 : 5.5 }); });
    var om = outs.map(function (o) {   // 이상치 = 그 시각 위치(직전 이벤트 다음 칸 사이)
      var slot = -1; for (var i = 0; i < n; i++) { if (pts[i].t <= o.t) slot = i; else break; }
      return { x: slot + 0.5, y: o.y, side: o.side, slot: slot, o: o };
    });
    var src = {
      n: n, multiDay: false, day: null, ds: null,
      hm: pts.map(function (p) { return String(p.t).slice(0, 5); }),
      bid: st.map(function (s) { return s.bid; }), ask: st.map(function (s) { return s.ask; }),
      mid: st.map(function (s) { return s.mid; }), spr: st.map(function (s) { return s.spr; }),
      mp: isNum(h.mp) ? pts.map(function () { return h.mp; }) : null,
      marks: marks, outs: om,
      tip: function (i, ctl) {
        var p = pts[i], s = st[i] || {};
        var t = '<b>' + esc(p.t) + '</b> · <span class="' + sideCls(p.side) + '">' + sideTxt(p.side) + ' ' + fy(p.y) + '</span> · ' + esc(p.broker) +
          (p.firm ? ' <span class="wb-muted">' + esc(p.firm) + '</span>' : '') + (p.team ? ' ' + tag('팀', 'team') : '');
        t += '<br>사자선 <span class="otc-buy">' + fy(s.bid) + '</span> · 팔자선 <span class="otc-sell">' + fy(s.ask) + '</span> · 미드 ' + fy(s.mid) +
          ' · 사자−팔자 ' + (isNum(s.spr) ? fbp(s.spr, 2) + 'bp' : '–');
        if (isNum(h.mp)) t += '<br><span class="wb-muted">전일민평 ' + fy(h.mp) + ' · 이벤트 ' + (i + 1) + ' / ' + n + '</span>';
        if (ctl.showOut) om.forEach(function (m) {
          if (m.slot === i) t += '<br><span class="wb-muted">× 이상치 ' + esc(m.o.t) + ' ' + sideTxt(m.o.side) + ' ' + fy(m.o.y) + ' · ' + esc(m.o.broker) + ' · 미드 대비 ' + fbp(m.o.vm) + 'bp</span>';
        });
        return t;
      }
    };
    $('bdLegend').innerHTML = evLegend('bd', outs.length, '이상치');
    evChart('bd', host, src, { h: 400, hs: 110 });
  }
  function streamCard(rows, date, total, cls) {   // 당일 호가 스트림(최신순) — 종목 분석 · 보드 서랍 공용
    var nTeam = rows.filter(function (r) { return r.team; }).length, nDone = rows.filter(function (r) { return r.done; }).length;
    var html = cardHead('당일 호가 스트림(최신순)', DEF.vsmid + '\n' + DEF.done + '\n배지 복원/교정 = 금리 출처\n' + srcNote() + '\n이상치 배지(흐린 행) = ' + (RU('outlier') || '') + ' · 금리·vs Mid 는 원값',
      ((isNum(total) && total > rows.length) ? '최신 ' + n0(rows.length) + ' / 전체 ' + n0(total) + '건' : n0(rows.length) + '건') + (nTeam ? ' · 팀 ' + n0(nTeam) : '') + (nDone ? ' · 체결 표시 ' + n0(nDone) : ''),
      date ? esc(date) : '');
    if (!rows.length) return html + '<div class="otc-card-body"><div class="otc-empty">' + esc(date || '') + ' 호가 없음</div></div>';
    html += '<div class="wb-table-wrap otc-scroll ' + (cls || 'otc-scroll--lg') + '"><table class="wb-table otc-t"><thead><tr>' +
      '<th>시각</th><th>방향</th><th class="num">호가</th><th class="num">vs Mid' + help(DEF.vsmid) + '</th><th>브로커</th><th>소속</th><th>원문</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      html += '<tr class="' + (r.team ? 'is-team ' : '') + (r.out ? 'is-out ' : '') + 'is-click" data-broker="' + esc(r.broker) + '">' +
        '<td class="mono">' + esc(r.t) + '</td><td>' + sideSpan(r.side, r.st) + '</td>' +
        '<td class="num">' + fy(r.y) + (r.done ? tag('✓ 체결', 'done') : '') + srcTag(r) + outTag(r) +
        (isNum(r.size) ? '<span class="otc-sub">' + n0(r.size) + '억</span>' : '') + '</td>' +
        bpTd(r.vs_mid, 1) + '<td>' + esc(r.broker) + (r.team ? tag('팀', 'team') : '') + '</td><td class="wb-muted">' + esc(r.firm || '') + '</td>' +
        '<td class="raw">' + esc(r.content || '') + '</td></tr>';
    });
    return html + '</tbody></table></div>';
  }
  function rankCard(rows, wk, date, cls) {   // 서식 브로커 랭킹 — 종목 분석 · 보드 서랍 공용
    var wl = wk.length ? mmdd(wk[0]) + '~' + mmdd(wk[wk.length - 1]) + ' · ' + wk.length + '영업일' : '';
    var html = cardHead('서식 브로커 랭킹', '당일 = ' + (date || '') + ' 그 종목 호가 · 주간 = ' + wl + '\n괴리 = 호가 − 그 시각 Mid(bp) 평균\n' + DEF.vsmid + '\n행 클릭 = 그 브로커 분석',
      n0(rows.length) + '명', '당일 실시간 + 주간 행태 · 괴리 = 호가 − 그 시각 Mid(bp)');
    if (!rows.length) return html + '<div class="otc-card-body"><div class="otc-empty">주간 호가 브로커 없음</div></div>';
    html += '<div class="wb-table-wrap otc-scroll ' + (cls || 'otc-scroll--lg') + '"><table class="wb-table otc-t"><thead>' +
      '<tr><th rowspan="2">브로커</th><th rowspan="2">소속</th><th class="grp day" colspan="3">당일</th><th class="grp" colspan="4">주간(' + esc(wl) + ')</th></tr>' +
      '<tr><th class="num day">건</th><th class="num day">사/팔</th><th class="num day">괴리</th><th class="num">건</th><th class="num">사/팔</th><th class="num">일</th><th class="num">괴리</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      html += '<tr class="is-click' + (r.d_n ? '' : ' is-muted') + (r.team ? ' is-team' : '') + '" data-broker="' + esc(r.broker) + '">' +
        '<td>' + esc(r.broker) + (r.team ? tag('팀', 'team') : '') + '</td><td class="wb-muted">' + esc(r.firm || '') + '</td>' +
        '<td class="num day">' + n0(r.d_n) + '</td><td class="num day">' + bs(r.d_buy, r.d_sell) + '</td>' + bpTd(r.d_dev, 1, 'day') +
        '<td class="num">' + n0(r.w_n) + '</td><td class="num">' + bs(r.w_buy, r.w_sell) + '</td><td class="num">' + n0(r.w_days) + '</td>' + bpTd(r.w_dev, 1) + '</tr>';
    });
    return html + '</tbody></table></div>';
  }
  function renderStream(d) { $('bdStream').innerHTML = streamCard(d.stream || [], (d.head || {}).date); }
  function renderRank(d) { $('bdRank').innerHTML = rankCard(d.rank || [], d.week || [], (d.head || {}).date); }

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
      type: 'bar', data: { labels: dl.map(function (x) { return mmdd(x.d); }), datasets: [{ label: '메시지', data: dl.map(function (x) { return x.n; }), backgroundColor: tk('--wb-series-1', 0.88), borderWidth: 0 }] },
      options: baseOpts({ scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } }, y: { beginAtZero: true, ticks: { precision: 0 } } },
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: function (it) { return dl[it[0].dataIndex] ? dl[it[0].dataIndex].d : ''; } } } } })
    });
    mk('brH', $('brHourly'), {
      type: 'bar', data: { labels: hl.map(function (x) { return x.h + '시'; }), datasets: [{ label: '메시지', data: hl.map(function (x) { return x.n; }), backgroundColor: tk('--wb-series-4', 0.88), borderWidth: 0 }] },
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
        '<td><span class="mono">' + esc(r.alias) + '</span>' + (bk3(r.basket) ? tag(r.basket) : '') + (r.nick ? '<span class="otc-sub">' + esc(r.nick) + '</span>' : '') + '</td>' +
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
    var html = cardHead('최근 호가', 'vsD−1 = ' + DEF.vsmp + '\n' + DEF.done + '\n최근 ' + all.length + '건까지(엔진 상한)\n이상치 배지(흐린 행) = ' + (RU('outlier') || ''),
      (f ? n0(rows.length) + ' / ' : '') + n0(all.length) + '건') +
      '<div class="otc-toolbar"><label class="wb-field"><span class="wb-label">종목 필터</span><input class="wb-input" id="brFilter" value="' + esc(f) + '" placeholder="예: 26-3" autocomplete="off"></label></div>';
    if (!rows.length) { $('brRecent').innerHTML = html + '<div class="otc-card-body"><div class="otc-empty">' + (f ? '필터에 맞는 호가 없음' : '기간 안 호가 없음') + '</div></div>'; bindRecentFilter(); return; }
    html += '<div class="wb-table-wrap otc-scroll otc-scroll--lg"><table class="wb-table otc-t"><thead><tr><th>시각</th>' + (multi ? '<th>브로커</th>' : '') +
      '<th>종목</th><th>방향</th><th class="num">호가</th><th class="num">vsD−1' + help(DEF.vsmp) + '</th><th>원문</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      html += '<tr class="is-click' + (r.out ? ' is-out' : '') + '" data-alias="' + esc(r.alias) + '" data-date="' + esc(r.date) + '"><td class="mono">' + esc(r.t) + '</td>' + (multi ? '<td>' + esc(r.broker) + '</td>' : '') +
        '<td class="mono">' + esc(r.alias || '–') + '</td><td>' + sideSpan(r.side, r.st) + '</td>' +
        '<td class="num">' + fy(r.y) + (r.done ? tag('✓ 체결', 'done') : '') + srcTag(r) + outTag(r) + '</td>' +
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
  var SEC_EL = { sum: 'tmSecSum', map: 'tmSecMap', intra: 'tmSecIntra', bond: 'tmSecBond', daily: 'tmSecDaily', pos: 'tmSecPos' };
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
    if (sec === 'pos') return '/otc/team/position?' + qs;
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
  function secName(sec) { return { sum: '기간 요약', map: '종목×일 지도', intra: '장중 행태', bond: '종목 시계열', daily: '일봉', pos: '포지션 추정' }[sec] || sec; }
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
    else if (sec === 'pos') renderPos(d);
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
        '<td>' + esc(r.bucket || '') + (isNum(r.rem) ? '<span class="otc-sub">잔존 ' + esc(r.rem) + '</span>' : '') + '</td><td>' + (bk3(r.basket) ? tag(r.basket) : '') + '</td>' +
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
          { label: '사자', data: mix.map(function (r) { return r.buy; }), backgroundColor: tk('--wb-down', 0.88), stack: 'q', order: 2 },
          { label: '팔자', data: mix.map(function (r) { return r.sell; }), backgroundColor: tk('--wb-up', 0.88), stack: 'q', order: 2 },
          { label: '체결 표시', type: 'line', data: mix.map(function (r) { return r.done; }), borderColor: tk('--wb-ink'), backgroundColor: tk('--wb-ink'), pointRadius: 3, pointHoverRadius: 5, borderWidth: 2.2, order: 1 }] },
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
    html += '<div class="otc-map"><div class="otc-map-lab" id="tmMapLab"></div><div class="otc-map-canvas" id="tmMapScroll"><div class="otc-map-inner"><canvas id="tmMapC"></canvas><div class="otc-map-hl" id="tmMapHR" hidden></div><div class="otc-map-hl" id="tmMapHC" hidden></div></div></div></div></section>';
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
      lh += '<div class="' + (sep ? 'sep' : '') + '" data-tbond="' + esc(b.alias) + '" title="' + esc([b.alias, b.nick, b.bucket, bk3(b.basket), '호가 ' + b.n].filter(Boolean).join(' · ')) + '">' +
        esc(b.alias) + '<small>' + esc(b.bucket || '') + (bk3(b.basket) ? ' · ' + esc(b.basket) : '') + '</small></div>';
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
      if (y < g.HEAD || r < 0 || r >= g.bonds.length || ci < 0 || ci >= g.dates.length) { mapHl(null); hideHov(); return; }
      mapHl(r, ci);
      var b = g.bonds[r], dt = g.dates[ci], c = g.grid[r + ':' + ci];
      var h = '<b>' + esc(b.alias) + '</b>' + (b.nick ? ' ' + esc(b.nick) : '') + ' · ' + esc(dt) + '<br>';
      h += c ? '호가 사자 <span class="otc-buy">' + n0(c.b) + '</span> · 팔자 <span class="otc-sell">' + n0(c.s) + '</span><br>체결 표시 사 ' + n0(c.db) + ' · 팔 ' + n0(c.ds) + ' · 순체결 액면 ' + netSide(c.szn) + (c.szn ? '억' : '') : '<span class="wb-muted">팀 호가 없음</span>';
      showHov(h, ev.clientX, ev.clientY);
    };
    cv.onmouseleave = function () { mapHl(null); hideHov(); };
    cv.onclick = function (ev) {
      var g = MAP.geo; if (!g) return;
      var rc = cv.getBoundingClientRect(), x = ev.clientX - rc.left, y = ev.clientY - rc.top;
      var ci = Math.floor(x / g.CW), r = Math.floor((y - g.HEAD) / g.RH);
      if (y < g.HEAD || r < 0 || r >= g.bonds.length || ci < 0 || ci >= g.dates.length) return;
      hideHov(); go('bond', { alias: g.bonds[r].alias, date: g.dates[ci] });
    };
    scr.scrollLeft = scr.scrollWidth;   // 최근 날짜가 보이게
  }
  function mapHl(r, ci) {   // 호버 행·열 띠 + 라벨 강조(표현만)
    var g = MAP.geo, hr = $('tmMapHR'), hc = $('tmMapHC'), lab = $('tmMapLab'); if (!g || !hr || !hc) return;
    var prev = lab && lab.querySelector('.is-hl'); if (prev) prev.classList.remove('is-hl');
    if (r == null) { hr.hidden = true; hc.hidden = true; return; }
    var W = g.CW * g.dates.length, H = g.HEAD + g.RH * g.bonds.length;
    hr.style.cssText = 'left:0;top:' + (g.HEAD + r * g.RH) + 'px;width:' + W + 'px;height:' + g.RH + 'px'; hr.hidden = false;
    hc.style.cssText = 'left:' + (ci * g.CW) + 'px;top:0;width:' + g.CW + 'px;height:' + H + 'px'; hc.hidden = false;
    var li = lab && lab.children[r + 1]; if (li) li.classList.add('is-hl');
  }
  function drawPos(alias) {
    var ser = (MAP.d && MAP.d.pos && MAP.d.pos[alias]) || [];
    var last = ser[ser.length - 1];
    $('tmPosCap').innerHTML = last ? '마지막 ' + esc(last[0]) + ' · 누적 액면 ' + netSide(last[1]) + (last[1] ? '억' : '') + ' · 누적 건수 ' + fbp(last[2], 0) : '';
    mk('tmPos', $('tmPosC'), {
      type: 'line', data: { labels: ser.map(function (r) { return mmdd(r[0]); }), datasets: [
        { label: '누적 순체결 액면(억)', data: ser.map(function (r) { return r[1]; }), stepped: true, borderColor: tk('--wb-series-1'), backgroundColor: tk('--wb-series-1', 0.12), fill: 'origin', borderWidth: 2.2, pointRadius: 0, pointHoverRadius: 4, yAxisID: 'y' },
        { label: '누적 순체결 건수', data: ser.map(function (r) { return r[2]; }), stepped: true, borderColor: tk('--wb-series-3'), borderDash: [4, 3], borderWidth: 2.2, pointRadius: 0, pointHoverRadius: 4, yAxisID: 'y1' }] },
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
      html += '<tr class="is-click" data-alias="' + esc(r.alias) + '" data-date="' + esc(r.d) + '"><td class="mono">' + esc(r.d) + '</td><td><span class="mono">' + esc(r.alias) + '</span>' + (bk3(r.basket) ? tag(r.basket) : '') + '</td>' +
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
      html += '<tr class="is-click" data-alias="' + esc(r.alias) + '" data-date="' + esc(r.d) + '"><td class="mono">' + esc(r.t) + '</td><td>' + esc(r.broker) + '</td><td><span class="mono">' + esc(r.alias) + '</span>' + (bk3(r.basket) ? tag(r.basket) : '') + '</td><td>' + sideSpan(r.side) + '</td>' +
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
          { label: '사자', data: tod.map(function (r) { return r.buy; }), backgroundColor: tk('--wb-down', 0.88), stack: 'q', order: 2 },
          { label: '팔자', data: tod.map(function (r) { return r.sell; }), backgroundColor: tk('--wb-up', 0.88), stack: 'q', order: 2 },
          { label: '체결 표시', type: 'line', data: tod.map(function (r) { return r.done; }), borderColor: tk('--wb-ink'), backgroundColor: tk('--wb-ink'), pointRadius: 2, pointHoverRadius: 5, borderWidth: 2.2, order: 1 }] },
        options: baseOpts({ scales: { x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } },
          plugins: { legend: { display: true, position: 'top', align: 'end' }, tooltip: { mode: 'index', intersect: false } } })
      });
    } else kill('tmTod');
  }

  // ── ④ 종목 시계열 ──
  function renderTBond(d) {
    var el = $('tmSecBond'), h = d.head || {}, daily = d.daily || [], ev = d.events || [];
    var opts = [], seen = {};
    function addOpt(a, lab) { if (a && !seen[a]) { seen[a] = 1; opts.push('<option value="' + esc(a) + '">' + esc(lab || '') + '</option>'); } }
    var sum = S.team.d.sum && S.team.d.sum.data;
    ((sum && sum.bonds) || []).forEach(function (b) { addOpt(b.alias, '팀 ' + b.n + '건 · ' + (b.nick || b.bucket || '')); });
    (S.meta.bonds || []).forEach(function (b) { addOpt(b.alias, b.nick || ''); });
    var chips = [];
    if (h.nick) chips.push(chip(esc(h.nick)));
    if (h.bucket) chips.push(chip(esc(h.bucket)));
    if (isNum(h.rem)) chips.push(chip('잔존 ' + esc(h.rem) + '년'));
    if (bk3(h.basket)) chips.push(chip(esc(h.basket), 'otc-chip-basket'));
    var nOut = 0; ev.forEach(function (e) { if (e.qs != null && e.qo) nOut++; });
    var nDays = 0; ev.forEach(function (e, i) { if (i === 0 || e.day_start) nDays++; });
    var html = '<section class="wb-card">' + cardHead('종목 시계열',
      '가로 = 호가 이벤트 순서(같은 간격 · 실시각 아님) — 이벤트 = 시장 상태(사자선·팔자선)가 바뀐 호가 ∪ 팀 호가(엔진 events · 전 브로커 · 이상치 제외 · 날마다 새로 시작)\n' +
      DEF.lines + '\n세로 선 = 날짜 경계(선 끊김) · 회색 점선 = 그날 전일민평\n▲▼ = 팀 호가(전부 속 채움 · 굵은 테두리 + 바깥 고리 = 체결 표시 · 이상치는 오른쪽 위 버튼으로 ×)\n아래 띠 = 전체 기간 축약 — 드래그로 보여 줄 구간 선택(값은 그대로 · 범위만)\n클릭 = 그날 종목 분석\n' + NOTE.obs,
      evLegend('tb', nOut, '팀 호가 이상치')) +
      '<div class="otc-toolbar"><label class="wb-field"><span class="wb-label">종목</span><input class="wb-input" id="tmBondIn" list="otcTmBonds" value="' + esc(S.team.alias) + '" autocomplete="off"></label>' +
      '<button type="button" class="wb-btn wb-btn--sm" id="tmBondGo">보기</button><datalist id="otcTmBonds">' + opts.join('') + '</datalist>' +
      '<span class="otc-sum"><b>' + esc(h.alias || '') + '</b> · 팀 호가 ' + n0(h.n) + '건 · 체결 표시 ' + n0(h.n_done) + '건 · ' + esc((h.start || '') + ' ~ ' + (h.end || '')) + ' ' + chips.join(' ') +
      ' · <a href="' + esc(hashOf('bond', { alias: h.alias || S.team.alias, date: h.end || '' })) + '">종목 분석 ›</a></span></div>' +
      (ev.length ? '<div class="otc-toolbar"><div class="wb-field"><span class="wb-label">보여 줄 구간</span><div class="wb-seg" id="tmEvWin" role="group" aria-label="보여 줄 구간">' +
        [[1, '1일'], [5, '5일'], [20, '20일'], [0, '전체']].filter(function (o) { return o[0] === 0 || o[0] < nDays; }).map(function (o) { return '<button type="button" data-evwin="' + o[0] + '">' + o[1] + '</button>'; }).join('') +
        '</div></div><span class="otc-cap" id="tmEvStat"></span></div>' : '') +
      '<div class="otc-card-body">' + (ev.length ? '<div id="tmEv"></div>' : '<div class="otc-empty">기간 안 이 종목 시장 호가 없음</div>') + '</div>';
    if (daily.length) {
      html += '<details class="otc-details"><summary>일별 시장 요약 ' + n0(daily.length) + '일' + help('전 브로커(팀 포함) 그날 호가 기준 · 엔진 daily 그대로 — 종가 미드 = 그날 마지막 사자·팔자 평균 · 사자/팔자 범위 = 그날 호가 최저~최고') + '</summary>' +
        '<div class="wb-table-wrap otc-scroll otc-scroll--sm"><table class="wb-table otc-t"><thead><tr><th>날짜</th><th class="num">전일민평</th><th class="num">종가 미드</th><th class="num">사자 범위</th><th class="num">팔자 범위</th><th class="num">시장 호가</th><th class="num">팀 호가</th></tr></thead><tbody>' +
        daily.slice().reverse().map(function (r) {
          return '<tr class="is-click" data-alias="' + esc(h.alias || S.team.alias) + '" data-date="' + esc(r.d) + '"><td class="mono">' + esc(r.d) + '</td><td class="num">' + fy(r.mp) + '</td><td class="num">' + fy(r.close_mid) + '</td>' +
            '<td class="num otc-buy">' + fy(r.bid_lo) + '~' + fy(r.bid_hi) + '</td><td class="num otc-sell">' + fy(r.ask_lo) + '~' + fy(r.ask_hi) + '</td><td class="num">' + n0(r.n_mkt) + '</td><td class="num">' + n0(r.n_team) + '</td></tr>';
        }).join('') + '</tbody></table></div></details>';
    }
    html += '</section>';
    var eps = d.episodes || [], dn = d.done || [];
    html += '<div class="otc-grid"><section class="wb-card">' + cardHead('이 종목 에피소드', DEF.conc, n0(eps.length) + '건') + '<div id="tmBEpTbl">' + epRows('bep', eps, { noAlias: true }) + '</div></section>' +
      '<section class="wb-card">' + cardHead('이 종목 체결 표시', DEF.done, n0(dn.length) + '건') + '<div id="tmBDoneTbl">' + doneRows('bdone', dn) + '</div></section></div>';
    killEv('tb');
    el.innerHTML = html;
    var inp = $('tmBondIn');
    function goBond() { var a = inp.value.trim(); if (!a) return; S.team.alias = a; S.tbl.bep = null; S.tbl.bdone = null; teamStamp(); loadSec('bond', false); }
    $('tmBondGo').addEventListener('click', goBond);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') goBond(); });
    if (ev.length) drawTBond(d);
  }
  function drawTBond(d) {
    var ev = d.events || [], n = ev.length, alias = (d.head && d.head.alias) || S.team.alias;
    var marks = [], outs = [];
    ev.forEach(function (e, i) {
      if (e.qs !== 1 && e.qs !== -1) return;
      var m = { x: i, y: e.qy, side: e.qs, r: e.qd ? 9.5 : 8, ink: true, bw: e.qd ? 2.4 : 1.1, ring: !!e.qd && !e.qo, z: 1 };
      if (e.qo) outs.push(m); else marks.push(m);
    });
    var pick = function (k) { return ev.map(function (e) { return e[k]; }); };
    var src = {
      n: n, multiDay: true, day: pick('d'), ds: ev.map(function (e, i) { return i > 0 && !!e.day_start; }),
      hm: ev.map(function (e) { return String(e.t).slice(11, 16); }),
      bid: pick('bid'), ask: pick('ask'), mid: pick('mid'), spr: pick('spr'), mp: pick('mp'),
      marks: marks, outs: outs,
      tip: function (i, ctl) {
        var e = ev[i];
        var t = '<b>' + esc(mmdd(e.d) + ' ' + String(e.t).slice(11, 19)) + '</b>';
        if (e.qs === 1 || e.qs === -1) {
          if (e.qo && !ctl.showOut) t += ' · <span class="wb-muted">팀 호가 이상치(숨김)</span>';
          else t += ' · 팀 <span class="' + sideCls(e.qs) + '">' + sideTxt(e.qs) + ' ' + fy(e.qy) + '</span> · ' + esc(e.qb || '') + ' · ' +
            (e.qo ? tag('이상치', 'out') : e.qd ? tag('✓ 체결 표시', 'done') : '<span class="wb-muted">호가만</span>');
        } else t += ' · <span class="wb-muted">시장 상태 변경</span>';
        t += '<br>사자선 <span class="otc-buy">' + fy(e.bid) + '</span> · 팔자선 <span class="otc-sell">' + fy(e.ask) + '</span> · 미드 ' + fy(e.mid) +
          ' · 사자−팔자 ' + (isNum(e.spr) ? fbp(e.spr, 2) + 'bp' : '–');
        t += '<br><span class="wb-muted">전일민평 ' + fy(e.mp) + ' · 이벤트 ' + n0(i + 1) + ' / ' + n0(n) + ' · 클릭 = 그날 종목 분석</span>';
        return t;
      }
    };
    var nDays = 1; src.ds.forEach(function (x) { if (x) nDays++; });
    var kDef = S.team.evWin != null ? S.team.evWin : (nDays > 5 ? 5 : 0);
    function stat(ctl) {
      var a = ev[ctl.lo], b = ev[ctl.hi];
      $('tmEvStat').textContent = mmdd(a.d) + ' ' + String(a.t).slice(11, 16) + ' ~ ' + mmdd(b.d) + ' ' + String(b.t).slice(11, 16) +
        ' · 이벤트 ' + n0(ctl.hi - ctl.lo + 1) + ' / ' + n0(n) + ' · 전체 ' + n0(nDays) + '일';
      var k = S.team.evWin;
      Array.prototype.forEach.call(($('tmEvWin') || {}).children || [], function (bt) {
        var kk = +bt.getAttribute('data-evwin');
        bt.classList.toggle('is-active', k != null && kk === k && ctl.hi === n - 1 && ctl.lo === (kk ? ctl.dayLo(kk) : 0));
      });
    }
    var ctl = evChart('tb', $('tmEv'), src, { h: 400, hs: 100, nav: true, win: [0, n - 1], onWindow: stat,
      onClick: function (i) { go('bond', { alias: alias, date: ev[i].d }); } });
    if (ctl) { S.team.evWin = kDef; ctl.setWindow(kDef ? ctl.dayLo(kDef) : 0, n - 1); }
  }

  // ── ⑤ 일봉 ──
  function renderDaily(d) {
    var el = $('tmSecDaily'), rows = d.rows || [], agg = d.agg || S.team.agg || 'D';
    var asc = rows.slice().reverse();
    var mixKeys = []; rows.forEach(function (r) { Object.keys(r.mix || {}).forEach(function (b) { if (mixKeys.indexOf(b) < 0) mixKeys.push(b); }); });
    function lab(r) { return agg === 'D' ? r.k : (r.d0 === r.d1 ? r.d0 : r.d0 + '~' + mmdd(r.d1)); }
    var html = '<section class="wb-card">' + cardHead('일봉', '하루(주·월) 단위 팀 요약 · 체결 = ' + DEF.done + '\n액면 = 적힌 것만(억)\n3선 = 3선 바스켓 종목 호가 수\n3년/10년 Δ = 그 구간 지표 금리 변화 합(bp · ktb 종가 · 오늘처럼 종가 전이면 –)\n행 클릭 = 그 구간 3 장중 행태',
      n0(rows.length) + '행') +
      '<div class="otc-toolbar"><div class="wb-seg" id="tmAgg" role="group" aria-label="집계 단위">' + [['D', '일'], ['W', '주'], ['M', '월']].map(function (a) { return '<button type="button" data-agg="' + a[0] + '" class="' + (a[0] === agg ? 'is-active' : '') + '">' + a[1] + '</button>'; }).join('') + '</div></div>' +
      '<div class="otc-card-body"><div class="otc-cap">호가 사자/팔자</div><div class="otc-chart otc-chart--md" style="height:170px"><canvas id="tmDq"></canvas></div>' +
      '<div class="otc-cap">체결 표시 사자/팔자</div><div class="otc-chart otc-chart--md" style="height:130px"><canvas id="tmDd"></canvas></div></div></section>';
    html += '<section class="wb-card otc-mt">' + cardHead('일봉 표', DEF.vsmp, esc((d.start || '') + ' ~ ' + (d.end || ''))) + '<div class="otc-card-body" style="padding-bottom:0">' + mixLegend(mixKeys) + '</div>' +
      '<div class="wb-table-wrap otc-scroll otc-scroll--lg"><table class="wb-table otc-t"><thead><tr><th>' + (agg === 'D' ? '날짜' : '구간') + '</th>' + (agg === 'D' ? '' : '<th class="num">일</th>') +
      '<th class="num">호가</th><th class="num">종목</th><th class="num">사/팔</th><th class="num">체결 사/팔</th><th class="num">액면 사/팔(억)</th><th>주력 종목 top3</th><th>테너 믹스</th>' +
      '<th class="num">통안</th><th class="num">3선</th><th class="num">vs 민평 사</th><th class="num">vs 민평 팔</th>' + (agg === 'D' ? '<th>첫 / 마지막</th>' : '') +
      '<th>활동 멤버</th><th class="num">3년 Δbp</th><th class="num">10년 Δbp</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      html += '<tr class="is-click' + (r.n ? '' : ' is-muted') + '" data-d0="' + esc(r.d0) + '" data-d1="' + esc(r.d1) + '"><td class="mono">' + esc(lab(r)) + '</td>' + (agg === 'D' ? '' : '<td class="num">' + n0(r.n_days) + '</td>') +
        '<td class="num">' + n0(r.n) + '</td><td class="num">' + n0(r.n_bonds) + '</td><td class="num">' + bs(r.buy, r.sell) + '</td><td class="num">' + bs(r.done_buy, r.done_sell) + '</td><td class="num">' + bs(r.size_buy, r.size_sell) + '</td>' +
        '<td>' + topList(r.top) + '</td><td>' + mixBar(r.mix) + '</td><td class="num">' + n0(r.tong) + '</td><td class="num">' + n0(r.b3) + '</td>' +
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
          { label: '사자', data: asc.map(function (r) { return r[a]; }), backgroundColor: tk('--wb-down', 0.88), stack: 's' },
          { label: '팔자', data: asc.map(function (r) { return r[b]; }), backgroundColor: tk('--wb-up', 0.88), stack: 's' }] },
        options: baseOpts({ scales: { x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0, maxTicksLimit: 4 } } },
          plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false, callbacks: { title: function (it) { return it[0] ? lab(asc[it[0].dataIndex]) : ''; } } } } })
      });
    }
    bars('tmDq', 'tmDq', 'buy', 'sell');
    bars('tmDd', 'tmDd', 'done_buy', 'done_sell');
  }

  // ── ⑥ 포지션 추정(엔진 team_position 그대로 · 재계산 0 — 웹은 고르기·배치·표기만) ──
  // 버킷 → 표시 색(표현 전용 · 엔진 groups: 3선 바스켓 · 비바스켓 지표 · 통안 · 기타 — 모르는 버킷은 회색)
  var POS_COLOR = { B3: '--wb-series-4', IDX: '--wb-series-1', MSB: '--wb-series-5', OTH: '--wb-series-6' };
  var POS_MK = [   // 보조축(시장 · 오른쪽) — [market 키, 라벨, 색, 점선]
    ['jp3', '3선 저평', '--wb-warn', [6, 4]], ['U', '3선 U', '--wb-open', [2, 3]]
  ];
  var FUT_TAG = '추정(듀레이션 헤지 가정)';
  var POS = { d: null, mode: 'dv01', alias: '', hid: {} };
  function psg(v, dec) {   // 부호 표기(+ / −) · 자리 채우기만(값 무변형)
    if (!isNum(v)) return '–';
    dec = dec || 0;
    var a = Math.abs(v);
    if (+a.toFixed(dec) === 0) return (0).toFixed(dec);
    return (v > 0 ? '+' : MINUS) + a.toLocaleString('ko-KR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }
  function fraw(v) { return isNum(v) ? (v < 0 ? MINUS : '') + Math.abs(v) : '–'; }   // 엔진 값 그대로(자리 손대지 않음)
  function pcls(v) { return !isNum(v) || v === 0 ? '' : v > 0 ? 'otc-buy' : 'otc-sell'; }   // + = 매수(롱) 파랑 · − = 매도 빨강
  function pSpan(v, dec) { return '<span class="' + pcls(v) + '">' + psg(v, dec) + '</span>'; }
  function pTd(v, dec) { return '<td class="num ' + pcls(v) + '">' + psg(v, dec) + '</td>'; }
  function tickSg(v) { return (v > 0 ? '+' : v < 0 ? MINUS : '') + Math.abs(v).toLocaleString('ko-KR', { maximumFractionDigits: 2 }); }
  function posDef(k) { var d = POS.d; return (d && d.defs && d.defs[k]) ? String(d.defs[k]) : ''; }
  function sw(gid) { return '<i class="otc-sw" style="background:var(' + (POS_COLOR[gid] || '--wb-faint') + ')"></i>'; }
  function nz(a) { return (a || []).some(function (v) { return isNum(v) && v !== 0; }); }
  function unitTxt(v) { return isNum(v) ? (Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : String(v)) : '–'; }
  function multiYear(dates) { return !!(dates.length && String(dates[0]).slice(0, 4) !== String(dates[dates.length - 1]).slice(0, 4)); }
  function dShort(x, my) { return !x ? '' : my ? String(x).slice(2).replace(/-/g, '.') : mmdd(x); }   // 한 해 안 = MM-DD · 해 넘김 = YY.MM.DD
  function posRolls(m, dates) {   // 선물 롤(계약 코드 바뀐 날) — 3선 · 날짜 → 라벨
    var o = {};
    [['roll3', '3선']].forEach(function (r) {
      (m[r[0]] || []).forEach(function (dt) { var i = dates.indexOf(dt); if (i < 0) return; (o[i] = o[i] || []).push(r[1]); });
    });
    return o;
  }
  function rollPlug(rolls) {
    return { id: 'otcRoll', beforeDatasetsDraw: function (ch) {
      var keys = Object.keys(rolls); if (!keys.length || !ch.chartArea) return;
      var xs = ch.scales.x, ca = ch.chartArea, ctx = ch.ctx;
      ctx.save(); ctx.strokeStyle = cssv('--wb-muted'); ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
      ctx.font = '10px ' + (cssv('--wb-font') || 'sans-serif'); ctx.fillStyle = cssv('--wb-muted'); ctx.textBaseline = 'top';
      keys.forEach(function (k) {
        var x = Math.round(xs.getPixelForValue(+k)) + 0.5;
        ctx.beginPath(); ctx.moveTo(x, ca.top); ctx.lineTo(x, ca.bottom); ctx.stroke();
        ctx.fillText('롤 ' + rolls[k].join('·'), x + 3, ca.top + 2);
      });
      ctx.restore();
    } };
  }
  function renderPos(d) {
    var el = $('tmSecPos'), h = d.head || {}, t = d.total || {}, groups = d.groups || [];
    POS.d = d;
    var G = {}; groups.forEach(function (g) { G[g.id] = g; });
    var dates = d.dates || [], my = multiYear(dates);
    var hasFill = isNum(h.n_done) && h.n_done > 0 && !!(t.dv01 && t.dv01.length);
    var lim = d.limits || [];
    // 0) 한계 — 엔진 문장 그대로 · 접지 않음
    var html = '<section class="wb-card">' + cardHead('한계', '엔진 limits 문장 그대로', n0(lim.length) + '개') +
      (lim.length ? '<ol class="otc-lim">' + lim.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>'
        : '<div class="otc-card-body"><div class="otc-empty">엔진이 한계 문장을 보내지 않음</div></div>') + '</section>';
    // 1) KPI
    var netFace = (t.face && t.face.length) ? t.face[t.face.length - 1] : null;
    var fe = t.fut_ct_end || {}, futs = groups.filter(function (g) { return g.fut; });
    var futTxt = futs.map(function (g) { return esc(g.fut) + ' ' + pSpan(fe[g.id], 0); }).join(' <span class="wb-muted">·</span> ');
    var kp = [
      ['기간', esc((h.start || '–') + ' ~ ' + (h.end || '–')), n0(h.n_days) + '영업일' + ((h.members || []).length ? ' · ' + esc(h.members.join('·')) : ''), '', 1],
      ['체결 표시', n0(h.n_done), '액면 기재 ' + n0(h.n_size_known) + ' · ' + unitTxt(h.unit_eok) + '억 가정 ' + n0(h.n_size_assumed), posDef('net')],
      ['누적 액면 매수/매도(억)', bs(h.face_buy, h.face_sell), isNum(netFace) ? '순 ' + pSpan(netFace, 0) + '억(끝)' : '순 –', posDef('net')],
      ['DV01 합(백만원/bp)', pSpan(t.dv01_end, 2), '끝값 · + = 롱 듀레이션', posDef('dv01')],
      ['선물 계약(끝)', futTxt || '–', FUT_TAG, posDef('fut_ct'), 1]
    ];
    var be = t.dv01_by_group_end || {};
    html += '<section class="wb-card otc-mt">' + cardHead('포지션 추정 — 체결 표시 누적', posDef('net') + '\n' + NOTE.obs + '\n색: + = 매수(롱) 파랑 · − = 매도 빨강', esc((h.start || '') + ' ~ ' + (h.end || ''))) +
      '<dl class="wb-kpis otc-kpis">' + kp.map(function (x) {
        return '<div class="wb-kpi"><dt>' + esc(x[0]) + help(x[3]) + '</dt><dd><span class="wb-kpi-val"' + (x[4] ? ' style="font-size:16px"' : '') + '>' + x[1] + '</span>' + (x[2] ? '<span class="wb-kpi-sub">' + x[2] + '</span>' : '') + '</dd></div>';
      }).join('') + '</dl>' +
      '<div class="otc-cap" style="padding:6px 16px 0">버킷별 DV01 끝값(백만원/bp)' + help(posDef('group')) + '</div>' +
      '<dl class="wb-kpis otc-kpis otc-kpis--sm">' + groups.map(function (g) {
        return '<div class="wb-kpi"><dt>' + sw(g.id) + esc(g.label) + '</dt><dd><span class="wb-kpi-val">' + pSpan(be[g.id], 2) + '</span></dd></div>';
      }).join('') + '</dl></section>';
    // 2) 메인 차트 — 버킷별 누적 DV01 / 추정 선물 계약 + 보조축 저평·U
    html += '<section class="wb-card otc-mt"><div class="wb-card-head"><span class="wb-card-title" id="tmPosTitle"></span>' +
      '<span class="wb-card-meta">' + n0(dates.length) + '일' + (dates.length ? ' · ' + esc(dates[0]) + ' ~ ' + esc(dates[dates.length - 1]) : '') + '</span></div>' +
      '<div class="otc-toolbar"><div class="wb-seg" id="tmPosMode" role="group" aria-label="보기"><button type="button" data-posmode="dv01">DV01</button><button type="button" data-posmode="fut">추정 선물 계약</button></div>' +
      '<span class="otc-cap" id="tmPosNote"></span></div>' +
      '<div class="otc-card-body">' + (hasFill ? '<div class="otc-chart otc-chart--lg"><canvas id="tmPosMain"></canvas></div>'
        : '<div class="otc-empty">기간 안 팀 체결 표시 없음 — 누적 시계열 없음(엔진 series 비어 있음)</div>') + '</div></section>';
    // 3) 종목별 누적 표 + 행 클릭 미니 차트
    var bonds = d.bonds || [], nSer = Object.keys(d.bond_series || {}).length;
    if (!bonds.some(function (b) { return b.alias === POS.alias; })) POS.alias = bonds.length ? bonds[0].alias : '';
    html += '<section class="wb-card otc-mt">' + cardHead('종목별 누적', posDef('net') + '\n' + posDef('dv01') + '\n' + posDef('group') +
        '\n정렬 = |DV01| 큰 순(엔진) · 기재/가정 = 액면 적힌 체결 / ' + unitTxt(h.unit_eok) + '억 가정 체결\nu = 3선 바스켓 종목별 u(BQH 차익 모니터 · 마지막 값과 그 날짜)\n행 클릭 = 위 미니 차트 종목 바꾸기 · 시계열은 |DV01| 상위 ' + nSer + '종목만(엔진 상한)',
        n0(bonds.length) + '종목') +
      '<div class="otc-toolbar"><span class="otc-cap" id="tmPosBCap"></span></div>' +
      '<div class="otc-card-body"><div class="otc-chart otc-chart--md" id="tmPosBBox"><canvas id="tmPosB"></canvas></div><div class="otc-empty" id="tmPosBNone" hidden></div></div>' +
      '<div class="wb-table-wrap otc-scroll"><table class="wb-table otc-t" id="tmPosTbl"><thead><tr><th>종목</th><th>버킷</th><th>바스켓</th><th class="num">건</th><th class="num">사/팔</th><th class="num">순건</th>' +
      '<th class="num">액면 사/팔(억)</th><th class="num">순액면(억)</th><th class="num">기재/가정</th><th class="num">DV01' + help(posDef('dv01')) + '</th><th class="num">1억당 DV01</th>' +
      '<th class="num">잔존(년)</th><th class="num">u</th><th>최초 ~ 최근</th><th>멤버</th></tr></thead><tbody>';
    bonds.forEach(function (b) {
      var g = G[b.grp];
      html += '<tr class="is-click' + (b.alias === POS.alias ? ' is-sel' : '') + '" data-posb="' + esc(b.alias) + '"><td><span class="mono">' + esc(b.alias) + '</span>' + (b.nick ? '<span class="otc-sub">' + esc(b.nick) + '</span>' : '') + '</td>' +
        '<td>' + (g ? sw(g.id) + esc(g.label) : esc(b.grp || '–')) + (b.btype && b.btype !== '국고채' ? '<span class="otc-sub">' + esc(b.btype) + '</span>' : '') + '</td>' +
        '<td>' + (bk3(b.basket) ? tag(b.basket) : '') + '</td><td class="num">' + n0(b.n) + '</td><td class="num">' + bs(b.buy, b.sell) + '</td>' + pTd(b.net_cnt, 0) +
        '<td class="num">' + bs(b.face_buy, b.face_sell) + '</td>' + pTd(b.net_face, 0) + '<td class="num">' + n0(b.known) + '<span class="wb-muted">/</span>' + n0(b.assumed) + '</td>' +
        pTd(b.dv01, 2) + '<td class="num">' + fnum(b.dv01_eok, 4) + '</td><td class="num">' + fnum(b.rem, 2) + '</td>' +
        '<td class="num">' + (isNum(b.u) ? fraw(b.u) + '<span class="otc-sub">' + esc(dShort(b.u_date, my)) + '</span>' : '–') + '</td>' +
        '<td class="mono">' + esc(dShort(b.first, my)) + ' ~ ' + esc(dShort(b.last, my)) + '</td><td class="wb-muted">' + esc(b.members || '') + '</td></tr>';
    });
    if (!bonds.length) html += '<tr><td colspan="15" class="wb-muted">기간 안 팀 체결 표시 없음</td></tr>';
    html += '</tbody></table></div></section>';
    // 4) 교체 스프레드 — 작은 배수
    var sp = d.spreads || [];
    html += '<section class="wb-card otc-mt">' + cardHead('교체 스프레드', posDef('spread') + '\n선 = 스프레드(bp · 왼쪽 축) · 막대 = 그날 팀 순액면(억 · 오른쪽 축 · + 매수 / − 매도) — a(바스켓 종목) · b(지표) 다른 색\n변화 = 기간 안 마지막 − 처음 스프레드(값 있는 날 · 엔진 chg)\n체결 = 기간 안 팀 체결 표시 건수(a · b)\n최대 8쌍 · 체결 많은 순(엔진)', n0(sp.length) + '쌍') +
      '<div class="otc-card-body" style="padding-bottom:0"><span class="otc-leg"><span><i class="ln" style="border-color:var(--wb-ink)"></i>스프레드 a−b(bp)</span>' +
      '<span><i style="display:inline-block;width:10px;height:8px;border-radius:2px;background:var(--wb-series-1)"></i>a 순액면</span>' +
      '<span><i style="display:inline-block;width:10px;height:8px;border-radius:2px;background:var(--wb-series-3)"></i>b 순액면</span></span></div>' +
      (sp.length ? '<div class="otc-sm-grid">' + sp.map(function (s, i) {
        return '<div class="otc-sm-cell"><div class="otc-sm-title"><span class="mono">' + esc(s.pair) + '</span><span class="otc-sub">' + esc([bk3(s.basket), s.b_nick].filter(Boolean).join(' · ')) + '</span>' +
          '<span class="otc-sub">변화 ' + bpSpan(s.chg, 1) + 'bp · 체결 ' + n0(s.n_a) + ' · ' + n0(s.n_b) + '</span></div>' +
          '<div class="otc-chart otc-chart--xs"><canvas id="tmPosSp' + i + '"></canvas></div></div>';
      }).join('') + '</div>' : '<div class="otc-card-body"><div class="otc-empty">교체 스프레드 없음(엔진 spreads 비어 있음)</div></div>') + '</section>';
    // 5) 장중 짝 검사
    var it = d.intraday || {};
    html += '<section class="wb-card otc-mt">' + posIntraCard('3선', it['3선']) + '</section>';
    html += '<section class="wb-card otc-mt"><div class="otc-read">' +
      (it.rule ? '<p><b>규칙</b>' + esc(it.rule) + '</p>' : '') + (it.read ? '<p><b>읽는 법</b>' + esc(it.read) + '</p>' : '') +
      (!it.rule && !it.read ? '<p class="wb-muted">엔진이 규칙·읽는 법 문장을 보내지 않음</p>' : '') + '</div></section>';
    Object.keys(S.charts).forEach(function (k) { if (k.indexOf('tmPos') === 0) kill(k); });
    el.innerHTML = html;
    posModeSync();
    if (hasFill) posMain();
    posBond();
    var lab = function (i) { return dShort(dates[i], my); };
    sp.forEach(function (s, i) { posSpread(i, s, dates, lab); });
  }
  function posIntraCard(k, x) {
    var meta = x ? n0(x.n_days) + '일 · 분봉 ' + n0(x.n_minutes) + ' · sdev 표준편차 ' + fraw(x.sdev_sd) + 'bp' : '';
    var head = cardHead(k + ' 장중 짝 검사' + (x && x.idx ? ' · ' + x.idx : ''), 'sdev(bp) 매수/매도 평균 · t · 매수−매도 차 · 무작위 대조 p · z — 엔진 값 그대로\n규칙 · 읽는 법 = 아래 문장(엔진 그대로)\n방향 배지 = 매수−매도 차가 짝 방향(음수)과 같은지 — 같은 방향 쏠림 관찰이지 짝 확인이 아님', meta);
    if (!x || (!x.done && !x.quote)) return head + '<div class="otc-card-body"><div class="otc-empty">엔진 결과 없음</div></div>';
    var tb = '<div class="wb-table-wrap"><table class="wb-table otc-t"><thead><tr><th rowspan="2">기준</th><th class="num" rowspan="2">n</th><th class="grp otc-buy" colspan="3">매수</th><th class="grp otc-sell" colspan="3">매도</th>' +
      '<th class="num" rowspan="2">매수−매도(bp)</th><th class="num" rowspan="2">p</th><th class="num" rowspan="2">z</th><th rowspan="2">방향</th></tr>' +
      '<tr><th class="num">n</th><th class="num">평균 sdev</th><th class="num">t</th><th class="num">n</th><th class="num">평균 sdev</th><th class="num">t</th></tr></thead><tbody>';
    [['체결', x.done], ['호가', x.quote]].forEach(function (r) {
      var v = r[1] || {}, b = v.buy || {}, s = v.sell || {};
      tb += '<tr><td>' + r[0] + '</td><td class="num">' + n0(v.n) + '</td><td class="num">' + n0(b.n) + '</td>' + bpTd(b.mean, 3) + '<td class="num">' + fnum(b.t, 2) + '</td>' +
        '<td class="num">' + n0(s.n) + '</td>' + bpTd(s.mean, 3) + '<td class="num">' + fnum(s.t, 2) + '</td>';
      if (isNum(v.diff) && isNum(v.p)) {
        tb += bpTd(v.diff, 3) + '<td class="num" title="' + esc('무작위 대조 ' + n0(v.sims) + '회 · 대조 차 표준편차 ' + fraw(v.null_sd) + 'bp') + '">' + fraw(v.p) + '</td><td class="num">' + fnum(v.z, 2) + '</td>' +
          '<td>' + (v.pair_dir === true ? '<span class="otc-pair">짝 방향과 같음</span>' : v.pair_dir === false ? '<span class="otc-pair">짝 방향과 다름</span>' : '–') + '</td>';
      } else tb += '<td class="na" colspan="4">' + (isNum(v.n) && v.n > 0 ? '매수·매도 한쪽만 — 검사 불가' : '이벤트 없음 — 검사 불가') + '</td>';
      tb += '</tr>';
    });
    tb += '</tbody></table></div>';
    var ex = x.excluded_days || [];
    return head + tb + '<div class="otc-foot" style="padding:6px 16px 10px">제외일 ' + (ex.length ? esc(ex.join(', ')) : '없음') + ' · 기간 ' + n0(x.n_days) + '일</div>';
  }
  function posModeSync() {
    var fut = POS.mode === 'fut';
    Array.prototype.forEach.call(($('tmPosMode') || {}).children || [], function (b) { b.classList.toggle('is-active', b.getAttribute('data-posmode') === POS.mode); });
    var ti = $('tmPosTitle'); if (!ti) return;
    var tip = (fut ? posDef('fut_ct') : posDef('dv01') + '\n' + posDef('group') + '\n굵은 선 = 합계') +
      '\n보조축(오른쪽) = 3선 저평 · 3선 U — 범례 클릭으로 켜고 끄기(U 는 값 없는 구간 끊김)\n' + posDef('jp') +
      '\n세로 점선 = 선물 롤(계약 코드 바뀐 날 · 3선)\n전 기간 0 인 선은 생략(위 표기) · 십자선 툴팁 = 그날 버킷별 DV01 · 계약 · 저평 · U · Ub';
    ti.innerHTML = esc(fut ? '추정 선물 계약 · ' + FUT_TAG : '버킷별 누적 DV01(백만원/bp)') + help(tip);
  }
  function posTipHtml(i) {
    var d = POS.d, dates = d.dates || [], ser = d.series || {}, tot = d.total || {}, m = d.market || {}, groups = d.groups || [];
    var h = '<b>' + esc(dates[i] || '') + '</b><br><span class="wb-muted">DV01(백만원/bp)</span>';
    groups.forEach(function (g) {
      var s = ser[g.id]; if (!s || !s.dv01) return;
      h += '<br>' + sw(g.id) + esc(g.label) + ' ' + pSpan(s.dv01[i], 2) + (s.no_dv01 && s.no_dv01[i] ? ' <span class="wb-muted">(DV01 못 낸 종목 ' + n0(s.no_dv01[i]) + ')</span>' : '');
    });
    if (tot.dv01) h += '<br><b>합계 ' + pSpan(tot.dv01[i], 2) + '</b>' + (tot.day_face ? ' <span class="wb-muted">· 그날 순액면</span> ' + pSpan(tot.day_face[i], 0) + '억' : '');
    var fx = groups.filter(function (g) { return g.fut && ser[g.id] && ser[g.id].fut_ct; });
    if (fx.length) h += '<br><span class="wb-muted">선물 계약 · ' + FUT_TAG + '</span><br>' + fx.map(function (g) { return esc(g.fut) + ' ' + pSpan(ser[g.id].fut_ct[i], 0); }).join(' · ');
    var at = function (k) { return m[k] ? m[k][i] : null; };
    h += '<br><span class="wb-muted">시장</span><br>3선 저평 ' + fraw(at('jp3')) + ' · U ' + fraw(at('U')) + ' · Ub ' + fraw(at('Ub'));
    var rl = posRolls(m, dates)[i]; if (rl) h += '<br><span class="wb-muted">선물 롤 ' + esc(rl.join('·')) + '</span>';
    return h;
  }
  function posMain() {
    var d = POS.d, cv = $('tmPosMain'); if (!d || !cv) return;
    var dates = d.dates || [], groups = d.groups || [], ser = d.series || {}, tot = d.total || {}, m = d.market || {};
    var my = multiYear(dates), fut = POS.mode === 'fut', ds = [], zero = [], noDv = false;
    groups.forEach(function (g) {
      var s = ser[g.id]; if (!s) return;
      if (s.no_dv01 && s.no_dv01.some(function (v) { return v > 0; })) noDv = true;
      var arr = fut ? s.fut_ct : s.dv01; if (!arr) return;   // 선물 없는 버킷 = fut_ct 없음
      var nm = fut ? g.fut + ' 계약' : g.label;
      if (!nz(arr)) { zero.push(nm); return; }
      var c = POS_COLOR[g.id] || '--wb-faint';
      ds.push({ type: 'line', label: nm, data: arr, borderColor: tk(c), backgroundColor: tk(c), borderWidth: 2, pointRadius: 0, pointHoverRadius: 3, spanGaps: false, yAxisID: 'y', order: 1 });
    });
    if (!fut && tot.dv01) ds.push({ type: 'line', label: '합계', data: tot.dv01, borderColor: tk('--wb-ink'), backgroundColor: tk('--wb-ink'), borderWidth: 3.4, pointRadius: 0, pointHoverRadius: 4, yAxisID: 'y', order: 0 });
    POS_MK.forEach(function (k) {
      var a = m[k[0]]; if (!a) return;
      ds.push({ type: 'line', label: k[1], data: a, _mk: k[0], hidden: !!POS.hid[k[0]], borderColor: tk(k[2], 0.95), backgroundColor: tk(k[2]), borderWidth: 1.4, borderDash: k[3],
        pointRadius: 0, pointHoverRadius: 2, spanGaps: false, yAxisID: 'y1', order: 2 });
    });
    var note = [];
    if (zero.length) note.push('전 기간 0(선 생략): ' + zero.join(' · '));
    if (noDv) note.push('DV01 못 낸 종목 있는 날 = 툴팁에 표시');
    $('tmPosNote').textContent = note.join(' · ');
    var o = baseOpts({
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12, callback: function (v) { return dShort(dates[v], my); } } },
        y: { position: 'left', title: { display: true, text: fut ? '계약 · ' + FUT_TAG : 'DV01(백만원/bp)' }, ticks: { callback: tickSg } },
        y1: { position: 'right', grid: { display: false }, title: { display: true, text: '저평 · U' }, ticks: { maxTicksLimit: 6, callback: tickSg } }
      },
      plugins: { legend: { display: true }, tooltip: { enabled: false, external: function (c) {
        var tt = c.tooltip;
        if (!tt || tt.opacity === 0 || !tt.dataPoints || !tt.dataPoints.length) { hideHov(); return; }
        var r = c.chart.canvas.getBoundingClientRect();
        showHov(posTipHtml(tt.dataPoints[0].dataIndex), r.left + tt.caretX, r.top + tt.caretY);
      } } }
    });
    o.plugins.legend = Object.assign({}, LEG, { onClick: function (e, item, legend) {
      Chart.defaults.plugins.legend.onClick.call(this, e, item, legend);
      var x = legend.chart.data.datasets[item.datasetIndex];
      if (x && x._mk) POS.hid[x._mk] = !legend.chart.isDatasetVisible(item.datasetIndex);
    } });
    mk('tmPosMain', cv, { type: 'line', data: { labels: dates, datasets: ds }, options: o, plugins: [rollPlug(posRolls(m, dates))] });
  }
  function posBond() {
    var d = POS.d; if (!d) return;
    var al = POS.alias, ser = (d.bond_series || {})[al], u = (d.u_slot || {})[al], dates = d.dates || [], my = multiYear(dates);
    var box = $('tmPosBBox'), none = $('tmPosBNone'), cap = $('tmPosBCap'); if (!box) return;
    var b = (d.bonds || []).filter(function (x) { return x.alias === al; })[0], nSer = Object.keys(d.bond_series || {}).length;
    cap.innerHTML = al ? '<b class="mono">' + esc(al) + '</b>' + (b && b.nick ? ' ' + esc(b.nick) : '') +
      (b ? ' · 순액면 ' + pSpan(b.net_face, 0) + '억 · DV01 ' + pSpan(b.dv01, 2) : '') + ' · 행 클릭 = 종목 바꾸기' : '';
    if (!ser) {
      kill('tmPosB'); box.hidden = true; none.hidden = false;
      none.textContent = al ? al + ' — 시계열은 |DV01| 상위 ' + nSer + '종목만(엔진 상한) · 이 종목은 표 숫자만' : '기간 안 팀 체결 표시 없음';
      return;
    }
    box.hidden = false; none.hidden = true;
    var ds = [
      { type: 'bar', label: '그날 순액면(억)', data: ser.day_face, backgroundColor: tk('--wb-series-6', 0.55), yAxisID: 'y', order: 3 },
      { type: 'line', label: '누적 액면(억)', data: ser.face, stepped: true, borderColor: tk('--wb-series-1'), backgroundColor: tk('--wb-series-1', 0.12), fill: 'origin', borderWidth: 2.2, pointRadius: 0, pointHoverRadius: 3, yAxisID: 'y', order: 1 },
      { type: 'line', label: 'DV01(백만원/bp)', data: ser.dv01, borderColor: tk('--wb-ink'), backgroundColor: tk('--wb-ink'), borderWidth: 1.8, borderDash: [5, 3], pointRadius: 0, pointHoverRadius: 3, spanGaps: false, yAxisID: 'y1', order: 0 }
    ];
    var sc = {
      x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10, callback: function (v) { return dShort(dates[v], my); } } },
      y: { position: 'left', title: { display: true, text: '억' }, ticks: { callback: tickSg } },
      y1: { position: 'right', grid: { display: false }, title: { display: true, text: 'DV01' }, ticks: { callback: tickSg } }
    };
    if (u) {
      ds.push({ type: 'line', label: 'u(3선 모니터)', data: u, borderColor: tk('--wb-open'), backgroundColor: tk('--wb-open'), borderWidth: 1.5, borderDash: [2, 3], pointRadius: 0, pointHoverRadius: 3, spanGaps: false, yAxisID: 'y2', order: 0 });
      sc.y2 = { position: 'right', grid: { display: false }, title: { display: true, text: 'u' }, ticks: { maxTicksLimit: 5 } };
    }
    mk('tmPosB', $('tmPosB'), { type: 'bar', data: { labels: dates, datasets: ds },
      options: baseOpts({ scales: sc, plugins: { legend: { display: true }, tooltip: { callbacks: {
        title: function (it) { return it[0] ? dates[it[0].dataIndex] : ''; },
        label: function (c) { var v = c.raw; return c.dataset.label + ' ' + (c.dataset.yAxisID === 'y2' ? fraw(v) : psg(v, c.dataset.yAxisID === 'y1' ? 2 : 0)); } } } } }) });
  }
  function posSpread(i, s, dates, lab) {
    mk('tmPosSp' + i, $('tmPosSp' + i), { type: 'bar', data: { labels: dates, datasets: [
      { type: 'line', label: '스프레드(bp)', data: s.spr, borderColor: tk('--wb-ink'), backgroundColor: tk('--wb-ink'), borderWidth: 1.8, pointRadius: 0, pointHoverRadius: 3, spanGaps: false, yAxisID: 'y', order: 0 },
      { type: 'bar', label: s.a + ' 순액면(억)', data: s.face_a, backgroundColor: tk('--wb-series-1', 0.85), yAxisID: 'y1', order: 1 },
      { type: 'bar', label: s.b + ' 순액면(억)', data: s.face_b, backgroundColor: tk('--wb-series-3', 0.85), yAxisID: 'y1', order: 1 }] },
      options: baseOpts({ scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 4, callback: function (v) { return lab(v); } } },
        y: { position: 'left', ticks: { maxTicksLimit: 4, callback: tickSg } },
        y1: { position: 'right', grid: { display: false }, ticks: { maxTicksLimit: 4, callback: tickSg } } },
        plugins: { legend: { display: false }, tooltip: { callbacks: {
          title: function (it) { return it[0] ? dates[it[0].dataIndex] : ''; },
          label: function (c) { return c.dataset.label + ' ' + (c.dataset.yAxisID === 'y' ? fraw(c.raw) : psg(c.raw, 0)); } } } } }) });
  }

  // ══ 떠 있는 툴팁(지도) ═════════════════════════════════════════════════
  function showHov(html, cx, cy, by) {   // by = 툴팁 주인(종목 스프레드 패널 'L'/'R' · 그 밖 = 없음)
    S.hovBy = by || '';
    var el = $('otcHov'); el.innerHTML = html; el.hidden = false;
    var w = el.offsetWidth, h = el.offsetHeight, vw = doc.documentElement.clientWidth, vh = window.innerHeight;
    var x = cx + 14, y = cy + 14;
    if (x + w > vw - 8) x = cx - w - 14;
    if (y + h > vh - 8) y = cy - h - 14;
    el.style.left = Math.max(8, x) + 'px'; el.style.top = Math.max(8, y) + 'px';
  }
  function hideHov() { S.hovBy = ''; var el = $('otcHov'); if (el) el.hidden = true; }

  // ══ 이벤트 ═════════════════════════════════════════════════════════════
  function onEnter(id, fn) { var el = $(id); if (el) el.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); fn(); } }); }
  function bind() {
    $('otcKeyBtn').addEventListener('click', function () { if (askKey()) start(); });
    panesBuild();
    // (0) 보드
    $('boDays').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-days]'); if (!b) return;
      B.days = +b.getAttribute('data-days'); boSave(); boSyncBar(); boFetch(true);   // 기존 차트는 그대로 두고 새 응답이 오면 교체
    });
    $('boAuto').addEventListener('click', function () { B.auto = !B.auto; boSave(); boSyncBar(); if (B.auto) { boFetch(true); boStart(); } else boStop(); boStatus(); });
    $('boDefault').addEventListener('click', function () { B.aliases = null; boSave(); boFetch(true); });
    $('rbFold').addEventListener('click', function () { RB.open = !RB.open; boSave(); rbFoldSync(); if (RB.open && RB.data) { RB.hasChart = false; rbChart(RB.data); rbLayout(true); } boResize(); });
    if (window.ResizeObserver) new ResizeObserver(function () { var w = $('rbCard').clientWidth; if (w && w !== RB.layW) rbLayout(true); }).observe($('rbCard'));   // 서랍 열림/닫힘 · 창 크기 → 배치 다시
    $('rbLegsBtn').addEventListener('click', function () { RB.legs = !RB.legs; boSave(); rbFoldSync(); if (RB.data) rbChart(RB.data); });
    rbDaysSync();
    $('rbDays').addEventListener('click', function (e) {   // 기간 바꾸면 커서를 비워 새 시계열을 받는다(기존 차트는 새 응답이 올 때 교체)
      var b = e.target.closest('button[data-days]'); if (!b) return;
      RB.days = +b.getAttribute('data-days'); RB.cursor = ''; RB.minSeq = RB.seq + 1; boSave(); rbDaysSync(); rbFetch(true);   // 떠 있던 옛 기간 응답은 버림(키인과 같은 seq 가드)
    });
    $('rbRefBtn').addEventListener('click', function () { RB.ref = !RB.ref; boSave(); rbFoldSync(); if (RB.data) rbChart(RB.data); });
    $('rbStatBtn').addEventListener('click', function () { RB.stat = !RB.stat; boSave(); rbStatSync(); });
    $('rbKeyApply').addEventListener('click', rbKeyApply);
    $('rbKeyClear').addEventListener('click', rbKeyClear);
    $('rbKeyIn').addEventListener('input', function () { RB.kDirty = true; if (RB.kMsg) { RB.kMsg = null; rbKeySync(); } });
    $('rbKeyIn').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); rbKeyApply(); }
      else if (e.key === 'Escape') { e.stopPropagation(); RB.kDirty = false; RB.kMsg = null; e.target.blur(); rbKeySync(); }   // 친 값 버리고 엔진 키인값으로(서랍 닫기 Esc 와 분리)
    });
    $('boQuick').addEventListener('click', function (e) { var b = e.target.closest('button[data-boadd]'); if (b) boAdd(b.getAttribute('data-boadd')); });
    $('boRows').addEventListener('focusin', function (e) { var inp = e.target.closest('input[data-boslot]'); if (inp) boSel(+inp.getAttribute('data-boslot')); });
    $('boRows').addEventListener('change', function (e) { var inp = e.target.closest('input[data-boslot]'); if (inp) boSetSlot(+inp.getAttribute('data-boslot'), inp.value); });
    $('boRows').addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.matches && e.target.matches('input[data-boslot]')) { e.preventDefault(); e.target.blur(); } });
    $('boRows').addEventListener('click', function (e) {   // 차트(머리 포함)를 누르면 그 종목 전체 호가
      if (e.target.closest('input, a, button, .wb-help')) return;
      var row = e.target.closest('.otc-bo-row');
      if (row && e.target.closest('.otc-bo-main') && B.data) { hideHov(); boOpen(B.data.aliases[+row.getAttribute('data-slot')]); }
    });
    $('boDrawer').addEventListener('click', spNav);
    doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panesOpen().length && S.view === 'board') boClose(); });   // Esc = 마지막에 연 칸부터
    doc.addEventListener('visibilitychange', function () { if (!doc.hidden) { boFetch(false); prFetchAll(); pnFetch(false); } });   // 탭으로 돌아오면 바로 한 번
    // (0b) 종목 스프레드 — 패널 두 개 틀 + 패널마다 입력 묶기(prNew 안)
    prBuild();
    // (0c) 내 포지션 — 등록 폼(Enter = 등록) · 표의 × = 삭제(바로)
    $('pnForm').addEventListener('submit', function (e) { e.preventDefault(); pnSubmit(); });
    $('pnKind').addEventListener('click', function (e) { var b = e.target.closest('button[data-kind]'); if (!b) return; PN.kind = b.getAttribute('data-kind') === 'fut' ? 'fut' : 'bond'; pnFormSync(); (PN.kind === 'fut' ? $('pnQty') : $('pnAlias')).focus(); });
    $('pnFut').addEventListener('click', function (e) { var b = e.target.closest('button[data-fut]'); if (!b) return; PN.fut = b.getAttribute('data-fut'); pnFormSync(); });
    $('pnSide').addEventListener('click', function (e) { var b = e.target.closest('button[data-side]'); if (!b) return; PN.side = +b.getAttribute('data-side') === -1 ? -1 : 1; pnFormSync(); });
    $('pnForm').addEventListener('input', function () { if (PN.msg) { PN.msg = null; pnMsgSync(); } });
    $('pnTbl').addEventListener('click', function (e) { var b = e.target.closest('button[data-pndel]'); if (b) pnDel(+b.getAttribute('data-pndel'), b); });
    ['pnAlias', 'pnQty', 'pnEntry', 'pnDate', 'pnNote'].forEach(function (id) { onEnter(id, pnSubmit); });   // Enter = 등록(submit 과 같은 길 · preventDefault 라 두 번 가지 않음)
    $('pnPwForm').addEventListener('submit', function (e) { e.preventDefault(); pnUnlock(); });   // 비밀번호 카드(Enter = 확인)
    onEnter('pnPw', pnUnlock);
    $('pnPw').addEventListener('input', function () { if ($('pnPwMsg').textContent && !PN.pwBusy) pnGate(true, '', false); });
    $('pnLock').addEventListener('click', pnLock);
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
    doc.addEventListener('click', function (e) {
      var ob = e.target.closest && e.target.closest('[data-evout]');
      if (ob) { var c = S.ev[ob.getAttribute('data-evout')]; if (!c) return; var on = ob.getAttribute('aria-pressed') !== 'true';
        c.setOut(on); ob.setAttribute('aria-pressed', on ? 'true' : 'false'); ob.classList.toggle('is-active', on);
        ob.textContent = ob.textContent.replace(on ? '보기' : '숨기기', on ? '숨기기' : '보기'); return; }
      var wb = e.target.closest && e.target.closest('[data-evwin]');
      if (wb) { var t = S.ev.tb; if (!t) return; var k = +wb.getAttribute('data-evwin'); S.team.evWin = k; t.setWindow(k ? t.dayLo(k) : 0, t.src.n - 1); }
    });
    doc.addEventListener('wb-themechange', function () { if (S.view === 'team' && S.team.sec === 'map') drawMap(); Object.keys(S.ev).forEach(function (k) { S.ev[k].redraw(); }); prRedrawAll(); });
    var rt = null;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { if (S.view === 'team' && S.team.sec === 'map') drawMap(); if (S.view === 'board') { boFit(); boResize(); panesOpen().forEach(function (p) { if (p.data) spRender(p); }); } }, 200); }, { passive: true });
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
    var pm = e.target.closest('button[data-posmode]');
    if (pm) { POS.mode = pm.getAttribute('data-posmode') === 'fut' ? 'fut' : 'dv01'; hideHov(); posModeSync(); posMain(); return; }
    if (e.target.closest('a, button')) return;
    var pb = e.target.closest('tr[data-posb]');
    if (pb) {
      POS.alias = pb.getAttribute('data-posb');
      Array.prototype.forEach.call(pb.parentNode.children, function (r) { r.classList.toggle('is-sel', r === pb); });
      posBond(); return;
    }
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
