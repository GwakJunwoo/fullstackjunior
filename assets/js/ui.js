/**
 * ui.js — 앱 상태 · DOM 렌더링 · 이벤트 핸들러 · 차트
 *
 * 외부 의존: data.js, model.js, Chart.js (CDN)
 */

// ── 앱 상태 ──────────────────────────────────────────────────────
let steps = [
  { date: '2026-04-10', rate: 2.50, fixed: true  },
  { date: '2026-05-28', rate: 2.25, fixed: false },
  { date: '2026-07-16', rate: 2.00, fixed: false },
];
let mainChart   = null;
let monthChart  = null;

// ── DOM 파라미터 읽기 ────────────────────────────────────────────
function getParams() {
  return {
    preOn:      document.getElementById('preToggle').checked,
    smoothOn:   document.getElementById('smoothToggle').checked,
    preWindow:  +document.getElementById('preWindow').value,
    baseSpread: +document.getElementById('baseSpread').value / 100,
    seasonStr:  +document.getElementById('seasonStr').value / 100,
    ysExtra:    +document.getElementById('ysExtra').value / 100,
    halfLife:   +document.getElementById('halfLife').value,
  };
}

// ── Step Table ───────────────────────────────────────────────────
function renderHead() {
  document.getElementById('stepHead').innerHTML = `
    <tr>
      <th>날짜</th>
      <th style="text-align:right;">기준금리(%)</th>
      <th></th>
    </tr>`;
}

function renderRows() {
  const tb = document.getElementById('stepRows');
  tb.innerHTML = '';

  steps.forEach((s, i) => {
    const tr = document.createElement('tr');
    if (s.fixed) {
      tr.innerHTML = `
        <td style="padding:4px 5px;font-size:12px;color:var(--t2);">${s.date}</td>
        <td style="padding:4px 5px;text-align:right;font-size:12px;font-weight:600;">${s.rate.toFixed(2)}%</td>
        <td><span class="fixed-lbl">현재</span></td>`;
    } else {
      tr.innerHTML = `
        <td><input type="date" value="${s.date}"    onchange="updateStep(${i},'date', this.value)"></td>
        <td><input type="number" min="0" max="5" step="0.25" value="${s.rate}"
              onchange="updateStep(${i},'rate', +this.value)" style="width:58px;"></td>
        <td><button class="del-btn" onclick="removeRow(${i})">×</button></td>`;
    }
    tb.appendChild(tr);
  });

  renderPreTags();
}

function renderPreTags() {
  const { preOn, preWindow } = getParams();
  const el = document.getElementById('preEventTags');
  el.innerHTML = '';
  if (!preOn || preWindow <= 0) return;

  steps.filter(s => !s.fixed).forEach(s => {
    const idx    = steps.findIndex(x => x.date === s.date);
    const daysTo = dateDiff(LAST_DATE, s.date);
    const bp     = Math.round((s.rate - (steps[idx - 1]?.rate ?? s.rate)) * 100);
    const inWin  = daysTo > 0 && daysTo <= preWindow;
    const tag    = document.createElement('div');
    tag.className = 'pre-tag' + (inWin ? '' : ' pre-tag-dim');
    tag.textContent = inWin
      ? `${s.date} — ${daysTo}일 후 (윈도우 ${preWindow}일 내) → ${bp < 0 ? bp : '+' + bp}bp 선반영 중`
      : `${s.date} — ${daysTo}일 후 (윈도우 ${preWindow}일 밖, 아직 미반영)`;
    el.appendChild(tag);
  });
}

// ── Step CRUD ────────────────────────────────────────────────────
function addRow() {
  const last = steps[steps.length - 1];
  const nd   = dateAdd(last.date, 60);
  steps.push({ date: nd, rate: Math.max(0, +(last.rate - 0.25).toFixed(2)), fixed: false });
  renderHead(); renderRows(); updateAll();
}

function removeRow(i) {
  if (steps.length <= 2) return;
  steps.splice(i, 1);
  renderHead(); renderRows(); updateAll();
}

function updateStep(i, field, val) {
  steps[i][field] = field === 'rate' ? +val : val;
  steps.sort((a, b) => a.date.localeCompare(b.date));
  renderHead(); renderRows(); updateAll();
}

