import { describe, expect, it } from 'vitest';
import { newDance, rate, stars, stepDance, maxPoints, type Verdict } from '../src/dance/dance.ts';
import { bodyAngles, evaluate } from '../src/dance/judge.ts';
import { MOVE_IDS, MOVES, type MoveId } from '../src/dance/moves.ts';
import { INPUT_LAG_S, songDuration, stepAt, type Song } from '../src/dance/song.ts';
import { customSong, danceTempo, SONGS } from '../src/dance/songs.ts';
import { paramsFor } from '../src/dance/targetPose.ts';
import { features } from '../src/pose/features.ts';
import { NEUTRAL, SYNTH_ASPECT, seededRandom, synthPose, type SynthParams } from '../src/pose/synthetic.ts';

const neutral = features(synthPose(NEUTRAL), SYNTH_ASPECT);
if (!neutral.present) throw new Error('neutral pose must be visible');
const CALIB = { midY: neutral.midY, sw: neutral.sw };

function bodyFor(params: Partial<SynthParams>, noise = 0, random = Math.random) {
  const body = bodyAngles(features(synthPose({ ...NEUTRAL, ...params }, noise, random), SYNTH_ASPECT), CALIB);
  if (!body) throw new Error('body must be visible');
  return body;
}

const scoreOf = (target: MoveId, performed: MoveId) => evaluate(MOVES[target], bodyFor(paramsFor(MOVES[performed]))).score;

describe('moves', () => {
  it.each(MOVE_IDS)('%s performed exactly scores Perfect', (id) => {
    expect(rate(scoreOf(id, id))).toBe('perfect');
  });

  it('every move is told apart from every other move', () => {
    const confusions: string[] = [];
    for (const target of MOVE_IDS) {
      for (const performed of MOVE_IDS) {
        if (target !== performed && scoreOf(target, performed) >= 0.65) confusions.push(`${performed} counted as ${target}`);
      }
    }
    expect(confusions).toEqual([]);
  });

  it('standing still is a miss for every move', () => {
    for (const id of MOVE_IDS) expect(rate(evaluate(MOVES[id], bodyFor({})).score)).toBe('miss');
  });
});

describe('framing', () => {
  it('a lowered arm below the bottom of the frame still counts as down', () => {
    const at = { sw: 0.3, sy: 0.55 };
    const n = features(synthPose({ ...NEUTRAL, ...at }), SYNTH_ASPECT);
    if (!n.present) throw new Error('visible');
    const lm = synthPose({ ...NEUTRAL, ...at, ...paramsFor(MOVES.leftUp) });
    expect(lm[16].y).toBeGreaterThan(1); // the right wrist is off the bottom edge
    const body = bodyAngles(features(lm, SYNTH_ASPECT), { midY: n.midY, sw: n.sw });
    if (!body) throw new Error('visible');
    expect(rate(evaluate(MOVES.leftUp, body).score)).toBe('perfect');
  });

  it('an arm that should be up but is below the frame is named', () => {
    const at = { sw: 0.3, sy: 0.64 };
    const n = features(synthPose({ ...NEUTRAL, ...at }), SYNTH_ASPECT);
    if (!n.present) throw new Error('visible');
    const lm = synthPose({ ...NEUTRAL, ...at });
    expect(lm[15].y).toBeGreaterThan(1);
    const body = bodyAngles(features(lm, SYNTH_ASPECT), { midY: n.midY, sw: n.sw });
    if (!body) throw new Error('visible');
    expect(evaluate(MOVES.up, body).worst?.hint).toMatch(/рука ниже кадра: подними её/);
  });

  it('a shoulder hiked by a raised arm does not spoil a one-arm move', () => {
    const e = evaluate(MOVES.leftUp, bodyFor({ ...paramsFor(MOVES.leftUp), tilt: -12 }));
    expect(rate(e.score)).toBe('perfect');
  });
});

describe('corrections', () => {
  it('a low left arm gets "raise it" with the angle', () => {
    const e = evaluate(MOVES.up, bodyFor(paramsFor(MOVES.up, { L: -45 })));
    expect(e.worst?.hint).toBe('Левая рука: подними выше на 45°');
  });

  it('an arm too high on a sideways move gets "lower it"', () => {
    const e = evaluate(MOVES.wings, bodyFor(paramsFor(MOVES.wings, { R: 40 })));
    expect(e.worst?.hint).toBe('Правая рука: опусти ниже на 40°');
  });

  it('a straight arm on the muscles move asks to bend the elbow', () => {
    const e = evaluate(MOVES.muscles, bodyFor(paramsFor(MOVES.vee)));
    expect(e.worst?.hint).toMatch(/Согни (левый|правый) локоть: сейчас \d+°, нужно около 80°/);
  });

  it('a weak lean asks to lean further, with degrees', () => {
    const e = evaluate(MOVES.leanL, bodyFor({ ...paramsFor(MOVES.leanL), tilt: 4 }));
    expect(e.worst?.hint).toBe('Наклонись влево сильнее: сейчас 4°, нужно 15°');
  });

  it('a shallow squat asks to go lower', () => {
    const e = evaluate(MOVES.squat, bodyFor({ ...paramsFor(MOVES.squat), drop: 0.1 }));
    expect(e.worst?.hint).toContain('Присядь ниже');
  });

  it('a hidden arm is named, not silently failed', () => {
    const e = evaluate(MOVES.wings, bodyFor({ ...paramsFor(MOVES.wings), sw: 0.5, sy: 0.45 }));
    expect(e.worst?.hint).toMatch(/Не вижу (левую|правую) руку/);
  });
});

