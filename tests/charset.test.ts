import { describe, it, expect } from "vitest";
import { CharSet } from "../src/charset.js";
import { parsePattern } from "../src/parse.js";
import type { ClassNode } from "../src/ast.js";

const cls = (src: string) => CharSet.fromClass(parsePattern(src)[0] as ClassNode);

describe("CharSet overlap", () => {
  it("knows shorthand relationships", () => {
    expect(CharSet.shorthand("d").overlaps(CharSet.shorthand("w"))).toBe(true); // digits ⊂ word
    expect(CharSet.shorthand("d").overlaps(CharSet.shorthand("s"))).toBe(false);
    expect(CharSet.shorthand("w").overlaps(CharSet.literal("a"))).toBe(true);
    expect(CharSet.shorthand("d").overlaps(CharSet.literal("a"))).toBe(false);
  });

  it("treats `.` as matching almost anything except newlines", () => {
    expect(CharSet.any().test("a")).toBe(true);
    expect(CharSet.any().test("!")).toBe(true);
    expect(CharSet.any().test("\n")).toBe(false);
    expect(CharSet.any().overlaps(CharSet.literal("x"))).toBe(true);
  });

  it("handles ranges and negation in classes", () => {
    expect(cls("[a-f]").test("c")).toBe(true);
    expect(cls("[a-f]").test("z")).toBe(false);
    expect(cls("[^0-9]").test("a")).toBe(true);
    expect(cls("[^0-9]").test("5")).toBe(false);
    expect(cls("[a-z]").overlaps(cls("[p-t]"))).toBe(true);
    expect(cls("[a-f]").overlaps(cls("[x-z]"))).toBe(false);
  });
});
