import { describeCameraFailure, interpretScan, scaledSize } from './qrScanLogic.ts';

const assert = {
  equal(actual: unknown, expected: unknown) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  },
};

const code = 'synthetic_doctor_code_1234';

// A doctor's QR holds the full link; a bare code is accepted too.
assert.equal(interpretScan(`https://app.example/#/connect/${code}`), { kind: 'code', code });
assert.equal(interpretScan(code), { kind: 'code', code });
assert.equal(interpretScan(`  ${code}\n`), { kind: 'code', code });

// An empty frame is not an error.
assert.equal(interpretScan(null), { kind: 'none' });
assert.equal(interpretScan(undefined), { kind: 'none' });
assert.equal(interpretScan(''), { kind: 'none' });

// Anything else a camera may see (other QRs, URLs, route tricks) is foreign and never navigated to.
for (const text of ['https://evil.example/x', 'WIFI:S:net;T:WPA;P:secret;;', 'short', '../../admin', `${code}?next=/admin`, `/connect/${code}/extra`]) {
  assert.equal(interpretScan(text), { kind: 'foreign' });
}

// Camera errors map to a clear phase; the manual-code form stays the fallback for all of them.
assert.equal(describeCameraFailure('NotAllowedError').phase, 'denied');
assert.equal(describeCameraFailure('SecurityError').phase, 'denied');
assert.equal(describeCameraFailure('NotFoundError').phase, 'missing');
assert.equal(describeCameraFailure('NotReadableError').phase, 'error');
assert.equal(describeCameraFailure(undefined).phase, 'error');
for (const name of ['NotAllowedError', 'NotFoundError', 'NotReadableError', 'AbortError', undefined]) {
  assert.equal(describeCameraFailure(name).message.length > 0, true);
}

// Frames are downscaled for speed, never upscaled, and keep their ratio.
assert.equal(scaledSize(1920, 1080, 640), { width: 640, height: 360 });
assert.equal(scaledSize(1080, 1920, 640), { width: 360, height: 640 });
assert.equal(scaledSize(320, 240, 640), { width: 320, height: 240 });
assert.equal(scaledSize(0, 0, 640), { width: 0, height: 0 });
assert.equal(scaledSize(4000, 1, 640), { width: 640, height: 1 });

console.log('qrScanLogic: ok');
