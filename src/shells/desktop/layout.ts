export const PANEL_HEIGHT = 48

/** The part of the screen windows can use: everything above the panel. */
export function workArea(): { width: number; height: number } {
  return {
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight - PANEL_HEIGHT,
  }
}
