<div align="center">

# will it ReDoS?

### Find the regex in your code that one HTTP request can freeze your server with — and the exact string that does it.

[![npm version](https://img.shields.io/npm/v/will-it-redos.svg?color=success)](https://www.npmjs.com/package/will-it-redos)
[![CI](https://github.com/didrod205/will-it-redos/actions/workflows/ci.yml/badge.svg)](https://github.com/didrod205/will-it-redos/actions/workflows/ci.yml)
[![types](https://img.shields.io/npm/types/will-it-redos.svg)](https://www.npmjs.com/package/will-it-redos)
[![license](https://img.shields.io/npm/l/will-it-redos.svg)](./LICENSE)

```bash
npx will-it-redos scan .
```

</div>

On July 2, 2019, a single regex — `.*.*=.*` — took **Cloudflare's entire global
network offline** for 27 minutes. Stack Overflow went down in 2016 for the same
reason. The bug is called **ReDoS** (Regular-expression Denial of Service): a
pattern that, on the right input, makes the engine try an *exponential* number of
ways to match — and one short string pins a CPU core at 100% forever.

It hides in regexes that look completely normal:

```js
const TRIM   = /^(\s+)+$/;             // 💥 exponential
const VALID  = /^(\w+\s?)*$/;          // 💥 exponential
const EMAIL  = /^([a-zA-Z0-9]+)*@.../  // 💥 exponential
```

**`will-it-redos` finds them — and proves it by handing you the input that
hangs them.**

```console
$ npx will-it-redos check '(a+)+$'

  /(a+)+$/

   WILL ReDoS   exponential backtracking

  Nested quantifier (a `(x+)+` shape). On a long run of the inner character
  followed by a non-match, the engine tries exponentially many ways to split it.

  The input that hangs it:
    "a".repeat(50000) + "!"

  Proof (live, on this machine):
      19 chars        2.9 ms  ▪
      21 chars       11.8 ms  ▪
      23 chars       44.1 ms  ▪
      25 chars      173.7 ms  ▪
      27 chars      725.5 ms  ████████

  ☠  27 characters froze this regex for 726 ms. Imagine that as a request parameter.
```

That's not a lint rule guessing. It **parsed the pattern, found the ambiguity,
built the evil string, and timed the catastrophe** — right there.

## Scan your whole codebase

```console
$ npx will-it-redos scan src --prove

   EXPONENTIAL   src/validate.js:5:21
    /^(\s+)+$/
    Nested quantifier — on a long inner run + a non-match, the engine explodes.
    evil input: " ".repeat(50000) + "!"
    proven: 27 chars hung this regex for 337 ms (exponential)

   POLYNOMIAL   src/parse.js:16:16
    /.*.*=.*/
    Two adjacent unbounded quantifiers over overlapping characters — quadratic.
    evil input: "a".repeat(50000) + "\n"

  2 risky regexes · 1 exponential · 1 polynomial · 14 safe · 0 skipped · 16 total
```

It reads regex **literals** *and* `new RegExp("…")` strings out of your `.js`/`.ts`
(and jsx/tsx/mjs/cjs), tells regexes from division, and **never flags a safe one
if it can help it** — false positives are how a security tool gets ignored.

## Install

```bash
npx will-it-redos scan .      # no install
npm i -g will-it-redos        # keep it; the bin is also `redos`
```

Node ≥ 18. Zero-dependency core (the CLI adds `cac` + `picocolors`). **No API key,
no network, no telemetry** — it runs entirely on your machine, because it's
literally just running regexes against strings really fast.

## Use it as a CI gate

`scan` exits non-zero when it finds something, so one line keeps catastrophic
regexes out of your codebase forever:

```yaml
# .github/workflows/ci.yml
- run: npx will-it-redos scan src
```

```jsonc
// package.json
{ "scripts": { "lint:redos": "will-it-redos scan src --min-severity polynomial" } }
```

Exit `0` = clean · `1` = a vulnerable regex was found · `2` = usage error.

## What it catches

| Shape | Example | Verdict |
| ----- | ------- | ------- |
| **Nested quantifier** | `(a+)+`, `(a*)*`, `([a-z]+)*`, `(.*)*` | exponential |
| **Quantified ambiguous group** | `(\w+\s?)*`, `([^=]+)+=` | exponential |
| **Overlapping alternation under a loop** | `(a\|a)*`, `(\w\|\d)*`, `(.\|a)*` | exponential |
| **Adjacent greedy quantifiers** | `.*.*=.*`, `\s*\s*$`, `\d+\d+` | polynomial |

It models JS regex syntax (classes, groups, alternation, quantifiers, lookarounds,
backrefs) and reasons about **character-set overlap** and **empty-matchability** —
the two properties that make backtracking blow up. Anything it can't parse is
reported as *skipped*, never guessed.

## Honest about the limits

ReDoS detection is undecidable in general, so `will-it-redos` aims for **high
recall on the real-world canon with near-zero false positives**:

- It may **miss** exotic constructions (bounded-repeat amplification like
  `(.*a){200}`, backreference-driven blowup). `--prove` is the backstop: if it
  flagged something, the timing shows you it's real.
- It does **not** execute your code — it reads source text and analyzes patterns.
- The `--prove` timing is bounded and self-protecting (small steps, hard caps), so
  the tool itself can never hang.

## Library API

The analyzer is pure and browser-safe:

```ts
import { analyzePattern } from "will-it-redos";

const r = analyzePattern("(a+)+$");
r.status;                       // "exponential"
r.findings[0].attack.build(50000);   // the evil input, ready to fire
```

## Roadmap

- 🌐 **Web playground** — paste a regex, watch it melt (100% client-side; the
  engine already runs in a browser).
- Bounded-repeat amplification (`(.*a){n}`) and backreference analysis.
- Auto-fix suggestions (atomic groups / possessive rewrites / anchoring).
- ESLint plugin and a `--git-diff` mode for pre-commit.

## 💖 Sponsor

Free, MIT, built in spare time. If it caught a regex before it caught you:

- ⭐ **Star the repo** — so the next person finds it before the incident.
- 🍋 **[Sponsor via Lemon Squeezy](https://elab-studio.lemonsqueezy.com/checkout/buy/5d059b89-51d0-456b-b33a-ed56994f7010)** — one-time or recurring.

## License

[MIT](./LICENSE) © will-it-redos contributors
