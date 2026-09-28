import type { MPMessage } from './types.ts';
import type { MPTransport, TransportEvent } from './transport.ts';

interface Envelope {
  from: string;
  msg: MPMessage;
}

/**
 * Same-device transport: all tabs on the same origin share a BroadcastChannel
 * named by the room. Zero server, instant connect. The first tab to create the
 * room becomes host via the session reducer (first `join` wins).
 */
export class BroadcastTransport implements MPTransport {
  private channel: BroadcastChannel | null = null;
  private selfId: string;
  private msgCbs: ((msg: MPMessage) => void)[] = [];
  private evCbs: ((ev: TransportEvent) => void)[] = [];
  private onChannel = (e: MessageEvent<unknown>) => this.handle(e);

  constructor(selfId: string) {
    this.selfId = selfId;
  }

  connect(roomId: string, isHost: boolean): void {
    this.close();
    this.channel = new BroadcastChannel(`motion-dance:${roomId}`);
    this.channel.onmessage = this.onChannel;
    this.emit({ kind: 'connected', roomId, isHost });
  }

  send(msg: MPMessage): void {
    if (!this.channel) return;
    const envelope: Envelope = { from: this.selfId, msg };
    this.channel.postMessage(envelope);
  }

  onMessage(cb: (msg: MPMessage) => void): void {
    this.msgCbs.push(cb);
  }

  onEvent(cb: (ev: TransportEvent) => void): void {
    this.evCbs.push(cb);
  }

  close(): void {
    if (this.channel) {
      this.channel.onmessage = null;
      this.channel.close();
      this.channel = null;
    }
  }

  private handle(e: MessageEvent<unknown>): void {
    const data = e.data as Envelope | null;
    if (!data || data.from === this.selfId || !data.msg) return;
    for (const cb of this.msgCbs) cb(data.msg);
  }

  private emit(ev: TransportEvent): void {
    for (const cb of this.evCbs) cb(ev);
  }
}
