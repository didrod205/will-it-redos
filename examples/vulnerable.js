// A few regexes in the wild — some innocent, some that can take your server down.
// Run:  npx will-it-redos scan examples

// Looks reasonable. Is a classic catastrophic-backtracking trap.
export const TRIM = /^(\s+)+$/;

// Validating "words separated by optional spaces" — exponential on a long run.
export function isWords(s) {
  return /^(\w+\s?)*$/.test(s);
}

// A real-world shape: email-ish validation with a nested quantifier.
const EMAIL = /^([a-zA-Z0-9]+)*@[a-z]+\.[a-z]+$/;

// Two greedy stars over overlapping characters — quadratic.
const KEYVAL = /.*.*=.*/;

// Perfectly safe — should NOT be flagged.
const HEX = /^#?[0-9a-f]{6}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// A division that must not be mistaken for a regex.
const ratio = (a, b) => a / b / 2;

// Built dynamically from a string — still analyzed.
const dynamic = new RegExp("(a+)+$");

export { EMAIL, KEYVAL, HEX, SLUG, ISO_DATE, dynamic, ratio };
