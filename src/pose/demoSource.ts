import type { MoveTarget } from '../dance/moves.ts';
import { paramsFor } from '../dance/targetPose.ts';
import type { PoseSource } from './camera.ts';
import { NEUTRAL, SYNTH_ASPECT, synthPose, type SynthParams } from './synthetic.ts';

/**
 * Developer-only input for `?demo`: an auto-dancer that performs whatever move is on screen,
 * through the same recognition as the camera. Players never see this; the brief forbids keyboard control.
 * Hold E to drop the left arm 50° (to see corrections), hold W to raise a hand (start or restart),
 * hold A or D to lean left or right (pick another song on the results screen).
 */
export function startDemoSource(currentTarget: () => MoveTarget | null, noise = 0.004): PoseSource {
  const held = new Set<string>();
  window.addEventListener('keydown', (e) => held.add(e.code));
  window.addEventListener('keyup', (e) => held.delete(e.code));
  return {
    video: null,
    aspect: () => SYNTH_ASPECT,
    read() {
      const target = currentTarget();
      let p: SynthParams = { ...NEUTRAL };
      if (target) p = { ...p, ...paramsFor(target, held.has('KeyE') ? { L: -50 } : {}) };
      if (held.has('KeyW')) p = { ...p, rUp: 1.3, rOut: 0.2 };
      if (held.has('KeyA')) p = { ...p, tilt: 24 };
      if (held.has('KeyD')) p = { ...p, tilt: -24 };
      return synthPose(p, noise);
    },
  };
}
