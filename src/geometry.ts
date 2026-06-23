// Smallest absolute difference between two compass headings, in degrees (0-180).
export function headingDelta(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

// Signed angle (degrees, -180..180) of `target` relative to where you're facing.
// 0 = dead ahead, +90 = to your right, -90 = to your left. Drives the radar.
export function relativeBearing(heading: number, target: number): number {
  let d = (target - heading) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function compass8(deg: number): string {
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return POINTS[idx];
}
