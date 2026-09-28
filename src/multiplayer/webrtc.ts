import type { MPMessage } from './types.ts';
import type { MPTransport, TransportEvent } from './transport.ts';

/** Signaling server URL. Local dev uses ws://localhost; production uses the Fly.io deploy. */
export function signalingUrl(): string {
  if (typeof location !== 'undefined' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    return `ws://${location.hostname}:8080`;
  }
  return 'wss://motion-dance-signaling.fly.dev';
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

interface SignalMsg {
  type: 'joined' | 'peer-joined' | 'peer-left' | 'host' | 'offer' | 'answer' | 'ice';
  roomId?: string;
  peerId?: string;
  hostId?: string;
  isHost?: boolean;
  to?: string;
  from?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

/**
 * Cross-device transport: WebRTC data channels in a star topology.
 * The host accepts one connection per guest; guests connect only to the host.
 * The host relays guest messages to all other guests, so every peer sees the
 * same message stream. A WebSocket signaling server exchanges offer/answer/ICE.
 */
export class WebRTCTransport implements MPTransport {
  private selfId: string;
  private roomId: string | null = null;
  private isHost = false;
  private hostId: string | null = null;
  private ws: WebSocket | null = null;
  private msgCbs: ((msg: MPMessage) => void)[] = [];
  private evCbs: ((ev: TransportEvent) => void)[] = [];
  /** Guest: the one connection to the host. Host: one connection per guest. */
  private pcs = new Map<string, RTCPeerConnection>();
  private dcs = new Map<string, RTCDataChannel>();
  private pending: MPMessage[] = [];
  private reconnects = 0;
  private closed = false;

  constructor(selfId: string) {
    this.selfId = selfId;
  }

  connect(roomId: string, isHost: boolean): void {
    this.close();
    this.closed = false;
    this.roomId = roomId;
    this.isHost = isHost;
    this.reconnects = 0;
    this.openSignal();
  }

  send(msg: MPMessage): void {
    const open: RTCDataChannel[] = [];
    for (const dc of this.dcs.values()) if (dc.readyState === 'open') open.push(dc);
    if (open.length === 0) {
      this.pending.push(msg);
      return;
    }
    const text = JSON.stringify(msg);
    for (const dc of open) {
      try {
        dc.send(text);
      } catch {
        // A flaky channel shouldn't drop the message for the others.
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
    this.closed = true;
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    for (const dc of this.dcs.values()) {
      try {
        dc.close();
      } catch {
        // Already closed.
      }
    }
    for (const pc of this.pcs.values()) {
      try {
        pc.close();
      } catch {
        // Already closed.
      }
    }
    this.pcs.clear();
    this.dcs.clear();
    this.pending = [];
    this.roomId = null;
    this.hostId = null;
  }

  private openSignal(): void {
    if (this.closed || !this.roomId) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(signalingUrl());
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.reconnects = 0;
      ws.send(JSON.stringify({ type: 'join', roomId: this.roomId, peerId: this.selfId }));
    };
    ws.onmessage = (e) => this.onSignal(e);
    ws.onclose = () => {
      if (!this.closed) this.scheduleReconnect();
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        // Ignore; onclose handles reconnect.
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.closed || this.reconnects >= 3) {
      if (!this.closed) this.emit({ kind: 'disconnected' });
      return;
    }
    this.reconnects++;
    setTimeout(() => this.openSignal(), 1000 * this.reconnects);
  }

  private signal(msg: object): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private onSignal(e: MessageEvent): void {
    let msg: SignalMsg;
    try {
      msg = JSON.parse(String(e.data)) as SignalMsg;
    } catch {
      return;
    }
    switch (msg.type) {
      case 'joined': {
        this.hostId = msg.hostId ?? null;
        // The signaling server decides who the host is (first joiner). If we
        // asked to be host but someone else is, we become a guest.
        this.isHost = msg.isHost ?? false;
        this.emit({ kind: 'connected', roomId: this.roomId ?? '', isHost: this.isHost });
        if (!this.isHost && this.hostId) void this.dialHost(this.hostId);
        break;
      }
      case 'peer-joined': {
        // Host side: a guest arrived. It will send us an offer; just note it.
        if (msg.peerId) this.emit({ kind: 'peer-joined', peerId: msg.peerId });
        break;
      }
      case 'peer-left': {
        if (msg.peerId) {
          this.dropPeer(msg.peerId);
          this.emit({ kind: 'peer-left', peerId: msg.peerId });
        }
        break;
      }
      case 'host': {
        // We were promoted (old host left). Guests will dial us; if we're a
        // guest of a dead host, the disconnect shows and we return to lobby.
        if (msg.hostId === this.selfId) {
          this.isHost = true;
          this.emit({ kind: 'host-changed', hostId: this.selfId });
        } else {
          this.emit({ kind: 'disconnected' });
        }
        break;
      }
      case 'offer': {
        if (msg.from && msg.sdp) void this.onOffer(msg.from, msg.sdp);
        break;
      }
      case 'answer': {
        if (msg.from && msg.sdp) void this.onAnswer(msg.sdp);
        break;
      }
      case 'ice': {
        if (msg.from && msg.candidate) void this.onIce(msg.from, msg.candidate);
        break;
      }
      default:
        break;
    }
  }

  /** Guest side: dial the host. */
  private async dialHost(hostId: string): Promise<void> {
    if (this.closed) return;
    const pc = new RTCPeerConnection(ICE_SERVERS);
    this.pcs.set(hostId, pc);
    const dc = pc.createDataChannel('mp');
    this.wireDataChannel(hostId, dc);
    pc.onicecandidate = (e) => {
      if (e.candidate) this.signal({ type: 'ice', roomId: this.roomId, to: hostId, candidate: e.candidate.toJSON() });
    };
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.signal({ type: 'offer', roomId: this.roomId, to: hostId, sdp: offer });
    } catch {
      this.dropPeer(hostId);
    }
  }

  /** Host side: answer a guest's offer. */
  private async onOffer(from: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    if (this.closed || !this.isHost) return;
    this.dropPeer(from);
    const pc = new RTCPeerConnection(ICE_SERVERS);
    this.pcs.set(from, pc);
    pc.ondatachannel = (e) => this.wireDataChannel(from, e.channel);
    pc.onicecandidate = (e) => {
      if (e.candidate) this.signal({ type: 'ice', roomId: this.roomId, to: from, candidate: e.candidate.toJSON() });
    };
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.signal({ type: 'answer', roomId: this.roomId, to: from, sdp: answer });
    } catch {
      this.dropPeer(from);
    }
  }

  /** Guest side: the host answered. */
  private async onAnswer(sdp: RTCSessionDescriptionInit): Promise<void> {
    const pc = this.hostId ? this.pcs.get(this.hostId) : null;
    if (!pc) return;
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    } catch {
      // Stale answer; the connection attempt is dead.
    }
  }

  private async onIce(from: string, candidate: RTCIceCandidateInit): Promise<void> {
    const pc = this.pcs.get(from);
    if (!pc) return;
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch {
      // Late or duplicate candidate; safe to ignore.
    }
  }

  private wireDataChannel(peerId: string, dc: RTCDataChannel): void {
    this.dcs.set(peerId, dc);
    dc.onopen = () => this.flushPending();
    dc.onmessage = (e) => this.onData(e);
    dc.onclose = () => {
      if (this.dcs.get(peerId) === dc) this.dcs.delete(peerId);
    };
  }

  private onData(e: MessageEvent): void {
    let msg: MPMessage;
    try {
      msg = JSON.parse(String(e.data)) as MPMessage;
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== 'string') return;
    // Host relays guest messages to every other guest, so all peers see the
    // same stream without a full mesh.
    if (this.isHost) this.relay(msg);
    for (const cb of this.msgCbs) cb(msg);
  }

  private relay(msg: MPMessage): void {
    const text = JSON.stringify(msg);
    for (const dc of this.dcs.values()) {
      if (dc.readyState !== 'open') continue;
      try {
        dc.send(text);
      } catch {
        // Best-effort relay.
      }
    }
  }

  private flushPending(): void {
    if (this.pending.length === 0) return;
    const msgs = this.pending;
    this.pending = [];
    for (const m of msgs) this.send(m);
  }

  private dropPeer(peerId: string): void {
    const dc = this.dcs.get(peerId);
    if (dc) {
      try {
        dc.close();
      } catch {
        // Already closed.
      }
      this.dcs.delete(peerId);
    }
    const pc = this.pcs.get(peerId);
    if (pc) {
      try {
        pc.close();
      } catch {
        // Already closed.
      }
      this.pcs.delete(peerId);
    }
  }

  private emit(ev: TransportEvent): void {
    for (const cb of this.evCbs) cb(ev);
  }
}
