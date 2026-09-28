import type { MPMessage } from './types.ts';

/** Transport-level events (not game messages). */
export type TransportEvent =
  | { kind: 'connected'; roomId: string; isHost: boolean }
  | { kind: 'peer-joined'; peerId: string }
  | { kind: 'peer-left'; peerId: string }
  | { kind: 'host-changed'; hostId: string }
  | { kind: 'disconnected' };

/**
 * A multiplayer transport: BroadcastChannel (same-device tabs) or WebRTC
 * (cross-device). The orchestrator is transport-agnostic — it only talks to
 * this interface.
 */
export interface MPTransport {
  /** Connect to a room. `isHost` hints whether this client should act as host. */
  connect(roomId: string, isHost: boolean): void;
  /** Broadcast a game message to all peers. */
  send(msg: MPMessage): void;
  /** Subscribe to incoming game messages. */
  onMessage(cb: (msg: MPMessage) => void): void;
  /** Subscribe to transport-level events. */
  onEvent(cb: (ev: TransportEvent) => void): void;
  /** Close the transport. */
  close(): void;
}
