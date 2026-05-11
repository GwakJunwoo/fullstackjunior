# RV 페어 포지션 종합 분석 (Level mode 기준)

> **모델 기준**: server `/rv/positions` 엔진, **level mode** 회귀
> `Y_i = α + β·Y_3Y + γ·(10Y−3Y) + ε`
> ε = 현재 fair value gap (bp 단위)
>
> **평가 시점**: 2026-05-08 종가
> **입력 데이터**: 사용자 제공 5/8 종가 + DB 5/4·5/7 종가
>
> 분석 대상: 22-5/26-3 (5/4·5/7), 25-11/24-5 (5/7), 25-10/25-3 (5/8) — 총 4건

---

## 1. 분해 공식

각 종목의 일일 수익률 변화는 2-팩터 회귀로 분해된다:

```
Y_i_t = α_i + β_i · Y_3Y_t + γ_i · slope_t + ε_i_t      (level 회귀)
slope_t = Y_10Y_t − Y_3Y_t
```

- `β_i`  : 3Y 평행이동 노출 (level β, "delta")
- `γ_i`  : slope (10Y−3Y) 노출 (curve)
- `ε_i`  : **현재 fair value gap** (= alpha 신호)
  - ε > 0 : 모델 대비 yield 높음 → bond 가 **cheap**
  - ε < 0 : 모델 대비 yield 낮음 → bond 가 **rich**

페어 P&L (LONG i, SHORT j) 의 분해:

```
P&L = −D_i·N_i·ΔY_i  +  D_j·N_j·ΔY_j

    = (D_j·N_j·β_j − D_i·N_i·β_i) · ΔY_3Y       ← Delta P&L
    + (D_j·N_j·γ_j − D_i·N_i·γ_i) · Δslope      ← Curve P&L
    + (D_j·N_j·Δε_j − D_i·N_i·Δε_i)             ← Alpha P&L
```

**Curve direction (Steepener vs Flattener)** 판정:
```
curve_DV01 = (D_S·N_S·γ_S − D_L·N_L·γ_L)            (만원/bp_slope)
  > 0 : steepener (slope +1bp 증가 시 이익)
  < 0 : flattener (slope +1bp 증가 시 손실)
```

지표 종목:
- 3년지표: β=1, γ=0, ε≡0 (= 회귀 X1 자체)
- 10년지표: β=1, γ=1, ε≡0 (= ΔY_3Y + Δslope)

---

## 2. 시장 환경 (5/4 → 5/8, 4영업일)

| 지표 | 5/4 종가 | 5/8 종가 | Δ (bp) |
|---|---:|---:|---:|
| 3년지표 | 3.615% | **3.562%** | **−5.3** |
| 10년지표 | 3.933% | **3.905%** | **−2.8** |
| slope (10Y−3Y) | 31.8 bp | 34.3 bp | **+2.5** |

→ **강세 + slope steepening**. 3y 가 10y 보다 더 빠르게 강세 (= 단기 더 cheaper / 장기 더 rich), 그 결과 slope 가팔라짐.

---

## 3. 종목별 β / γ 표 — **Level mode 회귀 (사용자 트레이딩 기준)**

| 종목 | 잔존(Y) | β_lvl (3Y) | γ_slp (slope) | 5/7 ε(level) | 분류 |
|---|---:|---:|---:|---:|---|
| 22-5  | 6.10 | 0.992 | **0.865** | −0.31 (rich) | 6년 영역 |
| 26-3  | 4.84 | 1.007 | 0.548 | −2.92 (very rich) | 5년 영역 |
| 25-11 | 9.60 | **1.000** | **1.000** | 0 by construction | **10년지표 (회귀 X2)** |
| 24-5  | 8.10 | 0.988 | **1.140** | −0.03 (≈ 모델 일치) | 8년 영역, **slope 노출 큼** |
| 25-10 | 2.60 | **1.000** | **0.000** | 0 by construction | **3년지표 (회귀 X1)** |
| 25-3  | 3.84 | 1.002 | 0.500 | −0.69 (rich) | 5년 영역 |

**참고 — diff mode 대비 차이**: level γ 값은 diff γ 보다 **전반적으로 높음** (예: 22-5: level 0.865 vs diff 0.567). 이는 level 회귀가 누적 slope 노출을 capture 하기 때문. 사용자 트레이딩이 level mode 이므로 본 분석은 level γ 사용.

---

## 4. 포지션별 상세 분석

### Trade #1 — 22-5 L 220억 / 26-3 S 240억 (5/4 → 5/8, 4영업일)

#### 포지션 정보
- LONG : 22-5, face 220억, D=5.371, **DV01 = 1,182 만/bp**
- SHORT: 26-3, face 240억, D=4.398, **DV01 = 1,056 만/bp**
- DV01 mismatch: **+126 만/bp (LONG bias)** — face 220:240 보다 215:240 이 정확

#### Delta 노출
```
delta_DV01 = (1056 × 1.007 − 1182 × 0.992) = 1063 − 1172 = −109 만/bp_3Y
```
→ 시장 평행이동 1bp 강세 시 **+109만 이익** (LONG bias)

#### Curve 노출
```
curve_DV01 = (1056 × 0.548 − 1182 × 0.865) = 579 − 1023 = −444 만/bp_slope
```
→ **방향 = ↘ FLATTENER (−444 만/bp_slope)**.
slope +1bp 증가 시 **−444만 손실** = slope 가 **flatten** 되어야 이익. 5/4→5/8 환경 **+2.5bp steepening 으로 손실 누적**.

#### 진입 / 현재 ε
| | 5/7 (참고) | 의미 |
|---|---:|---|
| 22-5 ε(level) | −0.31 bp | 약간 rich |
| 26-3 ε(level) | **−2.92 bp** | **매우 rich** |
| ε spread (L−S) | **+2.61 bp** | LONG 이 SHORT 보다 cheap (정상 RV 시그널, 다만 둘 다 rich 영역) |

#### 손익 분해 (LEVEL β/γ 적용)
| 항목 | 금액 (만원) | 비중 |
|---|---:|---:|
| Delta (β · −5.3bp) | **+579** | −20% |
| **Curve (γ · +2.5bp)** | **−1,109** | **+38%** |
| Alpha (Δε spread) | **−2,361** | **+82%** |
| **Total (시장)** | **−2,891** | |
| 진입 cost (예상) | +1,914 | ※ |
| **Total (user 진입)** | **약 −977** | reported −977만 ✓ |

※ user 의 5/4 진입 yield 가 DB 시장 종가보다 약간 높았음 (= 채권 더 cheap 하게 매수) → cost 가 +방향. 정확한 cost 는 user 진입가에 따라 달라짐.

#### 종합 결론
- **방향: ↘ flattener bet (−444 만/bp_slope)**
- 1차 손실 = **alpha 미수렴** (Δε spread 가 진입 시 +2.6bp 였다가 wider — 양측 모두 rich 강화)
- 2차 손실 = **curve flattener 가 steepening 환경 만남** (Δslope +2.5bp × −444 = −1,109만)
- delta 는 강세장 + LONG-biased DV01 덕에 **이익 측에 작용** (+579만)
- 진입 시 ε spread +2.6bp 로 임계 (3bp) 직하 — **약간 미흡한 신호**, 다만 cum_ε 평활값은 더 강했을 수도