// ── Toggle Handlers ──────────────────────────────────────────────
function togglePre() {
  const on = document.getElementById('preToggle').checked;
  document.getElementById('preCtrls').classList.toggle('dim', !on);
  renderPreTags(); updateAll();
}

document.getElementById('smoothToggle').addEventListener('change', () => {
  const on = document.getElementById('smoothToggle').checked;
  document.getElementById('smoothCtrls').classList.toggle('dim', !on);
  updateAll();
});

// ── Slider Display Sync ──────────────────────────────────────────
function syncSliderLabels(p) {
  document.getElementById('bsv').textContent = Math.round(p.baseSpread * 100);
  document.getElementById('ssv').textContent = Math.round(p.seasonStr  * 100);
  document.getElementById('ysv').textContent = Math.round(p.ysExtra    * 100);
  document.getElementById('hlv').textContent = p.halfLife;
  document.getElementById('pwv').textContent = p.preWindow;
  renderPreTags();
}

// ── Main Update ──────────────────────────────────────────────────
function updateAll() {
  const p = getParams();
  syncSliderLabels(p);

  // 전망 계산
  const fcRaw   = genFc(steps, { ...p, preOn: false });          // 선반영 없는 raw (비교용)
  const fcPre   = genFc(steps, p);                               // 선반영 포함
  const fcFinal = p.smoothOn ? applySmooth(fcPre, p.halfLife) : fcPre;

  // 현재 모델 CD
  document.getElementById('mCurrentCD').textContent = (fcFinal[0]?.cd.toFixed(2) ?? '—') + '%';

  // 차트 데이터 구성
  const hDates   = hist.map(h => h.d);
  const fDates   = fcFinal.map(f => f.date);
  const allDates = [...new Set([...hDates, ...fDates])].sort();

  const hMap   = Object.fromEntries(hist.map(h    => [h.d,     h.cd]));
  const fMap   = Object.fromEntries(fcFinal.map(f => [f.date,  f]));
  const rawMap = Object.fromEntries(fcRaw.map(f   => [f.date,  f.cd]));

  const labels    = allDates.map(d => {
    const dt = new Date(d);
    return dt.getDate() <= 7
      ? `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, '0')}`
      : '';
  });
  const hArr      = allDates.map(d => hMap[d]        ?? null);
  const fArr      = allDates.map(d => fMap[d]?.cd    ?? null);
  const noPreArr  = allDates.map(d => rawMap[d]      ?? null);
  const brArr     = allDates.map(d => fMap[d]?.br    ?? null);

  const allVals = [
    ...hist.map(h    => h.cd),
    ...fcFinal.map(f => f.cd),
    ...fcFinal.map(f => f.br),
  ];
  const yMin = Math.floor((Math.min(...allVals) - 0.15) * 4) / 4;
  const yMax = Math.ceil( (Math.max(...allVals) + 0.20) * 4) / 4;

  // 차트 업데이트 또는 생성
  if (mainChart) {
    mainChart.data.labels              = labels;
    mainChart.data.datasets[0].data    = hArr;
    mainChart.data.datasets[1].data    = fArr;
    mainChart.data.datasets[2].data    = p.preOn ? noPreArr : null;
    mainChart.data.datasets[3].data    = brArr;
    mainChart.options.scales.y.min     = yMin;
    mainChart.options.scales.y.max     = yMax;
    mainChart.update('none');
  } else {
    const ctx = document.getElementById('cdChart').getContext('2d');
    mainChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'CD91 실제',
            data: hArr,
            borderColor: '#4a9eff', borderWidth: 2.5,
            pointRadius: 0, pointHoverRadius: 4,
            tension: .3, spanGaps: true,
          },
          {
            label: 'CD91 전망',
            data: fArr,
            borderColor: '#4a9eff', borderWidth: 2,
            borderDash: [6, 4],
            pointRadius: 0, tension: .3, spanGaps: true,
          },
          {
            label: '선반영 없는 raw',
            data: p.preOn ? noPreArr : null,
            borderColor: 'rgba(167,139,250,.45)', borderWidth: 1.2,
            borderDash: [2, 3],
            pointRadius: 0, tension: .2, spanGaps: true,
          },
          {
            label: '기준금리 경로',
            data: brArr,
            borderColor: '#555e75', borderWidth: 1.5,
            borderDash: [3, 3],
            pointRadius: 0, tension: 0, spanGaps: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#181c27',
            borderColor: 'rgba(255,255,255,.1)', borderWidth: 1,
            titleColor: '#8b93a8', bodyColor: '#e8eaf0', padding: 10,
            callbacks: {
              label: c => `  ${c.dataset.label}: ${c.parsed.y != null ? c.parsed.y.toFixed(3) + '%' : '—'}`,
            },
          },
        },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,.04)' },
            ticks: { font: { size: 10 }, color: '#555e75', autoSkip: false, maxRotation: 0, callback: v => v || null },
          },
          y: {
            grid: { color: 'rgba(255,255,255,.04)' },
            ticks: { font: { size: 10 }, color: '#555e75', callback: v => v.toFixed(2) + '%' },
            min: yMin, max: yMax,
          },
        },
      },
    });
  }

  // Legend
  const noPreLegend = p.preOn
    ? `<span><span class="legend-line" style="width:18px;border-top:1.5px dashed rgba(167,139,250,.5);"></span>선반영 없는 raw</span>`
    : '';
  document.getElementById('legend').innerHTML = `
    <span><span class="legend-line" style="width:18px;border-top:2.5px solid #4a9eff;"></span>CD91 실제</span>
    <span><span class="legend-line" style="width:18px;border-top:2px dashed #4a9eff;"></span>CD91 전망</span>
    ${noPreLegend}
    <span><span class="legend-line" style="width:18px;border-top:2px dashed #555e75;"></span>기준금리</span>
  `;

  // 분기별 카드
  const qtrs = [
    { l: '2026 Q2', s: '2026-04-01', e: '2026-06-30' },
    { l: '2026 Q3', s: '2026-07-01', e: '2026-09-30' },
    { l: '2026 Q4', s: '2026-10-01', e: '2026-12-31' },
    { l: '2027 Q1', s: '2027-01-01', e: '2027-03-31' },
  ];
  document.getElementById('qout').innerHTML = qtrs.map(q => {
    const pts = fcFinal.filter(f => f.date >= q.s && f.date <= q.e);
    if (!pts.length)
      return `<div class="qcard"><div class="ql">${q.l}</div><div class="qv" style="color:var(--t3);">—</div></div>`;
    const avgCD = pts.reduce((s, p) => s + p.cd, 0) / pts.length;
    const avgBR = pts.reduce((s, p) => s + p.br, 0) / pts.length;
    const avgSp = pts.reduce((s, p) => s + p.sp, 0) / pts.length;
    return `<div class="qcard">
      <div class="ql">${q.l}</div>
      <div class="qv">${avgCD.toFixed(2)}%</div>
      <div class="qb">BR ${avgBR.toFixed(2)}% + ${(avgSp * 100).toFixed(0)}bp</div>
    </div>`;
  }).join('');
}

// ── 월별 스프레드 차트 (정적) ─────────────────────────────────────
function buildMonthChart() {
  const ctx    = document.getElementById('monthChart').getContext('2d');
  const colors = MONTHLY_AVG.map(v =>
    v > 30  ? 'rgba(248,113,113,.7)' :
    v < 16  ? 'rgba(52,211,153,.6)'  :
              'rgba(74,158,255,.55)'
  );
  monthChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['1','2','3','4','5','6','7','8','9','10','11','12'],
      datasets: [{ data: MONTHLY_AVG, backgroundColor: colors, borderRadius: 3, borderSkipped: false }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#181c27',
          borderColor: 'rgba(255,255,255,.1)', borderWidth: 1,
          callbacks: { label: c => `${c.parsed.y.toFixed(1)}bp` },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#555e75' } },
        y: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { font: { size: 10 }, color: '#555e75', callback: v => v + 'bp' }, min: 0, max: 45 },
      },
    },
  });
}

// ── Init ─────────────────────────────────────────────────────────
renderHead();
renderRows();
buildMonthChart();
updateAll();
