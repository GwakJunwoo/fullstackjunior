/* ═══════════════════════════════════════════════════════════════════════════
   wb-review-plain.js — 주간 리뷰 `일반 | 고급` 보기 (2026-10-21 redesign-wb 4단계)
   사양 = docs/design-wb/REVIEW_TAB_SPEC.md + REVIEW_TAB_DECISIONS.md(우선 · §3-bis 최신)
   ───────────────────────────────────────────────────────────────────────────
   ■ 원칙(H1/H3): 문장·판정·숫자는 전부 엔진 snapshot.plain(연준 build_plain) 과
     review_scoreboard.plain 에서 온다. 이 파일은 그리기만 한다 — 번역·판정·재계산 0.
     · 큰 배열은 참조(*_ref)를 풀어 그린다: curve_ref → yield_curve.* ·
       points_ref → bond_rv[] · spark_ref → spread_history / pick_history / curve_range_1y 끝 n 관측(끝 날짜 = to).
     · 숫자 칸 = 엔진 표시 문자열(*_text · half-up) 그대로 · 없을 때만 원 값(웹 반올림 0).
     · 화면 좌표(막대 길이·점 위치)만 계산한다(표시용 · 숫자로 내보내지 않음).
   ■ 보이는 문장은 셋뿐: 결론 3줄(headline) · 그림 제목(charts.*.title) · 눈에 띄는 곳 카드의
     판단 한 줄(notable[].sentence). 설명·규약·용어는 전부 ? 툴팁(wb-shell 의 .wb-help).
     정직 라벨(관찰 전용 · 실행은 재량 · 되돌림 미확인 → 확인 후 접근)은 보인다.
   ■ 색: + = 빨강(up) · − = 파랑(down) — 잔차·종합 점수는 + = 쌈. 색만으로 뜻을 전하지 않는다
     (쌈/비쌈 글자 병기 · 엔진 label/side/y_words 그대로). 20년 = 회색 참고.
   ■ plain 이 없으면(옛 snapshot) 일반 보기 = '준비 중' 빈 상태 · 고급 보기는 그대로 정상.
   ■ 보기 기억: localStorage 'wb-review-view'(try/catch) · 링크: #review/adv = 고급 · #review/plain = 일반 ·
     #review = 기억한 보기(없으면 일반 — 헤더 내비 링크가 #review 라서).
   ■ 기존 DOM id·JS 훅 무변경. 고급 보기 = 기존 renderReview 결과 그대로(#revBody).
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var doc = document;
  var LS_KEY = 'wb-review-view';
  var PLAIN_SCHEMA_MAX = 2;
  var VIEWS = { plain: 1, adv: 1 };
  var charts = [];
  var S = { snap: null, sb: null, view: null, scatter: null, bondPts: [], bondSel: null, curveSel: 0, tenorSel: -1,
            explicit: false, autoFb: false };   // explicit = 이번 세션에 사용자가 보기를 직접 고름 · autoFb = plain 없어 고급으로 자동 전환 중
  var STATS = window.WB_REV_PLAIN_STATS = { state: 'init', charts: 0, cards: 0, stubs: 0, sparks: 0, nospark: 0, gaps: [] };

  // ── 작은 도구 ───────────────────────────────────────────────────────────
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function num(v) { if (v == null || v === '' || typeof v === 'boolean') return null; var n = Number(v); return isFinite(n) ? n : null; }
  // 숫자 표시 — ★웹은 반올림하지 않는다(엔진 half-up 과 JS toFixed 가 갈림: 7.25 → '7.3' vs '7.2' · 민재 계약 10-21).
  //   엔진 값이 이미 그 자릿수 이하면 0 채우기만(34 → '34.0') · 자릿수가 더 길면 원 값 그대로(7.25 → '7.25').
  //   엔진 문장 안의 숫자는 다시 찍지 않는다(문장이 있는 자리에는 숫자 칸을 두지 않음).
  function nfix(v, d, signed) {
    var n = num(v); if (n == null) return '–';
    var t = n.toFixed(d), s = (Number(t) === n) ? t : String(n);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return (signed && n > 0 ? '+' : '') + s;
  }
  function f1(v) { return nfix(v, 1, false); }
  function s1(v) { return nfix(v, 1, true); }
  function str(v) { return (typeof v === 'string' && v.trim()) ? v : null; }   // 엔진 문자열 필드만(모르는 필드 = 무시)
  // 숫자 칸 = 엔진 표시 문자열(*_text · half-up · 계약 a5e58a86) 그대로 · 문자열이 없을 때만 원 값(반올림 0)
  function tx(o, key, v, d, signed) { var t = o ? o[key] : null; return (typeof t === 'string' && t.trim()) ? t : nfix(v, d, signed); }
  function cls(v) { var n = num(v); return n == null ? '' : n > 0 ? 'pp' : n < 0 ? 'pn' : ''; }      // #view-review .pp/.pn = up/down
  function mmdd(d) { return d ? String(d).slice(5, 10) : ''; }
  function get(o, path) {   // 'yield_curve.current' → o.yield_curve.current
    if (!o || !path) return undefined;
    var cur = o, ps = String(path).split('.');
    for (var i = 0; i < ps.length; i++) { if (cur == null) return undefined; cur = cur[ps[i]]; }
    return cur;
  }
  function track(ch) { charts.push(ch); STATS.charts++; return ch; }
  function destroyCharts() { charts.forEach(function (c) { try { c.destroy(); } catch (e) { /* 이미 파괴 */ } }); charts = []; S.scatter = null; }
  function tok(n, a) { return window.WBChart ? WBChart.tok(n, a) : n; }
  function css(n) { return window.WBChart ? WBChart.css(n) : ''; }
  function alpha(n, a) { return window.WBChart ? WBChart.alpha(n, a) : n; }

  // ? 툴팁(원문 그대로 · 문단 배열) — template 안은 화면 텍스트에 섞이지 않는다
  function helpHtml(paras, extra) {
    var ps = (paras || []).filter(function (p) { return p != null && (typeof p === 'object' ? p.html : String(p).trim()); })
      .map(function (p) { return '<p>' + (typeof p === 'object' ? p.html : esc(p)) + '</p>'; }).join('');
    if (!ps) return '';
    return '<span class="wb-help' + (extra ? ' ' + extra : '') + '" role="button" tabindex="0" aria-label="설명 보기"><template>' + ps + '</template></span>';
  }
  function empty(title, text, actions) {
    return '<div class="wb-empty"><div class="wb-empty-title">' + esc(title) + '</div>' +
      (text ? '<div class="wb-empty-text">' + esc(text) + '</div>' : '') + (actions || '') + '</div>';
  }
  // 숫자 보기 → 고급 보기의 같은 섹션(제목 앞부분으로 찾음 · 고급 보기 말은 JS 안에만 — 일반 보기 화면 텍스트 0)
  var JUMP = { rates: '일드커브', curve: '일드커브', tenor: '6종목 종합 넷팅', bond: '전 유니버스 표', notable: 'TOP PICK',
    product: '상품 간 비교', basket: '국채선물 바스켓 비교', trust: '추천 일치성 스코어보드', evidence: '주간 팩터 손익' };
  function jumpBtn(key) {
    return '<button type="button" class="rvp-more" data-rv-jump="' + esc(key) + '" aria-label="고급 보기의 해당 표로 이동">숫자 보기 →</button>';
  }
  function cardHead(kicker, title, help, jumpKey, meta, extra) {
    return '<div class="wb-card-head rvp-head">' +
      (kicker ? '<span class="rvp-kicker">' + esc(kicker) + '</span>' : '') +
      '<span class="wb-card-title rvp-title">' + esc(title || '') + '</span>' + (help || '') + (extra || '') +
      (meta ? '<span class="wb-card-meta">' + esc(meta) + '</span>' : '') +
      (jumpKey ? jumpBtn(jumpKey) : '') + '</div>';
  }

  // 참조 풀기 — spark_ref{src,key,n,to} → {dates, values}. ★같은 snapshot 객체 안에서만 · series[key] 끝 n 관측 ·
  //   날짜 축과 길이가 다르거나 끝 날짜 ≠ spark_ref.to 면 null(= '추이 없음' · 엉뚱한 날짜 추이선 금지).
  function series(snap, ref) {
    if (!snap || !ref || !ref.src || ref.key == null) return null;
    var src = snap[ref.src];
    if (!src || !src.series || !Array.isArray(src.dates)) return null;
    var vals = src.series[ref.key];
    if (!Array.isArray(vals) || !vals.length || vals.length !== src.dates.length) return null;
    var a = Math.max(0, vals.length - (num(ref.n) || vals.length));
    var dates = src.dates.slice(a), values = vals.slice(a);
    if (ref.to && dates[dates.length - 1] !== ref.to) return null;
    return { dates: dates, values: values };
  }
  function bondPoints(snap, bs) {
    var r = (bs && bs.points_ref) || {}, arr = snap ? snap[r.src] : null, sm = (bs && bs.short) || {};
    if (!Array.isArray(arr) || !r.x || !r.y) return [];
    var out = [];
    arr.forEach(function (o) {
      if (!o) return;
      var x = num(o[r.x]), y = num(o[r.y]);
      if (x == null || y == null) return;
      var id = r.id ? o[r.id] : null;
      out.push({ x: x, y: y, id: id, short: sm[id] || o.name || id || '?', name: o.name || '', ind: !!(r.indicator && o[r.indicator]) });
    });
    return out;
  }

  // 미니 추이선(SVG) — muted 선 + 끝점 · 0 을 지나면 0 기준선
  function sparkSvg(s) {
    if (!s || !s.values) { STATS.nospark++; return '<span class="rvp-nospark">추이 없음</span>'; }
    var v = s.values, n = v.length, fin = v.map(num).filter(function (x) { return x != null; });
    if (fin.length < 2) { STATS.nospark++; return '<span class="rvp-nospark">추이 없음</span>'; }
    STATS.sparks++;
    var W = 104, H = 28, P = 3, lo = Math.min.apply(null, fin), hi = Math.max.apply(null, fin), sp = (hi - lo) || 1;
    var X = function (i) { return P + i * (W - 2 * P) / Math.max(1, n - 1); };
    var Y = function (y) { return H - P - (y - lo) / sp * (H - 2 * P); };
    var d = '', pen = false, last = -1;
    for (var i = 0; i < n; i++) {
      var y = num(v[i]);
      if (y == null) { pen = false; continue; }
      d += (pen ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(y).toFixed(1);
      pen = true; last = i;
    }
    var zero = (lo < 0 && hi > 0) ? '<line class="rvp-spark-zero" x1="' + P + '" x2="' + (W - P) + '" y1="' + Y(0).toFixed(1) + '" y2="' + Y(0).toFixed(1) + '"/>' : '';
    var lab = '추이 ' + mmdd(s.dates[0]) + '~' + mmdd(s.dates[s.dates.length - 1]) + ' · ' + n + ' 관측';
    return '<svg class="rvp-spark" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(lab) + '"><title>' + esc(lab) + '</title>' +
      zero + '<path d="' + d + '"/>' + (last >= 0 ? '<circle cx="' + X(last).toFixed(1) + '" cy="' + Y(num(v[last])).toFixed(1) + '" r="2.2"/>' : '') + '</svg>';
  }

  // ── 보기 전환 ───────────────────────────────────────────────────────────
  function storedView() { try { var v = window.localStorage.getItem(LS_KEY); return VIEWS[v] ? v : null; } catch (e) { return null; } }
  function storeView(v) { try { window.localStorage.setItem(LS_KEY, v); } catch (e) { /* 저장 불가 — 이번 페이지만 */ } }
  function hashView() {
    var h = (location.hash || '').replace(/^#/, '').split('/');
    if (h[0] !== 'review') return null;
    return h[1] === 'adv' ? 'adv' : h[1] === 'plain' ? 'plain' : null;
  }
  function reviewActive() { var b = doc.getElementById('tab-review'); return !b || b.classList.contains('active'); }
  function setView(v, opt) {
    opt = opt || {};
    if (!VIEWS[v]) v = 'plain';
    var changed = S.view !== v;
    S.view = v;
    var root = doc.getElementById('view-review');
    if (root) root.setAttribute('data-rv-view', v);
    ['revViewPlain', 'revViewAdv'].forEach(function (id) {
      var b = doc.getElementById(id); if (!b) return;
      var on = b.getAttribute('data-rv-set') === v;
      b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if (opt.store) { storeView(v); S.explicit = true; }   // 저장 = 사용자 조작(토글·빈 상태 버튼·숫자 보기)뿐
    if (opt.hash && reviewActive() && window.history && history.replaceState) {
      var want = '#review' + (v === 'adv' ? '/adv' : '');
      if (location.hash !== want) { try { history.replaceState(null, '', want); } catch (e) { /* file:// 등 */ } }
    }
    if (!changed) return;
    if (window.WBShell && WBShell.hideTip) WBShell.hideTip();
    requestAnimationFrame(function () {   // 숨김 → 보임 전환 차트 크기 재계산
      charts.forEach(function (c) { try { c.resize(); } catch (e) { /* noop */ } });
      try { (window._revCharts || (typeof _revCharts !== 'undefined' ? _revCharts : [])).forEach(function (c) { c.resize(); }); } catch (e) { /* noop */ }
      if (opt.scrollTop !== false) window.scrollTo(0, 0);
      window.dispatchEvent(new Event('scroll'));   // 목차 현재 위치 갱신(양쪽 레일)
    });
  }
  function jumpTo(jk) {   // 숫자 보기 → 고급 보기의 같은 섹션 제목으로
    var key = JUMP[jk] || jk;
    setView('adv', { store: true, hash: true, scrollTop: false });
    requestAnimationFrame(function () {
      var tgt = null;
      Array.prototype.forEach.call(doc.querySelectorAll('#revBody .cat-title'), function (el) {
        if (!tgt && el.textContent.replace(/^\s*★/, '').trim().indexOf(key) === 0) tgt = el;
      });
      if (key === '전 유니버스 표') {   // 종목 표(접힘) 펼치고 그 표로
        var brv = doc.getElementById('rvBrv');
        if (brv && brv.style.display === 'none') {
          var btn = brv.previousElementSibling && brv.previousElementSibling.querySelector('button');
          if (btn) btn.click();
        }
        if (brv) tgt = brv.parentElement || tgt;
      }
      if (tgt) tgt.scrollIntoView({ block: 'start' }); else window.scrollTo(0, 0);
      window.dispatchEvent(new Event('scroll'));
    });
  }

  // ── 섹션 HTML ───────────────────────────────────────────────────────────
  var KICK = ['금리', '커브', '싼·비싼'];
  function conclusionHtml(p) {
    var hl = Array.isArray(p.headline) ? p.headline : [];
    var lb = p.labels || {};
    return '<section class="wb-card rvp-concl" id="rvp-head" aria-label="결론">' +
      '<div class="rvp-concl-top"><span class="rvp-concl-k">결론</span>' +
        (p.window_label ? '<span class="rvp-concl-win' + (p.window && p.window.standard === false ? ' is-nonstd' : '') + '">' + esc(p.window_label) + '</span>' : '') +
        (lb.direction ? '<span class="wb-badge">' + esc(lb.direction) + '</span>' : '') +
        helpHtml([p.sign_rule]) + '</div>' +
      (hl.length ? '<ol class="rvp-lines">' + hl.map(function (h, i) {
        return '<li><span class="rvp-k">' + esc(KICK[i] || '') + '</span><span class="rvp-l">' + esc(h) + '</span></li>';
      }).join('') + '</ol>' : empty('결론 없음', '이 스냅샷의 일반 보기 재료에 결론 문장이 없습니다.')) +
      '</section>';
  }

  function ratesHtml(c) {
    c = c || {};
    var help = helpHtml([c.ref_note, str(c.note20), c.x_label && c.y_label ? '위 = ' + c.y_label + ' × ' + c.x_label + ' · 아래 = 테너별 변화(' + (c.unit || 'bp') + ')' : null]);
    var body = c.available === false ? empty('자료 없음', '이 스냅샷에 금리 그림 재료가 없습니다.') :
      '<div class="rvp-chart rvp-chart--curve"><canvas id="rvpRatesCurve" aria-label="일드커브"></canvas></div>' +
      '<div class="rvp-chart rvp-chart--chg"><canvas id="rvpRatesChg" aria-label="테너별 변화"></canvas></div>';
    return '<section class="wb-card rvp-fig" id="rvp-rates">' + cardHead('금리', c.title, help, 'rates') + '<div class="rvp-body">' + body + '</div></section>';
  }

  function curveHtml(c, snap) {
    c = c || {};
    var rows = Array.isArray(c.rows) ? c.rows : [];
    var rl = c.range_label || '범위';
    var paras = rows.map(function (r) {
      var bits = [r.pct_text, (num(r.lo) != null ? '최저 ' + tx(r, 'lo_text', r.lo, 1) + (r.lo_date ? '(' + r.lo_date + ')' : '') : null),
        (num(r.hi) != null ? '최고 ' + tx(r, 'hi_text', r.hi, 1) + (r.hi_date ? '(' + r.hi_date + ')' : '') : null),
        (num(r.prev) != null ? '비교 ' + tx(r, 'prev_text', r.prev, 1) : null)].filter(Boolean);
      return { html: '<b>' + esc(r.name || r.key) + '</b>' + (bits.length ? ' — ' + esc(bits.join(' · ')) : '') };
    });
    var win = (S.snap && S.snap.plain && S.snap.plain.window) || {};
    paras.push('막대 = ' + rl + '(최저~최고' + (num(c.range_days) ? ' · ' + c.range_days + ' 관측' : '') + ') · 채운 점 = 지금 · 빈 점 = 비교 기준일' + (win.week_ago_date ? '(' + win.week_ago_date + ')' : '') + ' · 줄을 누르면 추이');
    var tr = S.snap && S.snap.plain ? S.snap.plain.track : null;
    [str(c.range_note), str(c.note), tr == null ? null : 'track = ' + (typeof tr === 'string' ? tr : JSON.stringify(tr))].forEach(function (x) { if (x) paras.push(x); });
    var body;
    if (c.available === false || !rows.length) body = empty('자료 없음', '이 스냅샷에 커브 모양 재료가 없습니다.');
    else {
      body = '<div class="wb-legend rvp-legend"><span class="wb-legend-item"><i class="rvp-ldot rvp-ldot--now"></i>지금</span>' +
        '<span class="wb-legend-item"><i class="rvp-ldot rvp-ldot--prev"></i>비교' + (win.week_ago_date ? ' ' + esc(mmdd(win.week_ago_date)) : '') + '</span>' +
        '<span class="wb-legend-item"><i class="rvp-lbar"></i>' + esc(rl) + '</span><span class="rvp-axisw">플랫 ← → 스팁</span></div>' +
        '<div class="rvp-crows" role="list">' + rows.map(function (r, i) {
          var lo = num(r.lo), hi = num(r.hi), now = num(r.now), prev = num(r.prev);
          var has = lo != null && hi != null && hi > lo && now != null;
          var pos = function (v) { return Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100)).toFixed(1); };
          var bar = has ?
            '<span class="rvp-rng-lo">' + esc(tx(r, 'lo_text', lo, 1)) + '</span><span class="rvp-rng"><i class="rvp-rng-track"></i>' +
              (prev != null ? '<i class="rvp-dot rvp-dot--prev" style="left:' + pos(prev) + '%"></i>' : '') +
              '<i class="rvp-dot rvp-dot--now" style="left:' + pos(now) + '%"></i></span><span class="rvp-rng-hi">' + esc(tx(r, 'hi_text', hi, 1)) + '</span>' :
            '<span class="rvp-rng-none">범위 없음</span>';
          return '<div class="rvp-crow' + (i === S.curveSel ? ' is-sel' : '') + '" data-i="' + i + '" role="button" tabindex="0" aria-pressed="' + (i === S.curveSel) + '" title="' + esc(r.name || '') + '">' +
            '<span class="rvp-crow-k">' + esc(r.key) + '</span><span class="rvp-crow-bar">' + bar + '</span>' +
            '<span class="rvp-crow-v"><b>' + esc(tx(r, 'now_text', now, 1)) + '</b><span class="' + cls(r.delta_bp) + '">' + esc(tx(r, 'delta_text', r.delta_bp, 1, true)) + '</span>' +
            (r.move ? '<span class="rvp-crow-m">' + esc(r.move) + '</span>' : '') + '</span></div>';
        }).join('') + '</div>' +
        '<div class="rvp-trend" id="rvpCurveTrendBox"' + (S.curveSel < 0 ? ' hidden' : '') + '><div class="rvp-trend-h" id="rvpCurveTrendH"></div><div class="rvp-chart rvp-chart--trend"><canvas id="rvpCurveTrend" aria-label="커브 구간 추이"></canvas></div></div>';
    }
    return '<section class="wb-card rvp-fig" id="rvp-curve">' + cardHead('커브', c.title, helpHtml(paras), 'curve') + '<div class="rvp-body">' + body + '</div></section>';
  }

  // 테너 축 = 엔진 scale.axis_abs_max(값이 넘으면 그 값까지 넓힘) · 옅은 세로선 = scale.clear/strong 경계 — 웹 상수 0
  function tenorHtml(c) {
    c = c || {};
    var rows = Array.isArray(c.rows) ? c.rows : [];
    var sc = c.scale || {};
    var help = helpHtml([c.basis_label, c.scale_note, str(c.note),
      '막대 = 지금 · 진한 세로 눈금 = 이전 · 옅은 세로선 = ' + [sc.clear_label, sc.strong_label].filter(Boolean).join('·') + ' 경계 · 막대를 누르면 기여 상위 구조']
      .concat(rows.filter(function (r) { return str(r.note20); }).map(function (r) { return r.tenor + '년: ' + r.note20; })));
    var body;
    if (c.available === false || !rows.length) body = empty('자료 없음', '이 스냅샷에 테너 재료가 없습니다.');
    else {
      var mx = 0;
      rows.forEach(function (r) { [r.value, r.prev].forEach(function (v) { var n = num(v); if (n != null) mx = Math.max(mx, Math.abs(n)); }); });
      var m = Math.max(num(sc.axis_abs_max) || 0, mx) || 1;
      var pos = function (v) { return 50 + Math.max(-50, Math.min(50, v / m * 50)); };
      var guides = [num(sc.clear), num(sc.strong)].filter(function (g) { return g != null && g > 0 && g <= m; })
        .map(function (g) { return '<i class="rvp-dguide" style="left:' + pos(-g).toFixed(1) + '%"></i><i class="rvp-dguide" style="left:' + pos(g).toFixed(1) + '%"></i>'; }).join('');
      body = '<div class="rvp-tenor">' +
        '<div class="rvp-trows" role="list"><div class="rvp-taxis" aria-hidden="true"><span></span><span class="rvp-taxis-t"><span>← 비쌈</span><span>쌈 →</span></span><span></span></div>' + rows.map(function (r, i) {
          var v = num(r.value), pv = num(r.prev), sg = num(r.sign);
          var side = r.ref ? 'ref' : sg > 0 ? 'up' : sg < 0 ? 'down' : 'zero';
          var bar = v == null ? '' : '<i class="rvp-dbar rvp-dbar--' + side + '" style="left:' + Math.min(50, pos(v)).toFixed(1) + '%;width:' + Math.abs(pos(v) - 50).toFixed(1) + '%"></i>';
          return '<div class="rvp-trow' + (r.ref ? ' is-ref' : '') + (i === S.tenorSel ? ' is-sel' : '') + '" data-i="' + i + '" role="button" tabindex="0" aria-pressed="' + (i === S.tenorSel) + '">' +
            '<span class="rvp-trow-k">' + esc(r.tenor) + '년</span>' +
            '<span class="rvp-dtrack">' + guides + '<i class="rvp-dmid"></i>' + bar + (pv != null ? '<i class="rvp-dprev" style="left:' + pos(pv).toFixed(1) + '%"></i>' : '') + '</span>' +
            '<span class="rvp-trow-l">' + esc(r.label || '') + '</span></div>';
        }).join('') + '</div>' +
        '<div class="rvp-tdetail" id="rvpTenorDetail" aria-live="polite"></div></div>';
    }
    return '<section class="wb-card rvp-fig" id="rvp-tenor">' + cardHead('테너', c.title, help, 'tenor') + '<div class="rvp-body">' + body + '</div></section>';
  }
  function tenorDetail(c) {
    var el = doc.getElementById('rvpTenorDetail'); if (!el) return;
    var rows = (c && c.rows) || [], r = rows[S.tenorSel];
    if (!r) { el.innerHTML = '<div class="rvp-tdetail-empty">막대를 누르면 기여 상위 구조</div>'; return; }
    var top = Array.isArray(r.top) ? r.top : [];
    var pvAsof = S.snap && S.snap.tenor_netting_prev && S.snap.tenor_netting_prev.asof;
    el.innerHTML = '<div class="rvp-tdetail-h"><b>' + esc(r.tenor) + '년</b>' + (r.label ? '<span>' + esc(r.label) + '</span>' : '') + helpHtml([str(r.note20)]) + '</div>' +
      // 점수 칸 = 엔진 value_text / prev_text / with20_text 그대로
      '<dl class="rvp-tdetail-kv"><div><dt>지금</dt><dd class="' + cls(r.value) + '">' + esc(tx(r, 'value_text', r.value, 2, true)) + '</dd></div>' +
      '<div><dt>이전' + (pvAsof ? ' ' + esc(mmdd(pvAsof)) : '') + '</dt><dd class="' + cls(r.prev) + '">' + esc(tx(r, 'prev_text', r.prev, 2, true)) + '</dd></div>' +
      (r.ref ? '' : '<div><dt>20년 포함</dt><dd class="' + cls(r.with20) + '">' + esc(tx(r, 'with20_text', r.with20, 2, true)) + '</dd></div>') + '</dl>' +
      '<div class="rvp-tdetail-sub">기여 상위' + helpHtml(['기여 = 엔진 값(상위 ' + top.length + '개만 제공)']) + '</div>' +
      (top.length ? '<ol class="rvp-tdetail-list">' + top.map(function (t) {
        return '<li><span>' + esc(t.name || t.key) + '</span><b class="' + cls(t.contrib) + '">' + esc(tx(t, 'contrib_text', t.contrib, 2, true)) + '</b></li>';
      }).join('') + '</ol>' : '<div class="rvp-tdetail-empty">기여 구조 목록 비어 있음</div>');
  }

  function bondHtml(c) {
    c = c || {};
    var yw = c.y_words || {};
    var help = helpHtml([c.y_label ? '세로 = ' + c.y_label : null, c.x_label ? '가로 = ' + c.x_label : null, c.pct_note,
      '점을 누르면 같은 종목의 눈에 띄는 곳 카드를 표시', (num(c.n) != null ? '종목 ' + c.n + '개' : null)]);
    var body = c.available === false ? empty('자료 없음', '이 스냅샷에 종목 산점도 재료가 없습니다.') :
      '<div class="wb-legend rvp-legend"><span class="wb-legend-item"><i class="rvp-ldot rvp-ldot--up"></i>' + esc(yw.plus || '쌈') + '(위)</span>' +
        '<span class="wb-legend-item"><i class="rvp-ldot rvp-ldot--down"></i>' + esc(yw.minus || '비쌈') + '(아래)</span>' +
        '<span class="wb-legend-item"><i class="rvp-ldot rvp-ldot--ind"></i>지표종목</span></div>' +
      '<div class="rvp-chart rvp-chart--scatter"><canvas id="rvpBondScatter" aria-label="종목 커브 잔차 산점도"></canvas></div>';
    return '<section class="wb-card rvp-fig" id="rvp-bond">' + cardHead('종목', c.title, help, 'bond') + '<div class="rvp-body">' + body + '</div></section>';
  }

  // 배지 색 = badge_key 로만(글자는 엔진 badge 그대로) · 모르는 키(bond_skew 등 새 키 포함) = 기본 중립색
  // 카드 왼쪽 테 색 = 종목 카드만(잔차 부호 = 쌈/비쌈). 페어·금리 카드의 sign 은 p=0.5 이분이라 색·글자로 쓰지 않음.
  // 옛 계약(schema 1)의 확신 배지 키 — 종목 카드에선 금리 흐름에서 나온 것이라 숨긴다(DECISIONS 3-ter-1 · 사용자 10-21).
  //   새 계약은 종목 = bond_skew 라 해당 없음. 종목 아닌 카드는 그대로.
  var BOND_CONF_KEYS = { conflict: 1, align: 1, mom_only: 1, mr_only: 1, neither: 1 };
  function noteCard(it, snap, legacy) {
    var s = series(snap, it.spark_ref);
    var sent = String(it.sentence || ''), nm = String(it.name || '');
    var sentHtml = (nm && sent.indexOf(nm) === 0) ? '<b>' + esc(nm) + '</b>' + esc(sent.slice(nm.length)) : esc(sent);
    var bk = String(it.badge_key || '').replace(/[^\w-]/g, '');
    var bond = it.kind === 'bond', sg = bond ? num(it.sign) : 0;
    if (bond && BOND_CONF_KEYS[bk]) { it = Object.assign({}, it, { badge: null, tail: null }); STATS.bondConfHidden = (STATS.bondConfHidden || 0) + 1; }
    STATS.cards++;
    return '<div class="rvp-note" data-key="' + esc(it.key) + '" data-kind="' + esc(it.kind) + '" data-bucket="' + esc(it.bucket) + '" data-lane="' + esc(it.lane) + '" data-sign="' + (sg > 0 ? 1 : sg < 0 ? -1 : 0) + '"' +
      (bond ? ' role="button" tabindex="0" aria-pressed="false"' : '') + '>' +
      '<div class="rvp-note-top">' + (it.badge ? '<span class="rvp-badge' + (bk ? ' rvp-b-' + bk : '') + '">' + esc(it.badge) + '</span>' : '') +
        (it.tail ? '<span class="rvp-tail">' + esc(it.tail) + '</span>' : '') +
        (legacy && it.also_flow ? '<span class="rvp-also">흐름 줄에도 있음</span>' : '') + '</div>' +
      '<div class="rvp-note-main"><div class="rvp-sent">' + sentHtml + '</div>' + sparkSvg(s) + '</div>' +
      (str(it.fact) ? '<div class="rvp-fact">' + esc(it.fact) + '</div>' : '') + '</div>';
  }
  // 흐름 줄 겹침 = 엔진 참조 스텁 {stub:true, ref_key, ref_lane} → 작은 칸 · 누르면 그 카드로 이동·강조
  function stubCard(it, items) {
    var rl = it.ref_lane || 'mr', ref = null;
    items.forEach(function (x) { if (!ref && !x.stub && x.key === it.ref_key && x.lane === rl && x.bucket === it.bucket) ref = x; });
    var txt = str(it.stub_text) || str(it.label) || '치우침 줄과 같은 카드';   // 엔진 stub_text 우선
    var nm = ref ? ref.name : str(it.name);
    STATS.stubs++;
    return '<div class="rvp-stub" data-ref-key="' + esc(it.ref_key) + '" data-ref-lane="' + esc(rl) + '" data-bucket="' + esc(it.bucket) + '" role="button" tabindex="0">' +
      '<span class="rvp-stub-t">' + esc(txt) + '</span>' + (nm ? '<b class="rvp-stub-n">' + esc(nm) + '</b>' : '') + '</div>';
  }
  function notableHtml(p, snap) {
    var nc = p.notable_common || {}, bl = nc.bucket_labels || {}, ll = nc.lane_labels || {};
    var items = Array.isArray(p.notable) ? p.notable : [];
    var ex = Array.isArray(p.notable_excluded) ? p.notable_excluded : [];
    var order = Object.keys(bl);
    items.forEach(function (it) { if (order.indexOf(it.bucket) < 0) order.push(it.bucket); });
    var lanes = Object.keys(ll);
    items.forEach(function (it) { if (lanes.indexOf(it.lane) < 0) lanes.push(it.lane); });
    var legacy = !items.some(function (it) { return it.stub; });   // 스텁 없는 옛 계약(also_flow)만 겹침 표식
    var help = helpHtml([
      nc.caveat,
      order.length ? '묶음: ' + order.map(function (k) { return bl[k] || k; }).join(' · ') : null,
      lanes.length ? '줄: ' + lanes.map(function (k) { return ll[k] || k; }).join(' · ') : null,
      nc.bond_badge_note, nc.bond_pct_note, nc.other_pct_note, nc.level_now_note, nc.stub_note, nc.spark_note,
      ex.length ? { html: '<b>표시 제외</b> — ' + ex.map(function (e) {
        var rk = e.ranks && typeof e.ranks === 'object' ? Object.keys(e.ranks).map(function (k) { return String(ll[k] || k).replace(/\s*상위\s*\d+$/, '') + ' ' + e.ranks[k] + '위'; }).join(' · ') : '';
        return esc(e.name || e.key) + (e.reason ? '(' + esc(e.reason) + (rk ? ' · ' + esc(rk) : '') + ')' : (rk ? '(' + esc(rk) + ')' : ''));
      }).join(' · ') } : null]);
    var h = '<section class="rvp-sec" id="rvp-notable" aria-label="' + esc(p.notable_title || '이번 주 눈에 띄는 곳') + '">' +
      '<div class="rvp-sec-head"><h2 class="rvp-sec-title">' + esc(p.notable_title || '이번 주 눈에 띄는 곳') + '</h2>' + help +
      (nc.caveat ? '<span class="wb-badge">' + esc(nc.caveat) + '</span>' : '') + jumpBtn('notable') + '</div>';
    if (!items.length) return h + '<div class="wb-card">' + empty('목록 비어 있음', '이 스냅샷의 눈에 띄는 곳 목록이 비어 있습니다.') + '</div></section>';
    h += '<div class="rvp-buckets">';
    order.forEach(function (bk) {
      var mine = items.filter(function (it) { return it.bucket === bk; });
      if (!mine.length) return;
      // 종목 주석(배지 규칙·금리 흐름 대용·당일 순위) = 툴팁. 화면 사실은 카드의 엔진 fact 가 맡는다(엔진 수선 후 임시 노출 정리)
      var bh = bk === 'bond_rv' ? helpHtml([nc.bond_badge_note, nc.bond_flow_note, nc.bond_pct_note]) : '';
      h += '<div class="wb-card rvp-bucket" data-bucket="' + esc(bk) + '"><div class="wb-card-head"><span class="wb-card-title">' + esc(bl[bk] || bk) + '</span>' + bh + '</div><div class="rvp-lanes">';
      lanes.forEach(function (ln) {
        var li = mine.map(function (it, k) { return [it, k]; }).filter(function (x) { return x[0].lane === ln; }).sort(function (a, b) {
          var ra = num(a[0].rank), rb = num(b[0].rank);
          return (ra != null && rb != null && ra !== rb) ? ra - rb : a[1] - b[1];   // 엔진 순위 · 없으면 엔진 순서
        }).map(function (x) { return x[0]; });
        // 카드가 없으면 '—' 만(추정 문구 금지)
        h += '<div class="rvp-lane"><div class="rvp-lane-h">' + esc(ll[ln] || ln) + '</div>' +
          (li.length ? li.map(function (it) { return it.stub ? stubCard(it, items) : noteCard(it, snap, legacy); }).join('') : '<div class="rvp-lane-empty" aria-label="카드 없음">—</div>') + '</div>';
      });
      h += '</div></div>';
    });
    return h + '</div></section>';
  }

  function productHtml(c) {
    c = c || {};
    var cells = Array.isArray(c.cells) ? c.cells : [], rows = Array.isArray(c.rows) ? c.rows : [];
    var tenors = [], prods = ['현물', '선물', '스왑'];
    rows.forEach(function (r) { if (tenors.indexOf(r.tenor) < 0) tenors.push(r.tenor); });
    cells.forEach(function (x) { if (tenors.indexOf(x.tenor) < 0) tenors.push(x.tenor); if (prods.indexOf(x.product) < 0) prods.push(x.product); });
    var cellOf = function (t, pr) { for (var i = 0; i < cells.length; i++) if (cells[i].tenor === t && cells[i].product === pr) return cells[i]; return null; };
    var rowOf = function (t) { for (var i = 0; i < rows.length; i++) if (rows[i].tenor === t) return rows[i]; return null; };
    var body;
    if (c.available === false || !tenors.length) body = empty('자료 없음', '이 스냅샷에 상품 비교 재료가 없습니다.');
    else body = '<table class="rvp-ptable"><thead><tr><th></th>' + prods.map(function (p) { return '<th>' + esc(p) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      tenors.map(function (t) {
        var r = rowOf(t) || {};
        var lvl = str(r.level_text) ||
          (r.ref_label && (str(r.ref_spread_text) || num(r.ref_spread_bp) != null) ? r.ref_label + ' ' + tx(r, 'ref_spread_text', r.ref_spread_bp, 1, true) + 'bp' : null);
        return '<tr><th scope="row">' + esc(t) + '년' + helpHtml([r.best ? null : r.sentence, r.leader_text, lvl]) + '</th>' +
          prods.map(function (pr) {
            var x = cellOf(t, pr);
            if (!x) return '<td class="rvp-pcell is-none">–</td>';
            return '<td class="rvp-pcell' + (x.best ? ' is-best' : '') + '"><b>' + esc(tx(x, 'rate_text', x.level_bp, 1)) + '</b><span class="' + cls(x.d5_bp) + '">' + esc(tx(x, 'd5_text', x.d5_bp, 1, true)) + '</span>' +
              (x.best ? '<span class="rvp-pbest">우위</span>' : '') + '</td>';
          }).join('') + '</tr>';
      }).join('') + '</tbody></table>' +
      // 우위가 있는 테너의 엔진 문장은 화면 글자로(‘평소보다’ 기준 · ‘(수준은 반대)’ 같은 단서가 툴팁에 묻히지 않게)
      (rows.some(function (r) { return r.best && str(r.sentence); }) ? '<ul class="rvp-claims">' + rows.filter(function (r) { return r.best && str(r.sentence); })
        .map(function (r) { return '<li>' + esc(r.sentence) + '</li>'; }).join('') + '</ul>' : '') +
      '<div class="rvp-foot">칸 = 금리 · 변화(bp)</div>';
    return '<section class="wb-card rvp-fig" id="rvp-product">' + cardHead('상품', c.title, helpHtml([c.note]), 'product') + '<div class="rvp-body">' + body + '</div></section>';
  }

  function basketHtml(c) {
    c = c || {};
    var rows = Array.isArray(c.rows) ? c.rows : [];
    var m = 0;
    rows.forEach(function (g) { (g.members || []).forEach(function (x) { var n = num(x.rel_bp); if (n != null) m = Math.max(m, Math.abs(n)); }); });
    m = (m || 1) * 1.1;
    var pos = function (v) { return 50 + Math.max(-50, Math.min(50, v / m * 50)); };
    var body;
    if (c.available === false || !rows.length) body = empty('자료 없음', '이 스냅샷에 바스켓 재료가 없습니다.');
    else body = '<div class="rvp-baskets">' + rows.map(function (g) {
      return '<div class="rvp-bgroup"><div class="rvp-bgroup-h"><b>' + esc(g.group) + '</b><span class="rvp-muted">선물</span><span class="' + cls(g.fut_d5_bp) + '">' + esc(tx(g, 'fut_d5_text', g.fut_d5_bp, 1, true)) + 'bp</span>' +
        helpHtml([g.state, str(g.basket_avg_d5_text) ? '바스켓 평균 ' + g.basket_avg_d5_text + 'bp' : null, str(g.note)]) + '</div>' +
        (g.members || []).map(function (x) {
          var v = num(x.rel_bp);
          var bar = v == null ? '' : '<i class="rvp-dbar rvp-dbar--' + (v > 0 ? 'up' : v < 0 ? 'down' : 'zero') + '" style="left:' + Math.min(50, pos(v)).toFixed(1) + '%;width:' + Math.abs(pos(v) - 50).toFixed(1) + '%"></i>';
          return '<div class="rvp-brow" title="' + esc((x.code || '') + (str(x.d5_text) ? ' · 주간 ' + x.d5_text + 'bp' : '')) + '"><span class="rvp-brow-k">' + esc(x.short || x.code) + '</span>' +
            '<span class="rvp-dtrack"><i class="rvp-dmid"></i>' + bar + '</span>' +
            '<span class="rvp-brow-v ' + cls(x.rel_bp) + '">' + esc(tx(x, 'rel_text', x.rel_bp, 1, true)) + '</span><span class="rvp-brow-l">' + esc(x.label || '') + '</span></div>';
        }).join('') + '</div>';
    }).join('') + '</div><div class="rvp-foot">막대 = 선물 대비 상대(bp)</div>';
    return '<section class="wb-card rvp-fig" id="rvp-basket">' + cardHead('바스켓', c.title, helpHtml([c.rel_rule, c.note]), 'basket') + '<div class="rvp-body">' + body + '</div></section>';
  }

  function trustHtml(sb) {
    var t = sb && sb.available !== false ? sb.plain : null;
    var head = function (title, help, extra) { return cardHead('믿어도 되나', title, help, 'trust', '', extra); };
    if (!sb || sb.available === false) {
      return '<section class="wb-card rvp-fig" id="rvp-trust">' + head('스코어보드 없음', '') + '<div class="rvp-body">' +
        empty('준비 중', (sb && sb.note) || '스코어보드를 읽지 못했습니다.') + '</div></section>';
    }
    if (!t || typeof t !== 'object') {
      return '<section class="wb-card rvp-fig" id="rvp-trust">' + head('일반 보기 준비 중', '') + '<div class="rvp-body">' +
        empty('준비 중', '스코어보드에 일반 보기 재료가 아직 없습니다. 숫자 보기에서 고급 보기의 표를 볼 수 있습니다.') + '</div></section>';
    }
    var rows = Array.isArray(t.rows) ? t.rows : [];
    var df = t.definition || {}, lb = t.labels || {};
    var base = num(t.baseline);
    var meta = [t.horizon_label, num(t.n_weeks) != null ? t.n_weeks + '주' : null, (t.first_week && t.last_week) ? mmdd(t.first_week) + '~' + mmdd(t.last_week) : null].filter(Boolean).join(' · ');
    // 엔진 subtitle(짧은 판정 보류 안내)이 있으면 그것이 화면 글자 · baseline_note 는 ? 로. 없으면(옛 계약) baseline_note 를 화면 글자로.
    var sub = str(t.subtitle);
    // 헤더 ? — baseline_note 가 baseline_label 로 시작하면(엔진 원문) 라벨을 따로 또 찍지 않는다(웹 중복 제거)
    var noteTip = sub ? str(t.baseline_note) : null;
    var labelTip = (noteTip && t.baseline_label && noteTip.indexOf(t.baseline_label) === 0) ? null : t.baseline_label;
    var help = helpHtml([df.mr, df.momentum, labelTip, noteTip, num(t.min_n) != null ? '판정 최소 표본 ' + t.min_n + '건' : null, lb.pnl,
      (t.first_week && t.last_week) ? '봉인 주차 ' + t.first_week + ' ~ ' + t.last_week : null]);
    var anyCaution = rows.some(function (r) { return r.baseline_caution === true || r.baseline_valid === false; });
    var why = function (r) {   // 판정 보류 등 짧은 사유(엔진 문자열) — 툴팁이 아니라 화면 글자
      var ks = ['verdict_reason', 'verdict_note', 'reason', 'hold_reason'];
      for (var k = 0; k < ks.length; k++) if (str(r[ks[k]])) return r[ks[k]];
      return null;
    };
    // 보류 사유는 subtitle 이 화면에 있으면 행마다 반복하지 않고 그 행 ? 로 · subtitle 이 없으면 첫 보류 행에만 한 번 화면 글자
    var whyShow = -1;
    if (!sub) rows.forEach(function (r, i) { if (whyShow < 0 && why(r)) whyShow = i; });
    var body = rows.length ? '<div class="rvp-trust">' +
      // 기준선 주의 원문 — 엔진 수선 전까지 툴팁이 아니라 카드 위 작은 글자(민재 계약)
      (sub ? '<div class="rvp-trust-note"><span aria-hidden="true">※ </span>' + esc(sub) + '</div>' :
        anyCaution && str(t.baseline_note) ? '<div class="rvp-trust-note"><span aria-hidden="true">※ </span>' + esc(t.baseline_note) + '</div>' : '') +
      '<div class="rvp-trust-axis"><span></span><span class="rvp-trust-axis-bar">' + (base != null ? '<i style="left:' + (base * 100).toFixed(1) + '%">' + esc(t.baseline_label || '') + '</i>' : '') + '</span><span></span></div>' +
      rows.map(function (r, i) {
        var pct = num(r.pct), w = pct == null ? 0 : Math.max(0, Math.min(100, pct));
        // 50% 기준선이 이 행에 타당한가 = 엔진 baseline_valid(있으면) · 없으면 baseline_caution 의 반대
        var caution = (r.baseline_valid != null) ? r.baseline_valid === false : r.baseline_caution === true, wy = why(r);
        var rh = helpHtml([wy && i !== whyShow ? wy : null, r.factor === 'mr' ? df.mr : r.factor === 'momentum' ? df.momentum : null,
          str(r.pct_2w_text) ? '2주 뒤 ' + r.pct_2w_text + (num(r.n_judged_2w) != null ? '(' + r.n_judged_2w + '건)' : '') : null,
          str(r.pnl_ref_text) ? '참고 손익 ' + r.pnl_ref_text + ' — ' + (lb.pnl || '단독판정 금지') : null]);
        var gap = i > 0 && rows[i - 1].bucket !== r.bucket ? ' is-gap' : '';
        return '<div class="rvp-trust-row' + gap + (caution ? ' is-caution' : '') + '" data-bucket="' + esc(r.bucket) + '" data-factor="' + esc(r.factor) + '">' +
          '<span class="rvp-trust-l">' + (caution ? '<span class="rvp-trust-mark" title="기준선 주의 행">※</span>' : '') + esc(r.label || ((r.bucket_label || '') + ' ' + (r.factor_label || ''))) + '</span>' +
          // 기준선 주의 행 = 50% 눈금을 긋지 않음(50% 기준 판정 금지 · 막대 흐림)
          '<span class="rvp-trust-bar"><i class="rvp-trust-fill" style="width:' + w.toFixed(1) + '%"></i>' + (base != null && !caution ? '<i class="rvp-trust-base" style="left:' + (base * 100).toFixed(1) + '%"></i>' : '') + '</span>' +
          '<span class="rvp-trust-v"><b>' + esc(str(r.pct_text) || (pct == null ? '–' : pct + '%')) + '</b><span class="rvp-muted">' + (num(r.n_hit) != null && num(r.n_judged) != null ? esc(r.n_hit) + '/' + esc(r.n_judged) : '') + '</span></span>' +
          '<span class="rvp-trust-verdict"><span class="rvp-trust-vt">' + esc(r.verdict || '') + rh + '</span>' + (wy && i === whyShow ? '<span class="rvp-trust-why">' + esc(wy) + '</span>' : '') + '</span></div>';
      }).join('') + '</div>' : empty('행 없음', '스코어보드 일반 보기 재료에 행이 없습니다.');
    return '<section class="wb-card rvp-fig" id="rvp-trust">' + head(t.title, help, lb.page ? '<span class="wb-badge">' + esc(lb.page) + '</span>' : '') +
      '<div class="rvp-body">' + (meta ? '<div class="rvp-foot rvp-foot--top">' + esc(meta) + '</div>' : '') + body + '</div></section>';
  }

  function evidenceHtml(p) {
    var ev = p.evidence || {}, gl = p.glossary || {};
    var gterms = gl.terms || {}, gex = gl.examples || {};
    var glo = Object.keys(gterms).length || Object.keys(gex).length;
    var item = function (label, paras) { var hh = helpHtml(paras); return hh ? '<span class="rvp-evi-item">' + esc(label) + hh + '</span>' : ''; };
    return '<section class="wb-card rvp-fig" id="rvp-evidence">' + cardHead('근거', '손익 · 부호 · 용어', '', 'evidence') +
      '<div class="rvp-body rvp-evi">' +
        item('이번 주 손익', [ev.factor_line]) +
        item('부호와 색', [p.sign_rule]) +
        (glo ? '<span class="rvp-evi-item">용어표<span class="wb-help" role="button" tabindex="0" aria-label="용어표 보기" data-help-ref="wbRevGlossary"></span></span>' : '') +
        item('비교 창', [p.window_label ? '비교 = ' + p.window_label : null, wwNote()]) +
      '</div></section>';
  }

  // 용어표(? 원문) — 고급 보기 말 → 일반 보기 말. 화면 텍스트가 아니라 툴팁 원문 보관소(#wbRevGlossary)에만.
  function fillGlossary(p) {
    var el = doc.getElementById('wbRevGlossary'); if (!el) return;
    var gl = (p && p.glossary) || {}, rows = [];
    [gl.terms || {}, gl.examples || {}].forEach(function (o) { Object.keys(o).forEach(function (k) { rows.push('<tr><td>' + esc(k) + '</td><td>' + esc(o[k]) + '</td></tr>'); }); });
    el.innerHTML = rows.length ? '<p><b>용어표</b> — 고급 보기 말 → 일반 보기 말' + (p.glossary_version != null ? ' (v' + esc(p.glossary_version) + ')' : '') + '</p><table class="rvp-gloss"><tbody>' + rows.join('') + '</tbody></table>' : '';
  }

  // ── 목차(일반 보기) ─────────────────────────────────────────────────────
  var TOC = [['rvp-head', '결론'], ['rvp-rates', '금리'], ['rvp-curve', '커브'], ['rvp-tenor', '테너'], ['rvp-bond', '종목'],
    ['rvp-notable', '눈에 띄는 곳'], ['rvp-cross', '상품·바스켓'], ['rvp-trust', '믿어도 되나'], ['rvp-evidence', '근거']];
  var tocHeads = [], tocLinks = [];
  function buildToc(ready, msg) {
    var ul = doc.getElementById('wbRevTocPlain'); if (!ul) return;
    tocHeads = []; tocLinks = [];
    if (!ready) { ul.innerHTML = '<li class="rv-toc-empty">' + esc(msg || '준비 중') + '</li>'; return; }
    var items = [], n = 0;
    TOC.forEach(function (t) {
      var el = doc.getElementById(t[0]); if (!el) return;
      tocHeads.push(el); n++;
      items.push('<li><a href="#" data-i="' + (tocHeads.length - 1) + '"><span class="rv-toc-num">' + (n < 10 ? '0' : '') + n + '</span>' + esc(t[1]) + '</a></li>');
    });
    ul.innerHTML = items.join('');
    tocLinks = Array.prototype.slice.call(ul.querySelectorAll('a[data-i]'));
    tocLinks.forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var t = tocHeads[+a.getAttribute('data-i')]; if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    spy();
  }
  function spy() {
    if (S.view !== 'plain' || !tocLinks.length) return;
    var cs = getComputedStyle(doc.documentElement);
    var off = (parseFloat(cs.getPropertyValue('--wb-shell-h')) || 48) + (parseFloat(cs.getPropertyValue('--wb-filterbar-h')) || 0) + 24;
    var cur = 0;
    for (var i = 0; i < tocHeads.length; i++) { if (tocHeads[i].getBoundingClientRect().top - off <= 0) cur = i; }
    if (window.innerHeight + window.scrollY >= doc.documentElement.scrollHeight - 4) cur = tocHeads.length - 1;   // 맨 아래 = 마지막 항목
    tocLinks.forEach(function (a) { a.classList.toggle('is-active', +a.getAttribute('data-i') === cur); });
    var act = tocLinks[cur], ul = doc.getElementById('wbRevTocPlain');
    if (act && ul && window.innerWidth <= 720) {
      var bar = ul.parentElement, l = act.offsetLeft, rr = l + act.offsetWidth;
      if (l < bar.scrollLeft || rr > bar.scrollLeft + bar.clientWidth) bar.scrollLeft = Math.max(0, l - 16);
    }
  }
  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return; ticking = true;
    requestAnimationFrame(function () { ticking = false; spy(); });
  }, { passive: true });

  // ── 차트 ────────────────────────────────────────────────────────────────
  function valueLabels(fmt) {   // 막대 끝 숫자(부호 포함) — 색만으로 뜻 전하지 않게
    return { id: 'rvpValueLabels', afterDatasetsDraw: function (ch) {
      var ctx = ch.ctx, meta = ch.getDatasetMeta(0);
      ctx.save(); ctx.font = '11px ' + (css('--wb-font') || 'sans-serif'); ctx.fillStyle = css('--wb-ink'); ctx.textAlign = 'center';
      meta.data.forEach(function (el, i) {
        var v = ch.data.datasets[0].data[i]; if (v == null) return;
        ctx.textBaseline = v >= 0 ? 'bottom' : 'top';
        ctx.fillText(fmt(v, i), el.x, v >= 0 ? el.y - 2 : el.y + 2);
      });
      ctx.restore();
    } };
  }
  function mountRates(c, snap) {
    var cr = (c && c.curve_ref) || {};
    var now = get(snap, cr.now), prev = get(snap, cr.prev);
    var cv = doc.getElementById('rvpRatesCurve');
    if (cv) {
      if (Array.isArray(now) && now.length) {
        var mk = function (a) { return (Array.isArray(a) ? a : []).map(function (p) { return { x: p[0], y: p[1] }; }); };
        track(new Chart(cv.getContext('2d'), { type: 'line', data: { datasets: [
          { label: '지금 ' + mmdd(c.curve_now_date), data: mk(now), borderColor: tok('--wb-series-1'), backgroundColor: tok('--wb-series-1'), borderWidth: 1.8, pointRadius: 0, tension: .25 },
          { label: '비교 ' + mmdd(c.curve_prev_date), data: mk(prev), borderColor: tok('--wb-muted'), backgroundColor: tok('--wb-muted'), borderDash: [4, 3], borderWidth: 1.2, pointRadius: 0, tension: .25 } ] },
          options: { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'nearest', intersect: false },
            plugins: { legend: { align: 'end', labels: { boxWidth: 14 } },
              tooltip: { callbacks: { label: function (x) { return ' ' + x.dataset.label + ' · 잔존 ' + nfix(x.parsed.x, 2) + '년 · ' + nfix(x.parsed.y, 3) + '%'; } } } },
            scales: { x: { type: 'linear', title: { display: true, text: c.x_label || '' } }, y: { title: { display: true, text: c.y_label || '' } } } } }));
      } else { cv.parentElement.innerHTML = '<div class="rvp-chart-none">일드커브 점 없음(curve_ref 미해결)</div>'; STATS.gaps.push('rates.curve_ref 미해결'); }
    }
    var cb = doc.getElementById('rvpRatesChg'), tc = (c && Array.isArray(c.tenor_change)) ? c.tenor_change : [];
    if (cb && tc.length) {
      track(new Chart(cb.getContext('2d'), { type: 'bar',
        data: { labels: tc.map(function (t) { return t.tenor + '년' + (t.ref ? '(참고)' : ''); }),
          datasets: [{ label: '변화(' + (c.unit || 'bp') + ')', data: tc.map(function (t) { return num(t.change_bp); }), borderRadius: 2, maxBarThickness: 28,
            _texts: tc.map(function (t) { return tx(t, 'change_text', t.change_bp, 1, true); }),   // 막대 끝 글자 = 엔진 change_text
            backgroundColor: function (x) { var t = tc[x.dataIndex] || {}, v = num(t.change_bp); return t.ref ? alpha('--wb-muted', .45) : alpha(v > 0 ? '--wb-up' : v < 0 ? '--wb-down' : '--wb-muted', .85); } }] },
        options: { responsive: true, maintainAspectRatio: false, animation: false, layout: { padding: { top: 14, bottom: 2 } },
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (x) {
            var t = tc[x.dataIndex] || {}; return ' ' + tx(t, 'change_text', t.change_bp, 1, true) + (c.unit || 'bp') + ' · 지금 ' + tx(t, 'now_text', t.now_bp, 1) + (t.ref ? ' · ' + (c.ref_note || '참고') : ''); } } } },
          scales: { x: { grid: { display: false } }, y: { display: false, grace: '25%' } } },
        plugins: [valueLabels(function (v, i) { return tx(tc[i], 'change_text', v, 1, true); })] }));
    }
  }

  function mountCurveTrend(c, snap) {
    var rows = (c && c.rows) || [], r = rows[S.curveSel];
    var hd = doc.getElementById('rvpCurveTrendH'), cv = doc.getElementById('rvpCurveTrend');
    if (!hd || !cv) return;
    var s = r ? series(snap, r.spark_ref) : null;   // 1년 추이 = 엔진 spark_ref(src curve_range_1y · 끝 날짜 ≠ to → 추이 없음)
    if (S.curveTrend) { try { S.curveTrend.destroy(); } catch (e) { /* noop */ } charts = charts.filter(function (x) { return x !== S.curveTrend; }); S.curveTrend = null; }
    if (!r) return;
    if (!r || !s) { hd.innerHTML = '<span>' + esc(r ? (r.name || r.key) : '') + '</span><span class="rvp-muted">추이 없음</span>'; cv.style.display = 'none'; return; }
    cv.style.display = '';
    hd.innerHTML = '<span><b>' + esc(r.key) + '</b> ' + esc(r.name || '') + ' 추이</span><span class="rvp-muted">' + esc(s.dates[0]) + ' ~ ' + esc(s.dates[s.dates.length - 1]) + ' · ' + s.values.length + ' 관측</span>';
    S.curveTrend = track(new Chart(cv.getContext('2d'), { type: 'line',
      data: { labels: s.dates.map(mmdd), datasets: [{ label: r.key, data: s.values.map(num), borderColor: tok('--wb-series-1'), borderWidth: 1.5, pointRadius: function (x) { return x.dataIndex === s.values.length - 1 ? 3 : 0; }, pointBackgroundColor: tok('--wb-ink'), spanGaps: false, tension: .2 }] },
      options: { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (x) { return ' ' + r.key + ' ' + f1(x.raw) + 'bp'; } } } },
        scales: { x: { ticks: { maxTicksLimit: 5, autoSkip: true, maxRotation: 0 }, grid: { display: false } }, y: { ticks: { maxTicksLimit: 4 } } } } }));
  }
  function pickCurve(i, c, snap) {
    S.curveSel = (S.curveSel === i) ? -1 : i;   // 같은 줄 다시 누르면 추이 닫힘
    i = S.curveSel;
    var box = doc.getElementById('rvpCurveTrendBox'); if (box) box.hidden = i < 0;
    Array.prototype.forEach.call(doc.querySelectorAll('#rvp-curve .rvp-crow'), function (el) {
      var on = +el.getAttribute('data-i') === i; el.classList.toggle('is-sel', on); el.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    mountCurveTrend(c, snap);
  }
  function pickTenor(i, c) {
    S.tenorSel = i;
    Array.prototype.forEach.call(doc.querySelectorAll('#rvp-tenor .rvp-trow'), function (el) {
      var on = +el.getAttribute('data-i') === i; el.classList.toggle('is-sel', on); el.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    tenorDetail(c);
  }

  function mountScatter(c, snap) {
    var cv = doc.getElementById('rvpBondScatter'); if (!cv) return;
    var pts = bondPoints(snap, c);
    S.bondPts = pts;
    if (!pts.length) { cv.parentElement.innerHTML = '<div class="rvp-chart-none">종목 점 없음(points_ref 미해결)</div>'; STATS.gaps.push('bond_scatter.points_ref 미해결'); return; }
    var lbl = {}; (Array.isArray(c.labels) ? c.labels : []).forEach(function (l) { if (l && l.code) lbl[l.code] = l.short || l.code; });
    var yw = c.y_words || {};
    var word = function (y) { return y > 0 ? (yw.plus || '') : y < 0 ? (yw.minus || '') : (yw.zero || ''); };   // 엔진 y_words 그대로(부호 → 글자)
    var noteOf = {}; ((S.snap && S.snap.plain && S.snap.plain.notable) || []).forEach(function (it) { if (it.kind === 'bond') noteOf[it.key] = it; });
    var labels = { id: 'rvpScatterLabels', afterDatasetsDraw: function (ch) {
      var ctx = ch.ctx, meta = ch.getDatasetMeta(0), area = ch.chartArea, boxes = [], H = 13;
      ctx.save(); ctx.font = '11px ' + (css('--wb-font') || 'sans-serif'); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      var hit = function (r) { for (var k = 0; k < boxes.length; k++) { var q = boxes[k]; if (r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y) return true; } return false; };
      var order = [];
      meta.data.forEach(function (el, i) { var p = pts[i]; if (p && (lbl[p.id] || p === S.bondSel)) order.push([el, p]); });
      order.sort(function (a, b) { return (a[1] === S.bondSel ? -1 : 0) - (b[1] === S.bondSel ? -1 : 0); });   // 선택 점 먼저 자리 잡음
      order.forEach(function (o) {
        var el = o[0], p = o[1], t = lbl[p.id] || p.short, w = ctx.measureText(t).width + 2;
        var cand = [[7, -9], [7, 9], [-7 - w, -9], [-7 - w, 9], [7, -21], [7, 21], [-7 - w, -21], [-7 - w, 21]], pick = null;
        for (var k = 0; k < cand.length && !pick; k++) {
          var r = { x: el.x + cand[k][0], y: el.y + cand[k][1] - H / 2, w: w, h: H };
          if (r.x >= area.left && r.x + r.w <= area.right && r.y >= area.top - 2 && r.y + r.h <= area.bottom + 2 && !hit(r)) pick = r;
        }
        if (!pick) pick = { x: Math.min(el.x + 7, area.right - w), y: el.y - 9 - H / 2, w: w, h: H };
        boxes.push(pick);
        ctx.fillStyle = p === S.bondSel ? css('--wb-ink') : css('--wb-muted');
        ctx.fillText(t, pick.x, pick.y + H / 2);
      });
      ctx.restore();
    } };
    var col = function (p, a) { return alpha(p.y > 0 ? '--wb-up' : p.y < 0 ? '--wb-down' : '--wb-muted', a); };
    S.scatter = track(new Chart(cv.getContext('2d'), { type: 'scatter',
      data: { datasets: [{ label: '종목', data: pts,
        pointRadius: function (x) { var p = x.raw; return p === S.bondSel ? 7 : p && p.ind ? 4.5 : 3.2; },
        pointHoverRadius: 7,
        pointBackgroundColor: function (x) { var p = x.raw; return !p ? 'rgba(0,0,0,0)' : p.ind ? col(p, .15) : col(p, p === S.bondSel ? 1 : .8); },
        pointBorderColor: function (x) { var p = x.raw; return !p ? 'rgba(0,0,0,0)' : p === S.bondSel ? css('--wb-ink') : col(p, 1); },
        pointBorderWidth: function (x) { var p = x.raw; return p === S.bondSel ? 2 : p && p.ind ? 2 : 1; } }] },
      options: { responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: {
          title: function (it) { var p = it[0] && it[0].raw; return p ? p.short + (p.ind ? ' · 지표종목' : '') : ''; },
          label: function (x) { var p = x.raw; return ' 잔존 ' + nfix(p.x, 2) + '년' + (word(p.y) ? ' · 커브 대비 ' + word(p.y) : ''); },
          afterLabel: function (x) { var n = noteOf[x.raw.id]; return n ? ' ' + n.sentence : ''; } } } },
        scales: {
          x: { type: 'linear', title: { display: true, text: c.x_label || '' } },
          y: { title: { display: true, text: c.y_label || '' }, grid: { color: function (x) { return x.tick && x.tick.value === 0 ? css('--wb-rule-strong') : css('--wb-rule'); }, lineWidth: function (x) { return x.tick && x.tick.value === 0 ? 1.5 : 1; } } } },
        onClick: function (e, els) { if (els.length) pickBond(pts[els[0].index], 'chart'); } },
      plugins: [labels] }));
  }
  function pickBond(p, from) {
    S.bondSel = p || null;
    if (S.scatter) {
      S.scatter.update('none');
      var i = p ? S.bondPts.indexOf(p) : -1;
      if (i >= 0 && from !== 'chart') {
        try { S.scatter.setActiveElements([{ datasetIndex: 0, index: i }]); S.scatter.tooltip.setActiveElements([{ datasetIndex: 0, index: i }], { x: 0, y: 0 }); S.scatter.update('none'); } catch (e) { /* noop */ }
      }
    }
    var card = null;
    Array.prototype.forEach.call(doc.querySelectorAll('#rvp-notable .rvp-note'), function (el) {   // 강조는 한 장만(스텁으로 켠 다른 카드 강조도 해제)
      var bond = el.getAttribute('data-kind') === 'bond';
      var on = bond && !!p && el.getAttribute('data-key') === String(p.id) && !card;
      el.classList.toggle('is-linked', on);
      if (bond) el.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (on) card = el;
    });
    if (from === 'chart' && card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (from === 'card') { var fig = doc.getElementById('rvp-bond'); if (fig) fig.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  }

  // ── 렌더 ────────────────────────────────────────────────────────────────
  function wwNote() {   // 비교 창 설명 = 엔진 week_window.note 원문
    var s = S.snap || {}, ww = s.week_window || (s.meta || {}).week_window || {};
    return str(ww.note);
  }
  function windowBadge(p) {
    var el = doc.getElementById('wbRevWindow'); if (!el) return;
    var nonstd = !!(p && p.window && p.window.standard === false && p.window_label);
    el.hidden = !nonstd;
    el.innerHTML = nonstd ? esc(p.window_label) + helpHtml([wwNote(), '결론·그림 제목 앞 기간 = 엔진 문장 그대로']) : '';
  }
  // ★plain 없을 때 고급으로 폴백(사용자 10-21 배포 승인 조건 — 아침 daily-refresh 6c 전 첫 화면이 '준비 중'이 되지 않게).
  //   조건: 일반 보기 재료(plain + schema)가 없고 · 이번 세션에 사용자가 보기를 직접 고르지 않았고 · 링크가 #review/plain 이 아님.
  //   기억값(localStorage)은 읽기만 · 쓰지 않는다 → plain 이 실리는 로드부터 원래대로(기억값 또는 기본 일반).
  //   일반 버튼은 살아 있음(누르면 '준비 중' 빈 상태 · 그때부터는 사용자 선택이라 저장).
  function fallback(usable) {
    var bp = doc.getElementById('revViewPlain');
    if (bp) { if (usable) bp.removeAttribute('title'); else bp.title = '일반 보기 재료가 아직 없음 — 누르면 준비 중 화면'; }
    if (!S.explicit && hashView() !== 'plain') {
      if (!usable && S.view === 'plain') { setView('adv', { scrollTop: false }); S.autoFb = true; }
      else if (usable && S.autoFb) { S.autoFb = false; setView(hashView() || storedView() || 'plain', { scrollTop: false }); }
    }
    STATS.fallback = S.autoFb && S.view === 'adv';
  }
  function render(snap, sb, err) {
    var host = doc.getElementById('revPlain'); if (!host) return;
    destroyCharts();
    S.snap = snap || null; S.sb = sb || null; S.bondSel = null; S.curveTrend = null;
    STATS.charts = 0; STATS.cards = 0; STATS.stubs = 0; STATS.bondConfHidden = 0; STATS.sparks = 0; STATS.nospark = 0; STATS.gaps = [];
    var p = snap && snap.available !== false ? snap.plain : null;
    fallback(!err && !!(p && typeof p === 'object' && p.schema != null));
    windowBadge(p && typeof p === 'object' ? p : null);
    fillGlossary(p && typeof p === 'object' ? p : null);
    var go = '<div class="rvp-empty-act"><button type="button" class="wb-btn wb-btn--sm" data-rv-go="adv">고급 보기로</button></div>';
    if (err) {
      STATS.state = 'error';
      host.innerHTML = '<div class="wb-card">' + empty('읽기 실패', err) + '</div>';
      buildToc(false, '읽기 실패'); return;
    }
    if (!snap || snap.available === false) {
      STATS.state = 'unavailable';
      host.innerHTML = '<div class="wb-card">' + empty('스냅샷 없음', (snap && snap.note) || 'market_review_snapshot.json 미생성') + '</div>';
      buildToc(false, '스냅샷 없음'); return;
    }
    if (!p || typeof p !== 'object') {
      STATS.state = 'no-plain';
      host.innerHTML = '<div class="wb-card rvp-empty" id="rvp-head">' + empty('일반 보기 준비 중',
        '이 스냅샷(기준일 ' + (snap.asof || '?') + ')에는 일반 보기 재료가 아직 없습니다. 고급 보기에서 전체 내용을 볼 수 있습니다.', go) + '</div>';
      buildToc(false, '준비 중'); return;
    }
    STATS.state = 'plain';
    var ch = p.charts || {};
    var warns = (Array.isArray(p.warnings) ? p.warnings.slice() : []);
    // 지원 schema = 1(ae87f7dc) · 2(§3-ter: stub·bond_skew·verdict_reason·subtitle·track). 그보다 새 것은 정직 경고(그리기는 계속).
    if (num(p.schema) != null && num(p.schema) > PLAIN_SCHEMA_MAX) warns.push('일반 보기 재료 schema ' + p.schema + ' — 이 화면은 schema ' + PLAIN_SCHEMA_MAX + ' 까지 기준으로 그립니다');
    // 테너 기본 선택 = 참고(20년) 제외 |값| 최대 행(강조 위치만 — 값·판정은 엔진 그대로)
    S.tenorSel = -1; S.curveSel = -1;   // 커브 추이 = 줄을 누를 때만(첫 화면 높이)
    var tv = (ch.tenor_value && Array.isArray(ch.tenor_value.rows)) ? ch.tenor_value.rows : [], best = -1;
    tv.forEach(function (r, i) { var a = Math.abs(num(r.value)); if (!r.ref && isFinite(a) && a > best) { best = a; S.tenorSel = i; } });
    host.innerHTML =
      (warns.length ? '<div class="rvp-warn" role="alert">⚠ 일반 보기 재료 경고 ' + warns.length + '건 — ' + warns.map(esc).join(' · ') + '</div>' : '') +
      conclusionHtml(p) +
      '<div class="rvp-grid">' + ratesHtml(ch.rates) + curveHtml(ch.curve_shape, snap) + tenorHtml(ch.tenor_value) + bondHtml(ch.bond_scatter) + '</div>' +
      notableHtml(p, snap) +
      '<div class="rvp-grid" id="rvp-cross">' + productHtml(ch.product_map) + basketHtml(ch.basket) + '</div>' +
      trustHtml(sb) +
      evidenceHtml(p);
    // 차트 · 연계
    var safe = function (name, fn) { try { fn(); } catch (e) { STATS.gaps.push(name + ': ' + (e && e.message)); if (window.console) console.warn('wb review plain', name, e); } };
    if (window.Chart) {
      if (ch.rates && ch.rates.available !== false) safe('rates', function () { mountRates(ch.rates, snap); });
      if (ch.bond_scatter && ch.bond_scatter.available !== false) safe('scatter', function () { mountScatter(ch.bond_scatter, snap); });
    }
    safe('tenor', function () { tenorDetail(ch.tenor_value); });
    buildToc(true);
  }

  // ── 이벤트(위임) ────────────────────────────────────────────────────────
  function activate(el) {
    var ch = (S.snap && S.snap.plain && S.snap.plain.charts) || {};
    if (el.classList.contains('rvp-crow')) { pickCurve(+el.getAttribute('data-i'), ch.curve_shape, S.snap); return true; }
    if (el.classList.contains('rvp-trow')) { pickTenor(+el.getAttribute('data-i'), ch.tenor_value); return true; }
    if (el.classList.contains('rvp-stub')) {   // 참조 스텁 → 같은 묶음·참조 줄의 카드로 이동·강조
      var tgt = null;
      Array.prototype.forEach.call(doc.querySelectorAll('#rvp-notable .rvp-note'), function (c) {
        if (!tgt && c.getAttribute('data-key') === el.getAttribute('data-ref-key') && c.getAttribute('data-lane') === el.getAttribute('data-ref-lane') &&
            c.getAttribute('data-bucket') === el.getAttribute('data-bucket')) tgt = c;
      });
      if (!tgt) return true;
      if (tgt.getAttribute('data-kind') === 'bond') { activate(tgt); }
      else {
        Array.prototype.forEach.call(doc.querySelectorAll('#rvp-notable .rvp-note.is-linked'), function (c) { c.classList.remove('is-linked'); });
        tgt.classList.add('is-linked');
      }
      tgt.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return true;
    }
    if (el.classList.contains('rvp-note') && el.getAttribute('data-kind') === 'bond') {
      var key = el.getAttribute('data-key'), p = null;
      S.bondPts.forEach(function (q) { if (String(q.id) === key) p = q; });
      if (S.bondSel && p === S.bondSel) pickBond(null, 'card'); else pickBond(p || null, 'card');
      if (!p) el.classList.add('is-linked');
      return true;
    }
    return false;
  }
  doc.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var v = t.closest('#view-review button[data-rv-set]');
    if (v) { setView(v.getAttribute('data-rv-set'), { store: true, hash: true }); return; }
    var go = t.closest('#revPlain [data-rv-go]');
    if (go) { setView(go.getAttribute('data-rv-go'), { store: true, hash: true }); return; }
    var j = t.closest('#revPlain [data-rv-jump]');
    if (j) { jumpTo(j.getAttribute('data-rv-jump')); return; }
    var row = t.closest('#revPlain .rvp-crow, #revPlain .rvp-trow, #revPlain .rvp-note, #revPlain .rvp-stub');
    if (row) activate(row);
  });
  doc.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var t = e.target;
    if (!t || !t.closest || t.classList.contains('wb-help')) return;
    var row = t.closest('#revPlain .rvp-crow, #revPlain .rvp-trow, #revPlain .rvp-note, #revPlain .rvp-stub');
    if (row && row === t && activate(row)) e.preventDefault();
  });
  window.addEventListener('hashchange', function () { var hv = hashView(); if (hv && hv !== S.view) setView(hv, {}); });

  // ── 초기 보기 ── 링크(#review/adv · #review/plain) > 기억 > 일반
  setView(hashView() || storedView() || 'plain', { scrollTop: false });

  window.WBRevPlain = { render: render, setView: setView, getView: function () { return S.view; },
    _series: series, _bondPoints: bondPoints, _get: get };
})();
