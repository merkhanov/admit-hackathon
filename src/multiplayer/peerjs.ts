import Peer, { type DataConnection } from 'peerjs';
import type { MPMessage } from './types.ts';
import type { MPTransport, TransportEvent } from './transport.ts';

/** Namespaces our room codes on the shared public PeerJS broker. */
const ID_PREFIX = 'motiondance-v1-';

export const hostPeerId = (roomId: string) => `${ID_PREFIX}${roomId}`;

/**
 * PeerJS's built-in TURN hosts (eu-0/us-0.turn.peerjs.com) no longer resolve, so the ICE
 * config is explicit. Without TURN, phones on mobile data may not reach a desktop behind NAT;
 * set VITE_TURN_URL, VITE_TURN_USERNAME and VITE_TURN_CREDENTIAL at build time to add one.
 */
function iceConfig(): RTCConfiguration {
  const servers: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
  const env = import.meta.env;
  if (typeof env.VITE_TURN_URL === 'string' && env.VITE_TURN_URL) {
    servers.push({ urls: env.VITE_TURN_URL.split(','), username: env.VITE_TURN_USERNAME, credential: env.VITE_TURN_CREDENTIAL });
  }
  return { iceServers: servers };
}

function isMessage(v: unknown): v is MPMessage {
  return typeof v === 'object' && v !== null && 'type' in v && typeof v.type === 'string';
}

/**
 * Cross-device transport over the public PeerJS broker (0.peerjs.com), so no signaling
 * server of our own has to be deployed. Star topology: the host registers the peer id
 * derived from the room code, guests connect to it, and the host relays every guest
 * message to the other guests.
 */
export class PeerJSTransport implements MPTransport {
  private peer: Peer | null = null;
  private conns = new Map<string, DataConnection>();
  private isHost = false;
  private pending: MPMessage[] = [];
  private msgCbs: ((msg: MPMessage) => void)[] = [];
  private evCbs: ((ev: TransportEvent) => void)[] = [];

  connect(roomId: string, isHost: boolean): void {
    this.close();
    this.isHost = isHost;
    const options = { config: iceConfig() };
    const peer = isHost ? new Peer(hostPeerId(roomId), options) : new Peer(options);
    this.peer = peer;

    peer.on('open', () => {
      if (isHost) {
        this.emit({ kind: 'connected', roomId, isHost: true });
        return;
      }
      const conn = peer.connect(hostPeerId(roomId), { reliable: true, serialization: 'json' });
      this.wire(conn, () => this.emit({ kind: 'connected', roomId, isHost: false }));
    });
    if (isHost) {
      peer.on('connection', (conn) => this.wire(conn, () => this.emit({ kind: 'peer-joined', peerId: conn.peer })));
    }
    // 'peer-unavailable' means the room code doesn't exist; 'unavailable-id' means the
    // code is already taken; network and server errors mean the broker is unreachable.
    peer.on('error', () => this.emit({ kind: 'disconnected' }));
  }

  send(msg: MPMessage): void {
    const open = [...this.conns.values()].filter((c) => c.open);
    if (open.length === 0) {
      this.pending.push(msg);
      return;
    }
    for (const c of open) {
      try {
        void c.send(msg);
      } catch {
        // A flaky connection shouldn't drop the message for the others.
      }
    }
  }

  onMessage(cb: (msg: MPMessage) => void): void {
    this.msgCbs.push(cb);
  }

  onEvent(cb: (ev: TransportEvent) => void): void {
    this.evCbs.push(cb);
  }

  close(): void {
    for (const c of this.conns.values()) c.close();
    this.conns.clear();
    this.peer?.destroy();
    this.peer = null;
    this.pending = [];
  }

  private wire(conn: DataConnection, onOpen: () => void): void {
    conn.on('open', () => {
      this.conns.set(conn.peer, conn);
      onOpen();
      this.flushPending();
    });
    conn.on('data', (data) => {
      if (!isMessage(data)) return;
      // The host relays each guest's message to every other guest.
      if (this.isHost) {
        for (const [id, other] of this.conns) if (id !== conn.peer && other.open) void other.send(data);
      }
      for (const cb of this.msgCbs) cb(data);
    });
    conn.on('close', () => {
      this.conns.delete(conn.peer);
      this.emit(this.isHost ? { kind: 'peer-left', peerId: conn.peer } : { kind: 'disconnected' });
    });
  }

  private flushPending(): void {
    const msgs = this.pending;
    this.pending = [];
    for (const m of msgs) this.send(m);
  }

  private emit(ev: TransportEvent): void {
    for (const cb of this.evCbs) cb(ev);
  }
}
