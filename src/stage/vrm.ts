import type { Object3D } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';

/**
 * VRM files (the 100 Avatars collection) say which node is which body part in their own humanoid map,
 * whatever the bones are called. This renames those bones to the Mixamo names the dancer code looks
 * for, so every VRM character dances like the Mixamo-rigged coach.
 */
const MIXAMO: Record<string, string> = {
  hips: 'Hips', spine: 'Spine', chest: 'Spine1', upperChest: 'Spine2', neck: 'Neck', head: 'Head',
  leftShoulder: 'LeftShoulder', leftUpperArm: 'LeftArm', leftLowerArm: 'LeftForeArm', leftHand: 'LeftHand',
  rightShoulder: 'RightShoulder', rightUpperArm: 'RightArm', rightLowerArm: 'RightForeArm', rightHand: 'RightHand',
  leftUpperLeg: 'LeftUpLeg', leftLowerLeg: 'LeftLeg', leftFoot: 'LeftFoot', leftToes: 'LeftToeBase',
  rightUpperLeg: 'RightUpLeg', rightLowerLeg: 'RightLeg', rightFoot: 'RightFoot', rightToes: 'RightToeBase',
};
const FINGERS: Record<string, string> = { Thumb: 'Thumb', Index: 'Index', Middle: 'Middle', Ring: 'Ring', Little: 'Pinky' };
// VRM 0 names the thumb's joints Proximal, Intermediate, Distal; VRM 1 names them Metacarpal, Proximal, Distal.
const JOINT0: Record<string, number> = { Proximal: 1, Intermediate: 2, Distal: 3 };
const THUMB1: Record<string, number> = { Metacarpal: 1, Proximal: 2, Distal: 3 };

/** The Mixamo name for a VRM humanoid bone, or null for one the dancer doesn't use. */
export function mixamoName(vrm: string, version: 0 | 1): string | null {
  if (MIXAMO[vrm]) return MIXAMO[vrm];
  const m = /^(left|right)(Thumb|Index|Middle|Ring|Little)(Metacarpal|Proximal|Intermediate|Distal)$/.exec(vrm);
  if (!m) return null;
  const side = m[1] === 'left' ? 'Left' : 'Right';
  const joint = version === 1 && m[2] === 'Thumb' ? THUMB1[m[3]] : JOINT0[m[3]];
  return joint ? `${side}Hand${FINGERS[m[2]]}${joint}` : null;
}

interface HumanBone0 { bone: string; node: number }

/** Renames a VRM's humanoid bones in place. Files that aren't VRM are left as they are. */
export async function adoptVrmSkeleton(gltf: GLTF): Promise<void> {
  const ext = (gltf.parser.json as { extensions?: Record<string, { humanoid?: { humanBones?: unknown } }> }).extensions;
  const v0 = ext?.VRM?.humanoid?.humanBones as HumanBone0[] | undefined;
  const v1 = ext?.VRMC_vrm?.humanoid?.humanBones as Record<string, { node: number }> | undefined;
  const pairs: [string, number, 0 | 1][] = v0
    ? v0.map((b) => [b.bone, b.node, 0])
    : v1 ? Object.entries(v1).map(([bone, b]) => [bone, b.node, 1]) : [];
  for (const [bone, node, version] of pairs) {
    const name = mixamoName(bone, version);
    if (!name) continue;
    const obj = (await gltf.parser.getDependency('node', node)) as Object3D;
    obj.name = name;
  }
}
