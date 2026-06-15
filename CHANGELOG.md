# Changelog

All notable changes to will-it-redos are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-06-12

### Added

- First public release.
- A JS-regex parser (chars, classes with ranges/shorthands, groups, named groups,
  non-capturing groups, alternation, quantifiers, lookarounds, anchors,
  backreferences, escapes) that degrades to "skipped" on exotic syntax instead of
  crashing.
- A catastrophic-backtracking analyzer built on character-set overlap and
  empty-matchability: nested quantifiers (`(a+)+`), overlapping alternation under a
  loop (`(\w|\d)*`), and adjacent greedy quantifiers (`.*.*`). Tuned for near-zero
  false positives.
- An attack generator that builds the exact evil input (prefix + pumped ambiguity
  char + failing suffix) for each finding.
- A live, self-protecting prover that times the regex against a growing pump and
  reports the growth class — proof, not a guess.
- A source scanner that extracts regex literals and `new RegExp("…")` strings from
  js/jsx/ts/tsx/mjs/cjs, telling regexes from division.
- CLI: `will-it-redos scan [paths]` and `check <pattern>` (bins `will-it-redos`
  and `redos`), `--prove`, `--min-severity`, `--json`/`--md`, `--ignore`, exit
  codes for CI.
- Pure, dependency-free, browser-safe core exported for library use. 55 tests over
  a real-world evil/safe corpus.

[0.1.0]: https://github.com/didrod205/will-it-redos/releases/tag/v0.1.0
