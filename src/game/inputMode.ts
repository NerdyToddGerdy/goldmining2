/**
 * Whether the player is using touch or mouse and keyboard right now. Starts from what the device
 * reports and follows whatever was used last (a tablet with a keyboard can switch back and forth).
 * Hints, button labels, and messages read this so nobody is told to press keys they don't have.
 */
let touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

window.addEventListener('pointerdown', (e) => (touch = e.pointerType !== 'mouse'), { capture: true });
window.addEventListener('keydown', () => (touch = false), { capture: true });

export function usingTouch(): boolean {
  return touch;
}

/** Drop keyboard shortcuts like " (P)" or " (Esc)" from a label or message when on touch. */
export function forInput(text: string): string {
  return touch ? text.replace(/\s\((?:[A-Z]|Esc|Enter)\)/g, '') : text;
}
