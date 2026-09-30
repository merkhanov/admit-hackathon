import { describe, expect, it } from 'vitest';
import { SongPlayer, type AudioClock } from '../src/audio/music.ts';

/** An AudioContext stand-in: iOS Safari leaves one created outside a tap 'suspended', with a frozen clock. */
function fakeContext(state: AudioContextState): AudioClock {
  return { state, currentTime: 0, outputLatency: 0, destination: {} as AudioDestinationNode, createBufferSource: () => { throw new Error('no audio'); }, createGain: () => { throw new Error('no audio'); } };
}

describe('SongPlayer', () => {
  it('keeps song time moving when the audio context is blocked, so the dance still runs', () => {
    let now = 1000;
    const player = new SongPlayer(fakeContext('suspended'), () => now);
    player.play(null);
    now += 5000;
    expect(player.time()).toBeCloseTo(4.9, 1);
  });

  it('uses the audio clock when audio runs', () => {
    const ctx = { ...fakeContext('running'), currentTime: 10 };
    const player = new SongPlayer(ctx, () => 0);
    player.play(null);
    ctx.currentTime = 12.1;
    expect(player.time()).toBeCloseTo(2, 5);
  });
});
