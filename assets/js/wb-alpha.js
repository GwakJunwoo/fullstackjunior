/* ═══════════════════════════════════════════════════════════════════════════
   wb-alpha.js — 알파 전략 탭(2026-10-22 사용자 지시)
   ───────────────────────────────────────────────────────────────────────────
   대상 셋(등록부 id): of · cta_delta · uni_irs_v3(variant v3.1_mirror · 화면 이름 UNI IRS v3.1).
   블록 넷(전략마다): ① 백테스트 ② 기초 통계량 ③ 보유 포지션 ④ 오늘 시그널(위 진입 · 아래 청산). 블록마다 독립 로딩·실패 격리.
   ■ 데이터 = 기존 읽기 전용 API 그대로(새 라우트 없음):
       /quant-house/strategy/{id}          → registry.json 항목 그대로(상태 칩 · 설명 토글 · DSR)
       /quant-house/backtest/{id}          → 04_strategies/{id}/backtest_artifact.json 그대로(곡선 · 통계)
       /quant-house/portfolio-forward/{id} → 05_registry/research/{id}_forward.json 그대로(보유 · 오늘 신호)
   ■ 숫자 = 엔진·등록부 값 그대로(재계산 0). 웹이 하는 일 = 고르기·표 배치·표기(− 기호 · 승률 % 자리 이동)뿐.
     세 전략 스키마가 달라 '표시 어댑터'(KPI 필드 매핑 · 보유/신호 방언)로 흡수 — 매핑은 아래 KPI_MAP 주석.
   ■ 글자 원칙(사용자 "텍스트 다 토글"): 설명·규칙·정직 서술 = '설명 보기' 접기 · ? 툴팁.
     늘 보이는 글자 = 숫자 · 표 · 짧은 제목 · 상태 칩(페이퍼 · deployed/proposed · tier · 판정 — FAIL 도 그대로).
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var doc = document;
  var $ = function (id) { return doc.getElementById(id); };
  var MINUS = '−';
  var STRATS = [
    { id: 'of', label: 'OF' },
    { id: 'cta_delta', label: 'CTA 델타' },
    { id: 'uni_irs_v3', label: 'UNI IRS v3.1' }
  ];
  var STATS = window.WB_AL_STATS = { cur: null, sec: {}, chips: [], kpi: {}, bt: null, pos: null, sig: null, done: false };
  var AL = { seq: 0, charts: {}, cache: {} };

  // ── 표기 helper(값 무변형) ─────────────────────────────────────────
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function help(t) { return (window.WBShell && t) ? WBShell.helpBtn(String(t)) : ''; }
  function raw(v) { if (!isNum(v)) return (v == null || v === '') ? '–' : esc(v); return (v < 0 ? MINUS : '') + String(Math.abs(v)); }   // 엔진 숫자 그대로(− 기호만)
  function rawD(v, minDec) {   // 엔진 숫자 그대로 + 소수 자리 '채우기'만(−202.0 이 JS 에서 −202 로 보이는 것 방지 · 반올림 없음)
    if (!isNum(v)) return raw(v);
    var dec = (String(Math.abs(v)).split('.')[1] || '').length;
    return (v < 0 ? MINUS : '') + (dec >= minDec ? String(Math.abs(v)) : Math.abs(v).toFixed(minDec));
  }
  function pct(v) {   // 비율 → % : 자리 이동만(0.7828 → 78.28%) · 엔진 소수 자리 유지
    if (!isNum(v)) return '–';
    var dec = (String(v).split('.')[1] || '').length;
    return (v * 100).toFixed(Math.max(0, dec - 2)) + '%';
  }
  function cls(v) { return !isNum(v) ? '' : v > 0 ? 'wb-up' : v < 0 ? 'wb-down' : ''; }
  function get(o, path) { return String(path).split('.').reduce(function (a, k) { return a == null ? undefined : a[k]; }, o); }
  function emsg(e) { return (e && (e.message || e.detail)) ? String(e.message || e.detail) : String(e); }
  function errBox(title, msg) { return '<div class="al-body"><div class="al-err"><span class="wb-error">' + esc(title) + '</span>' + esc(msg || '') + '</div></div>'; }
  function cardHead(title, tip, meta) {
    return '<div class="wb-card-head"><span class="wb-card-title">' + esc(title) + help(tip) + '</span>' + (meta ? '<span class="wb-card-meta">' + meta + '</span>' : '') + '</div>';
  }
  function mk(key, canvas, cfg) {
    if (!canvas || !window.Chart) return null;
    var prev = AL.charts[key] || Chart.getChart(canvas);
    if (prev) { try { prev.destroy(); } catch (e) { /* noop */ } }
    AL.charts[key] = new Chart(canvas, cfg);
    return AL.charts[key];
  }
  function destroyAll() { Object.keys(AL.charts).forEach(function (k) { try { AL.charts[k].destroy(); } catch (e) { /* noop */ } delete AL.charts[k]; }); }

  // ── 데이터(전략별 1회 · 실패는 캐시 안 함 → 다시 누르면 재시도) ─────────────
  function load(id, kind) {
    var c = AL.cache[id] || (AL.cache[id] = {});
    if (c[kind]) return c[kind];
    var url = kind === 'reg' ? '/quant-house/strategy/' : kind === 'art' ? '/quant-house/backtest/' : '/quant-house/portfolio-forward/';
    c[kind] = apiGet(url + encodeURIComponent(id)).catch(function (e) { delete c[kind]; throw e; });
    return c[kind];
  }

  // ══ DSR 기준(게이트 시점 · N) — 엔진·등록부가 DSR 값과 짝으로 기록한 필드만(추정 0 · 2026-10-22 정직 표기) ══
  //   ① registry tier_eval.dsr_gate_eval {dsr, n_effective, at}                                  (uni_irs_v3)
  //   ② artifact portfolio.dsr_hac.dsr {dsr_programN, n_trials_programN} + gate_evidence.gate_run_at (cta_delta)
  //   짝의 dsr 이 tier_eval.dsr 와 같을 때만 붙임(다른 시점의 N 을 섞지 않음) · 없으면 표기 없음(of)
  function dsrBasis(reg, art) {
    var te = (reg && reg.tier_eval) || {};
    if (!isNum(te.dsr)) return null;
    var ge = te.dsr_gate_eval;
    if (ge && isNum(ge.dsr) && +ge.dsr === +te.dsr && (ge.at || isNum(ge.n_effective)))
      return { at: ge.at || null, n: isNum(ge.n_effective) ? +ge.n_effective : null, src: 'registry tier_eval.dsr_gate_eval' };
    var ad = get(art, 'portfolio.dsr_hac.dsr');
    if (ad && isNum(ad.dsr_programN) && +ad.dsr_programN === +te.dsr && (isNum(ad.n_trials_programN) || get(art, 'gate_evidence.gate_run_at')))
      return { at: get(art, 'gate_evidence.gate_run_at') || null, n: isNum(ad.n_trials_programN) ? +ad.n_trials_programN : null, src: 'artifact portfolio.dsr_hac.dsr.n_trials_programN · gate_evidence.gate_run_at' };
    return null;
  }
  function basisTxt(b) {   // '게이트 07-14 · N 9,578' — 날짜 = 엔진 문자열 월-일 · N = 천 단위 쉼표(표기만)
    if (!b) return '';
    return [b.at ? '게이트 ' + String(b.at).slice(5, 10) : '', b.n != null ? 'N ' + b.n.toLocaleString('en-US') : ''].filter(Boolean).join(' · ');
  }

  // ══ 상태 칩 + 설명 토글(registry · forward) ═════════════════════════════
  // 칩 = 늘 보임: 페이퍼(실탄 아님) · status · tier · 판정(gate_verdict 그대로 — FAIL 도 그대로 · 없음 = –)
  function chipsOf(reg, fwd, art) {
    var out = [], bt = basisTxt(dsrBasis(reg, art)), bsuf = bt ? ' · 기준 = ' + bt + '(재게이트 전 값)' : '';
    var paper = reg.capital_state === 'paper' || (fwd && fwd.live_capital === false);
    out.push(paper ? { t: '페이퍼(실탄 아님)', c: 'wb-badge--warn', k: 'paper',
      tip: reg.capital_state === 'paper' ? 'registry capital_state = paper' : 'registry capital_state 미기재 · forward live_capital = false(' + ((fwd && fwd.sizing && fwd.sizing.policy) || '') + ')' }
      : { t: '자본 ' + (reg.capital_state || '–'), c: '', k: 'paper', tip: 'registry capital_state' });
    out.push({ t: reg.status || '–', c: reg.status === 'proposed' ? 'wb-badge--warn' : '', k: 'status',
      tip: reg.status === 'proposed' ? (reg.web_visible_note || 'proposed — 배포 아님') : (get(reg, 'tier_eval.deploy_basis') ? 'deploy_basis = ' + get(reg, 'tier_eval.deploy_basis') : 'registry status') });
    out.push({ t: reg.tier || '–', c: '', k: 'tier', tip: (get(reg, 'tier_eval.reason') || 'registry tier') + bsuf });
    var gv = reg.gate_verdict;
    out.push({ t: '판정 ' + (gv || '–'), c: gv === 'FAIL' ? 'wb-badge--up' : gv === 'WARN' ? 'wb-badge--warn' : '', k: 'verdict',
      tip: gv ? ('registry gate_verdict = ' + gv + (get(reg, 'adoption_basis.reason') ? ' · ' + get(reg, 'adoption_basis.reason') : ''))
        : ('registry gate_verdict 미기재(최종 판정 없음)' + (get(reg, 'tier_eval.gate_verdict_train') ? ' · 기계 TRAIN 게이트 = ' + get(reg, 'tier_eval.gate_verdict_train') + '(최종 판정 아님)' : '')) + bsuf });
    return out;
  }
  var TEXTS = [   // [표시 이름, 출처] — 엔진·등록부 원문 그대로(접기 안)
    ['한 줄', 'reg', 'tagline'], ['개념', 'reg', 'concept'], ['엣지', 'reg', 'edge'], ['구조', 'reg', 'mechanics'],
    ['진입', 'reg', 'execution.entry'], ['청산', 'reg', 'execution.exit'], ['규율', 'reg', 'execution.discipline'], ['방법', 'reg', 'execution.method'],
    ['티어 근거', 'reg', 'tier_eval.reason'], ['주의', 'reg', 'tier_eval.caveat'], ['사이징', 'reg', 'tier_eval.sizing_note'],
    ['알려진 문제', 'reg', 'known_problems'], ['비용 취약', 'reg', 'cost_vulnerability'], ['채택 근거', 'reg', 'adoption_basis'],
    ['공존 정책', 'reg', 'coexist_policy'], ['게시 조건', 'reg', 'web_visible_note'], ['등록 노트', 'reg', 'notes'],
    ['forward 고지', 'fwd', 'disclaimer'], ['forward 정직', 'fwd', 'honesty.note'], ['forward 규약', 'fwd', 'pit.convention']
  ];
  function textOf(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) return v.map(function (x) { return typeof x === 'object' && x ? [x.sev, x.id, x.detail].filter(Boolean).join(' · ') : String(x); }).join('\n');
    if (typeof v === 'object') return Object.keys(v).map(function (k) { var x = v[k]; return k + ': ' + (typeof x === 'object' && x ? JSON.stringify(x) : String(x)); }).join('\n');
    return String(v);
  }
  function renderHead(id, reg, fwd, art) {
    var s = STRATS.filter(function (x) { return x.id === id; })[0];
    var chips = chipsOf(reg, fwd, art);
    STATS.chips = chips.map(function (c) { return c.t; });
    $('alStrat').innerHTML = '<span class="al-strat-name">' + esc(s.label) + '</span>' +
      '<span class="al-strat-id">' + esc(reg.name || id) + (reg.variant ? ' · ' + esc(reg.variant) : '') + (reg.version ? ' · ' + esc(reg.version) : '') + '</span>' +
      '<span class="al-chips" id="alChips">' + chips.map(function (c) { return '<span class="wb-badge ' + c.c + '" data-k="' + c.k + '">' + esc(c.t) + '</span>'; }).join('') +
      help(chips.map(function (c) { return c.t + ' — ' + c.tip; }).join('\n')) + '</span>';
    var rows = TEXTS.map(function (t) { var v = textOf(get(t[1] === 'reg' ? reg : (fwd || {}), t[2])); return v ? '<dt>' + esc(t[0]) + '</dt><dd>' + esc(v) + '</dd>' : ''; }).join('');
    $('alMore').innerHTML = rows ? '<details class="al-more" id="alMoreBox"><summary>설명 보기</summary><div class="al-more-body"><dl>' + rows + '</dl></div></details>' : '';
  }

  // ══ ① 백테스트 — 누적 손익 곡선(엔진 산출 그대로) ════════════════════════
  // 곡선: portfolio.daily_nav(일별 MtM 정본 · cta_delta · uni_irs_v3) 있으면 그것 · 없으면 equity(of = 청산일 누적).
  // 낙폭: 곡선과 같은 날짜축의 엔진 drawdown 이 있을 때만(of · cta_delta). uni_irs_v3 = MtM 낙폭 시계열 미산출 → 생략.
  // forward 구간: 엔진이 일별 누적 손익 시계열을 내지 않음 → 그리지 않음(웹 합산 = 새 계산이라 안 함).
  function curveOf(art) {
    var dn = get(art, 'portfolio.daily_nav');
    if (Array.isArray(dn) && dn.length) return { pts: dn, basis: '일별 MtM', src: 'portfolio.daily_nav' };
    if (Array.isArray(art.equity) && art.equity.length) return { pts: art.equity, basis: '청산일 누적', src: 'equity' };
    return null;
  }
  function ddOf(art, cv) {
    var dd = art.drawdown;
    if (!Array.isArray(dd) || dd.length !== cv.pts.length) return null;
    if (dd[0].d !== cv.pts[0].d || dd[dd.length - 1].d !== cv.pts[cv.pts.length - 1].d) return null;
    return dd;
  }
  function renderBt(id, art, fwd) {
    var host = $('alBt');
    if (!art || art.has_artifact === false) {
      host.innerHTML = cardHead('백테스트', '') + errBox('백테스트 아티팩트 없음 — ', (art && art.note) || '');
      STATS.sec.bt = 'none'; return;
    }
    var cv = curveOf(art);
    if (!cv) { host.innerHTML = cardHead('백테스트', '') + errBox('곡선 데이터 없음 — ', 'artifact 에 daily_nav · equity 둘 다 없음'); STATS.sec.bt = 'none'; return; }
    var dd = ddOf(art, cv);
    var first = cv.pts[0].d, last = cv.pts[cv.pts.length - 1].d;
    var tip = '누적 손익(bp) = artifact ' + cv.src + ' 그대로(' + cv.basis + ')' +
      (cv.src === 'equity' ? ' — 청산일에 실현 손익을 더한 곡선(보유 중 평가손익 미반영 · 일별 MtM 아님)' : ' — 일별 시가평가 누적(엔진 canonical)') +
      '. 낙폭 = ' + (dd ? 'artifact drawdown 그대로(같은 날짜축)' : '같은 기준의 엔진 낙폭 시계열 없음 → 생략(MDD 숫자는 기초 통계량)') +
      '. forward 이후 구간 = 엔진이 일별 누적 손익 시계열을 내지 않아 곡선에 잇지 않음(웹 합산 안 함) — 원장 현황은 보유 포지션 · 오늘 신호 블록' +
      (get(fwd, 'ledger.inception') ? ' · 원장 시작 ' + get(fwd, 'ledger.inception') : '') + '.' +
      (get(art, 'stats.metric') ? ' 단위: ' + get(art, 'stats.metric') + '.' : '') + (get(art, 'stats.cost_model') ? ' 비용: ' + get(art, 'stats.cost_model') + '.' : '') +
      (get(art, 'stats.note') ? ' ' + get(art, 'stats.note') : '') +
      (get(art, 'perf_extension.data_end') ? ' 성과 연장(perf_extension): 데이터 끝 ' + get(art, 'perf_extension.previous_data_end') + ' → ' + get(art, 'perf_extension.data_end') +
        ' (' + (get(art, 'perf_extension.extended_at') || '') + ') — ' + (get(art, 'perf_extension.pit_unchanged') || '') : '') +
      (get(art, 'regen_drift') ? ' regen_drift: drift ' + get(art, 'regen_drift.drift') + ' (경계 ' + get(art, 'regen_drift.boundary_entry') + ' · 과거 제거 ' + get(art, 'regen_drift.past_removed_n') + ' · 추가 ' + get(art, 'regen_drift.past_added_n') +
        (get(art, 'regen_drift.matches_g7_removal') != null ? ' · G7 관통 제거와 일치 ' + get(art, 'regen_drift.matches_g7_removal') : '') + ')' : '');
    host.innerHTML = cardHead('백테스트', tip, esc(first) + ' → ' + esc(last) + ' · ' + esc(cv.basis) + ' · bp') +
      '<div class="al-body"><div class="al-chart"><canvas id="alBtC" aria-label="누적 손익"></canvas></div>' +
      (dd ? '<div class="al-chart al-chart--dd"><canvas id="alDdC" aria-label="낙폭"></canvas></div>' : '') + '</div>';
    var labels = cv.pts.map(function (p) { return p.d; });
    var ticks = { maxTicksLimit: window.innerWidth < 720 ? 4 : 8, autoSkip: true, maxRotation: 0, callback: function (v) { var s = this.getLabelForValue(v); return s ? s.slice(0, 7) : s; } };
    mk('bt', $('alBtC'), { type: 'line',
      data: { labels: labels, datasets: [{ label: '누적 손익', data: cv.pts.map(function (p) { return p.v; }), borderColor: WBChart.tok('--wb-series-1'),
        backgroundColor: WBChart.tok('--wb-series-1', .08), fill: 'origin', pointRadius: 0, borderWidth: 1.5, tension: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return ' 누적 ' + (+c.parsed.y).toFixed(1) + 'bp'; } } } },
        scales: { x: { ticks: ticks, grid: { display: false } }, y: { ticks: { maxTicksLimit: 6 }, title: { display: true, text: 'bp' } } } } });
    if (dd) mk('dd', $('alDdC'), { type: 'line',
      data: { labels: labels, datasets: [{ label: '낙폭', data: dd.map(function (p) { return p.v; }), borderColor: WBChart.tok('--wb-down'),
        backgroundColor: WBChart.tok('--wb-down', .18), fill: 'origin', pointRadius: 0, borderWidth: 1, tension: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return ' 낙폭 ' + (+c.parsed.y).toFixed(1) + 'bp'; } } } },
        scales: { x: { display: false }, y: { ticks: { maxTicksLimit: 2 }, title: { display: true, text: '낙폭' } } } } });
    STATS.bt = { n: cv.pts.length, src: cv.src, last: cv.pts[cv.pts.length - 1].v, dd: dd ? dd.length : 0, first: first, lastD: last };
    STATS.sec.bt = 'ok';
  }

  // ══ ② 기초 통계량 — KPI_MAP(표시 어댑터 · 엔진 필드 그대로) ═══════════════
  //   연 손익  = artifact stats.bp_per_year                      (세 전략 공통)
  //   누적      = artifact stats.total_pnl_bp                     (공통)
  //   Sharpe    = 일별 MtM 있으면 portfolio.dsr_hac.hac.sharpe_ann(일별 연환산 · cta_delta · uni_irs_v3)
  //               없으면 stats.sharpe_per_trade(거래당 · of) — of 의 stats.sharpe_annualized 는 엔진이 '중첩보유 무보정'으로
  //               표기한 값이라 헤드라인에 쓰지 않고 ? 에만(과대 표시 방지)
  //   MDD       = stats.mdd_daily_mtm_bp(일별 MtM 정본 · uni_irs_v3) → 없으면 stats.max_drawdown_bp(of = 청산 누적 · cta_delta = 일별 MtM)
  //   거래 수   = stats.n_trades (track=delta = 에피소드)
  //   승률      = stats.hit_rate (% 자리 이동만)
  //   평균 보유 = stats.mean_hold + stats.hold_unit (cta_delta = 엔진 값 없음 → –)
  //   DSR       = registry tier_eval.dsr (등록부 권위 값)
  function kpisOf(reg, art) {
    var st = art.stats || {}, te = (reg && reg.tier_eval) || {};
    var hac = get(art, 'portfolio.dsr_hac.hac') || {};
    var daily = Array.isArray(get(art, 'portfolio.daily_nav'));
    var sh = daily ? { v: hac.sharpe_ann, s: '일별 연환산', src: 'portfolio.dsr_hac.hac.sharpe_ann' }
      : { v: st.sharpe_per_trade, s: '거래당', src: 'stats.sharpe_per_trade', tip: (isNum(st.sharpe_annualized) ? 'stats.sharpe_annualized ' + st.sharpe_annualized + ' = ' + (st.sharpe_note || '') + ' — 헤드라인에 쓰지 않음' : '') };
    var mdd = isNum(st.mdd_daily_mtm_bp) ? { v: st.mdd_daily_mtm_bp, s: '일별 MtM', src: 'stats.mdd_daily_mtm_bp', tip: st.mdd_note || '' }
      : { v: st.max_drawdown_bp, s: daily ? '일별 MtM' : '청산 누적', src: 'stats.max_drawdown_bp', tip: daily ? '' : '청산일 누적 곡선 기준(보유 중 평가손익 미반영) · 엔진 표기 그대로' };
    var dsrB = dsrBasis(reg, art), cur = get(art, 'perf_extension.dsr_at_current_N_info');
    var dsrTip = ['registry tier_eval.dsr', dsrB ? '기준 = ' + basisTxt(dsrB) + '(' + dsrB.src + ')' : '', te.dsr_verdict,
      cur && cur.n_trials != null ? '정보(등록부·게이트 무반영): 현 N ' + cur.n_trials + ' · ' + Object.keys(cur).filter(function (k) { return /^dsr_data_/.test(k); }).map(function (k) { return k.replace('dsr_data_', '데이터 ') + ' ' + cur[k]; }).join(' / ') : '', get(te, 'dsr_at_current_N.dsr') != null ? '현 N 기준 ' + get(te, 'dsr_at_current_N.dsr') + ' (N ' + get(te, 'dsr_at_current_N.n_effective') + ')' : '',
      get(te, 'dsr_economic.dsr') != null ? '경제 P&L 대용 DSR ' + get(te, 'dsr_economic.dsr') : '', get(art, 'portfolio.dsr_hac.dsr.verdict') ? 'artifact verdict: ' + get(art, 'portfolio.dsr_hac.dsr.verdict') : ''].filter(Boolean).join(' · ');
    return [
      { k: 'ann', l: '연 손익', v: rawD(st.bp_per_year, 1), u: 'bp/년', c: cls(st.bp_per_year), src: 'stats.bp_per_year', tip: st.metric || '' },
      { k: 'tot', l: '누적', v: rawD(st.total_pnl_bp, 1), u: 'bp', c: cls(st.total_pnl_bp), src: 'stats.total_pnl_bp', tip: '' },
      { k: 'sharpe', l: 'Sharpe', v: raw(sh.v), u: '', s: sh.s, src: sh.src, tip: sh.tip || '' },
      { k: 'mdd', l: 'MDD', v: rawD(mdd.v, 1), u: 'bp', s: mdd.s, src: mdd.src, tip: mdd.tip },
      { k: 'n', l: art.track === 'delta' ? '에피소드 수' : '거래 수', v: raw(st.n_trades), u: '', src: 'stats.n_trades', tip: '' },
      { k: 'hit', l: '승률', v: pct(st.hit_rate), u: '', src: 'stats.hit_rate', tip: '' },
      { k: 'hold', l: '평균 보유', v: raw(st.mean_hold), u: isNum(st.mean_hold) ? (st.hold_unit || '일') : '', src: 'stats.mean_hold', tip: isNum(st.mean_hold) ? '' : '엔진 artifact 에 평균 보유 값 없음' },
      { k: 'dsr', l: 'DSR', v: raw(te.dsr), u: '', s: basisTxt(dsrB), src: 'registry tier_eval.dsr', tip: dsrTip }
    ];
  }
  function renderSt(id, reg, art, regErr) {
    var host = $('alSt');
    if (!art || art.has_artifact === false) { host.innerHTML = cardHead('기초 통계량', '') + errBox('통계 없음 — ', (art && art.note) || 'artifact 없음'); STATS.sec.st = 'none'; return; }
    var ks = kpisOf(reg || {}, art);
    STATS.kpi = {};
    ks.forEach(function (k) { STATS.kpi[k.k] = k.v + (k.u ? ' ' + k.u : ''); });
    host.innerHTML = cardHead('기초 통계량', '엔진 산출 값 그대로(웹 재계산 0). 칸마다 ? = 출처 필드. 값이 없으면 –.' + (regErr ? ' DSR: 등록부를 불러오지 못함(' + regErr + ').' : ''),
      esc([(curveOf(art) ? '데이터 끝 ' + curveOf(art).pts[curveOf(art).pts.length - 1].d : ''), (get(art, 'stats.at') ? '산출 ' + get(art, 'stats.at') : '')].filter(Boolean).join(' · '))) +
      '<div class="al-body"><dl class="al-kpis" id="alKpis">' + ks.map(function (k) {
        return '<div class="al-kpi" data-k="' + k.k + '"><dt>' + esc(k.l) + help('출처: ' + k.src + (k.tip ? ' · ' + k.tip : '')) + '</dt><dd><span class="al-kpi-v ' + (k.c || '') + '">' + k.v + '</span>' +
          (k.u ? '<span class="al-kpi-u">' + esc(k.u) + '</span>' : '') + (k.s ? '<span class="al-kpi-s">' + esc(k.s) + '</span>' : '') + '</dd></div>';
      }).join('') + '</dl></div>';
    STATS.sec.st = 'ok';
  }

  // ══ ③ 보유 포지션 · ④ 오늘 시그널 — forward 그대로 ══════════════════════
  //   연속북(cta_delta: targets[]) = 목표 포지션 트래킹 · 개별 진입(of · uni_irs_v3: open_positions[] · entries_today[] · exits[])
  // ── 종목 약칭(OF 페어 종목코드 → '26-1' 등) — 리뷰 스냅샷(/quant-house/market-review)의 instrument[] · bond_rv[] {code, name} 그대로.
  //    약칭 = name 끝 괄호 안('국고03000-2803(26-1)' → '26-1') · 매핑 없는 코드 = 원 코드 그대로 · 원문은 마우스 올림(title).
  var CODE_RE = /^KR[0-9A-Z]{10}$/;
  function loadNames() {
    if (AL.names) return AL.names;
    AL.names = apiGet('/quant-house/market-review').then(function (snap) {
      var m = {};
      ['instrument', 'bond_rv'].forEach(function (k) {
        (Array.isArray(snap && snap[k]) ? snap[k] : []).forEach(function (x) {
          if (x && typeof x.code === 'string' && typeof x.name === 'string' && !m[x.code]) { var mm = /\(([^()]+)\)\s*$/.exec(x.name); m[x.code] = mm ? mm[1] : x.name; }
        });
      });
      return m;
    }, function () { AL.names = null; return {}; });
    return AL.names;
  }
  function nm(c) { var t = String(c == null ? '' : c).trim(); return (CODE_RE.test(t) && AL.nameMap && AL.nameMap[t]) || t; }
  function codesTxt(s) { return String(s == null ? '' : s).split('/').map(nm).join('/'); }
  var SIDE = { 'SHORT_nonbench/LONG_bench': '비지표 매도 · 지표 매수', 'LONG_nonbench/SHORT_bench': '비지표 매수 · 지표 매도' };   // 고정 사전 · 없는 라벨 = 원문
  function sideTxt(s) { return s == null || s === '' ? '–' : (SIDE[s] || s); }
  function hasCodes(fwd) { return /KR[0-9A-Z]{10}/.test(JSON.stringify([fwd.open_positions, fwd.entries_today, fwd.exits])); }
  function exitTxt(p) {
    var ep = p.exit_policy || {};
    return esc(ep.name || '–') + (p.exit_eta ? '<span class="al-sub">시간청산 ' + esc(p.exit_eta) + (isNum(p.days_to_time_exit) ? ' · ' + p.days_to_time_exit + '일 남음' : '') + '</span>' : '');
  }
  function epTip(p) { var ep = p.exit_policy || {}; return 'exit_policy ' + (ep.name || '') + ' = TP ' + raw(ep.tp_bp) + ' · SL ' + raw(ep.sl_bp) + ' · 최대 보유 ' + raw(ep.max_hold) + '일'; }
  function renderPos(id, fwd) {
    var host = $('alPos');
    if (!fwd || fwd.available === false) { host.innerHTML = cardHead('보유 포지션', '') + errBox('forward 없음 — ', (fwd && fwd.note) || ''); STATS.sec.pos = 'none'; return; }
    var meta = '기준 ' + esc(fwd.asof || '–');
    if (Array.isArray(fwd.targets)) {
      var T = fwd.targets;
      STATS.pos = { kind: 'targets', n: T.length };
      host.innerHTML = cardHead('보유 포지션', '연속북 목표 포지션 트래킹(페이퍼) — forward targets 그대로. ' + (get(fwd, 'sizing.note') || '') + ' ' + (get(fwd, 'combine.note') || '') + ' ' + (get(fwd, 'roll.note') || ''), meta + ' · 체결 ' + esc(fwd.execution_date || '–') + ' · 목표 ' + T.length) +
        '<div class="al-body">' + (T.length ? '<div class="al-tablewrap"><table class="wb-table al-table" id="alPosT"><thead><tr><th class="lt">슬리브</th><th class="lt">상품</th><th class="lt">방향</th><th class="num">목표 단위</th><th class="num">위험균형 가중</th><th class="lt">현재 종목</th><th class="lt">마지막 롤</th></tr></thead><tbody>' +
          T.map(function (t) {
            return '<tr><td class="lt wb-strong">' + esc(t.sleeve) + '</td><td class="lt">' + esc(t.instrument || '–') + '</td><td class="lt ' + (t.sign > 0 ? 'wb-up' : t.sign < 0 ? 'wb-down' : '') + '">' + esc(t.side || '–') + '</td>' +
              '<td class="num">' + raw(t.target_unit) + '</td><td class="num">' + raw(t.risk_parity_weight) + '</td><td class="lt mono">' + esc(t.current_code || '–') + '</td><td class="lt">' + esc(t.last_roll || '–') + '</td></tr>';
          }).join('') + '</tbody></table></div>' : '<div class="al-empty" id="alPosEmpty">보유 없음</div>') + '</div>';
      STATS.sec.pos = 'ok'; return;
    }
    var P = Array.isArray(fwd.open_positions) ? fwd.open_positions : [];
    var cn = fwd.counts || {};
    STATS.pos = { kind: 'open', n: P.length };
    var badges = (isNum(cn.revision_alerts) && cn.revision_alerts > 0 ? ' <span class="wb-badge wb-badge--warn" id="alRevBadge">재파생 경고 ' + cn.revision_alerts + '</span>' +
      help((get(fwd, 'revision_alerts.0.detail.note') || '') + ' (forward revision_alerts · 원장 open ' + raw(get(fwd, 'ledger.n_open')) + ' vs 재파생 보유 ' + P.length + ')') : '');
    var tip = 'forward open_positions 그대로(페이퍼 원장 · per-unit). 손익 = pnl_net_bp_if_exit(지금 청산하면 · 비용 차감) · 괄호 = 총손익(gross). ' +
      (fwd.cap_note || '') + ' ' + (get(fwd, 'pit.execution_note') || '') + ' ' + (get(fwd, 'carry_display.convention') || '');
    host.innerHTML = cardHead('보유 포지션', tip, meta + ' · 보유 ' + P.length) +
      '<div class="al-body">' + (badges ? '<div style="margin-bottom:6px">' + badges + '</div>' : '') +
      (P.length ? '<div class="al-tablewrap"><table class="wb-table al-table" id="alPosT"><thead><tr><th class="lt">구조</th><th class="lt">방향</th><th class="num">크기</th><th class="lt">진입일</th><th class="num">보유</th><th class="num">손익 bp</th><th class="lt">청산 조건</th></tr></thead><tbody>' +
        P.map(function (p) {
          var pn = p.pnl_net_bp_if_exit;
          return '<tr><td class="lt"><span class="mono" title="' + esc(p.signal || p.sleeve) + '">' + esc(codesTxt(p.signal || p.sleeve)) + '</span>' + (p.sleeve && p.sleeve !== p.signal && p.family !== 'of_pair' ? '<span class="al-sub">' + esc(p.sleeve) + '</span>' : '') + '</td>' +
            '<td class="lt ' + (p.sign > 0 ? 'wb-up' : p.sign < 0 ? 'wb-down' : '') + '" title="' + esc(p.side || '') + '">' + esc(sideTxt(p.side)) + '</td><td class="num">' + raw(p.size) + '</td><td class="lt">' + esc(p.entry_date || '–') + '</td>' +
            '<td class="num">' + raw(p.days_held) + '/' + raw(p.max_hold) + '</td><td class="num ' + cls(pn) + '" title="gross ' + esc(raw(p.pnl_gross_bp)) + '">' + raw(pn) + ' <span class="al-sub" style="display:inline">(' + raw(p.pnl_gross_bp) + ')</span></td>' +
            '<td class="lt" title="' + esc(epTip(p)) + '">' + exitTxt(p) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="al-empty" id="alPosEmpty">보유 없음</div>') + '</div>';
    STATS.sec.pos = 'ok';
  }
  // ④ 오늘 시그널 — 위 = 진입 · 아래 = 청산(2026-10-22 사용자 지시 "분할해서 진입 시그널, 청산 시그널 아래 위로")
  //   진입 = forward entries_today 그대로 · 청산 = forward exits 중 봉인일 = 기준일(엔진 counts.exits_sealed_today 와 같은 규칙).
  //   '오늘 체결 예정 시간청산' 같은 별도 목록은 엔진 forward 에 없음 → 만들지 않음(웹 계산 0).
  //   연속북(cta_delta) = 진입·청산 개념 없음: 위 = 체결일 목표 포지션 · 아래 = 고정 안내(엔진 근거 없는 청산 행 생성 0).
  function half(key, title, n, inner, tip) {
    return '<div class="al-half" id="alSig' + key + '"><div class="al-sigh"><b>' + esc(title) + '</b> <span class="al-cnt" id="alSig' + key + 'N">' + n + '</span>' + help(tip) + '</div>' + inner + '</div>';
  }
  function renderSig(id, fwd) {
    var host = $('alSig');
    if (!fwd || fwd.available === false) { host.innerHTML = cardHead('오늘 시그널', '') + errBox('forward 없음 — ', (fwd && fwd.note) || ''); STATS.sec.sig = 'none'; return; }
    var meta = '기준 ' + esc(fwd.asof || '–') + ' · 체결 ' + esc(fwd.execution_date || '–');
    var pitTip = [get(fwd, 'pit.convention'), get(fwd, 'pit.execution_note')].filter(Boolean).join(' · ');
    var sgn = function (v) { return v > 0 ? 'wb-up' : v < 0 ? 'wb-down' : ''; };
    if (Array.isArray(fwd.targets)) {
      var T = fwd.targets;
      STATS.sig = { kind: 'targets', n: T.length, x: null, asof: fwd.asof, exec: fwd.execution_date };
      var tin = T.length ? '<div class="al-tablewrap"><table class="wb-table al-table" id="alSigT"><thead><tr><th class="lt">슬리브</th><th class="lt">방향</th><th class="num">원신호</th><th class="num">vol 레버</th><th class="num">목표 단위</th><th class="lt">신호일</th></tr></thead><tbody>' +
        T.map(function (t) {
          return '<tr><td class="lt wb-strong">' + esc(t.sleeve) + '</td><td class="lt ' + sgn(t.sign) + '">' + esc(t.side || '–') + '</td><td class="num">' + raw(t.raw_signal) + '</td>' +
            '<td class="num">' + raw(t.vol_lever) + '</td><td class="num">' + raw(t.target_unit) + '</td><td class="lt">' + esc(t.signal_date || '–') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="al-empty" id="alSigInEmpty">오늘 진입 신호 없음</div>';
      host.innerHTML = cardHead('오늘 시그널', '연속북 — forward targets 그대로. ' + pitTip, meta) +
        '<div class="al-sigsplit">' +
        half('In', '진입 시그널', T.length, tin, '체결일 목표 포지션(연속북은 진입·청산 대신 목표 조정): 원신호(raw_signal) × vol 레버 = 목표 단위') +
        half('Out', '청산 시그널', '–', '<div class="al-empty" id="alSigOutNote">연속북 — 별도 청산 신호 없음(목표 포지션 변경으로 표시)</div>',
          'forward 에 목표 감소·0 전환 같은 청산 정보가 따로 없음 — 청산 행을 만들지 않음') +
        '</div>';
      STATS.sec.sig = 'ok'; return;
    }
    var E = Array.isArray(fwd.entries_today) ? fwd.entries_today : [];
    var X = (Array.isArray(fwd.exits) ? fwd.exits : []).filter(function (x) { return x.exit_seal_date === fwd.asof; });   // 오늘(기준일) 봉인 청산만 — forward exits 는 최근 14일 창
    STATS.sig = { kind: 'entries', n: E.length, x: X.length, asof: fwd.asof, exec: fwd.execution_date };
    var ein = E.length ? '<div class="al-tablewrap"><table class="wb-table al-table" id="alSigT"><thead><tr><th class="lt">구조 · 레그</th><th class="lt">방향 · 조건</th></tr></thead><tbody>' +
      E.map(function (e) {
        var legs = Array.isArray(e.legs) ? e.legs.map(function (l) { return esc(nm(l.leg)) + ' ' + esc(l.dir); }).join(' · ') : '';
        var cond = [isNum(e.z) ? 'z ' + raw(e.z) : '', '크기 ' + raw(e.size), get(e, 'exit_policy.name') ? esc(get(e, 'exit_policy.name')) : ''].filter(Boolean).join(' · ');
        return '<tr><td class="lt"><span class="mono" title="' + esc((e.signal || e.sleeve) + (Array.isArray(e.legs) ? ' · ' + e.legs.map(function (l) { return l.leg + ' ' + l.dir; }).join(' · ') : '')) + '">' + esc(codesTxt(e.signal || e.sleeve)) + '</span>' + (legs ? '<span class="al-sub">' + legs + '</span>' : '') + '</td>' +
          '<td class="lt" title="' + esc(epTip(e)) + '"><span class="' + sgn(e.sign) + '" title="' + esc(e.side || '') + '">' + esc(sideTxt(e.side)) + '</span><span class="al-sub">' + cond + '</span></td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="al-empty" id="alSigInEmpty">오늘 진입 신호 없음</div>';
    var xin = X.length ? '<div class="al-tablewrap"><table class="wb-table al-table" id="alSigX"><thead><tr><th class="lt">구조</th><th class="lt">방향</th><th class="lt">진입일</th><th class="num">보유</th><th class="lt">사유</th><th class="num">손익 bp</th></tr></thead><tbody>' +
      X.map(function (x) {
        return '<tr><td class="lt mono" title="' + esc(x.signal || x.sleeve) + '">' + esc(codesTxt(x.signal || x.sleeve)) + '</td><td class="lt ' + sgn(x.sign) + '" title="' + esc(x.side || '') + '">' + esc(sideTxt(x.side)) + '</td>' +
          '<td class="lt">' + esc(x.entry_date || '–') + '</td><td class="num">' + raw(x.days_held) + '</td><td class="lt">' + esc(x.reason || '–') + '</td>' +
          '<td class="num ' + cls(x.pnl_net_bp) + '" title="gross ' + esc(raw(x.pnl_gross_bp)) + '">' + raw(x.pnl_net_bp) + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="al-empty" id="alSigOutEmpty">오늘 청산 신호 없음</div>';
    host.innerHTML = cardHead('오늘 시그널', 'forward 그대로. ' + pitTip, meta) +
      '<div class="al-sigsplit">' +
      half('In', '진입 시그널', E.length, ein, 'forward entries_today 그대로 · 방향 = 고정 사전(원문은 마우스 올림) · 종목 = 약칭') +
      half('Out', '청산 시그널', X.length, xin, 'forward exits 중 봉인일 = 기준일(' + esc(fwd.asof || '–') + ') 그대로 · 사유 = 엔진 값(TP/SL/TIME 등) · 손익 = pnl_net_bp(마우스 올림 = gross)' +
        (fwd.exits_note ? ' · ' + fwd.exits_note : '') + ' · 오늘 체결 예정 시간청산의 별도 목록은 엔진 forward 에 없음(보유 포지션의 시간청산 날짜 참고)') +
      '</div>';
    STATS.sec.sig = 'ok';
  }

  // ══ 전환 · 블록별 독립 로딩 ═════════════════════════════════════════
  function skel(id) { $(id).innerHTML = '<div class="al-skel"><span class="wb-skel wb-skel--line"></span><span class="wb-skel wb-skel--line"></span><span class="wb-skel wb-skel--line"></span></div>'; }
  function setSeg(id) {
    Array.prototype.forEach.call(doc.querySelectorAll('#alSeg > button'), function (b) {
      var on = b.getAttribute('data-id') === id; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }
  async function show(id) {
    if (!STRATS.some(function (s) { return s.id === id; })) id = STRATS[0].id;
    var seq = ++AL.seq;
    STATS.cur = id; STATS.done = false; STATS.sec = {}; STATS.chips = []; STATS.kpi = {}; STATS.bt = STATS.pos = STATS.sig = null;
    setSeg(id); destroyAll();
    $('alStrat').innerHTML = '<span class="wb-skel wb-skel--fig"></span><span class="wb-skel"></span>'; $('alMore').innerHTML = '';
    ['alBt', 'alSt', 'alPos', 'alSig'].forEach(skel);
    var pReg = load(id, 'reg'), pArt = load(id, 'art'), pFwd = load(id, 'fwd');
    var live = function () { return seq === AL.seq; };
    var settle = function (p) { return p.then(function (v) { return { ok: true, v: v }; }, function (e) { return { ok: false, e: emsg(e) }; }); };
    var head = Promise.all([settle(pReg), settle(pFwd), settle(pArt)]).then(function (r) {   // art = 칩 tip 의 DSR 기준(게이트 시점 · N) · 실패해도 칩은 그림
      if (!live()) return;
      if (!r[0].ok) { $('alStrat').innerHTML = '<span class="al-strat-name">' + esc(STRATS.filter(function (s) { return s.id === id; })[0].label) + '</span><span class="wb-error" id="alHeadErr">등록부를 불러오지 못함 — ' + esc(r[0].e) + '</span>'; STATS.sec.head = 'err'; return; }
      try { renderHead(id, r[0].v, r[1].ok ? r[1].v : null, r[2].ok ? r[2].v : null); STATS.sec.head = 'ok'; } catch (e) { STATS.sec.head = 'err'; if (window.console) console.warn('al head', e); }
    });
    var bt = Promise.all([settle(pArt), settle(pFwd)]).then(function (r) {
      if (!live()) return;
      if (!r[0].ok) { $('alBt').innerHTML = cardHead('백테스트', '') + errBox('백테스트를 불러오지 못함 — ', r[0].e); STATS.sec.bt = 'err'; return; }
      try { renderBt(id, r[0].v, r[1].ok ? r[1].v : null); } catch (e) { $('alBt').innerHTML = cardHead('백테스트', '') + errBox('그리기 실패 — ', emsg(e)); STATS.sec.bt = 'err'; if (window.console) console.warn('al bt', e); }
    });
    var st = Promise.all([settle(pReg), settle(pArt)]).then(function (r) {
      if (!live()) return;
      if (!r[1].ok) { $('alSt').innerHTML = cardHead('기초 통계량', '') + errBox('통계를 불러오지 못함 — ', r[1].e); STATS.sec.st = 'err'; return; }
      try { renderSt(id, r[0].ok ? r[0].v : null, r[1].v, r[0].ok ? null : r[0].e); } catch (e) { $('alSt').innerHTML = cardHead('기초 통계량', '') + errBox('그리기 실패 — ', emsg(e)); STATS.sec.st = 'err'; if (window.console) console.warn('al st', e); }
    });
    var pFwdN = pFwd.then(function (f) {   // 종목코드가 있는 forward(OF)만 약칭 사전을 받음 · 사전 실패 = 원 코드 그대로(블록 격리 유지)
      if (!f || !hasCodes(f)) return f;
      return loadNames().then(function (m) { AL.nameMap = m; STATS.names = Object.keys(m).length; return f; });
    });
    var pos = settle(pFwdN).then(function (r) {
      if (!live()) return;
      if (!r.ok) { $('alPos').innerHTML = cardHead('보유 포지션', '') + errBox('forward 를 불러오지 못함 — ', r.e); STATS.sec.pos = 'err'; return; }
      try { renderPos(id, r.v); } catch (e) { $('alPos').innerHTML = cardHead('보유 포지션', '') + errBox('그리기 실패 — ', emsg(e)); STATS.sec.pos = 'err'; if (window.console) console.warn('al pos', e); }
    });
    var sig = settle(pFwdN).then(function (r) {
      if (!live()) return;
      if (!r.ok) { $('alSig').innerHTML = cardHead('오늘 시그널', '') + errBox('forward 를 불러오지 못함 — ', r.e); STATS.sec.sig = 'err'; return; }
      try { renderSig(id, r.v); } catch (e) { $('alSig').innerHTML = cardHead('오늘 시그널', '') + errBox('그리기 실패 — ', emsg(e)); STATS.sec.sig = 'err'; if (window.console) console.warn('al sig', e); }
    });
    await Promise.allSettled([head, bt, st, pos, sig]);
    if (live()) STATS.done = true;
  }
  function fromHash() { var h = (location.hash || '').replace(/^#/, ''); return STRATS.some(function (s) { return s.id === h; }) ? h : STRATS[0].id; }
  function init() {
    $('alSeg').innerHTML = STRATS.map(function (s) { return '<button type="button" role="tab" data-id="' + s.id + '">' + esc(s.label) + '</button>'; }).join('');
    $('alSeg').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-id]'); if (!b) return;
      var id = b.getAttribute('data-id');
      if (('#' + id) !== location.hash) { try { history.replaceState(null, '', '#' + id); } catch (er) { location.hash = id; } }
      show(id);
    });
    window.addEventListener('hashchange', function () { show(fromHash()); });
    show(fromHash());
  }
  window.WBAlpha = { show: show, _kpisOf: kpisOf, _chipsOf: chipsOf };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
})();
