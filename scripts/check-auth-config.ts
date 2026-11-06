import process from 'node:process';
import { loadEnv } from 'vite';

// Match Vite's development env loading; never print any key or token values.
const env = loadEnv('development', process.cwd(), 'VITE_');
const projectUrl = env.VITE_SUPABASE_URL?.trim();
const publicKey = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
const apiUrl = env.VITE_API_BASE_URL?.trim();
let failed = false;

function result(ok: boolean, label: string) {
  console.log(`${ok ? 'OK' : 'MISSING/INVALID'}: ${label}`);
  if (!ok) failed = true;
}

function validUrl(value: string | undefined, allowRelative = false): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value, allowRelative ? 'http://127.0.0.1:5173' : undefined);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    return !parsed.username && !parsed.password && !parsed.hash && !parsed.search && (parsed.protocol === 'https:' || (local && parsed.protocol === 'http:'));
  } catch { return false; }
}

function validPublicKey(value: string | undefined): boolean {
  if (!value || value.startsWith('sb_secret_')) return false;
  if (value.startsWith('sb_publishable_')) return value.length > 'sb_publishable_'.length;
  try {
    const payload = JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString('utf8'));
    return payload.role === 'anon';
  } catch { return false; }
}

result(validUrl(projectUrl), 'VITE_SUPABASE_URL');
result(validPublicKey(publicKey), 'VITE_SUPABASE_PUBLISHABLE_KEY (publishable or legacy anon only)');
result(validUrl(apiUrl, true), 'VITE_API_BASE_URL');
console.log('\nDevelopment app callback to allow in Supabase: http://127.0.0.1:5173/auth/callback');
console.log('Google Cloud redirect URI: copy the Supabase Google provider callback, not the app callback.');

if (process.argv.includes('--online') && validUrl(projectUrl) && validPublicKey(publicKey)) {
  try {
    const response = await fetch(`${projectUrl!.replace(/\/$/, '')}/auth/v1/settings`, {
      headers: { apikey: publicKey! }, redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) result(false, `Supabase public auth settings (HTTP ${response.status})`);
    else {
      const settings = await response.json() as { external?: { google?: boolean } };
      result(settings.external?.google === true, 'Google provider enabled in Supabase');
    }
  } catch { result(false, 'Supabase public auth settings reachable'); }
} else if (process.argv.includes('--online')) {
  console.log('\nOnline check skipped: configure the Supabase URL and public key first.');
}

console.log('\nThis check does not verify Google consent, redirect allowlists, /me, database migrations or invitation delivery.');
process.exitCode = failed ? 1 : 0;
