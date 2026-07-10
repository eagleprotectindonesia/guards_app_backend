import { buildResizeAction } from '../utils/attendance-image';

describe('buildResizeAction', () => {
  test('returns null when width or height is missing', () => {
    expect(buildResizeAction(undefined, 100)).toBeNull();
    expect(buildResizeAction(100, undefined)).toBeNull();
    expect(buildResizeAction(0, 100)).toBeNull();
    expect(buildResizeAction(100, 0)).toBeNull();
  });

  test('returns null when longest side is within max dimension', () => {
    expect(buildResizeAction(640, 480)).toBeNull();
    expect(buildResizeAction(1280, 720)).toBeNull();
  });

  test('returns width resize for landscape orientation', () => {
    const result = buildResizeAction(1920, 1080);
    expect(result).toEqual({ resize: { width: 1280 } });
  });

  test('returns height resize for portrait orientation', () => {
    const result = buildResizeAction(1080, 1920);
    expect(result).toEqual({ resize: { height: 1280 } });
  });

  test('returns width resize for square dimensions', () => {
    const result = buildResizeAction(2000, 2000);
    expect(result).toEqual({ resize: { width: 1280 } });
  });
});
