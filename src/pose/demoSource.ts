import type { PoseSource } from './camera.ts';
import { NEUTRAL, SYNTH_ASPECT, synthPose, type SynthParams } from './synthetic.ts';

/**
 * Developer-only input for `?demo`: keys hold synthetic poses that go through the same recognition
 * as the camera. Players never see this. The brief forbids keyboard control.
 */
const KEYS: Record<string, Partial<SynthParams>> = {
  KeyW: { rUp: 1.3, rOut: 0.2 },
  KeyE: { rUp: 0.5, rOut: 0.3 },
  KeyS: { drop: 0.6 },
  KeyX: { drop: 0.3 },
  KeyA: { tilt: 20 },
  KeyD: { tilt: -20 },
  KeyQ: { tilt: 9 },
  KeyF: { rUp: 0, rOut: 1.6 },
  KeyG: { rUp: 0, rOut: 1.0 },
  KeyC: { sw: 0.85, sy: 0.6 },
};

export function startDemoSource(noise = 0.004): PoseSource {
  const held = new Set<string>();
  window.addEventListener('keydown', (e) => { if (e.code in KEYS) held.add(e.code); });
  window.addEventListener('keyup', (e) => held.delete(e.code));
  return {
    video: null,
    aspect: () => SYNTH_ASPECT,
    read() {
      let p: SynthParams = { ...NEUTRAL };
      for (const code of held) p = { ...p, ...KEYS[code] };
      return synthPose(p, noise);
    },
  };
}