const SONG = SONGS[0].song;

/** Plays the whole song with a dancer that performs each move `lag` seconds after the coach. */
function playSong({ lag, errorOn, noise = 0, song: SONG_ = SONG }: { lag: number; errorOn?: MoveId; noise?: number; song?: Song }) {
  const SONG = SONG_;
  const random = seededRandom(5);
  let state = newDance();
  const verdicts: Verdict[] = [];
  for (let t = 0; t <= songDuration(SONG) + 1; t += 1 / 30) {
    const i = stepAt(SONG, t - lag);
    const move: MoveId | null = i >= 0 ? SONG.steps[i].move : null;
    const params = move ? paramsFor(MOVES[move], move === errorOn ? { L: -50 } : {}) : {};
    const r = stepDance(state, SONG, t, bodyFor(params, noise, random));
    state = r.state;
    verdicts.push(...r.verdicts);
  }
  return { state, verdicts };
}

describe('songs', () => {
  it.each(SONGS.map((s) => [s.song.title, s.song] as const))('«%s»: a dancer on the beat gets Perfect on every move', (_, song) => {
    const { state, verdicts } = playSong({ lag: INPUT_LAG_S, song });
    expect(verdicts).toHaveLength(song.steps.length);
    expect(state.counts.perfect).toBe(song.steps.length);
  });

  it('every built-in song lasts about a minute and has its own id', () => {
    for (const { song } of SONGS) {
      expect(songDuration(song)).toBeGreaterThan(50);
      expect(songDuration(song)).toBeLessThan(80);
    }
    expect(new Set(SONGS.map((s) => s.song.id)).size).toBe(SONGS.length);
  });

  it('every move is used by some song', () => {
    const used = new Set(SONGS.flatMap((s) => s.song.steps.map((st) => st.move)));
    expect(MOVE_IDS.filter((id) => !used.has(id))).toEqual([]);
  });
});

describe('a dance for your own song', () => {
  it('counts half-time and double-time tempos in a comfortable range', () => {
    expect(danceTempo(70)).toBe(140);
    expect(danceTempo(170)).toBe(85);
    expect(danceTempo(128)).toBe(128);
  });

  it('fits the song, keeps about a move a second, and is the same for the same song', () => {
    for (const bpm of [84, 100, 128, 150]) {
      const song = customSong('Моя песня', bpm, 75);
      expect(songDuration(song)).toBeLessThanOrEqual(75);
      const moveS = (song.steps[0].beats * 60) / song.bpm;
      expect(moveS).toBeGreaterThanOrEqual(0.9);
      expect(moveS).toBeLessThanOrEqual(1.7);
      expect(song.steps.length % 4).toBe(0);
    }
    expect(customSong('A', 120, 60).steps).toEqual(customSong('A', 120, 60).steps);
    expect(customSong('A', 120, 60).steps).not.toEqual(customSong('B', 120, 60).steps);
  });

  it('stops at the length limit for a long song', () => {
    expect(songDuration(customSong('Long', 120, 600))).toBeLessThanOrEqual(90);
  });

  it('a dancer on the beat gets Perfect on every generated move', () => {
    const song = customSong('Проверка', 117, 70);
    const { state } = playSong({ lag: INPUT_LAG_S, song });
    expect(state.counts.perfect).toBe(song.steps.length);
  });
});

describe('timing', () => {
  it('a dancer exactly on the beat, seen through the input lag, gets Perfect on every move', () => {
    const { state, verdicts } = playSong({ lag: INPUT_LAG_S });
    expect(verdicts).toHaveLength(SONG.steps.length);
    expect(state.counts.perfect).toBe(SONG.steps.length);
    expect(state.finished).toBe(true);
    expect(stars(state.points, SONG)).toBe(5);
  });

  it('camera jitter does not cost Perfects', () => {
    const { state } = playSong({ lag: INPUT_LAG_S, noise: 0.01 });
    expect(state.counts.perfect).toBeGreaterThanOrEqual(SONG.steps.length - 1);
  });

  it('one wrong arm on a move gives that move a correction, the rest stay Perfect', () => {
    const { verdicts } = playSong({ lag: INPUT_LAG_S, errorOn: 'muscles' });
    const wrong = verdicts.filter((v) => v.rating !== 'perfect');
    expect(wrong.every((v) => v.move === 'muscles')).toBe(true);
    expect(wrong[0].hint).toMatch(/Левая рука: подними выше/);
  });

  it('the correction names the arm that stayed wrong, not one that swept through the target', () => {
    const { verdicts } = playSong({ lag: INPUT_LAG_S, errorOn: 'discoR' });
    const wrong = verdicts.filter((v) => v.move === 'discoR');
    expect(wrong.length).toBeGreaterThan(0);
    for (const v of wrong) expect(v.part).toBe('armL');
  });

  it('nobody in frame is a Miss with a framing hint', () => {
    let state = newDance();
    const verdicts: Verdict[] = [];
    for (let t = 0; t < 7; t += 1 / 30) {
      const r = stepDance(state, SONG, t, null);
      state = r.state;
      verdicts.push(...r.verdicts);
    }
    expect(verdicts[0]).toMatchObject({ rating: 'miss', hint: expect.stringContaining('Не видно тебя') });
    expect(state.points).toBe(0);
    expect(maxPoints(SONG)).toBe(SONG.steps.length * 100);
  });
});
