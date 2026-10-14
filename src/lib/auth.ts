// Admin session token handling. The token lives in sessionStorage only (written by
// AdminLoginPage) and is attached to API calls by installFetchAuth(), which is called
// once from main.tsx before the app mounts.
export const ADMIN_TOKEN_KEY = 'tech_admin_token';
export const ADMIN_USER_KEY = 'tech_admin_user';
export const STUDENT_TOKEN_KEY = 'tech_student_access_token';
export const STUDENT_CANDIDATE_ID_KEY = 'tech_student_candidate_id';

const memoryStoredValues = new Map<string, string>();
const memorySessionValues = new Map<string, string>();
const volatileStoredKeys = new Set<string>();
const volatileSessionKeys = new Set<string>();

export function getStoredValue(key: string): string | null {
  if (volatileStoredKeys.has(key) || typeof window === 'undefined') {
    return memoryStoredValues.get(key) ?? null;
  }

  try {
    const storedValue = window.localStorage.getItem(key);
    if (storedValue !== null) {
      memoryStoredValues.set(key, storedValue);
      return storedValue;
    }
    memoryStoredValues.delete(key);
    return null;
  } catch {
    return memoryStoredValues.get(key) ?? null;
  }
}

export function setStoredValue(key: string, value: string): void {
  memoryStoredValues.set(key, value);
  try {
    if (typeof window === 'undefined') {
      volatileStoredKeys.add(key);
      return;
    }
    window.localStorage.setItem(key, value);
    volatileStoredKeys.delete(key);
  } catch {
    // The current tab can keep working with the in-memory value until it closes.
    volatileStoredKeys.add(key);
  }
}

export function removeStoredValue(key: string): void {
  memoryStoredValues.delete(key);
  volatileStoredKeys.delete(key);
  try {
    if (typeof window !== 'undefined') window.localStorage.removeItem(key);
  } catch {
    // The current tab no longer uses the removed in-memory value.
  }
}

export function getSessionStoredValue(key: string): string | null {
  if (volatileSessionKeys.has(key) || typeof window === 'undefined') {
    return memorySessionValues.get(key) ?? null;
  }

  try {
    const storedValue = window.sessionStorage.getItem(key);
    if (storedValue !== null) {
      memorySessionValues.set(key, storedValue);
      return storedValue;
    }
    memorySessionValues.delete(key);
    return null;
  } catch {
    return memorySessionValues.get(key) ?? null;
  }
}

export function setSessionStoredValue(key: string, value: string): void {
  memorySessionValues.set(key, value);
  try {
    if (typeof window === 'undefined') {
      volatileSessionKeys.add(key);
      return;
    }
    window.sessionStorage.setItem(key, value);
    volatileSessionKeys.delete(key);
  } catch {
    // The active tab can keep using the session until it closes.
    volatileSessionKeys.add(key);
  }
}

export function removeSessionStoredValue(key: string): void {
  memorySessionValues.delete(key);
  volatileSessionKeys.delete(key);
  try {
    if (typeof window !== 'undefined') window.sessionStorage.removeItem(key);
  } catch {
    // The active tab no longer uses the removed in-memory session value.
  }
}

export function getAdminToken(): string {
  return getSessionStoredValue(ADMIN_TOKEN_KEY) || '';
}

export function saveAdminToken(token: string): void {
  setSessionStoredValue(ADMIN_TOKEN_KEY, token);
}

export function clearAdminSession(): void {
  removeSessionStoredValue(ADMIN_TOKEN_KEY);
  removeSessionStoredValue(ADMIN_USER_KEY);
}

export function getStudentAccessToken(): string {
  return getStoredValue(STUDENT_TOKEN_KEY) || '';
}

export function saveStudentSession(candidateId: string, token: string): void {
  setStoredValue(STUDENT_CANDIDATE_ID_KEY, candidateId);
  setStoredValue(STUDENT_TOKEN_KEY, token);
}

export function clearStudentSession(): void {
  removeStoredValue(STUDENT_CANDIDATE_ID_KEY);
  removeStoredValue(STUDENT_TOKEN_KEY);
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function isSameOriginApiRequest(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.href);
    return parsed.origin === window.location.origin && parsed.pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

// Attach the current admin or student credential to same-origin API requests.
// The server performs the actual authorization checks.
export function installFetchAuth(): void {
  const originalFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = requestUrl(input);
    const adminToken = getAdminToken();
    const studentToken = getStudentAccessToken();
    const isApiCall = isSameOriginApiRequest(url);

    if (isApiCall && (adminToken || studentToken)) {
      const headers = new Headers(input instanceof Request ? input.headers : undefined);
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
      if (adminToken) headers.set('Authorization', `Bearer ${adminToken}`);
      if (studentToken) headers.set('X-Student-Token', studentToken);
      const response = originalFetch(input, { ...init, headers });
      return adminToken ? withAuthExpiryCheck(response, url) : response;
    }

    return originalFetch(input, init);
  };
}

function withAuthExpiryCheck(response: Promise<Response> | Response, url: string): Response {
  // Only reachable when a token was attached, so a 401 here means the session died
  // rather than an anonymous caller hitting a protected route. Skip the login
  // endpoint: a 401 there just means the user typed a wrong password.
  Promise.resolve(response)
    .then((r) => {
      if (r.status !== 401 || url.includes('/api/auth/login')) return;
      clearAdminSession();
      alert('登录状态已失效，请重新登录管理后台');
      window.location.href = '/admin';
    })
    .catch(() => {});

  return response as Response;
}
