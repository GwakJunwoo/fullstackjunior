// 부트스트랩 탭 render smoke — 더미 스냅샷(_bootstrap_sample.json = 엔진 실스냅샷 shape + 내 게임/상관 가짜 주입) 렌더 검증 (실API·실원장 무접촉)
// usage: node _smoke_bootstrap_render.js
//   검사: 4섹션 렌더 · 판 지도 36칸/상태 집계 · 판 카드(census 성적표 · 본전 승률 vs 기준선 승률 · k 기본값 ? ) · 내 게임(§8b 메인/미니 · R 장벽 막대 · 분해) ·
//         §8c 판 간 상관/n_eff · 한도/본전(by_layer) · 빈 상태(available:false) · 폼 POST → 응답 스냅샷 재렌더 · 추천/신호 문구 0
//   2026-10-27 저녁(사용자 지시): 설명 문장 = 공용 ? 툴팁(.wb-help · data-help)만 · '잠정' 배지/문자열 0 · 하단 정직 각주 섹션 없음(honesty 미렌더 · 스냅샷에 없어도 무해) ·
//         amend = 크기·종목·메모만 · 진입 날짜 기본 = boards[].entry_date_default · 역마팅게일 라벨 = config.paroli_mult · 테스트 게임 삭제 뒤 빈 상태
//   2026-10-27 밤(사용자 피드백 · 판 카드 간소화): 레그 표 1개(비율·오늘 종목코드·수익률·DV01·액면) · 방향/장벽·비용·상한/주문 환산(해동 order_preview bcd2d51e)/본전 vs 기준선 = 각 한 줄 ·
//         성적표·이긴 뒤/진 뒤(스키마 2 방향별)·요인 적재 = 측정 판만(아니면 "미실측" 한 줄) · 사이즈 규칙 = 열린 사이클만 · 회계 = blocked 만 · 삭제 줄(1R 금액·한계 사용량·판당 델타 상한·상태 메모) 0 · 그리드 상단 정렬
'use strict';
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const m = html.match(/<script id="bs-script">\r?\n([\s\S]*?)<\/script>/);
if (!m) { console.error('FAIL: bs-script block not found'); process.exit(1); }
const src = m[1];
const SAMPLE = JSON.parse(fs.readFileSync(path.join(__dirname, '_bootstrap_sample.json'), 'utf8'));
const clone = o => JSON.parse(JSON.stringify(o));

// ── 최소 DOM 스텁 ─────────────────────────────────────────────────────────────
function fakeEl(id) {
  return { id, innerHTML: '', textContent: '', value: '', hidden: false, style: {}, classList: { toggle() {}, add() {}, remove() {} },
    getAttribute(k) { return this['_' + k] || null; }, setAttribute(k, v) { this['_' + k] = v; }, focus() {}, scrollIntoView() {}, querySelectorAll() { return []; } };
}
const ELS = {};
const document = {
  documentElement: { hasAttribute() { return false; }, getAttribute() { return null; } },
  getElementById(id) { if (!ELS[id]) ELS[id] = fakeEl(id); return ELS[id]; },
  querySelectorAll() { return []; },
  body: { classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); }, toggle() {} } },
};
const window = { location: { search: '', hash: '', hostname: '' }, WBChart: null, WBShell: null };
const CALLS = { get: [], post: [] };
let POST_RESULT = null;
const PATH = { board_id: 'S.slope.2_5', n: 49, entry: '2026-10-13', exit: null, X_bp: 7.1, k: 1.0, length: 10, kind: 'open', winner: null, side_now: 1, R_plus: 0.34, net_R_plus: 0.23, cost_R: 0.11,
  series: [{ date: '2026-10-13', mkt_bp: 0.0, cum_bp: 0.0, cum_R_plus: 0.0, net_R_plus: -0.11, post_exit: false }, { date: '2026-10-14', mkt_bp: 1.2, cum_bp: 1.2, cum_R_plus: 0.17, net_R_plus: 0.06, post_exit: false }, { date: '2026-10-15', mkt_bp: 2.4, cum_bp: 2.5, cum_R_plus: 0.34, net_R_plus: 0.23, post_exit: false }],
  barrier: { win: 7.1, loss: -7.1 }, legs_note: 'KR2y 롱 · KR5y 숏', mkt_note: '스프레드 변화(bp · 스티프너 수익 +)' };   // 해동 20e29737 반환 모양
const apiGet = async function (p) { CALLS.get.push(p); if (p === '/quant-house/game-board') return clone(SAMPLE); if (p === '/quant-house/market-review') return { available: false };
  if (p.indexOf('/quant-house/game-board/road-path?') === 0) {
    if (/n=999/.test(p) || /game_id=nope/.test(p)) throw new Error('서버 오류 404 — road.game_path 게임 없음/거부: KeyError: 999');
    if (/board_id=L\.cash\.2y/.test(p)) throw new Error('서버 오류 503 — 엔진 road.game_path 없음(해동 배선 중) — 호버 경로 차트 불가(가짜 경로 0)');
    const m = p.match(/[?&]n=(\d+)/), g = p.match(/game_id=([^&]+)/); const done = m && Number(m[1]) < 49, out = Object.assign(clone(PATH), { n: m ? Number(m[1]) : null, game_id: g ? decodeURIComponent(g[1]) : null, exit: done ? '2026-10-15' : null, winner: done ? 1 : null, kind: done ? 'win' : 'open', R_plus: done ? 1.08 : 0.34 });
    if (done) out.series.push({ date: '2026-10-16', mkt_bp: 2.0, cum_bp: 2.1, cum_R_plus: 0.3, net_R_plus: 0.19, post_exit: true }, { date: '2026-10-17', mkt_bp: 1.0, cum_bp: 1.1, cum_R_plus: 0.15, net_R_plus: 0.04, post_exit: true });
    if (g && /-1@/.test(decodeURIComponent(g[1]))) out.series.forEach(pt => { pt.cum_R_mine = -pt.cum_R_plus; pt.net_R_mine = -pt.cum_R_plus - 0.11; });   // 내 −1 게임 = 엔진이 cum_R_mine/net_R_mine 병기
    return out;
  }
  throw new Error('unknown ' + p); };
const opsPost = async function (p, body) { CALLS.post.push({ p, body }); if (POST_RESULT instanceof Error) throw POST_RESULT; return POST_RESULT; };
const _esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
const fetch = function () { return Promise.reject(new Error('no network in smoke')); };
const confirm = function () { return true; };
let PROMPT_REASON = '사유 smoke';
const prompt = function (q, d) { return /사유/.test(q) ? PROMPT_REASON : (d || '2026-10-27'); };
function boot(get) { new Function('document', 'window', 'apiGet', 'opsPost', '_esc', 'fetch', 'confirm', 'prompt', 'BS_LOCAL', src)(document, window, get, opsPost, _esc, fetch, confirm, prompt, false); return window.BS; }
const F = id => document.getElementById(id);

