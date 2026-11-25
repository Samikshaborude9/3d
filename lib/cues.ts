/** Camera script. Each cue is pinned to a page section (by id). */
export interface Shot {
  frame: number; // mm that must fit across the screen WIDTH — same cue works on phone and monitor
  az: number; // azimuth, degrees
  el: number; // elevation, degrees
  offsetX: number; // shift subject on screen, fraction of width (+ = right)
  at: number; // look-at point along the lens axis, mm
  explode: number; // 0..1
  timeScale: number;
}

export const cues: { id: string; shot: Shot }[] = [
  { id: "hero", shot: { frame: 235, az: 44, el: 14, offsetX: 0.22, at: 0, explode: 0, timeScale: 1 } },
  { id: "close", shot: { frame: 110, az: 62, el: 8, offsetX: -0.18, at: 2, explode: 0, timeScale: 1 / 12 } },
  { id: "apart", shot: { frame: 520, az: 78, el: 12, offsetX: 0, at: 0, explode: 1, timeScale: 1 } },
  { id: "around", shot: { frame: 520, az: 215, el: 26, offsetX: 0, at: 0, explode: 1, timeScale: 1 } },
  { id: "rebuild", shot: { frame: 230, az: 330, el: 16, offsetX: 0, at: 0, explode: 0, timeScale: 1 } },
  { id: "outro", shot: { frame: 430, az: 385, el: 10, offsetX: 0, at: 0, explode: 0, timeScale: 1 } },
];
