// fut UI render smoke — mock board/ledger 주입 렌더 검증 (실원장·실API 무접촉)
// usage: node _smoke_fut_render.js
'use strict';
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const m = html.match(/<script>\r?\n([\s\S]*?)<\/script>\r?\n<\/body>/);
if (!m) { console.error('FAIL: inline script block not found'); process.exit(1); }
let src = m[1].replace(/\nload\(\);\s*$/, '\n'); // 자동 load() 제거 (fetch 차단)

// ── 최소 DOM/브라우저 스텁 ──────────────────────────────────────────────────
function fakeEl(id) {
  return {
    id: id, innerHTML: '', textContent: '', value: '', style: { display: 'none' },
    children: [],
    appendChild(c) { this.children.push(c); this.innerHTML += c.innerHTML; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    remove() {},
    addEventListener() {},
  };
}
const ELS = {};
const document = {
  getElementById(id) { if (!ELS[id]) ELS[id] = fakeEl(id); return ELS[id]; },
  createElement(tag) { return fakeEl('_' + tag + Math.random()); },
  querySelectorAll() { return []; },
  addEventListener() {},
};
const window = { addEventListener() {}, location: { search: '', hash: '' } };
const localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const Chart = function () { return { destroy() {} }; };
Chart.register = function () {};
const fetch = function () { return Promise.reject(new Error('no network in smoke')); };
const prompt = function () { return null; };
const confirm = function () { return false; };
const apiGet = async function () { throw new Error('no network in smoke'); };
const getApiBase = async function () { return null; };

// ── mock 데이터 (engine.positions board()/ledger 실스키마 — _fut_leg_view 확정본) ──
const MOCK_FUT_LEG_BOARD = { key: '10선', kind: 'fut', side: 1, entry_price: 104.20,
  cur_price: 104.55, px_chg: 0.35, override_price: null, contracts: 10 };
const MOCK_BOARD = {
  as_of: '2026-06-10', n_open: 1,
  positions: [{ id: 'P0001', strategy: 'fut_test', source: 'manual',
    entry_date: '2026-06-09', days_held: 1, hold: 63, exit_eta: '2026-09-08',
    pnl_bp: 4.43, pnl_krw: 3500000, last_mark: '2026-06-10',
    size_dv01_krw: 790000 * 1, exit_state: 'HOLD', policy: { key: 'manual_default', tp: 15, sl: 5, hold: 63 },
    fut_legs: [MOCK_FUT_LEG_BOARD], size_contracts: 10, n_overrides: 1 }],
  strategy_sums: { fut_test: 790000 }, utilization: { fut_test: { oneside_dv01_krw: 790000, cap_krw: 25000000, utilization: 0.032 } },
  warnings: [], total_pnl_krw: 3500000,
  caps: { per_trade_krw: 50000000, strategy_oneside_krw: 25000000, unit: 'DV01 KRW/bp' },
};
const MOCK_LEDGER = {
  schema_version: 1, seq: 1, positions: [{
    id: 'P0001', strategy: 'fut_test', source: 'manual', status: 'open',
    entry_date: '2026-06-09', unit_factor: 100.0, size_dv01_krw: 790000, size_contracts: 10,
    policy: { key: 'manual_default', tp: 15, sl: 5, hold: 63 }, policy_note: null,
    exit_state: 'HOLD', exit_eval: null, note: '', mtm_path: [{ date: '2026-06-10', pnl_bp: 4.43 }],
    legs: [{ key: '10선', kind: 'fut', side: 1, weight: 1.0,
      entry_price: 104.20, entry_price_date: '2026-06-09', entry_price_source: 'user',
      fut_dur: 7.9, fut_dur_source: 'factory.DUR const', entry_yield: -13.189873, entry_yproxy: -1318.987342,
      override_price: 104.30, override_yield: null,
      cur_price: 104.55, cur_price_date: '2026-06-10', px_chg: 0.35, contracts: 10 }],
  }],
};

// ── 실행 ─────────────────────────────────────────────────────────────────────
const sandbox = new Function(
  'document', 'window', 'localStorage', 'Chart', 'fetch', 'prompt', 'confirm', 'apiGet', 'getApiBase',
  src + '\n;return { renderOpsBoard, opsToggleDetail, opsRenderManual, opsAddLeg, opsLegKind,' +
  ' _setBoard: function(b,l){ _OPS_BOARD=b; _OPS_LEDGER=l; } };'
)(document, window, localStorage, Chart, fetch, prompt, confirm, apiGet, getApiBase);

let fails = 0;
function check(name, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name);
  if (!cond) fails++;
}

