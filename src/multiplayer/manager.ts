import { buildPodium, emptyState, stepSession } from './session.ts';
import type { CompactPose, MPEvent, MPMessage, MultiplayerState, PodiumEntry } from './types.ts';
import type { MPTransport } from './transport.ts';
import type { SongId } from '../dance/songs.ts';

/**
 * Multiplayer orchestrator: owns the session state, talks to the transport,
 * and exposes a game-flow API. Transport-agnostic (PeerJS or WebRTC).
 *
 * Join protocol:
 * - Host connects, applies its own `join`, becomes host.
 * - Guest connects, sends `join` without applying locally.
 * - Host receives guest `join`, applies it, broadcasts `sync` with full roster.
 * - Guest receives `sync`, adopts the roster. All peers converge.
 */
export class MPManager {
  private transport: MPTransport;
  private selfId: string;
  private name: string;
  private state: MultiplayerState = emptyState();
  private wantsHost = false;
  private hasSynced = false;
  private changeCbs: (() => void)[] = [];
  private eventCbs: ((ev: MPEvent) => void)[] = [];
  private poseCbs: ((playerId: string, pose: CompactPose) => void)[] = [];

  constructor(selfId: string, name: string, transport: MPTransport) {
    this.selfId = selfId;
    this.name = name;
    this.transport = transport;
    this.transport.onMessage((msg) => this.receive(msg));
    this.transport.onEvent((ev) => {
      if (ev.kind === 'connected' && ev.roomId) this.onConnected();
      if (ev.kind === 'disconnected') this.emitEvents([{ kind: 'reset' }]);
      if (ev.kind === 'host-changed' && ev.hostId === this.selfId) {
        this.state = { ...this.state, isHost: true };
        this.notifyChange();
      }
    });
  }

  get self(): string {
    return this.selfId;
  }

  getState(): MultiplayerState {
    return this.state;
  }

  onChange(cb: () => void): void {
    this.changeCbs.push(cb);
  }

  onEvent(cb: (ev: MPEvent) => void): void {
    this.eventCbs.push(cb);
  }

  /** Other players' poses as they arrive; our own are never echoed back. */
  onPose(cb: (playerId: string, pose: CompactPose) => void): void {
    this.poseCbs.push(cb);
  }

  /** Changes our nickname; in a room the new name reaches every peer's roster. */
  setName(name: string): void {
    this.name = name;
    if (this.state.roomId) this.dispatch({ type: 'rename', playerId: this.selfId, name });
  }

  /** We calibrated for the current song and wait for the others before the countdown. */
  sendReady(): void {
    if (!this.state.roomId) return;
    this.dispatch({ type: 'ready', playerId: this.selfId });
  }

  connect(roomId: string, wantsHost: boolean): void {
    this.wantsHost = wantsHost;
    this.hasSynced = false;
    this.state = { ...emptyState(), roomId, isHost: wantsHost };
    this.transport.connect(roomId, wantsHost);
  }

  disconnect(): void {
    if (this.state.roomId) {
      try {
        this.transport.send({ type: 'leave', playerId: this.selfId });
      } catch {
        // Transport already dead; nothing to announce.
      }
    }
    this.transport.close();
    this.state = emptyState();
    this.notifyChange();
  }

  /** Am I the host of this room? */
  amHost(): boolean {
    return this.state.isHost;
  }

  /** How often a client broadcasts its live score during the dance (ms). */
  static readonly LIVE_SCORE_MS = 1000;

  sendLiveScore(score: number, combo: number): void {
    if (!this.state.roomId) return;
    this.dispatch({ type: 'liveScore', playerId: this.selfId, score, combo });
  }

  /** How often a client streams its pose during the dance (ms). */
  static readonly POSE_MS = 100;

  sendPose(pose: CompactPose): void {
    if (!this.state.roomId) return;
    this.transport.send({ type: 'pose', playerId: this.selfId, pose });
  }

  sendResult(score: number, stars: number, accuracy: number): void {
    if (!this.state.roomId) return;
    this.dispatch({ type: 'result', playerId: this.selfId, score, stars, accuracy });
  }

  /** Host only: choose the song for the round. */
  selectSong(songId: SongId): void {
    if (!this.amHost()) return;
    this.dispatch({ type: 'songSelect', songId });
  }

  /** Host only: start the song on all clients at the same time. */
  startSong(songId: SongId): void {
    if (!this.amHost()) return;
    this.dispatch({ type: 'songStart', songId, startedAt: Date.now() });
  }

  /** Host only: aggregate results and broadcast the podium. */
  publishPodium(): PodiumEntry[] {
    const entries = buildPodium(this.state);
    if (this.amHost() && entries.length > 0) {
      this.dispatch({ type: 'podium', entries });
    }
    return entries;
  }

  /** Host only: reset the room back to lobby. */
  resetRoom(): void {
    if (!this.amHost()) return;
    this.dispatch({ type: 'reset' });
  }

  private onConnected(): void {
    if (this.wantsHost) {
      this.dispatch({ type: 'join', player: { id: this.selfId, name: this.name } });
      this.state = { ...this.state, isHost: true };
    } else {
      // Guest: announce, but adopt the host's roster via `sync`.
      this.transport.send({ type: 'join', player: { id: this.selfId, name: this.name } });
      this.state = { ...this.state, isHost: false };
    }
    this.notifyChange();
  }

  /** Apply locally and broadcast to peers. */
  private dispatch(msg: MPMessage): void {
    const { state, events } = stepSession(this.state, msg);
    // Preserve our own host flag; the reducer only knows the roster.
    const isHost = this.state.isHost;
    this.state = { ...state, isHost };
    this.transport.send(msg);
    this.emitEvents(events);
    this.notifyChange();
    // Host keeps newcomers in sync after every roster change.
    if ((msg.type === 'join' || msg.type === 'leave') && this.amHost()) {
      this.sendSync();
    }
  }

  private receive(msg: MPMessage): void {
    if (msg.type === 'pose') {
      if (msg.playerId !== this.selfId) for (const cb of this.poseCbs) cb(msg.playerId, msg.pose);
      return;
    }
    if (msg.type === 'sync') {
      const { state } = stepSession(this.state, msg);
      this.state = { ...state, isHost: this.wantsHost && Object.keys(state.players).length <= 1 };
      // If the host lists us, we're a guest; if not listed yet, keep waiting.
      if (this.state.players[this.selfId]) {
        this.state = { ...this.state, isHost: this.state.players[this.selfId].isHost };
        this.hasSynced = true;
      }
      this.notifyChange();
      return;
    }
    // A guest that hasn't synced yet ignores roster messages; the host's
    // `sync` is the source of truth.
    if (!this.amHost() && !this.hasSynced && (msg.type === 'join' || msg.type === 'leave' || msg.type === 'host')) {
      return;
    }
    const { state, events } = stepSession(this.state, msg);
    const isHost = this.state.isHost;
    this.state = { ...state, isHost };
    this.emitEvents(events);
    this.notifyChange();
    if (msg.type === 'join' && this.amHost()) {
      this.sendSync();
    }
  }

  private sendSync(): void {
    const players = Object.values(this.state.players);
    const host = players.find((p) => p.isHost);
    this.transport.send({ type: 'sync', hostId: host ? host.id : this.selfId, players });
  }

  private emitEvents(events: MPEvent[]): void {
    for (const e of events) for (const cb of this.eventCbs) cb(e);
  }

  private notifyChange(): void {
    for (const cb of this.changeCbs) cb();
  }
}
