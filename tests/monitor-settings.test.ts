import { afterEach, describe, expect, test } from "bun:test";
import {
  DEFAULT_SETTINGS,
  initialBucket,
  loadPersistedState,
  normalizePersistedState,
  normalizeSettings,
  SETTINGS_STORAGE_KEY,
  savePersistedState,
} from "../src/lib/monitor-settings";

function mockLocalStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key: string) {
      return data.has(key) ? (data.get(key) ?? null) : null;
    },
    key(index: number) {
      return [...data.keys()][index] ?? null;
    },
    removeItem(key: string) {
      data.delete(key);
    },
    setItem(key: string, value: string) {
      data.set(key, String(value));
    },
  };
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "localStorage");
});

describe("normalizeSettings", () => {
  test("fills defaults for empty and non-object input", () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings("oops")).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  test("clamps bad enums and keeps valid overrides", () => {
    expect(
      normalizeSettings({
        grouping: "galaxy",
        agentSort: "priority",
        density: "cozy",
        defaultBucket: "maybe",
        floatPinned: false,
        showAge: false,
      }),
    ).toEqual({
      ...DEFAULT_SETTINGS,
      floatPinned: false,
      showAge: false,
    });

    expect(
      normalizeSettings({
        grouping: "compact",
        agentSort: "title",
        density: "compact",
        defaultBucket: "remember",
        hideClosedUnlessFiltered: true,
      }),
    ).toEqual({
      ...DEFAULT_SETTINGS,
      grouping: "compact",
      agentSort: "title",
      density: "compact",
      defaultBucket: "remember",
      hideClosedUnlessFiltered: true,
    });
  });
});

describe("normalizePersistedState", () => {
  test("normalizes nested settings and lastBucket", () => {
    expect(normalizePersistedState(undefined)).toEqual({
      settings: DEFAULT_SETTINGS,
      lastBucket: null,
    });
    expect(
      normalizePersistedState({
        settings: { grouping: "workspace", agentSort: "nope" },
        lastBucket: "running",
      }),
    ).toEqual({
      settings: { ...DEFAULT_SETTINGS, grouping: "workspace" },
      lastBucket: "running",
    });
    expect(normalizePersistedState({ lastBucket: "bogus", grouping: "compact" })).toEqual({
      settings: { ...DEFAULT_SETTINGS, grouping: "compact" },
      lastBucket: null,
    });
    expect(normalizePersistedState({ lastBucket: null })).toEqual({
      settings: DEFAULT_SETTINGS,
      lastBucket: null,
    });
  });
});

describe("initialBucket", () => {
  test("maps all / remember / attention defaults", () => {
    expect(initialBucket({ ...DEFAULT_SETTINGS, defaultBucket: "all" }, "running")).toBe(null);
    expect(initialBucket({ ...DEFAULT_SETTINGS, defaultBucket: "remember" }, "idle")).toBe("idle");
    expect(initialBucket({ ...DEFAULT_SETTINGS, defaultBucket: "remember" }, null)).toBe(null);
    expect(initialBucket({ ...DEFAULT_SETTINGS, defaultBucket: "attention" }, "closed")).toBe(
      "attention",
    );
  });
});

describe("savePersistedState / loadPersistedState", () => {
  test("roundtrips through a mock localStorage on globalThis", () => {
    const store = mockLocalStorage();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      writable: true,
      value: store,
    });

    expect(loadPersistedState()).toEqual({ settings: DEFAULT_SETTINGS, lastBucket: null });

    const saved = {
      settings: {
        ...DEFAULT_SETTINGS,
        grouping: "compact" as const,
        agentSort: "title" as const,
        defaultBucket: "remember" as const,
        floatPinned: false,
      },
      lastBucket: "attention" as const,
    };
    savePersistedState(saved);

    expect(store.getItem(SETTINGS_STORAGE_KEY)).toBeTruthy();
    expect(loadPersistedState()).toEqual(saved);
  });

  test("returns defaults when localStorage is missing", () => {
    expect(loadPersistedState()).toEqual({ settings: DEFAULT_SETTINGS, lastBucket: null });
  });
});