// 1) board render
sandbox._setBoard(MOCK_BOARD, MOCK_LEDGER);
sandbox.renderOpsBoard();
const bh = document.getElementById('opsBoard').innerHTML;
check('board: size cell shows contracts (10 contracts)', bh.indexOf('10계약') >= 0);
check('board: proxy-bp caption present (fut row exists)', bh.indexOf('proxy-bp') >= 0);
check('board: roll caution caption present', bh.indexOf('청산 후 재진입') >= 0);

// 2) detail render (fut leg price columns + override price)
sandbox.opsToggleDetail('P0001');
const dh = document.getElementById('opsdc_P0001').innerHTML;
check('detail: entry price 104.2 shown', dh.indexOf('104.2') >= 0);
check('detail: price unit label (pt)', dh.indexOf('가격(pt)') >= 0);
check('detail: cur price 104.55 shown', dh.indexOf('104.55') >= 0);
check('detail: px_chg +0.35pt green class', dh.indexOf('+0.35pt') >= 0 && /class="pp">\+0\.35pt/.test(dh));
check('detail: override_price input value 104.3', dh.indexOf('value="104.3"') >= 0);
check('detail: OVERRIDE badge uses price', dh.indexOf('OVERRIDE 중 104.3') >= 0);
check('detail: contracts + duration shown', dh.indexOf('10계약') >= 0 && dh.indexOf('7.9') >= 0);
check('detail: proxy-bp honesty caption', dh.indexOf('proxy-bp') >= 0);
check('detail: roll caution', dh.indexOf('청산 후 재진입') >= 0);
check('detail: fut override unit says price not yield', dh.indexOf('DB 선물가 사용') >= 0);

// 3) negative px_chg → red class
MOCK_LEDGER.positions[0].legs[0].px_chg = -0.15;
MOCK_LEDGER.positions[0].legs[0].cur_price = 104.05;
sandbox.opsToggleDetail('P0001'); // toggle off
sandbox.opsToggleDetail('P0001'); // re-render
const dh2 = document.getElementById('opsdc_P0001').innerHTML;
check('detail: negative px_chg red class', /class="pn">-0\.15pt/.test(dh2));

// 4) manual form — fut kind / futkey dropdown / sizing toggle
sandbox.opsRenderManual();
const mh = document.getElementById('opsManual').innerHTML;
const lh = document.getElementById('mn_legs').innerHTML;   // 레그 행은 mn_legs 에 append
check('manual: fut kind option', lh.indexOf('선물 (가격)') >= 0);
check('manual: futkey dropdown 3/10/30', lh.indexOf('3선') >= 0 && lh.indexOf('10선') >= 0 && lh.indexOf('30선') >= 0);
check('manual: entry_price input (pt label)', lh.indexOf('진입 가격(pt') >= 0);
check('manual: sizing mode toggle (contracts)', mh.indexOf('계약수 (선물 전용)') >= 0);
check('manual: roll caution in form caption', mh.indexOf('청산 후 재진입') >= 0);

// 5) cash-only board → no fut caption (정직: fut 없으면 캡션도 없음)
const cashBoard = JSON.parse(JSON.stringify(MOCK_BOARD));
cashBoard.positions[0].fut_legs = null; cashBoard.positions[0].size_contracts = null;
sandbox._setBoard(cashBoard, MOCK_LEDGER);
sandbox.renderOpsBoard();
const bh2 = document.getElementById('opsBoard').innerHTML;
check('board(cash only): no proxy-bp caption', bh2.indexOf('proxy-bp') < 0);
check('board(cash only): no contracts in size cell', bh2.indexOf('계약</span>') < 0);

console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' FAILED');
process.exit(fails === 0 ? 0 : 1);
