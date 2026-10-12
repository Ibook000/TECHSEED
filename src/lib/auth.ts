// Admin session token handling. The token lives in sessionStorage only (written by
// AdminLoginPage) and is attached to API calls by installFetchAuth(), which is called
// once from main.tsx before the app mounts.
export const ADMIN_TOKEN_KEY = 'tech_admin_token';
export const ADMIN_USER_KEY = 'tech_admin_user';
export const STUDENT_TOKEN_KEY = 'tech_student_access_token';
export const STUDENT_CANDIDATE_ID_KEY = 'tech_student_candidate_id';

export function getAdminToken(): string {
  try {
    return sessionStorage.getItem(ADMIN_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function saveAdminToken(token: string): void {
  try {
    sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
  } catch {
    // The current in-memory session still works if storage is unavailable.
  }
}

export function clearAdminSession(): void {
  try {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    sessionStorage.removeItem(ADMIN_USER_KEY);
  } catch {
    // ignore
  }
}

export function getStudentAccessToken(): string {
  try {
    return localStorage.getItem(STUDENT_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function saveStudentSession(candidateId: string, token: string): void {
  try {
    localStorage.setItem(STUDENT_CANDIDATE_ID_KEY, candidateId);
    localStorage.setItem(STUDENT_TOKEN_KEY, token);
  } catch {
    // The current in-memory session still works if storage is unavailable.
  }
}

export function clearStudentSession(): void {
  try {
    localStorage.removeItem(STUDENT_CANDIDATE_ID_KEY);
    localStorage.removeItem(STUDENT_TOKEN_KEY);
  } catch {
    // ignore
  }
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

// Attach the current admin or student credential to same-origin API requests.
// The server performs the actual authorization checks.
export function installFetchAuth(): void {
  const originalFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = requestUrl(input);
    const adminToken = getAdminToken();
    const studentToken = getStudentAccessToken();
    const isApiCall = url.includes('/api/');

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
