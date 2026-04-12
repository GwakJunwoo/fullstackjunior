/**
 * model.js — 순수 계산 함수 (DOM 의존 없음)
 *
 * 외부 의존: data.js (LAST_CD, LAST_DATE, SEASONAL_BP)
 *
 * 내보내는 함수:
 *   applyShape(t, shape)              → 선반영 진행 곡선 [0,1]→[0,1]
 *   getBR(ds, steps)                  → 해당일의 기준금리 (step function)
 *   getPreAdj(ds, steps, shape, on)   → 선반영 CD additive 조정값
 *   getSpread(ds, params)             → 해당일의 CD 스프레드
 *   genFc(steps, params)              → 주간 전망 포인트 배열
 *   applySmooth(fc, halfLifeDays)     → LAST_CD 기준 지수 평활
 */

// ── Date Helpers ────────────────────────────────────────────────
const d2ms     = d => new Date(d).getTime();
const msPerDay = 86_400_000;

/**
 * @param {string} d    - 'YYYY-MM-DD'
 * @param {number} days - 더할 일수
 * @returns {string}    - 'YYYY-MM-DD'
 */
function dateAdd(d, days) {
  return new Date(d2ms(d) + days * msPerDay).toISOString().split('T')[0];
}

/**
 * b − a (일수)
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function dateDiff(a, b) {
  return Math.round((d2ms(b) - d2ms(a)) / msPerDay);
}

// ── 선반영 곡선 형태 ────────────────────────────────────────────
/**
 * t ∈ [0,1] → progress ∈ [0,1]
 * @param {number} t
 * @param {'linear'|'convex'|'concave'} shape
 * @returns {number}
 */
function applyShape(t, shape) {
  if (shape === 'convex')  return Math.pow(t, 0.45); // 초반 급하락, 후반 완만
  if (shape === 'concave') return Math.pow(t, 2.20); // 초반 완만, 후반 급하락
  return t;                                           // linear (default)
}

// ── 기준금리 Step Function ───────────────────────────────────────
/**
 * 해당일의 실제 기준금리 (인하 발표일에 즉시 반영, 선반영 없음)
 * @param {string}   ds    - 'YYYY-MM-DD'
 * @param {object[]} steps - [{date, rate, fixed, preDate}]
 * @returns {number}
 */
function getBR(ds, steps) {
  let cur = steps[0].rate;
  for (const s of steps) {
    if (s.date <= ds) cur = s.rate;
    else break;
  }
  return cur;
}

// ── 선반영 Additive 조정값 ──────────────────────────────────────
/**
 * CD만 선제적으로 움직임 — BR 경로는 불변
 * 선반영 구간 [preDate, cutDate) 안에서 (nextRate - prevRate) * progress 반환
 * 구간 밖: 0
 *
 * @param {string}                       ds       - 'YYYY-MM-DD'
 * @param {object[]}                     steps
 * @param {'linear'|'convex'|'concave'}  shape
 * @param {boolean}                      enabled
 * @returns {number}
 */
function getPreAdj(ds, steps, shape, enabled) {
  if (!enabled) return 0;
  for (let i = 1; i < steps.length; i++) {
    const s = steps[i];
    if (!s.preDate) continue;
    if (ds >= s.preDate && ds < s.date) {
      const total   = dateDiff(s.preDate, s.date);
      const elapsed = dateDiff(s.preDate, ds);
      const t       = Math.max(0, Math.min(1, elapsed / total));
      return (s.rate - steps[i - 1].rate) * applyShape(t, shape);
    }
  }
  return 0;
}

// ── 스프레드 ─────────────────────────────────────────────────────
/**
 * @param {string} ds
 * @param {{ baseSpread: number, seasonStr: number, ysExtra: number }} params
 *   baseSpread : 기준 스프레드 (소수, e.g. 0.25 = 25bp)
 *   seasonStr  : 계절성 강도 배율 (소수, e.g. 1.0 = 100%)
 *   ysExtra    : 연초 추가 bp (소수, e.g. 0.09 = 9bp)
 * @returns {number}
 */
function getSpread(ds, { baseSpread, seasonStr, ysExtra }) {
  const d        = new Date(ds);
  const m        = d.getMonth();    // 0-indexed
  const day      = d.getDate();
  const seasonal = (SEASONAL_BP[m] / 100) * seasonStr;
  const ysBonus  = (m === 0 && day <= 10) ? ysExtra : 0;
  return Math.max(0, baseSpread + seasonal + ysBonus);
}

// ── 전망 포인트 생성 (주간) ─────────────────────────────────────
/**
 * @param {object[]} steps
 * @param {{
 *   preOn:      boolean,
 *   preShape:   string,
 *   baseSpread: number,
 *   seasonStr:  number,
 *   ysExtra:    number,
 *   endDate?:   string,   // 기본 '2027-04-17'
 * }} params
 * @returns {{ date: string, br: number, sp: number, cd: number }[]}
 */
function genFc(steps, params) {
  const { preOn, preShape, baseSpread, seasonStr, ysExtra } = params;
  const endDate = params.endDate || '2027-04-17';
  const pts  = [];
  const d    = new Date(LAST_DATE);
  const end  = new Date(endDate);

  while (d <= end) {
    const ds = d.toISOString().split('T')[0];
    const br = getBR(ds, steps);
    const sp = getSpread(ds, { baseSpread, seasonStr, ysExtra });
    const pa = getPreAdj(ds, steps, preShape, preOn);
    pts.push({ date: ds, br, sp, cd: +(br + sp + pa).toFixed(4) });
    d.setDate(d.getDate() + 7);
  }
  return pts;
}

// ── CD 지수 평활 ─────────────────────────────────────────────────
/**
 * LAST_CD 기준으로 전망 경로에 지수 감쇠 적용
 * 역할: 현재 CD → 전망 경로로 수렴하는 속도 제어 (선반영과 독립)
 *
 * @param {{ date: string, cd: number }[]} fc
 * @param {number} halfLifeDays
 * @returns {{ date: string, cd: number }[]}
 */
function applySmooth(fc, halfLifeDays) {
  if (!halfLifeDays || halfLifeDays <= 0) return fc;
  return fc.map(f => {
    const days = dateDiff(LAST_DATE, f.date);
    if (days <= 0) return { ...f, cd: LAST_CD };
    const decay = Math.exp(-(Math.LN2 / halfLifeDays) * days);
    return { ...f, cd: +(f.cd + (LAST_CD - f.cd) * decay).toFixed(4) };
  });
}
