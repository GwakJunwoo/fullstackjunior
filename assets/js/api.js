/**
 * api.js — 백엔드 API 호출 유틸리티
 *
 * API URL 우선순위:
 *   1. localStorage['api_base']             (수동 override — F12 콘솔에서 setApiBase)
 *   2. window.API_BASE                      (빌드 시 주입)
 *   3. /assets/api_base.txt 동적 fetch      (Quick Tunnel URL 자동 갱신용)
 *   4. (fallback) hard-coded 기본값
 *
 * /assets/api_base.txt:
 *   - cloudflared Quick Tunnel 시작 시 server/start_tunnel.py 가 자동 갱신.
 *   - git push → Netlify 자동 재배포 → 페이지 새로고침이면 새 URL 적용됨.
 */

const API_BASE_KEY = 'api_base';
let _cachedBase = null;     // 페이지 라이프사이클 동안 캐시 (한 번만 fetch)

/**
 * API 베이스 URL 반환 (async).
 * localStorage > window.API_BASE > /assets/api_base.txt > fallback
 */
async function getApiBase() {
  if (_cachedBase) return _cachedBase;

  // 1) localStorage 수동 override
  const ls = localStorage.getItem(API_BASE_KEY);
  if (ls) { _cachedBase = ls; return ls; }

  // 2) build-time injection
  if (typeof window !== 'undefined' && window.API_BASE) {
    _cachedBase = window.API_BASE;
    return _cachedBase;
  }

  // 3) /assets/api_base.txt — Quick Tunnel 자동 갱신 파일
  //    cache-busting query 로 immutable 캐시 우회
  try {
    const r = await fetch(`/assets/api_base.txt?_t=${Date.now()}`, { cache: 'no-cache' });
    if (r.ok) {
      const url = (await r.text()).trim().replace(/\/$/, '');
      if (url && url.startsWith('http')) {
        _cachedBase = url;
        return url;
      }
    }
  } catch { /* fallback */ }

  // 4) hard-coded fallback (deprecated)
  _cachedBase = '';
  return '';
}

/** localStorage 수동 override — F12 콘솔용 */
function setApiBase(url) {
  const clean = (url || '').trim().replace(/\/$/, '');
  if (clean) localStorage.setItem(API_BASE_KEY, clean);
  else        localStorage.removeItem(API_BASE_KEY);
  _cachedBase = null;   // 다음 호출 시 재해석
}

// ── Fetch Wrapper ─────────────────────────────────────────────
async function _apiFetch(method, path, body = null) {
  const base = await getApiBase();
  if (!base) {
    throw new ApiError('API URL이 설정되지 않았습니다.',
                        '/assets/api_base.txt 가 비었거나 서버가 켜지지 않았습니다.');
  }

  const url = `${base}${path}`;
  const opts = {
    method,
    headers: {
      // ngrok 잔존 호환 (cloudflared 에는 영향 없음)
      'ngrok-skip-browser-warning': '1',
    },
  };
  if (body != null) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(url, opts);

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(`서버 오류 ${res.status}`, text);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function apiGet(path)         { return _apiFetch('GET',    path); }
async function apiPost(path, body)  { return _apiFetch('POST',   path, body); }
async function apiPatch(path, body) { return _apiFetch('PATCH',  path, body); }
async function apiDelete(path)      { return _apiFetch('DELETE', path); }

class ApiError extends Error {
  constructor(message, detail = '') {
    super(message);
    this.name  = 'ApiError';
    this.detail = detail;
  }
}
