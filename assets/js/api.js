/**
 * api.js — 백엔드 API 호출 유틸리티
 *
 * ngrok URL 관리:
 *   - Netlify 환경변수 주입 방식: window.API_BASE (netlify.toml 또는 스니펫으로 설정)
 *   - 로컬 오버라이드: localStorage의 'api_base' 키
 *   - 우선순위: localStorage > window.API_BASE > ''
 *
 * 사용 예:
 *   const data = await apiGet('/health');
 *   const tables = await apiGet('/tables');
 */

// ── API Base URL ──────────────────────────────────────────────
const API_BASE_KEY = 'api_base';

/**
 * API 베이스 URL 반환
 * localStorage 우선, 없으면 window.API_BASE (빌드 시 주입)
 */
function getApiBase() {
  return (
    localStorage.getItem(API_BASE_KEY) ||
    (typeof window !== 'undefined' && window.API_BASE) ||
    'https://anaconda-implosion-decipher.ngrok-free.dev'
  );
}

/** localStorage에 API URL 저장 (ngrok URL 바뀔 때 호출) */
function setApiBase(url) {
  const clean = url.trim().replace(/\/$/, '');
  if (clean) localStorage.setItem(API_BASE_KEY, clean);
  else        localStorage.removeItem(API_BASE_KEY);
}

// ── Fetch Wrapper ─────────────────────────────────────────────
/**
 * GET 요청
 * ngrok 브라우저 경고 우회 헤더 포함
 * @param {string} path  - '/health', '/tables', '/preview/my_table' 등
 * @returns {Promise<any>}
 */
async function apiGet(path) {
  const base = getApiBase();
  if (!base) throw new ApiError('API URL이 설정되지 않았습니다.\n아래 입력창에 ngrok URL을 붙여넣으세요.');

  const url = `${base}${path}`;
  const res = await fetch(url, {
    headers: {
      'ngrok-skip-browser-warning': '1',   // ngrok 브라우저 경고 페이지 우회
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(`서버 오류 ${res.status}`, text);
  }
  return res.json();
}

class ApiError extends Error {
  constructor(message, detail = '') {
    super(message);
    this.name  = 'ApiError';
    this.detail = detail;
  }
}
