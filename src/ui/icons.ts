import type { GestureId } from '../pose/gestures.ts';

// Stick-figure pictograms of each gesture, drawn as the player sees themselves (mirrored).
const figure = (body: string, accent: string) => `
<svg viewBox="0 0 64 64" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <g stroke="currentColor" stroke-width="4">${body}</g>
  <g stroke="var(--accent)" stroke-width="3">${accent}</g>
</svg>`;

const legs = '<path d="M32 38 L25 57 M32 38 L39 57"/>';

export const GESTURE_ICONS: Record<GestureId, string> = {
  jump: figure(
    `<circle cx="32" cy="12" r="5.5"/><path d="M32 18 V38"/>${legs}<path d="M32 22 L22 34 M32 22 L42 4"/>`,
    '<path d="M50 20 V6 M45 11 L50 6 L55 11"/>',
  ),
  duck: figure(
    '<circle cx="32" cy="26" r="5.5"/><path d="M32 32 V44 M32 44 L23 50 L26 58 M32 44 L41 50 L38 58 M32 35 L22 42 M32 35 L42 42"/>',
    '<path d="M52 8 V22 M47 17 L52 22 L57 17"/>',
  ),
  leanL: figure(
    `<circle cx="23" cy="13" r="5.5"/><path d="M26 19 L32 38"/>${legs}<path d="M28 24 L18 34 M28 24 L36 34"/>`,
    '<path d="M16 6 H4 M9 1 L4 6 L9 11"/>',
  ),
  leanR: figure(
    `<circle cx="41" cy="13" r="5.5"/><path d="M38 19 L32 38"/>${legs}<path d="M36 24 L46 34 M36 24 L28 34"/>`,
    '<path d="M48 6 H60 M55 1 L60 6 L55 11"/>',
  ),
  punch: figure(
    `<circle cx="32" cy="12" r="5.5"/><path d="M32 18 V38"/>${legs}<path d="M32 23 L22 34 M32 23 H56"/>`,
    '<path d="M50 14 L58 10 M52 30 L60 34"/>',
  ),
};