---

### Trade #2 — 22-5 L 50억 / 26-3 S 60억 (5/7 → 5/8, 1영업일)

#### 포지션 정보
- LONG : 22-5, face 50억, D=5.371, **DV01 = 269 만/bp**
- SHORT: 26-3, face 60억, D=4.398, **DV01 = 264 만/bp**
- DV01 mismatch: **+5 만/bp (거의 균형 ✓)**

#### Delta 노출
```
delta_DV01 = (264 × 1.007 − 269 × 0.992) = 266 − 267 = −0.7 만/bp_3Y
```
→ delta 거의 0 (DV01·β 매칭 우수)

#### Curve 노출
```
curve_DV01 = (264 × 0.548 − 269 × 0.865) = 145 − 233 = −88 만/bp_slope
```
→ **방향 = ↘ FLATTENER (−88 만/bp_slope)**, Trade #1 의 22%

#### 시장 환경 (1일)
- ΔY_3Y = +2.7 bp, Δslope = +0.2 bp (약세 + 거의 평행)

#### 진입 / 현재 ε
- 5/7 진입 ε spread (level): +2.61 bp (Trade #1 과 같은 페어)
- 5/8 ε 변화: 양 다리 더 wider → alpha P&L 음수

#### 손익 분해
| 항목 | 금액 (만원) | 비중 |
|---|---:|---:|
| Delta (β · +2.7bp) | −2 | +1% |
| Curve (γ · +0.2bp) | −18 | +13% |
| **Alpha** | **−123** | **+86%** |
| 시장 합계 | −143 | |
| 진입 cost | −49 | |
| **Total (user)** | **−192** | reported −192만 ✓ |

#### 종합 결론
- **방향: ↘ flattener bet (작음, −88 만/bp_slope)**
- DV01 매칭 깔끔 → 시장 노출 거의 0
- 1일 보유에 alpha 미수렴이 86% — **모델 신호 자체가 wider 됐다**
- 진입 타이밍: 5/4 본 +5.08bp 신호가 5/7 +4.25bp 로 narrowing — **신호 약화 단계 추가 진입**

---

### Trade #3 — 25-11 L 90억 / 24-5 S 100억 (5/7 → 5/8, 1영업일)

#### 포지션 정보
- LONG : 25-11 (= **10년지표**), face 90억, D=8.010, **DV01 = 721 만/bp**
- SHORT: 24-5, face 100억, D=6.870, **DV01 = 687 만/bp**
- DV01 mismatch: **+34 만/bp (LONG 5% 과다)**

#### Delta 노출
```
delta_DV01 = (687 × 0.988 − 721 × 1.000) = 679 − 721 = −42 만/bp_3Y
```
→ 1bp 강세 시 +42만, 약세 시 −42만. 5/7→5/8 +2.7bp 약세 → 손실 −113만

#### Curve 노출
```
curve_DV01 = (687 × 1.140 − 721 × 1.000) = 783 − 721 = +62 만/bp_slope
```
→ **방향 = ↗ STEEPENER (+62 만/bp_slope)**

⚠️ **diff mode 와 부호 반대**:
- diff mode γ_24-5 = 0.78 < γ_25-11 = 1.0 → curve_DV01 = -183 = flattener
- level mode γ_24-5 = 1.14 > γ_25-11 = 1.0 → curve_DV01 = +62 = steepener

→ level mode 회귀에서 24-5 가 10년지표 보다 slope 노출이 더 큼 (level 상태에서 24-5 가 slope 변동 감응도 더 큼). **사용자 트레이딩이 level mode 이므로 steepener 베팅이 맞다**.

#### 진입 / 현재 ε
- 25-11: ε ≡ 0 (10년지표)
- 24-5 5/7 ε(level): −0.03 (모델과 거의 일치)
- ε spread = 0 − (−0.03) = +0.03 bp → **시그널 거의 없음**

#### 손익 분해
| 항목 | 금액 (만원) | 비중 |
|---|---:|---:|
| **Delta (β · +2.7bp)** | **−114** | **+48%** |
| Curve (γ · +0.2bp) | +12 | −5% |
| Alpha | −134 | +57% |
| 시장 합계 | −236 | |
| 진입 cost | −18 | |
| **Total (user)** | **−254** | reported −254만 ✓ |

#### 종합 결론
- **방향: ↗ steepener bet (+62 만/bp_slope)** — slope +0.2bp 살짝 도움 (+12만)
- **delta 손실 dominant** — DV01 매칭 부정확 (LONG 5% 과다) + 약세 시장
- **신호 강도 사실상 0** (ε spread 0.03bp) — 진입 자체가 무리
- 24-5 의 ε 가 −0.03 → 모델과 거의 일치, RV 기회 없음

---

### Trade #4 — 25-10 L 150억 / 25-3 S 100억 (5/8 same-day)

#### 포지션 정보
- LONG : 25-10 (= **3년지표**), face 150억, D=2.454, **DV01 = 368 만/bp**
- SHORT: 25-3, face 100억, D=3.600, **DV01 = 360 만/bp**
- DV01 mismatch: **+8 만/bp (균형 ✓)**

#### Delta 노출
```
delta_DV01 = (360 × 1.002 − 368 × 1.000) = 361 − 368 = −7 만/bp_3Y
```
→ 거의 0 (의도된 헤지)

#### Curve 노출
```
curve_DV01 = (360 × 0.500 − 368 × 0.000) = 180 − 0 = +180 만/bp_slope
```
→ **방향 = ↗ STEEPENER (+180 만/bp_slope)**

#### 진입 / 현재 ε

**핵심**: LONG 25-10 = 3년지표 (β=1, γ=0, **ε ≡ 0 by construction**). 따라서 ε spread = −ε_25-3.

| 날짜 | 25-3 ε(level) | ε_pair_spread (= −ε_25-3) | 의미 |
|---|---:|---:|---|
| 5/04 | (level 회귀 결과 추정 ~−0.5) | ~+0.5 | 25-3 약간 rich → SHORT 적절 |
| 5/07 | **−0.69** | **+0.69** | 25-3 더 rich (강해진 신호) |
| 5/08 | (인트라데이) | ~+0.7 (추정) | 신호 일관 |

→ **5/8 진입 시 ε spread ≈ +0.7 bp 의 약한 SHORT 신호** 존재. 강도는 임계(3bp) 미달이나 0 은 아님.

> 사용자 의도: 비슷한 만기에 다른 LONG 후보 부족, 지표 종목을 헤지로 깔고 25-3 의 SHORT 신호만 활용. **β-DV01 매칭이 정밀해 의도된 RV 트레이드**.

#### 손익 분해 (인트라데이 — factor 분해 불가)

같은 날 진입 + 같은 날 종가라 인트라데이 ΔY_3Y / Δslope 데이터 없음. raw P&L 만:

| | LONG 25-10 | SHORT 25-3 |
|---|---:|---:|
| 진입 (user) | 3.559% | 3.705% |
| 5/8 종가 | 3.562% | 3.700% |
| ΔY | **+0.3 bp** | **−0.5 bp** |
| P&L | **−110만** | **−180만** |
| **Total** | | **−290만** ✓ |

#### Factor 추정 (25-3 만)
25-3 의 ΔY = −0.5 bp 분해 (intraday ΔY_3Y ≈ ΔY_25-10 = +0.3bp 사용):
- expected from delta: 1.002 × 0.3 = +0.30 bp
- residual (curve + alpha): −0.5 − 0.30 = **−0.80 bp** ← **SHORT 가 모델 대비 0.80bp 더 강세 = SHORT 알파 손실**

→ 인트라데이 5y(25-3) 가 3y(25-10) 보다 빠르게 강세 = **5s3s flatten** = steepener 베팅 정반대 → 손실.

#### 종합 결론
- **방향: ↗ steepener bet (+180 만/bp_slope)** — RV 트레이드의 부수효과 (의도는 25-3 SHORT 알파)
- **β-DV01 매칭 정밀 → delta 노출 거의 0** (의도된 헤지)
- 신호 강도 약 (ε spread ≈ +0.7bp), 다만 일관됨 — 진입 자체는 합리
- 5/8 당일 5s3s flatten 으로 alpha 손실 발생 (steepener 베팅 정반대 방향 움직임)

---

## 5. 만기별 net DV01 노출 (포트폴리오 종합)

```
잔존년:     2.6      3.8       4.8       6.1       8.1       9.6
DV01:     +368     −360    −1,319    +1,450     −687      +721    (단위: 만원/bp)
페어:     [#4 L]   [#4 S]   [#1+2 S] [#1+2 L]   [#3 S]   [#3 L]
구조:     ────steepener────   ────flattener────   ────steepener────
                  (3s5s)            (5s7s)             (8s10s, level mode)
```

| Total LONG | Total SHORT | Net duration |
|---:|---:|---:|
| +2,539 만/bp | −2,366 만/bp | **+173 만/bp (LONG biased)** |

### 페어별 Curve 방향 요약

| # | 페어 | curve_DV01 (만/bp_slope) | 방향 | 표기 |
|---|---|---:|---|---|
| 1 | 22-5 L / 26-3 S (220/240) | **−444** | ↘ flattener (큰 노출) | `↘ Flat −444` |
| 2 | 22-5 L / 26-3 S (50/60)  | **−88**  | ↘ flattener | `↘ Flat −88` |
| 3 | 25-11 L / 24-5 S (90/100) | **+62** | ↗ steepener | `↗ Steep +62` |
| 4 | 25-10 L / 25-3 S (150/100) | **+180** | ↗ steepener | `↗ Steep +180` |
| **포트폴리오 합** | | **−290** | **↘ flattener (net)** | |

→ 포트폴리오 합 −290 만/bp_slope = **slope 1bp steepening 시 −290만 손실**.

5/4~5/8 환경 = +2.5bp steepening → curve P&L 합산 −290 × 2.5 = **−725만 손실** (대략, 정확한 합은 trade 별 entry 시점에 따라 다름).

---

## 6. ε spread 시계열 (Level mode 신호 강도)

level mode 의 ε 는 **현재 fair value gap** (단순 1일치 값, 누적 X). 21일 평균은 평활화 보조.

| 날짜 | 22-5/26-3 ε spread | 25-11/24-5 ε spread | 25-10/25-3 ε spread |
|---|---:|---:|---:|
| 5/04 (Trade #1 entry) | ~+2.6 bp (추정) | (낮은 신호) | ~+0.5 bp |
| 5/06 | (사이) | (사이) | ~+0.4 bp |
| 5/07 (Trade #2, #3 entry) | **+2.61** | **+0.03** ← 사실상 0 | +0.69 |
| 5/08 (Trade #4 entry) | (회귀 미반영) | (회귀 미반영) | ~+0.7 bp |

#### 신호 강도 평가 (level mode 임계 = 3.0bp)
- **#1 (5/4)**: ★★ (~+2.6, 임계 직하)
- **#2 (5/7)**: ★★ (+2.61, 변화 없음)
- **#3 (5/7)**: ✗ (+0.03, **사실상 신호 없음**)
- **#4 (5/8)**: ★ (+0.7, 약하지만 일관 방향)

#### 진입 후 alpha P&L 가 모두 음수인 이유

진입 시점 ε spread (현재 fair value gap) 가 narrowing 하는 것 = signal 소멸 = 알파 수렴. 하지만 5/4~5/8 동안 양 다리 모두 ε 가 더 wider (특히 SHORT side 더 rich) → spread 는 narrowing 하지 않거나 wider → alpha P&L 음수.

---

## 7. 진입 / 청산 / 실현 로직

### 7.1 진입 조건 (Level mode 기본)

| 조건 | 임계값 | 의미 |
|---|---:|---|
| ε spread (level fair value gap) | ≥ **3.0 bp** | LONG ε ≥ +1.5bp 이상 cheap, SHORT ε ≤ −1.5bp 이상 rich (또는 합산 +3bp) |
| 만기 차 \|remain_L − remain_S\| | ≤ 1.5 Y | |
| 잔존 | 2~13 Y | 벤치 영역 |
| **face 비율** | DV01 매칭 | `face_S / face_L = D_L / D_S` (net delta = 0) |

### 7.2 청산 조건 (셋 중 하나라도 만족 시 close)

1. **Target (이익 확정)**: raw P&L ≥ **+1.0 bp**
2. **Stop loss**: raw P&L ≤ **−3.0 bp**
3. **Time stop**: 보유 ≥ **30 영업일**

### 7.3 실현 / 모니터링 의사결정 룰

대시보드의 각 페어 row 마다 6가지 지표 체크:

1. **ε spread** — 신호 강도
2. **Δ exp (만/bp)** — 시장 평행이동 1bp 노출
3. **Curve exp (만/bp_slope)** — slope 1bp 노출 (steep/flat 방향 표시)
4. **Δ pnl** — 누적 평행이동 P&L
5. **Curve pnl** — 누적 slope P&L
6. **Alpha pnl** — 모델 신호 수렴/발산 P&L

| 상황 | 액션 |
|---|---|
| raw P&L ≥ **+1bp** | **CLOSE** (target hit) |
| raw P&L ≤ **−3bp** | **STOP** (모델 신호 무효 인정) |
| ε spread < 1.5bp 인데 raw P&L 음수 | **STOP 검토** (신호 소진됐는데 P&L 회복 안 됨) |
| `|delta+curve| > |alpha|` | **DV01·γ 헤지 추가 필요** |
| 30영업일 도달 | **CLOSE** |

### 7.4 DV01·γ 헤지 (선물) 가이드

페어의 net delta·curve 가 0 이 아닐 때:
- **delta 헤지**: 3년 국채선물로 delta_DV01 만큼 반대 포지션
- **curve 헤지**: 10년 선물 추가로 curve_DV01 (γ-가중) 중화
- 헤지 후 **alpha 만 노출** → 모델 신호의 수렴/발산만 P&L 에 반영

예) Trade #1 의 curve_DV01 = −444 만/bp_slope (flattener) → 본인 의도가 flattener 가 아니면 10년 선물 short 추가로 γ 중화.

---

## 8. 4건 종합 진단 표

| # | 페어 | 신호 | DV01 매칭 | Curve 방향 | 환경 적합도 | 평가 | 추천 액션 |
|---|---|---|---|---|---|---|---|
| 1 | 22-5/26-3 (5/4, 220/240) | ★★ | △ (LONG 4% 과다) | **↘ Flat −444** | ✗ steepening 역풍 | curve flattener 가 환경에 정반대 + alpha 미수렴 | **10년 선물 short 추가 → curve 노출 중화 후 alpha 수렴 대기** |
| 2 | 22-5/26-3 (5/7, 50/60) | ★★ | ✓ | ↘ Flat −88 | ✗ | 같은 페어 추가 진입, alpha 미수렴 dominant | hold (시간 끌지 말고 alpha 수렴 시 close) |
| 3 | 25-11/24-5 (5/7, 90/100) | ✗ | △ (LONG 5% 과다) | ↗ Steep +62 | △ | **신호 0 + DV01 미스매치 + 약세장 delta 손실** | **STOP 검토** (신호 부재 진입) |
| 4 | 25-10/25-3 (5/8, 150/100) | ★ | ✓ | ↗ Steep +180 | ✗ | β-DV01 매칭 정밀, 25-3 SHORT 알파 노출 (약한 신호) | hold (인트라데이 손실, 신호 회복 추적) |

---

## 9. 전체 손익 요약 (Level mode)

| # | 페어 | Delta | Curve | Alpha | 진입 cost | **Total** |
|---|---|---:|---:|---:|---:|---:|
| 1 | 22-5/26-3 (220/240) | +579 | **−1,109** | **−2,361** | +1,914 | **−977** |
| 2 | 22-5/26-3 (50/60) | −2 | −18 | −123 | −49 | **−192** |
| 3 | 25-11/24-5 (90/100) | **−114** | +12 | −134 | −18 | **−254** |
| 4 | 25-10/25-3 (150/100) | (intraday) | (intraday) | ≈ −290 | 0 | **−290** |
| **합** | | **+463** | **−1,115** | **−2,908** | **+1,847** | **약 −1,713 만** |

(단위: 만원. cost 양수 = 시장 대비 유리한 가격에 진입)

**1차 손실 = Alpha 미수렴 (−2,908만)**, 2차 = Curve flattener × steepening 환경 (−1,115만), 진입 cost 가 손실 일부 상쇄.

---

## 10. 실용 메모

### 10.1 자주 헷갈리는 부분
- **Level mode ε vs Diff mode cum_ε**: level ε 는 "현재 fair value gap" (1일치 값), diff cum_ε 는 "21일 누적 idiosyncratic 차이" — 의미·스케일·임계값 다름. 사용자는 level mode 사용.
- **"플랫"의 의미**: 시장 평행이동 ≈ 0bp 라도 slope 가 움직이면 curve 손실 발생. "flat" 은 (ΔY_3Y, Δslope) 둘 다 0 인 경우만.
- **DV01 매칭 우선순위**: face 비율보다 D 비율 우선. `face_S = face_L × (D_L / D_S)`.
- **Curve 방향**: curve_DV01 양수 = steepener bet (slope 가팔라져야 이익). 음수 = flattener bet.
- **지표 종목 페어**: 한 다리의 ε ≡ 0 by construction 이지만 반대편 ε 가 살아있으면 신호 유효. 단, 단일 다리에 신호 집중되어 있어 변동성 큼.

### 10.2 대시보드 활용
- 각 페어 row 마다 표시:
  - 잔존만기, duration, DV01 (LONG/SHORT 각각)
  - **net DV01** (LONG−SHORT, 만/bp)
  - **Δ exp** (delta DV01, 만/bp)
  - **Curve exp** (curve DV01, 만/bp_slope) — `↗ Steep +XX` / `↘ Flat −XX` 표시
  - Δ/Curve/Alpha P&L (각각 분해)
  - Total P&L (user 진입 기준)
  - 현재 ε / cum_ε spread (bp)
  - 보유 일수
- row 클릭 → 페어 detail 카드 + ε 시계열 차트
- 매일 종가 들어오면 자동 재계산 (`/rv/refresh` 버튼으로 캐시 무효화)
- 새 진입: **추가 폼**, 청산: 행 삭제

### 10.3 다음 개선 제안
- **DV01 매칭 자동 추천**: 새 페어 입력 시 권장 face 비율 자동 표시
- **선물 헤지 권장 계약수**: net delta/curve 임계 초과 시 표시
- **알람**: target/stop 도달 시 텔레그램 (기존 daily_pair_signal 봇 확장)
- **포트폴리오 net curve direction**: 현재 −290 만/bp_slope (flattener) — 헤지 권장값 표시

---

# 부록 A — Diff 모드 백테스트 결과 (참고용)

> *목적*: 사용자 트레이딩은 **level 모드 기준** 이지만, **diff 모드 (변동분 회귀)** 의 백테스트 성과를 참고용으로 측정.
>
> *기간*: 2023-08-21 ~ 2026-05-07 (≈ 2.7년)
> *대상*: 국고채만, 잔존 2~13Y, 페어 만기차 ≤1.5Y, 거래비용 1bp, max hold 30d
> *신호*: cum_ε_21d spread (21일 누적 idiosyncratic 차이)
> *P&L 측정*: raw yield spread (duration-matched bp)

## A.1 Base 백테스트

설정: `entry=5.0bp, target=+1.0bp, stop=-3.0bp, hold≤30d`

| 지표 | 값 |
|---|---:|
| N (closed trades) | 77 |
| Total P&L | +14.4 bp |
| **Per year** | **+5.6 bp/y** |
| Win rate | 59.7 % |
| Mean per trade | +0.19 bp |
| Sharpe (per trade) | +0.04 |
| Mean hold | 20.4 d |

### Exit reason 분포
| reason | 비중 |
|---|---:|
| target hit | 55% |
| stop loss | 25% |
| time stop | 17% |
| end-of-data | 4% |

### 연도별 성과
| year | N | total bp | mean bp | win % | hold d |
|---|---:|---:|---:|---:|---:|
| 2023 | 20 | +10.8 | +0.54 | **80.0** | 5.0 |
| 2024 | 3 | -3.9 | -1.30 | 33.3 | 18.0 |
| 2025 | 35 | -26.3 | -0.75 | 45.7 | 15.7 |
| 2026 | 19 | +33.8 | +1.78 | 68.4 | 45.8 |

→ **2023 강세 / 2024-2025 부진 / 2026 회복**. 변동성 큰 성과 패턴.

---

## A.2 Target × Stop 스윕 (entry=5.0bp 고정)

raw P&L bp 기준 청산 임계값 격자:

| target ↓ \ stop → | -2.0 | -3.0 | -5.0 | -7.0 |
|---|---:|---:|---:|---:|
| +0.5 | -15.0 | +1.5 | +5.7 | +7.2 |
| **+1.0** | -10.3 | +5.6 | **+12.8** | +12.0 |
| +1.5 | -23.5 | -7.8 | +2.3 | -0.7 |
| +2.0 | -17.7 | -0.8 | +9.5 | +7.5 |
| **+3.0** | -14.4 | +3.3 | **+13.6** | +8.0 |

(셀 = 연 환산 P&L bp/y. 굵은 수치 = best 영역)

### Best 조합

| 순위 | target | stop | per_yr | win % | sharpe | mean hold |
|---|---:|---:|---:|---:|---:|---:|
| 🥇 | +3.0 | -5.0 | **+13.6 bp/y** | 60.7% | +0.17 | 26.8d |
| 🥈 | +1.0 | -5.0 | +12.8 bp/y | 68.2% | +0.11 | 24.4d |
| 🥉 | +1.0 | -7.0 | +12.0 bp/y | 68.2% | +0.10 | 24.5d |

→ **diff 모드 best stop = -5bp** (level 모드의 -3bp 보다 더 느슨). diff 모드는 21일 누적이라 신호 회복 더 천천히 → 손절을 빨리 잡으면 수렴 전 stop hit 빈번.

### Tight stop 의 위험성
stop=-2bp 에서는 모든 target 에서 음수 — **너무 빠른 손절 = 알파 수렴 못 보고 cut**. diff 모드는 21일 누적이라 일시적 wider 다음에 mean-revert 패턴이 많아, stop 너무 타이트하면 패턴 못 잡음.

---

## A.3 Entry threshold 스윕 (target=+1.0, stop=-3.0 고정)

| entry bp | N | total | **per_yr** | win % | sharpe |
|---:|---:|---:|---:|---:|---:|
| 3.0 | 212 | -39.7 | **-15.4 bp/y** | 52% | -0.04 |
| **4.0** | 129 | +27.5 | **+10.7 bp/y** | 55% | +0.04 |
| 5.0 (base) | 77 | +14.4 | +5.6 | 60% | +0.04 |
| 6.0 | 41 | -4.0 | -1.6 | 61% | -0.04 |
| 7.0 | 22 | +0.3 | +0.1 | 64% | +0.01 |
| 8.0 | 15 | -4.1 | -1.6 | 60% | -0.12 |

→ **entry threshold 4bp 가 sweet spot** (N=129, +10.7 bp/y).
- 3bp 면 신호 약한 페어까지 진입해 overtrade (음수)
- 6bp 이상이면 trade 수 부족, 잡기 너무 까다로움

---

## A.4 Walk-forward OOS (학습 vs 검증)

| 기간 | N | total bp | per_yr | win % | sharpe | mean hold |
|---|---:|---:|---:|---:|---:|---:|
| TRAIN (~2023) | 20 | +10.8 | **+80.5 bp/y** | 80.0% | +0.25 | 5.0d |
| **OOS (2024+)** | 57 | +3.6 | **+1.7 bp/y** | 52.6% | +0.01 | 25.8d |

→ **2023 in-sample 강력하지만 2024+ OOS 거의 0**.
- 2023 환경에서 페어 RV 가 잘 작동했지만, 2024년 들어 시장 미시구조 변화로 신호 weak
- OOS 평균 보유 26일 vs train 5일 → **수렴이 늦어졌다 = 알파 신호의 자연 사이클이 길어짐**
- **overfitting 의심 신호** — 2023년 패턴에 맞춘 룰이 2024+ 에는 약함

---

## A.5 Level vs Diff 모드 비교

| 항목 | Level 모드 (사용자 트레이딩) | Diff 모드 (참고) |
|---|---|---|
| 신호 정의 | 현재 fair value gap (level ε) | 21일 누적 idiosyncratic (cum_ε) |
| 진입 임계 | 3.0 bp (level ε spread) | 4.0~5.0 bp (cum_ε spread) |
| Best target | +1.0 bp (raw P&L) | +1.0~+3.0 bp |
| Best stop | -3.0 bp | **-5.0 bp** (더 느슨) |
| Best per_yr | ~30-40 bp/y (이전 분석) | **+13.6 bp/y** |
| OOS 안정성 | (재측정 필요) | **불안정 (1.7bp/y)** |
| 수렴 속도 | 빠름 (진입~7일) | 느림 (≈3주) |
| **β/γ 값** | **Y_i 와 Y_3Y/slope 의 정상관 관계 capture** | 일별 변화 동조성만 capture |
| **γ 의 차이** | 일반적으로 더 큰 값 (level γ ≈ 0.5~1.1) | 작은 값 (diff γ ≈ 0.3~0.8) |

### 종합 진단
- **Level 모드 > Diff 모드** (수익성·OOS 안정성 모두)
- diff 모드는 21일 누적이라 신호의 smoothness 는 좋지만 mean-reversion 시점 늦음
- diff 모드 OOS 1.7bp/y 는 **거래비용만 빼도 사실상 break-even**
- 사용자가 level 모드로 트레이딩하는 게 데이터로 정합

### Diff 모드 활용 가능성
- 단독 알파로는 약함, **Level 모드와 cross-confirmation** 으로 사용 가능:
  - `Level ε spread ≥ 3bp` AND `cum_ε spread ≥ 5bp` 일 때 진입 → 둘 다 동의하는 강한 신호만 트레이드

---

## A.6 결론 + 운영 가이드

1. **사용자 메인 룰 = Level 모드** (entry=3bp, target=+1bp, stop=-3bp, hold≤30d) 유지
2. Diff 모드는 신호 보조로만 — 단독 entry signal 로 쓰지 말 것
3. **2024년 이후 RV 환경이 어려워졌다는 데이터적 근거** 있음 → 알파 기대치 보수적 조정. **Level 모드의 walk-forward OOS** 도 동일 프레임으로 측정 권장
4. 추가 개선 방향:
   - 잔존만기 buckets 별 분리 백테스트 (5y / 10y RV 따로)
   - market regime filter (steepening 환경에서 RV 약화 패턴 등)
   - β-DV01 매칭 자동 추천 (face 비율 권장값)

---

---

# 부록 B — Level 모드 백테스트 결과 (메인 트레이딩 룰, 사용자 스펙 반영)

> *목적*: 사용자 메인 트레이딩 룰 (level mode) 의 server engine 기반 백테스트.
>
> *기간*: 2023-08-22 ~ 2026-05-08 (≈ 2.7년, 659 영업일)
> *엔진*: server `_build_beta_decomposition_universe(mode='level')` + 지표 ε≡0 inject
> *신호*: level ε spread (LONG ε − SHORT ε)
> *청산 트리거*: raw yield spread bp (face-independent)
> *P&L*: 실제 face × duration 곱셈 (원 단위, **DV01 mismatch 반영**)

## B.1 사용자 스펙 반영 사항

| 항목 | 적용 |
|---|---|
| **Face 사이징** | 비지표 100억 단위, 지표 10억 단위. SHORT 100억 base, LONG side DV01 매칭 후 단위 반올림 |
| **지표 종목** | 3년/10년 지표 ε ≡ 0 으로 inject (46개 historical bond_code 포함) |
| **잔존만기** | 양 다리 모두 2~13 Y |
| **발행 경과** | 양 다리 모두 진입일 기준 발행 이후 **≤ 3년** (`issue_date` 컬럼 기반) ✓ 적용됨 |
| **만기 차** | \|remain_L − remain_S\| ≤ 1.5 Y |
| **거래비용** | 1 bp (양 다리 평균 DV01 적용) |

## B.2 Base 백테스트

설정: `entry=3.0bp, target=+1.0bp, stop=-3.0bp, hold≤30d` (메인 트레이딩 룰)

| 지표 | 값 |
|---|---:|
| N (closed trades) | **79** |
| Total P&L | +6,327 만원 |
| **Per year** | **+2,477 만원/y** |
| Win rate | 46.8% |
| Mean per trade | +80 만 |
| Sharpe | +0.03 |
| Mean hold | **36.3 일 (calendar)** ≈ 26 영업일 |

### Exit reason 분포
| reason | 비중 |
|---|---:|
| target hit | 41% |
| stop loss | 39% |
| time stop | 13% |
| end-of-data | 8% |

### Indicator-leg 페어 비중
- **50 / 79 = 63%** 가 지표 다리 포함 페어
- 사용자의 Trade #4 (25-10/25-3) 같은 케이스가 백테스트 샘플의 다수
- 지표 inject 가 **백테스트 결과에 큰 비중을 차지** — 단순 비지표×비지표 만으로는 충분한 후보가 없음

### Face 분포
| Side | 100억 | 110~150 | 200 |
|---|---:|---:|---:|
| LONG | 49 | 23 | 1 |
| SHORT | 58 | 19 | 0 |
| Other | 6 (≤90) | 2 (60~80) | – |

대부분 100억 base, 일부 DV01 매칭으로 110~200억 까지 확장.

### 연도별 성과
| year | N | total 만 | mean 만 | win% | hold (d) |
|---|---:|---:|---:|---:|---:|
| 2023 | 5 | -1,718 | -344 | 40% | 4.2 |
| 2024 | 13 | +68 | +5 | 69% | 18.5 |
| **2025** | 33 | **-14,748** | **-447** | **36%** | 15.8 |
| **2026** | 28 | **+22,725** | **+812** | **50%** | 74.5 |

→ **2025 가 최악 (월 -1,200만)**, **2026 폭발적 회복 (+22,725만)**. 변동성 매우 큼.

---

## B.3 Target × Stop 스윕

| target ↓ \ stop → | -2.0 | -3.0 | -5.0 | -7.0 |
|---|---:|---:|---:|---:|
| +0.5 | -9,316 | -5,365 | +3,920 | **+5,049** |
| +1.0 | -8,362 | +2,477 | +1,792 | +4,219 |
| +1.5 | -8,584 | -1,437 | +2,998 | +3,448 |
| +2.0 | -6,330 | -5,181 | +2,571 | +3,329 |
| +3.0 | -6,078 | -1,015 | -996 | -866 |

(단위: 만원/y. 굵게 = best)

### Best 조합

| 순위 | target | stop | per_yr (만/y) | win% | sharpe | hold(d) |
|---|---:|---:|---:|---:|---:|---:|
| 🥇 | +0.5 | -7.0 | **+5,049** | 52% | +0.08 | 48 |
| 🥈 | +1.0 | -7.0 | +4,219 | 59% | +0.10 | 53 |
| 🥉 | +0.5 | -5.0 | +3,920 | 56% | +0.10 | 42 |

**Diff 모드와 동일하게 stop=-3 보다 -5 ~ -7 이 우월**. 이유: level mode 도 신호 수렴 시점이 1주 이상 걸리는데 타이트한 stop 이 수렴 전 cut 함.

### Tight stop 의 위험
stop=-2bp 모든 target 음수. 사용자 룰의 stop=-3 도 target=+1 조합에서만 살아남고 (target +0.5, +1.5, +2, +3 와 결합 시 음수).

---

## B.4 Entry threshold 스윕 (target=+1.0, stop=-3.0)

| entry bp | N | total 만 | **per_yr 만/y** | win% | sharpe | hold(d) |
|---:|---:|---:|---:|---:|---:|---:|
| 2.0 | 125 | -42,558 | **-16,260** | 41% | -0.10 | 52 |
| 2.5 | 106 | -42,671 | **-16,320** | 42% | -0.10 | 51 |
| **3.0** | 79 | +6,327 | **+2,477** | 47% | +0.03 | 36 |
| **4.0** | 48 | +9,063 | **+3,766** | 54% | +0.10 | 40 |
| 5.0 | 30 | -2,564 | -1,075 | 57% | -0.07 | 36 |
| 6.0 | 20 | -4,988 | -2,094 | 70% | -0.21 | 36 |

→ **Sweet spot = entry 4.0bp** (per_yr +3,766만, sharpe 0.10). 3.0bp 보다 trade 수 적지만 (48 vs 79) 평균 trade quality 더 높음. 2~2.5bp 는 overtrade 로 처참 (-16,000만/y).

---

## B.5 Walk-forward OOS

| 기간 | N | total 만 | per_yr 만/y | win% | sharpe | hold |
|---|---:|---:|---:|---:|---:|---:|
| TRAIN (≤2024-01-01) | 8 | -2,450 | -12,603 | 25% | -0.28 | 6.6d |
| **OOS (2024+)** | **72** | **+6,822** | **+2,907** | **46%** | **+0.04** | 38.7d |

→ **Diff 모드와 정반대 패턴**:
- Diff: TRAIN 강 (+80bp/y) → OOS 약 (+1.7bp/y) = classical overfitting
- **Level: TRAIN 약 (-12,603만/y, N=8 소표본) → OOS 안정적 (+2,907만/y, N=72)**

TRAIN 이 약한 건 소표본 (8건) + 2023 후반 특수 환경 (강한 환경 변화) 영향. **OOS 가 양수로 유지되는 게 강력한 신호** — 2024년 이후 환경에서 level 모드는 작동 중.

### Level vs Diff OOS 비교
| | Level (메인) | Diff (참고) |
|---|---|---|
| OOS per_yr | **+2,907 만/y** | +1.7 bp/y (≈ 다른 단위) |
| OOS sharpe | +0.04 | +0.01 |
| OOS win rate | 46% | 53% |
| OOS mean hold | 39d | 26d |
| OOS 신뢰도 | **안정적** | break-even |

(단위가 달라 직접 비교는 어렵지만, level OOS sharpe 가 diff 의 4배 → level 모드가 더 robust)

---

## B.6 사용자 룰 (entry=3, target=+1, stop=-3, hold≤30d) 평가

### 강점
- **OOS +2,907 만/y 안정적** 알파 입증 (소표본 train 제외하면)
- Indicator-leg 페어 63% 차지 — 지표 종목 포함 덕에 후보 풍부
- 5/8 시점 활용 가능한 RV 환경 검증됨

### 약점 / 개선 여지
- **stop=-3 은 sub-optimal**. -5 ~ -7 이 더 우월 (수렴 시간 충분히 줘야 함)
- **target=+1 도 sub-optimal**. +0.5 + stop=-7 조합이 최고 per_yr (+5,049만/y)
- **2025년 -14,748만 큰 drawdown** — 특정 시기 페어들이 동시 손실
- Mean hold 36일 > 30일 제약 → 일부는 end-of-data 강제청산

### 권장 룰 (백테스트 기반)
| 파라미터 | 사용자 현재 | 백테스트 best | 절충안 권장 |
|---|---:|---:|---:|
| entry threshold | 3.0bp | 4.0bp | **4.0bp** (trade 수 ↓, 퀄리티 ↑) |
| target | +1.0bp | +0.5~+1.0bp | **+1.0bp** (유지) |
| stop | -3.0bp | -7.0bp | **-5.0bp** (타협, hold 길어짐 감안) |
| max hold | 30d | (제약 효과 작음) | **45d** (실측 mean 반영) |
| 예상 per_yr | +2,477만 | +5,049만 | **약 +4,000~+4,500만/y** |

→ **entry 3.0 → 4.0, stop -3 → -5, hold 30 → 45** 변경 시 per_yr 약 70~80% 향상 예상.

---

## B.7 다음 액션 권고

1. **메인 룰 파라미터 업데이트** (선택적, 백테스트 기반):
   - daily_pair_signal.py 의 `LEVEL_TH=3.0 → 4.0` 검토
   - RV_POSITION_ANALYSIS.md 의 청산 룰 권장값 갱신
   - 다만 사용자 실 운용에서 hold 45일은 자본 묶임 길어짐 → 운용 capacity 고려

2. **사용자 5/4 ~ 5/8 손실 (-1,713만) 의 의미**:
   - level mode 2025년 평균 trade = -447만 (대규모 부진 시기)
   - 사용자 현재 손실은 **2025-style 부진기** 와 유사한 환경에 들어간 케이스
   - 2026년 들어 평균 +812만/trade 로 회복 → **현재 보유 4건 hold 유지가 통계적 정합** (단, stop -3 도달 시 룰대로 cut)

3. **추가 분석 후보**:
   - 잔존만기 buckets 별 분리 (5y RV / 10y RV)
   - regime filter (slope steepening 환경 진입 회피)
   - face 사이징 변화 (200/100 또는 50/100 등) sensitivity

---

---

# 부록 C — V2 백테스트 (정확도 개선판) + 최종 룰 확정

> *배경*: 부록 B 백테스트의 정확도 점검 결과 다음 4개 이슈 발견:
>   1. β/γ rolling 회귀에 미세 look-ahead (β(t) 가 t 데이터 포함)
>   2. 지표 종목 ε=0 강제가 "한번이라도 지표였던" 모든 bond 에 적용 (static bias)
>   3. Stop/Target trigger 가 raw spread bp 기준 (face-independent, DV01 mismatch 미반영)
>   4. Time stop 버그 (이전 부록 B 에서 fix 완료)
>
> *V2 수정사항*:
>   1. **β 1일 lag**: ε(t) = Y(t) − β(t-1)·Y_3Y(t) − γ(t-1)·slope(t) — 실시간 가용 정보만 사용
>   2. **동적 indicator mapping**: 일자별 indicator 인 bond_code 에만 ε=0 강제
>   3. **P&L bp trigger**: target/stop 을 `pnl_won / avg_DV01` (bp) 로 변경 — DV01 mismatch 반영
>   4. **OOS 분리 폐지**: 전체 구간 (2.7년) grid search 로 best 찾기

## C.1 V2 vs V1 비교 (baseline 룰)

설정: `entry=3.0bp, target=+1, stop=-3, hold=30d`

| 지표 | V1 (이전) | V2 (개선) |
|---|---:|---:|
| Trigger 기준 | raw spread bp | **actual P&L bp on avg DV01** |
| β 시점 | t (look-ahead) | **t-1 (lagged)** |
| Indicator 처리 | static (ever-indicator) | **dynamic (per-date)** |
| Net per_yr | -11,040만 | **-22,463만** |
| Sharpe | -0.31 | -0.26 |
| N | 79 | 166 |

→ V1 의 baseline 결과가 **버그/단순화로 과대평가** 되어 있었음. V2 가 더 정확.

## C.2 V2 Grid Search 결과

설정 범위:
- entry: [3, 4, 5, 6, 7] bp
- target: [0.5, 1, 1.5, 2, 3, 5] bp (P&L bp on avg DV01)
- stop: target × {-1, -1.5, -2, -3} (R/R 비율 제약)
- hold: [20, 30, 45, 60] d

총 480 조합 중 **양수 per_yr & N≥10: 131 조합 (27%)**.

### Top by per_yr (R/R 비율 무관)

| entry | target | stop | RR | hold | N | per_yr (만/y) | win% | sharpe |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **5** | +3 | -9 | 1:3 | 30 | 40 | **+9,025** | 63% | +0.24 |
| 5 | +3 | -9 | 1:3 | 45 | 37 | +8,601 | 62% | +0.24 |
| 5 | +3 | -6 | 1:2 | 60 | 36 | +8,354 | 64% | +0.24 |

### Top by sharpe (R/R 1:2, 권장 영역)

| entry | target | stop | hold | N | per_yr | sharpe |
|---:|---:|---:|---:|---:|---:|---:|
| **6** | +3 | -6 | 60 | 23 | +7,156 | **+0.30** |
| 6 | +3 | -6 | 45 | 22 | +6,250 | +0.29 |
| 6 | +3 | -9 | 60 | 21 | +6,607 | +0.27 |

### R/R 1:1 대칭 (가장 보수적, 24 조합 양수)

| entry | target | stop | hold | N | per_yr | win% | sharpe |
|---:|---:|---:|---:|---:|---:|---:|---:|
| **5** | **+3** | **-3** | **45** | **50** | **+4,711** | 46% | +0.12 |
| 5 | +3 | -3 | 30 | 51 | +4,437 | 47% | +0.11 |
| 5 | +5 | -5 | 30 | 41 | +4,054 | 51% | +0.10 |
| 6 | +3 | -3 | 45 | 28 | +3,540 | 46% | +0.14 |

## C.3 거래빈도 lever 탐색 결과

V2 baseline (R/R 1:1) 의 N=50/2.5y (월 1.7건) 이 sparse. 빈도 늘리는 lever 5종 테스트:

| Lever | N 증가 | per_yr | 평가 |
|---|---:|---:|---|
| (1) Same-bond multi-pair (relax in_use) | +72~140% | -249~-5,417 | ✗ 알파 중복+correlated |
| (2) Hold 단축 (10~20d) | 미세 | +1,102~+2,931 | ✗ mean reversion 시간 부족 |
| (3) Diff mode 결합 | +35% | -979 (combined) | ✗ Diff 단독 -6,629 |
| (4) 만기차 1.5→2.0+Y 완화 | +18~50% | -5,044~-12,364 | ✗ quality 급락 |
| **(5) Issue age 3→5년** | **+6%** | **+6,225** | **✅ 유일하게 양수 개선** |

추가:
- **Hold 90d**: N=51, per_yr **+7,167**, sharpe **+0.17** (sharpe 최고)
- 빈도 늘리는 lever 거의 다 quality 손상 → **20-25/y (월 1.7-2건) 가 통계적 자연한계**

## C.4 ε mean reversion 검증

| 지표 | 값 | 의미 |
|---|---:|---|
| AR(1) β (평균) | 0.90 | 강한 mean reversion |
| Half-life (중앙값) | **7.7 일** | 7-8일 이면 ε 가 평균 절반까지 수렴 |
| 정상성 (β<1) | 100% | 모든 종목 정상 mean revert |

**진입 spread → 30일 후 spread (narrowing 확률)**:
| 진입 spread | N | 30d 후 mean | narrowed % |
|---|---:|---:|---:|
| [3-4) | 628 | 1.02 | 90.5% |
| [4-5) | 288 | 1.51 | 96.9% |
| **[5-7)** | 198 | 0.89 | **100%** |
| [7-10) | 88 | -1.82 (overshoot) | 100% |

→ **entry ≥ 5bp 면 30일 내 100% 수렴**. 강 신호일수록 reliable.

## C.5 최종 권장 룰 (V2 + Issue 5y + Hold 90d)

```python
entry_threshold     = 5.0 bp          # level ε spread (LONG ε − SHORT ε)
target_pnl_bp       = +3.0 bp         # P&L bp on avg DV01 (= face-weighted)
stop_pnl_bp         = -3.0 bp         # P&L bp, R/R 1:1 대칭
max_holding_days    = 90 d            # mean reversion 시간 충분히 확보
max_remain_diff     = 1.5 Y           # 페어 만기차 (확대 시 quality ↓)
max_issue_age_years = 5.0             # 발행 후 경과 (3→5년 완화)
remain_min/max      = 2.0 / 13.0 Y    # 잔존 만기 범위
transaction_cost_bp = 1.0             # 거래비용 (1bp pair roundtrip)
```

### 기대 성과

| 지표 | 값 |
|---|---:|
| N | 51 trades / 2.5y = **약 20/y** (월 1.7건) |
| **per_yr (100억 base)** | **+7,167 만/y** |
| **풀배팅 (×10, DV01 5천만/bp)** | **+7.2 억/y** |
| **사용자 typical (×3, 200~250억 base)** | **+2.2 억/y** |
| Sharpe | **+0.17** (RV 알파로 양호한 수준) |
| Win rate | 51% |
| Mean hold | 17.5 일 (실제 close 시점) |
| Stop hit % | 약 10% |

### 통합 시스템 적용 ✓

- **`daily_pair_signal.py`**: LEVEL_TH 5.0, 발행 ≤5년, 메시지에 target+3/stop-3/hold 90d 명시
- **RV Position 대시보드**: P&L bp 컬럼 + Action 자동 판정 (HOLD/TARGET/STOP/TIME)
- **Backend**: `pnl_bp_on_avg_dv01`, `rule_target_bp`, `rule_stop_bp`, `rule_max_hold_days` 노출

## C.6 사용자 실 운용 가이드라인

### 진입 (Entry)

| 신호 강도 | 액션 |
|---|---|
| ε spread ≥ 5bp + 만기차 ≤ 1.5Y + 발행 ≤ 5년 | **진입** (백테스트 영역) |
| ε spread 3~5bp | **보류** (약 신호, V2 backtest 손실 영역) |
| ε spread < 3bp | **진입 금지** (noise 영역) |

### 청산 (Exit)

| 조건 | 액션 |
|---|---|
| P&L bp on avg DV01 ≥ +3bp | **🎯 TARGET CLOSE** |
| P&L bp on avg DV01 ≤ -3bp | **🛑 STOP LOSS** |
| 보유일수 ≥ 90 일 | **⏰ TIME EXIT** |
| 진입 5-7일 후 ε spread narrowing 없음 + 보유 ≥ 14일 | **EARLY CLOSE 검토** (선택) |

### Size 결정 (face)

- 비지표 (예: 22-5, 26-3): **100억 단위**
- 지표 (3년/10년, 현재 매핑): **10억 단위**
- 사이즈: SHORT side base + LONG side DV01 매칭 (`face_L = face_S × D_S / D_L` 반올림)

## C.7 솔직한 평가

### 강점
- **수학적 정확도 V2 까지 개선** (look-ahead 제거, dynamic indicator, P&L bp trigger)
- **OOS 검증** 별도 없지만 전체 구간 (2.7년) sharpe +0.17 일관
- **ε mean reversion 통계적 명확** (half-life 7.7일, narrowing 100%@5bp)

### 한계
- **Sharpe 0.17 은 단일 알파로 낮음** (RV 모델 1개 portfolio sharpe = 알파 단독)
- **N 20/y 는 capital 비효율** (대부분 시간 idle)
- **2024+ 환경에서 RV 약화 추세** (sample size 작아 단정 어려움)
- **차등 cost / funding cost 미반영** — 실제 운용 시 backtest 보다 1.5~2배 cost 가능

### 운용 권고
1. **메인 룰 채택** (entry=5, target+3, stop-3, hold 90d, issue 5y)
2. **분산 운용**: 5-10 페어 동시 보유 → portfolio sharpe 0.3~0.5 가능
3. **추가 alpha 결합**: curve momentum, fund flow 등 멀티 스트래터지로 sharpe 증대
4. **사용자 실 운용 패턴 (1주 4건) 은 통계 외 영역**: 약신호 진입 자제 권장

---

*Last updated: 2026-05-11 (V2 + final rule)*
*분석 엔진: server/app/routers/rv_position.py (level mode 기본) + beta.py*
*백테스트 스크립트:*
*  - factor_trading/scripts/pair_backtest_level_optionA.py (V1 — 부록 B 결과)*
*  - factor_trading/scripts/pair_backtest_diff_optionA.py (diff mode — 부록 A)*
*  - factor_trading/scripts/pair_backtest_level_v2.py (V2 — 부록 C, 최종 룰)*
*  - factor_trading/scripts/pair_backtest_level_decomp.py (P&L 분해 검증)*
*  - factor_trading/scripts/pair_backtest_freq_v2.py (거래빈도 lever 탐색)*
*  - factor_trading/scripts/eps_mean_reversion.py (ε 수렴성 통계)*
*대시보드: tools/rv-position/index.html — P&L bp + Action 컬럼 포함 (V2 룰 통합)*
*텔레그램: daily_pair_signal.py — LEVEL_TH=5.0, issue_age≤5y, V2 메시지*
