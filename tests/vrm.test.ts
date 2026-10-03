import { describe, expect, it } from 'vitest';
import { mixamoName } from '../src/stage/vrm.ts';

describe('VRM skeletons get the Mixamo names the dancer uses', () => {
  it('limbs and spine', () => {
    expect(mixamoName('leftUpperArm', 0)).toBe('LeftArm');
    expect(mixamoName('rightLowerArm', 1)).toBe('RightForeArm');
    expect(mixamoName('upperChest', 0)).toBe('Spine2');
    expect(mixamoName('leftLowerLeg', 0)).toBe('LeftLeg');
  });

  it('fingers, with the thumb counted the way each VRM version does', () => {
    expect(mixamoName('leftIndexProximal', 0)).toBe('LeftHandIndex1');
    expect(mixamoName('rightLittleDistal', 1)).toBe('RightHandPinky3');
    expect(mixamoName('leftThumbProximal', 0)).toBe('LeftHandThumb1');
    expect(mixamoName('leftThumbMetacarpal', 1)).toBe('LeftHandThumb1');
    expect(mixamoName('leftThumbProximal', 1)).toBe('LeftHandThumb2');
  });

  it('bones the dancer has no use for are left alone', () => {
    expect(mixamoName('leftEye', 0)).toBeNull();
    expect(mixamoName('jaw', 1)).toBeNull();
  });
});
