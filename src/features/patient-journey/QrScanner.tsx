import { useEffect, useRef, useState } from 'react';
import { decodeQrFrame } from './qrDecoder';
import {
  describeCameraFailure,
  INSECURE_CONTEXT,
  interpretScan,
  scaledSize,
  UNSUPPORTED_CAMERA,
  type CameraFailure,
} from './qrScanLogic';

const MAX_SIDE = 640;
const SCAN_INTERVAL_MS = 120;
const FOREIGN_HINT_MS = 2500;

/** Checked before asking for the camera, so no permission prompt appears when it cannot work. */
function precheck(): CameraFailure | null {
  if (!window.isSecureContext) return INSECURE_CONTEXT;
  if (!navigator.mediaDevices?.getUserMedia) return UNSUPPORTED_CAMERA;
  return null;
}

/**
 * Reads the doctor's QR with the device camera, inside the page. Frames are decoded locally and
 * never uploaded. It only reports an opaque connect code; the caller decides what to do with it
 * (the patient still confirms the connection request explicitly on the next page).
 */
export function QrScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCodeRef = useRef(onCode);
  const [failure, setFailure] = useState<CameraFailure | null>(precheck);
  const [ready, setReady] = useState(false);
  const [foreign, setForeign] = useState(false);

  useEffect(() => { onCodeRef.current = onCode; }, [onCode]);

  useEffect(() => {
    if (precheck() !== null) return;

    let cancelled = false;
    let stream: MediaStream | null = null;
    let scanTimer: number | undefined;
    let hintTimer: number | undefined;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });

    function release() {
      if (scanTimer !== undefined) window.clearTimeout(scanTimer);
      if (hintTimer !== undefined) window.clearTimeout(hintTimer);
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    }

    function scan() {
      if (cancelled) return;
      const video = videoRef.current;
      if (video && context && video.readyState >= video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
        const size = scaledSize(video.videoWidth, video.videoHeight, MAX_SIDE);
        canvas.width = size.width;
        canvas.height = size.height;
        context.drawImage(video, 0, 0, size.width, size.height);
        const outcome = interpretScan(decodeQrFrame(context.getImageData(0, 0, size.width, size.height)));
        if (outcome.kind === 'code') {
          cancelled = true;
          release();
          onCodeRef.current(outcome.code);
          return;
        }
        if (outcome.kind === 'foreign') {
          setForeign(true);
          if (hintTimer !== undefined) window.clearTimeout(hintTimer);
          hintTimer = window.setTimeout(() => setForeign(false), FOREIGN_HINT_MS);
        }
      }
      scanTimer = window.setTimeout(scan, SCAN_INTERVAL_MS);
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then(async (media) => {
        if (cancelled) { media.getTracks().forEach((track) => track.stop()); return; }
        stream = media;
        const video = videoRef.current;
        if (!video) { release(); return; }
        video.srcObject = media;
        await video.play();
        if (cancelled) return;
        setReady(true);
        scan();
      })
      .catch((error: unknown) => {
        release();
        if (!cancelled) setFailure(describeCameraFailure(error instanceof Error ? error.name : undefined));
      });

    return () => { cancelled = true; release(); };
  }, []);

  return (
    <div className="qr-scanner" role="group" aria-label="Scanare cod QR">
      {failure ? (
        <p className="account-error" role="alert">{failure.message}</p>
      ) : (
        <>
          <div className="qr-scanner__viewport">
            <video ref={videoRef} className="qr-scanner__video" playsInline muted aria-label="Imagine de la cameră" />
            <div className="qr-scanner__frame" aria-hidden="true" />
          </div>
          <p role="status" aria-live="polite">
            {ready ? 'Îndreptați camera spre codul QR al medicului.' : 'Se pornește camera…'}
          </p>
          {foreign && <p className="account-error" role="alert">Acest cod QR nu este un cod de conectare. Scanați codul medicului dumneavoastră.</p>}
        </>
      )}
      <button type="button" className="ui-button ui-button--secondary" onClick={onClose}>Închideți camera</button>
    </div>
  );
}
