// 부트스트랩 탭 render smoke — 더미 스냅샷(_bootstrap_sample.json = 엔진 실스냅샷 shape + 내 게임/상관 가짜 주입) 렌더 검증 (실API·실원장 무접촉)
// usage: node _smoke_bootstrap_render.js
//   검사: 4섹션 렌더 · 판 지도 36칸/상태 집계 · 판 카드(census 성적표 · 본전 승률 vs 기준선 승률 · provisional_k) · 내 게임(§8b 메인/미니 · R 장벽 막대 · 분해) ·
//         §8c 판 간 상관/n_eff · 한도/본전(by_layer) · 각주(honesty 그대로 · 잠정 규약) · 빈 상태(available:false) · 폼 POST → 응답 스냅샷 재렌더 · 추천/신호 문구 0
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
};
const window = { location: { search: '', hash: '', hostname: '' }, WBChart: null };
const CALLS = { get: [], post: [] };
let POST_RESULT = null;
const apiGet = async function (p) { CALLS.get.push(p); if (p === '/quant-house/game-board') return clone(SAMPLE); if (p === '/quant-house/market-review') return { available: false }; throw new Error('unknown ' + p); };
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
  check('① §8c board_corr: 독립 판 수 2.3개 · 26주 이력 · 읽는 법', /2\.3개/.test(ELS.bsNeff.innerHTML) && /bsNeffChart/.test(ELS.bsNeff.innerHTML) && /상관이 오르면/.test(ELS.bsNeff.innerHTML));
  check('① §8c 히트맵 4×4(matrix.boards/values) · 판 ID 라벨 · 63일 굴림', (ELS.bsCorr.innerHTML.match(/<td /g) || []).length === 16 && /S\.slope\.2_5/.test(ELS.bsCorr.innerHTML) && /0\.83/.test(ELS.bsCorr.innerHTML) && /63일 굴림/.test(ELS.bsCorrMeta.textContent));

  const ids = SAMPLE.boards.map(b => b.id);
  check('② 판 지도 ' + ids.length + '칸 전부(엔진 boards 그대로)', ids.every(id => ELS.bsMap.innerHTML.indexOf('data-id="' + id + '"') >= 0) && ids.length === 36, ids.length);
  const cnt = {}; SAMPLE.boards.forEach(b => { cnt[b.status] = (cnt[b.status] || 0) + 1; });
  check('② 범례 집계 = 스냅샷 상태 수', ['pass', 'fail', 'open', 'untested', 'blocked'].every(k => ELS.bsMapLegend.innerHTML.indexOf('(' + (cnt[k] || 0) + ')') >= 0), JSON.stringify(cnt));
  check('② 열린 판 점 3(S.slope.2_5 · S.slope.3_10 · B.basket.3F)', (ELS.bsMap.innerHTML.match(/bs-open-dot/g) || []).length === 3);
  B.show('S.slope.2_5');
  const b25 = SAMPLE.boards.find(b => b.id === 'S.slope.2_5'); let card = ELS.bsBoardCard.innerHTML;
  check('② 판 카드: X(엔진 X_bp) · 비용 R · 상한 63', card.indexOf(b25.X_bp.toFixed(1) + 'bp') >= 0 && card.indexOf(b25.cost_R.toFixed(3) + 'R') >= 0 && /63거래일/.test(card));
  check('② 판 카드: 본전 승률 p*(엔진 breakeven) vs 기준선 승률(baseline_winrate) · 한쪽 고정 라벨', /본전 승률 p\*/.test(card) && card.indexOf((b25.breakeven.p_star * 100).toFixed(1) + '%') >= 0 && /기준선 승률/.test(card) && /한쪽 고정/.test(card) && card.indexOf((b25.breakeven.baseline_winrate['+1'] * 100).toFixed(1) + '%') >= 0);
  const pg = b25.scorecard.directions['+1'].per_game;
  check('② 판 카드: census 성적표 6지표(+1/−1 두 열 · directions.per_game)', /승률<\/td>/.test(card) && /MDD/.test(card) && /최장 연패/.test(card) && /길이/.test(card) && /꼬리/.test(card) && /관통률/.test(card) && card.indexOf('<td>' + pg.n + '</td>') >= 0 && card.indexOf((pg.win_rate * 100).toFixed(1) + '%') >= 0);
  check('② 판 카드: 4국면별 승률 · 비겹침/종료일/최악 시즌/동전 참조 · k별 census', /4국면별 승률/.test(card) && /비겹침 열/.test(card) && /동전 참조/.test(card) && /k별 census/.test(card));
  check('② §8d 판 카드: 사이즈 규칙(역마팅게일 · 3단계 · 상한 4R · 측정 · P(승|승)/P(승|패) · 지금 2단계 · 다음 2.00R)', /역마팅게일/.test(card) && /3단계/.test(card) && /상한 4\.0R/.test(card) && /근거 측정/.test(card) && /P\(승\|승\) 74\.0%/.test(card) && /P\(승\|패\) 61\.0%/.test(card) && /다음 판 사이즈 <b>2\.00R/.test(card));
  check('② 판 카드: 한계 사용량 ±1(돌려줌 음수) · 판당 델타 상한', /한계 사용량/.test(card) && /−1,350만/.test(card) && /판당 델타 상한/.test(card));
  B.show('L.cash.2y'); card = ELS.bsBoardCard.innerHTML;
  check('② §8d 측정 전 판: flat + 잠정 + evidence 없음', /고정<\/b>/.test(card) && /잠정/.test(card) && /evidence 없음/.test(card));
  check('② 미실측 판: provisional_k 라벨 · 성적표 없음 · 본전 승률 추정 라벨 · 한계 사용량 미계산', /provisional_k/.test(card) && /성적표 없음/.test(card) && /추정/.test(card) && /미계산/.test(card));
  B.show('S.irs.2_5'); card = ELS.bsBoardCard.innerHTML;
  check('② blocked 판: 회계 none · 장벽 미계산', /R 측정 불가/.test(card) && /장벽 미계산/.test(card));

  let op = ELS.bsOpen.innerHTML;
  check('③ §8b 메인 게임 카드(접힘): #1 · 내가 선 쪽(label) · 멤버 2판 · 공통 노출 100% · 합친 지금 · 잠정 묶음', /메인 게임 #1/.test(op) && /내가 선 쪽: 커브 스티프닝 쪽/.test(op) && /멤버 2판/.test(op) && /공통 노출 100%/.test(op) && /합친 지금/.test(op) && /잠정 묶음/.test(op) && !/진입 2026-10-13/.test(op));
  check('③ §8b 미니 게임 개별 카드(main_game_id null · B.basket.3F)', /미니 게임/.test(op) && /B\.basket\.3F\+1@2026-10-20#1/.test(op) && (op.match(/bs-rbar"/g) || []).length === 1);
  check('③ 메인/미니 집계 메타 + 묶음 기준', /3판 열림 · 메인 게임 1 · 미니 게임 1/.test(ELS.bsOpenMeta.textContent) && /묶음 기준/.test(ELS.bsOpenMeta.textContent), ELS.bsOpenMeta.textContent);
  B.toggleMain('MAIN-1'); op = ELS.bsOpen.innerHTML;
  const comp = SAMPLE.my_games.main_games.main_games[0].composite;
  check('③ §8b 펼침: 멤버 2카드 + composite(합친 장벽 원 · 합친 비용 netted/gross · 넷팅 절감 · 캐리/일) + 합친 R 막대', /진입 2026-10-13/.test(op) && /진입 2026-10-21/.test(op) && /합친 장벽/.test(op) && op.indexOf(comp.cost_R_netted.toFixed(3) + 'R') >= 0 && op.indexOf(comp.cost_R_gross.toFixed(3) + 'R') >= 0 && /넷팅 절감/.test(op) && (op.match(/bs-rbar"/g) || []).length === 4);
  check('③ §8d 게임 카드: 사이즈 규칙 · 지금 2단계(×2 · 사이클) · 다음 판 사이즈 2.00R', /사이즈 규칙<\/i><b>역마팅게일/.test(op) && /지금 2단계 \(×2\) · 사이클 C-S25-7 · 다음 판 사이즈 <b>2\.00R/.test(op) && /지금 1단계/.test(op));
  check('③ 게임 카드: 지금 R · 승/패 거리 · 캐리/일 · 국면 진입→지금 · 손익 분해 · 요인 적재 잠정 · 만기(B)', /\+0\.34R/.test(op) && /승까지/.test(op) && /패까지/.test(op) && /캐리\/일/.test(op) && /불스팁 → 불플랫/.test(op) && /손익 분해/.test(op) && /요인 적재/.test(op) && /만기 2026-12-15/.test(op));
  check('③ 최근 종료 4행(역순) · 승/패/무승부/수동 · 메인/미니 몫 열 · 자동/수동', (ELS.bsClosed.innerHTML.match(/<tr>/g) || []).length === 5 && /<td>승 </.test(ELS.bsClosed.innerHTML) && /무승부/.test(ELS.bsClosed.innerHTML) && /수동 종료/.test(ELS.bsClosed.innerHTML) && /메인 몫/.test(ELS.bsClosed.innerHTML) && /−0\.55/.test(ELS.bsClosed.innerHTML));
  F('bsFSize').value = ''; F('bsFBoard').value = 'S.slope.2_5'; B.syncDir();
  check('③ §8d 폼 기본값 = next_size_R(S.slope.2_5 → 2) + 힌트', F('bsFSize').value === '2' && /next_size_R 2\.00R/.test(F('bsFSizeHint').textContent), F('bsFSize').value + ' | ' + F('bsFSizeHint').textContent);
  F('bsFBoard').value = 'L.cash.2y'; B.syncDir();
  check('③ §8d next_size_R 없는 판 → 자동값 유지 안 함(힌트 비움)', F('bsFSizeHint').textContent === '');
  F('bsFSize').value = '';
  check('③ 폼: 판 select 36 · 방향 뜻(dir_meaning "1"/"-1")', (F('bsFBoard').innerHTML.match(/<option/g) || []).length === 36 && F('bsFDirMeaning').textContent.length > 2, F('bsFDirMeaning').textContent);
  check('④ 한쪽 델타 4,710만 / 한도 1억 · 47.1% · 결정 수', /4,710만/.test(ELS.bsRiskGauge.innerHTML) && /1억/.test(ELS.bsRiskGauge.innerHTML) && /47\.1%/.test(ELS.bsRiskGauge.innerHTML) && /결정 수/.test(ELS.bsRiskGauge.innerHTML));
  check('④ 시즌: 손익 · 본전선 40억 · 감내선 −20억 · by_layer 두 줄(메인/미니 · 종료 수 · 순 R 합 · 열린 MtM) · 잠정', /본전선/.test(ELS.bsSeason.innerHTML) && /40억/.test(ELS.bsSeason.innerHTML) && /−20억/.test(ELS.bsSeason.innerHTML) && /메인 층/.test(ELS.bsSeason.innerHTML) && /미니 층/.test(ELS.bsSeason.innerHTML) && /열린 MtM/.test(ELS.bsSeason.innerHTML));
  check('④ 사이즈 자 D_R(출처·판) · b(지금) 0 · 크기 축소 라벨 · S 병기 · 버틸 낙폭 – (엔진 null 그대로)', /D_R/.test(ELS.bsSeason.innerHTML) && /b\(지금\) 0원/.test(ELS.bsSeason.innerHTML) && /크기 축소 중/.test(ELS.bsSeason.innerHTML) && /S\(연패\) 5/.test(ELS.bsSeason.innerHTML) && /버틸 낙폭<\/i><b class="bs-big">–/.test(ELS.bsSeason.innerHTML));
  check('⑤ §8d 각주: 규칙은 모양(왜도)을 바꾼다(honesty 배열 그대로)', /규칙은 모양\(왜도\)을 바꾼다/.test(ELS.bsHonesty.innerHTML));
  check('⑤ 각주: honesty ' + SAMPLE.honesty.length + '줄 그대로', (ELS.bsHonesty.innerHTML.match(/<li>/g) || []).length === SAMPLE.honesty.length && /50% 게임/.test(ELS.bsHonesty.innerHTML));
  const provN = Object.keys(SAMPLE.config).filter(k => SAMPLE.config[k].provisional).length + SAMPLE.provisional_items.filter(x => !SAMPLE.config[x.key] || !SAMPLE.config[x.key].provisional).length;
  check('⑤ 각주: 잠정 규약 ' + provN + ' 항목(config.provisional + provisional_items) · 성적표 출처', (ELS.bsProv.innerHTML.match(/<tr><td>/g) || []).length === provN && /comovement_rule/.test(ELS.bsProv.innerHTML) && /성적표 출처/.test(ELS.bsProv.innerHTML), ELS.bsProvMeta.textContent);
  check('더미 배너는 로컬+?bs_sample 가 아니면 안 뜸(API 경로)', !/더미 스냅샷/.test(ELS.bsNotice.innerHTML));

  // ②b board_corr matrix null(엔진 실값) · main_games 비어 있고 open[].main_game_id 만
  const snapNoCorr = clone(SAMPLE); snapNoCorr.market.board_corr = { matrix: null, n_eff_now: null, n_eff_history: [], window: 63, source: null, status: '동행표 미실측' }; snapNoCorr.my_games.main_games = { main_games: [], n_main: 0, n_mini: 3 }; snapNoCorr.available = true;
  B._setSnap(snapNoCorr); B.render();
  check('① board_corr.matrix null → 동행표 미실측(status 그대로)', /동행표 미실측/.test(ELS.bsCorr.innerHTML) && /동행표 미실측/.test(ELS.bsNeff.innerHTML) && /동행표 미실측/.test(ELS.bsCorrMeta.textContent));
  check('③ main_games 비었고 open[].main_game_id 만 → 묶음 표시 · composite 없음 정직', /메인 게임 #1/.test(ELS.bsOpen.innerHTML) && /composite 없음/.test(ELS.bsOpen.innerHTML) && /잠정 묶음/.test(ELS.bsOpen.innerHTML));
  const snapErr = clone(SAMPLE); snapErr.my_games.open[2].now = null; snapErr.my_games.open[2].err = 'KeyError: path'; snapErr.available = true;
  B._setSnap(snapErr); B.render();
  check('③ now null(엔진 경로 오류) → 숫자 안 지어냄 · 오류 원문', /지금 위치 계산 불가/.test(ELS.bsOpen.innerHTML) && /KeyError: path/.test(ELS.bsOpen.innerHTML));
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
  check('응답 스냅샷으로 즉시 재렌더(G-SMOKE 카드 · 미니)', /G-SMOKE/.test(ELS.bsOpen.innerHTML) && /기록 완료/.test(ELS.bsMsg.textContent) && /open_game → build_snapshot/.test(ELS.bsMsg.textContent), ELS.bsMsg.textContent);
  B.sizeMode('one_R_won'); F('bsFSize').value = '125000000'; await B.submit();
  check('크기 단위 1R 금액(원) → one_R_won', CALLS.post[1].body.one_R_won === 125000000 && CALLS.post[1].body.size_R === undefined);
  POST_RESULT = new Error('503 — 엔진 game_board 패키지 없음');
  B.close('G-SMOKE'); await new Promise(r => setTimeout(r, 0));
  check('close 이벤트(result manual · date) 전송 + 503 정직 표시', CALLS.post[2].body.event === 'close' && CALLS.post[2].body.game_id === 'G-SMOKE' && CALLS.post[2].body.result === 'manual' && /기록 실패/.test(ELS.bsMsg.textContent) && /503/.test(ELS.bsMsg.textContent), ELS.bsMsg.textContent);
  B.amend(SAMPLE.my_games.open[0].game_id);
  check('amend: 폼 프리필 + 정정 배너(원래 open 보존 문구)', F('bsFBoard').value === 'S.slope.2_5' && F('bsFAmend').hidden === false && /원래 open 은 남고/.test(F('bsFAmend').innerHTML));
  B.sizeMode('size_R'); F('bsFSize').value = '1.5'; POST_RESULT = { ok: true, snapshot: snap2 };
  await B.submit();
  check('amend 이벤트 game_id 포함', CALLS.post[3].body.event === 'amend' && CALLS.post[3].body.game_id === SAMPLE.my_games.open[0].game_id && CALLS.post[3].body.size_R === 1.5, JSON.stringify(CALLS.post[3].body));
  POST_RESULT = { ok: true, snapshot: { available: true, ok: false, err: 'rebuild fail' } };
  B.note('G-SMOKE'); await new Promise(r => setTimeout(r, 0));
  check('note 이벤트 + 스냅샷 재빌드 실패 → 재로드·정직 메시지', CALLS.post[4].body.event === 'note' && /재빌드 실패/.test(ELS.bsMsg.textContent), ELS.bsMsg.textContent);
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

  // ④ 추천·신호·방향 제안 문구 0 (렌더 결과 + 탭 HTML + 스크립트)
  const view = (html.match(/<div id="view-bootstrap"[\s\S]*?<!-- 각주 -->[\s\S]*?<\/section>\s*<\/div>/) || [''])[0];
  const corpus = allHtml() + '\n' + view + '\n' + src;
  const banned = ['추천합니다', '추천 판', '추천 방향', '들어가라', '들어가세요', '들어갈 만', '유리', '좋다', '좋은 판', '좋아 보', '매수 신호', '매도 신호', '진입 신호 발생', '권장', '권합니다', '노려', '기회', '유망', '선호 판'];
  const hits = banned.filter(w => corpus.indexOf(w) >= 0);
  check('추천·신호·방향 제안 문구 0', hits.length === 0, hits.join(','));
  const rec = corpus.match(/추천.{0,16}/g) || [];
  const recBad = rec.filter(x => !/^추천( 0|·진입 신호·방향 제안 0|·방향 제안 0|이 아니다)/.test(x));
  check("'추천' 은 부정형(추천 0 · 추천이 아니다)으로만", recBad.length === 0, recBad.join(' | '));
  check('승률 라벨 = 기준선(한쪽 고정) · 내가 선 쪽 = 사실 서술', /기준선 승률/.test(ELS.bsBoardCard.innerHTML) && /내가 선 쪽/.test(ELS.bsOpen.innerHTML));
  check('더미는 로컬+?bs_sample=1 일 때만(코드 가드)', /BS_LOCAL/.test(src) && /bs_sample=1/.test(src));

  console.log(fails ? ('\n' + fails + ' FAIL') : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
