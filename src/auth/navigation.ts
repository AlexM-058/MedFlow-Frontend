export const AUTH_RETURN_KEY = 'medflow.auth-return.v1';
const RETURN_TTL_MS = 15 * 60 * 1000;
const OPAQUE_CODE = /^[A-Za-z0-9_-]{16,256}$/;

export function isOpaqueCode(value: string): boolean {
  return OPAQUE_CODE.test(value);
}

/** Exact allowlist: never accept external URLs or arbitrary redirect paths. */
export function safeDestination(value: unknown): string {
  if (value === '/patient' || value === '/doctor') return value;
  if (typeof value === 'string') {
    const match = /^\/(connect|doctor\/invite)\/([A-Za-z0-9_-]+)$/.exec(value);
    if (match && isOpaqueCode(match[2])) return value;
  }
  return '/patient';
}

export function encodeReturn(destination: string, now = Date.now()): string {
  return JSON.stringify({ destination: safeDestination(destination), createdAt: now });
}

export function decodeReturn(raw: string | null, now = Date.now()): string {
  try {
    const value: unknown = JSON.parse(raw ?? 'null');
    if (typeof value !== 'object' || value === null) return '/patient';
    const record = value as Record<string, unknown>;
    if (typeof record.createdAt !== 'number' || record.createdAt > now || now - record.createdAt > RETURN_TTL_MS) return '/patient';
    return safeDestination(record.destination);
  } catch {
    return '/patient';
  }
}

export function callbackPath(baseUrl: string): string {
  return `${baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`}auth/callback`;
}

export function navigate(destination: string): void {
  window.location.hash = destination;
}

export function readAppRoute(): string {
  if (window.location.pathname === callbackPath(import.meta.env.BASE_URL)) return '/auth/callback';
  return window.location.hash.slice(1) || '/home';
}

export function subscribeToRoute(callback: () => void): () => void {
  window.addEventListener('hashchange', callback);
  window.addEventListener('popstate', callback);
  return () => {
    window.removeEventListener('hashchange', callback);
    window.removeEventListener('popstate', callback);
  };
}
