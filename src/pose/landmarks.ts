// MediaPipe Pose landmark in normalized image coordinates (not mirrored).
export interface Landmark {
  x: number;
  y: number;
  visibility?: number;
}

export type Pose = readonly Landmark[];

export const IDX = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
} as const;

export const SKELETON: readonly (readonly [number, number])[] = [
  [IDX.LEFT_SHOULDER, IDX.RIGHT_SHOULDER],
  [IDX.LEFT_SHOULDER, IDX.LEFT_HIP],
  [IDX.RIGHT_SHOULDER, IDX.RIGHT_HIP],
  [IDX.LEFT_HIP, IDX.RIGHT_HIP],
  [IDX.LEFT_SHOULDER, IDX.LEFT_ELBOW],
  [IDX.LEFT_ELBOW, IDX.LEFT_WRIST],
  [IDX.RIGHT_SHOULDER, IDX.RIGHT_ELBOW],
  [IDX.RIGHT_ELBOW, IDX.RIGHT_WRIST],
];
