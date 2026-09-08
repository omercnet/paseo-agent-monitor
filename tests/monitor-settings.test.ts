import { describe, expect, test } from "bun:test";
import { DEFAULT_SETTINGS, initialBucket, monitorSettings } from "../shared/monitor-settings";

describe("monitor settings document", () => {
  test("is host-scoped and supplies a complete default document", () => {
    expect(monitorSettings.id).toBe("monitor");
    expect(monitorSettings.scope).toBe("host");
    expect(monitorSettings.version).toBe(1);
    expect(monitorSettings.schema.parse({})).toEqual(DEFAULT_SETTINGS);
  });

  test("accepts complete typed overrides and rejects invalid values", () => {
    expect(
      monitorSettings.schema.parse({
        grouping: "compact",
        agentSort: "title",
        density: "compact",
        defaultBucket: "remember",
        floatPinned: false,
        showAge: false,
        hideClosedUnlessFiltered: true,
      }),
    ).toEqual({
      ...DEFAULT_SETTINGS,
      grouping: "compact",
      agentSort: "title",
      density: "compact",
      defaultBucket: "remember",
      floatPinned: false,
      showAge: false,
      hideClosedUnlessFiltered: true,
    });
    expect(() => monitorSettings.schema.parse({ grouping: "galaxy" })).toThrow();
  });
});

describe("initialBucket", () => {
  test("maps all, remembered, and explicit defaults", () => {
    expect(initialBucket({ ...DEFAULT_SETTINGS, defaultBucket: "all" }, "running")).toBe(null);
    expect(initialBucket({ ...DEFAULT_SETTINGS, defaultBucket: "remember" }, "idle")).toBe("idle");
    expect(initialBucket({ ...DEFAULT_SETTINGS, defaultBucket: "remember" }, null)).toBe(null);
    expect(initialBucket({ ...DEFAULT_SETTINGS, defaultBucket: "attention" }, "closed")).toBe(
      "attention",
    );
  });
});
