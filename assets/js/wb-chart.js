/* ═══════════════════════════════════════════════════════════════════════════
   wb-chart.js — Chart.js 테마 (CSS 변수 → Chart.defaults) · 테마 전환 시 재색칠
   2026-10-21 redesign-wb 1단계
   ───────────────────────────────────────────────────────────────────────────
   로드 순서: Chart.js(CDN) → wb-chart.js → 페이지 스크립트.
   ■ 축·그리드·라벨·툴팁·범례 색은 Chart.defaults 로 일괄 — 차트 옵션에 색을 직접 쓰지 말 것
     (직접 쓴 리터럴 색은 테마가 바뀌어도 안 바뀐다).
   ■ 시리즈 색은 토큰으로: borderColor: WBChart.tok('--wb-series-1')   ← 함수(scriptable)라
     테마 전환 후 chart.update() 때 다시 읽힌다.
   ■ 'wb-themechange' 이벤트(wb-shell.js) → defaults 재설정 + 모든 차트 update.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  function css(name) {
    try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
    catch (e) { return ''; }
  }
  // 'var(--x)' · '--x' · 일반 색 문자열 → 실제 색
  function color(c) {
    if (c == null) return c;
    var s = String(c).trim();
    var m = s.match(/^var\((--[\w-]+)\)$/);
    if (m) return css(m[1]);
    if (s.slice(0, 2) === '--') return css(s);
    return s;
  }
  // 색 + 투명도 → rgba()
  function alpha(c, a) {
    var s = color(c) || '';
    var r, g, b, m;
    if ((m = s.match(/^#([0-9a-f]{3})$/i))) {
      r = parseInt(m[1][0] + m[1][0], 16); g = parseInt(m[1][1] + m[1][1], 16); b = parseInt(m[1][2] + m[1][2], 16);
    } else if ((m = s.match(/^#([0-9a-f]{6})/i))) {
      r = parseInt(m[1].slice(0, 2), 16); g = parseInt(m[1].slice(2, 4), 16); b = parseInt(m[1].slice(4, 6), 16);
    } else if ((m = s.match(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i))) {
      r = +m[1]; g = +m[2]; b = +m[3];
    } else { return s; }
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }
  // scriptable 옵션용 — 매 렌더마다 현재 테마 색을 읽음
  function tok(c, a) { return function () { return a == null ? color(c) : alpha(c, a); }; }

  function apply() {
    var C = window.Chart;
    if (!C || !C.defaults) return;
    var d = C.defaults;
    var ink = css('--wb-ink'), muted = css('--wb-muted'), rule = css('--wb-rule'), ruleS = css('--wb-rule-strong'), surf = css('--wb-surface');
    d.font.family = css('--wb-font') || d.font.family;
    d.font.size = 11;
    d.color = muted;
    d.borderColor = rule;
    if (d.scale) {
      d.scale.grid = d.scale.grid || {};
      d.scale.grid.color = rule;
      d.scale.grid.tickColor = rule;
      d.scale.border = d.scale.border || {};
      d.scale.border.color = ruleS;
      d.scale.ticks = d.scale.ticks || {};
      d.scale.ticks.color = muted;
      d.scale.title = d.scale.title || {};
      d.scale.title.color = muted;
    }
    var tt = d.plugins && d.plugins.tooltip;
    if (tt) {
      tt.backgroundColor = surf; tt.borderColor = ruleS; tt.borderWidth = 1;
      tt.titleColor = muted; tt.bodyColor = ink; tt.footerColor = muted;
      tt.padding = 8; tt.cornerRadius = 4; tt.boxPadding = 4;
      tt.titleFont = { size: 11, weight: '400' }; tt.bodyFont = { size: 12 };
    }
    var lg = d.plugins && d.plugins.legend;
    if (lg && lg.labels) { lg.labels.color = muted; lg.labels.boxWidth = 14; lg.labels.boxHeight = 2; lg.labels.padding = 12; }
    if (d.elements) {
      if (d.elements.line) d.elements.line.borderWidth = 1.5;
      if (d.elements.point) { d.elements.point.radius = 0; d.elements.point.hoverRadius = 3; }
    }
  }
  function refresh() {
    apply();
    var C = window.Chart;
    if (!C || !C.instances) return;
    var list = C.instances;
    Object.keys(list).forEach(function (k) { try { list[k].update('none'); } catch (e) { /* 파괴된 차트 등 */ } });
  }
  document.addEventListener('wb-themechange', refresh);
  apply();

  window.WBChart = {
    css: css, color: color, alpha: alpha, tok: tok,
    series: function (i) { return css('--wb-series-' + i); },
    apply: apply, refresh: refresh
  };
})();
