import type { Node, ClassNode, ClassItem, Quantifier } from "./ast.js";

/** Thrown when a pattern uses syntax we don't model; callers treat it as "skipped". */
export class UnsupportedRegexError extends Error {}

const MAX_LEN = 20000;

class Parser {
  private i = 0;
  constructor(private readonly src: string) {}

  private peek(): string | undefined {
    return this.src[this.i];
  }
  private next(): string {
    return this.src[this.i++]!;
  }
  private eof(): boolean {
    return this.i >= this.src.length;
  }

  parse(): Node[] {
    if (this.src.length > MAX_LEN) throw new UnsupportedRegexError("pattern too long");
    const out = this.parseAlternation();
    if (!this.eof()) throw new UnsupportedRegexError(`unexpected "${this.peek()}" at ${this.i}`);
    return out;
  }

  private parseAlternation(): Node[] {
    const options: Node[][] = [this.parseSequence()];
    while (this.peek() === "|") {
      this.next();
      options.push(this.parseSequence());
    }
    return options.length === 1 ? options[0]! : [{ type: "alt", options }];
  }

  private parseSequence(): Node[] {
    const seq: Node[] = [];
    while (!this.eof() && this.peek() !== "|" && this.peek() !== ")") {
      seq.push(this.parseTerm());
    }
    return seq;
  }

  private parseTerm(): Node {
    const atom = this.parseAtom();
    return this.maybeQuantify(atom);
  }

  private maybeQuantify(atom: Node): Node {
    const c = this.peek();
    let min: number | undefined;
    let max: number | undefined;
    if (c === "*") {
      this.next();
      min = 0;
      max = Infinity;
    } else if (c === "+") {
      this.next();
      min = 1;
      max = Infinity;
    } else if (c === "?") {
      this.next();
      min = 0;
      max = 1;
    } else if (c === "{") {
      const saved = this.i;
      const brace = this.tryParseBrace();
      if (!brace) {
        this.i = saved;
        return atom; // literal "{" handled by parseAtom on next loop
      }
      min = brace.min;
      max = brace.max;
    } else {
      return atom;
    }
    if (atom.type === "anchor" || atom.type === "look") {
      throw new UnsupportedRegexError("quantifier applied to zero-width assertion");
    }
    let lazy = false;
    if (this.peek() === "?") {
      this.next();
      lazy = true;
    } else if (this.peek() === "+") {
      // possessive — rare; treat as greedy, mark unsupported to avoid wrong verdicts
      throw new UnsupportedRegexError("possessive quantifier");
    }
    const q: Quantifier = { type: "quant", min: min!, max: max!, lazy, child: atom };
    return q;
  }

  private tryParseBrace(): { min: number; max: number } | null {
    if (this.next() !== "{") return null;
    let digits = "";
    while (/[0-9]/.test(this.peek() ?? "")) digits += this.next();
    if (digits === "" && this.peek() !== ",") return null;
    let min = digits === "" ? 0 : Number(digits);
    let max = min;
    if (this.peek() === ",") {
      this.next();
      let d2 = "";
      while (/[0-9]/.test(this.peek() ?? "")) d2 += this.next();
      max = d2 === "" ? Infinity : Number(d2);
    }
    if (this.peek() !== "}") return null;
    this.next();
    return { min, max };
  }

  private parseAtom(): Node {
    const c = this.next();
    switch (c) {
      case "(":
        return this.parseGroup();
      case "[":
        return this.parseClass();
      case ".":
        return { type: "any" };
      case "^":
        return { type: "anchor", value: "^" };
      case "$":
        return { type: "anchor", value: "$" };
      case "\\":
        return this.parseEscape();
      case ")":
      case "|":
        throw new UnsupportedRegexError(`unexpected "${c}"`);
      default:
        return { type: "char", value: c };
    }
  }

  private parseGroup(): Node {
    let capturing = true;
    let name: string | undefined;
    if (this.peek() === "?") {
      this.next();
      const k = this.next();
      if (k === ":") {
        capturing = false;
      } else if (k === "=" || k === "!") {
        const body = this.parseAlternation();
        this.expect(")");
        return { type: "look", negative: k === "!", behind: false, body };
      } else if (k === "<") {
        const after = this.peek();
        if (after === "=" || after === "!") {
          this.next();
          const body = this.parseAlternation();
          this.expect(")");
          return { type: "look", negative: after === "!", behind: true, body };
        }
        // named group (?<name>...)
        let nm = "";
        while (this.peek() !== ">" && !this.eof()) nm += this.next();
        this.expect(">");
        name = nm;
        capturing = true;
      } else {
        throw new UnsupportedRegexError(`unsupported group "(?${k}"`);
      }
    }
    const body = this.parseAlternation();
    this.expect(")");
    return { type: "group", capturing, name, body };
  }

