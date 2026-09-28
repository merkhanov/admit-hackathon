import { describe, expect, it } from 'vitest';
import { buildPodium, emptyState, MAX_PLAYERS, rankPodium, stepSession } from '../src/multiplayer/session.ts';
import type { PodiumEntry } from '../src/multiplayer/types.ts';

const join = (id: string, name: string) => ({ type: 'join' as const, player: { id, name } });

describe('multiplayer session', () => {
  it('first joiner becomes host', () => {
    const { state, events } = stepSession(emptyState(), join('a', 'Alice'));
    expect(state.players.a.isHost).toBe(true);
    expect(state.isHost).toBe(true);
    expect(state.phase).toBe('lobby');
    expect(events.some((e) => e.kind === 'hostChanged')).toBe(true);
  });

  it('subsequent joiners are guests', () => {
    let s = emptyState();
    s = stepSession(s, join('a', 'Alice')).state;
    const { state } = stepSession(s, join('b', 'Bob'));
    expect(state.players.a.isHost).toBe(true);
    expect(state.players.b.isHost).toBe(false);
  });

  it('caps at MAX_PLAYERS', () => {
    let s = emptyState();
    for (let i = 0; i < MAX_PLAYERS + 2; i++) s = stepSession(s, join(`p${i}`, `P${i}`)).state;
    expect(Object.keys(s.players).length).toBe(MAX_PLAYERS);
  });

  it('promotes next player when host leaves', () => {
    let s = emptyState();
    s = stepSession(s, join('a', 'Alice')).state;
    s = stepSession(s, join('b', 'Bob')).state;
    const { state, events } = stepSession(s, { type: 'leave', playerId: 'a' });
    expect(state.players.b.isHost).toBe(true);
    expect(events.some((e) => e.kind === 'hostChanged' && e.playerId === 'b')).toBe(true);
  });

  it('songStart resets scores and sets phase to dancing', () => {
    let s = emptyState();
    s = stepSession(s, join('a', 'Alice')).state;
    s = stepSession(s, { type: 'liveScore', playerId: 'a', score: 100, combo: 2 }).state;
    const { state } = stepSession(s, { type: 'songStart', songId: 'neonSteps', startedAt: 0 });
    expect(state.phase).toBe('dancing');
    expect(state.players.a.score).toBe(0);
    expect(state.players.a.status).toBe('dancing');
  });

  it('liveScore updates a player', () => {
    let s = emptyState();
    s = stepSession(s, join('a', 'Alice')).state;
    const { state, events } = stepSession(s, { type: 'liveScore', playerId: 'a', score: 250, combo: 3 });
    expect(state.players.a.score).toBe(250);
    expect(state.players.a.combo).toBe(3);
    expect(events.some((e) => e.kind === 'scoreUpdated')).toBe(true);
  });

  it('result marks a player done', () => {
    let s = emptyState();
    s = stepSession(s, join('a', 'Alice')).state;
    const { state } = stepSession(s, { type: 'result', playerId: 'a', score: 500, stars: 4, accuracy: 88 });
    expect(state.players.a.status).toBe('done');
    expect(state.players.a.stars).toBe(4);
  });

  it('reset returns everyone to lobby', () => {
    let s = emptyState();
    s = stepSession(s, join('a', 'Alice')).state;
    s = stepSession(s, { type: 'songStart', songId: 'neonSteps', startedAt: 0 }).state;
    s = stepSession(s, { type: 'result', playerId: 'a', score: 500, stars: 4, accuracy: 88 }).state;
    const { state } = stepSession(s, { type: 'reset' });
    expect(state.phase).toBe('lobby');
    expect(state.players.a.status).toBe('lobby');
    expect(state.players.a.score).toBe(0);
  });
});

describe('podium', () => {
  it('ranks by score desc', () => {
    const entries: PodiumEntry[] = [
      { playerId: 'a', name: 'A', score: 100, stars: 1, accuracy: 50, place: 0 },
      { playerId: 'b', name: 'B', score: 300, stars: 3, accuracy: 90, place: 0 },
      { playerId: 'c', name: 'C', score: 200, stars: 2, accuracy: 70, place: 0 },
    ];
    const ranked = rankPodium(entries);
    expect(ranked.map((e) => e.playerId)).toEqual(['b', 'c', 'a']);
  });

  it('buildPodium only includes done players and assigns places', () => {
    let s = emptyState();
    s = stepSession(s, join('a', 'Alice')).state;
    s = stepSession(s, join('b', 'Bob')).state;
    s = stepSession(s, { type: 'result', playerId: 'a', score: 100, stars: 1, accuracy: 50 }).state;
    s = stepSession(s, { type: 'result', playerId: 'b', score: 300, stars: 3, accuracy: 90 }).state;
    const podium = buildPodium(s);
    expect(podium).toHaveLength(2);
    expect(podium[0].playerId).toBe('b');
    expect(podium[0].place).toBe(1);
    expect(podium[1].place).toBe(2);
  });
});
