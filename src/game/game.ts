import type { TrackerEvent } from '../pose/tracker.ts';

export type Lane = 0 | 1 | 2;
export type HazardType = 'barrier' | 'bar' | 'wall' | 'crate';

export type Entity =
  | { kind: 'hazard'; id: number; type: HazardType; lane: Lane; z: number }
  | { kind: 'coin'; id: number; lane: Lane; z: number };

export type GameNote =
  | { kind: 'jump' }
  | { kind: 'punch' }
  | { kind: 'lane'; lane: Lane }
  | { kind: 'smash'; lane: Lane }
  | { kind: 'coin'; lane: Lane }
  | { kind: 'clear'; type: HazardType; text: string }
  | { kind: 'hit'; type: HazardType; text: string }
  | { kind: 'over' };

export interface GameStats {
  cleared: number;
  dodged: number;
  hits: Record<HazardType, number>;
}

export interface GameState {
  status: 'running' | 'over';
  time: number;
  lane: Lane;
  jumpT: number;
  punchT: number;
  ducking: boolean;
  invulnT: number;
  entities: Entity[];
  nextId: number;
  spawnIn: number;
  /** World units per second. An entity spawns at z = 1 and reaches the player at z = 0. */
  speed: number;
  distance: number;
  score: number;
  coins: number;
  lives: number;
  seed: number;
  stats: GameStats;
}

export const JUMP_S = 0.8;
export const PUNCH_S = 0.3;
export const PUNCH_REACH = 0.4;
export const HIT_Z = 0.03;
export const START_SPEED = 0.34;
export const MAX_SPEED = 0.85;
export const LIVES = 3;
const INVULN_S = 1.2;

/** In-game explanation of what the player should have done. Part of the error mode. */
export const MISS_TEXT: Record<HazardType, string> = {
  barrier: 'Барьер! Чтобы перепрыгнуть, подними руку выше головы',
  bar: 'Перекладина! Присядь, чтобы пригнуться',
  wall: 'Стена! Наклонись влево или вправо, чтобы сменить дорожку',
  crate: 'Ящик! Вытяни прямую руку в сторону на уровне плеча, чтобы разбить',
};
const CLEAR_TEXT: Record<HazardType, string> = {
  barrier: 'Перепрыгнул!', bar: 'Пригнулся!', wall: 'Увернулся!', crate: 'Разбил!',
};

export function newGame(seed: number): GameState {
  return {
    status: 'running', time: 0, lane: 1, jumpT: 0, punchT: 0, ducking: false, invulnT: 0,
    entities: [], nextId: 1, spawnIn: 1.2, speed: START_SPEED, distance: 0, score: 0, coins: 0,
    lives: LIVES, seed, stats: { cleared: 0, dodged: 0, hits: { barrier: 0, bar: 0, wall: 0, crate: 0 } },
  };
}

function random(g: GameState): number {
  g.seed = (g.seed * 1664525 + 1013904223) >>> 0;
  return g.seed / 4294967296;
}

const LANES: readonly Lane[] = [0, 1, 2];
type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;
const pick = <T>(g: GameState, items: readonly T[]): T => items[Math.floor(random(g) * items.length)];

/** A row never blocks all lanes with walls, so every row can be passed by moving or by a gesture. */
function spawnRow(g: GameState): void {
  const early = g.time < 10;
  const types: readonly HazardType[] = early ? ['barrier', 'bar', 'crate', 'wall'] : ['barrier', 'bar', 'crate', 'wall', 'wall'];
  const first = pick(g, LANES);
  const add = (e: WithoutId<Entity>) => {
    g.entities.push({ ...e, id: g.nextId++ });
  };
  const firstType = pick(g, types);
  add({ kind: 'hazard', type: firstType, lane: first, z: 1 });
  const others = LANES.filter((l) => l !== first);
  if (!early && random(g) < 0.45) {
    const second = pick(g, others);
    const nonWall: readonly HazardType[] = ['barrier', 'bar', 'crate'];
    add({ kind: 'hazard', type: firstType === 'wall' ? pick(g, nonWall) : pick(g, types), lane: second, z: 1 });
    const free = others.find((l) => l !== second);
    if (free !== undefined && random(g) < 0.6) add({ kind: 'coin', lane: free, z: 1 });
  } else if (random(g) < 0.7) {
    add({ kind: 'coin', lane: pick(g, others), z: 1 });
  }
}

/** Pure step: (state, gesture events, dt seconds) -> new state and notes for sound and effects. */
export function stepGame(state: GameState, events: readonly TrackerEvent[], dt: number): { state: GameState; notes: GameNote[] } {
  const g = structuredClone(state);
  const notes: GameNote[] = [];
  if (g.status === 'over') return { state: g, notes };

  for (const e of events) {
    switch (e) {
      case 'jump':
        if (g.jumpT === 0) { g.jumpT = JUMP_S; notes.push({ kind: 'jump' }); }
        break;
      case 'leanL':
      case 'leanR': {
        const next = e === 'leanL' ? g.lane - 1 : g.lane + 1;
        if (next === 0 || next === 1 || next === 2) { g.lane = next; notes.push({ kind: 'lane', lane: next }); }
        break;
      }
      case 'punch': {
        g.punchT = PUNCH_S;
        notes.push({ kind: 'punch' });
        const target = g.entities.find((x) => x.kind === 'hazard' && x.type === 'crate' && x.lane === g.lane && x.z < PUNCH_REACH);
        if (target) {
          g.entities = g.entities.filter((x) => x.id !== target.id);
          g.score += 30;
          g.stats.cleared++;
          notes.push({ kind: 'smash', lane: g.lane });
        }
        break;
      }
      case 'duckStart': g.ducking = true; break;
      case 'duckEnd': g.ducking = false; break;
      case 'calibrated': break;
      default: { const _exhaustive: never = e; void _exhaustive; }
    }
  }

  g.time += dt;
  g.jumpT = Math.max(0, g.jumpT - dt);
  g.punchT = Math.max(0, g.punchT - dt);
  g.invulnT = Math.max(0, g.invulnT - dt);
  g.speed = Math.min(MAX_SPEED, START_SPEED + g.time * 0.006);
  g.distance += g.speed * dt;
  g.score += g.speed * dt * 20;

  g.spawnIn -= dt;
  if (g.spawnIn <= 0) {
    spawnRow(g);
    g.spawnIn = Math.max(0.75, 1.9 - g.speed * 1.2);
  }

  for (const x of g.entities) x.z -= g.speed * dt;
  const reached = g.entities.filter((x) => x.z <= HIT_Z);
  g.entities = g.entities.filter((x) => x.z > HIT_Z);

  for (const x of reached) {
    if (x.kind === 'coin') {
      if (x.lane === g.lane) { g.coins++; g.score += 25; notes.push({ kind: 'coin', lane: x.lane }); }
      continue;
    }
    if (x.lane !== g.lane) { g.stats.dodged++; g.score += 5; continue; }
    const passed = (x.type === 'barrier' && g.jumpT > 0) || (x.type === 'bar' && g.ducking);
    if (passed) {
      g.stats.cleared++;
      g.score += 20;
      notes.push({ kind: 'clear', type: x.type, text: CLEAR_TEXT[x.type] });
    } else if (g.invulnT === 0) {
      g.lives--;
      g.invulnT = INVULN_S;
      g.stats.hits[x.type]++;
      notes.push({ kind: 'hit', type: x.type, text: MISS_TEXT[x.type] });
    }
  }

  if (g.lives <= 0) {
    g.status = 'over';
    g.score = Math.round(g.score);
    notes.push({ kind: 'over' });
  }
  return { state: g, notes };
}
