// Smallest absolute difference between two compass headings, in degrees (0-180).
export function headingDelta(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

// How far the current aim is from a saved target, combining heading + tilt.
// Pitch is weighted lower because users hold the phone at varying angles;
// azimuth (which way you face) is the strong signal.
const PITCH_WEIGHT = 0.35;

export function aimDistance(
  heading: number,
  pitch: number,
  target: { heading: number; pitch: number }
): number {
  const dh = headingDelta(heading, target.heading);
  const dp = Math.abs(pitch - target.pitch);
  return Math.sqrt(dh * dh + PITCH_WEIGHT * dp * dp);
}

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function compass8(deg: number): string {
  const idx = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
  return POINTS[idx];
}
