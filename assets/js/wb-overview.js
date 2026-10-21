/* ═══════════════════════════════════════════════════════════════════════════
   wb-overview.js — Overview 탭(들어가면 맨 먼저 · 2026-10-21 사용자 지시)
   ───────────────────────────────────────────────────────────────────────────
   섹션 순서 고정: ① 지표 3일 움직임 + 전 국채 커브 ② 최신 금리 변동(D vs D−1) ③ 차익거래 모니터 요약
                   ④ 주간 리뷰 요약 ⑤ 금리 대시보드 핵심. 섹션마다 독립 로딩 — 한 API 가 실패해도 나머지는 뜬다.
   ■ 날짜: D = 조회 시점에 확정된 마지막 종가일 · D−1·D−2·D−3 = 그 직전 거래일들.
     규칙 = 금리 대시보드와 같은 '최신 종가일'(/ktb/curve-board as_of = 지표 최신일) + 확정 확인:
     그날 국고채 커브(/ktb/curve?date=d&category=국고채)가 그 날짜로 오고 ≥ MIN_CURVE_ROWS 종목일 때만 종가로 인정.
     평일 아침 DB 의 오늘 날짜 행 = 예비호가(국채선물 3행 등) → 후보에서 빠지거나 확인에서 걸러진다.
   ■ 숫자: 금리 변화(종가 차)만 웹 계산 — 금리 대시보드와 같은 산술(변화 bp = (a − b) × 100 · 소수 1 · 양수 '+' ·
     레벨 % 소수 3 · 스프레드 = ((a − b) × 100).toFixed(4) 의 차). 날짜는 '마지막 두 점'이 아니라 D · D−1 로 고정
     (선물 라벨은 오늘 예비행이 있어 마지막 점 = 예비호가일 수 있음).
     엔진 산출물(모니터 json · 리뷰 plain)은 그대로 — 재계산 0(차익거래 모니터 명세 _ARB_MONITOR_SPEC_20261021 규칙).
   ■ 데이터: /ktb/curve-board · /ktb/multi_label_series · /ktb/curve · /quant-house/arb-monitor ·
     /quant-house/market-review · /quant-house/review-scoreboard — 기존 읽기 전용 API 그대로(새 라우트 없음).
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var doc = document;
  var $ = function (id) { return doc.getElementById(id); };
  var MINUS = '−';
  var MIN_CURVE_ROWS = 20;            // 확정 종가 판정: 그날 국고채 커브 최소 종목 수(평소 ≈ 120 · 예비호가 날 = 0~수 개)
  var SPARK_N = 20;                   // 타일 추이선 = D 까지 끝 20 관측
  var KTB_CAT = '국고채';
  var OV = { charts: {}, focus: null, R: null };
  var STATS = window.WB_OV_STATS = { sec: {}, dates: null, rejected: [], tiles: {}, bars: null };

  // ── 작은 도구 ───────────────────────────────────────────────────────────
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function num(v) { if (v == null || v === '' || typeof v === 'boolean') return null; var n = Number(v); return isFinite(n) ? n : null; }
  function help(t) { return window.WBShell ? WBShell.helpBtn(t) : ''; }
  function mmdd(d) { return d ? String(d).slice(5, 10) : '—'; }
  function mk(key, canvas, cfg) {
    if (!canvas || !window.Chart) return null;
    var prev = OV.charts[key] || Chart.getChart(canvas);
    if (prev) { try { prev.destroy(); } catch (e) { /* noop */ } }
    return (OV.charts[key] = new Chart(canvas.getContext('2d'), cfg));
  }
  function tok(n, a) { return WBChart.tok(n, a); }
  function signTok(v) { return v > 0 ? '--wb-up' : v < 0 ? '--wb-down' : '--wb-muted'; }
  function secErr(id, title, msg, href, label) {
    var el = $(id); if (!el) return;
    el.innerHTML = '<div class="ov-err"><span class="wb-error">' + esc(title) + '</span>' + esc(msg || '') +
      (href ? ' <a href="' + href + '">→ ' + esc(label) + ' 열기</a>' : '') + '</div>';
  }
  function emsg(e) { return (e && (e.detail || e.message)) ? String(e.detail || e.message).slice(0, 200) : '알 수 없는 오류'; }

  // 금리 대시보드와 같은 산술·표기(값 = 응답 그대로 · 화면 문자열만)
  function bpChg(a, b) { return (a != null && b != null) ? (a - b) * 100 : null; }                // % 레벨 → bp 변화
  function fmtBp(v) { return v == null ? '–' : (v > 0 ? '+' : '') + v.toFixed(1); }                 // 대시보드: `${chg>0?'+':''}${(chg*100).toFixed(1)}`
  function clsOf(v) { return v == null || v === 0 ? 'wb-muted' : v > 0 ? 'wb-up' : 'wb-down'; }
  function spreadLv(a, b) { return (a != null && b != null) ? +((a - b) * 100).toFixed(4) : null; }  // 대시보드 diff(…, 100)

  // 차익거래 모니터와 같은 표기(부호 '−' · 반올림만) — 그 탭 renderBasis/renderJudge 규칙
  function isNum(v) { return v != null && v !== '' && isFinite(+v); }
  function sgn(v, d) { if (!isNum(v)) return '—'; var n = +v, s = Math.abs(n).toFixed(d); return (n > 0 ? '+' : n < 0 ? MINUS : '') + s; }
  function fix(v, d) { if (!isNum(v)) return '—'; var n = +v; return (n < 0 ? MINUS : '') + Math.abs(n).toFixed(d); }
  function raw(v) { if (v == null || v === '') return '—'; if (typeof v === 'number') return (v < 0 ? MINUS : '') + String(Math.abs(v)); return esc(v); }
  // 주간 리뷰 폴백 표 = 고급 보기 표(_fmt)와 같은 숫자 모양 — '고급 보기 →'로 넘어가도 같은 글자(값 무변형 · 소수 자리만 고급 탭 규칙)
  function advFmt(v) { if (v == null || v === '') return '–'; var n = Number(v); if (!isFinite(n)) return esc(String(v)); return (n > 0 ? '+' : '') + (Math.abs(n) >= 100 ? Math.round(n) : n.toFixed(2)); }

  function sparkSvg(vals) {
    var v = (vals || []).map(num), pts = [];
    v.forEach(function (y, i) { if (y != null) pts.push([i, y]); });
    if (pts.length < 2) return '<svg class="ov-spark" aria-hidden="true"></svg>';
    var W = 120, H = 24, ys = pts.map(function (p) { return p[1]; }), mn = Math.min.apply(null, ys), mx = Math.max.apply(null, ys), n = Math.max(1, v.length - 1);
    var X = function (i) { return (i / n) * (W - 4) + 2; }, Y = function (y) { return mx === mn ? H / 2 : H - 3 - ((y - mn) / (mx - mn)) * (H - 6); };
    var d = pts.map(function (p, k) { return (k ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1); }).join(' ');
    var l = pts[pts.length - 1];
    return '<svg class="ov-spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true"><path d="' + d + '"/><circle cx="' + X(l[0]).toFixed(1) + '" cy="' + Y(l[1]).toFixed(1) + '" r="2"/></svg>';
  }

  // ══ ①② 금리 코어 — D 판정 · 시계열 · 커브 ═════════════════════════════════
  var LB = { y2: '2년지표', y3: '3년지표', y5: '5년지표', y10: '10년지표', y20: '20년지표', y30: '30년지표',
             f3: '3선', f10: '10선', i2: 'IRS2년', i3: 'IRS3년', i5: 'IRS5년', i10: 'IRS10년', cd: 'CD', base: '한국기준금리' };
  var IDX4 = [['y2', '2년'], ['y3', '3년'], ['y5', '5년'], ['y10', '10년']];
  var SPREADS = [['s35', '3-5', 'y5', 'y3'], ['s310', '3-10', 'y10', 'y3'], ['s510', '5-10', 'y10', 'y5'], ['s1030', '10-30', 'y30', 'y10']];
  var boardP = null;
  function board() { if (!boardP) boardP = apiGet('/ktb/curve-board'); return boardP; }

  function seriesMap(data) {   // {key: Map(date → 금리 %)} · date = YYYY-MM-DD
    var out = {};
    Object.keys(LB).forEach(function (k) {
      var m = new Map();
      ((data && data.series && data.series[LB[k]]) || []).forEach(function (r) {
        var d = r && r.price_date ? String(r.price_date).slice(0, 10) : null;
        if (d) m.set(d, num(r.ytm));
      });
      out[k] = m;
    });
    return out;
  }
  // 금리 대시보드 수익률 곡선과 같은 점 규칙: 잔존·금리 있음 · 금리 0 제외 · '…저평' 행(금리 아님) 제외
  function curveRows(res) {
    return ((res && res.rows) || []).filter(function (r) {
      return r.remain_year != null && r.ytm != null && isFinite(+r.remain_year) && isFinite(+r.ytm) && +r.ytm !== 0 && !/저평$/.test(r.label || '');
    }).sort(function (a, b) { return (+a.remain_year - +b.remain_year) || (+a.ytm - +b.ytm); });
  }
  function getCurve(d) { return apiGet('/ktb/curve?date=' + encodeURIComponent(d) + '&category=' + encodeURIComponent(KTB_CAT)); }

  // D 판정: 후보 = 지표(2·3·5·10년) 관측일(≤ 보드 as_of) 최신순 → 그날 국고채 커브가 그 날짜 · ≥ MIN_CURVE_ROWS 이면 확정 종가
  async function resolveDays(sm, asof) {
    var set = new Set();
    IDX4.forEach(function (t) { sm[t[0]].forEach(function (v, d) { if (v != null) set.add(d); }); });
    var cands = Array.from(set).sort().reverse();
    var cut = asof ? cands.filter(function (d) { return d <= asof; }) : cands;
    var dropped = asof ? cands.filter(function (d) { return d > asof; }) : [];   // 보드 기준일보다 최신 = 예비 후보
    cut = cut.slice(0, 7);
    var res = await Promise.all(cut.map(function (d) { return getCurve(d).catch(function () { return null; }); }));
    var ok = [], rej = dropped.map(function (d) { return { d: d, why: '이격 보드 기준일 ' + asof + ' 이후' }; });
    cut.forEach(function (d, i) {
      var r = res[i], n = curveRows(r).length, got = r && r.date ? String(r.date).slice(0, 10) : null;
      if (got === d && n >= MIN_CURVE_ROWS) ok.push({ d: d, curve: r });
      else if (!ok.length) rej.push({ d: d, why: '국고채 커브 ' + n + '종목' + (got && got !== d ? ' · 응답일 ' + got : '') });
    });
    return { days: ok.slice(0, 4), rejected: rej };
  }

  async function loadRatesCore() {
    var res = await Promise.allSettled([board(), apiGet('/ktb/multi_label_series?labels=' + encodeURIComponent(Object.keys(LB).map(function (k) { return LB[k]; }).join(',')) + '&days=45')]);
    if (res[1].status !== 'fulfilled') throw new Error('금리 시계열(/ktb/multi_label_series) 실패 — ' + emsg(res[1].reason));
    var b = res[0].status === 'fulfilled' ? res[0].value : null;
    var asof = b && b.as_of ? String(b.as_of).slice(0, 10) : null;
    var sm = seriesMap(res[1].value);
    var rd = await resolveDays(sm, asof);
    if (!rd.days.length) throw new Error('확정 종가일을 찾지 못함(국고채 커브 ≥ ' + MIN_CURVE_ROWS + '종목인 날 없음)');
    var R = { sm: sm, days: rd.days, dl: rd.days.map(function (x) { return x.d; }), rejected: rd.rejected, asof: asof, boardOk: !!b };
    STATS.dates = R.dl.slice(); STATS.rejected = rd.rejected.map(function (x) { return x.d; });
    return R;
  }
  function val(R, key, d) { var m = R.sm[key]; return m && d && m.has(d) ? m.get(d) : null; }

  function renderBasis(R, err) {
    var el = $('ovBasis'); if (!el) return;
    if (err) { el.innerHTML = '<span class="wb-badge wb-badge--warn">기준일 판정 실패</span>' + help(emsg(err)); return; }
    var dl = R.dl;
    el.innerHTML = '<span><b>기준 ' + esc(dl[0]) + '(종가)</b> · 비교 D−1 ' + esc(mmdd(dl[1])) + (dl[3] ? ' · 3일 = ' + esc(mmdd(dl[3])) + ' → ' + esc(mmdd(dl[0])) : '') + '</span>' +
      help('D = 조회 시점에 확정된 마지막 종가일(금리 대시보드와 같은 기준 = 이격 보드 기준일 ' + (R.asof || '없음') + ') · 그날 국고채 커브가 온전(≥ ' + MIN_CURVE_ROWS + '종목)해야 종가로 인정. 평일 아침 DB 의 오늘 날짜 행은 예비호가라 쓰지 않음. D−1·D−2·D−3 = 그 직전 거래일.') +
      (R.rejected.length ? '<span class="wb-badge wb-badge--warn">예비 제외 ' + esc(R.rejected.map(function (x) { return mmdd(x.d); }).join('·')) + '</span>' + help(R.rejected.map(function (x) { return x.d + ': ' + x.why; }).join(' / ')) : '');
  }

  // ── ① 지표 3일 막대 + 전 국채 커브 ─────────────────────────────────────
  function renderS1(R) {
    var dl = R.dl, D = dl[0];
    $('ovS1Meta').textContent = 'D ' + D + (dl[3] ? ' · D−3 ' + dl[3] : '');
    var lgd = function (i, op, txt) { return '<span class="wb-legend-item"><i class="wb-swatch" style="color:var(--wb-ink);opacity:' + op + ';height:8px;width:10px;border-radius:2px"></i>' + esc(txt) + '</span>'; };
    $('ovS1').innerHTML =
      '<div class="ov-grid2">' +
        '<section class="wb-card ov-card" aria-label="지표 일별 변화">' +
          '<div class="wb-card-head"><span class="wb-card-title">지표 2·3·5·10년 일별 변화' + help('국고 지표(2·3·5·10년지표) 종가의 전일 대비 변화(bp). 막대 = D−2 · D−1 · D 각각의 그 전날 대비 · D 가 가장 진함. 막대 아래 = 3일 누적(D − D−3). 색 = + 빨강 / − 파랑(금리 상승 / 하락). 타일(②)을 누르면 그 테너 강조.') + '</span><span class="wb-card-meta">bp · 전일 대비</span></div>' +
          '<div class="ov-body"><div class="wb-legend ov-legend">' +
            (dl[2] ? lgd(2, .3, 'D−2 ' + mmdd(dl[2])) : '') + (dl[1] ? lgd(1, .55, 'D−1 ' + mmdd(dl[1])) : '') + lgd(0, 1, 'D ' + mmdd(D)) + '</div>' +
          '<div class="ov-chart ov-chart--bars"><canvas id="ovBars" aria-label="지표 일별 변화 막대"></canvas></div></div>' +
        '</section>' +
        '<section class="wb-card ov-card" aria-label="전 국채 커브">' +
          '<div class="wb-card-head"><span class="wb-card-title">전 국채 커브' + help('국고채 전 종목(금리 대시보드 수익률 곡선과 같은 소스 /ktb/curve · 같은 점 규칙). 진한 선 = D · 점선 = D−3 · 옅은 선 = D−1·D−2. 아래 = 잔존만기별 D vs D−1 변화(같은 종목끼리 · 지표 별칭·기준금리 행 제외).') + '</span><span class="wb-card-meta" id="ovCurveMeta"></span></div>' +
          '<div class="ov-body"><div class="wb-legend ov-legend"><span class="wb-legend-item"><i class="wb-swatch" style="color:var(--wb-series-1)"></i>D ' + esc(mmdd(D)) + '</span>' +
            (dl[1] ? '<span class="wb-legend-item"><i class="wb-swatch" style="color:var(--wb-series-1);opacity:.35"></i>D−1·D−2</span>' : '') +
            (dl[3] ? '<span class="wb-legend-item"><i class="wb-swatch" style="color:var(--wb-muted);border-top:1px dashed;background:none"></i>D−3 ' + esc(mmdd(dl[3])) + '</span>' : '') + '</div>' +
          '<div class="ov-chart ov-chart--curve"><canvas id="ovCurve" aria-label="전 국채 커브"></canvas></div>' +
          '<div class="ov-foot">잔존만기별 변화 D vs D−1 (bp)</div>' +
          '<div class="ov-chart ov-chart--chg"><canvas id="ovCurveChg" aria-label="잔존만기별 변화"></canvas></div></div>' +
        '</section>' +
      '</div>';
    drawBars(R); drawCurve(R); drawCurveChg(R);
  }
  function barData(R) {
    var dl = R.dl;
    var daily = function (k) { return IDX4.map(function (t) { return dl[k + 1] ? bpChg(val(R, t[0], dl[k]), val(R, t[0], dl[k + 1])) : null; }); };
    var cum = IDX4.map(function (t) { return dl[3] ? bpChg(val(R, t[0], dl[0]), val(R, t[0], dl[3])) : null; });
    return { d0: daily(0), d1: daily(1), d2: daily(2), cum: cum };
  }
  function drawBars(R) {
    var dl = R.dl, b = barData(R);
    STATS.bars = { d: b.d0.map(fmtBp), d1: b.d1.map(fmtBp), d2: b.d2.map(fmtBp), cum: b.cum.map(fmtBp) };
    var focusA = function (i) { var t = IDX4[i] && IDX4[i][0]; return OV.focus && OV.focus !== t ? .3 : 1; };
    var ds = function (vals, op, name) {
      return { label: name, data: vals, borderRadius: 2, maxBarThickness: 26,
        backgroundColor: function (c) { return WBChart.alpha(signTok(c.raw), op * focusA(c.dataIndex)); } };
    };
    var labels = IDX4.map(function (t, i) { return [t[1], '3일 ' + fmtBp(b.cum[i])]; });
    var valLbl = { id: 'ovValLbl', afterDatasetsDraw: function (ch) {
      var meta = ch.getDatasetMeta(ch.data.datasets.length - 1), ctx = ch.ctx;   // D 막대 = 마지막 데이터셋
      ctx.save(); ctx.font = '600 11px ' + (WBChart.css('--wb-font') || 'sans-serif'); ctx.textAlign = 'center';
      meta.data.forEach(function (el, i) {
        var v = b.d0[i]; if (v == null) return;
        ctx.fillStyle = WBChart.css('--wb-ink'); ctx.globalAlpha = focusA(i);
        ctx.textBaseline = v >= 0 ? 'bottom' : 'top'; ctx.fillText(fmtBp(v), el.x, v >= 0 ? el.y - 2 : el.y + 2);
      });
      ctx.restore();
    } };
    mk('bars', $('ovBars'), { type: 'bar',
      data: { labels: labels, datasets: [ds(b.d2, .3, 'D−2 ' + mmdd(dl[2])), ds(b.d1, .55, 'D−1 ' + mmdd(dl[1])), ds(b.d0, 1, 'D ' + mmdd(dl[0]))] },
      options: { responsive: true, maintainAspectRatio: false, animation: false, layout: { padding: { top: 16 } },
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: function (it) { return (labels[it[0].dataIndex] || [])[0] + ' 지표'; },
          label: function (c) { return ' ' + c.dataset.label + ' · 전일 대비 ' + fmtBp(c.raw) + 'bp'; } } } },
        scales: { x: { grid: { display: false }, ticks: { font: { size: 11 } } }, y: { grace: '18%', title: { display: true, text: 'bp' } } },
        onClick: function (e, els) { if (els.length) setFocus(IDX4[els[0].index][0]); } },
      plugins: [valLbl] });
  }
  function drawCurve(R) {
    var dl = R.dl, sty = [
      { w: 2, a: 1, dash: [], r: 2 }, { w: 1.2, a: .35, dash: [], r: 0 }, { w: 1, a: .2, dash: [], r: 0 }, { w: 1.3, a: .9, dash: [5, 3], r: 0, muted: true }];
    var ds = [];
    [3, 2, 1, 0].forEach(function (k) {
      if (!R.days[k]) return;
      var rows = curveRows(R.days[k].curve), st = sty[k];
      ds.push({ label: (k ? 'D−' + k + ' ' : 'D ') + mmdd(dl[k]), data: rows.map(function (r) { return { x: +r.remain_year, y: +r.ytm, lb: r.label }; }),
        borderColor: st.muted ? tok('--wb-muted', st.a) : tok('--wb-series-1', st.a), pointBackgroundColor: tok('--wb-series-1', st.a),
        borderWidth: st.w, borderDash: st.dash, pointRadius: st.r, pointHoverRadius: 4, cubicInterpolationMode: 'monotone', spanGaps: true, fill: false });
    });
    $('ovCurveMeta').textContent = KTB_CAT + ' · ' + curveRows(R.days[0].curve).length + '종목';
    mk('curve', $('ovCurve'), { type: 'line', data: { datasets: ds },
      options: { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'nearest', axis: 'x', intersect: false },
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: function (it) { return '잔존 ' + (it[0] ? it[0].parsed.x.toFixed(2) : '') + '년'; },
          label: function (c) { var p = c.raw || {}; return ' ' + c.dataset.label + ': ' + (+c.parsed.y).toFixed(3) + '% ' + (p.lb || ''); } } } },
        scales: { x: { type: 'linear', title: { display: true, text: '잔존만기 (년)' } }, y: { ticks: { callback: function (v) { return v.toFixed(2) + '%'; } } } } } });
  }
  function drawCurveChg(R) {
    if (!R.days[1]) { $('ovCurveChg').parentElement.innerHTML = '<div class="ov-foot">D−1 커브 없음</div>'; return; }
    var prev = new Map();
    curveRows(R.days[1].curve).forEach(function (r) { if (!/지표|기준금리/.test(r.label || '')) prev.set(r.label, +r.ytm); });
    var pts = [];
    curveRows(R.days[0].curve).forEach(function (r) {
      if (/지표|기준금리/.test(r.label || '') || !prev.has(r.label)) return;
      pts.push({ x: +r.remain_year, y: bpChg(+r.ytm, prev.get(r.label)), lb: r.label });
    });
    STATS.curveChgN = pts.length;
    mk('curveChg', $('ovCurveChg'), { type: 'scatter',
      data: { datasets: [{ data: pts, pointRadius: 2.6, pointHoverRadius: 5,
        pointBackgroundColor: function (c) { return WBChart.alpha(signTok(c.raw && c.raw.y), .85); }, pointBorderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { var p = c.raw; return ' ' + p.lb + ' · 잔존 ' + p.x.toFixed(2) + '년 · ' + fmtBp(p.y) + 'bp'; } } } },
        scales: { x: { type: 'linear', ticks: { maxTicksLimit: 8 } }, y: { ticks: { maxTicksLimit: 4 }, grid: { color: function (c) { return c.tick && c.tick.value === 0 ? WBChart.css('--wb-rule-strong') : WBChart.css('--wb-rule'); } } } } } });
  }
  function setFocus(key) {
    OV.focus = OV.focus === key ? null : key;
    if (OV.charts.bars) OV.charts.bars.update('none');
    Array.prototype.forEach.call(doc.querySelectorAll('#ovS2 .ov-tile[data-key]'), function (t) { t.classList.toggle('is-sel', t.getAttribute('data-key') === OV.focus); });
  }

  // ── ② 최신 금리 변동 타일 ───────────────────────────────────────────
  var GROUPS = [
    ['국고 지표', 'w6', [['y2', '2년'], ['y3', '3년'], ['y5', '5년'], ['y10', '10년'], ['y20', '20년'], ['y30', '30년']]],
    ['국채선물', 'w2', [['f3', '3선'], ['f10', '10선']]],
    ['IRS', 'w4', [['i2', '2년'], ['i3', '3년'], ['i5', '5년'], ['i10', '10년']]],
    ['단기', 'w2', [['cd', 'CD91'], ['base', '기준금리']]]
  ];
  function seriesUpTo(R, getter) {   // D 까지 끝 SPARK_N 관측(날짜 = 지표 관측일 ∪ 그 라벨 관측일 중 ≤ D)
    var D = R.dl[0], dates = new Set();
    Object.keys(R.sm).forEach(function (k) { R.sm[k].forEach(function (v, d) { if (d <= D) dates.add(d); }); });
    var all = Array.from(dates).sort();
    return all.map(getter).filter(function (v) { return v != null; }).slice(-SPARK_N);
  }
  function tileHtml(o) {
    STATS.tiles[o.key] = { close: o.close, d1: fmtBp(o.c1), d3: fmtBp(o.c3) };
    return '<div class="ov-tile" data-key="' + esc(o.key) + '"' + (o.tenor ? ' data-tenor="' + esc(o.tenor) + '" role="button" tabindex="0"' : '') + '>' +
      '<div class="ov-tile-h"><b>' + esc(o.name) + '</b><span class="ov-tile-v">' + esc(o.close) + '</span></div>' +
      '<div class="ov-tile-c ' + clsOf(o.c1) + '">' + esc(fmtBp(o.c1)) + '<small>bp</small></div>' +
      '<div class="ov-tile-s">3일 <span class="' + clsOf(o.c3) + '">' + esc(fmtBp(o.c3)) + '</span>bp</div>' +
      sparkSvg(o.spark) + '</div>';
  }
  function renderS2(R) {
    var dl = R.dl, D = dl[0], D1 = dl[1], D3 = dl[3];
    $('ovS2Meta').textContent = 'D ' + mmdd(D) + ' vs D−1 ' + mmdd(D1) + ' · 3일 = D−3 ' + mmdd(D3) + ' 대비';
    var yTile = function (key, name, grp) {
      var vD = val(R, key, D);
      return tileHtml({ key: key, name: name, tenor: grp === '국고 지표' ? key : null,
        close: vD == null ? '–' : vD.toFixed(3) + '%',
        c1: vD == null ? null : bpChg(vD, val(R, key, D1)), c3: vD == null || !D3 ? null : bpChg(vD, val(R, key, D3)),
        spark: seriesUpTo(R, function (d) { return R.sm[key].has(d) ? R.sm[key].get(d) : null; }) });
    };
    var sTile = function (s) {
      var lv = function (d) { return d ? spreadLv(val(R, s[2], d), val(R, s[3], d)) : null; };
      var a = lv(D), b1 = lv(D1), b3 = lv(D3);
      return tileHtml({ key: s[0], name: s[1], close: a == null ? '–' : a.toFixed(1) + 'bp',
        c1: a != null && b1 != null ? a - b1 : null, c3: a != null && b3 != null ? a - b3 : null,
        spark: seriesUpTo(R, function (d) { return lv(d); }) });
    };
    var h = '<section class="wb-card ov-card"><div class="ov-body"><div class="ov-tgroups">';
    GROUPS.forEach(function (g) {
      h += '<div class="ov-tgroup ' + g[1] + '"><div class="ov-tgroup-h">' + esc(g[0]) + '</div><div class="ov-tiles">' +
        g[2].map(function (t) { return yTile(t[0], t[1], g[0]); }).join('') + '</div></div>';
    });
    h += '<div class="ov-tgroup w4"><div class="ov-tgroup-h">커브 스프레드 (bp)' + help('스프레드 = 긴 쪽 − 짧은 쪽 지표 금리(bp) · 금리 대시보드 커브 스프레드와 같은 산술') + '</div><div class="ov-tiles">' + SPREADS.map(sTile).join('') + '</div></div>';
    h += '</div><div class="ov-foot">큰 숫자 = 1일 변화(D vs D−1) · 작은 숫자 = 3일 변화 · 추이선 = D 까지 ' + SPARK_N + '관측 · 값 없음 = –' + help('금리 대시보드와 같은 산술: 변화 bp = (D 종가 − 비교일 종가) × 100, 소수 1자리, 양수 + · 레벨 % 소수 3자리. 날짜는 마지막 두 점이 아니라 D · D−1(선물 라벨은 오늘 예비호가 행이 있음). 3선·10선 = 국채선물 금리(ktb 라벨 그대로).') + '</div></div></section>';
    $('ovS2').innerHTML = h;
    Array.prototype.forEach.call(doc.querySelectorAll('#ovS2 .ov-tile[data-tenor]'), function (t) {
      var go = function () { var k = t.getAttribute('data-key'); if (IDX4.some(function (x) { return x[0] === k; })) setFocus(k); };
      t.addEventListener('click', go);
      t.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  }

  async function sectionsRates() {
    var R;
    try { R = await loadRatesCore(); }
    catch (e) {
      renderBasis(null, e);
      secErr('ovS1', '지표·커브를 불러오지 못함 — ', emsg(e), '/tools/dashboard/', '금리 대시보드');
      secErr('ovS2', '최신 금리 변동을 불러오지 못함 — ', emsg(e), '/tools/dashboard/', '금리 대시보드');
      STATS.sec.s1 = STATS.sec.s2 = 'err';
      return null;
    }
    OV.R = R;
    renderBasis(R);
    try { renderS1(R); STATS.sec.s1 = 'ok'; } catch (e) { secErr('ovS1', '그리기 실패 — ', emsg(e), '/tools/dashboard/', '금리 대시보드'); STATS.sec.s1 = 'err'; if (window.console) console.warn('ov s1', e); }
    try { renderS2(R); STATS.sec.s2 = 'ok'; } catch (e) { secErr('ovS2', '그리기 실패 — ', emsg(e), '/tools/dashboard/', '금리 대시보드'); STATS.sec.s2 = 'err'; if (window.console) console.warn('ov s2', e); }
    return R;
  }

  // ══ ③ 차익거래 모니터 요약 — /quant-house/arb-monitor 그대로 ═══════════════
  // 합산 포지션 고정 문구(명세 F · 차익거래 모니터와 같은 글)
  var POS_FIXED = '합산 포지션: 2년 매도 = 2년 −10억 / 3선 +6 · 3−2 플래트너 · 2년 매수 = +10억 / −6 · 3−2 스티프너 · 5년 매도 = 5년 −10억 / 3선 +15 · 5−3 스티프너 · 5년 매수 = +10억 / −15 · 5−3 플래트너 · 3년 매도 = 3년 −10억 / 3선 +9 · 벨리 숏. 다 발동하면 2년 매도 + 5년 매수 + 3년 매도가 서고 반대 문턱 둘은 핑퐁 상대.';
  function gaugeHtml(b) {   // 차익거래 모니터 renderBasis 게이지와 같은 규칙(표시 위치만 · 값 그대로)
    var bk = b.book || {};
    var ts = isNum(bk.threshold_sell) ? +bk.threshold_sell : -8, tb = isNum(bk.threshold_buy) ? +bk.threshold_buy : 8;
    var exS = Array.isArray(bk.exit_lines_sell) ? bk.exit_lines_sell : (Array.isArray(bk.exit_lines) ? bk.exit_lines : []);
    var exB = Array.isArray(bk.exit_lines_buy) ? bk.exit_lines_buy : [];
    var sv = function (v) { return (+v > 0 ? '+' : +v < 0 ? MINUS : '') + Math.abs(+v); };
    var R = Math.max(12, Math.ceil(Math.max.apply(null, [Math.abs(+b.U || 0), Math.abs(+b.Ub || 0), Math.abs(ts), Math.abs(tb)].concat(exS.concat(exB).map(function (v) { return Math.abs(+v) || 0; }))) + 2));
    var X = function (v) { return ((+v + R) / (2 * R) * 100).toFixed(2) + '%'; };
    var tick = function (v, c) { return '<span class="ov-gauge-tick ' + (c || '') + '" style="left:' + X(v) + '">' + sv(v) + '</span>'; };
    var line = function (v, c, t) { return '<span class="ov-gauge-line ' + c + '" style="left:' + X(v) + '" title="' + esc(t) + '"></span>'; };
    var ticks = [tick(-R), tick(R), tick(0), tick(ts, 'u'), tick(tb, 'ub')].concat(exS.map(function (v) { return tick(v, 'u'); }), exB.map(function (v) { return tick(v, 'ub'); })).join('');
    var lines = line(0, '', '0') + line(ts, 'th u', '매도 문턱 ' + sv(ts) + ' (U)') + line(tb, 'th ub', '매수 문턱 ' + sv(tb) + ' (Ub)') +
      exS.map(function (v) { return line(v, 'exit u', '매도 반대매매 ' + sv(v) + ' (U)'); }).join('') + exB.map(function (v) { return line(v, 'exit ub', '매수 반대매매 ' + sv(v) + ' (Ub)'); }).join('');
    return '<div class="ov-gauge" id="ovGauge"><div class="ov-gauge-track"></div>' +
      '<div class="ov-gauge-zone sell" style="left:0;width:' + X(ts) + '"></div><div class="ov-gauge-zone buy" style="left:' + X(tb) + ';right:0"></div>' +
      lines + ticks + '<span class="ov-gauge-mk u" style="left:' + X(b.U) + '">U ' + sgn(b.U, 2) + '</span><span class="ov-gauge-mk ub" style="left:' + X(b.Ub) + '">Ub ' + sgn(b.Ub, 2) + '</span></div>' +
      '<div class="ov-foot">점선 = 반대매매 선 · 매도 ' + exS.map(sv).join('/') + ' (U)' + (exB.length ? ' · 매수 ' + exB.map(sv).join('/') + ' (Ub)' : '') + '</div>';
  }
  function arbWarnings(d) {
    var P = d.panels || {}, out = [], m = P.market, h = P.hets_today, b = P.bias;
    var ok = function (p) { return p && p.available !== false; };
    var L = d.latest || {}, now = new Date(Date.now() + 9 * 3600e3), today = now.toISOString().slice(0, 10), dow = now.getUTCDay(), hr = now.getUTCHours();
    if (L.trade_day && L.trade_day < today && dow >= 1 && dow <= 5 && hr >= 9) out.push('<span class="wb-badge wb-badge--warn">갱신 안 됨 · 오늘 빌드 없음</span>');
    if (ok(m)) {
      (m.warnings || []).forEach(function (w) { out.push('<span class="wb-badge wb-badge--warn">' + esc(w) + '</span>'); });
      if (m.funding && m.funding.jump_today) out.push('<span class="wb-badge wb-badge--warn">조달 점프일(손익 아님)</span>');
      var c = m.calendar || {};
      if (c.new_contract_first_day) out.push('<span class="wb-badge wb-badge--warn">새 계약 첫날</span>');
      var sw = Object.keys(c.index_switch_today || {}).filter(function (k) { return c.index_switch_today[k]; });
      if (sw.length) out.push('<span class="wb-badge wb-badge--warn">지표 교체 첫날 · ' + esc(sw.join('·')) + '</span>');
    }
    if (ok(h)) {
      var uc = h.market && h.market.U_check;
      if (isNum(uc) && +uc !== 0) out.push('<span class="wb-badge wb-badge--warn">U_check ≠ 0 (' + raw(uc) + ')</span>');
      (h.consts || []).forEach(function (c) { if ((c['재가격오차_틱'] || []).some(function (x) { return isNum(x) && Math.abs(+x) > 0.3; })) out.push('<span class="wb-badge wb-badge--warn">재가격 오차 &gt; 0.3틱 · ' + esc(c['트리']) + '</span>'); });
    }
    if (ok(b)) Object.keys(b.tenors || {}).forEach(function (t) { var v = b.tenors[t] || {};
      if (v.alert_move) out.push('<span class="wb-badge wb-badge--warn">b 월간 이동 &gt; 1틱 · ' + esc(t) + '</span>');
      if (v.alert_z) out.push('<span class="wb-badge wb-badge--warn">b 전일 z 범위 밖 · ' + esc(t) + '</span>'); });
    ['market', 'hets_today', 'basis', 'bias', 'ledger', 'exposure', 'labels'].forEach(function (p) { var x = P[p]; if (x && x.available === false) out.push('<span class="wb-badge wb-badge--warn">' + esc(p) + ' 미생성</span>'); });
    return out.length ? '<div class="ov-warnbar"><span class="wb-label">경고</span>' + out.join('') + '</div>' : '<div class="ov-warnbar"><span class="wb-badge wb-badge--open">경고 없음</span></div>';
  }
  async function sectionArb() {
    var d;
    try { d = await apiGet('/quant-house/arb-monitor'); }
    catch (e) { secErr('ovS3', '모니터를 불러오지 못함 — ', emsg(e), '/tools/arb-monitor/', '차익거래 모니터'); STATS.sec.s3 = 'err'; return; }
    if (!d || d.available === false) { secErr('ovS3', '모니터 미생성 — ', (d && d.note) || 'monitor/latest.json 없음', '/tools/arb-monitor/', '차익거래 모니터'); STATS.sec.s3 = 'err'; return; }
    try {
      var P = d.panels || {}, L = d.latest || {};
      var ok = function (p) { return p && p.available !== false; };
      $('ovS3Meta').textContent = '기준 ' + (L.asof || '—') + '(전영업일) · 체결일 ' + (L.trade_day || '—') + (L.built_at ? ' · 빌드 ' + L.built_at : '');
      var h = P.hets_today, b = P.basis, lg = P.ledger, ex = P.exposure, lb = P.labels;
      // 오늘 판정
      var judge;
      if (ok(h)) {
        var J = h.judge || {}, F = h.formulas || [];
        var fOf = function (t) { for (var i = 0; i < F.length; i++) if (F[i]['트리'] === t) return F[i]; return {}; };
        var keys = Object.keys(J), on = keys.filter(function (k) { return (J[k] || [])[0] === '진입'; }).length;
        judge = '<section class="wb-card ov-card"><div class="wb-card-head"><span class="wb-card-title">오늘 판정' + help('hets_today.judge 그대로 · 근거 = 각 행의 ? · 3년 매수 = 운용 제외(고정). ' + POS_FIXED) + '</span>' +
          '<span class="wb-badge ov-jbadge on">진입 ' + on + ' / ' + keys.length + '</span><span class="wb-card-meta">기준 ' + esc(h.last || L.asof || '—') + '</span></div>' +
          '<div class="ov-tablewrap"><table class="wb-table ov-judge" id="ovJudge"><thead><tr><th>트리</th><th>판정</th><th>주문(진입)</th></tr></thead><tbody>' +
          keys.map(function (t) { var v = J[t] || [], isOn = v[0] === '진입';
            return '<tr><td class="wb-strong">' + esc(t) + help(v[1] || '') + '</td><td><span class="wb-badge ov-jbadge ' + (isOn ? 'on' : 'off') + '">' + esc(v[0] || '—') + '</span></td><td class="wb-muted">' + esc(fOf(t)['주문'] || '') + '</td></tr>'; }).join('') +
          '<tr><td>3년 매수</td><td><span class="wb-badge">제외</span></td><td class="wb-muted">운용 제외(고정)</td></tr></tbody></table></div></section>';
      } else judge = '<section class="wb-card ov-card"><div class="wb-card-head"><span class="wb-card-title">오늘 판정</span></div><div class="ov-body"><div class="ov-err">판정 데이터 없음' + help((h && h.note) || '') + '</div></div></section>';
      // 저평 계기판
      var basis;
      if (ok(b)) {
        var bk = b.book || {};
        var kv = function (lbl, v, sub) { return '<dl class="ov-kv"><dt>' + esc(lbl) + '</dt><dd>' + v + (sub ? '<small>' + sub + '</small>' : '') + '</dd></dl>'; };
        basis = '<section class="wb-card ov-card"><div class="wb-card-head"><span class="wb-card-title">저평 계기판 U · Ub' + help(bk.note || '1권 북 상태') + '</span><span class="wb-card-meta">' + esc((b.contract || '') + ' · 만기 ' + (b.expiry || '—') + ' · 롤 ' + (bk.roll_next || '—')) + '</span></div>' +
          '<div class="ov-body"><div class="ov-arb-kpis" id="ovArbKpis">' + kv('U · 매도 좌표', sgn(b.U, 2), '전') + kv('Ub · 매수 좌표', sgn(b.Ub, 2), '전') +
          kv('매도 문턱까지', fix(bk.dist_to_sell, 2), '전') + kv('매수 문턱까지', fix(bk.dist_to_buy, 2), '전') + kv('만기까지', fix(bk.weeks_to_expiry, 1), '주') + '</div>' +
          gaugeHtml(b) + '</div></section>';
      } else basis = '<section class="wb-card ov-card"><div class="wb-card-head"><span class="wb-card-title">저평 계기판</span></div><div class="ov-body"><div class="ov-err">저평 데이터 없음' + help((b && b.note) || '') + '</div></div></section>';
      // 라이브 vs 백테스트 · 노출(핵심 값 그대로)
      var lines = '';
      if (ok(lg)) lines += '<div class="ov-line"><span class="ov-line-k">라이브 vs 백테스트</span><span id="ovLedger">체결 <b>' + raw(lg.n_fills) + '</b>건' +
        (isNum(lg.slip_mean) ? ' · 평균 슬리피지 <b>' + raw(lg.slip_mean) + '</b>틱' : '') + '</span>' + help((lg.note || '') + ' 단위: 1 lot(지표 10억) 당 bp · 비용 0.3 포함 · 트리별 누적 = 전체 보기') + '</div>';
      if (ok(ex)) {
        var ag = ex.aggregate || {}, stt = ex.state || {}, rp = stt.realized_prev || {}, pre = stt.pre || {};
        var chip = function (t) { return '<span class="wb-badge">' + esc(t) + '</span>'; };
        lines += '<div class="ov-line"><span class="ov-line-k">노출 (만원/bp)</span><span id="ovExpo">DV01 <b>' + raw(ag.dv01_man) + '</b> · 3−2 <b>' + raw(ag.c32_man) + '</b> · 5−3 <b>' + raw(ag.c53_man) + '</b></span>' +
          help('exposure.aggregate 그대로 · + = 스팁에 이익. 뷰로 트리를 켜고 끄지 않는다. 100% 맞혀도 손익은 같고 거래만 27% 준다(손익분기 적중률 99%). 커브·저평 뷰는 커브를 직접.') + '</div>' +
          '<div class="ov-line"><span class="ov-line-k">상태</span><span>' + Object.keys(rp).map(function (k) { return chip('전일 ' + k + ' ' + rp[k]); }).join('') + Object.keys(pre).map(function (k) { return chip(k + ' ' + pre[k]); }).join('') + '</span></div>';
      }
      var hon = ok(lb) && Array.isArray(lb.honesty) ? '<ul class="ov-honesty" id="ovHonesty">' + lb.honesty.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') +
        (lb.n_effective != null ? '<li>정직-N ' + raw(lb.n_effective) + '</li>' : '') + '</ul>' : '';
      $('ovS3').innerHTML = arbWarnings(d) + '<div class="ov-grid2 even">' + judge + basis + '</div>' +
        '<section class="wb-card ov-card" style="margin-top:var(--wb-gap)"><div class="ov-body">' + (lines || '<div class="ov-foot">라이브·노출 데이터 없음</div>') + hon + '</div></section>';
      STATS.sec.s3 = 'ok';
    } catch (e) { secErr('ovS3', '그리기 실패 — ', emsg(e), '/tools/arb-monitor/', '차익거래 모니터'); STATS.sec.s3 = 'err'; if (window.console) console.warn('ov s3', e); }
  }

  // ══ ④ 주간 리뷰 요약 — snapshot plain 그대로(WBRevPlain.renderMini) ═══════
  async function sectionReview() {
    var host = $('revPlain'), snap, sb;
    try { snap = await apiGet('/quant-house/market-review'); }
    catch (e) { secErr('revPlain', '주간 리뷰를 불러오지 못함 — ', emsg(e), '/tools/quant-house/#review', '주간 리뷰'); STATS.sec.s4 = 'err'; return; }
    try { sb = await apiGet('/quant-house/review-scoreboard'); } catch (e) { sb = { available: false, note: emsg(e) }; }
    if (!snap || snap.available === false) { secErr('revPlain', '리뷰 스냅샷 없음 — ', (snap && snap.note) || '', '/tools/quant-house/#review', '주간 리뷰'); STATS.sec.s4 = 'err'; return; }
    var p = snap.plain;
    $('ovS4Meta').textContent = '기준 ' + (snap.asof || '—') + (p && p.window_label ? ' · ' + p.window_label : '');
    try {
      var okMini = window.WBRevPlain && WBRevPlain.renderMini && WBRevPlain.renderMini(host, snap, sb);
      if (okMini) { STATS.sec.s4 = 'ok'; return; }
      // 폴백: 일반 보기 재료 없음 → 고급 핵심 값(커브 구간 · 스냅샷 curve_moves 그대로) + 바로가기
      var cm = snap.curve_moves || {}, keys = Object.keys(cm).filter(function (k) { return cm[k] && typeof cm[k] === 'object'; });
      host.innerHTML = '<section class="wb-card ov-card"><div class="wb-card-head"><span class="wb-card-title">커브 구간 주간 변화' + help('이 스냅샷에는 일반 보기 재료(plain)가 아직 없어 고급 보기의 핵심 값(curve_moves 그대로)만 보여 줍니다. 다음 자동 갱신부터 결론 3줄과 그림이 이 자리에 나옵니다.') + '</span>' +
        '<span class="wb-card-meta">' + esc((snap.yield_curve || {}).week_ago_date || cm.week_ago_date || '') + ' → ' + esc(snap.asof || '') + '</span><a class="ov-more" href="/tools/quant-house/#review/adv">고급 보기 →</a></div>' +
        '<div class="ov-tablewrap"><table class="wb-table" id="ovRevFallback"><thead><tr><th>구간</th><th class="num">현재 bp</th><th class="num">1w전</th><th class="num">Δ bp</th></tr></thead><tbody>' +
        keys.map(function (k) { var c = cm[k]; return '<tr><td class="wb-strong">' + esc(k) + '</td><td class="num">' + advFmt(c.now) + '</td><td class="num">' + advFmt(c.wk_ago) + '</td><td class="num ' + clsOf(num(c.delta_bp)) + '">' + advFmt(c.delta_bp) + '</td></tr>'; }).join('') +
        '</tbody></table></div></section>';
      STATS.sec.s4 = 'fallback';
    } catch (e) { secErr('revPlain', '그리기 실패 — ', emsg(e), '/tools/quant-house/#review', '주간 리뷰'); STATS.sec.s4 = 'err'; if (window.console) console.warn('ov s4', e); }
  }

  // ══ ⑤ 금리 대시보드 핵심 — 수익률 곡선(최신·1M·3M 전) + 이격 보드 상위 ═══════
  function offsetDate(days) { var d = new Date(); d.setDate(d.getDate() - days); return d.toISOString().slice(0, 10); }   // 금리 대시보드와 같은 비교일 규칙
  var CB_TOP = 8;
  async function sectionDash(ratesP) {
    var b;
    try { b = await board(); }
    catch (e) { secErr('ovS5', '이격 보드를 불러오지 못함 — ', emsg(e), '/tools/dashboard/', '금리 대시보드'); STATS.sec.s5 = 'err'; return; }
    try {
      var R = await ratesP;   // ①과 같은 확정 D 의 커브 재사용(없으면 보드 기준일로)
      var latest = R ? R.dl[0] : (b.as_of ? String(b.as_of).slice(0, 10) : null);
      var cur = R ? Promise.resolve(R.days[0].curve) : (latest ? getCurve(latest) : Promise.reject(new Error('기준일 없음')));
      var res = await Promise.all([cur.catch(function () { return null; }), getCurve(offsetDate(30)).catch(function () { return null; }), getCurve(offsetDate(91)).catch(function () { return null; })]);
      var w = (b.windows && (b.windows[String(b.default_window || 126)] || b.windows['126'])) || b;
      var rows = (w.ranked || []).slice(0, CB_TOP), wl = (w.window_label || '6개월');
      $('ovS5Meta').textContent = '보드 기준 ' + (b.as_of || '—') + ' · ' + wl + ' 롤링 z';
      var spark = function (r) {
        var v = ((r.series && r.series.values) || []).map(num).filter(function (x) { return x != null; });
        if (v.length < 2) return '';
        var W = 96, H = 22, mn = Math.min.apply(null, v), mx = Math.max.apply(null, v), n = v.length - 1;
        var X = function (i) { return (i / n) * (W - 4) + 2; }, Y = function (y) { return mx === mn ? H / 2 : H - 3 - ((y - mn) / (mx - mn)) * (H - 6); };
        var col = r.z > 0 ? 'var(--wb-up)' : r.z < 0 ? 'var(--wb-down)' : 'var(--wb-muted)';
        return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" style="color:' + col + '" aria-hidden="true"><path d="' + v.map(function (y, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(y).toFixed(1); }).join(' ') + '"/><circle cx="' + X(n).toFixed(1) + '" cy="' + Y(v[n]).toFixed(1) + '" r="2"/></svg>';
      };
      var table = '<div class="ov-tablewrap"><table class="wb-table ov-cb" id="ovCb"><thead><tr><th>구성</th><th class="num">현재(bp)</th><th class="num">z (σ)</th><th class="num">백분위</th><th>' + esc(wl) + ' 추이</th></tr></thead><tbody>' +
        rows.map(function (r) { var z = num(r.z);
          return '<tr class="' + (z != null && Math.abs(z) >= 2 ? 'strong' : '') + '"><td><span class="wb-badge">' + (r.kind === 'fly' ? '플라이' : '슬로프') + '</span> ' + esc(r.name || r.label || r.id) + '</td>' +
            '<td class="num">' + (r.current_bp == null ? '—' : (+r.current_bp).toFixed(1)) + '</td>' +
            '<td class="num" style="color:' + (z == null ? 'var(--wb-muted)' : z > 0 ? 'var(--wb-up)' : z < 0 ? 'var(--wb-down)' : 'var(--wb-muted)') + '">' + (z == null ? '—' : (z > 0 ? '+' : '') + z.toFixed(2)) + '</td>' +
            '<td class="num">' + (r.pctile == null ? '—' : Math.round(r.pctile) + '%') + '</td><td>' + spark(r) + '</td></tr>'; }).join('') + '</tbody></table></div>';
      var names = ['최신 ' + (latest || ''), '1M전', '3M전'], toks = ['--wb-series-1', '--wb-series-6', '--wb-series-4'], dash = [[], [6, 3], [3, 3]];
      $('ovS5').innerHTML = '<div class="ov-grid2">' +
        '<section class="wb-card ov-card"><div class="wb-card-head"><span class="wb-card-title">수익률 곡선' + help('금리 대시보드 수익률 곡선(국고채)과 같은 소스·같은 점 규칙 · 최신 = 확정 종가일 D · 1M·3M 전 = 오늘에서 30·91일 전 날짜(대시보드 비교 칩과 같은 규칙 · 그 날짜 이하 최근 영업일)') + '</span><span class="wb-card-meta">' + esc(res.map(function (x, i) { return x && x.date ? names[i].split(' ')[0] + ' ' + x.date : ''; }).filter(Boolean).join(' · ')) + '</span></div>' +
          '<div class="ov-body"><div class="ov-chart ov-chart--c5"><canvas id="ovC5" aria-label="수익률 곡선"></canvas></div></div></section>' +
        '<section class="wb-card ov-card"><div class="wb-card-head"><span class="wb-card-title">커브·플라이 이격 상위 ' + rows.length + help((b.note || '') + ' · |z| 큰 순(보드가 정렬해 보낸 순서 그대로) · 굵게 = |z| ≥ 2') + '</span><span class="wb-card-meta">' + esc(wl) + '</span></div>' + table + '</section>' +
        '</div>';
      var ds = [];
      res.forEach(function (x, i) { var rr = curveRows(x); if (!rr.length) return;
        ds.push({ label: names[i] + (x.date && i ? ' ' + x.date : ''), data: rr.map(function (r) { return { x: +r.remain_year, y: +r.ytm }; }),
          borderColor: tok(toks[i]), pointBackgroundColor: tok(toks[i]), borderDash: dash[i], borderWidth: i ? 1.2 : 2, pointRadius: i ? 0 : 2, cubicInterpolationMode: 'monotone', spanGaps: true, fill: false }); });
      mk('c5', $('ovC5'), { type: 'line', data: { datasets: ds },
        options: { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'nearest', axis: 'x', intersect: false },
          plugins: { legend: { display: true, align: 'end' }, tooltip: { callbacks: { label: function (c) { return ' ' + c.dataset.label + ': ' + (+c.parsed.y).toFixed(3) + '%'; } } } },
          scales: { x: { type: 'linear', title: { display: true, text: '잔존만기 (년)' } }, y: { ticks: { callback: function (v) { return v.toFixed(2) + '%'; } } } } } });
      STATS.sec.s5 = 'ok';
    } catch (e) { secErr('ovS5', '그리기 실패 — ', emsg(e), '/tools/dashboard/', '금리 대시보드'); STATS.sec.s5 = 'err'; if (window.console) console.warn('ov s5', e); }
  }

  // ── 시작: 섹션별 독립 로딩 ──────────────────────────────────────────────
  function init() {
    var ratesP = sectionsRates();
    STATS.ready = Promise.allSettled([ratesP, sectionArb(), sectionReview(), sectionDash(ratesP)]).then(function () { STATS.done = true; });
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
  window.WBOverview = { stats: STATS };
})();
