import { describe, expect, it } from 'vitest';
import { bodyAngles, evaluate } from '../src/dance/judge.ts';
import { MOVE_IDS, MOVES } from '../src/dance/moves.ts';
import { rate } from '../src/dance/dance.ts';
import { paramsFor } from '../src/dance/targetPose.ts';
import { MPManager } from '../src/multiplayer/manager.ts';
import { packPose, unpackPose } from '../src/multiplayer/pose.ts';
import type { MPTransport, TransportEvent } from '../src/multiplayer/transport.ts';
import type { CompactPose, MPMessage } from '../src/multiplayer/types.ts';
import { features } from '../src/pose/features.ts';
import { NEUTRAL, SYNTH_ASPECT, synthPose } from '../src/pose/synthetic.ts';

const neutral = features(synthPose(NEUTRAL), SYNTH_ASPECT);
if (!neutral.present) throw new Error('neutral pose must be visible');
const calib = { midY: neutral.midY, sw: neutral.sw };

describe('pose codec', () => {
  it.each(MOVE_IDS)('%s survives packing into six numbers', (id) => {
    const body = bodyAngles(features(synthPose({ ...NEUTRAL, ...paramsFor(MOVES[id]) }), SYNTH_ASPECT), calib);
    if (!body) throw new Error('visible');
    const packed = packPose(body);
    expect(packed).toHaveLength(6);
    expect(packed.every(Number.isInteger)).toBe(true);
    // The avatar shows what the player did: posed from the unpacked angles, it scores as the same move.
    const shown = bodyAngles(features(synthPose({ ...NEUTRAL, ...paramsFor(unpackPose(packed)) }), SYNTH_ASPECT), calib);
    if (!shown) throw new Error('visible');
    expect(rate(evaluate(MOVES[id], shown).score)).toBe('perfect');
  });
});

/** An in-memory star network: every message a peer sends reaches all the others. */
function hub() {
  const peers: { deliver: (m: MPMessage) => void; event: (e: TransportEvent) => void }[] = [];
  return (): MPTransport => {
    const msgCbs: ((m: MPMessage) => void)[] = [];
    const evCbs: ((e: TransportEvent) => void)[] = [];
    const me = { deliver: (m: MPMessage) => msgCbs.forEach((cb) => cb(m)), event: (e: TransportEvent) => evCbs.forEach((cb) => cb(e)) };
    peers.push(me);
    return {
      connect: (roomId, isHost) => me.event({ kind: 'connected', roomId, isHost }),
      send: (m) => peers.filter((p) => p !== me).forEach((p) => p.deliver(m)),
      onMessage: (cb) => msgCbs.push(cb),
      onEvent: (cb) => evCbs.push(cb),
      close: () => undefined,
    };
  };
}

describe('pose streaming', () => {
  it("delivers a guest's pose to the host, never echoes it back, and leaves the roster alone", () => {
    const net = hub();
    const host = new MPManager('h', 'Хост', net());
    const guest = new MPManager('g', 'Гость', net());
    host.connect('ROOM', true);
    guest.connect('ROOM', false);
    const atHost: [string, CompactPose][] = [];
    const atGuest: [string, CompactPose][] = [];
    host.onPose((id, p) => atHost.push([id, p]));
    guest.onPose((id, p) => atGuest.push([id, p]));
    const rosterBefore = JSON.stringify(host.getState().players);

    guest.sendPose([180, 175, 10, 170, 0, 0]);

    expect(atHost).toEqual([['g', [180, 175, 10, 170, 0, 0]]]);
    expect(atGuest).toEqual([]);
    expect(JSON.stringify(host.getState().players)).toBe(rosterBefore);
  });
});
