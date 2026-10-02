import { ARRANGEMENTS } from '../audio/arrangements.ts';
import { detectBeat } from '../audio/beat.ts';
import { renderSong, type PlayOptions } from '../audio/music.ts';
import { songDuration, type Song } from '../dance/song.ts';
import { CUSTOM_MAX_S, CUSTOM_MIN_S, customSong, SONGS, type SongInfo } from '../dance/songs.ts';
import { t } from '../i18n.ts';

/** A song the player can pick: the dance, its music and what the picker says about it. */
export interface Track {
  /** Records key: the song id, or "custom:<file name>" for the player's own file. */
  key: string;
  /** Stage theme and costume. */
  theme: string;
  song: Song;
  credit: string;
  dances: string;
  coach: string;
  play: PlayOptions;
  /** Shown under the song when the beat was hard to find. */
  warning: string | null;
}

export type FileStatus =
  | { kind: 'none' }
  | { kind: 'loading'; name: string }
  | { kind: 'error'; text: string }
  | { kind: 'ready' };

/** Built-in songs are rendered on demand; this many stay in memory (~12 MB each). */
const KEEP_RENDERED = 3;
/** Only this much of a song file is analysed and kept, from its first beat. */
const ANALYSE_S = 120;
/** Below this, the beat of a song file is a guess. */
const LOW_CONFIDENCE = 1.3;

/** A built-in song's track. Its texts are read when shown, so they follow the language. */
const builtIn = (s: SongInfo): Track => ({
  key: s.song.id, theme: s.song.id, song: s.song, play: {}, warning: null,
  get credit() { return s.credit; }, get dances() { return s.dances; }, get coach() { return s.coach; },
});

const BUILT_IN: readonly Track[] = SONGS.map(builtIn);

/** A song file's problem the player can act on, in their language. Other errors get the generic message. */
class FileError extends Error {}

function monoMix(buffer: AudioBuffer, seconds: number): Float32Array {
  const n = Math.min(buffer.length, Math.round(seconds * buffer.sampleRate));
  const out = new Float32Array(n);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += data[i] / buffer.numberOfChannels;
  }
  return out;
}

/** Copies `seconds` of audio from `start` into a new buffer, so the rest of a long file can be freed. */
function slice(buffer: AudioBuffer, start: number, seconds: number): AudioBuffer {
  const from = Math.max(0, Math.floor(start * buffer.sampleRate));
  const n = Math.min(buffer.length - from, Math.ceil(seconds * buffer.sampleRate));
  const out = new AudioBuffer({ length: n, numberOfChannels: buffer.numberOfChannels, sampleRate: buffer.sampleRate });
  for (let c = 0; c < buffer.numberOfChannels; c++) out.copyToChannel(buffer.getChannelData(c).subarray(from, from + n), c);
  return out;
}

/** The song list, the selected song and its audio. */
export class Tracks {
  private custom: { track: Track; buffer: AudioBuffer } | null = null;
  private index = 0;
  private readonly rendered = new Map<string, { buffer: AudioBuffer | null; used: number }>();
  private uses = 0;
  status: FileStatus = { kind: 'none' };
  /** Called when a song finishes rendering or loading, so the picker can update. */
  onChange: () => void = () => undefined;

  get list(): readonly Track[] {
    return this.custom ? [...BUILT_IN, this.custom.track] : BUILT_IN;
  }

  get current(): Track {
    return this.list[Math.min(this.index, this.list.length - 1)];
  }

  select(key: string): void {
    const i = this.list.findIndex((t) => t.key === key);
    if (i >= 0) this.index = i;
    this.prepare(this.current);
  }

  /** Moves through the list, wrapping around. */
  step(delta: number): void {
    const n = this.list.length;
    this.index = (((this.index + delta) % n) + n) % n;
    this.prepare(this.current);
  }

  neighbour(delta: number): Track {
    const n = this.list.length;
    return this.list[(((this.index + delta) % n) + n) % n];
  }

  /** The current song's audio, or null while it is still being prepared. */
  buffer(): AudioBuffer | null {
    const t = this.current;
    if (this.custom && t === this.custom.track) return this.custom.buffer;
    return this.rendered.get(t.key)?.buffer ?? null;
  }

  /** Starts rendering a built-in song's music if it isn't ready yet. */
  prepare(track: Track): void {
    const cached = this.rendered.get(track.key);
    if (cached) { cached.used = ++this.uses; return; }
    const arrange = ARRANGEMENTS[track.key];
    if (!arrange) return;
    const entry: { buffer: AudioBuffer | null; used: number } = { buffer: null, used: ++this.uses };
    this.rendered.set(track.key, entry);
    renderSong(track.song, arrange).then((b) => {
      entry.buffer = b;
      this.evict();
      this.onChange();
    }, (err: unknown) => {
      // Without the buffer the song clock still runs, silently; the error must at least be visible.
      console.error('Song render failed', err);
      this.rendered.delete(track.key);
    });
  }

  private evict(): void {
    const done = [...this.rendered.entries()].filter(([k, v]) => v.buffer && k !== this.current.key);
    done.sort((a, b) => a[1].used - b[1].used);
    while (done.length >= KEEP_RENDERED) {
      const oldest = done.shift();
      if (oldest) this.rendered.delete(oldest[0]);
    }
  }

  /**
   * Turns the player's own audio file into a dance: decode, find the beat, build moves on it.
   * The file never leaves the browser.
   */
  async loadFile(file: File): Promise<void> {
    const name = file.name.replace(/\.[^.]+$/, '').slice(0, 48) || t('file.defaultName');
    this.status = { kind: 'loading', name };
    this.onChange();
    try {
      const decoded = await new OfflineAudioContext(2, 1, 44100).decodeAudioData(await file.arrayBuffer());
      if (decoded.duration < CUSTOM_MIN_S) throw new FileError(t('file.short', { s: CUSTOM_MIN_S }));
      const grid = detectBeat(monoMix(decoded, ANALYSE_S), decoded.sampleRate);
      const song = customSong(name, grid.bpm, Math.min(decoded.duration - grid.firstBeat, CUSTOM_MAX_S));
      const length = songDuration(song);
      const track: Track = {
        key: `custom:${name}`,
        theme: 'custom',
        song,
        get credit() { return t('custom.credit', { bpm: Math.round(song.bpm) }); },
        get dances() { return t('custom.dances'); },
        get coach() { return t('custom.coach'); },
        play: { fadeAt: length - 2 },
        get warning() { return grid.confidence < LOW_CONFIDENCE ? t('custom.warning') : null; },
      };
      // The kept audio starts on the first beat, which is song time 0.
      this.custom = { track, buffer: slice(decoded, grid.firstBeat, length + 1) };
      this.status = { kind: 'ready' };
      this.select(track.key);
    } catch (err) {
      console.warn('Song file failed', err);
      const text = err instanceof FileError ? err.message : t('file.unreadable');
      this.status = { kind: 'error', text };
    }
    this.onChange();
  }
}
