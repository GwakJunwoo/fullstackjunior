# 참고 디자인 명세 — "workbench(wb)" 스타일 (2026-10-21 실측)

출처: 사용자 지정 외부 참고 사이트(로그인 후 화면) — URL·원본 캡처는 공개 저장소에 싣지 않고 로컬 `docs/design-wb/ref/`(gitignore)에만 보관 · 실측 = 브라우저 computed style.
참고 화면: 로컬 `ref/ref_*.jpg`(비공개). 우리 구현 화면 = `screens/`.
★코드 복사 금지 — 토큰 값과 시각 규칙만 참고해 우리 것을 새로 짠다(타사 자산·브랜드·로고 사용 금지).

## 1. 성격
조용한 작업대(workbench). 채도 낮은 중성 회색 위에 얇은 선, 굵기·여백으로 위계. 그라데이션·그림자·네온 액센트 없음.
숫자는 전부 tabular-nums. 강조는 색이 아니라 굵기(600)와 위치. 색은 오르내림(up/down)·경고·시리즈에만.
밝은 테마 = 따뜻한 종이색(#e2e0da 배경·#edebe6 카드) · 어두운 테마 = 중성 슬레이트(#16181c 배경·#1d2025 카드). 시스템 설정 따름 + 토글.

## 2. 토큰 (그대로 쓸 값)
### 밝은 테마 (:root)
--wb-bg #e2e0da · --wb-surface #edebe6 · --wb-subtle #e5e3dd · --wb-ink #33363b · --wb-muted #5c5f65 · --wb-rule #d6d3cc ·
--wb-rule-strong #bfbbb3 · --wb-mark #4e525a · --wb-up #b0333a · --wb-down #2b5ca9 · --wb-warn #9c4e1b · --wb-accent #7a5f34 ·
--wb-open #1f8a4c · --wb-series-1 #3876b0 · -2 #a85455 · -3 #c87340 · -4 #1b968d · -5 #b18e15 · -6 #7e8387 ·
--wb-ramp-1..9 #34558c #4a6ba0 #6583b2 #869cbd #9c9aa3 #bb9186 #b6735f #a85843 #913f2e (발산형 히트맵: 파랑→회색→적갈) ·
--wb-action-face #454a52 · --wb-action-face-hover #50555e · --wb-action-ink #f0eee9 · --wb-overlay rgb(51 54 59 / 32%)
### 어두운 테마 ([data-theme="dark"] + prefers-color-scheme dark & not light)
--wb-bg #16181c · --wb-surface #1d2025 · --wb-subtle #23272d · --wb-ink #e3e5e8 · --wb-muted #969ba4 · --wb-rule #2c3037 ·
--wb-rule-strong #3a3f47 · --wb-mark #c7cbd1 · --wb-up #f0736b · --wb-down #6fa3ec · --wb-warn #e39a3b · --wb-accent #cfb07a ·
--wb-open #3ccb74 · --wb-series-1 #649bd2 · -2 #b65c5e · -3 #de7f3c · -4 #25aba6 · -5 #d0b035 · -6 #b9bec3 ·
--wb-ramp-1..9 #4a68a0 #5c7cb2 #7590bd #94a5c4 #aeabb3 #c9a095 #c9836f #c26953 #b0503c ·
--wb-action-face #3b4250 · --wb-action-face-hover #465062 · --wb-action-ink #eef0f3 · --wb-overlay rgb(10 11 13 / 60%)
### 타이포·간격·치수 (테마 공통)
폰트 'Pretendard Variable',Pretendard,-apple-system,BlinkMacSystemFont,'Segoe UI','Malgun Gothic',sans-serif (Pretendard 는 jsdelivr CDN 로드 가능·없으면 맑은 고딕 폴백)
크기/행간: label 11/16 · body 13/20 · title 15/22 · page 18/24 · figure 24/30 · 굵기 400 / 600(strong) 두 개뿐
간격 4·8·12·16·24·32 · gutter 24(모바일 16) · gap 16 · section 24 · inset 16 · page-head 40
컨트롤 높이 32(작은 것 24·모바일 44) · 카드 머리 44 · 표 머리 28 · 행 32 · 반경 카드 6 / 컨트롤 4 / 막대 2

## 3. 컴포넌트 실측
- **상단 헤더**: 높이 48, 하단 1px rule. 왼쪽 브랜드(24px 로고 + 굵은 이름 + 회색 부제), 이어서 1차 메뉴(13px). 활성 메뉴 = ink·600·**하단 2px mark 밑줄**(margin-bottom −1px 로 헤더 선에 겹침) · 비활성 = muted·400·투명 밑줄. 오른쪽 아이콘 버튼(테마 토글·도움말)·검색 상자(밑줄형 입력).
- **2차 탭 줄**: 헤더 아래 같은 방식(작은 탭·활성 밑줄).
- **본문 main**: max-width 1680 · padding 24 24 32.
- **페이지 머리**: h1 18/24 600 + 같은 줄 오른쪽에 muted 13px 설명(예 "오늘의 시장 요약").
- **섹션 제목**: 15/22 600, 카드 밖. 오른쪽 끝에 muted 링크.
- **카드**: surface 배경 · 1px rule 테두리 · 반경 6 · 그림자 없음. **카드 머리** = 높이 44 · padding 4 16 · 하단 1px rule · 제목 15/22 600 + 오른쪽 muted 11~13px 메타("35종목 · 완료 거래일 종가 · 직전 거래일 대비").
- **KPI 띠**: 카드 하나 안에 그룹(변동성/금리/환율…)을 세로 rule 로 구분. 그룹 제목 13 600 + 작은 아이콘. 항목 = dt 11/16 muted("VKOSPI · 10.19") + 큰 숫자 24/30 600 + 옆에 작은 변화량(up/down 색·11px).
- **표**: th 높이 28 · 11/16 muted · surface 배경 · 하단 1px rule-strong · padding 0 8 0 12. td 높이 32 · 13/20 · 하단 1px rule · 숫자 우측정렬 tabular. 선택 행 = subtle 배경. 상승 = up 색(400)·하락 = down 색. 표 안 미니 스파크라인(muted 선 + 끝점 점)·52주 범위 점 막대.
- **세그먼트(기간 3M/6M/1Y)**: 높이 24 · 11/16 · 1px rule-strong 테두리 연결 · 반경 4(양끝) · 비활성 muted · 활성 = action-face 배경 + action-ink + 600.
- **버튼**: 높이 32 · 1px rule-strong · 반경 4 · 배경 없음 · hover 시 테두리 mark. primary = action-face 채움.
- **입력**: 밑줄형(아래 1px rule-strong만) · hover/focus 밑줄 mark · focus-visible 2px mark outline.
- **배지/칩**: 1px rule 테두리 · 반경 4 · 투명 배경.
- **히트맵/트리맵**: ramp-1..9 발산형(하락 파랑 ↔ 상승 적갈) · 칸 안 흰/잉크 글자.
- **차트**: 축·그리드 = rule 색 · 라벨 muted 11px · 시리즈 series-1..6 · 그림자·채움 그라데이션 없음.

## 3b. ★배치 패턴 (사용자 2026-10-21: "위 탭 들어가면 정말 참고할 만한 좋은 배치들 — 최대한 가져오자")
화면 파일명 = 로컬 ref/ref_*.jpg (비공개)

1. **2단 헤더 내비** (전 화면): 1차 = 영역, 2차 = 그 영역 안 화면 탭(세로 구분선으로 묶음 분리).
   오른쪽 끝 = 테마 토글 · 도움말 · **"화면 찾기 Ctrl K"** 커맨드 팔레트 입력 · 사용자 아이콘.
   → BQH: 1차 = 주간 리뷰 / 전략·운용 / 금리 / 수급·데이터 …, 2차 = 각 도구. 지금 흩어진 10개 페이지를 이 2단 내비 하나로 묶는다.
2. **페이지 머리 한 줄**: h1(18) + 같은 줄 muted 설명(ref_curves_top "금리 커브  통화별 금리 커브와 포워드").
3. **필터 바 (ref_curves_top · ref_calendar · ref_databrowser · ref_volsurface)**: 페이지 머리 바로 아래, 카드 밖, 라벨(11 muted) 위에 컨트롤.
   기준일 = 밑줄 입력 + ‹ › 화살표 + "최신" · 통화/시장 = **국기 붙은 세그먼트** · 표시 모드 = 세그먼트(제로/구간 선도/할인계수) ·
   상태 텍스트("저장본 조회 완료 · 09:10" muted) · 오른쪽 끝 **primary "조회" 버튼**(+ "취소" 텍스트 버튼).
   ★**스크롤해도 필터 바가 상단에 고정(sticky)** (ref_curves_tables).
4. **히어로 요약 카드 (ref_curves_top · ref_underlying · ref_volsurface)**: 왼쪽 국기/아이콘 + 대상 이름 + 출처 한 줄, 오른쪽에
   KPI 3~5개(11 라벨 · 24 숫자 · 11 보조) 세로 rule 로 구분. 데이터 로딩 전엔 **스켈레톤 막대**(subtle 회색 바).
5. **본문 2:1 그리드**: 왼쪽 큰 카드(주 차트/주 표) + 오른쪽 좁은 카드(보조 지표·리스트). 큰 카드 머리 안에 **범례를 값과 함께 한 줄**
   (ref_curves_top "기준 만기 3Y · KRW 3.81% · USD 4.81% …").
6. **표 + 각주**: 카드 안 표 아래 muted 11px 각주("2026-10-20 저장본 · 구성 커브 · 저장 커브 없음").
   비교표에 **스파크라인 열**(muted 선 + 끝점 점) · 쌍대 **행렬표**(대각 —, 셀 up/down 색).
7. **시장 지도 타일 (ref_underlying · ref_desk)**: 국기+티커 / 큰 등락률 / 작은 레벨. 상승 타일은 up 색 옅은 채움(ramp).
8. **레짐 매트릭스 (ref_macro)**: 행 = 국가(국기), 열 = 성장·물가·고용·정책금리, 셀 = 지표명 + "5y z" 배지 + 미니 차트.
   → BQH 커브-경기 계기판·MTE 상태 지도에 그대로 맞음.
9. **캘린더 + 상세 레일 (ref_calendar)**: 월 그리드(일요일 up 색·토요일 down 색 날짜, 셀 안 색 띠 이벤트 칩 · "+n건") + 오른쪽
   "선택일" 레일(날짜 그룹 헤더 · 이벤트 카드 왼쪽 색 띠) · 하단 범례(정책·금리/경제지표/실적/휴장). → BQH 입찰·금통위·만기 캘린더.
10. **보고서 뷰어 (ref_weeklyreport)**: 주차 선택(‹ 2026·W42 · 10.12~10.16 ›) + 보기 세그먼트(웹 / 인쇄·PDF) + 조회 버튼 →
    고지 배너(muted 박스, 3줄) → 카드: 왼쪽 **목차 레일**(PART 1 … 들여쓴 하위 항목·현재 항목 강조) + 오른쪽 **문서 페이지 미리보기**
    (흰 페이지 2장 나란히). → ★BQH 주간 리뷰 탭의 정답 배치.
11. **데이터 브라우저 (ref_databrowser)**: 자료 세그먼트(일봉/옵션체인/휴장일) · 대상 드롭다운 · 시작·종료일 → 요약 KPI(행 수·기간·
    결측·저장 시각) → 추이 차트 카드 → 원표 카드(CSV 버튼 · "더 보기"). → BQH DB 탐색 페이지.
12. **빈 상태·로딩**: "조회 전"(13 600) · 스켈레톤 막대 · "읽는 중" muted. 에러는 warn 색 한 줄.

## 4. 우리 사이트 적용 원칙
- 의미 색 매핑: 기존 `--green/--red/--blue/--amber/--purple` → up/down/series/warn 토큰으로 재매핑. 금리·스프레드 "상승=up(적)·하락=down(청)" 은 기존 페이지 의미를 유지(바꿀 땐 페이지별로 명시).
- 다크 기본처럼 보이되 **시스템 설정 따름 + 토글**(localStorage 'wb-theme'·try/catch).
- 데이터·API·계산·DOM id·JS 훅 무변경. 표현층만.
