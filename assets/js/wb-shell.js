/* ═══════════════════════════════════════════════════════════════════════════
   wb-shell.js — 공통 셸: 헤더 내비 · 테마 토글 · 화면 찾기(Ctrl K) · 도움말 툴팁(?)
   2026-10-21 redesign-wb 1단계
   ───────────────────────────────────────────────────────────────────────────
   사용: <head> 에 <script src="/assets/js/wb-shell.js?v=..."></script> (동기 — 첫 페인트 전 테마 적용)
         <body> 첫 줄에 <header id="wb-shell" data-area="rates" data-page="dashboard"></header>
   정보 구조(IA) 단일 출처 = 아래 AREAS. 헤더·팔레트가 모두 여기서 나온다.
   브랜드 = 🏛️ Bond Quant House · 클릭 = 첫 화면(주간 리뷰). 별도 '홈' 화면 없음(2026-10-21 사용자 지시).
   CONTEST_MODE: <html data-contest> 이면 contest:true 화면만 노출(헤더·팔레트 공통).
                 data-contest 를 지우면 전체 IA 가 다시 보인다(되돌리기 = 속성 하나).
   테마: localStorage 'wb-theme' = 'light' | 'dark' | (없음 = 시스템 설정 따름).
         바뀔 때마다 document 에 'wb-themechange' 이벤트(detail.theme) — wb-chart.js 가 받아 차트 재색칠.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var doc = document, root = doc.documentElement;
  var KEY = 'wb-theme';

  // ── 정보 구조 (IA) ────────────────────────────────────────────────────
  // group 값이 바뀌는 지점에 2차 탭 세로 구분선. kw = 팔레트 검색어(영문·별칭).
  var AREAS = [
    { id: 'arb', label: '차익거래 모니터', pages: [
      { id: 'arb', label: '차익거래 모니터', href: '/tools/arb-monitor/', contest: true,
        desc: '시장 동향 · 저평 계기판 · 오늘 판정 · b 감시', kw: 'arb arbitrage hets basis 차익 저평 판정 모니터' } ] },
    { id: 'review', label: '주간 리뷰', pages: [
      { id: 'review', label: '주간 리뷰', href: '/tools/quant-house/#review', contest: true,
        desc: '일드커브 · 넷팅 · 팩터 손익 · TOP PICK · 상품/바스켓 비교', kw: 'weekly review market 리뷰 시장' } ] },
    { id: 'strategy', label: '전략', pages: [
      { id: 'strat', label: '전략 등록부', href: '/tools/quant-house/#strat', desc: '다전략 등록부 · 감사 · 성과', kw: 'strategy registry quant house' },
      { id: 'ops', label: '운용 콘솔', href: '/tools/quant-house/#ops', desc: '집행표 · 신호 인박스 · 보유 인벤토리', kw: 'ops operation console' },
      { id: 'portfolio', label: '포트폴리오 백테스트', href: '/tools/portfolio/', desc: '일별 MtM · 원안 사이즈 합산 · bp', kw: 'portfolio backtest' },
      { id: 'news', label: '뉴스 흐름', href: '/tools/quant-house/#news', group: 2, desc: '뉴스 임베딩 관측 지도', kw: 'news newsflow' } ] },
    { id: 'rates', label: '금리', pages: [
      { id: 'dashboard', label: '금리 대시보드', href: '/tools/dashboard/', contest: true,
        desc: '커브·플라이 이격 · 수익률 곡선 · 스프레드 · IRS', kw: 'rates dashboard curve 커브 금리' },
      { id: 'cd91', label: 'CD91 전망', href: '/tools/cd91/', desc: '선반영 + 스무딩 모형 경로', kw: 'cd91 forecast' },
      { id: 'regime', label: '레짐 모니터', href: '/tools/regime/', desc: 'β-텐서 구조 국면 분류 (exploratory)', kw: 'regime' } ] },
    { id: 'position', label: '포지션·수급', pages: [
      { id: 'rv-position', label: 'RV 포지션', href: '/tools/rv-position/', desc: '페어 포지션 · 손익 분해 · 만기별 노출', kw: 'rv position pair' },
      { id: 'beta-trading', label: 'Beta Trading', href: '/tools/beta-trading/', desc: '3팩터 RV · MOM · CURVE', kw: 'beta trading' },
      { id: 'supply', label: '시장 수급', href: '/tools/supply/', group: 2, desc: '채권별 수급 흐름', kw: 'supply flow 수급' } ] },
    { id: 'data', label: '데이터', pages: [
      { id: 'db', label: 'DB 탐색', href: '/tools/db/', desc: '시장 데이터 테이블 조회', kw: 'db database table' } ] }
  ];

  function contest() { return root.hasAttribute('data-contest'); }
  function visibleAreas() {
    var c = contest();
    return AREAS.map(function (a) {
      return { id: a.id, label: a.label, pages: a.pages.filter(function (p) { return !c || p.contest; }) };
    }).filter(function (a) { return a.pages.length > 0; });
  }

  // ── 테마 ──────────────────────────────────────────────────────────────
  var mql = null, mem = null;   // mem = localStorage 를 못 쓰는 환경의 이번 페이지 한정 선택
  try { mql = window.matchMedia('(prefers-color-scheme: dark)'); } catch (e) { mql = null; }
  function stored() {
    try { var v = window.localStorage.getItem(KEY); return (v === 'light' || v === 'dark') ? v : mem; }
    catch (e) { return mem; }
  }
  function system() { return (mql && mql.matches) ? 'dark' : 'light'; }
  function effective() { return stored() || system(); }
  // 부분 개편 페이지가 대회 모드가 아니면 CSS 가 어두운 테마로 고정 → 토글 무의미(숨김)
  function pinned() { return root.getAttribute('data-wb') === 'partial' && !contest(); }
  function applyTheme(silent) {
    var t = pinned() ? 'dark' : effective();
    root.setAttribute('data-theme', t);
    syncToggle();
    if (!silent) {
      try { doc.dispatchEvent(new CustomEvent('wb-themechange', { detail: { theme: t } })); } catch (e) { /* 구형 브라우저 */ }
    }
    return t;
  }
  function setTheme(v) {   // 'light' | 'dark' | 'system'
    mem = (v === 'light' || v === 'dark') ? v : null;
    try {
      if (mem) window.localStorage.setItem(KEY, mem);
      else window.localStorage.removeItem(KEY);
    } catch (e) { /* 저장 불가(사생활 모드 등) — mem 으로 이번 페이지에만 적용 */ }
    return applyTheme(false);
  }
  applyTheme(true);   // ★첫 페인트 전(head 동기 실행) — 깜빡임 방지
  if (mql) {
    var onSys = function () { if (!stored()) applyTheme(false); };
    if (mql.addEventListener) mql.addEventListener('change', onSys); else if (mql.addListener) mql.addListener(onSys);
  }

  // ── 아이콘 (자체 제작 SVG) ────────────────────────────────────────────
  var ICON = {
    moon: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M13.2 10.2A5.6 5.6 0 0 1 5.8 2.8a5.6 5.6 0 1 0 7.4 7.4Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
    sun: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1.3"/>' +
         '<path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
    search: '<svg class="wb-finder-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.3"/><path d="m10.5 10.5 3.5 3.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>'
  };
  var BRAND_EMOJI = '🏛️';   // 🏛️ (U+1F3DB U+FE0F)

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  var isMac = /Mac|iPhone|iPad/.test(navigator.platform || '');

  // ── 헤더 ──────────────────────────────────────────────────────────────
  var host = null, curArea = '', curPage = '';
  function areaOf(pageId) {
    for (var i = 0; i < AREAS.length; i++) for (var j = 0; j < AREAS[i].pages.length; j++)
      if (AREAS[i].pages[j].id === pageId) return AREAS[i].id;
    return '';
  }
  function renderHeader() {
    if (!host) return;
    var areas = visibleAreas();
    var nav1 = areas.map(function (a) {
      var href = a.pages[0].href;   // 영역 첫 화면으로
      // 보이는 화면이 1개뿐인 영역은 영역 이름 대신 화면 이름(대회 모드: '주간 리뷰' · '금리 대시보드')
      var lbl = a.pages.length === 1 ? a.pages[0].label : a.label;
      return '<a href="' + esc(href) + '"' + (a.id === curArea ? ' class="is-active" aria-current="page"' : '') + '>' + esc(lbl) + '</a>';
    }).join('');
    var active = null;
    areas.forEach(function (a) { if (a.id === curArea) active = a; });
    // 2차 탭: 현재 영역에 보이는 화면이 2개 이상일 때만(1개면 1차 메뉴와 같은 말 반복 — 생략)
    var sub = '';
    if (active && active.pages.length > 1) {
      var last = null;
      sub = '<div class="wb-shell-sub"><nav class="wb-nav2" aria-label="' + esc(active.label) + ' 화면">' +
        active.pages.map(function (p) {
          var g = p.group || 1, sep = (last !== null && g !== last) ? '<span class="wb-nav2-sep" aria-hidden="true"></span>' : '';
          last = g;
          return sep + '<a href="' + esc(p.href) + '"' + (p.id === curPage ? ' class="is-active" aria-current="page"' : '') + '>' + esc(p.label) + '</a>';
        }).join('') + '</nav></div>';
    }
    // 브랜드 클릭 = 첫 화면(주간 리뷰)
    var homeHref = (areas[0] && areas[0].pages[0]) ? areas[0].pages[0].href : '/tools/quant-house/';
    host.className = 'wb-shell';
    host.innerHTML =
      '<div class="wb-shell-bar">' +
        '<a class="wb-brand" href="' + esc(homeHref) + '" aria-label="Bond Quant House — 주간 리뷰로">' +
          '<span class="wb-brand-emoji" aria-hidden="true">' + BRAND_EMOJI + '</span>' +
          '<span class="wb-brand-name">Bond Quant House</span></a>' +
        '<nav class="wb-nav1" aria-label="화면">' + nav1 + '</nav>' +
        '<div class="wb-shell-tools">' +
          '<button type="button" class="wb-iconbtn" data-wb-theme-toggle></button>' +
          '<button type="button" class="wb-finder" data-wb-palette-open aria-haspopup="dialog" aria-label="화면 찾기">' +
            '<span class="wb-finder-text">화면 찾기</span><span class="wb-kbd">' + (isMac ? '⌘ K' : 'Ctrl K') + '</span>' + ICON.search +
          '</button>' +
        '</div>' +
      '</div>' + sub;
    // 2차 탭을 1차 메뉴 시작 위치에 맞춤
    var n1 = host.querySelector('.wb-nav1'), n2 = host.querySelector('.wb-nav2');
    if (n1 && n2 && window.innerWidth > 720) n2.style.marginLeft = (n1.offsetLeft - parseFloat(getComputedStyle(host.querySelector('.wb-shell-sub')).paddingLeft || 0)) + 'px';
    var tg = host.querySelector('[data-wb-theme-toggle]');
    if (tg) {
      tg.hidden = pinned();
      tg.addEventListener('click', function () { setTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); });
    }
    var fb = host.querySelector('[data-wb-palette-open]');
    if (fb) fb.addEventListener('click', function () { openPalette(fb); });
    syncToggle();
    measure();
  }
  function syncToggle() {
    if (!host) return;
    var tg = host.querySelector('[data-wb-theme-toggle]');
    if (!tg) return;
    var dark = root.getAttribute('data-theme') === 'dark';
    tg.innerHTML = dark ? ICON.sun : ICON.moon;
    var lbl = dark ? '밝은 테마로 전환' : '어두운 테마로 전환';
    tg.setAttribute('aria-label', lbl); tg.title = lbl + (stored() ? '' : ' (현재: 시스템 설정 따름)');
  }
  function setPage(pageId) {   // 같은 문서 안에서 화면 전환 시(예: quant-house 탭) 활성 표시 갱신
    curPage = pageId; curArea = areaOf(pageId) || curArea;
    var h = host || doc.getElementById('wb-shell');   // init 전 호출도 반영(속성 = init 이 읽는 값)
    if (h) { h.setAttribute('data-page', curPage); h.setAttribute('data-area', curArea); }
    renderHeader();
  }

  // ── sticky 높이 측정 → CSS 변수 (필터 바·목차 레일 top 계산용) ──────────
  function measure() {
    if (host) root.style.setProperty('--wb-shell-h', host.offsetHeight + 'px');
    var fbar = doc.querySelector('.wb-filterbar');
    var visible = fbar && fbar.offsetParent !== null && getComputedStyle(fbar).position === 'sticky';
    root.style.setProperty('--wb-filterbar-h', visible ? fbar.offsetHeight + 'px' : '0px');
  }
  function watchSticky() {
    if (!('IntersectionObserver' in window)) return;
    doc.querySelectorAll('.wb-filterbar').forEach(function (fb) {
      if (fb.previousElementSibling && fb.previousElementSibling.hasAttribute('data-wb-sentinel')) return;
      var s = doc.createElement('div'); s.setAttribute('data-wb-sentinel', ''); s.style.height = '1px'; s.style.marginBottom = '-1px';
      fb.parentNode.insertBefore(s, fb);
      new IntersectionObserver(function (es) {
        es.forEach(function (e) { fb.classList.toggle('is-stuck', !e.isIntersecting && e.boundingClientRect.top < (host ? host.offsetHeight : 48) + 1); });
      }, { rootMargin: '-' + ((host ? host.offsetHeight : 48) + 1) + 'px 0px 0px 0px' }).observe(s);
    });
  }

  // ── 화면 찾기 (커맨드 팔레트) ─────────────────────────────────────────
  var pal = null, palInput = null, palList = null, palItems = [], palSel = 0, palOpener = null;
  var CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
  function chosung(s) {   // 초성 검색(예: ㄱㄹ → 금리)
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i) - 0xAC00;
      out += (c >= 0 && c <= 11171) ? CHO[Math.floor(c / 588)] : s.charAt(i);
    }
    return out;
  }
  var localItems = [];   // 화면 안 항목(패널 앵커 등) — WBShell.setLocalItems([{label, href}])
  function entries() {
    var list = [];
    localItems.forEach(function (it) { list.push({ kind: 'local', area: '이 화면', label: it.label, desc: '', href: it.href, kw: it.kw || '' }); });
    visibleAreas().forEach(function (a) {
      a.pages.forEach(function (p) { list.push({ kind: 'page', area: a.label, label: p.label, desc: p.desc || '', href: p.href, kw: p.kw || '' }); });
    });
    if (!pinned()) {
      list.push({ kind: 'cmd', area: '테마', label: '밝은 테마', desc: '', run: function () { setTheme('light'); }, kw: 'light theme 라이트' });
      list.push({ kind: 'cmd', area: '테마', label: '어두운 테마', desc: '', run: function () { setTheme('dark'); }, kw: 'dark theme 다크' });
      list.push({ kind: 'cmd', area: '테마', label: '시스템 설정 따름', desc: '', run: function () { setTheme('system'); }, kw: 'system auto theme 자동' });
    }
    return list;
  }
  function buildPalette() {
    pal = doc.createElement('div');
    pal.className = 'wb-palette'; pal.hidden = true;
    pal.setAttribute('role', 'dialog'); pal.setAttribute('aria-modal', 'true'); pal.setAttribute('aria-label', '화면 찾기');
    pal.innerHTML =
      '<div class="wb-palette-panel">' +
        '<input class="wb-palette-input" type="text" placeholder="화면 이름 · 영역 검색 (초성 가능)" aria-label="화면 검색" ' +
          'role="combobox" aria-expanded="true" aria-controls="wb-palette-list" autocomplete="off" spellcheck="false">' +
        '<ul class="wb-palette-list" id="wb-palette-list" role="listbox"></ul>' +
        '<div class="wb-palette-foot">↑↓ 이동 · Enter 열기 · Esc 닫기</div>' +
      '</div>';
    doc.body.appendChild(pal);
    palInput = pal.querySelector('.wb-palette-input');
    palList = pal.querySelector('.wb-palette-list');
    pal.addEventListener('mousedown', function (e) { if (e.target === pal) closePalette(); });
    palInput.addEventListener('input', function () { palSel = 0; renderPalette(); });
    palInput.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); palSel = Math.min(palSel + 1, palItems.length - 1); paintSel(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); palSel = Math.max(palSel - 1, 0); paintSel(); }
      else if (e.key === 'Enter') { e.preventDefault(); runItem(palItems[palSel]); }
      else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
      else if (e.key === 'Tab') { e.preventDefault(); }   // 포커스를 팔레트 안에 가둠(입력 1개)
    });
  }
  function renderPalette() {
    var q = (palInput.value || '').trim().toLowerCase();
    var all = entries();
    palItems = all.filter(function (it) {
      if (!q) return true;
      var hay = (it.label + ' ' + it.area + ' ' + it.desc + ' ' + it.kw).toLowerCase();
      return hay.indexOf(q) >= 0 || chosung(it.label + ' ' + it.area).indexOf(q) >= 0;
    });
    if (!palItems.length) { palList.innerHTML = '<li class="wb-palette-empty">일치하는 화면이 없습니다.</li>'; return; }
    var html = '', lastArea = null;
    palItems.forEach(function (it, i) {
      var grp = it.kind === 'cmd' ? '명령' : it.kind === 'local' ? '이 화면' : '화면';
      if (grp !== lastArea) { html += '<li class="wb-palette-group" role="presentation">' + grp + '</li>'; lastArea = grp; }
      html += '<li class="wb-palette-item" role="option" id="wb-pal-' + i + '" data-i="' + i + '" aria-selected="' + (i === palSel) + '">' +
        '<span class="wb-palette-item-label">' + esc(it.label) + '</span>' +
        (it.desc ? '<span class="wb-palette-item-desc">' + esc(it.desc) + '</span>' : '') +
        '<span class="wb-palette-item-area">' + esc(it.area) + '</span></li>';
    });
    palList.innerHTML = html;
    palList.querySelectorAll('.wb-palette-item').forEach(function (li) {
      li.addEventListener('mousemove', function () { var i = +li.getAttribute('data-i'); if (i !== palSel) { palSel = i; paintSel(); } });
      li.addEventListener('click', function () { runItem(palItems[+li.getAttribute('data-i')]); });
    });
    paintSel();
  }
  function paintSel() {
    palList.querySelectorAll('.wb-palette-item').forEach(function (li) {
      var on = +li.getAttribute('data-i') === palSel;
      li.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) { li.scrollIntoView({ block: 'nearest' }); palInput.setAttribute('aria-activedescendant', li.id); }
    });
  }
  function runItem(it) {
    if (!it) return;
    closePalette();
    if (it.kind === 'cmd') { it.run(); return; }
    window.location.href = it.href;
  }
  function openPalette(opener) {
    if (!pal) buildPalette();
    palOpener = opener || doc.activeElement;
    palInput.value = ''; palSel = 0; renderPalette();
    pal.hidden = false;
    palInput.focus();
  }
  function closePalette() {
    if (!pal || pal.hidden) return;
    pal.hidden = true;
    if (palOpener && palOpener.focus) { try { palOpener.focus(); } catch (e) { /* noop */ } }
  }
  doc.addEventListener('keydown', function (e) {
    var k = (e.key || '').toLowerCase();
    if ((e.ctrlKey || e.metaKey) && !e.altKey && k === 'k') { e.preventDefault(); if (pal && !pal.hidden) closePalette(); else openPalette(); }
  });

  // ── 도움말 툴팁 (? 아이콘) ────────────────────────────────────────────
  // 설명·해석 문장은 화면에서 숨기고 제목/열 머리 끝의 ? 로 옮긴다(원문 그대로 — 삭제 아님).
  // 마크업(셋 중 하나):
  //   <button type="button" class="wb-help" data-help="원문"></button>         (텍스트·줄바꿈 유지)
  //   <button type="button" class="wb-help" data-help-ref="요소id"></button>   (그 요소의 현재 innerHTML · 비면 data-help)
  //   <span class="wb-help" role="button" tabindex="0"><template>원문 HTML</template></span>
  // 동작: 마우스 올림·키보드 포커스 = 표시 / 클릭(탭) = 고정·다시 누르면 닫힘 / 바깥 클릭·Esc = 닫힘.
  // ? 클릭은 캡처 단계에서 전파를 끊는다 → 행 클릭(선택) 같은 부모 동작이 같이 일어나지 않음.
  var tip = null, tipFor = null, tipPinned = false;
  function tipEl() {
    if (!tip) {
      tip = doc.createElement('div'); tip.className = 'wb-tip'; tip.id = 'wb-tip';
      tip.setAttribute('role', 'tooltip'); tip.hidden = true; doc.body.appendChild(tip);
    }
    return tip;
  }
  function helpContent(btn) {
    var ref = btn.getAttribute('data-help-ref');
    if (ref) { var el = doc.getElementById(ref); if (el && el.innerHTML.trim()) return { html: el.innerHTML }; }
    var t = btn.querySelector('template');
    if (t && t.innerHTML.trim()) return { html: t.innerHTML };
    var s = btn.getAttribute('data-help');
    return s ? { text: s } : null;
  }
  function placeTip(btn, el) {
    var r = btn.getBoundingClientRect(), vw = doc.documentElement.clientWidth, vh = window.innerHeight, m = 8;
    el.style.maxWidth = Math.min(360, vw - 2 * m) + 'px';
    el.style.left = '0px'; el.style.top = '0px';
    var w = el.offsetWidth, h = el.offsetHeight;
    var left = Math.min(Math.max(m, r.left - 8), vw - w - m);           // 화면 밖으로 안 나가게
    var top = r.bottom + 6;
    if (top + h > vh - m && r.top - 6 - h >= m) top = r.top - 6 - h;    // 아래 공간 부족 → 위로
    if (top + h > vh - m) top = Math.max(m, vh - m - h);
    el.style.left = Math.round(left) + 'px'; el.style.top = Math.round(top) + 'px';
  }
  function showTip(btn) {
    var c = helpContent(btn); if (!c) return;
    var el = tipEl();
    if (c.html != null) { el.innerHTML = c.html; el.classList.remove('is-text'); }
    else { el.textContent = c.text; el.classList.add('is-text'); }
    if (tipFor && tipFor !== btn) tipFor.setAttribute('aria-expanded', 'false');
    el.hidden = false; tipFor = btn;
    btn.setAttribute('aria-describedby', 'wb-tip'); btn.setAttribute('aria-expanded', 'true');
    placeTip(btn, el);
  }
  function hideTip() {
    if (!tip || tip.hidden) return;
    tip.hidden = true; tipPinned = false;
    if (tipFor) { tipFor.removeAttribute('aria-describedby'); tipFor.setAttribute('aria-expanded', 'false'); }
    tipFor = null;
  }
  function helpOf(t) { return (t && t.closest) ? t.closest('.wb-help') : null; }
  doc.addEventListener('mouseover', function (e) { var b = helpOf(e.target); if (b && !tipPinned) showTip(b); });
  doc.addEventListener('mouseout', function (e) {
    var b = helpOf(e.target);
    if (b && !tipPinned && !(e.relatedTarget && b.contains(e.relatedTarget))) hideTip();
  });
  doc.addEventListener('focusin', function (e) { var b = helpOf(e.target); if (b) showTip(b); });
  doc.addEventListener('focusout', function (e) { var b = helpOf(e.target); if (b && !tipPinned) hideTip(); });
  doc.addEventListener('click', function (e) {
    var b = helpOf(e.target);
    if (b) {
      e.preventDefault(); e.stopPropagation();
      if (tipFor === b && tipPinned) hideTip(); else { showTip(b); tipPinned = true; }
      return;
    }
    if (tip && !tip.hidden && !tip.contains(e.target)) hideTip();
  }, true);
  doc.addEventListener('keydown', function (e) {
    var b = helpOf(e.target);
    if (b && (e.key === 'Enter' || e.key === ' ') && b.tagName !== 'BUTTON') { e.preventDefault(); b.click(); }
    if (e.key === 'Escape') hideTip();
  });
  window.addEventListener('scroll', function () { if (tipFor && tip && !tip.hidden) { if (tipPinned) placeTip(tipFor, tip); else hideTip(); } }, { passive: true, capture: true });
  window.addEventListener('resize', function () { hideTip(); }, { passive: true });
  // 문자열 템플릿용 헬퍼: WBShell.helpBtn('원문') → '<button class="wb-help" data-help="…">' (속성 이스케이프)
  function helpBtn(text, label) {
    if (!text) return '';
    return '<button type="button" class="wb-help" data-help="' + esc(text) + '" aria-label="' + esc(label || '설명 보기') + '"></button>';
  }

  // ── 초기화 ────────────────────────────────────────────────────────────
  function init() {
    host = doc.getElementById('wb-shell');
    if (host) {
      curPage = host.getAttribute('data-page') || '';
      curArea = host.getAttribute('data-area') || areaOf(curPage);
      renderHeader();
    }
    watchSticky();
    measure();
    window.addEventListener('resize', function () { measure(); }, { passive: true });
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () { measure(); });
      if (host) ro.observe(host);
      var fbar = doc.querySelector('.wb-filterbar'); if (fbar) ro.observe(fbar);
    }
    applyTheme(false);   // DOM 준비 후 1회 통지(차트 등 늦게 붙는 소비자용)
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();

  window.WBShell = {
    areas: function () { return visibleAreas(); },
    allAreas: function () { return AREAS; },
    isContest: contest,
    getTheme: function () { return root.getAttribute('data-theme'); },
    setTheme: setTheme,
    setPage: setPage,
    openPalette: openPalette,
    measure: measure,
    helpBtn: helpBtn,
    hideTip: hideTip,
    setLocalItems: function (list) { localItems = Array.isArray(list) ? list.slice() : []; }
  };
})();
