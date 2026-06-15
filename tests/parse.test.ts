import { describe, it, expect } from "vitest";
import { parsePattern, UnsupportedRegexError } from "../src/parse.js";
import type { Quantifier, Group, Alternation, ClassNode } from "../src/ast.js";

describe("parsePattern", () => {
  it("parses chars, quantifiers, and greediness", () => {
    const ast = parsePattern("ab+c*?");
    expect(ast).toHaveLength(3);
    expect(ast[0]).toEqual({ type: "char", value: "a" });
    const plus = ast[1] as Quantifier;
    expect(plus.type).toBe("quant");
    expect(plus.min).toBe(1);
    expect(plus.max).toBe(Infinity);
    const star = ast[2] as Quantifier;
    expect(star.lazy).toBe(true);
  });

  it("parses {n,m} bounds and treats a bare { as a literal", () => {
    const q = parsePattern("a{2,5}")[0] as Quantifier;
    expect([q.min, q.max]).toEqual([2, 5]);
    expect((parsePattern("a{2,}")[0] as Quantifier).max).toBe(Infinity);
    expect(parsePattern("a{not}")).toHaveLength(6); // a { n o t } as literals
  });

  it("parses groups, non-capturing, named, and alternation", () => {
    const g = parsePattern("(?:a|b)")[0] as Group;
    expect(g.type).toBe("group");
    expect(g.capturing).toBe(false);
    const alt = g.body[0] as Alternation;
    expect(alt.type).toBe("alt");
    expect(alt.options).toHaveLength(2);
    expect((parsePattern("(?<year>\\d+)")[0] as Group).name).toBe("year");
  });

  it("parses character classes with ranges, negation, and shorthands", () => {
    const cls = parsePattern("[^a-z0-9_]")[0] as ClassNode;
    expect(cls.type).toBe("class");
    expect(cls.negated).toBe(true);
    expect(cls.items.some((i) => i.kind === "range")).toBe(true);
    expect(parsePattern("\\d")[0]!.type).toBe("class");
  });

  it("parses lookarounds as zero-width and anchors", () => {
    expect(parsePattern("(?=foo)")[0]!.type).toBe("look");
    expect(parsePattern("(?<!x)")[0]).toMatchObject({ type: "look", behind: true, negative: true });
    expect(parsePattern("^$")[0]).toEqual({ type: "anchor", value: "^" });
    expect(parsePattern("\\bword\\b")[0]).toEqual({ type: "anchor", value: "\\b" });
  });

  it("parses escapes and backreferences", () => {
    expect(parsePattern("\\n")[0]).toEqual({ type: "char", value: "\n" });
    expect(parsePattern("\\x41")[0]).toEqual({ type: "char", value: "A" });
    expect(parsePattern("(a)\\1")[1]).toEqual({ type: "backref", ref: 1 });
  });

  it("throws UnsupportedRegexError on exotic syntax (not a crash)", () => {
    expect(() => parsePattern("a)")).toThrow(UnsupportedRegexError);
    expect(() => parsePattern("a++")).toThrow(UnsupportedRegexError); // possessive
    expect(() => parsePattern("^*")).toThrow(UnsupportedRegexError); // quantified anchor
  });
});
