# Care scenario - Codex takeover while Claude is offline

Date: 7 November 2026. User explicitly transferred continuation to Codex while
Claude is unavailable. Existing Claude implementation is retained, not rewritten.

## Implemented scenario

`#/demo/care` connects patient context, prescription review, confirmed medication
schedule, intake, doctor summary/source review and doctor feedback. Every domain
uses the existing in-memory synthetic fixture. Reload/restart clears it. Real
account routes remain separate. This is not proof of live AI or cross-device data.

## Integration fix by Codex

Switching perspectives unmounted the patient journey and doctor view. A browser
regression reproduced loss of the unsent patient message; prescription progress,
file preview and reminder state were also scoped to that unmounted subtree.

The panels now remain mounted (inactive panel hidden and excluded from keyboard
navigation). The doctor view mounts only after its first visit. A revision key
refreshes read-only case/summary/feedback on perspective changes while preserving
patient and doctor drafts. Restart still resets/unmounts the whole scenario.

Modified integration files:

- `care-scenario/CareScenarioPage.tsx`
- `doctor/case/DoctorCasePanel.tsx`
- `doctor/case/useResource.ts`
- `doctor-feedback/PatientFeedbackPanel.tsx`

`public/demo/synthetic-prescription.svg` (and its link in the demo introduction)
was removed when preparing the app for production; root `DEMO_RUNBOOK.md` remains.

## Verification

- Frontend build and lint passed after the integration fix. Existing >500 kB
  bundle warning remains (approximately 677 kB before gzip).
- White-label check passed on the final changed version.
- All 93 existing scenario logic tests passed: schedule 25, prescription review
  14, feedback 3, context 8, doctor case 13, intake 8, document mapping 4, fixture 18.
- Browser regression failed before the fix and passed after it: unsent patient
  draft survives Patient -> Doctor -> Patient.
- Full browser flow passed: synthetic image input -> four field confirmations ->
  confirmed schedule -> patient message -> send case -> doctor summary/feedback ->
  patient answer. Partial prescription review and both drafts survive tab switches.
- Browser checks passed at 320/360/390/768/1024/1440 px, Light/Dark, no horizontal
  overflow, plus restart cleanup. Automation uses synthetic file input and fixture
  extraction, not a physical camera or real OCR service.
- In-page reminder checks passed with a controlled browser clock, both through
  visibility refresh and the real 15-second page interval while the doctor
  perspective is selected: the due banner appears, marking taken survives changes and
  the same banner does not reappear. Actual device notification delivery is not
  covered by this check.
- Artifacts/scripts are ignored under root `output/playwright/check-care-*.js`.
  The full flow script injects a synthetic image into the file input to avoid
  the CLI's OS file-chooser interruption.

## Remaining work

1. Test notification permission handling and delivery on a real device; background
   delivery is explicitly unsupported. Logic/DST/expiry have unit coverage.
2. Live integration: only prescription extraction has an adapter, not wired into
   this fixture page. Context/intake/summary/review/schedule/feedback need agreed
   backend contracts, persistence and authorization before cross-device claims.
3. Preserve this integration fix when resuming Claude's work. No active agent
   owns these files concurrently during the takeover. Coordinate the next owner.
4. Supabase 007/admin and Azure merging remain separate; no remote schema or
   infrastructure was changed in this takeover.
