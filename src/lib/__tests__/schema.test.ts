/* ============================================================
   Output schemas (§4.9, decision Q1: the canvas is an orchestrator).
   The subset the app implements, pinned: what it enforces, and — just as important —
   what it refuses to pretend to understand.
   ============================================================ */
import { describe, it, expect } from "vitest";
import { validateAgainstSchema, parseOutputSchema, SUPPORTED_SCHEMA_KEYWORDS, type OutputSchema } from "../core";
import { ROLE_SCHEMAS } from "../../state";

const schema = (o: Partial<OutputSchema>) => o as OutputSchema;

describe("validateAgainstSchema — presence", () => {
  it("accepts a full, non-empty object", () => {
    const s = schema({
      type: "object",
      required: ["summary", "risk_score"],
      properties: { summary: { type: "string", minLength: 5 }, risk_score: { type: "integer", minimum: 1, maximum: 10 } },
    });
    expect(validateAgainstSchema({ summary: "three risks were weighed", risk_score: "7" }, s)).toEqual([]);
  });

  it("rejects a missing field and a field that is only whitespace", () => {
    const s = schema({ required: ["summary", "risks"], properties: { summary: { type: "string" }, risks: { type: "string" } } });
    expect(validateAgainstSchema({ summary: "ok", risks: "   " }, s)).toEqual([`“risks” is required by the contract and came back empty`]);
    expect(validateAgainstSchema({ summary: "ok" }, s)).toHaveLength(1);
  });

  it("enforces additionalProperties: false in both directions", () => {
    const s = schema({ required: ["summary"], additionalProperties: false, properties: { summary: { type: "string" } } });
    expect(validateAgainstSchema({ summary: "x", extra: "y" }, s)).toEqual(["“extra” is not declared in the schema (additionalProperties: false)"]);
    expect(validateAgainstSchema({ summary: "x", extra: "y" }, schema({ required: ["summary"] }))).toEqual([]);
  });
});

describe("validateAgainstSchema — types, because output files are text", () => {
  it("reads a numeric field as 'nothing but a number'", () => {
    const s = schema({ properties: { risk_score: { type: "integer" } } });
    expect(validateAgainstSchema({ risk_score: "5" }, s)).toEqual([]);
    expect(validateAgainstSchema({ risk_score: " -2 " }, s)).toEqual([]);
    expect(validateAgainstSchema({ risk_score: "Total: 5 out of 10" }, s)).toEqual([
      `“risk_score” must be an integer, got "Total: 5 out of 10"`,
    ]);
    expect(validateAgainstSchema({ risk_score: "5.5" }, s)).toEqual([`“risk_score” must be an integer, got 5.5`]);
  });

  it("checks ranges, enums and patterns", () => {
    const s = schema({
      properties: {
        score: { type: "number", minimum: 0, maximum: 10 },
        verdict: { type: "string", enum: ["reject", "revise", "approve"] },
        risks: { type: "string", pattern: "^-" },
      },
    });
    expect(validateAgainstSchema({ score: "4", verdict: "revise", risks: "- one" }, s)).toEqual([]);
    expect(validateAgainstSchema({ score: "11" }, s)).toEqual([`“score” = 11 is above the maximum 10`]);
    expect(validateAgainstSchema({ score: "-1" }, s)).toEqual([`“score” = -1 is below the minimum 0`]);
    expect(validateAgainstSchema({ verdict: "maybe" }, s)).toEqual([`“verdict” = "maybe" is not one of "reject", "revise", "approve"`]);
    expect(validateAgainstSchema({ risks: "no dash here" }, s)).toEqual([`“risks” does not match the required pattern /^-/`]);
  });

  it("checks lengths, and booleans", () => {
    const s = schema({ properties: { summary: { type: "string", minLength: 10, maxLength: 12 }, go: { type: "boolean" } } });
    expect(validateAgainstSchema({ summary: "short" }, s)).toEqual([`“summary” is 5 characters, the schema needs at least 10`]);
    expect(validateAgainstSchema({ summary: "twelve chars" }, s)).toEqual([]);
    expect(validateAgainstSchema({ summary: "thirteen chars!" }, s)).toEqual([`“summary” is 15 characters, the schema allows at most 12`]);
    expect(validateAgainstSchema({ go: "yes" }, s)).toEqual([]);
    expect(validateAgainstSchema({ go: "perhaps" }, s)).toEqual([`“go” must be a boolean, got "perhaps"`]);
  });
});