let fails = 0;
function check(name, cond, detail) { console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  | ' + detail : '')); if (!cond) fails++; }
function allHtml() { return Object.keys(ELS).map(k => ELS[k].innerHTML + ' ' + ELS[k].textContent).join('\n'); }

(async function () {
  // ① 빈 상태 — available:false → 정직 안내
  let B = boot(async () => ({ available: false, note: 'game_board_snapshot.json 미생성 — cli.py board snapshot 실행 필요' }));
  check('BS 노출', !!B && typeof B.load === 'function');
  await B.load();
  check('빈 상태: 안내 문구(cli.py board snapshot)', /cli\.py board snapshot/.test(ELS.bsNotice.innerHTML), ELS.bsNotice.innerHTML.slice(0, 80));
  check('빈 상태: 가짜 숫자 0(판 지도·상관 비움)', /자료 없음/.test(ELS.bsMap.innerHTML) && /자료 없음/.test(ELS.bsCorr.innerHTML));
  B = boot(async () => ({ available: true, ok: false, err: 'boom' }));
  await B.load();
  check('엔진 ok:false → 빌드 실패 안내', /빌드 실패/.test(ELS.bsNotice.innerHTML) && /boom/.test(ELS.bsNotice.innerHTML));

  // ② 더미(엔진 shape) 렌더
  B = boot(apiGet);
  await B.load();
  check('asof 표시(엔진 asof · elapsed)', /asof 2026-10-26/.test(ELS.bsAsof.textContent) && /s$/.test(ELS.bsAsof.textContent), ELS.bsAsof.textContent);
  const nCurve = SAMPLE.market.curve.length;
  check('① 커브 표 ' + nCurve + '행(엔진 market.curve 그대로)', (ELS.bsCurveTbl.innerHTML.match(/<tr>/g) || []).length === nCurve + 1, (ELS.bsCurveTbl.innerHTML.match(/<tr>/g) || []).length);
  const fut = SAMPLE.market.curve.find(r => r.kind === 'fut'), cash0 = SAMPLE.market.curve[0];
  check('① 선물 행 = d1_price · 현물 = d1_bp', ELS.bsCurveTbl.innerHTML.indexOf(fut.price.toFixed(2)) >= 0 && new RegExp((cash0.d5_bp < 0 ? '−' : '\\+') + Math.abs(cash0.d5_bp).toFixed(1) + 'bp').test(ELS.bsCurveTbl.innerHTML));
  check('① 4국면 라벨 + 26주 띠 + counts_26w + partial', new RegExp(SAMPLE.market.regime4.label).test(ELS.bsRegime.innerHTML) && (ELS.bsRegime.innerHTML.match(/data-rg=/g) || []).length >= 26 + 4 && /부분 주/.test(ELS.bsRegime.innerHTML) && /9주/.test(ELS.bsRegime.innerHTML));
  check('① 주간 4패널(리뷰 없음 → 정직 안내 · weekly_moves.curve_moves 중첩 해석)', (ELS.bsWeekly.innerHTML.match(/wb-card-title/g) || []).length === 4 && /리뷰 스냅샷 없음/.test(ELS.bsWeekly.innerHTML) && /bsWk2/.test(ELS.bsWeekly.innerHTML));
  check('① §8c board_corr: 독립 판 수 2.3개 · 26주 이력 · 읽는 법은 화면 아닌 ? 안', /2\.3개/.test(ELS.bsNeff.innerHTML) && /bsNeffChart/.test(ELS.bsNeff.innerHTML) && !/상관이 오르면/.test(ELS.bsNeff.innerHTML) && /id="bsHelpNeff" data-help="[^"]*상관이 오르면/.test(html));
  const bsStyle = html.slice(html.indexOf('<style id="wb-bootstrap-style">'), html.indexOf('</style>', html.indexOf('<style id="wb-bootstrap-style">')));
  check('① §8c 히트맵 4×4(matrix.boards/values) · 판 ID 라벨 · 63일 굴림', (ELS.bsCorr.innerHTML.match(/<td /g) || []).length === 16 && /S\.slope\.2_5/.test(ELS.bsCorr.innerHTML) && /0\.83/.test(ELS.bsCorr.innerHTML) && /63일 굴림/.test(ELS.bsCorrMeta.textContent));
  // 레이아웃(2026-10-28 사용자 스크린샷): n_eff 카드 = 4국면 카드와 같은 오른쪽 열(.bs-col 세로 쌓임) · 판 간 상관 = 섹션 직계 전폭 카드(.bs-grid-2 밖) · 접이식(제목 옆 ▾/▸ · 기본 펼침 · localStorage try/catch)
  const mkt = (html.match(/<section class="bs-sec" id="bs-market">[\s\S]*?<\/section>/) || [''])[0];
  const col = (mkt.match(/<div class="bs-col">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/) || [''])[0];
  check('① 배치: n_eff 카드가 4국면과 같은 .bs-col 안(4국면 → n_eff 순) · 첫 .bs-grid-2 안 · 시장 흐름 섹션에 .bs-grid-2 는 1개', /id="bsRegime"/.test(col) && /id="bsNeff"/.test(col) && col.indexOf('id="bsRegime"') < col.indexOf('id="bsNeff"') && mkt.indexOf('<div class="bs-grid-2">') < mkt.indexOf('<div class="bs-col">') && (mkt.match(/class="bs-grid-2/g) || []).length === 1);
  check('① 배치: 판 간 상관 카드 #bsCorrCard = 섹션 직계 전폭(그리드 밖 · bsWeekly 다음) · .bs-corr width:100% · .bs-col/.bs-fold 규칙은 이 탭 스타일 안', /<div class="bs-grid-4" id="bsWeekly"[^>]*><\/div>\s*(<!--[^>]*-->\s*)?<div class="wb-card bs-fold" id="bsCorrCard"/.test(mkt) && mkt.indexOf('id="bsCorrCard"') > mkt.lastIndexOf('</div>', mkt.indexOf('id="bsWeekly"')) && /\.bs-corr \{ width: 100%/.test(bsStyle) && /\.bs-col \{ display: grid/.test(bsStyle) && /\.bs-fold\.is-folded > :not\(\.wb-card-head\) \{ display: none/.test(bsStyle));
  check('① 접이식: 기본 펼침(▾ · aria-expanded true · 본문 보임) · BS.fold("corr") → ▸ · aria-expanded false · 본문 hidden · 다시 → 펼침', ELS.bsCorrFold.textContent === '▾' && ELS.bsCorrFold.getAttribute('aria-expanded') === 'true' && !ELS.bsCorr.hidden && (B.fold('corr'), ELS.bsCorrFold.textContent === '▸' && ELS.bsCorrFold.getAttribute('aria-expanded') === 'false' && ELS.bsCorr.hidden === true) && (B.fold('corr'), ELS.bsCorrFold.textContent === '▾' && ELS.bsCorr.hidden === false), ELS.bsCorrFold.textContent);
  { // localStorage 차단(throw) → try/catch 로 무해 · 기본 펼침 / 저장값 '1' → 접힌 채 부팅(기억) · 토글 시 removeItem
    const LS = []; window.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
    let ok = true; try { B = boot(apiGet); B.fold('corr'); B.fold('corr'); } catch (e) { ok = false; }
    check('① 접이식: localStorage throw → 부팅·토글 무해(try/catch) · 기본 펼침', ok && ELS.bsCorrFold.textContent === '▾' && !ELS.bsCorr.hidden);
    window.localStorage = { getItem(k) { LS.push(['get', k]); return k === 'bs-fold:corr' ? '1' : null; }, setItem(k, v) { LS.push(['set', k, v]); }, removeItem(k) { LS.push(['rm', k]); } };
    B = boot(apiGet);
    check('① 접이식: 저장값 bs-fold:corr=1 → 접힌 채 부팅(▸ · hidden) · 펼치면 removeItem · 접으면 setItem "1"', ELS.bsCorrFold.textContent === '▸' && ELS.bsCorr.hidden === true && (B.fold('corr'), LS.some(x => x[0] === 'rm' && x[1] === 'bs-fold:corr') && !ELS.bsCorr.hidden) && (B.fold('corr'), LS.some(x => x[0] === 'set' && x[1] === 'bs-fold:corr' && x[2] === '1') && ELS.bsCorr.hidden), JSON.stringify(LS));
    delete window.localStorage; B = boot(apiGet); await B.load();
  }

  const stripEngineText = h => SAMPLE.boards.reduce((acc, b) => (b.status_note ? acc.split(_esc(b.status_note)).join('') : acc), h);
  const stripHelp = h => stripEngineText(h.replace(/data-help="[^"]*"/g, '').replace(/ title="[^"]*"/g, ''));   // title·상태 메모 = 엔진 status_note 원문 패스스루(문구는 엔진 소관 · 웹이 고쳐 쓰지 않음)
  const ids = SAMPLE.boards.map(b => b.id);
  check('② 판 지도 ' + ids.length + '칸 전부(엔진 boards 그대로)', ids.every(id => ELS.bsMap.innerHTML.indexOf('data-id="' + id + '"') >= 0) && ids.length === 36, ids.length);
  const cnt = {}; SAMPLE.boards.forEach(b => { cnt[b.status] = (cnt[b.status] || 0) + 1; });
  check('② 범례 집계 = 스냅샷 상태 수', ['pass', 'fail', 'open', 'untested', 'blocked'].every(k => ELS.bsMapLegend.innerHTML.indexOf('(' + (cnt[k] || 0) + ')') >= 0), JSON.stringify(cnt));
  check('② 열린 판 점 3(S.slope.2_5 · S.slope.3_10 · B.basket.3F)', (ELS.bsMap.innerHTML.match(/bs-open-dot/g) || []).length === 3);
  B.show('S.slope.2_5');
  const b25 = SAMPLE.boards.find(b => b.id === 'S.slope.2_5'); let card = ELS.bsBoardCard.innerHTML;
  check('② 판 카드: 장벽 X · 비용 R · 상한 = 한 줄(엔진 X_bp · cost_R · cap)', card.indexOf(b25.X_bp.toFixed(1) + 'bp') >= 0 && card.indexOf(b25.cost_R.toFixed(3) + 'R') >= 0 && /장벽 X<\/i><b>[0-9.]+bp<\/b>[^]*?<i>비용<\/i>[^]*?<i>상한<\/i>63거래일/.test(card) && !/<dt>/.test(card));
  check('② 판 카드: 본전 승률 p* vs 기준선 승률 = 한 줄 · 주 숫자 = 오늘 X(breakeven_today) · census(breakeven) 작게 병기 · p_star_label 없는 구 스냅샷 = % 폴백', new RegExp('본전 승률 p\\* <b>' + (b25.breakeven_today.p_star * 100).toFixed(1) + '%</b> <span class="wb-muted">\\(오늘 X\\)</span> <span class="wb-muted">· census ' + (b25.breakeven.p_star * 100).toFixed(1) + '%</span>[^]*? vs 기준선 승률 \\+1 <b>' + (b25.breakeven.baseline_winrate['+1'] * 100).toFixed(1) + '%</b> · −1 <b>' + (b25.breakeven.baseline_winrate['-1'] * 100).toFixed(1) + '%</b>').test(card) && !/<dt>기준선 승률/.test(card));
  check('② 판 카드: 레그 표 1개(레그·비율·오늘 종목코드·수익률·DV01/10억·액면(억)) · 옛 "오늘 레그" 표 0 · "레그" 줄 0', (card.match(/class="bs-sc bs-legs"/g) || []).length === 1 && /<th>레그<\/th><th>비율<\/th><th>오늘 종목코드<\/th><th>수익률<\/th><th>DV01\/10억<\/th><th>액면\(억\)<\/th>/.test(card) && /KR103501GG96/.test(card) && /×1\.00/.test(card) && /<td>920억<\/td>/.test(card) && /<td>370억<\/td>/.test(card) && !/오늘 레그\(코드 고정\)/.test(card) && !/<dt>레그/.test(card), (card.match(/<th>[^<]*<\/th>/g) || []).join(''));
  check('② 판 카드: 주문 환산 한 줄(해동 order_preview · 1R → 델타 → 레그 액면 롱/숏 · 반올림 후 1R) · measured 라 "(기본 D_R)" 없음', /주문 환산<\/i>1R <b>1\.53억<\/b> → 델타 <b>1,655만\/bp<\/b> → 2y 920억 롱 · 5y 370억 숏 <span class="wb-muted">\(반올림 후 1R 1\.52억\)<\/span>/.test(card) && !/기본 D_R/.test(stripHelp(card)), (card.match(/주문 환산<\/i>.{0,160}/) || [''])[0]);
  check('② 판 카드: 삭제된 줄 0 — 1R 금액 · 한계 사용량 · 판당 델타 상한 · 상태 메모 · 회계(비 blocked) · 기준선 승률 별도 줄 · 키-값 dl', !/1R 금액|한계 사용량|판당 델타 상한|상태 메모|<i>회계<\/i>|<dl|<dt>/.test(stripHelp(card)), (stripHelp(card).match(/1R 금액|한계 사용량|판당 델타 상한|상태 메모|<i>회계<\/i>/g) || []).join(','));
  check('② 판 카드: 상태 메모 = 상태 배지 title 툴팁(별도 줄 0 · 엔진 status_note 원문)', card.indexOf('class="wb-badge bs-st-pass" title="' + _esc(b25.status_note) + '"') >= 0 && /S\.slope\.2_5 · 커브<\/span>/.test(card));
  check('② 판 카드: 방향 한 줄(+1 / −1 뜻 = 엔진 dir_meaning)', /방향<\/i><b>\+1<\/b> 스티프너[^<]* · <b>−1<\/b> 플래트너/.test(card));
  const pg = b25.scorecard.directions['+1'].per_game;
  check('② 판 카드: census 성적표 6지표(+1/−1 두 열 · directions.per_game) — 측정 판만', /승률<\/td>/.test(card) && /MDD/.test(card) && /최장 연패/.test(card) && /길이/.test(card) && /꼬리/.test(card) && /관통률/.test(card) && card.indexOf('<td>' + pg.n + '</td>') >= 0 && card.indexOf((pg.win_rate * 100).toFixed(1) + '%') >= 0);
  check('② 판 카드: 4국면별 승률 · 비겹침/종료일/최악 시즌/동전 참조 · k별 census 는 ? 안', /4국면별 승률/.test(card) && /비겹침 열/.test(card) && /동전 참조/.test(card) && /data-help="[^"]*k별 census/.test(card) && !/k별 census/.test(stripHelp(card)));
  check('② §8d 사이즈 규칙 줄 = 열린 사이클(step 2)일 때만 · "지금 2단계 · 다음 사이즈 1.50R" · 규칙 설명(역마팅게일 · 3단계 · 상한 4.0R · P(승|승)/P(승|패))은 ? 안', /사이즈 규칙<\/i><b>역마팅게일[^<]*<\/b> · 지금 2단계 · 다음 사이즈 <b>1\.50R<\/b>/.test(card) && /data-help="[^"]*3단계 · 상한 4\.0R · 측정 · P\(승\|승\) 74\.0% · P\(승\|패\) 61\.0%/.test(card) && !/3단계/.test(stripHelp(card)), (card.match(/사이즈 규칙<\/i>.{0,80}/) || [''])[0]);
  const c25 = b25.conditional['+1'].after_win.same_dir, c25f = b25.conditional['+1'].after_win.flip_dir;
  check('② §8e 이긴 뒤/진 뒤 = 작은 표 하나(스키마 2 방향별 after_win/after_loss · 같은 방향/뒤집기 · 승률 · n · lift_vs_baseline) · 히스토그램/두 칸 박스 0 · 연도 부호', (card.match(/bs-condtbl/g) || []).length === 1 && new RegExp('\\+1 이긴 뒤</td><td><b>' + (c25.win_rate * 100).toFixed(1) + '%</b> <span class="wb-muted">n ' + c25.n + '</span> <span class="wb-muted">\\(' + (c25.lift_vs_baseline < 0 ? '−' : '\\+') + Math.abs(c25.lift_vs_baseline * 100).toFixed(1) + '%p\\)').test(card) && card.indexOf('<b>' + (c25f.win_rate * 100).toFixed(1) + '%</b>') >= 0 && /−1 진 뒤/.test(card) && !/bs-cond-col|bs-hist|R 히스토그램/.test(card) && /연도 부호 −−\+−−−/.test(card) && /data-help="[^"]*운용 참고 · 추천 아님 · 과거 분포/.test(card), (card.match(/\+1 이긴 뒤.{0,140}/) || [''])[0]);
  check('② 요인 적재 = 측정 판(provisional false)만 · 엔진 factor_loading 값', /요인 적재<\/i>레벨 45\.8% · 커브 47\.4% · 잔차 6\.8%/.test(card) && (card.match(/class="bs-kpis bs-line"/g) || []).length >= 6, (card.match(/class="bs-kpis bs-line"/g) || []).length);
  B.show('L.cash.2y'); card = ELS.bsBoardCard.innerHTML;
  check('② 미실측 판(scorecard null): 성적표 · 이긴 뒤/진 뒤 · 요인 적재 없음 → "미실측" 한 줄 · evidence 없음/성적표 없음/빈 박스 0 · 사이즈 규칙 줄 0(열린 사이클 없음) · 잠정 0', /<span>미실측<\/span>/.test(card) && !/class="bs-sc"|bs-condtbl|요인 적재|evidence 없음|성적표 없음|사이즈 규칙|bs-cond-note/.test(card) && !/잠정/.test(stripEngineText(card.replace(/data-help="[^"]*"/g, ''))), (card.match(/<span>미실측<\/span>|evidence 없음|성적표 없음/g) || []).join(','));
  check('② 미실측 판: X 확정 숫자 · k 기본값 설명은 ? 안(k_provisional · 결정 id) · 본전 p* (추정) · 기준선 없으면 그 칸 생략("–" 0)', /장벽 X<\/i><b>[0-9.]+bp<\/b> <span class="wb-muted">= k 1\.0 × σ21/.test(card) && !/\(잠정\)/.test(card) && /data-help="k 1\.0 = 현행 기본값\(config\.k_provisional[^"]*결정 2026-10-27\.open\.spoke_s25_promotion/.test(card) && /본전 승률 p\* <b>65\.3%<\/b> <span class="wb-muted">\(추정\)<\/span>/.test(card) && !/기준선 승률/.test(stripHelp(card)) && !/–<\/b>/.test(card), (card.match(/본전 승률.{0,80}/) || [''])[0]);
  B.show('C.fly.2_3_5'); card = ELS.bsBoardCard.innerHTML;
  check('② 미실측 판(본전 불가): "본전 승률 불가 (추정) · 필요 샤프 6.7" 만(p_star_label 없는 구 스냅샷 폴백 = "불가") · 주문 환산 "(기본 D_R)" 꼬리 · 레그 3행 액면 숏/롱/숏', /본전 승률 <b>불가<\/b> <span class="wb-muted">\(추정\)<\/span> · 필요 샤프 6\.7/.test(card) && !/기준선 승률|p\* /.test(stripHelp(card)) && /2y 1140억 숏 · 3y 1660억 롱 · 5y 460억 숏/.test(card) && /\(기본 D_R\)/.test(card) && (card.match(/<tr><td>[+−] /g) || []).length === 3, (card.match(/본전 승률.{0,60}/) || [''])[0]);
  B.show('S.irs.2_5'); card = ELS.bsBoardCard.innerHTML;
  check('② blocked 판: 회계 줄(회계 경로 없음 — R 측정 불가 · 기록만 · blocked 만) · 장벽 미계산 · 주문 환산 = 엔진 note(환산 불가) · 레그 표 = 레그·비율만(오늘 열 생략) · "미실측" 줄 0', /<i>회계<\/i>회계 경로 없음 — R 측정 불가 · 기록만/.test(card) && /장벽 X<\/i>미계산/.test(card) && /환산 불가/.test(card) && /<th>레그<\/th><th>비율<\/th><\/tr>/.test(card) && !/<span>미실측<\/span>|오늘 종목코드/.test(card), (card.match(/주문 환산<\/i>.{0,100}/) || [''])[0]);
  B.show('B.basket.3F'); card = ELS.bsBoardCard.innerHTML;
  check('② 현선 판: 주문 환산 선물 레그만(2213계약 롱) + 엔진 note 인라인(현물 레그는 open 때 종목 지정) (size_rule_state 없는 더미라 사이즈 규칙 줄 0)', /3F 2213계약 롱/.test(card) && /바스켓 종목\(bond\) 지정 전/.test(stripHelp(card)) && !/사이즈 규칙<\/i>/.test(card), (card.match(/주문 환산<\/i>.{0,200}/) || [''])[0]);
  B.show('S.slope.2_5'); card = ELS.bsBoardCard.innerHTML;
  // 정렬(2026-10-27 사용자 피드백 ②): 그리드 안 오른쪽 카드에 세로 간격 규칙이 걸리지 않음 · 그리드 상단 정렬 · 목차 레일 상단 = 본문 첫 카드 상단 · 공용 wb.css 무변경
  check('② 정렬: `.wb-card + .wb-card` 간격은 섹션 직계 자식만 · .bs-grid-2/.bs-grid-4 align-items:start · #view-bootstrap .wb-toc margin-top(제목 줄 높이) · 공용 .wb-toc-layout 규칙은 이 탭 스타일에 없음', /#view-bootstrap \.bs-sec > \.wb-card \+ \.wb-card \{ margin-top/.test(bsStyle) && !/#view-bootstrap \.wb-card \+ \.wb-card \{/.test(bsStyle) && /\.bs-grid-2 \{[^}]*align-items: start/.test(bsStyle) && /\.bs-grid-4 \{[^}]*align-items: start/.test(bsStyle) && /#view-bootstrap \.wb-toc \{ margin-top: calc\(var\(--wb-lh-title\) \+ var\(--wb-s3\)\)/.test(bsStyle) && !/\.wb-toc-layout \{/.test(bsStyle));

  let op = ELS.bsOpen.innerHTML;
  const mg0 = SAMPLE.my_games.main_games.main_games[0];
  check('③ §8b 메인 게임 카드(접힘): #1 · 내가 선 쪽 = 엔진 label 원문 그대로(FACTOR_WORD) · 멤버 2판 · 공통 노출 100% · 합친 지금 · 묶음 근거 배지 + ? (잠정 배지 0)', /메인 게임 #1/.test(op) && op.indexOf('내가 선 쪽: ' + mg0.label + '</span>') >= 0 && /멤버 2판/.test(op) && /공통 노출 100%/.test(op) && /합친 지금/.test(op) && !/잠정 묶음/.test(op) && op.indexOf('<span class="wb-badge">' + mg0.grouping + '</span>') < 0 && op.indexOf('data-help="현행 기본값 · 결정 ' + mg0.decision_id + ' · 묶음 근거: ' + mg0.grouping) >= 0 && !/진입 2026-10-13/.test(op), mg0.label);
  check('③ §8b 미니 게임 개별 카드(main_game_id null · B.basket.3F)', /미니 게임/.test(op) && /B\.basket\.3F\+1@2026-10-20#1/.test(op) && (op.match(/bs-rbar"/g) || []).length === 1);
  check('③ 메인/미니 집계 메타 · 묶음 기준은 ? 안', /3판 열림 · 메인 게임 1 · 미니 게임 1/.test(ELS.bsOpenMeta.textContent) && !/묶음 기준/.test(ELS.bsOpenMeta.textContent) && op.indexOf('묶음 기준: ' + SAMPLE.my_games.main_games.grouping_basis) >= 0, ELS.bsOpenMeta.textContent);
  B.toggleMain('MAIN-1'); op = ELS.bsOpen.innerHTML;
  const comp = SAMPLE.my_games.main_games.main_games[0].composite;
  check('③ §8b 펼침: 멤버 2카드 + composite(합친 장벽 원 · 합친 비용 netted/gross · 넷팅 절감 · 캐리/일) + 합친 R 막대', /진입 2026-10-13/.test(op) && /진입 2026-10-21/.test(op) && /합친 장벽/.test(op) && op.indexOf(comp.cost_R_netted.toFixed(3) + 'R') >= 0 && op.indexOf(comp.cost_R_gross.toFixed(3) + 'R') >= 0 && /넷팅 절감/.test(op) && (op.match(/bs-rbar"/g) || []).length === 4);
  check('③ §8e 게임 카드 한 줄(스키마 2 · 직전 종료 게임 방향 +1 블록 · lift_vs_baseline): 이 판에서 방금 승 → 같은 방향 63.3% (−10.0%p) n31.1 · 뒤집기 49.5% (+14.7%p) + 라벨', /이 판에서 방금 <b>승<\/b> → 다음 게임 같은 방향 <b>63\.3%<\/b> \(−10\.0%p\) n31\.1/.test(op) && /뒤집기 <b>49\.5%<\/b> \(\+14\.7%p\) n33\.1/.test(op) && /운용 참고 · 추천 아님 · 과거 분포/.test(op), (op.match(/이 판에서 방금.{0,120}/) || [''])[0]);
  check('③ §8e 다음 결정 참고 블록(최근 종료 판별 · 역마팅게일 켤 수 있음 배지)', /다음 결정 참고/.test(ELS.bsNextDecision.innerHTML) && /역마팅게일 켤 수 있음/.test(ELS.bsNextDecision.innerHTML) && /현물 2-5/.test(ELS.bsNextDecision.innerHTML));
  check('③ §8d 게임 카드: 사이즈 규칙 · 지금 2단계(×2 · 사이클) · 다음 판 사이즈 2.00R', /사이즈 규칙<\/i><b>역마팅게일/.test(op) && /지금 2단계 \(×1\.5\) · 사이클 C-S25-7 · 다음 판 사이즈 <b>1\.50R/.test(op) && /지금 1단계/.test(op));
  check('③ 게임 카드: 지금 R · 승/패 거리 · 캐리/일 · 국면 진입→지금 · 손익 분해 · 요인 적재 잠정 · 만기(B)', /\+0\.34R/.test(op) && /승까지/.test(op) && /패까지/.test(op) && /캐리\/일/.test(op) && /불스팁 → 불플랫/.test(op) && /손익 분해/.test(op) && /요인 적재/.test(op) && /만기 2026-12-15/.test(op));
  check('③ 최근 종료 4행(역순) · 승/패/무승부/수동 · 메인/미니 몫 열 · 자동/수동', (ELS.bsClosed.innerHTML.match(/<tr>/g) || []).length === 5 && /<td>승 </.test(ELS.bsClosed.innerHTML) && /무승부/.test(ELS.bsClosed.innerHTML) && /수동 종료/.test(ELS.bsClosed.innerHTML) && /메인 몫/.test(ELS.bsClosed.innerHTML) && /−0\.55/.test(ELS.bsClosed.innerHTML));
  F('bsFSize').value = ''; F('bsFBoard').value = 'S.slope.2_5'; B.syncDir();
  check('③ §8d 폼 기본값 = next_size_R(S.slope.2_5 → 1.5) + 힌트', F('bsFSize').value === '1.5' && /기본 1\.50R/.test(F('bsFSizeHint').textContent), F('bsFSize').value + ' | ' + F('bsFSizeHint').textContent);
  // 진입 날짜 기본값 = boards[].entry_date_default(엔진) → 없으면 asof · 사용자가 손대면 유지
  check('③ 날짜 기본값: entry_date_default 없음 → asof(2026-10-26) · data-auto', F('bsFDate').value === SAMPLE.asof && F('bsFDate').getAttribute('data-auto') === '1', F('bsFDate').value);
  B._state.snap.boards.find(b => b.id === 'S.slope.2_5').entry_date_default = '2026-10-24'; B.syncDir();
  check('③ 날짜 기본값: entry_date_default 있으면 그 날(표시 X 와 같은 날)', F('bsFDate').value === '2026-10-24', F('bsFDate').value);
  F('bsFDate').value = '2026-10-20'; F('bsFDate').removeAttribute = function (k) { delete this['_' + k]; }; F('bsFDate').removeAttribute('data-auto'); B.syncDir();
  check('③ 날짜: 사용자가 바꾸면 유지', F('bsFDate').value === '2026-10-20');
  F('bsFDate').setAttribute('data-auto', '1'); delete B._state.snap.boards.find(b => b.id === 'S.slope.2_5').entry_date_default; B.syncDir();
  check('③ §8e 폼 토글: 허용 판(직전 승)에서 활성 · 기본 off', F('bsFParoli').disabled === false && F('bsFParoli').checked === false && /켤 수 있음/.test(F('bsFParoliTxt').textContent), F('bsFParoliTxt').textContent);
  F('bsFParoli').checked = true; B.paroli();
  check('③ §8e 토글 켜면 크기 = config.paroli_mult(1.5R) · 설명(딴 돈 50% 재투자 · 합계 −0.5R)', F('bsFSize').value === '1.5' && /켬 · 1\.5R/.test(F('bsFParoliTxt').textContent) && /딴 돈 50% 재투자 · 실패하면 합계 −0\.5R/.test(ELS.bsMsg.textContent), ELS.bsMsg.textContent);
  B.syncDir();
  check("③ §8e 켠 상태 syncDir 라벨도 config.paroli_mult(하드코딩 '2R' 0)", /켬 · 1\.5R/.test(F('bsFParoliTxt').textContent) && !/2R/.test(F('bsFParoliTxt').textContent) && !/'켬 · 2R'/.test(src), F('bsFParoliTxt').textContent);
  F('bsFBoard').value = 'L.cash.2y'; B.syncDir();
  (function () { var saved = B._state.snap.config.paroli_mult; delete B._state.snap.config.paroli_mult; F('bsFBoard').value = 'S.slope.2_5'; B.syncDir(); F('bsFParoli').checked = true; B.paroli();
    check('③ §8e config.paroli_mult 없으면 켤 수 없음(하드코딩 0)', F('bsFParoli').checked === false && /paroli_mult/.test(ELS.bsMsg.textContent)); B._state.snap.config.paroli_mult = saved; F('bsFBoard').value = 'L.cash.2y'; B.syncDir(); })();
  check('③ §8e 비허용 판으로 바꾸면 토글 비활성 + 꺼짐(시스템이 켜지 않음)', F('bsFParoli').disabled === true && F('bsFParoli').checked === false);
  check('③ §8d next_size_R 없는 판 → 자동값 유지 안 함(힌트 비움)', F('bsFSizeHint').textContent === '');
  F('bsFSize').value = '';
  check('③ 폼: 판 select 36 · 방향 뜻(dir_meaning "1"/"-1")', (F('bsFBoard').innerHTML.match(/<option/g) || []).length === 36 && F('bsFDirMeaning').textContent.length > 2, F('bsFDirMeaning').textContent);
  check('④ 한쪽 델타 4,710만 / 한도 1억 · 47.1% · 결정 수', /4,710만/.test(ELS.bsRiskGauge.innerHTML) && /1억/.test(ELS.bsRiskGauge.innerHTML) && /47\.1%/.test(ELS.bsRiskGauge.innerHTML) && /결정 수/.test(ELS.bsRiskGauge.innerHTML));
  check('④ 시즌: 손익 · 본전선 40억 · 감내선 −20억 · by_layer 두 줄(메인/미니 · 종료 수 · 순 R 합 · 열린 MtM)', /본전선/.test(ELS.bsSeason.innerHTML) && /40억/.test(ELS.bsSeason.innerHTML) && /−20억/.test(ELS.bsSeason.innerHTML) && /메인 층/.test(ELS.bsSeason.innerHTML) && /미니 층/.test(ELS.bsSeason.innerHTML) && /열린 MtM/.test(ELS.bsSeason.innerHTML));
  check('④ 사이즈 자 D_R(출처·판) · b(지금) 0 · 크기 축소 라벨 · S 병기 · 버틸 낙폭 – (엔진 null 그대로)', /D_R/.test(ELS.bsSeason.innerHTML) && /b\(지금\) 0원/.test(ELS.bsSeason.innerHTML) && /크기 축소 중/.test(ELS.bsSeason.innerHTML) && /S\(연패\) 5/.test(ELS.bsSeason.innerHTML) && /버틸 낙폭<\/i><b class="bs-big">–/.test(ELS.bsSeason.innerHTML));
  check('더미 배너는 로컬+?bs_sample 가 아니면 안 뜸(API 경로)', !/더미 스냅샷/.test(ELS.bsNotice.innerHTML));
  // ⑤ 2026-10-27 저녁(사용자 지시): 각주 섹션 없음 · 잠정 배지 0 · 설명은 ? 툴팁
  const viewNow = (html.match(/<div id="view-bootstrap"[\s\S]*?<\/div><!-- \/bs-content -->/) || [''])[0];
  check('⑤ 각주 섹션 없음(bs-foot · bsHonesty · bsProv 0) · honesty 미렌더', !/bs-foot|bsHonesty|bsProv|정직 각주|잠정 규약/.test(viewNow) && !ELS.bsHonesty && !ELS.bsProv && !/시즌 왜도를 만들지 않음/.test(allHtml()));
  const rendered = Object.keys(ELS).map(k => stripHelp(ELS[k].innerHTML) + ' ' + ELS[k].textContent).join('\n');
  check("⑤ 렌더 출력에 '잠정'·'provisional' 문자열 0(값은 확정 숫자로)", !/잠정|provisional/.test(rendered) && !/잠정/.test(stripHelp(viewNow)), (rendered.match(/.{0,30}(잠정|provisional).{0,30}/g) || []).slice(0, 3).join(' | '));
  const helpIds = ['bsHelpPage', 'bsHelpMarket', 'bsHelpCurve', 'bsHelpRegime', 'bsHelpCorr', 'bsHelpNeff', 'bsHelpMap', 'bsHelpGames', 'bsHelpOpen', 'bsHelpEntry', 'bsHelpDate', 'bsHelpParoli', 'bsHelpClosed', 'bsHelpDeleted', 'bsHelpRisk', 'bsHelpLimit', 'bsHelpSeason'];
  const helpMissing = helpIds.filter(id => !new RegExp('<button type="button" class="wb-help" id="' + id + '" data-help="[^"]+"').test(viewNow));
  check('⑤ 공용 ? 툴팁(.wb-help · data-help) ' + helpIds.length + '개 마크업 존재(새 컴포넌트 0 · 섹션 .bs-meta 서술 0)', helpMissing.length === 0 && !/class="bs-meta"/.test(viewNow) && !/bs-form-note/.test(viewNow), helpMissing.join(','));
  const nHelpRendered = (allHtml().match(/class="wb-help"/g) || []).length;
  check('⑤ 렌더된 카드 안 ? 툴팁 ≥ 12(한계 사용량·기준선 승률·사이즈 규칙·조건부·메인/미니·손익 분해 …)', nHelpRendered >= 12, nHelpRendered);
  check('⑤ 시즌 ? = 본전선 하루 증가(config 계산) · 50% 게임 문구(화면엔 없음)', /하루 약 2,000만씩/.test(F('bsHelpSeason').getAttribute('data-help') || '') && !/50% 게임/.test(ELS.bsSeason.innerHTML), (F('bsHelpSeason').getAttribute('data-help') || '').slice(0, 60));
  check('⑤ 4국면 ? = 엔진 regime4.definition 그대로', (F('bsHelpRegime').getAttribute('data-help') || '').indexOf(SAMPLE.market.regime4.definition) === 0);
  // 엔진 help 문구(해동 추가 예정 boards[].help · risk.help · my_games.help)가 오면 ? 가 그걸 쓴다
  (function () { const s2 = clone(SAMPLE); s2.available = true; s2.risk.help = { one_side: 'ENGINE-LIMIT-HELP' }; s2.my_games.help = 'ENGINE-GAMES-HELP'; s2.boards[0].help = { X_bp: 'ENGINE-BOARD-HELP' }; B._setSnap(s2); B.render(); B.show(s2.boards[0].id);
    check('⑤ 엔진 help 우선: risk.help.one_side · my_games.help(문자열) · boards[].help.X_bp → ? 에 그대로', F('bsHelpLimit').getAttribute('data-help') === 'ENGINE-LIMIT-HELP' && F('bsHelpGames').getAttribute('data-help') === 'ENGINE-GAMES-HELP' && /data-help="ENGINE-BOARD-HELP/.test(ELS.bsBoardCard.innerHTML));
    delete s2.honesty; delete s2.provisional_items; B._setSnap(s2); B.render();
    check('⑤ 스냅샷에 honesty · provisional_items 없어도 렌더 무해', /메인 게임 #1/.test(ELS.bsOpen.innerHTML) && /본전선/.test(ELS.bsSeason.innerHTML));
    // 스키마 2(해동 2026-10-27.bootstrap_fix_defaults) 정확한 필드명: boards[].help{필드} · my_games.help{키} · risk.help{키} · my_games.amend · entry_date_default · rule_status · open[].entry_marks/E_won_at_open/one_R_rule
    const s3 = clone(SAMPLE); s3.available = true; s3.schema = 2; s3.entry_date_default = '2026-10-27';
    s3.rule_status = { status: 'current_default', fix_decision_id: '2026-10-27.bootstrap_fix_defaults', note: 'RS-NOTE' };
    s3.current_defaults = [{ key: 'D0_won', decision_id: 'x', rule_status: 'current_default' }];
    const b3 = s3.boards.find(b => b.id === 'S.slope.2_5'); b3.entry_date_default = '2026-10-27'; b3.X_rule = 'XRULE-2026-10-27'; b3.one_R_won = 12500000; b3.one_R_rule = { scope: 'ONE-R-SCOPE' };
    b3.help = { X_bp: 'H-XBP', cost_R: 'H-COST', one_R_won: 'H-ONER', breakeven: 'H-BE', baseline_winrate: 'H-BASE', scorecard: 'H-SC', D_R: 'H-DR', size_rule: 'H-SR', conditional: 'H-COND', factor_loading: 'H-FL', marginal_usage_if_open: 'H-MU', per_board_cap: 'H-PBC', status: 'H-ST', k: 'H-K' };
    b3.size_rule.rule_status = 'current_default'; delete b3.size_rule.basis; b3.per_board_cap.rule_status = 'current_default'; delete b3.per_board_cap.provisional;
    s3.my_games.help = { open: 'H-OPEN', entry_date_default: 'H-EDD', season: 'H-SEASON', main_games: 'H-MAIN', next_size_R: 'H-NSR', closed_recent: 'H-CLOSED', deleted_recent: 'H-DEL', amend: 'H-AMEND', ledger: 'H-LEDGER' };
    s3.my_games.amend = { allowed: ['memo', 'size_R', 'dv01_won_per_bp', 'one_R_won', 'bond'], frozen: ['dir', 'date'], reject_reason: 'REJECT-REASON-TEXT' };
    s3.my_games.entry_date_default = '2026-10-27'; s3.my_games.ledger.chain_note = 'CHAIN-NOTE';
    s3.risk.help = { one_side: 'H-ONESIDE', size_rule: 'H-RSR', b_now_won: 'H-BNOW', survivable_drawdowns: 'H-SURV', effective_decisions: 'H-EFF', netting_unit: 'H-NET', assumed_corr: 'H-CORR' };
    s3.risk.size_rule.rule_status = 'current_default'; delete s3.risk.size_rule.provisional;
    Object.assign(s3.my_games.open[2], { entry_marks: 'prev_close', marks_date: '2026-10-17', one_R_won: 12500000, E_won_at_open: -39810000, one_R_rule: 'ONE-R-RULE-TEXT', step: 1, size_mult: 1, cycle_id: 'C-B3F-1' });
    s3.scorecard_meta.chain_rule = 'CHAIN-RULE';
    s3.risk.decision_groups = [{ board_id: 'S.slope.2_5', dir: 1, size_R_sum: 1.5, allowed_size_R: 1.5 }];
    Object.assign(b3.per_board_cap, { ruler: 'D_R', one_R_won: 152997003.9, step_mult: 1.0, tol: 1.05 }); delete b3.order_preview;   // 구 스냅샷(해동 bcd2d51e 이전) 폴백 경로
    B._setSnap(s3); B.render(); B.show('S.slope.2_5');
    const c3 = ELS.bsBoardCard.innerHTML, helpsIn = h => (c3.match(/data-help="([^"]*)"/g) || []).some(x => x.indexOf(h) >= 0);
    const H11 = ['H-XBP', 'H-COST', 'H-ONER', 'H-BE', 'H-BASE', 'H-SC', 'H-DR', 'H-SR', 'H-COND', 'H-FL', 'H-ST'];
    check('⑤ 스키마 2: boards[].help 필드별 ? 11종 판 카드 ? 안(한계 사용량·판당 상한 ? 는 카드에서 삭제 → 한도 섹션) + X_rule · chain_rule · order_preview 없으면 one_R_won help', H11.every(helpsIn) && helpsIn('XRULE-2026-10-27') && helpsIn('비겹침 열 = CHAIN-RULE') && !helpsIn('H-MU') && !helpsIn('H-PBC'), H11.filter(h => !helpsIn(h)).join(','));
    check('⑤ 스키마 2: order_preview 없는(구) 스냅샷 → 주문 환산 폴백 = 엔진 one_R_won(1,250만) → 델타 per_board_cap.cap_won · 액면 "미생성" 정직 · 1R 금액 행 0 · 잠정 0', /주문 환산<\/i>1R <b>1,250만<\/b> → 델타 <b>[0-9,]+만\/bp<\/b> <span class="wb-muted">→ 레그 액면 미생성\(order_preview 없음\)<\/span>/.test(c3) && !/1R 금액/.test(c3) && !/잠정|provisional/.test(stripHelp(c3)), (c3.match(/주문 환산<\/i>.{0,120}/) || [''])[0]);
    check('⑤ 스키마 2: my_games.help → 섹션 ? · 메인 게임 ? · rule_status.note → 페이지 ?', F('bsHelpOpen').getAttribute('data-help') === 'H-OPEN' && F('bsHelpDate').getAttribute('data-help') === 'H-EDD' && F('bsHelpSeason').getAttribute('data-help') === 'H-SEASON' && F('bsHelpClosed').getAttribute('data-help') === 'H-CLOSED' && F('bsHelpDeleted').getAttribute('data-help') === 'H-DEL' && F('bsHelpGames').getAttribute('data-help') === 'H-LEDGER' && F('bsHelpParoli').getAttribute('data-help') === 'H-NSR' && /data-help="H-MAIN/.test(ELS.bsOpen.innerHTML) && /RS-NOTE · 결정 2026-10-27\.bootstrap_fix_defaults/.test(F('bsHelpPage').getAttribute('data-help') || ''));
    check('⑤ 스키마 2: risk.help → 한도 ? · 사이즈 자 ? · 넷팅 ? · 결정 수 ? · 상관 ?(assumed_corr 폴백)', F('bsHelpLimit').getAttribute('data-help') === 'H-ONESIDE' && /data-help="현행 기본값[^"]*H-RSR · H-BNOW · H-SURV/.test(ELS.bsSeason.innerHTML) && /data-help="현행 기본값[^"]*H-NET/.test(ELS.bsRiskMeta.innerHTML) && /H-EFF/.test(ELS.bsRiskGauge.innerHTML) && F('bsHelpCorr').getAttribute('data-help') === 'H-CORR', (ELS.bsSeason.innerHTML.match(/data-help="현행 기본값[^"]{0,80}/) || [''])[0]);
    F('bsFBoard').value = 'S.slope.2_5'; F('bsFDate').value = ''; F('bsFDate').setAttribute('data-auto', '1'); B.syncDir();
    check('⑤ 스키마 2: 폼 날짜 = boards[].entry_date_default(2026-10-27 · asof 2026-10-26 와 다름)', F('bsFDate').value === '2026-10-27', F('bsFDate').value);
    B.amend(s3.my_games.open[0].game_id);
    check('⑤ 스키마 2: 정정 배너 ? = my_games.help.amend + allowed + reject_reason 원문', /data-help="H-AMEND\n허용 = memo, size_R, dv01_won_per_bp, one_R_won, bond\nREJECT-REASON-TEXT"/.test(F('bsFAmend').innerHTML), F('bsFAmend').innerHTML.slice(0, 200));
    B.cancelAmend();
    const op3 = ELS.bsOpen.innerHTML;
    check('⑤ 스키마 2: 게임 카드 마크(prev_close 2026-10-17) · 1R + E_won_at_open · one_R_rule ? · 사이클', /마크<\/i>prev_close 2026-10-17/.test(op3) && /1R 1,250만 \(E −3,981만\)/.test(op3) && /data-help="ONE-R-RULE-TEXT"/.test(op3) && /사이클 C-B3F-1/.test(op3), (op3.match(/마크<\/i>.{0,40}/) || [''])[0]);
    check('⑤ 스키마 2: risk.decision_groups[].allowed_size_R → 결정 묶음(1.50R/1.50R)', /결정 묶음<\/i>현물 2-5 \+1 1\.50R\/1\.50R/.test(ELS.bsRiskGauge.innerHTML), (ELS.bsRiskGauge.innerHTML.match(/결정 묶음<\/i>[^<]*/) || [''])[0]);
    check('⑤ 스키마 2: schema 2 표시 · current_defaults 미렌더(잠정 목록 0)', /schema 2/.test(ELS.bsAsof.textContent) && !/D0_won/.test(allHtml()));
    B._setSnap(clone(SAMPLE)); B._state.snap.available = true; B.render(); B.show('S.slope.2_5'); })();

  // ②b board_corr matrix null(엔진 실값) · main_games 비어 있고 open[].main_game_id 만
  const snapNoCorr = clone(SAMPLE); snapNoCorr.market.board_corr = { matrix: null, n_eff_now: null, n_eff_history: [], window: 63, source: null, status: '동행표 미실측' }; snapNoCorr.my_games.main_games = { main_games: [], n_main: 0, n_mini: 3 }; snapNoCorr.available = true;
  B._setSnap(snapNoCorr); B.render();
  check('① board_corr.matrix null → 동행표 미실측(status 그대로)', /동행표 미실측/.test(ELS.bsCorr.innerHTML) && /동행표 미실측/.test(ELS.bsNeff.innerHTML) && /동행표 미실측/.test(ELS.bsCorrMeta.textContent));
  check('③ main_games 비었고 open[].main_game_id 만 → 묶음 표시 · composite 없음 정직 · ? 설명', /메인 게임 #1/.test(ELS.bsOpen.innerHTML) && /composite 없음/.test(ELS.bsOpen.innerHTML) && /data-help="스냅샷 main_games 에 없음/.test(ELS.bsOpen.innerHTML));
  const snapErr = clone(SAMPLE); snapErr.my_games.open[2].now = null; snapErr.my_games.open[2].err = 'KeyError: path'; snapErr.available = true;
  B._setSnap(snapErr); B.render();
  check('③ now null(엔진 경로 오류) → 숫자 안 지어냄 · 오류 원문', /지금 위치 계산 불가/.test(ELS.bsOpen.innerHTML) && /KeyError: path/.test(ELS.bsOpen.innerHTML));
  // 테스트 게임 삭제 뒤 = 열린 판 0 · 종료 0 · 삭제됨만 → 빈 상태 렌더(가짜 숫자 0)
  const snapEmpty = clone(SAMPLE); snapEmpty.my_games.open = []; snapEmpty.my_games.closed_recent = []; snapEmpty.my_games.main_games = { main_games: [], n_main: 0, n_mini: 0 }; snapEmpty.my_games.auto_closed_this_build = []; snapEmpty.risk.by_code = []; snapEmpty.risk.one_side = 0; snapEmpty.risk.long_sum = 0; snapEmpty.risk.short_sum = 0; snapEmpty.available = true;
  B._setSnap(snapEmpty); B.render();
  check('③ 테스트 게임 삭제 뒤 빈 상태: 열린 판 없음 · 종료 기록 없음 · 삭제됨 목록 유지 · DV01 0 · 다음 결정 블록 없음', /열린 판 없음/.test(ELS.bsOpen.innerHTML) && /종료 기록 없음/.test(ELS.bsClosed.innerHTML) && /잘못 기록 — 실제 체결 없음/.test(ELS.bsDeleted.innerHTML) && /종목별 DV01 0/.test(ELS.bsRiskChartBox.innerHTML) && ELS.bsNextDecision.innerHTML === '' && ELS.bsOpenMeta.textContent === '' && (ELS.bsMap.innerHTML.match(/bs-open-dot/g) || []).length === 0, ELS.bsOpenMeta.textContent);
  B._setSnap(clone(SAMPLE)); B._state.snap.available = true; B.render();

  // ③ 폼 POST → 응답 스냅샷으로 재렌더
  F('bsFBoard').value = 'S.slope.3_5'; F('bsFDir').value = '-1'; F('bsFDate').value = '2026-10-27'; F('bsFSize').value = '0.5'; F('bsFMemo').value = 'smoke';
  const snap2 = clone(SAMPLE);
  snap2.my_games.open.push(Object.assign(clone(SAMPLE.my_games.open[2]), { game_id: 'G-SMOKE', board_id: 'S.slope.3_5', dir: -1, entry_date: '2026-10-27', main_game_id: null, layer: 'mini' }));
  snap2.available = true;
  POST_RESULT = { ok: true, event: 'open', engine: { ledger_fn: 'open_game', snapshot_fn: 'build_snapshot' }, snapshot: snap2 };
  await B.submit();
  const ev = CALLS.post[0] && CALLS.post[0].body;
  check('POST /game-board/game open 이벤트(계약 §7 키 · 엔진 open_game 인자)', !!ev && ev.event === 'open' && ev.board_id === 'S.slope.3_5' && ev.dir === -1 && ev.date === '2026-10-27' && ev.size_R === 0.5 && ev.by === 'web', JSON.stringify(ev));
  check('open POST: 토글 안 켜면 paroli 키 없음', ev.paroli === undefined);
  check('응답 스냅샷으로 즉시 재렌더(G-SMOKE 카드 · 미니)', /G-SMOKE/.test(ELS.bsOpen.innerHTML) && /기록 완료/.test(ELS.bsMsg.textContent) && /open_game → build_snapshot/.test(ELS.bsMsg.textContent), ELS.bsMsg.textContent);
  B.sizeMode('size_R'); F('bsFBoard').value = 'S.slope.2_5'; B.syncDir(); F('bsFParoli').checked = true; B.paroli(); POST_RESULT = { ok: true, snapshot: snap2 }; await B.submit();
  check('§8e 토글 켠 open POST → paroli:true · size_R 1.5(config.paroli_mult)', CALLS.post[1].body.paroli === true && CALLS.post[1].body.size_R === 1.5 && CALLS.post[1].body.board_id === 'S.slope.2_5', JSON.stringify(CALLS.post[1].body));
  check('§8e POST 뒤 토글 자동 off', F('bsFParoli').checked === false);
  B.sizeMode('one_R_won'); F('bsFSize').value = '125000000'; await B.submit();
  check('크기 단위 1R 금액(원) → one_R_won', CALLS.post[2].body.one_R_won === 125000000 && CALLS.post[2].body.size_R === undefined);
  POST_RESULT = new Error('503 — 엔진 game_board 패키지 없음');
  B.close('G-SMOKE'); await new Promise(r => setTimeout(r, 0));
  check('close 이벤트(result manual · date) 전송 + 503 정직 표시', CALLS.post[3].body.event === 'close' && CALLS.post[3].body.game_id === 'G-SMOKE' && CALLS.post[3].body.result === 'manual' && /기록 실패/.test(ELS.bsMsg.textContent) && /503/.test(ELS.bsMsg.textContent), ELS.bsMsg.textContent);
  B.amend(SAMPLE.my_games.open[0].game_id);
  check('amend: 폼 프리필 + 판·방향·날짜 잠금 + 역마팅게일 비활성 + 배너(? 에 원래 open 보존 문구)', F('bsFBoard').value === 'S.slope.2_5' && F('bsFAmend').hidden === false && /크기·종목·메모만/.test(F('bsFAmend').innerHTML) && /원래 open 은 남고/.test(F('bsFAmend').innerHTML) && F('bsFBoard').disabled === true && F('bsFDir').disabled === true && F('bsFDate').disabled === true && F('bsFParoli').disabled === true);
  B.sizeMode('size_R'); F('bsFSize').value = '1.5'; F('bsFBond').value = 'KR103503GA45'; F('bsFMemo').value = 'fix'; POST_RESULT = { ok: true, snapshot: snap2 };
  await B.submit();
  const am = CALLS.post[4].body;
  check('amend 이벤트 = game_id + 크기·종목·메모만(dir/date/board_id/status 없음)', am.event === 'amend' && am.game_id === SAMPLE.my_games.open[0].game_id && am.size_R === 1.5 && am.bond === 'KR103503GA45' && am.memo === 'fix' && am.dir === undefined && am.date === undefined && am.board_id === undefined && am.status === undefined && am.paroli === undefined, JSON.stringify(am));
  check('amend 뒤 잠금 해제 · 날짜 기본값 복원', F('bsFBoard').disabled === false && F('bsFDate').disabled === false && F('bsFAmend').hidden === true && F('bsFDate').value === SAMPLE.asof, F('bsFDate').value);
  B.amend(SAMPLE.my_games.open[0].game_id); F('bsFSize').value = ''; F('bsFBond').value = ''; F('bsFMemo').value = ''; const nBefore = CALLS.post.length; await B.submit();
  check('amend: 바꿀 값 없으면 POST 안 함', CALLS.post.length === nBefore && /정정할 값 없음/.test(ELS.bsMsg.textContent));
  F('bsFSize').value = '9'; POST_RESULT = new Error('서버 오류 400 — game_board.ledger amend 거부: ValueError: dir 은 amend 불가'); await B.submit();
  check('amend 엔진 거부 → 사유 원문 표시 · 입력값 보존 · 정정 모드 유지', /정정 거부 — 서버 오류 400 — game_board\.ledger amend 거부: ValueError: dir 은 amend 불가/.test(ELS.bsMsg.textContent) && F('bsFSize').value === '9' && F('bsFAmend').hidden === false, ELS.bsMsg.textContent);
  B.cancelAmend();
  check('정정 취소 → 잠금 해제', F('bsFBoard').disabled === false && F('bsFAmend').hidden === true);
  POST_RESULT = { ok: true, snapshot: { available: true, ok: false, err: 'rebuild fail' } };
  B.note('G-SMOKE'); await new Promise(r => setTimeout(r, 0));
  check('note 이벤트 + 스냅샷 재빌드 실패 → 재로드·정직 메시지', CALLS.post[CALLS.post.length - 1].body.event === 'note' && /재빌드 실패/.test(ELS.bsMsg.textContent), ELS.bsMsg.textContent);
  // §3 삭제: 사유 필수 · 확인 한 번 · 삭제됨 목록
  const nPost = CALLS.post.length;
  PROMPT_REASON = '   '; B.del('G-SMOKE'); await new Promise(r => setTimeout(r, 0));
  check('delete: 사유 비면 POST 안 함 + 안내', CALLS.post.length === nPost && /사유가 비어/.test(ELS.bsMsg.textContent), ELS.bsMsg.textContent);
  PROMPT_REASON = '잘못 기록'; POST_RESULT = { ok: true, snapshot: snap2 };
  B.del('G-SMOKE'); await new Promise(r => setTimeout(r, 0));
  check('delete: POST {event delete, game_id, reason, by web}', CALLS.post.length === nPost + 1 && CALLS.post[nPost].body.event === 'delete' && CALLS.post[nPost].body.game_id === 'G-SMOKE' && CALLS.post[nPost].body.reason === '잘못 기록' && CALLS.post[nPost].body.by === 'web', JSON.stringify(CALLS.post[nPost].body));
  check('삭제됨 목록(deleted_recent · 사유)', /잘못 기록 — 실제 체결 없음/.test(ELS.bsDeleted.innerHTML) && /L\.cash\.5y\+1@2026-10-02#1/.test(ELS.bsDeleted.innerHTML));
  const snapNoDel = clone(SAMPLE); delete snapNoDel.my_games.deleted_recent; snapNoDel.available = true; B._setSnap(snapNoDel); B.render();
  check('deleted_recent 없음 → 정직 안내', /삭제 기록 없음/.test(ELS.bsDeleted.innerHTML));
  check('게임 카드에 삭제 버튼', /BS\.del\(/.test(ELS.bsOpen.innerHTML));

  // ⑥ §8f 바카라 테이블(사용자 2026-10-28) — 모달 열림 · 로드 규칙(연속/전환/무승부 겹침/6행 꼬리) · 집계 · 칩 쌓기(상한·사유) · 베팅 POST 페이로드 · road/chips 없음 폴백
  B._setSnap(clone(SAMPLE)); B._state.snap.available = true; B.render();
  check('⑥ 모달 마크업: #bsTable(role dialog) · 점수판/베팅 카드 · 접이식 판 정보 안에 #bsBoardCard · 지도 그리드에 sticky 카드 없음', /<div class="bs-modal" id="bsTable" hidden role="dialog"/.test(html) && /<details class="bs-modal-info" id="bsTblInfo">[\s\S]*?id="bsBoardCard"/.test(html) && !/class="wb-card bs-sticky" id="bsBoardCard"/.test(html) && /id="bsHelpRoad" data-help="[^"]+"/.test(html) && /id="bsHelpBet" data-help="[^"]+"/.test(html));
  check('⑥ 지도 칸 로드 미리보기(최근 20칸 구슬): road 있는 3판만 · 진행 중 점선 칸', (ELS.bsMap.innerHTML.match(/class="bs-rd-mini"/g) || []).length === 3 && /bs-rd-mini"[^>]*>(<i class="[^"]*"><\/i>){20}<i class="bs-rd-cur"><\/i><\/span>/.test(ELS.bsMap.innerHTML));
  check('⑥ 모달 닫힘 상태에서 render() 는 열지 않음', F('bsTable').hidden !== false);
  B.show('S.slope.2_5');
  const hd = ELS.bsTblHead.innerHTML, rd = ELS.bsTblRoad.innerHTML;
  check('⑥ 판 지도 칸 클릭 → 모달 열림(hidden=false) + 판 정보 카드(옛 판 카드 · 기준선 승률)', F('bsTable').hidden === false && /기준선 승률/.test(ELS.bsBoardCard.innerHTML) && /로드 미리보기/.test(ELS.bsBoardCard.innerHTML));
  check('⑥ 헤더: 판 이름 · +1/−1 뜻 · 오늘 장벽 ±X · 한도 사용/1억 · 시즌(슈) · 게임 #49(진행 중 · 사슬 순번) · Min 1R · Max 판당 델타 상한 · 칩 상한 1.50R', /테이블 · /.test(hd) && /<i>\+1<\/i>스티프너/.test(hd) && /<i>−1<\/i>/.test(hd) && /오늘 장벽<\/i><b>±9\.2bp/.test(hd) && /한도 사용<\/i>4,710만 \/ 1억/.test(hd) && /시즌\(슈\)<\/i>2026-01-01 · year/.test(hd) && /게임<\/i>#49 <span class="wb-muted">\(진행 중/.test(hd) && /Min 1R = /.test(hd) && /Max 판당 델타 상한 1,348만\/bp/.test(hd) && /칩 상한 1\.50R/.test(hd), hd.replace(/<[^>]+>/g, ' ').slice(0, 300));
  const beadHtml = rd.slice(rd.indexOf('bs-rd-bead'), rd.indexOf('bs-rd-big')), bigHtml = rd.slice(rd.indexOf('bs-rd-big'), rd.indexOf('bs-rd-tally'));
  check('⑥ 구슬 로드: 48칸 + 진행 중 1칸 · 색 = +1 적 20 / −1 청 22 / 무승부 녹 6 · 관통 테두리 점 4 · 내 게임(종료 = 결과 색 칸) 1', (beadHtml.match(/class="bs-rd bs-rd-p/g) || []).length === 20 && (beadHtml.match(/class="bs-rd bs-rd-m/g) || []).length === 22 && (beadHtml.match(/class="bs-rd bs-rd-t/g) || []).length === 6 && (beadHtml.match(/is-pen/g) || []).length === 4 && (beadHtml.match(/is-mine/g) || []).length === 1 && /bs-rd bs-rd-cur bs-cur-p" data-rp-b="S\.slope\.2_5" data-rp-n="49" title="진행 중 · #49 · 진입 2026-10-13 · 10일 · 지금 R\(\+1 관점\) \+0\.34R · 승까지 0\.66R · 패까지 1\.34R · 지금 쪽 \+1 \(cum_R_plus 부호\(side_now 없음\)\)"/.test(beadHtml), (beadHtml.match(/bs-rd-cur[^>]*>/) || [''])[0]);
  // 해동 실스냅샷 필드 모양(2026-10-28 라이브 확인): streaks.current={side,len} · window={size,from_n,to_n,total} · road.status/note/help/direction_basis/last_end · chips[].label/label_won/loss_at_barrier_won · chips [] (회계 none 판) · 상한 사유 = size_rule_state.paroli_reason
  (function () { const s6 = clone(SAMPLE); s6.available = true; const b6 = s6.boards.find(b => b.id === 'S.slope.2_5'), r6 = b6.road;
    r6.streaks = { max_plus: 7, max_minus: 3, current: { side: -1, len: 1 }, rule: '무승부(T)는 줄을 끊지 않는다(바카라 규약)' }; r6.window = { size: 120, from_n: 1, to_n: 48, total: 48 }; r6.status = 'ok'; r6.note = 'ROAD-NOTE'; r6.help = 'ROAD-HELP'; r6.direction_basis = '+1 관점(R_plus)'; r6.last_end = '2026-10-13'; r6.counts.census = 48; r6.counts.engine = 0;
    b6.chips = [{ mult: 0.5, size_R: 0.5, dv01_won_per_bp: 8274379.6, loss_at_barrier_won: 76498501.9, label: '827만', label_won: '0.76억' }, { mult: 1.0, size_R: 1.0, dv01_won_per_bp: 16548759.2, loss_at_barrier_won: 152997003.9, label: '1,655만', label_won: '1.53억' }];
    delete b6.allowed_max_reason; b6.allowed_max_size_R = 1.0; b6.size_rule_state = { rule: 'flat', step: 1, next_size_R: 1.0, paroli_available: false, paroli_reason: '이 판 종료 게임 없음(삭제 = 사이클 초기화)', if_paroli_size_R: 1.5, allowed_max_size_R: 1.0, chips: [0.5, 1.0] }; b6.help = Object.assign({}, b6.help || {}, { chips: 'CHIPS-HELP', allowed_max_size_R: 'ALLOWED-HELP' });
    const nb = s6.boards.find(b => b.id === 'I.resid.nonbench'); if (nb) { nb.road = { status: 'none', note: 'NONE-NOTE', games: [], counts: null, streaks: null, current: null, my_open: [], my_games_on_board: [] }; nb.chips = []; nb.allowed_max_size_R = 1.0; }
    B._setSnap(s6); B.render(); B.show('S.slope.2_5'); const r = ELS.bsTblRoad.innerHTML, bt = ELS.bsTblBet.innerHTML;
    check('⑥ 해동 모양: streaks.current={side:-1,len:1} → 지금 연속 −1 · 최장 +7/−3 · rule ? · window 객체 "최근 120 (#1–#48 / 전체 48)" · direction_basis · census/엔진 건수', /지금 연속 <b>−1<\/b>/.test(r) && /최장 연속 <b>\+7 \/ −3<\/b>/.test(r) && /data-help="무승부\(T\)는 줄을 끊지 않는다/.test(r) && /최근 120 \(#1–#48 \/ 전체 48\)/.test(r) && !/object Object/.test(r) && /\+1 관점\(R_plus\)/.test(r) && /\(census 48 · 엔진 0\)/.test(r), (r.match(/구슬 로드.{0,160}/) || [''])[0].replace(/<[^>]+>/g, ' '));
    check('⑥ 해동 모양: road.help → 점수판 ? · road.note → 제목 ? · meta 마지막 종료 · chips/allowed help → 베팅 ?', F('bsHelpRoad').getAttribute('data-help') === 'ROAD-HELP' && /data-help="ROAD-NOTE"/.test(r) && /마지막 종료 2026-10-13/.test(ELS.bsTblRoadMeta.textContent) && /CHIPS-HELP/.test(F('bsHelpBet').getAttribute('data-help')) && /ALLOWED-HELP/.test(F('bsHelpBet').getAttribute('data-help')));
    check('⑥ 해동 모양: 칩 면 = ×0.5 / 827만/bp · ×1 / 1,655만/bp(엔진 dv01) · title 장벽 도달 손실 0.76억 · 상한 1.00R + 사유 = size_rule_state.paroli_reason', /data-mult="0\.5"[^>]*title="×0\.5 = 0\.50R · 델타 827만\/bp · 장벽 도달 손실 7,650만 \(0\.76억\)"[^>]*>×0\.5<small>827만\/bp<\/small>/.test(bt) && />×1<small>1,655만\/bp<\/small>/.test(bt) && /상한 <b>1\.00R<\/b> · 이 판 종료 게임 없음\(삭제 = 사이클 초기화\) · 1\.0R 까지/.test(bt), (bt.match(/상한 .{0,120}/) || [''])[0].replace(/<[^>]+>/g, ' '));
    B.zone(1); B.addChip('1');
    check('⑥ 해동 모양: 상한 1.0 → ×0.5 추가 거부 + paroli_reason 사유', B.addChip('0.5') === false && /합계 1\.50R > 상한 1\.00R · 이 판 종료 게임 없음/.test(ELS.bsTblMsg.textContent), ELS.bsTblMsg.textContent);
    if (nb) { B.show('I.resid.nonbench');
      check('⑥ 해동 모양: 회계 none 판 road.status none · games 0 → "결과열 없음 — 엔진 road.status none" + note · chips [] → "엔진 boards[].chips 비어 있음 — 회계 경로 없음"', /결과열 없음 — 엔진 road\.status none/.test(ELS.bsTblRoad.innerHTML) && /NONE-NOTE/.test(ELS.bsTblRoad.innerHTML) && /엔진 boards\[\]\.chips 비어 있음 — 회계 경로 없음/.test(ELS.bsTblBet.innerHTML) && !/bs-zone/.test(ELS.bsTblBet.innerHTML)); }
    B._state.stack = {}; B._setSnap(clone(SAMPLE)); B._state.snap.available = true; B.render(); B.show('S.slope.2_5'); })();
  check('⑥ 구슬 칸 title = 엔진 games 필드 그대로(#n · 결과 · kind · 날짜 · 길이 · +1 관점 R · 내 게임 + 델타 (1+0.5))', /title="#48 \+1 승 · win · 2026-09-14 → 2026-10-06 · 16일 · \+1 관점 \+1\.08R · 내 게임 S\.slope\.2_5\+1@2026-09-14#1 \+1 2,021만\/bp \(1\+0\.5\) 승"/.test(beadHtml), (beadHtml.match(/title="#48[^"]*"/) || [''])[0]);
  (function () { const gs = SAMPLE.boards.find(b => b.id === 'S.slope.2_5').road.games, br = B._bigRoad(gs), nT = gs.filter(g => g.winner === 0).length;
    check('⑥ 빅 로드 렌더(§8f-2): 무승부 = 초록 원 ' + nT + '칸(bs-rd-t · is-tie/data-ties/bs-rd-ties 0) · 꼬리(is-tail) · 좌표 · 진행 중 점선 원 = 맨 끝 열 ' + (br.cols + 1) + ' 맨 위(bs-cur-p · 10일 · data-rp-n 49) · 열 수 ' + (br.cols + 1), (bigHtml.match(/class="bs-rd bs-rd-t/g) || []).length === nT && !/is-tie|data-ties|bs-rd-ties/.test(bigHtml) && /is-tail/.test(bigHtml) && /style="grid-column:1;grid-row:1"/.test(bigHtml) && /grid-column:1;grid-row:2"/.test(bigHtml) && new RegExp('bs-rd bs-rd-cur bs-cur-p" style="grid-column:' + (br.cols + 1) + ';grid-row:1" data-rp-b="S\\.slope\\.2_5" data-rp-n="49" title="진행 중 · #49[^"]*"><b class="bs-rd-n">10</b></span>').test(bigHtml) && new RegExp('bs-rd-big" style="grid-template-columns:repeat\\(' + (br.cols + 1) + ',22px\\)"').test(bigHtml), (bigHtml.match(/bs-rd-cur[^>]*>/) || [''])[0]);
    check('⑥ 빅 로드·구슬 전 칸 호버 훅 data-rp-b/data-rp-n(= games[].n) · 무승부 초록 원도 가운데 일수', (bigHtml.match(/data-rp-n="\d+"/g) || []).length === gs.length + 1 && (beadHtml.match(/data-rp-n="\d+"/g) || []).length === gs.length + 1 && /bs-rd bs-rd-t"[^>]*data-rp-n="6" title="#6 무승부[^"]*"><b class="bs-rd-n">63<\/b><\/span>/.test(bigHtml)); })();
  check('⑥ 집계 박스 = 엔진 road.counts/streaks 그대로: +1 승 20 · −1 승 22 · 무승부 6 · 관통 4 · 최장 연속 +4 / −9 · 지금 연속 +1 · 열 48판', /\+1 승 <b>20<\/b>/.test(rd) && /−1 승 <b>22<\/b>/.test(rd) && /무승부 <b>6<\/b>/.test(rd) && /관통 <b>4<\/b>/.test(rd) && /최장 연속 <b>\+4 \/ −9<\/b>/.test(rd) && /지금 연속 <b>\+1<\/b>/.test(rd) && /열 48판/.test(rd) && !/집계 .* ≠ 열/.test(rd) && !/결과열\(games\)에서 센 값/.test(rd));
  check('⑥ 내 칩(델타 숫자): 진행 중 = 깜빡임(is-live) + 1,350만/bp (1) · 종료 = 2,021만/bp (1+0.5) 승 +1.08R', /is-live[^>]*><b class="bs-rd-n">10<\/b><\/i>\+1 2026-10-13 · <b>1,350만\/bp \(1\)<\/b> · 진행 중 \+0\.34R/.test(rd) && /\+1 2026-09-14 → 2026-10-06 · <b>2,021만\/bp \(1\+0\.5\)<\/b> · 승 \+1\.08R/.test(rd), (rd.match(/내 칩.{0,400}/) || [''])[0].replace(/<[^>]+>/g, ' '));
  // 원 안 텍스트 = 일수(사용자 2026-10-28 · 빅 로드 스크린샷): 구슬·빅 로드 원 가운데 = 엔진 games[].length(거래일 · 63 상한/만기도 숫자 그대로) · 진행 중 ? 칸 = road.current.days · 무승부 사선 칸도 일수 유지(뒤 무승부 횟수는 모서리 배지) · 내 칩 원 = 진행 중 days / 종료 = 대응 games[].length · 재계산 0
  (function () { const gs48 = SAMPLE.boards.find(b => b.id === 'S.slope.2_5').road.games, nLen = gs48.filter(g => g.length != null).length, nWL = gs48.filter(g => g.winner !== 0 && g.length != null).length;
    const beadN = (beadHtml.match(/<b class="bs-rd-n">/g) || []).length, bigN = (bigHtml.match(/<b class="bs-rd-n">/g) || []).length;
    check('⑥ 원 안 텍스트 = length: 구슬 ' + nLen + '칸 + 진행 중 1칸(days 10) · #48 = 16 · 무승부 #6 = 63(상한도 숫자 그대로)', beadN === nLen + 1 && /bs-rd-cur bs-cur-p"[^>]*title="진행 중 · #49[^>]*><b class="bs-rd-n">10<\/b><\/span>/.test(beadHtml) && /title="#48 [^"]*"><i><\/i><b class="bs-rd-n">16<\/b><\/span>/.test(beadHtml) && /bs-rd bs-rd-t"[^>]*title="#6 무승부[^"]*"><b class="bs-rd-n">63<\/b><\/span>/.test(beadHtml), beadN + ' / ' + nLen);
    check('⑥ 원 안 텍스트 = length: 빅 로드 전 칸(승패 ' + nWL + ' + 무승부 ' + (nLen - nWL) + ') + 진행 중 1 = ' + (nLen + 1) + '개 숫자 · 모서리 배지 0', bigN === nLen + 1 && !/bs-rd-ties/.test(bigHtml) && !/<b>\d+<\/b>/.test(bigHtml), bigN + ' / ' + (nLen + 1));
    check('⑥ 빅 로드 원 22px(6행 유지 · 열 폭 22px) · 원 안 숫자 CSS(.bs-rd-n · 채운 원 = 바탕색 · 빈 링 = 링 색)', /bs-rd-big" style="grid-template-columns:repeat\(\d+,22px\)"/.test(bigHtml) && /\.bs-rd-big \{ grid-template-rows: repeat\(6, 22px\); grid-auto-columns: 22px; \}/.test(html) && /\.bs-rd-big \.bs-rd \{ width: 22px; height: 22px; \}/.test(html) && /\.bs-rd-bead \.bs-rd > b\.bs-rd-n, \.bs-mychips \.bs-rd > b\.bs-rd-n \{ color: var\(--wb-bg\); \}/.test(html) && /\.bs-rd-big \.bs-rd-p > b\.bs-rd-n \{ color: var\(--wb-up\); \}/.test(html));
    check('⑥ 원 안 텍스트: 내 칩 종료 원 = 대응 games[].length 16(mine.game_id 매칭) · title "· 16일"', /title="S\.slope\.2_5\+1@2026-09-14#1 · 16일"><i class="bs-rd" style="background:var\(--wb-up\)" data-rp-b="S\.slope\.2_5" data-rp-g="S\.slope\.2_5\+1@2026-09-14#1"><b class="bs-rd-n">16<\/b><\/i>/.test(rd), (rd.match(/title="S\.slope\.2_5\+1@2026-09-14#1[^>]*><i[^>]*>/) || [''])[0]);
    check('⑥ 점수판 ? 툴팁·제목에 "원 안 숫자 = 일수" 명시', /id="bsHelpRoad" data-help="[^"]*원 안 숫자 = 그 게임 진입→청산 총 일수/.test(html) && /원 안 숫자 = 일수/.test(rd) && /원 안 숫자 = 그 게임 일수\(거래일\)/.test(rd));
    // length 없음 → 빈 원(가짜 0) · current.days 없음 → ?
    const s7 = clone(SAMPLE); s7.available = true; const r7 = s7.boards.find(b => b.id === 'S.slope.2_5').road; delete r7.games[0].length; r7.games[1].length = null; delete r7.current.days; B._setSnap(s7); B.render(); B.show('S.slope.2_5');
    const r7h = ELS.bsTblRoad.innerHTML, bead7 = r7h.slice(r7h.indexOf('bs-rd-bead'), r7h.indexOf('bs-rd-big'));
    check('⑥ length 없음(2칸) → 그 원만 숫자 없음(' + (nLen - 2) + '개) · current.days 없음 → ? 유지', (bead7.match(/<b class="bs-rd-n">/g) || []).length === nLen - 2 && /title="#1 [^"]*">(<i><\/i>)?<\/span>/.test(bead7) && /bs-rd-cur bs-cur-p"[^>]*title="진행 중 · #49[^>]*>\?<\/span>/.test(bead7), (bead7.match(/<b class="bs-rd-n">/g) || []).length);
    B._setSnap(clone(SAMPLE)); B._state.snap.available = true; B.render(); B.show('S.slope.2_5'); })();
  // 大路 배치 규칙(순수 함수 BS._bigRoad · 결과 재계산 0 · 배치만)
  const BR = B._bigRoad, W = s => s.map((w, i) => ({ n: i + 1, winner: w }));
  let br = BR(W([1, 1, -1]));
  check('⑥ 大路: 같은 결과 아래로 · 바뀌면 다음 열 맨 위', br.cols === 2 && br.cells.map(c => c.c + ',' + c.r).join(' ') === '0,0 0,1 1,0', JSON.stringify(br.cells.map(c => [c.c, c.r])));
  br = BR(W([0, 0, 1, 0, -1]));
  check('⑥ 大路(§8f-2): 앞선 무승부 2 = 첫 열 위부터 초록 원 · +1 은 그 아래(비교 대상 없음) · 뒤 무승부 = 같은 열 아래 · −1 = 직전 비무승부(+1)와 다름 → 다음 열', br.cells.map(c => c.c + ',' + c.r + (c.tie ? 't' : '')).join(' ') === '0,0t 0,1t 0,2 0,3t 1,0' && br.cols === 2 && br.pending_ties === undefined && br.lastW === -1, JSON.stringify(br.cells.map(c => [c.c, c.r, c.tie])));
  br = BR(W([0, 0]));
  check('⑥ 大路(§8f-2): 무승부만 → 초록 원 2칸 한 열(pending 개념 없음)', br.cells.length === 2 && br.cells.every(c => c.tie && c.w === 0) && br.cols === 1 && br.lastW === null);
  br = BR(W([-1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 1, 1, 1, 1, 1, 1, -1]));
  check('⑥ 大路: 9연속 → 6행 넘침 꼬리 (0,5)→(1,5)(2,5)(3,5) · 다음 열은 1열 맨 위 · 꼬리 충돌(1,5 점유) → (1,4)에서 오른쪽 (2,4)(3,4) · 그다음 새 열 2', br.cells.slice(0, 9).map(c => c.c + ',' + c.r).join(' ') === '0,0 0,1 0,2 0,3 0,4 0,5 1,5 2,5 3,5' && br.cells.slice(9, 16).map(c => c.c + ',' + c.r).join(' ') === '1,0 1,1 1,2 1,3 1,4 2,4 3,4' && br.cells[16].c === 2 && br.cells[16].r === 0 && br.cells[6].tail === true && br.cells[14].tail === true && br.cols === 4, JSON.stringify(br.cells.map(c => [c.c, c.r])));
  br = BR(W([1, 0, 1, 1, -1]));
  check('⑥ 大路(§8f-2): 1,0,1,1 = 한 열 4칸(무승부 원 포함 · 연속 안 끊김) · −1 다음 열', br.cells.map(c => c.c + ',' + c.r).join(' ') === '0,0 0,1 0,2 0,3 1,0' && br.cells[1].tie === true && br.cells[2].tie === false && br.cols === 2);
  br = BR(W([1, 0, -1]));
  check('⑥ 大路(§8f-2): 1,0,−1 → 무승부는 +1 열 아래 · −1 은 직전 비무승부 +1 과 달라 다음 열', br.cells.map(c => c.c + ',' + c.r).join(' ') === '0,0 0,1 1,0' && br.cols === 2);
  br = BR(W([1, 1, 1, 1, 1, 1, 0, 1]));
  check('⑥ 大路(§8f-2): 6행 꽉 찬 뒤 무승부 → 오른쪽 꼬리(1,5 · tail) · 그 뒤 같은 승자 → 꼬리 계속(2,5)', br.cells.map(c => c.c + ',' + c.r).join(' ') === '0,0 0,1 0,2 0,3 0,4 0,5 1,5 2,5' && br.cells[6].tie === true && br.cells[6].tail === true && br.cells[7].tail === true);
  br = BR([{ n: 1, winner: 1 }, { n: 2, kind: 'draw' }, { n: 3, winner: null, kind: 'maturity' }, { n: 4 }, { n: 5, winner: -1 }]);
  check('⑥ 大路: winner 없고 kind draw/maturity → 무승부 원 · winner·kind 둘 다 없음 → 칸 없음(가짜 결과 0)', br.cells.map(c => c.c + ',' + c.r + (c.tie ? 't' : '')).join(' ') === '0,0 0,1t 0,2t 1,0' && br.cells.length === 4);
  // 진행 중 원 색(§8f-2): 엔진 side_now 우선(+1 적 · −1 청 · 0 회색) · 없으면 cum_R_plus 부호 · 둘 다 없으면 회색 + title 에 출처
  (function () { const s8 = clone(SAMPLE); s8.available = true; const r8 = s8.boards.find(b => b.id === 'S.slope.2_5').road;
    check('⑥ curSide: side_now −1(cum +0.34 무시) → −1 · side_now 0 → 0 · side_now 없음 cum −0.2 → −1 · 둘 다 없음 → 0', B._curSide({ side_now: -1, cum_R_plus: 0.34 }) === -1 && B._curSide({ side_now: 0, cum_R_plus: 0.34 }) === 0 && B._curSide({ cum_R_plus: -0.2 }) === -1 && B._curSide({ days: 3 }) === 0 && B._curSide({ side_now: '1' }) === 1);
    r8.current.side_now = -1; B._setSnap(s8); B.render(); B.show('S.slope.2_5');
    let big = ELS.bsTblRoad.innerHTML.slice(ELS.bsTblRoad.innerHTML.indexOf('bs-rd-big'), ELS.bsTblRoad.innerHTML.indexOf('bs-rd-tally'));
    check('⑥ 진행 중 원: side_now −1 → bs-cur-m(청) · title "지금 쪽 −1 (side_now)" · 구슬 끝도 동일', /bs-rd-cur bs-cur-m"[^>]*title="진행 중 · #49[^"]*지금 쪽 −1 \(side_now\)"/.test(big) && (ELS.bsTblRoad.innerHTML.match(/bs-rd-cur bs-cur-m"/g) || []).length === 2, (big.match(/bs-rd-cur[^>]*>/) || [''])[0]);
    r8.current.side_now = 0; B.show('S.slope.2_5');
    check('⑥ 진행 중 원: side_now 0 → bs-cur-0(회색)', /bs-rd-cur bs-cur-0"[^>]*data-rp-n="49"/.test(ELS.bsTblRoad.innerHTML));
    delete r8.current.side_now; delete r8.current.cum_R_plus; B.show('S.slope.2_5');
    check('⑥ 진행 중 원: side_now·cum_R_plus 둘 다 없음 → 회색 + title "쪽 미상"', /bs-rd-cur bs-cur-0"[^>]*title="[^"]*지금 쪽 0 \(쪽 미상\(side_now·cum_R_plus 없음\)\)"/.test(ELS.bsTblRoad.innerHTML));
    B._setSnap(clone(SAMPLE)); B._state.snap.available = true; B.render(); B.show('S.slope.2_5'); })();
  // 호버 차트(§8f-2): 지연 조회 road-path · 클라 캐시(같은 키 1회 GET) · 카드 = 엔진 응답 그대로(X · 회계 R×X 환산 · legs_note) · 차트 설정(시장 + 회계 + 순 + ±X · 진입/청산 점) · 실패(404/503) 정직 문구 · 내 칩 = game_id
  await (async function () {
    const bS = SAMPLE.boards.find(b => b.id === 'S.slope.2_5'), bL = SAMPLE.boards.find(b => b.id === 'L.cash.2y');
    const n0 = CALLS.get.filter(p => /road-path/.test(p)).length;
    const d1 = await B._roadPath('S.slope.2_5', 49, null), d2 = await B._roadPath('S.slope.2_5', 49, null);
    check('⑥ 호버: GET /quant-house/game-board/road-path?board_id=S.slope.2_5&n=49 · 같은 키 2회 → 조회 1회(캐시) · 응답 그대로(series 3 · barrier)', CALLS.get.filter(p => /road-path/.test(p)).length === n0 + 1 && CALLS.get.some(p => p === '/quant-house/game-board/road-path?board_id=S.slope.2_5&n=49') && d1 === d2 && d1.series.length === 3 && d1.barrier.win === 7.1, CALLS.get.filter(p => /road-path/.test(p)).join(' | '));
    const dg = await B._roadPath('S.slope.2_5', null, 'S.slope.2_5+1@2026-09-14#1');
    check('⑥ 호버: 내 칩 = game_id 조회(&game_id= 인코딩) · 응답 game_id', CALLS.get.some(p => p === '/quant-house/game-board/road-path?board_id=S.slope.2_5&game_id=S.slope.2_5%2B1%402026-09-14%231') && dg.game_id === 'S.slope.2_5+1@2026-09-14#1');
    const card = B._pathCard(d1, bS);
    check('⑥ 호버 카드(진행 중): "#49 · 진행 중 · open · 2026-10-13 → … · 10일" · "X ±7.1bp · 회계 +0.34R (+2.4bp) · 순 +0.23R · 2y−5y 스프레드" · 캔버스 · 라벨 "스프레드 변화(bp · +1 관점)"', /<div class="bs-hover-t">#49 · 진행 중 · open · 2026-10-13 → … · 10일<\/div>/.test(card) && /X ±7\.1bp · 회계\(\+1 관점\) \+0\.34R \(\+2\.4bp\) · 순 \+0\.23R · 비용 0\.11R · KR2y 롱 · KR5y 숏/.test(card) && /<canvas id="bsRoadTipChart">/.test(card) && /스프레드 변화\(bp · 스티프너 수익 \+\) · 회계 = 누적 bp\(엔진 cum_bp · R×X\) · 점선 = ±X · 점 = 진입\/청산 · 3일/.test(card) && !/내 방향|종료 뒤/.test(card), card.replace(/<[^>]+>/g, ' '));
    const dW = await B._roadPath('S.slope.2_5', 12, null), cardW = B._pathCard(dW, bS);
    check('⑥ 호버 카드(종료): "#12 · +1 승 · win · 2026-10-13 → 2026-10-15" · 회계 = 엔진 R_plus 1.08(마지막 post_exit 행 아님) · "종료 뒤 2일 = 점선 꼬리" · 실제 경로 3일', /#12 · \+1 승 · win · 2026-10-13 → 2026-10-15 · 10일/.test(cardW) && /회계\(\+1 관점\) \+1\.08R/.test(cardW) && /종료 뒤 2일 = 점선 꼬리 · 점 = 진입\/청산 · 3일/.test(cardW), cardW.replace(/<[^>]+>/g, ' ').slice(0, 160));
    const noNote = Object.assign({}, d1); delete noNote.mkt_note;
    check('⑥ 호버 카드 라벨: 엔진 mkt_note 우선 · 없으면 판 계열(L = 수익률 변화 · B = U 변화 · 그 외 스프레드 변화)', /수익률 변화 · 회계/.test(B._pathCard(noNote, bL)) && /U 변화 · 회계/.test(B._pathCard(noNote, SAMPLE.boards.find(b => b.id === 'B.basket.3F'))) && /스프레드 변화 · 회계/.test(B._pathCard(noNote, bS)) && /ENGINE-NOTE · 회계/.test(B._pathCard(Object.assign({}, d1, { mkt_note: 'ENGINE-NOTE' }), bL)));
    const dM = await B._roadPath('S.slope.2_5', null, 'S.slope.2_5-1@2026-09-01#1'), cardM = B._pathCard(dM, bS), cfgM = B._pathCfg(dM, bS);
    check('⑥ 내 −1 게임 호버: 엔진 cum_R_mine 병기 → 카드 "내 방향 −0.34R (순 −0.45R)" + 차트에 내 방향(R×X) 선 추가(−0.34×7.1=−2.414)', /<b>내 방향 −0\.34R \(순 −0\.45R\)<\/b>/.test(cardM) && /내 방향 선 = cum_R_mine×X/.test(cardM) && cfgM.data.datasets.length === 6 && cfgM.data.datasets[3].label === '내 방향(R×X)' && Math.abs(cfgM.data.datasets[3].data[2] + 2.414) < 1e-9, cardM.replace(/<[^>]+>/g, ' ').slice(0, 200));
    const cfg = B._pathCfg(d1, bS), ds = cfg.data.datasets;
    check('⑥ 호버 차트 설정: 라벨 = 날짜 3 · 데이터셋 5(시장·회계 bp·순 R×X·+X·−X) · 시장 라벨 = 엔진 mkt_note · 회계 = 엔진 cum_bp 그대로(2.5 · 재계산 0) · 순 = net×X · ±X 상수 · 진입 점(idx 0) 3.5 · 진행 중이라 마지막 점 0', cfg.type === 'line' && cfg.data.labels.join(',') === '2026-10-13,2026-10-14,2026-10-15' && ds.length === 5 && ds[0].label === '스프레드 변화(bp · 스티프너 수익 +)' && ds[0].data.join(',') === '0,1.2,2.4' && ds[1].label === '회계 누적(bp)' && ds[1].data[2] === 2.5 && Math.abs(ds[2].data[2] - 0.23 * 7.1) < 1e-9 && ds[3].data.every(v => v === 7.1) && ds[4].data.every(v => v === -7.1) && ds[0].pointRadius({ dataIndex: 0 }) === 3.5 && ds[0].pointRadius({ dataIndex: 2 }) === 0 && cfg.options.animation === false, ds.map(d => d.label).join(','));
    const cfgW = B._pathCfg(dW, bS);
    check('⑥ 호버 차트 설정(종료): 청산 점 = 마지막 비-post_exit(idx 2) 3.5 · post_exit 행(idx 3,4)은 점 0 · 라벨 5일 · 종료 뒤 구간만 점선(segment borderDash [3,3]) · cum_bp 없는 행은 R×X 폴백', cfgW.data.datasets[0].pointRadius({ dataIndex: 2 }) === 3.5 && cfgW.data.datasets[0].pointRadius({ dataIndex: 1 }) === 0 && cfgW.data.datasets[0].pointRadius({ dataIndex: 4 }) === 0 && cfgW.data.labels.length === 5 && JSON.stringify(cfgW.data.datasets[0].segment.borderDash({ p1DataIndex: 3 })) === '[3,3]' && cfgW.data.datasets[1].segment.borderDash({ p1DataIndex: 1 }) === undefined && (function () { const d = clone(dW); delete d.series[1].cum_bp; return Math.abs(B._pathCfg(d, bS).data.datasets[1].data[1] - 0.17 * 7.1) < 1e-9; })());
    let errMsg = null; try { await B._roadPath('S.slope.2_5', 999, null); } catch (e) { errMsg = e.message; }
    check('⑥ 호버 실패(404) → reject · 카드 "경로 없음 — 서버 사유 원문" · 실패는 캐시 안 함(재시도 시 다시 GET)', /404/.test(errMsg || '') && /<div class="bs-hover-t">경로 없음<\/div><div class="bs-hover-s bs-hover-err">서버 오류 404 — road\.game_path 게임 없음\/거부: KeyError: 999<\/div>/.test(B._pathCard(null, bS, new Error(errMsg))) && !Object.keys(B._state.rpCache).some(k => /n999/.test(k)), errMsg);
    let err503 = null; try { await B._roadPath('L.cash.2y', 7, null); } catch (e) { err503 = e.message; }
    check('⑥ 호버 폴백(엔진 game_path 미배선 = 503) → "경로 없음" + 안내 원문(가짜 경로 0)', /503/.test(err503 || '') && /엔진 road\.game_path 없음/.test(B._pathCard(null, bL, new Error(err503))));
    check('⑥ 호버 로딩 카드 = "경로 읽는 중…" + 엔드포인트', /경로 읽는 중…/.test(B._pathCard(null, bS)) && /road-path/.test(B._pathCard(null, bS)));
    // showPath(요소) → 카드 열림(로딩) → 응답 뒤 차트 카드 · hoverEnd → 숨김/비움 · 훅 없는 요소 → null
    const fakeCircle = { _a: { 'data-rp-b': 'S.slope.2_5', 'data-rp-n': '49' }, getAttribute(k) { return this._a[k] == null ? null : this._a[k]; } };
    const pr = B._showPath(fakeCircle);
    check('⑥ showPath: 카드 즉시 열림(로딩 문구) · Promise 반환', pr && typeof pr.then === 'function' && ELS.bsRoadTip.hidden === false && /경로 읽는 중…/.test(ELS.bsRoadTip.innerHTML));
    await pr;
    check('⑥ showPath: 응답 뒤 카드 = 경로 카드(#49 · X ±7.1bp · 캔버스)', /#49 · 진행 중/.test(ELS.bsRoadTip.innerHTML) && /X ±7\.1bp/.test(ELS.bsRoadTip.innerHTML) && /bsRoadTipChart/.test(ELS.bsRoadTip.innerHTML));
    B._hoverEnd();
    check('⑥ hoverEnd → 카드 숨김·비움', ELS.bsRoadTip.hidden === true && ELS.bsRoadTip.innerHTML === '');
    check('⑥ showPath: 훅 없는 요소(data-rp 없음) → null · 카드 안 열림', B._showPath({ getAttribute() { return null; } }) === null && ELS.bsRoadTip.hidden === true);
    const prE = B._showPath({ _a: { 'data-rp-b': 'S.slope.2_5', 'data-rp-n': '999' }, getAttribute(k) { return this._a[k] == null ? null : this._a[k]; } }); await prE;
    check('⑥ showPath 실패 → 카드 "경로 없음" + 서버 사유', /경로 없음/.test(ELS.bsRoadTip.innerHTML) && /404/.test(ELS.bsRoadTip.innerHTML));
    B._hoverEnd();
    check('⑥ 호버 카드 요소 = 모달 안 .bs-hover#bsRoadTip(fixed · pointer-events none · hidden 기본) · 원 커서 포인터 CSS', /<div class="bs-hover" id="bsRoadTip" hidden role="tooltip"><\/div>/.test(html) && /\.bs-hover \{ position: fixed;[^}]*pointer-events: none;/.test(html) && /\.bs-rd\[data-rp-b\] \{ cursor: pointer; \}/.test(html));
    check('⑥ 옛 무승부 사선/배지 CSS 0 · 大路 무승부 초록 링 CSS · 진행 중 원 색 CSS 3종', !/is-tie::before|bs-rd-ties/.test(html) && /\.bs-rd-big \.bs-rd-t \{ border-color: var\(--wb-open\); \}/.test(html) && /\.bs-rd-cur\.bs-cur-p \{ border-color: var\(--wb-up\); \}/.test(html) && /\.bs-rd-cur\.bs-cur-m \{ border-color: var\(--wb-down\); \}/.test(html) && /\.bs-rd-cur\.bs-cur-0 \{ border-color: var\(--wb-muted\); \}/.test(html));
    check('⑥ 점수판 ? 툴팁: 초록 원 규칙 · 점선 원 = 진행 중(side_now) · 호버 = 경로 차트(game_path) 명시 · 옛 "사선" 문구 0', /id="bsHelpRoad" data-help="[^"]*무승부는 초록 원으로 같은 열 아래\(열을 넘기지 않음 · 다음 결과는 직전 비무승부 승자와 비교\)[^"]*점선 원 = 진행 중[^"]*side_now[^"]*road\.game_path/.test(html) && !/id="bsHelpRoad" data-help="[^"]*사선/.test(html) && /무승부 = 초록 원\(같은 열 아래 · 열 안 넘김\)/.test(ELS.bsTblRoad.innerHTML) && !/사선/.test(ELS.bsTblRoad.innerHTML));
  })();
  // 집계 정직: 엔진 counts 가 열과 안 맞으면 배지 · counts/streaks 없으면 센 값 + ?
  (function () { const s4 = clone(SAMPLE); s4.available = true; const r4 = s4.boards.find(b => b.id === 'S.slope.2_5').road; r4.counts.plus = 99; B._setSnap(s4); B.render(); B.show('S.slope.2_5');
    check('⑥ 엔진 counts ≠ 열 → 배지(집계 127 ≠ 열 48) · 숫자는 엔진 값 그대로(99)', /집계 127 ≠ 열 48/.test(ELS.bsTblRoad.innerHTML) && /\+1 승 <b>99<\/b>/.test(ELS.bsTblRoad.innerHTML));
    delete r4.counts; delete r4.streaks; B.show('S.slope.2_5');
    check('⑥ counts·streaks 없음 → 결과열에서 센 값(20/22/6/4 · +4/−9) + ? 명시', /\+1 승 <b>20<\/b>/.test(ELS.bsTblRoad.innerHTML) && /최장 연속 <b>\+4 \/ −9<\/b>/.test(ELS.bsTblRoad.innerHTML) && /road\.counts·streaks 없음 — 결과열\(games\)에서 센 값/.test(ELS.bsTblRoad.innerHTML)); })();
  B._setSnap(clone(SAMPLE)); B._state.snap.available = true; B.render(); B.show('S.slope.2_5');
  // 칩 쌓기(사용자 2026-10-28): 트레이 ×0.5/×1(칩 면 = 델타) · 존 선택 → 쌓임 · 합계 · 상한(allowed_max_size_R) 넘으면 안 놓이고 사유 · 치우기 · 베팅 POST size_R = 합계 · chips · paroli 0
  let bet = ELS.bsTblBet.innerHTML;
  check('⑥ 칩 트레이: ×0.5(674만/bp) · ×1(1,348만/bp) · 상한 1.50R + 엔진 사유 · 역마팅게일 토글 0 · 열린 게임 카드(종료/정정/삭제)', /data-mult="0\.5"[^>]*>×0\.5<small>674만\/bp<\/small>/.test(bet) && /data-mult="1"[^>]*>×1<small>1,348만\/bp<\/small>/.test(bet) && /상한 <b>1\.50R<\/b> · 직전 승 · 1\.5R 까지/.test(bet) && !/type="checkbox"|bsFParoli|paroli/.test(bet) && /열린 게임 1 — 종료 \/ 정정 \/ 삭제/.test(bet) && /BS\.close\('S\.slope\.2_5\+1@2026-10-13#1'\)/.test(bet) && /BS\.amend\(/.test(bet) && /BS\.del\(/.test(bet), bet.replace(/<[^>]+>/g, ' ').slice(0, 200));
  check('⑥ 존 라벨 = 방향 뜻만(dir_meaning) · 베팅 버튼 비활성(칩 0)', /bs-zone bs-zone-p"[^>]*>[\s\S]*?<span class="bs-zone-mean">스티프너/.test(bet) && /bs-zone bs-zone-m"[^>]*>[\s\S]*?<span class="bs-zone-mean">/.test(bet) && /id="bsTBet" onclick="BS\.bet\(\)" disabled>베팅<\/button>/.test(bet));
  check('⑥ 존 안 고르고 칩 → 안 놓임 + 안내', B.addChip('1') === false && /존을 먼저/.test(ELS.bsTblMsg.textContent));
  B.zone(1);
  check('⑥ +1 존 선택(is-sel) · 칩 ×1 → 합계 "1.00R · 1,348만/bp · 1"', B.addChip('1') === true && /bs-zone bs-zone-p is-sel/.test(ELS.bsTblBet.innerHTML) && /bs-zone-sum">1\.00R · 1,348만\/bp · 1</.test(ELS.bsTblBet.innerHTML), (ELS.bsTblBet.innerHTML.match(/bs-zone-sum">[^<]*/g) || []).join(' | '));
  check('⑥ 칩 ×0.5 추가 → "1.50R · 2,021만/bp · 1 + 0.5" · 베팅 버튼 활성 "베팅 +1 · 1.50R"', B.addChip('0.5') === true && /bs-zone-sum">1\.50R · 2,021만\/bp · 1 \+ 0\.5</.test(ELS.bsTblBet.innerHTML) && /id="bsTBet" onclick="BS\.bet\(\)">베팅 \+1 · 1\.50R</.test(ELS.bsTblBet.innerHTML));
  check('⑥ 상한 초과(1.5 + 0.5 > 1.5) → 칩 안 놓임 · 엔진 사유 표시 · 트레이 칩 흐림(is-dim)', B.addChip('0.5') === false && /칩 안 놓임 — 합계 2\.00R > 상한 1\.50R · 직전 승 · 1\.5R 까지/.test(ELS.bsTblMsg.textContent) && /bs-chip is-dim" draggable="true" data-mult="0\.5"/.test(ELS.bsTblBet.innerHTML) && /bs-zone-sum">1\.50R/.test(ELS.bsTblBet.innerHTML), ELS.bsTblMsg.textContent);
  B.zone(-1);
  check('⑥ 존 바꾸면 칩이 −1 존으로 옮겨짐(합계 유지)', /bs-zone bs-zone-m is-sel/.test(ELS.bsTblBet.innerHTML) && !/bs-zone-p is-sel/.test(ELS.bsTblBet.innerHTML) && /베팅 −1 · 1\.50R/.test(ELS.bsTblBet.innerHTML));
  B.zone(1); B.tf('memo', 'table smoke');
  const snapBet = clone(SAMPLE); snapBet.available = true;
  snapBet.my_games.open.push(Object.assign(clone(SAMPLE.my_games.open[0]), { game_id: 'G-TABLE', board_id: 'S.slope.2_5', dir: 1, entry_date: SAMPLE.asof, size_R: 1.5, dv01_won_per_bp: 20214600, chips: [1, 0.5], main_game_id: null, layer: 'mini' }));
  snapBet.boards.find(b => b.id === 'S.slope.2_5').road.my_open.push('G-TABLE');
  POST_RESULT = { ok: true, event: 'open', engine: { ledger_fn: 'open_game', snapshot_fn: 'build_snapshot' }, snapshot: snapBet };
  const nBet = CALLS.post.length; await B.bet();
  const evb = CALLS.post[nBet] && CALLS.post[nBet].body;
  check('⑥ 베팅 POST = 기존 open 이벤트: size_R 1.5(칩 합계) · chips [1,0.5] · dir +1 · 날짜 기본(entry_date_default→asof) · memo · by web · paroli 키 없음 · one_R_won/dv01 없음', !!evb && evb.event === 'open' && evb.board_id === 'S.slope.2_5' && evb.dir === 1 && evb.size_R === 1.5 && JSON.stringify(evb.chips) === '[1,0.5]' && evb.date === SAMPLE.asof && evb.memo === 'table smoke' && evb.by === 'web' && evb.paroli === undefined && evb.one_R_won === undefined && evb.dv01_won_per_bp === undefined, JSON.stringify(evb));
  check('⑥ 응답 스냅샷으로 로드에 내 칩 즉시 반영(G-TABLE 진행 중 · 2,021만/bp (1+0.5) · 깜빡임) · 칩 치워짐 · 모달 유지', /G-TABLE/.test(ELS.bsTblRoad.innerHTML) && /is-live[^>]*>(<b class="bs-rd-n">\d+<\/b>)?<\/i>\+1 2026-10-26 · <b>2,021만\/bp \(1\+0\.5\)<\/b> · 진행 중/.test(ELS.bsTblRoad.innerHTML) && /bs-zone-sum"><span class="wb-muted">/.test(ELS.bsTblBet.innerHTML) && !/is-sel/.test(ELS.bsTblBet.innerHTML) && F('bsTable').hidden === false && /기록 완료/.test(ELS.bsTblMsg.textContent) && /열린 게임 2/.test(ELS.bsTblBet.innerHTML), (ELS.bsTblRoad.innerHTML.match(/G-TABLE.{0,200}/) || [''])[0].replace(/<[^>]+>/g, ' '));
  // 서버 거부(400) 사유 원문 · 칩 보존
  B.zone(1); B.addChip('1'); POST_RESULT = new Error('서버 오류 400 — game_board.ledger open 거부: ValueError: 상한 초과 1.0R'); await B.bet();
  check('⑥ 서버 거부 → 사유 원문(모달 안) · 칩 보존', /기록 실패 — 서버 오류 400 — game_board\.ledger open 거부: ValueError: 상한 초과 1\.0R/.test(ELS.bsTblMsg.textContent) && /bs-zone-sum">1\.00R/.test(ELS.bsTblBet.innerHTML), ELS.bsTblMsg.textContent);
  B.clearChips();
  check('⑥ 치우기 → 칩 0 · 베팅 비활성', /bs-zone-sum"><span class="wb-muted">칩을 올리세요/.test(ELS.bsTblBet.innerHTML) && / disabled>베팅</.test(ELS.bsTblBet.innerHTML));
  B.show('S.slope.2_3'); B.zone(-1);
  check('⑥ 상한 1.0R 판(직전 패): ×1 뒤 ×0.5 안 놓임 + 사유 "직전 패 · 1R 까지" · 앞선 무승부 2 = 첫 열 초록 원 2칸 · −1 은 그 아래(1열 3행) · 9연속 꼬리', B.addChip('1') === true && B.addChip('0.5') === false && /직전 패 · 1R 까지/.test(ELS.bsTblMsg.textContent) && /bs-rd bs-rd-t" style="grid-column:1;grid-row:1" data-rp-b="S\.slope\.2_3" data-rp-n="1"/.test(ELS.bsTblRoad.innerHTML) && /bs-rd bs-rd-t" style="grid-column:1;grid-row:2"/.test(ELS.bsTblRoad.innerHTML) && /bs-rd bs-rd-m" style="grid-column:1;grid-row:3"/.test(ELS.bsTblRoad.innerHTML) && /is-tail/.test(ELS.bsTblRoad.innerHTML) && /게임<\/i>#26 <span class="wb-muted">\(다음/.test(ELS.bsTblHead.innerHTML), ELS.bsTblMsg.textContent);
  check('⑥ 판 바꾸면 칩 스택은 판별로 분리(2_5 는 0 · 2_3 는 1칩)', B._state.stack['S.slope.2_5'].chips.length === 0 && B._state.stack['S.slope.2_3'].chips.length === 1);
  // 폴백: road 없음 · chips 없음 · B 바스켓 판 종목 입력
  B.show('L.cash.2y');
  check('⑥ road 없음 → "결과열 없음"(가짜 결과 0) · 게임 번호 – · 칩 트레이 없음 → 진입 기록 폼 안내', /결과열 없음/.test(ELS.bsTblRoad.innerHTML) && !/bs-rd-bead/.test(ELS.bsTblRoad.innerHTML) && /게임<\/i>–/.test(ELS.bsTblHead.innerHTML) && /칩 트레이 없음/.test(ELS.bsTblBet.innerHTML) && /boards\[\]\.chips 미생성/.test(ELS.bsTblBet.innerHTML) && !/bs-zone/.test(ELS.bsTblBet.innerHTML) && ELS.bsTblRoadMeta.textContent === 'road 없음');
  B.show('B.basket.3F');
  check('⑥ B 바스켓 판: road 3판 렌더 · chips 없음 폴백(종목 입력은 chips 있을 때만)', /열 3판/.test(ELS.bsTblRoad.innerHTML) && /칩 트레이 없음/.test(ELS.bsTblBet.innerHTML));
  (function () { const r = ELS.bsTblRoad.innerHTML, bead = r.slice(r.indexOf('bs-rd-bead'), r.indexOf('bs-rd-big')), big = r.slice(r.indexOf('bs-rd-big'), r.indexOf('bs-rd-tally'));
    check('⑥ fut 회귀(B.basket.3F · 1,−1,0): 구슬 원 안 10 / 6 / 63 · 빅 로드 3칸 = (1,1)+10 · (2,1)−6 · (2,2) 초록 원 63(−1 열 아래 · 열 안 넘김) · 진행 중 없음 → 점선 원 0 · 열 2', /bs-rd-p"[^>]*title="#1 [^"]*"><b class="bs-rd-n">10<\/b>/.test(bead) && /bs-rd-m"[^>]*title="#2 [^"]*"><b class="bs-rd-n">6<\/b>/.test(bead) && /bs-rd-t"[^>]*title="#3 [^"]*"><b class="bs-rd-n">63<\/b>/.test(bead) && (big.match(/<b class="bs-rd-n">/g) || []).length === 3 && /bs-rd bs-rd-p" style="grid-column:1;grid-row:1"/.test(big) && /bs-rd bs-rd-m" style="grid-column:2;grid-row:1"/.test(big) && /bs-rd bs-rd-t" style="grid-column:2;grid-row:2" data-rp-b="B\.basket\.3F" data-rp-n="3"[^>]*><b class="bs-rd-n">63<\/b>/.test(big) && !/bs-rd-cur/.test(big) && /repeat\(2,22px\)/.test(big), big.replace(/<[^>]+>/g, ' ').slice(0, 120)); })();
  (function () { const s5 = clone(SAMPLE); s5.available = true; const bb = s5.boards.find(b => b.id === 'B.basket.3F'); bb.chips = [{ mult: 1, size_R: 1, dv01_won_per_bp: 5000000, label: '×1' }]; bb.allowed_max_size_R = 1; B._setSnap(s5); B.render(); B.show('B.basket.3F');
    check('⑥ B 판 + chips → 종목 입력(datalist = legs_today 코드) · 베팅 POST 에 bond', /id="bsTBond"[^>]*list="bsTBondList"/.test(ELS.bsTblBet.innerHTML) && /<datalist id="bsTBondList">(<option value="[^"]+">)+<\/datalist>/.test(ELS.bsTblBet.innerHTML)); })();
  check('⑥ 모달 열림 → body.bs-modal-lock', document.body.classList.contains('bs-modal-lock'));
  B.closeTable();
  check('⑥ 닫기 → hidden', F('bsTable').hidden === true);
  check('⑥ 닫기 → body 잠금 해제(본문 레이아웃 정상)', !document.body.classList.contains('bs-modal-lock'));
  B._setSnap(clone(SAMPLE)); B._state.snap.available = true; B.render(); B.show('S.slope.2_5');
  B.amend(SAMPLE.my_games.open[0].game_id);
  check('⑥ 모달 안 "정정" → 모달 닫고 폼으로(기존 amend 동작)', F('bsTable').hidden === true && F('bsFAmend').hidden === false); B.cancelAmend();
  B._setSnap(clone(SAMPLE)); B._state.snap.available = true; B.render(); B.show('S.slope.2_5');

  // ⑦ 클래스 충돌 가드(2026-10-28 라이브 버그: 모달 컨테이너 class 가 커브 표 .bs-tbl 과 같아 TABLE 이 position:fixed + 백드롭을 받음)
  const css = (html.match(/<style[^>]*>([\s\S]*?)<\/style>/g) || []).join('\n');
  // 선택자 안에 .cls 가 정확히(접미 -x 제외) 등장하는 규칙 본문 목록 · cls 가 '-' 로 끝나면 접두 와일드카드(동적 bs-st-<상태>)
  const rulesOf = cls => { const tail = /-$/.test(cls) ? String.raw`[a-z0-9-]*` : String.raw`(?![\w-])`; const re = new RegExp(String.raw`(^|[\s,}])\.` + cls + tail + String.raw`[^{]*\{([^}]*)\}`, 'g'); const out = []; let mm; while ((mm = re.exec(css))) out.push(mm[2]); return out; };
  const tblRules = rulesOf('bs-tbl');
  check('⑦ 커브 표 class = "wb-table bs-tbl" 유지 · .bs-tbl 규칙은 색/글자만(position/display/inset/background 0)', /<table class="wb-table bs-tbl">/.test(src) && tblRules.length > 0 && tblRules.every(r => !/\b(position|display|inset|background|z-index)\s*:/.test(r)), tblRules.join(' || '));
  check('⑦ 모달 컨테이너 = .bs-modal(fixed) · bs-modal 이 wb- 공용 요소에 안 붙음', rulesOf('bs-modal').some(r => /position\s*:\s*fixed/.test(r)) && !/class="wb-[^"]*\bbs-modal(?![\w-])/.test(html) && !/class="wb-[^"]*\bbs-modal(?![\w-])/.test(src));
  // 일반화: wb- 공용 요소에 붙은 모든 bs- 클래스는 레이아웃을 바꾸는 규칙(position fixed/absolute · inset)을 가지면 안 된다
  const onWb = new Set(); const reWb = /class="wb-[^"]*?\b(bs-[a-z0-9-]+)/g; let mw; const corpusCls = html + '\n' + src; while ((mw = reWb.exec(corpusCls))) onWb.add(mw[1]);
  const badCls = [...onWb].filter(c => rulesOf(c).some(r => /position\s*:\s*(fixed|absolute)|\binset\s*:/.test(r)));
  check('⑦ wb- 요소에 붙은 bs- 클래스(' + [...onWb].join(',') + ') 중 fixed/absolute/inset 규칙 0', badCls.length === 0, badCls.join(','));

  // ⑧ 판 기준 잠금(사용자 2026-10-29 · 해동 c3672e80): 최상위 standards 배지 · 장벽 ? 기준 문장 · B.basket 종목별 장벽 표(per_bond_sigma) · 미달 종목 비활성+사유 ·
  //    본전 = p_star_label 그대로(오늘 X 우선 · census 병기) · 성적표 X 단위(X_stat_unit) · 필드 부재 폴백(구 스냅샷 = 위 ②⑥ 그대로) · 기저 불일치 경고
  {
    const STD = { sigma_basis: 'full_accounting', sigma_unit_bbasket: 'bond', accounting: 'full', bundle_X_rule: 'harmonic', young_bond_rule: 'reject_below_126', sigma_window: 126, horizon_days: 21,
      X_formula: 'X = k × σ × √21 (σ = t < 진입일 유효 하루 손익 126개 std · ddof 1)', decision_ids: ['2026-10-29.barrier_sigma_full_accounting', '2026-10-29.bbasket_barrier_per_bond_adopted'], open_decision_ids: ['2026-10-29.open.bbasket_young_bond_handling'],
      prereg: '_barrier_full_accounting_prereg_20261029.md@17416a3e + addendum2@e40ab700', young_bond_reason_field: 'boards[].per_bond_sigma[].reason', n_boards_checked: 36, n_X_checked: 35, ok: true, violations: [],
      sigma_recheck: { every_days: 7, last_run: '2026-10-29T15:02:11', last_status: 'ok', invalidated: [], due: false, next_due: '2026-11-05' }, help: '장벽 기준(사용자 2026-10-29 고정)' };
    const PBS = [{ bond: 'KR103501GFC3', sigma_daily_bp: 0.9718317547535563, X_bp: 4.453492578919931, n_obs: 208, ok: true, entry_date: '2026-10-29', reason: null },
      { bond: 'KR103501GG62', sigma_daily_bp: null, X_bp: null, n_obs: 91, ok: false, entry_date: '2026-10-29', reason: '종목 하루 손익 91/126개 — 이력 부족(신규 바스켓 종목) · σ 없음 = 열 수 없음' },
      { bond: 'KR103503GG37', sigma_daily_bp: 1.1998441832097897, X_bp: 5.498376791711324, n_obs: 152, ok: true, entry_date: '2026-10-29', reason: null }];
    const mkStd = (mut) => { const s = clone(SAMPLE); s.available = true; s.standards = clone(STD);
      s.boards.forEach(b => { b.sigma_basis = 'full_accounting'; b.sigma_unit = 'board'; });
      const bb = s.boards.find(b => b.id === 'B.basket.3F'); Object.assign(bb, { sigma_unit: 'bond', bundle_X_rule: 'harmonic', X_bp: 4.921081522684564, sigma21_bp: 4.921081522684564, per_bond_sigma: clone(PBS),
        breakeven: Object.assign(bb.breakeven, { p_star: 1.0747395259156949, p_star_over_100: true, p_star_practically_impossible: true, p_star_label: '불가(>100%)', sharpe_needed: 5.555648856385305 }),
        breakeven_today: Object.assign(bb.breakeven_today, { p_star: 0.9989100387448053, p_star_over_100: false, p_star_practically_impossible: true, p_star_label: '사실상 불가(99.89%)' }),
        chips: [{ mult: 0.5, size_R: 0.5, dv01_won_per_bp: 19656121, label: '×0.5' }, { mult: 1, size_R: 1, dv01_won_per_bp: 39312243, label: '×1' }], allowed_max_size_R: 1 });
      ['+1', '-1'].forEach(d => { if (bb.scorecard && bb.scorecard.directions[d]) bb.scorecard.directions[d].per_game.X_stat_unit = 'decision_harmonic'; });
      const s25 = s.boards.find(b => b.id === 'S.slope.2_5'); s25.breakeven.p_star_label = '85.7%'; s25.breakeven_today.p_star_label = '82.0%'; ['+1', '-1'].forEach(d => { s25.scorecard.directions[d].per_game.X_stat_unit = 'game'; });
      if (mut) mut(s); return s; };
    B._setSnap(mkStd()); B.render();
    const sb = ELS.bsStd.innerHTML, sbHelp = (sb.match(/data-help="([^"]*)"/) || ['', ''])[1];
    check('⑧ 스냅샷 줄 배지 "기준 전체 회계"(standards.ok true) · ? = 공식·결정 id·미결 id·다음 재검산일', /<span class="wb-badge">기준 전체 회계/.test(sb) && !/wb-badge--warn/.test(sb) && /2026-10-29\.barrier_sigma_full_accounting/.test(sbHelp) && /2026-10-29\.bbasket_barrier_per_bond_adopted/.test(sbHelp) && /미결 2026-10-29\.open\.bbasket_young_bond_handling/.test(sbHelp) && /다음 재검산 2026-11-05/.test(sbHelp) && /σ 재검산 마지막 2026-10-29T15:02:11 \(ok\)/.test(sbHelp) && /X = k × σ × √21/.test(sbHelp), sb.replace(/data-help="[^"]*"/g, '').slice(0, 160));
    B.show('B.basket.3F');
    let cardB = ELS.bsBoardCard.innerHTML; const cardBv = stripHelp(cardB);
    check('⑧ 3F 판 카드: 장벽 X 4.9bp (오늘 종목 X 조화평균) · 장벽 ? 첫 줄 = "장벽 = 전체 회계 하루 손익 σ × k × √21 · 종목마다 그 종목 자체 σ · 판 X = 오늘 종목 X 조화평균"', /장벽 X<\/i><b>4\.9bp<\/b>[^]*?\(오늘 종목 X 조화평균\)/.test(cardB) && /data-help="장벽 = 전체 회계 하루 손익 σ × k × √21 · 종목마다 그 종목 자체 σ · 판 X = 오늘 종목 X 조화평균/.test(cardB), (cardBv.match(/장벽 X.{0,120}/) || [''])[0]);
    check('⑧ 3F 본전 = p_star_label 그대로: "사실상 불가(99.89%)" (오늘 X) · census "불가(>100%)" · 반올림 "99.9%" 0', /본전 승률 p\* <b>사실상 불가\(99\.89%\)<\/b> <span class="wb-muted">\(오늘 X\)<\/span> <span class="wb-muted">· census 불가\(&gt;100%\)<\/span>/.test(cardB) && !/99\.9%/.test(cardBv), (cardBv.match(/본전 승률.{0,140}/) || [''])[0]);
    const pbsHtml = (cardB.match(/<table class="bs-sc bs-pbs">[\s\S]*?<\/table>/) || [''])[0];
    check('⑧ 종목별 장벽 표 3행(bond · σ · X · n · 상태) · 2/3종목 열 수 있음 · GFC3 σ 0.97 X 4.45 n 208 · GG62 = "열 수 없음 — 종목 하루 손익 91/126개 …"(엔진 reason 원문) · 창 126', (pbsHtml.match(/<tr( class="is-closed")?><td class="code">/g) || []).length === 3 && /2\/3종목 열 수 있음 · 2026-10-29 진입 기준/.test(cardB) && /<td class="code">KR103501GFC3<\/td><td>0\.97bp<\/td><td>4\.45bp<\/td><td>208<\/td><td class="bs-pbs-st">열 수 있음<\/td>/.test(pbsHtml) && /<tr class="is-closed"><td class="code">KR103501GG62<\/td><td>–<\/td><td>–<\/td><td>91<\/td><td class="bs-pbs-st"><span class="wb-warn-text">열 수 없음 — 종목 하루 손익 91\/126개 — 이력 부족\(신규 바스켓 종목\) · σ 없음 = 열 수 없음<\/span>/.test(pbsHtml) && /하루 손익 n \(창 126\)/.test(pbsHtml), pbsHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 260));
    check('⑧ 성적표 X 단위: B.basket = "X(묶음 조화평균)"(X_stat_unit decision_harmonic) · "X(평균)" 0', /비용 R\(평균\) · X\(묶음 조화평균\)<\/td>/.test(cardB) && !/X\(평균\)<\/td>/.test(cardB));
    const hdB = ELS.bsTblHead.innerHTML;
    check('⑧ 테이블 헤더: 오늘 장벽 ±4.9bp (… 종목 X 조화평균) + ? 기준 문장 · 본전 승률 "사실상 불가(99.89%)" (오늘 X)', /오늘 장벽<\/i><b>±4\.9bp<\/b>[^]*?종목 X 조화평균\)<\/span><button[^>]*data-help="장벽 = 전체 회계 하루 손익 σ × k × √21/.test(hdB) && /본전 승률<\/i><b>사실상 불가\(99\.89%\)<\/b> <span class="wb-muted">\(오늘 X\)<\/span>/.test(hdB), stripHelp(hdB).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 260));
    const betB = ELS.bsTblBet.innerHTML;
    check('⑧ 베팅 패널 종목 선택 = select(필수) · GG62 option disabled "— 열 수 없음" · 열 수 있는 종목 X 병기 · 사유 줄(엔진 reason) · 선물 코드 0', /<select class="wb-input" id="bsTBond"/.test(betB) && /<option value="" selected>종목 선택\(필수\)<\/option>/.test(betB) && /<option value="KR103501GG62" disabled>KR103501GG62 — 열 수 없음<\/option>/.test(betB) && /<option value="KR103501GFC3">KR103501GFC3 · X 4\.45bp<\/option>/.test(betB) && /<option value="KR103503GG37">KR103503GG37 · X 5\.50bp<\/option>/.test(betB) && /<span class="wb-warn-text">KR103501GG62 열 수 없음 — 종목 하루 손익 91\/126개/.test(betB) && !/A656C000/.test((betB.match(/<select[\s\S]*?<\/select>/) || [''])[0]) && !/bsTBondList/.test(betB), (betB.match(/<select[\s\S]*?<\/select>/) || [''])[0].replace(/<[^>]+>/g, ' | ').replace(/\s+/g, ' '));
    // 베팅 가드: 종목 미선택 → POST 0 + 사유 · 열 수 없는 종목(값 강제 주입) → POST 0 + 엔진 reason · 열 수 있는 종목 → POST bond
    B.clearChips(); B.zone(1); B.addChip('1'); F('bsTBond').value = ''; B.tf('bond', '');
    let nP = CALLS.post.length; await B.bet();
    check('⑧ 베팅 가드: 종목 미선택 → POST 0 · "종목 선택 필요 — 바스켓 판은 엔진이 종목을 고르지 않는다"', CALLS.post.length === nP && /종목 선택 필요 — 바스켓 판은 엔진이 종목을 고르지 않는다/.test(ELS.bsTblMsg.textContent), ELS.bsTblMsg.textContent);
    F('bsTBond').value = 'KR103501GG62'; await B.bet();
    check('⑧ 베팅 가드: 열 수 없는 종목(GG62) → POST 0 · 엔진 reason 원문', CALLS.post.length === nP && /KR103501GG62 열 수 없음 — 종목 하루 손익 91\/126개/.test(ELS.bsTblMsg.textContent), ELS.bsTblMsg.textContent);
    B.tf('bond', 'KR103501GG62'); B.show('B.basket.3F');
    check('⑧ 남아 있던 열 수 없는 종목 값은 재렌더 때 지움(선택 불가 값 보존 0)', /<option value="" selected>종목 선택/.test(ELS.bsTblBet.innerHTML) && !/KR103501GG62" disabled selected/.test(ELS.bsTblBet.innerHTML) && B._state.tform.bond === '');
    POST_RESULT = new Error('서버 오류 400 — smoke 거부'); F('bsTBond').value = 'KR103501GFC3'; B.zone(1); B.addChip('1'); await B.bet();
    const evB = CALLS.post[nP] && CALLS.post[nP].body;
    check('⑧ 열 수 있는 종목(GFC3) → POST open bond = KR103501GFC3(엔진이 그 종목 X 를 PIT 로 박음)', !!evB && evB.event === 'open' && evB.board_id === 'B.basket.3F' && evB.bond === 'KR103501GFC3', JSON.stringify(evB));
    // 진입 기록 폼 가드(같은 bondBlock) · placeholder
    F('bsFBoard').value = 'B.basket.3F'; B.syncDir();
    check('⑧ 진입 기록 폼: 바스켓 판 종목 placeholder "코드 · 필수(바스켓) · 열 수 없음 KR103501GG62"', F('bsFBond').placeholder === '코드 · 필수(바스켓) · 열 수 없음 KR103501GG62', F('bsFBond').placeholder);
    F('bsFDir').value = '1'; F('bsFDate').value = '2026-10-29'; F('bsFSize').value = '1'; F('bsFBond').value = 'KR103501GG62'; nP = CALLS.post.length; await B.submit();
    check('⑧ 진입 기록 폼: GG62 → POST 0 · 사유', CALLS.post.length === nP && /KR103501GG62 열 수 없음/.test(ELS.bsMsg.textContent), ELS.bsMsg.textContent);
    F('bsFBond').value = ''; F('bsFSize').value = '';
    F('bsFBoard').value = 'S.slope.2_5'; B.syncDir();
    check('⑧ 진입 기록 폼: 비바스켓 판 placeholder = 옛 문구(비우면 엔진 기본)', F('bsFBond').placeholder === '코드 · 비우면 엔진 기본');
    B.show('S.slope.2_5'); const c25 = ELS.bsBoardCard.innerHTML;
    check('⑧ 다른 판: 본전 label 그대로("82.0%" 오늘 X · census "85.7%") · 성적표 "X(평균)"(X_stat_unit game) · 종목별 표 0 · 조화평균 문구 0 · 장벽 ? = 전체 회계 기준', /본전 승률 p\* <b>82\.0%<\/b> <span class="wb-muted">\(오늘 X\)<\/span> <span class="wb-muted">· census 85\.7%<\/span>/.test(c25) && /X\(평균\)<\/td>/.test(c25) && !/bs-pbs|조화평균\)/.test(stripHelp(c25)) && /data-help="장벽 = 전체 회계 하루 손익 σ × k × √21 · 장벽 X = k × σ21/.test(c25));
    // ok=false → 경고 배지 + violations 원문(화면에 보임) · 판 σ 기저 불일치 → 카드/헤더 경고 배지
    B._setSnap(mkStd(s => { s.standards.ok = false; s.standards.violations = ['B.basket.3F: sigma_basis=price ≠ full_accounting', { board: 'L.cash.2y', field: 'X_bp', diff: 0.1 }]; s.boards.find(b => b.id === 'B.basket.3F').sigma_basis = 'price'; })); B.render(); B.show('B.basket.3F');
    const sbBad = ELS.bsStd.innerHTML;
    check('⑧ standards.ok=false → 경고 배지 "기준 위반 2건" + violations 원문 화면 표시(문자열·객체) · 정상 배지 0', /wb-badge wb-badge--warn">기준 위반 2건/.test(sbBad) && /B\.basket\.3F: sigma_basis=price ≠ full_accounting/.test(sbBad) && /&quot;board&quot;:&quot;L\.cash\.2y&quot;/.test(sbBad) && !/<span class="wb-badge">기준 전체 회계/.test(sbBad), stripHelp(sbBad).replace(/<[^>]+>/g, ' ').slice(0, 200));
    check('⑧ 판 σ 기저 ≠ 기준 → 카드 장벽 줄 경고 배지 · 장벽 ? = "장벽 σ 기저 = price — 확정 기준(전체 회계)과 다름" · 헤더 경고 배지', /σ 기저 price ≠ 기준 전체 회계/.test(ELS.bsBoardCard.innerHTML) && /data-help="장벽 σ 기저 = price — 확정 기준\(전체 회계\)과 다름/.test(ELS.bsBoardCard.innerHTML) && /σ 기저 ≠ 기준/.test(ELS.bsTblHead.innerHTML));
    B._setSnap(mkStd(s => { delete s.standards.ok; })); B.render();
    check('⑧ standards.ok 없음 → "기준 자체 대조 없음" 경고(정상 배지로 보이지 않음)', /wb-badge--warn">기준 자체 대조 없음/.test(ELS.bsStd.innerHTML));
    // 필드 부재 폴백(구 스냅샷 = SAMPLE): 배지 "기준 미표기" · 종목별 표 0 · datalist 입력(위 ⑥) · 본전 = 옛 표기 · 성적표 "X(평균)" · 장벽 ? 에 기준 문장 0(주장 0)
    B._setSnap(clone(SAMPLE)); B._state.snap.available = true; B.render(); B.show('B.basket.3F');
    const cOld = ELS.bsBoardCard.innerHTML;
    check('⑧ 부재 폴백: 배지 "기준 미표기(구 스냅샷)" · 종목별 표 0 · 본전 "불가" 옛 표기 · "X(평균)" · 장벽 ? 에 "전체 회계" 주장 0 · 헤더 ? 동일', /기준 미표기\(구 스냅샷/.test(ELS.bsStd.innerHTML) && !/wb-badge/.test(ELS.bsStd.innerHTML) && !/bs-pbs|종목별 장벽/.test(cOld) && /본전 승률 <b>불가<\/b> <span class="wb-muted">\(오늘 X\)<\/span> <span class="wb-muted">· census 불가<\/span>/.test(cOld) && /X\(평균\)<\/td>/.test(cOld) && !/전체 회계 하루 손익/.test(cOld) && !/전체 회계 하루 손익/.test(ELS.bsTblHead.innerHTML), (stripHelp(cOld).match(/본전 승률.{0,120}/) || [''])[0]);
    B._setSnap(clone(SAMPLE)); B._state.snap.available = true; B.render(); B.show('S.slope.2_5'); POST_RESULT = null;
  }

  // ④ 추천·신호·방향 제안 문구 0 (렌더 결과 + 탭 HTML + 스크립트)
  const view = (html.match(/<div id="view-bootstrap"[\s\S]*?<\/div><!-- \/bs-content -->/) || [''])[0];
  const corpus = allHtml() + '\n' + view + '\n' + src;
  const banned = ['추천합니다', '추천 판', '추천 방향', '들어가라', '들어가세요', '들어갈 만', '유리', '좋다', '좋은 판', '좋아 보', '매수 신호', '매도 신호', '진입 신호 발생', '권장', '권합니다', '노려', '기회', '유망', '선호 판'];
  const hits = banned.filter(w => corpus.indexOf(w) >= 0);
  check('추천·신호·방향 제안 문구 0', hits.length === 0, hits.join(','));
  const rec = corpus.match(/추천.{0,16}/g) || [];
  const recBad = rec.filter(x => !/^추천( 0|·진입 신호·방향 제안 0|·방향 제안 0|이 아니다| 아님)/.test(x));
  check("'추천' 은 부정형(추천 0 · 추천이 아니다)으로만", recBad.length === 0, recBad.join(' | '));
  check('승률 라벨 = 기준선(한쪽 고정) · 내가 선 쪽 = 사실 서술', /기준선 승률/.test(ELS.bsBoardCard.innerHTML) && /내가 선 쪽/.test(ELS.bsOpen.innerHTML));
  check('더미는 로컬+?bs_sample=1 일 때만(코드 가드)', /BS_LOCAL/.test(src) && /bs_sample=1/.test(src));

  // ⑤ 목차 레일(2026-10-27 사용자 지시 · 주간 리뷰/차익거래 모니터와 같은 공용 컴포넌트) — 정적 앵커 + 스크롤스파이
  const nav = (html.match(/<nav class="wb-card wb-toc" id="bsToc"[\s\S]*?<\/nav>/) || [''])[0];
  check('목차: nav#bsToc 가 공용 .wb-toc-layout 안(wb.css §16b · 새 스타일 0)', nav.length > 0 && /<div class="wb-toc-layout">\s*<nav class="wb-card wb-toc" id="bsToc"/.test(html) && /class="wb-toc-toggle" id="bsTocToggle"/.test(nav) && /class="wb-toc-list" id="bsTocList"/.test(nav) && /<\/div><!-- \/bs-content -->\s*<\/div><!-- \/wb-toc-layout -->/.test(html));
  const tocItems = [...nav.matchAll(/<li( class="lv2")?><a href="#([^"]+)">(?:<span class="wb-toc-num">[^<]*<\/span>)?([^<]+)<\/a>/g)].map(x => ({ lv2: !!x[1], id: x[2], label: x[3] }));
  check('목차: 상위 4(시장 흐름·판 지도·내 게임·한도 · 본전 · 각주 없음) + 하위 4(열린 판·진입 기록·최근 종료·삭제됨)', tocItems.filter(x => !x.lv2).map(x => x.label).join('|') === '시장 흐름|판 지도|내 게임|한도 · 본전' && tocItems.filter(x => x.lv2).map(x => x.id).join('|') === 'bs-g-open|bs-g-entry|bs-g-closed|bs-g-deleted', JSON.stringify(tocItems.map(x => x.id)));
  const missing = tocItems.filter(x => !new RegExp(' id="' + x.id + '"').test(view));
  check('목차: 앵커 ' + tocItems.length + '개 전부 #view-bootstrap 안에 id 존재', tocItems.length === 8 && missing.length === 0, missing.map(x => x.id).join(','));
  check('목차: 4섹션 전부 .bs-content 안 · 각주 섹션 0 · 옛 필터바 바로가기 세그 없음', (view.match(/<section class="bs-sec/g) || []).length === 4 && view.indexOf('<div class="bs-content">') < view.indexOf('<section class="bs-sec" id="bs-market">') && !/바로가기/.test(view) && !/BS\.go\(/.test(view));
  check('목차: 하위 앵커 카드에 .bs-anchor(스크롤 여백) · 섹션 scroll-margin-top', (view.match(/class="[^"]*bs-anchor[^"]*" id="bs-g-/g) || []).length === 4 && /#view-bootstrap \.bs-sec \{[^}]*scroll-margin-top/.test(html));
  // 스크롤스파이: 가짜 앵커/섹션 위치로 BS.spy() → 현재 섹션 하이라이트 · 모바일 토글 라벨 '상위 › 하위' · 탭 숨김(offsetParent null) 이면 쉼
  const fakeA = (id, lv2) => { const cl = new Set(); const li = { classList: { contains: c => lv2 && c === 'lv2' } }; return { _href: '#' + id, textContent: (lv2 ? '' : '00') + (tocItems.find(x => x.id === id) || {}).label, parentElement: li, getAttribute(k) { return k === 'href' ? this._href : null; }, classList: { toggle(c, on) { on ? cl.add(c) : cl.delete(c); }, contains: c => cl.has(c) }, addEventListener() {} }; };
  const anchors = tocItems.map(x => fakeA(x.id, x.lv2));
  const TOP = {}; tocItems.forEach((x, i) => { TOP[x.id] = i * 500; ELS[x.id] = Object.assign(fakeEl(x.id), { getBoundingClientRect() { return { top: TOP[x.id] }; } }); });
  ELS.bsToc = Object.assign(fakeEl('bsToc'), { offsetParent: {}, querySelectorAll: sel => (/a\[href/.test(sel) ? anchors : []) });
  B = boot(apiGet);
  check('스파이: 맨 위 → 01 시장 흐름 활성', B.spy() === 0 && anchors[0].classList.contains('is-active') && !anchors[1].classList.contains('is-active') && /시장 흐름/.test(ELS.bsTocCur.textContent), ELS.bsTocCur.textContent);
  tocItems.forEach((x, i) => { TOP[x.id] = i * 500 - 2100; });   // 진입 기록(index 4)이 오프셋 안쪽 · 최근 종료는 아직 아래
  const cur = B.spy();
  check('스파이: 스크롤 후 하위 "진입 기록" 활성 + 토글 라벨 "내 게임 › 진입 기록"', cur === 4 && anchors[4].classList.contains('is-active') && !anchors[0].classList.contains('is-active') && /내 게임 › 진입 기록/.test(ELS.bsTocCur.textContent), cur + ' | ' + ELS.bsTocCur.textContent);
  ELS.bsToc.offsetParent = null;
  check('스파이: 탭 숨김(offsetParent null) → 쉼(-1) · 하이라이트 유지', B.spy() === -1 && anchors[4].classList.contains('is-active'));
  await B.load();
  check('스파이: render() 끝에 자동 호출 · 숨김 중엔 무해', anchors[4].classList.contains('is-active'));

  console.log(fails ? ('\n' + fails + ' FAIL') : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
