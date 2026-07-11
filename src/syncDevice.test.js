import assert from "node:assert/strict";
import test from "node:test";
import { accountStorageKeys } from "./accountStorage.js";
import { createBrowserSyncDevice } from "./syncDevice.js";

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    entries() {
      return [...values.entries()];
    },
  };
}

const userAgentCases = [
  {
    name: "Edge on Windows",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0",
    label: "Edge auf Windows",
  },
  {
    name: "Chrome on Android",
    userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36",
    label: "Chrome auf Android",
  },
  {
    name: "Firefox on Linux",
    userAgent: "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0",
    label: "Firefox auf Linux",
  },
  {
    name: "Safari on macOS",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15",
    label: "Safari auf macOS",
  },
  {
    name: "Safari on iOS",
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1",
    label: "Safari auf iOS",
  },
  {
    name: "Chrome on ChromeOS",
    userAgent: "Mozilla/5.0 (X11; CrOS x86_64 15917.47.0) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36",
    label: "Chrome auf ChromeOS",
  },
];

for (const { name, userAgent, label } of userAgentCases) {
  test(`creates a German device label for ${name}`, () => {
    const device = createBrowserSyncDevice({
      storage: createMemoryStorage(),
      navigatorObject: { userAgent },
    });

    assert.equal(device.label, label);
    assert.equal(device.userAgent, userAgent);
  });
}

test("recognizes iPadOS desktop user agents as iOS", () => {
  const device = createBrowserSyncDevice({
    storage: createMemoryStorage(),
    navigatorObject: {
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1",
      maxTouchPoints: 5,
    },
  });

  assert.equal(device.label, "Safari auf iOS");
});

test("falls back safely for an unknown user agent", () => {
  const device = createBrowserSyncDevice({
    storage: createMemoryStorage(),
    navigatorObject: { userAgent: "UnknownAgent/1.0" },
  });

  assert.equal(device.label, "Browser");
  assert.equal(device.userAgent, "UnknownAgent/1.0");
});

test("persists only the stable device ID", () => {
  const storage = createMemoryStorage();
  const navigatorObject = {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0 Safari/537.36",
  };

  const first = createBrowserSyncDevice({ storage, navigatorObject });
  const second = createBrowserSyncDevice({ storage, navigatorObject });

  assert.equal(second.id, first.id);
  assert.deepEqual(storage.entries(), [[accountStorageKeys.SYNC_DEVICE_KEY, first.id]]);
});
