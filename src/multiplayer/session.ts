import type { MPEvent, MPMessage, MPPlayer, MultiplayerState, PodiumEntry } from './types.ts';

export const MAX_PLAYERS = 4;

export const emptyState = (): MultiplayerState => ({
  roomId: null,
  phase: 'idle',
  players: {},
  songId: null,
  isHost: false,
});

const player = (id: string, name: string, isHost: boolean): MPPlayer => ({
  id, name, isHost, status: 'lobby', score: 0, combo: 0, stars: 0, accuracy: 0, finishedAt: null,
});

/** Sort podium by score desc, then accuracy desc, then name. */
export function rankPodium(entries: PodiumEntry[]): PodiumEntry[] {
  return [...entries].sort((a, b) => b.score - a.score || b.accuracy - a.accuracy || a.name.localeCompare(b.name));
}

/**
 * Pure multiplayer session reducer. Given the current state and an incoming message,
 * returns the next state and any events the orchestrator should react to.
 */
export function stepSession(state: MultiplayerState, msg: MPMessage): { state: MultiplayerState; events: MPEvent[] } {
  const events: MPEvent[] = [];
  const players = { ...state.players };

  switch (msg.type) {
    case 'join': {
      if (players[msg.player.id]) return { state, events };
      if (Object.keys(players).length >= MAX_PLAYERS) return { state, events };
      const isHost = Object.keys(players).length === 0;
      players[msg.player.id] = player(msg.player.id, msg.player.name, isHost);
      const p = players[msg.player.id];
      events.push({ kind: 'playerJoined', player: p });
      if (isHost) events.push({ kind: 'hostChanged', playerId: p.id });
      return { state: { ...state, players, phase: state.phase === 'idle' ? 'lobby' : state.phase, isHost: state.isHost || isHost }, events };
    }
    case 'leave': {
      const left = players[msg.playerId];
      if (!left) return { state, events };
      delete players[msg.playerId];
      events.push({ kind: 'playerLeft', playerId: msg.playerId });
      // If the host left, promote the first remaining player.
      if (left.isHost) {
        const next = Object.values(players)[0];
        if (next) {
          players[next.id] = { ...players[next.id], isHost: true };
          events.push({ kind: 'hostChanged', playerId: next.id });
        }
      }
      return { state: { ...state, players }, events };
    }
    case 'host': {
      if (!players[msg.playerId]) return { state, events };
      const next: Record<string, MPPlayer> = {};
      for (const [id, p] of Object.entries(players)) next[id] = { ...p, isHost: id === msg.playerId };
      events.push({ kind: 'hostChanged', playerId: msg.playerId });
      return { state: { ...state, players: next }, events };
    }
    case 'sync': {
      // Host broadcasts full player list. Receiver replaces its roster and
      // sets host by id. Used when a guest joins an existing room.
      const next: Record<string, MPPlayer> = {};
      for (const p of msg.players) next[p.id] = { ...p, isHost: p.id === msg.hostId };
      return { state: { ...state, players: next }, events };
    }
    case 'songSelect': {
      events.push({ kind: 'songChanged', songId: msg.songId });
      return { state: { ...state, songId: msg.songId }, events };
    }
    case 'songStart': {
      events.push({ kind: 'songStarted', songId: msg.songId, startedAt: msg.startedAt });
      const next: Record<string, MPPlayer> = {};
      for (const [id, p] of Object.entries(players)) next[id] = { ...p, status: 'dancing', score: 0, combo: 0 };
      return { state: { ...state, players: next, songId: msg.songId, phase: 'dancing' }, events };
    }
    case 'liveScore': {
      const p = players[msg.playerId];
      if (!p) return { state, events };
      players[msg.playerId] = { ...p, score: msg.score, combo: msg.combo };
      events.push({ kind: 'scoreUpdated', playerId: msg.playerId, score: msg.score, combo: msg.combo });
      return { state: { ...state, players }, events };
    }
    case 'result': {
      const p = players[msg.playerId];
      if (!p) return { state, events };
      players[msg.playerId] = {
        ...p, status: 'done', score: msg.score, stars: msg.stars, accuracy: msg.accuracy, finishedAt: Date.now(),
      };
      events.push({ kind: 'resultReceived', playerId: msg.playerId });
      return { state: { ...state, players }, events };
    }
    case 'podium': {
      events.push({ kind: 'podiumReady', entries: msg.entries });
      return { state: { ...state, phase: 'podium' }, events };
    }
    case 'reset': {
      events.push({ kind: 'reset' });
      const next: Record<string, MPPlayer> = {};
      for (const [id, p] of Object.entries(players)) next[id] = { ...p, status: 'lobby', score: 0, combo: 0, stars: 0, accuracy: 0, finishedAt: null };
      return { state: { ...state, players: next, phase: 'lobby' }, events };
    }
    default: {
      const _exhaustive: never = msg;
      return { state, events: [...events, _exhaustive as unknown as MPEvent] };
    }
  }
}

/** Build the podium from the current players (host-side). */
export function buildPodium(state: MultiplayerState): PodiumEntry[] {
  const entries: PodiumEntry[] = [];
  for (const p of Object.values(state.players)) {
    if (p.status !== 'done') continue;
    entries.push({ playerId: p.id, name: p.name, score: p.score, stars: p.stars, accuracy: p.accuracy, place: 0 });
  }
  return rankPodium(entries).map((e, i) => ({ ...e, place: i + 1 }));
}
