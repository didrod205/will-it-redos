# Contributing to will-it-redos

Thanks for your interest! The most valuable contributions: a **real-world ReDoS
pattern we miss** (add it to the corpus with a failing test), a **false positive**
we should suppress, or a sharper **attack generator** for a finding kind.

## Getting started

```bash
git clone https://github.com/didrod205/will-it-redos.git
cd will-it-redos
npm install
npm test                 # vitest — the evil/safe corpus lives here
npm run typecheck
npm run build
node scripts/corpus.mjs  # the detector scoreboard
node dist/cli.js check '(a+)+$'
```

## Project layout

```
src/
  ast.ts        # the regex AST node types
  parse.ts      # pattern string → AST (throws UnsupportedRegexError on exotic syntax)
  charset.ts    # character-set model; the overlap-by-sampling primitive
  sets.ts       # canMatchEmpty / firstSet / overlap / sharedChar over the AST
  analyze.ts    # THE detector: nested / overlapping-alternation / adjacent (pure)
  attack.ts     # build the evil input for a finding (pure)
  prove.ts      # live, self-protecting timing of a real RegExp (pure-ish)
  scan.ts       # node-only: extract regexes from source (literals + new RegExp)
  report/       # console / markdown / json renderers
  cli.ts        # cac CLI (bins: will-it-redos, redos)
tests/          # corpus-driven specs
scripts/corpus.mjs   # quick detector scoreboard (evil must fire, safe must not)
```

## The two rules that matter

1. **Near-zero false positives.** A security tool that cries wolf gets uninstalled.
   The `SAFE` corpus in `tests/analyze.test.ts` must stay 100% green. When in
   doubt, prefer a miss over a false alarm — `--prove` is the backstop for misses.
2. **Every finding must be provable.** If you add a detector, its attack generator
   must produce an input that actually blows the pattern up (`scripts/corpus.mjs`
   and the timing test demonstrate this). Don't flag what you can't reproduce.

## Adding a pattern to the corpus

Add it to `EVIL` (with its expected severity) or `SAFE` in
`tests/analyze.test.ts` and to `scripts/corpus.mjs`. If `EVIL` and the detector
misses it, that's the bug to fix — in `analyze.ts`, keeping the SAFE set green.

## Quality bar

- [ ] `npm run typecheck && npm test && npm run build` pass.
- [ ] `node scripts/corpus.mjs` reports `0 wrong`.
- [ ] The pure core imports no `node:*` (keep it browser-ready).
