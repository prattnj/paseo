// keycap.js — render a keyboard key as a small inline "keycap" icon.
//
// Anywhere the HUD tells you to press a key ("Press E to talk", "E — drive",
// the buy prompt's Y/N, the stylist dialog), the letter is drawn as a little
// keyboard key rather than a bare character, so a control is always visually
// unmistakable. The look is deliberately minimalistic to match the rest of the
// game: a light rounded cap with a slightly thicker bottom border for a hint of
// depth (see the global `.key` rule in index.html). One shared style backs every
// keycap so they read as one system on both the dark HUD pills and the white
// dialog box.
//
// Returns an HTML string, so callers must assign it via innerHTML (not
// textContent). The label is caller-provided and always a short control name
// (single letters here), so there's no untrusted text to escape.
export function key(label) {
  return `<span class="key">${label}</span>`;
}
