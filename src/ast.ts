// A small regex AST — enough of JS regex syntax to reason about backtracking.
// Anything we can't parse becomes a thrown error the caller treats as "skipped",
// never a crash.

export type Node = Char | AnyChar | ClassNode | Group | Alternation | Quantifier | Anchor | Lookaround | Backref;

export interface Char {
  type: "char";
  /** Single code point as a string. */
  value: string;
}

export interface AnyChar {
  type: "any";
  /** `.` — matches any char (we ignore the newline nuance for overlap purposes). */
}

export interface ClassItem {
  /** A single char, or a range [from,to] of code points. */
  kind: "char" | "range" | "shorthand";
  value?: string;
  from?: number;
  to?: number;
  /** d|D|w|W|s|S for shorthand. */
  short?: string;
}

export interface ClassNode {
  type: "class";
  negated: boolean;
  items: ClassItem[];
}

export interface Group {
  type: "group";
  capturing: boolean;
  name?: string;
  body: Node[];
}

export interface Alternation {
  type: "alt";
  /** Each option is a sequence of nodes. */
  options: Node[][];
}

export interface Quantifier {
  type: "quant";
  min: number;
  /** Infinity for unbounded (* + {n,}). */
  max: number;
  lazy: boolean;
  child: Node;
}

export interface Anchor {
  type: "anchor";
  value: "^" | "$" | "\\b" | "\\B";
}

export interface Lookaround {
  type: "look";
  negative: boolean;
  behind: boolean;
  body: Node[];
}

export interface Backref {
  type: "backref";
  ref: string | number;
}

export const isUnbounded = (q: Quantifier): boolean => q.max === Infinity;