  private parseClass(): ClassNode {
    let negated = false;
    if (this.peek() === "^") {
      this.next();
      negated = true;
    }
    const items: ClassItem[] = [];
    // a leading ] is a literal
    if (this.peek() === "]") {
      this.next();
      items.push({ kind: "char", value: "]" });
    }
    while (!this.eof() && this.peek() !== "]") {
      const item = this.parseClassItem();
      // range a-z?
      if (item.kind === "char" && this.peek() === "-" && this.src[this.i + 1] !== "]" && this.src[this.i + 1] !== undefined) {
        this.next(); // consume -
        const hi = this.parseClassItem();
        if (hi.kind === "char" && item.value && hi.value) {
          items.push({ kind: "range", from: item.value.codePointAt(0)!, to: hi.value.codePointAt(0)! });
        } else {
          items.push(item, { kind: "char", value: "-" }, hi);
        }
      } else {
        items.push(item);
      }
    }
    this.expect("]");
    return { type: "class", negated, items };
  }

  private parseClassItem(): ClassItem {
    const c = this.next();
    if (c === "\\") {
      const e = this.next();
      if (e === undefined) throw new UnsupportedRegexError("trailing backslash in class");
      if ("dDwWsS".includes(e)) return { kind: "shorthand", short: e };
      return { kind: "char", value: this.charEscape(e) };
    }
    return { kind: "char", value: c };
  }

  private parseEscape(): Node {
    const e = this.next();
    if (e === undefined) throw new UnsupportedRegexError("trailing backslash");
    if ("dDwWsS".includes(e)) return { type: "class", negated: false, items: [{ kind: "shorthand", short: e }] };
    if (e === "b") return { type: "anchor", value: "\\b" };
    if (e === "B") return { type: "anchor", value: "\\B" };
    if (e >= "1" && e <= "9") {
      let num = e;
      while (/[0-9]/.test(this.peek() ?? "")) num += this.next();
      return { type: "backref", ref: Number(num) };
    }
    if (e === "k" && this.peek() === "<") {
      this.next();
      let nm = "";
      while (this.peek() !== ">" && !this.eof()) nm += this.next();
      this.expect(">");
      return { type: "backref", ref: nm };
    }
    return { type: "char", value: this.charEscape(e) };
  }

  /** Resolve an escaped char (\n, \t, \xHH, , \u{1F600}, or an escaped metachar). */
  private charEscape(e: string): string {
    if (e in SIMPLE_ESCAPES) return SIMPLE_ESCAPES[e]!;
    if (e === "x") {
      const h = this.consumeHex(2);
      if (h.length > 0) return String.fromCodePoint(parseInt(h, 16));
    } else if (e === "u") {
      if (this.peek() === "{") {
        this.next();
        let h = "";
        while (this.peek() !== "}" && !this.eof()) h += this.next();
        this.expect("}");
        try {
          return String.fromCodePoint(parseInt(h, 16));
        } catch {
          throw new UnsupportedRegexError("bad \\u{} escape");
        }
      }
      const h = this.consumeHex(4);
      if (h.length > 0) return String.fromCodePoint(parseInt(h, 16));
    }
    return e; // escaped metacharacter → the literal char
  }

  private expect(ch: string): void {
    if (this.next() !== ch) throw new UnsupportedRegexError(`expected "${ch}"`);
  }

  private consumeHex(n: number): string {
    let h = "";
    for (let k = 0; k < n; k++) {
      const c = this.peek();
      if (c && /[0-9a-fA-F]/.test(c)) h += this.next();
      else break;
    }
    return h;
  }
}

const SIMPLE_ESCAPES: Record<string, string> = { n: "\n", r: "\r", t: "\t", f: "\f", v: "\v", "0": "\0" };

/** Parse a regex pattern string into an AST sequence. Throws UnsupportedRegexError on exotic syntax. */
export function parsePattern(pattern: string): Node[] {
  return new Parser(pattern).parse();
}
