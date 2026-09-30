import { describe, expect, it } from 'vitest';
import { newDance, stepDance } from '../src/dance/dance.ts';
import { bodyAngles } from '../src/dance/judge.ts';
import { clipSeconds, loopBeats, mocapPose, songClipSeconds } from '../src/dance/mocap.ts';
import { SAMBA } from '../src/dance/mocap/samba.ts';
import { poseAt } from '../src/dance/motion.ts';
import { MOVES } from '../src/dance/moves.ts';
import { INPUT_LAG_S, songDuration, stepAt } from '../src/dance/song.ts';
import { songInfo } from '../src/dance/songs.ts';
import { paramsFor } from '../src/dance/targetPose.ts';
import { features } from '../src/pose/features.ts';
import { NEUTRAL, SYNTH_ASPECT, synthPose } from '../src/pose/synthetic.ts';

const neutral = features(synthPose(NEUTRAL), SYNTH_ASPECT);
if (!neutral.present) throw new Error('visible');
const CALIB = { midY: neutral.midY, sw: neutral.sw };

describe('recorded dance', () => {
  it('the samba recording loops on whole beats and plays at its own tempo', () => {
    expect(loopBeats(SAMBA)).toBe(32);
    expect(clipSeconds(SAMBA, 32)).toBeCloseTo(0);
    expect(clipSeconds(SAMBA, -1)).toBeCloseTo(31 * SAMBA.beat);
    const song = songInfo('samba')?.song;
    if (!song) throw new Error('samba is a built-in song');
    expect(song.bpm).toBeCloseTo(60 / SAMBA.beat);
    expect(songClipSeconds(song, (song.introBeats * 60) / song.bpm)).toBeCloseTo(0);
  });

  it('the recorded body moves like a person: hands never jump between frames', () => {
    // Where the hand is, in arm lengths from the shoulder: a folded arm's direction may swing, its hand doesn't.
    const hand = (a: { dir: number; elbow: number }) => {
      const reach = Math.sin((a.elbow * Math.PI) / 360);
      return [reach * Math.sin((a.dir * Math.PI) / 180), -reach * Math.cos((a.dir * Math.PI) / 180)];
    };
    const steps: number[] = [];
    let lean = 0;
    for (let t = 0; t < loopBeats(SAMBA) * SAMBA.beat; t += 1 / 60) {
      const a = mocapPose(SAMBA, t), b = mocapPose(SAMBA, t + 1 / 60);
      for (const s of ['L', 'R'] as const) {
        const p = hand(a.arms[s]), q = hand(b.arms[s]);
        steps.push(Math.hypot(p[0] - q[0], p[1] - q[1]));
      }
      lean = Math.max(lean, Math.abs(b.tilt - a.tilt));
    }
    // A fast dancer's hand peaks around 5 m/s; 0.2 arm lengths (about 12 cm) per sixtieth of a second is ~7 m/s.
    // The rare exceptions are an arm unfolding from pointing straight at the camera, which looks as sudden
    // on a player's camera as on the coach's.
    steps.sort((x, y) => x - y);
    expect(steps[Math.floor(steps.length * 0.99)]).toBeLessThan(0.2);
    expect(lean).toBeLessThan(5);
  });

  it('standing in each pictogram pose does not pass for the samba', () => {
    const song = songInfo('samba')?.song;
    if (!song) throw new Error('samba');
    const play = (frozen: boolean) => {
      let state = newDance();
      for (let t = 0; t <= songDuration(song) + 1; t += 1 / 30) {
        const i = stepAt(song, t - INPUT_LAG_S);
        const pose = frozen ? (i >= 0 ? song.steps[i].pose ?? MOVES[song.steps[i].move] : null) : poseAt(song, t - INPUT_LAG_S);
        const body = bodyAngles(features(synthPose({ ...NEUTRAL, ...(pose ? paramsFor(pose) : {}) }), SYNTH_ASPECT), CALIB);
        state = stepDance(state, song, t, body).state;
      }
      return state;
    };
    const moving = play(false), frozen = play(true);
    expect(moving.counts.perfect).toBe(song.steps.length);
    expect(frozen.points).toBeLessThan(moving.points * 0.8);
  });
});
