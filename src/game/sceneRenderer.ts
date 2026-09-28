import type { GameNote, GameState } from './game.ts';

/** What main.ts needs from a renderer, so the 3D scene and the 2D fallback are interchangeable. */
export interface SceneRenderer {
  resize(): void;
  /** Turns game notes into effects. Called before draw() with the notes of the same frame. */
  handle(notes: readonly GameNote[]): void;
  draw(game: GameState, dt: number): void;
}
