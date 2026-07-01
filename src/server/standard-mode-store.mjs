import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export function createStandardModeStore({ storePath }) {
  let cache = null;

  async function load() {
    if (cache) {
      return cache;
    }

    try {
      cache = normalizeStore(JSON.parse(await readFile(storePath, "utf8")));
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
      cache = createEmptyStore();
    }

    return cache;
  }

  async function save(store) {
    await mkdir(path.dirname(storePath), { recursive: true });
    await writeFile(storePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
    cache = store;
  }

  return {
    async getPlayerRecord(steamId) {
      const store = await load();
      return normalizePlayerRecord(store.players[steamId]);
    },

    async updatePlayerRecord(steamId, updater) {
      const store = await load();
      const current = normalizePlayerRecord(store.players[steamId]);
      const next = normalizePlayerRecord(await updater(current));
      next.updatedAt = new Date().toISOString();
      store.players[steamId] = next;
      await save(store);
      return next;
    },

    async resetForTests() {
      cache = createEmptyStore();
      await save(cache);
    }
  };
}

export function createEmptyStore() {
  return {
    schemaVersion: 1,
    players: {}
  };
}

export function normalizeStore(value) {
  return {
    schemaVersion: 1,
    players: value && typeof value.players === "object" && !Array.isArray(value.players)
      ? Object.fromEntries(
        Object.entries(value.players).map(([steamId, record]) => [steamId, normalizePlayerRecord(record)])
      )
      : {}
  };
}

export function normalizePlayerRecord(record) {
  return {
    highScore: Math.max(0, Number.parseInt(record?.highScore ?? 0, 10) || 0),
    bestStreak: Math.max(0, Number.parseInt(record?.bestStreak ?? 0, 10) || 0),
    completedRuns: Math.max(0, Number.parseInt(record?.completedRuns ?? 0, 10) || 0),
    guessedAppIds: Array.from(new Set(
      Array.isArray(record?.guessedAppIds)
        ? record.guessedAppIds.map((appId) => Number.parseInt(appId, 10)).filter(Number.isInteger)
        : []
    )),
    updatedAt: typeof record?.updatedAt === "string" ? record.updatedAt : null
  };
}
