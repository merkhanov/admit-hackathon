import { describe, expect, it } from 'vitest';
import { HIT_Z, JUMP_S, LIVES, newGame, stepGame, type GameNote, type GameState, type HazardType } from '../src/game/game.ts';
import type { TrackerEvent } from '../src/pose/tracker.ts';

const DT = 1 / 30;

/** A game with one hazard in the middle lane, `seconds` away from the player. */
function withHazard(type: HazardType, seconds: number): GameState {
  const g = newGame(1);
  g.spawnIn = 99;
  g.entities = [{ kind: 'hazard', id: 1, type, lane: 1, z: HIT_Z + g.speed * seconds }];
  return g;
}

function run(g: GameState, seconds: number, eventsAt: Record<number, TrackerEvent[]> = {}) {
  const notes: GameNote[] = [];
  let state = g;
  for (let i = 0; i * DT < seconds; i++) {
    const r = stepGame(state, eventsAt[i] ?? [], DT);
    state = r.state;
    notes.push(...r.notes);
  }
  return { state, notes };
}

describe('hazards', () => {
  it('jumping just before a barrier clears it', () => {
    const { state, notes } = run(withHazard('barrier', 1), 1.5, { 20: ['jump'] });
    expect(state.lives).toBe(LIVES);
    expect(notes).toContainEqual(expect.objectContaining({ kind: 'clear', type: 'barrier' }));
  });

  it('jumping too early fails, and the hit explains which gesture was needed', () => {
    const early = Math.round((1 - JUMP_S - 0.1) / DT) - 5;
    const { state, notes } = run(withHazard('barrier', 1), 1.5, { [early]: ['jump'] });
    expect(state.lives).toBe(LIVES - 1);
    expect(notes).toContainEqual(expect.objectContaining({ kind: 'hit', text: expect.stringContaining('подними руку выше головы') }));
  });

  it('a held duck passes under a bar', () => {
    const { state } = run(withHazard('bar', 1), 1.5, { 5: ['duckStart'] });
    expect(state.lives).toBe(LIVES);
    expect(state.stats.cleared).toBe(1);
  });

  it('a wall must be avoided by changing lane', () => {
    expect(run(withHazard('wall', 1), 1.5, { 5: ['jump'] }).state.lives).toBe(LIVES - 1);
    expect(run(withHazard('wall', 1), 1.5, { 5: ['leanL'] }).state.lives).toBe(LIVES);
  });

  it('a punch only smashes a crate that is within reach', () => {
    const far = run(withHazard('crate', 2), 2.5, { 0: ['punch'] });
    expect(far.state.lives).toBe(LIVES - 1);
    const near = run(withHazard('crate', 1), 1.5, { 20: ['punch'] });
    expect(near.state.lives).toBe(LIVES);
    expect(near.notes).toContainEqual({ kind: 'smash', lane: 1 });
  });
});

describe('lanes', () => {
  it('leans move one lane and stop at the edges', () => {
    const { state } = run(newGame(1), 0.2, { 0: ['leanL'], 1: ['leanL'], 2: ['leanL'] });
    expect(state.lane).toBe(0);
  });
});

describe('round', () => {
  it('an idle player loses every life, the game ends and stays over', () => {
    const { state, notes } = run(newGame(42), 90);
    expect(state.status).toBe('over');
    expect(state.lives).toBe(0);
    expect(notes.filter((n) => n.kind === 'over')).toHaveLength(1);
  });

  it('never spawns a row that is walls in every lane', () => {
    const g = newGame(7);
    let state = g;
    const rows = new Map<number, Set<number>>();
    for (let i = 0; i < 30 * 120 && state.status === 'running'; i++) {
      state = stepGame({ ...state, lives: 99 }, [], DT).state;
      for (const e of state.entities) {
        if (e.kind === 'hazard' && e.type === 'wall' && e.z > 0.99) {
          const key = Math.round(state.time * 100);
          rows.set(key, (rows.get(key) ?? new Set()).add(e.lane));
        }
      }
    }
    for (const lanes of rows.values()) expect(lanes.size).toBeLessThan(3);
  });
});
