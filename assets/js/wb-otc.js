/* ═══════════════════════════════════════════════════════════════════════════
   wb-otc.js — 장외 호가 탭(2026-11-04 사용자 지시) · 화면 = tools/otc/index.html
   ───────────────────────────────────────────────────────────────────────────
   화면 셋(해시): #bond 종목 분석 · #broker 브로커 분석 · #team 팀 해부(① 요약 ② 종목×일 ③ 장중 ④ 종목 시계열 ⑤ 일봉 ⑥ 포지션 추정)
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
  function evLegend(key, nOut, outLabel) {
    return '<span class="otc-leg">' +
      '<span><b class="otc-sell">▼</b>팔자</span><span><b class="otc-buy">▲</b>사자</span>' +
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
    // 마커: {x, y, side, r, a(채움 투명도), ink(배경과 구분되는 테두리), bw(테두리 굵기), ring(바깥 고리 = 체결 표시), fade(흐리게), hollow(속 빔), z(맨 위 층)}
    // 그리는 순서(Chart.js: order 가 작을수록 위): 선 3 → 점·이상치 2 → 체결 고리 1 → 맨 위 층(z) 0.
    // 팀 화살표 = 전부 속 채움(사자 파랑 · 팔자 빨강) + 얇은 ink 테두리 · 체결 표시 = 굵은 테두리 + 바깥 고리.
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
        spr: hasSpr ? evSeries(src.spr, src.ds, n) : [], mp: src.mp ? evSeries(src.mp, src.ds, n) : null };
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
    var endPlug = { id: 'otcEnd', afterDatasetsDraw: function (ch) {   // 오른쪽 끝 = 마지막 이벤트 직후 사자선/팔자선 값(엔진 값 그대로)
      if (!opt.endLabels || !n || !ch.chartArea || src.endOk === false) return;
      var ca = ch.chartArea, ys = ch.scales.y, ctx = ch.ctx, b = src.bid[ctl.hi], a = src.ask[ctl.hi], it = [];
      if (isNum(b)) it.push({ y: ys.getPixelForValue(b), t: fy(b), c: cssv('--wb-down') });
      if (isNum(a)) it.push({ y: ys.getPixelForValue(a), t: fy(a), c: cssv('--wb-up') });
      if (it.length === 2 && Math.abs(it[0].y - it[1].y) < 12) {
        var m = (it[0].y + it[1].y) / 2, up = it[0].y <= it[1].y ? 0 : 1;
        it[up].y = m - 6; it[1 - up].y = m + 6;
      }
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
    var common = { responsive: true, maintainAspectRatio: false, animation: false, parsing: false, normalized: true, events: [],
      plugins: { legend: { display: false }, tooltip: { enabled: false } }, layout: { padding: { right: opt.endLabels ? 46 : 6 } } };
    var main = new Chart(cvM, { type: 'line', plugins: [dayPlug, endPlug], data: { datasets: [
      lineDs('사자선', '--wb-down', [], 2.2), lineDs('팔자선', '--wb-up', [], 2.2), lineDs('미드', '--wb-ink', [], 1.5, [5, 4]),
      lineDs('전일민평', '--wb-muted', [], 1.4, [2, 4]),
      markDs('사자', [], 1), markDs('팔자', [], -1),
      { type: 'scatter', label: '이상치', data: [], order: 2, pointStyle: 'crossRot', pointRadius: 6.5, pointBorderWidth: 2.2,
        pointBorderColor: tk('--wb-muted'), pointBackgroundColor: 'transparent' },
      { type: 'scatter', label: '체결 표시 고리', data: [], order: 1, pointStyle: 'circle', pointBackgroundColor: 'transparent', pointBorderColor: tk('--wb-ink'), pointBorderWidth: 1.6,
        pointRadius: function (c) { var m = c.raw || {}; return (m.r || 6) + 5; } },
      markDs('팀 사자', [], 1, 0), markDs('팀 팔자', [], -1, 0)] },
      options: Object.assign({}, common, { onResize: function () { requestAnimationFrame(function () { drawCross(ctl.cur); drawNav(); }); },
        scales: { x: xScale(), y: { grace: opt.fitY ? 0 : '6%', afterFit: yFit, ticks: { includeBounds: !opt.fitY, maxTicksLimit: opt.fitY ? 6 : 11, callback: function (v) { return fy(v); } } } } }) });
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
      if (spr) spr.data.datasets[0].data = evSlice(full.spr, lo, hi);
      charts.forEach(function (c) { c.options.scales.x.min = lo - 0.5; c.options.scales.x.max = hi + 0.5; });
      if (opt.fitY) {   // y 범위 = 보이는 선 + 마커(흐린 것 제외) · 여백 12%
        var mn = Infinity, mx = -Infinity, ys = main.options.scales.y;
        [d[0].data, d[1].data, d[2].data, d[3].data, d[4].data, d[5].data, d[8].data, d[9].data].forEach(function (arr) {
          for (var q = 0; q < arr.length; q++) { var p = arr[q]; if (p.fade || !isNum(p.y)) continue; if (p.y < mn) mn = p.y; if (p.y > mx) mx = p.y; }
        });
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
      });
    }
    function onLeave() { hovEv = null; ctl.cur = null; drawCross(null); hideHov(); }
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
  async function xget(path, extra) {   // 공통: 키 · 주소 · 터널 회전 1회 재시도 · 403 = 저장 키 폐기
    var key = getKey() || S.memKey || '';
    if (!key) throw new KeyErr('키 없음');
    var base = await getApiBase();
    if (!base) base = await getApiBase(true);
    if (!base) throw new Error('API 주소 없음 — /assets/api_base.txt 비었거나 서버·터널이 꺼짐');
    var hd = Object.assign({ 'X-QH-KEY': key, 'ngrok-skip-browser-warning': '1' }, extra || {});
    var call = function (b) { return fetch(b + path, { headers: hd }); };   // cache:'no-store' 를 주면 Chromium 이 CORS 사전요청 캐시도 건너뛴다(5초마다 OPTIONS) — 응답 헤더가 no-store 라 저장은 안 된다
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
    if (res.status === 403) { var d = await detailOf(res); dropKey(); S.memKey = ''; throw new KeyErr('키가 맞지 않음 — ' + (d || '403'), true); }
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
  function dropCache(prefix) { Object.keys(S.cache).forEach(function (k) { if (k.indexOf(prefix) === 0) delete S.cache[k]; }); }
  function keyErr(e) {
    if (!e || !e.nokey) return false;
    showGate(e.denied ? '저장된 키가 맞지 않아 지웠습니다(' + emsg(e) + '). 다시 입력하세요.' : '이 화면은 키(X-QH-KEY)가 있어야 데이터가 보입니다.');
    return true;
  }
  function showGate(msg) {
    $('otcGateMsg').textContent = msg || '이 화면은 키(X-QH-KEY)가 있어야 데이터가 보입니다.';
    $('otcGate').hidden = false;
    ['vBoard', 'vBond', 'vBroker', 'vTeam'].forEach(function (id) { $(id).hidden = true; });
    S.meta = null; S.on = false; boStop();
    if (window.WBShell) WBShell.setPage('otc-' + (parseHash().v));
  }

  // ══ 해시 라우터 ════════════════════════════════════════════════════════
  var VIEWS = { board: { el: 'vBoard', enter: boardEnter, noMeta: true }, bond: { el: 'vBond', enter: bondEnter }, broker: { el: 'vBroker', enter: brokerEnter }, team: { el: 'vTeam', enter: teamEnter } };
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
    $('otcMeta').innerHTML = esc((m.coverage || {}).start || '') + ' ~ ' + esc((m.coverage || {}).end || '') +
      ' · 최신 영업일 <b>' + esc(m.latest || '–') + '</b> · 캐시 ' + n0(m.rows) + '행(복원 ' + n0(m.restored_rows) + (isNum(m.corrected_rows) ? ' · 교정 ' + n0(m.corrected_rows) : '') + ')' + help(srcNote()) +
      (isNum(m.outlier_rows) ? ' · 이상치 ' + n0(m.outlier_rows) + help(RU('outlier') || '') : '') +
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
  // (0) 보드 — 첫 화면: 종목 5칸 동시 · 당일/3/5/10일 · 5초 갱신 · 차트를 누르면 그 종목 전체 호가(상세 서랍)
  //   데이터 = /otc/board · /otc/board/detail (엔진 board · bond_span 그대로 · 웹 계산 0).
  //   cursor 는 헤더(X-OTC-Since) — same = 시각만 · full:false = 오늘 블록·head 만 교체 · full:true = 전부 교체.
  //   차트는 다시 만들지 않고 데이터만 갈아 끼운다(setSrc). meta 를 기다리지 않는다(병렬).
  //   종목 칸 설정(별칭 목록 · 기간 · 갱신 켬/끔)만 localStorage 에 기억한다 — 데이터는 저장하지 않는다.
  // ══════════════════════════════════════════════════════════════════════
  var BO_LS = 'otc_board_v1', BO_MS = 5000, BO_H = 150;
  var B = S.board = { aliases: null, days: 1, auto: true, choices: [1, 3, 5, 10], cursor: '', cpath: '', data: null, last: null,
    inflight: 0, fails: 0, err: '', timer: 0, rows: 0, slots: [],
    det: { open: false, alias: '', cursor: '', cpath: '', data: null, busy: false, has: false, nOut: -1 } };
  (function () {
    try {
      var o = JSON.parse(localStorage.getItem(BO_LS) || 'null');
      if (!o) return;
      if (Array.isArray(o.aliases) && o.aliases.length) B.aliases = o.aliases.map(String).slice(0, 12);
      if (isNum(o.days) && o.days >= 1) B.days = o.days;
      if (o.auto === false) B.auto = false;
    } catch (e) { /* 저장값 없음 */ }
  })();
  function boSave() { try { localStorage.setItem(BO_LS, JSON.stringify({ aliases: B.aliases, days: B.days, auto: B.auto })); } catch (e) { /* noop */ } }
  function boPath() { return '/otc/board?' + (B.aliases ? 'aliases=' + enc(B.aliases.join(',')) + '&' : '') + 'days=' + enc(B.days); }
  function spPath() { return '/otc/board/detail?alias=' + enc(B.det.alias) + '&days=' + enc(B.days); }
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
  function boSlotInfo(i, a, sv, flash) {   // 왼쪽 칸 + 차트 머리 — head 값 그대로
    var h = (sv && sv.head) || { alias: a, empty: true }, def = null;
    ((B.data && B.data.default) || []).forEach(function (x) { if (x.alias === a) def = x; });
    var inp = boIn(i); if (inp && doc.activeElement !== inp) inp.value = a;
    var chips = [];
    if (h.nick) chips.push(chip(esc(h.nick)));
    if (h.basket) chips.push(chip(esc(h.basket), 'otc-chip-basket'));
    if (def) chips.push((def.rule ? '' : tag('칸 채움')) + help('기본 세트: ' + (def.why || '') + (def.from ? ' (' + def.from + ' ~ ' + def.to + ')' : '') + (def.rule ? '' : '\n칸 채움 = 현·직전 3선 바스켓 비지표만으로 칸이 안 차서 더 과거 바스켓에서 채운 종목')));
    $('boChips' + i).innerHTML = chips.join('');
    $('boMid' + i).innerHTML = h.empty ? '<span class="wb-muted">호가 없음</span>' :
      '<span class="otc-bo-lab">미드</span><span class="otc-bo-midv">' + fy(h.mid) + '</span><span class="otc-bo-bp ' + sgn(h.mid_vs_mp) + '" title="미드 − 전일민평(bp)">' + (isNum(h.mid_vs_mp) ? fbp(h.mid_vs_mp) + 'bp' : '') + '</span>';
    $('boTeam' + i).innerHTML = h.empty ? '' : '팀 사 <b class="otc-buy">' + n0(h.team_buy) + '</b> / 팔 <b class="otc-sell">' + n0(h.team_sell) + '</b>';
    var hd = $('boHead' + i);
    hd.innerHTML = h.empty ? '<b class="otc-bo-al">' + esc(a) + '</b><span>최근 호가가 없는 이름입니다 — 종목 칸을 확인하세요</span>' :
      '<b class="otc-bo-al">' + esc(a) + '</b>' + (h.nick ? '<span>' + esc(h.nick) + '</span>' : '') + (h.basket ? chip(esc(h.basket), 'otc-chip-basket') : '') +
      '<span>사자 <b class="otc-buy">' + fy(h.bid) + '</b></span><span>팔자 <b class="otc-sell">' + fy(h.ask) + '</b></span><span>미드 <b>' + fy(h.mid) + '</b></span>' +
      '<span>미드−민평 <b class="' + sgn(h.mid_vs_mp) + '">' + (isNum(h.mid_vs_mp) ? fbp(h.mid_vs_mp) + 'bp' : '–') + '</b></span>' +
      '<span>오늘 <b>' + n0(h.n_today) + '</b>건</span><span>팀 사 <b class="otc-buy">' + n0(h.team_buy) + '</b> / 팔 <b class="otc-sell">' + n0(h.team_sell) + '</b></span>' +
      (h.last_t ? '<span class="otc-bo-t" title="마지막 금리 호가 시각">' + esc(h.last_t) + '</span>' : '');
    if (flash) { hd.classList.add('is-flash'); clearTimeout(hd._ft); hd._ft = setTimeout(function () { hd.classList.remove('is-flash'); }, 2000); }
  }
  function boSrc(sv) {   // 블록(종목×날) 이어 붙이기 — 이벤트 축 · 값 그대로
    var nb = ((sv && sv.blocks) || []).length, rs = nb >= 5 ? 0.78 : nb >= 3 ? 0.88 : 1;   // 화살표 크기(여러 날 = 조금 작게)
    var t = [], day = [], bid = [], ask = [], mid = [], mp = [], ds = [], marks = [], tqAt = {}, blocks = (sv && sv.blocks) || [];
    blocks.forEach(function (b) {
      var off = t.length, m = (b.t || []).length;
      for (var i = 0; i < m; i++) { t.push(b.t[i]); day.push(b.d); bid.push(b.bid[i]); ask.push(b.ask[i]); mid.push(b.mid[i]); mp.push(b.mp); ds.push(i === 0 && off > 0); }
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
    var multi = blocks.length > 1;
    return { n: t.length, multiDay: multi, day: day, ds: ds, hm: t.map(function (x) { return String(x).slice(0, 5); }),
      bid: bid, ask: ask, mid: mid, spr: null, mp: mp, marks: marks, outs: [],
      endOk: !!(t.length && blocks.length && day[t.length - 1] === blocks[blocks.length - 1].d),   // 오늘 이벤트가 없으면 끝 값 라벨을 달지 않는다(옛 날 값을 '지금'처럼 보이게 하지 않음)
      tip: function (i) {
        var h = '<b>' + (multi ? esc(mmdd(day[i])) + ' ' : '') + esc(t[i]) + '</b>' +
          '<br>사자선 <span class="otc-buy">' + fy(bid[i]) + '</span> · 팔자선 <span class="otc-sell">' + fy(ask[i]) + '</span> · 미드 ' + fy(mid[i]);
        (tqAt[i] || []).forEach(function (q) {
          h += '<br>' + tag('팀', 'team') + ' <span class="' + sideCls(q.side) + '">' + (q.side === 1 ? '▲ 사자 ' : '▼ 팔자 ') + ((q.np || !isNum(q.y)) ? '(금리 없이 방향만)' : fy(q.y)) + '</span> · ' + esc(q.broker || '') +
            ((q.t && q.t !== t[i]) ? ' <span class="wb-muted">' + esc(q.t) + '</span>' : '') + (isNum(q.size) ? ' · ' + n0(q.size) + '억' : '') +
            ' · ' + (q.out ? tag('이상치', 'out') : q.done ? tag('✓ 체결 표시', 'done') : '<span class="wb-muted">호가만</span>');
        });
        return h + '<br><span class="wb-muted">전일민평 ' + fy(mp[i]) + ' · 누르면 전체 호가</span>';
      } };
  }
  function boDraw(i) {
    var a = B.data.aliases[i], sv = B.data.series[a], st = B.slots[i] || (B.slots[i] = {});
    var src = boSrc(sv), host = $('boEv' + i), key = 'bo' + i, h = (sv && sv.head) || {};
    if (!src.n) {
      killEv(key);
      host.innerHTML = '<div class="otc-bo-ph" style="height:' + BO_H + 'px">' + (h.empty ? '호가 없음' : '이 기간에 사자선·팔자선을 만든 금리 호가가 없습니다' + (isNum(h.mp) ? ' · 전일민평 ' + fy(h.mp) : '')) + '</div>';
      st.alias = a; st.has = false; return;
    }
    if (st.has && st.alias === a && S.ev[key]) S.ev[key].setSrc(src);
    else evChart(key, host, src, { h: BO_H, noSpr: true, fitY: true, endLabels: true });
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
    if (d.team && d.team.label) teamLabel(d.team.label);
    if (d.same) return;
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
    boSyncBar(); boMarkOpen();
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
    if (B.det.open) spFetch(user);
  }
  function boStart() { boStop(); if (B.auto) B.timer = setInterval(function () { boFetch(false); }, BO_MS); }
  function boStop() { if (B.timer) { clearInterval(B.timer); B.timer = 0; } }
  function boardEnter(p) {
    var qd = p && +p.get('days');
    if (qd && B.choices.indexOf(qd) >= 0) B.days = qd;
    if (!B.rows) boBuild(B.aliases ? B.aliases.length : 5);
    boSyncBar(); boStatus();
    boFetch(true); boStart();
    if (p && p.get('open')) boOpen(p.get('open'));
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
    Array.prototype.forEach.call($('boRows').children, function (r, i) { r.classList.toggle('is-open', !!(B.det.open && B.data && B.data.aliases[i] === B.det.alias)); });
  }
  function boFit() {   // 서랍이 열리면 보드를 그만큼 좁혀 5칸이 계속 보이게(가리지 않음)
    var v = $('vBoard'), dr = $('boDrawer'); v.style.paddingRight = '';
    if (!B.det.open || window.innerWidth < 900) return;
    var pr = Math.round(v.getBoundingClientRect().right - (window.innerWidth - dr.offsetWidth) + 12);
    if (pr > 0) v.style.paddingRight = pr + 'px';
  }

  // ── 상세 서랍: 그 종목 전체 호가(전 브로커) + 당일 스트림 + 브로커 랭킹 ──
  function boOpen(alias) {
    var D = B.det; alias = String(alias || '').trim(); if (!alias) return;
    if (D.alias !== alias) {
      D.alias = alias; D.data = null; D.cursor = ''; D.cpath = ''; D.nOut = -1; D.has = false; killEv('sp');
      $('spTitle').innerHTML = '<b>' + esc(alias) + '</b>'; $('spSum').innerHTML = '<span class="wb-loading">불러오는 중…</span>'; $('spLegend').innerHTML = '';
      $('spEv').innerHTML = skel(6); $('spStream').innerHTML = skelCard('당일 호가 스트림(최신순)'); $('spRank').innerHTML = skelCard('서식 브로커 랭킹');
    }
    D.open = true; $('boDrawer').hidden = false; boFit(); boMarkOpen(); spFetch(true);
  }
  function boClose() { B.det.open = false; $('boDrawer').hidden = true; boFit(); boMarkOpen(); hideHov(); }
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
        if ((b.side[i] === 1 || b.side[i] === -1) && isNum(b.y[i])) marks.push(bk.team ? { x: idx, y: b.y[i], side: b.side[i], r: pr + (b.done[i] ? 5.5 : 4.5), ink: true, bw: b.done[i] ? 2.6 : 1.2, ring: !!b.done[i], z: 1 }
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
  function spRender() {
    var D = B.det, d = D.data, h = d.head || {}, a = D.alias, chips = [];
    if (h.nick) chips.push(chip(esc(h.nick)));
    if (h.bucket) chips.push(chip(esc(h.bucket)));
    if (isNum(h.rem)) chips.push(chip('잔존 ' + esc(h.rem) + '년'));
    if (h.basket) chips.push(chip(esc(h.basket), 'otc-chip-basket'));
    var days = d.days || [];
    $('spTitle').innerHTML = '<b>' + esc(a) + '</b> ' + chips.join(' ') + '<span class="otc-dr-sub">전체 호가 동향(전 브로커) · ' + esc(dayLab(days.length || B.days)) +
      (days.length ? ' ' + esc(mmdd(days[0])) + (days.length > 1 ? '~' + esc(mmdd(days[days.length - 1])) : '') : '') + '</span>';
    $('spSum').innerHTML = (h.empty ? '<span>최근 호가가 없는 이름입니다</span>' :
      '<span>사자 <b class="otc-buy">' + fy(h.bid) + '</b></span><span>팔자 <b class="otc-sell">' + fy(h.ask) + '</b></span><span>미드 <b>' + fy(h.mid) + '</b></span>' +
      '<span>사자−팔자 <b>' + (isNum(h.spr) ? fbp(h.spr, 2) + 'bp' : '–') + '</b></span>' +
      '<span>전일민평 <b>' + fy(h.mp) + '</b></span><span>미드−민평 <b class="' + sgn(h.mid_vs_mp) + '">' + (isNum(h.mid_vs_mp) ? fbp(h.mid_vs_mp) + 'bp' : '–') + '</b></span>' +
      '<span>오늘 <b>' + n0(h.n_today) + '</b>건</span><span>팀 사 <b class="otc-buy">' + n0(h.team_buy) + '</b> / 팔 <b class="otc-sell">' + n0(h.team_sell) + '</b></span>') +
      '<a href="' + esc(hashOf('bond', { alias: a, date: d.today || '' })) + '">종목 분석 탭에서 열기 ›</a>';
    var src = spSrc(d);
    if (src.nOut !== D.nOut) { $('spLegend').innerHTML = evLegend('sp', src.nOut, '이상치'); D.nOut = src.nOut; }
    if (!src.n) { killEv('sp'); D.has = false; $('spEv').innerHTML = '<div class="otc-empty">이 기간에 금리가 있는 호가가 없습니다.</div>'; }
    else if (D.has && S.ev.sp) S.ev.sp.setSrc(src);
    else { evChart('sp', $('spEv'), src, { h: 300, hs: 90 }); D.has = true; }
    outBtnSync('sp');
    swapKeep($('spStream'), streamCard(d.stream || [], d.today, d.n_stream, 'otc-scroll--dr'));
    swapKeep($('spRank'), rankCard(d.rank || [], d.week || [], d.today, 'otc-scroll--dr'));
  }
  function spFetch(user) {
    var D = B.det; if (!S.on || !D.open || (!user && D.busy)) return;
    var path = spPath(), since = (D.data && D.cpath === path) ? D.cursor : '';
    D.busy = true;
    pget(path, since).then(function (d) {
      if (!D.open || path !== spPath() || d.same) return;
      if (d.full) D.data = d;
      else if (D.data && D.cpath === path) {   // 오늘 블록·머리·스트림·랭킹만 교체
        mergeBlocks(D.data.blocks, d.blocks);
        ['head', 'stream', 'n_stream', 'rank', 'week', 'today', 'days'].forEach(function (k) { if (d[k] !== undefined) D.data[k] = d[k]; });
      } else { D.cursor = ''; D.cpath = ''; setTimeout(function () { spFetch(true); }, 0); return; }
      D.cursor = d.cursor; D.cpath = path;
      spRender();
    }).catch(function (e) {
      if (keyErr(e)) return;
      if (!D.data) { $('spSum').innerHTML = ''; $('spEv').innerHTML = errBox('상세 불러오기 실패', e); }
    }).then(function () { D.busy = false; });
  }
  function spNav(e) {   // 서랍 표의 브로커 행 → 브로커 분석
    if (e.target.closest('.wb-help, a, input, select, button')) return;
    var tr = e.target.closest('tr[data-broker]'); if (!tr) return;
    var d = B.det.data;
    go('broker', { name: tr.getAttribute('data-broker'), asof: (d && d.today) || '', period: S.broker.period || '5d' });
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
    if (h.basket) chips.push(chip(esc(h.basket), 'otc-chip-basket'));
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
    if (h.basket) chips.push(chip(esc(h.basket), 'otc-chip-basket'));
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
  // 버킷 → 표시 색(표현 전용 · MIX_COLOR 와 같은 계열: 3년 = series-4 · 10년 = series-2 · 30년 = 보라 · 통안 = series-5)
  var POS_COLOR = { B3: '--wb-series-4', B10: '--wb-series-2', B30: '--wb-legacy-purple', IDX: '--wb-series-1', MSB: '--wb-series-5', OTH: '--wb-series-6' };
  var POS_MK = [   // 보조축(시장 · 오른쪽) — [market 키, 라벨, 색, 점선]
    ['jp3', '3선 저평', '--wb-warn', [6, 4]], ['U', '3선 U', '--wb-open', [2, 3]], ['jp10', '10선 저평', '--wb-legacy-purple', [6, 4]]
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
  function posRolls(m, dates) {   // 선물 롤(계약 코드 바뀐 날) — 3선/10선 · 날짜 → 라벨
    var o = {};
    [['roll3', '3선'], ['roll10', '10선']].forEach(function (r) {
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
        '<td>' + (b.basket ? tag(b.basket) : '') + '</td><td class="num">' + n0(b.n) + '</td><td class="num">' + bs(b.buy, b.sell) + '</td>' + pTd(b.net_cnt, 0) +
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
        return '<div class="otc-sm-cell"><div class="otc-sm-title"><span class="mono">' + esc(s.pair) + '</span><span class="otc-sub">' + esc([s.basket, s.b_nick].filter(Boolean).join(' · ')) + '</span>' +
          '<span class="otc-sub">변화 ' + bpSpan(s.chg, 1) + 'bp · 체결 ' + n0(s.n_a) + ' · ' + n0(s.n_b) + '</span></div>' +
          '<div class="otc-chart otc-chart--xs"><canvas id="tmPosSp' + i + '"></canvas></div></div>';
      }).join('') + '</div>' : '<div class="otc-card-body"><div class="otc-empty">교체 스프레드 없음(엔진 spreads 비어 있음)</div></div>') + '</section>';
    // 5) 장중 짝 검사
    var it = d.intraday || {};
    html += '<div class="otc-grid">' + ['3선', '10선'].map(function (k) { return '<section class="wb-card">' + posIntraCard(k, it[k]) + '</section>'; }).join('') + '</div>';
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
      '\n보조축(오른쪽) = 3선 저평 · 3선 U · 10선 저평 — 범례 클릭으로 켜고 끄기(U 는 값 없는 구간 끊김)\n' + posDef('jp') +
      '\n세로 점선 = 선물 롤(계약 코드 바뀐 날 · 3선/10선)\n전 기간 0 인 선은 생략(위 표기) · 십자선 툴팁 = 그날 버킷별 DV01 · 계약 · 저평 · U · Ub';
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
    h += '<br><span class="wb-muted">시장</span><br>3선 저평 ' + fraw(at('jp3')) + ' · U ' + fraw(at('U')) + ' · Ub ' + fraw(at('Ub')) + ' · 10선 저평 ' + fraw(at('jp10'));
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
    // (0) 보드
    $('boDays').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-days]'); if (!b) return;
      B.days = +b.getAttribute('data-days'); boSave(); boSyncBar(); boFetch(true);   // 기존 차트는 그대로 두고 새 응답이 오면 교체
    });
    $('boAuto').addEventListener('click', function () { B.auto = !B.auto; boSave(); boSyncBar(); if (B.auto) { boFetch(true); boStart(); } else boStop(); boStatus(); });
    $('boDefault').addEventListener('click', function () { B.aliases = null; boSave(); boFetch(true); });
    $('boRows').addEventListener('change', function (e) { var inp = e.target.closest('input[data-boslot]'); if (inp) boSetSlot(+inp.getAttribute('data-boslot'), inp.value); });
    $('boRows').addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.matches && e.target.matches('input[data-boslot]')) { e.preventDefault(); e.target.blur(); } });
    $('boRows').addEventListener('click', function (e) {   // 차트(머리 포함)를 누르면 그 종목 전체 호가
      if (e.target.closest('input, a, button, .wb-help')) return;
      var row = e.target.closest('.otc-bo-row');
      if (row && e.target.closest('.otc-bo-main') && B.data) { hideHov(); boOpen(B.data.aliases[+row.getAttribute('data-slot')]); }
    });
    $('spClose').addEventListener('click', boClose);
    $('boDrawer').addEventListener('click', spNav);
    doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' && B.det.open && S.view === 'board') boClose(); });
    doc.addEventListener('visibilitychange', function () { if (!doc.hidden) boFetch(false); });   // 탭으로 돌아오면 바로 한 번
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
    doc.addEventListener('wb-themechange', function () { if (S.view === 'team' && S.team.sec === 'map') drawMap(); Object.keys(S.ev).forEach(function (k) { S.ev[k].redraw(); }); });
    var rt = null;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { if (S.view === 'team' && S.team.sec === 'map') drawMap(); if (S.view === 'board') { boFit(); boResize(); } }, 200); }, { passive: true });
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
