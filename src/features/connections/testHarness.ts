// Minimal test harness, no framework and no Node types required.
// Run a test file with: node --experimental-strip-types <file>.test.ts
// A failing check throws at the end, so the process exits non-zero.

const failures: string[] = [];
let passed = 0;

export function test(name: string, run: () => void): void {
  try {
    run();
    passed += 1;
    console.log(`ok   ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`FAIL ${name}\n     ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function assertEqual<T>(actual: T, expected: T, message = ''): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message ? message + ': ' : ''}expected ${e}, got ${a}`);
}

export function assertTrue(value: unknown, message = 'expected truthy value'): void {
  if (!value) throw new Error(message);
}

/** Call once at the end of a test file. */
export function finish(): void {
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) throw new Error(`Failed: ${failures.join('; ')}`);
}
