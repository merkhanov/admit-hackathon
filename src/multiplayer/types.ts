import type { SongId } from '../dance/songs.ts';

/**
 * A player's body in six rounded numbers: left arm direction, left elbow, right arm direction,
 * right elbow (degrees, as in dance/moves.ts), shoulder tilt (degrees) and squat depth (0..100 %).
 */
export type CompactPose = [number, number, number, number, number, number];

/** A player's live/final performance snapshot shared across the room. */
export interface MPPlayer {
  id: string;
  name: string;
  isHost: boolean;
  status: 'lobby' | 'dancing' | 'done';
  /** Current live score during the dance. */
  score: number;
  /** Current combo during the dance. */
  combo: number;
  /** Final stars (0..5), set when done. */
  stars: number;
  /** Final overall accuracy 0..100, set when done. */
  accuracy: number;
  /** When the player finished, epoch ms. */
  finishedAt: number | null;
  /** Calibrated and warmed up for the current song: the room counts down once everyone is. */
  ready: boolean;
}

export type MPPhase = 'idle' | 'lobby' | 'dancing' | 'podium';

export interface MultiplayerState {
  roomId: string | null;
  phase: MPPhase;
  players: Record<string, MPPlayer>;
  songId: SongId | null;
  /** True when this client is the host. */
  isHost: boolean;
}

/** Messages exchanged between peers (over BroadcastChannel or WebRTC data channel). */
export type MPMessage =
  | { type: 'join'; player: { id: string; name: string } }
  | { type: 'leave'; playerId: string }
  | { type: 'rename'; playerId: string; name: string }
  /** The player finished calibration (and the warm-up) and waits for the others. */
  | { type: 'ready'; playerId: string }
  | { type: 'host'; playerId: string }
  | { type: 'sync'; hostId: string; players: MPPlayer[] }
  | { type: 'songSelect'; songId: SongId }
  | { type: 'songStart'; songId: SongId; startedAt: number }
  | { type: 'liveScore'; playerId: string; score: number; combo: number }
  /** About 15 times a second while the camera is on, so desktops can draw every player's avatar. */
  | { type: 'pose'; playerId: string; pose: CompactPose }
  | { type: 'result'; playerId: string; score: number; stars: number; accuracy: number }
  | { type: 'podium'; entries: PodiumEntry[] }
  | { type: 'reset' };

export interface PodiumEntry {
  playerId: string;
  name: string;
  score: number;
  stars: number;
  accuracy: number;
  place: number;
}

/** Events the session reducer emits, for the orchestrator to react to. */
export type MPEvent =
  | { kind: 'playerJoined'; player: MPPlayer }
  | { kind: 'playerLeft'; playerId: string }
  | { kind: 'hostChanged'; playerId: string }
  | { kind: 'playerReady'; playerId: string }
  | { kind: 'songChanged'; songId: SongId }
  | { kind: 'songStarted'; songId: SongId; startedAt: number }
  | { kind: 'scoreUpdated'; playerId: string; score: number; combo: number }
  | { kind: 'resultReceived'; playerId: string }
  | { kind: 'podiumReady'; entries: PodiumEntry[] }
  | { kind: 'reset' };
