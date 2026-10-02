import { PoseLandmarker } from '@mediapipe/tasks-vision';
import { t } from '../i18n.ts';
import type { Pose } from './landmarks.ts';

// Must match the @mediapipe/tasks-vision version in package.json: the JS and the wasm are a pair.
const MEDIAPIPE_VERSION = '1.0.1';
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const WASM_LOADER_URL = `${WASM_BASE}/vision_wasm_internal.js`;
const WASM_BINARY_URL = `${WASM_BASE}/vision_wasm_internal.wasm`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
// Used for the progress bar when the server doesn't send Content-Length (jsDelivr compresses on the fly).
const EXPECTED_BYTES: Record<string, number> = { [WASM_BINARY_URL]: 11_756_954, [MODEL_URL]: 5_777_746 };
const GPU_TIMEOUT_MS = 8000;

/** Anything that yields a pose per frame: the webcam, or synthetic input in demo mode. */
export interface PoseSource {
  /** Video to show behind the skeleton, if any. */
  video: HTMLVideoElement | null;
  /** Frame width / height. */
  aspect(): number;
  /** Latest pose, null when nobody is visible, undefined when there's no new frame yet. */
  read(now: number): Pose | null | undefined;
}

export class CameraError extends Error {
  readonly userMessage: string;
  constructor(userMessage: string, cause?: unknown) {
    super(userMessage, { cause });
    this.userMessage = userMessage;
  }
}

const progress = { loaded: 0, total: 0 };
let assets: Promise<{ wasm: Uint8Array; model: Uint8Array }> | null = null;

/** Share of the recognition files downloaded so far, 0..1. */
export const downloadProgress = (): number => (progress.total ? Math.min(1, progress.loaded / progress.total) : 0);

async function download(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`);
  const header = Number(res.headers.get('content-length'));
  progress.total += header > 0 ? header : (EXPECTED_BYTES[url] ?? 0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
    progress.loaded += value.length;
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.length; }
  return out;
}

/**
 * Starts downloading the wasm runtime and the pose model (about 17 MB). Safe to call many times.
 * Called on page load, so the files arrive while the player reads the intro.
 */
export function preloadRecognition(): Promise<{ wasm: Uint8Array; model: Uint8Array }> {
  assets ??= Promise.all([download(WASM_BINARY_URL), download(MODEL_URL)]).then(([wasm, model]) => ({ wasm, model }));
  // A failed download must be retryable.
  assets.catch(() => { assets = null; progress.loaded = 0; progress.total = 0; });
  return assets;
}

function explain(err: unknown): string {
  const name = err instanceof DOMException ? err.name : '';
  switch (name) {
    case 'NotAllowedError':
      return t('camera.denied');
    case 'NotFoundError':
    case 'OverconstrainedError':
      return t('camera.notFound');
    case 'NotReadableError':
      return t('camera.busy');
    default:
      return t('camera.failed', { msg: err instanceof Error ? err.message : String(err) });
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${ms} ms`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e: unknown) => { clearTimeout(timer); reject(e instanceof Error ? e : new Error(String(e))); },
    );
  });
}

async function createLandmarker(): Promise<PoseLandmarker> {
  const { wasm, model } = await preloadRecognition();
  // Hand MediaPipe the bytes we already have, so nothing downloads twice.
  const wasmBinaryPath = URL.createObjectURL(new Blob([wasm.slice().buffer], { type: 'application/wasm' }));
  const fileset = { wasmLoaderPath: WASM_LOADER_URL, wasmBinaryPath };
  const options = (delegate: 'GPU' | 'CPU') => ({
    baseOptions: { modelAssetBuffer: model.slice(), delegate },
    runningMode: 'VIDEO' as const,
    numPoses: 1,
  });
  // The GPU delegate can hang instead of failing on machines without usable WebGL, so it gets a deadline.
  try {
    return await withTimeout(PoseLandmarker.createFromOptions(fileset, options('GPU')), GPU_TIMEOUT_MS);
  } catch {
    return await PoseLandmarker.createFromOptions(fileset, options('CPU'));
  }
}

/** Asks for the camera, loads the pose model, and returns a source that reads one pose per video frame. */
export async function startCamera(): Promise<PoseSource> {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new CameraError(t('camera.https'));
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
  } catch (err) {
    throw new CameraError(explain(err), err);
  }

  const video = document.createElement('video');
  video.playsInline = true;
  video.muted = true;
  video.srcObject = stream;
  await video.play();

  let landmarker: PoseLandmarker;
  try {
    landmarker = await createLandmarker();
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    throw new CameraError(t('camera.model'), err);
  }

  let lastVideoTime = -1;
  let lastTs = 0;
  return {
    video,
    aspect: () => (video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 4 / 3),
    read(now) {
      if (video.readyState < 2 || video.currentTime === lastVideoTime) return undefined;
      lastVideoTime = video.currentTime;
      // detectForVideo requires strictly increasing timestamps.
      lastTs = Math.max(now, lastTs + 1);
      const result = landmarker.detectForVideo(video, lastTs);
      return result.landmarks[0] ?? null;
    },
  };
}