describe("validateAgainstSchema — it refuses to be partial about being partial", () => {
  it("reports keywords it does not implement instead of ignoring them", () => {
    const s = schema({ type: "object", required: ["a"], properties: { a: { type: "string" } }, oneOf: [] } as unknown as OutputSchema);
    expect(validateAgainstSchema({ a: "x" }, s)).toEqual([`unsupported keyword “oneOf” in the schema — refusing to ignore it`]);
  });

  it("reports an unknown field keyword with its path", () => {
    const s = schema({ properties: { a: { type: "string", items: {} } } } as unknown as OutputSchema);
    expect(validateAgainstSchema({ a: "x" }, s)).toEqual([`unsupported keyword “a.items” in the schema — refusing to ignore it`]);
  });

  it("rejects a schema whose root is not an object", () => {
    expect(validateAgainstSchema({ a: "x" }, schema({ type: "array" } as unknown as OutputSchema))).toEqual([
      'the schema root must be an object (found "array")',
    ]);
  });

  it("treats a bad pattern as the schema's own failure", () => {
    const s = schema({ properties: { a: { type: "string", pattern: "([unclosed" } } });
    expect(validateAgainstSchema({ a: "x" }, s)).toEqual([`“a” declares an invalid pattern in the schema: ([unclosed`]);
  });

  it("pins the documented keyword set so the promise stays checkable", () => {
    expect(SUPPORTED_SCHEMA_KEYWORDS).toEqual(["$schema", "title", "description", "type", "required", "additionalProperties", "properties"]);
  });
});

describe("parseOutputSchema", () => {
  it("accepts one JSON object and rejects everything else", () => {
    expect(parseOutputSchema('{"type":"object"}')).toEqual({ ok: true, schema: { type: "object" } });
    expect(parseOutputSchema("{ not json").ok).toBe(false);
    expect(parseOutputSchema("[1,2]").ok).toBe(false);
    expect(parseOutputSchema('"just a string"').ok).toBe(false);
    expect(parseOutputSchema("null").ok).toBe(false);
  });
});

describe("the shipped role schemas", () => {
  const roles = ["understander", "risk-analyst", "solution-designer", "decision-maker"] as const;

  it("exist for every built-in role, parse, and are object schemas", () => {
    for (const r of roles) {
      const text = JSON.stringify(ROLE_SCHEMAS[r]);
      const parsed = parseOutputSchema(text);
      expect(parsed.ok, r).toBe(true);
      const s = (parsed as { ok: true; schema: OutputSchema }).schema;
      expect(s.type, r).toBe("object");
      expect((s.required ?? []).length, r).toBeGreaterThan(2);
      expect(s.additionalProperties, r).toBe(false);
    }
  });

  it("declare exactly the fields their role contracts promise", () => {
    // a role that promises a field the schema forgot would pass validation while writing an empty file
    for (const r of roles) {
      const s = ROLE_SCHEMAS[r] as OutputSchema;
      for (const f of s.required ?? []) expect(Object.keys(s.properties ?? {}), `${r}: required field “${f}” has no property`).toContain(f);
    }
  });

  it("accept a number only for risk_score, so the conditional edge reads data", () => {
    const s = ROLE_SCHEMAS["risk-analyst"] as OutputSchema;
    expect(s.properties?.risk_score?.type).toBe("integer");
    expect(s.properties?.risk_score?.minimum).toBe(1);
    expect(s.properties?.risk_score?.maximum).toBe(10);
    const fields = {
      summary: "three risks were weighed against the plan as written",
      risks: "- the budget drifts once integration starts",
      decision: "revise the integration step before committing to it",
      risk_score: "7",
    };
    expect(validateAgainstSchema(fields, s)).toEqual([]);
    // one complaint when the score leaves its range, and it names the field
    expect(validateAgainstSchema({ ...fields, risk_score: "11" }, s)).toEqual(["“risk_score” = 11 is above the maximum 10"]);
  });
});
