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
async function _fetchFileBase() {
  // /assets/api_base.txt — Quick Tunnel 자동 갱신 파일 (cache-busting)
  try {
    const r = await fetch(`/assets/api_base.txt?_t=${Date.now()}`, { cache: 'no-cache' });
    if (r.ok) {
      const url = (await r.text()).trim().replace(/\/$/, '');
      if (url && url.startsWith('http')) return url;
    }
  } catch { /* ignore */ }
  return '';
}

/**
 * API 베이스 URL 반환 (async).
 * forceRefresh=true 면 캐시·localStorage 를 무시하고 api_base.txt 를 다시 읽는다.
 * 터널 URL 이 회전(quick tunnel 은 재시작마다 변경)했을 때 자가복구용.
 * 만약 localStorage override 가 파일 최신값과 다르면 = stale → 자동 제거.
 */
async function getApiBase(forceRefresh = false) {
  if (!forceRefresh && _cachedBase) return _cachedBase;

  const ls = localStorage.getItem(API_BASE_KEY);

  if (forceRefresh) {
    const fileBase = await _fetchFileBase();
    if (fileBase) {
      // localStorage override 가 파일값과 다르면 stale 로 보고 제거
      if (ls && ls.replace(/\/$/, '') !== fileBase) {
        localStorage.removeItem(API_BASE_KEY);
      }
      _cachedBase = fileBase;
      return fileBase;
    }
    // 파일을 못 읽으면 기존 override 라도 유지
    if (ls) { _cachedBase = ls; return ls; }
  }

  // 1) localStorage 수동 override
  if (ls) { _cachedBase = ls; return ls; }

  // 2) build-time injection
  if (typeof window !== 'undefined' && window.API_BASE) {
    _cachedBase = window.API_BASE;
    return _cachedBase;
  }

  // 3) /assets/api_base.txt
  const fileBase = await _fetchFileBase();
  if (fileBase) { _cachedBase = fileBase; return fileBase; }

  // 4) fallback
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
async function _doFetch(base, method, path, body) {
  const opts = {
    method,
    headers: { 'ngrok-skip-browser-warning': '1' },  // ngrok 잔존 호환
  };
  if (body != null) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${base}${path}`, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // 502/503/530 등 = 터널/서버 다운 신호 → 상위에서 base 재해석 후 재시도
    const stale = res.status >= 500 || res.status === 530 || res.status === 404;
    throw new ApiError(`서버 오류 ${res.status}`, text, stale);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function _apiFetch(method, path, body = null) {
  let base = await getApiBase();
  if (!base) {
    // 캐시된 base 가 없으면 파일에서 강제로 한 번 더 시도
    base = await getApiBase(true);
  }
  if (!base) {
    throw new ApiError('API URL이 설정되지 않았습니다.',
                        '/assets/api_base.txt 가 비었거나 서버가 켜지지 않았습니다.');
  }

  try {
    return await _doFetch(base, method, path, body);
  } catch (e) {
    // 네트워크 오류(죽은 터널 = TypeError "Failed to fetch") 또는 5xx/530.
    // 터널 URL 이 회전했을 가능성 → api_base.txt 재해석 후 1회 재시도.
    const networkErr = !(e instanceof ApiError);   // fetch 자체가 throw
    if (!networkErr && !e.stale) throw e;           // 명백한 4xx 등은 그대로
    const fresh = await getApiBase(true);
    if (fresh && fresh !== base) {
      return await _doFetch(fresh, method, path, body);  // 새 터널로 재시도
    }
    if (networkErr) {
      throw new ApiError('서버에 연결할 수 없습니다.',
        '터널/서버가 내려갔거나 URL 이 바뀌었습니다. 서버·터널 상태를 확인하세요.');
    }
    throw e;
  }
}

async function apiGet(path)         { return _apiFetch('GET',    path); }
async function apiPost(path, body)  { return _apiFetch('POST',   path, body); }
async function apiPatch(path, body) { return _apiFetch('PATCH',  path, body); }
async function apiDelete(path)      { return _apiFetch('DELETE', path); }

class ApiError extends Error {
  constructor(message, detail = '', stale = false) {
    super(message);
    this.name  = 'ApiError';
    this.detail = detail;
    this.stale  = stale;   // true 면 base 재해석 후 재시도 대상
  }
}
