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

    async addGuessedGame(steamId, game, guessedAt = new Date().toISOString()) {
      return this.updatePlayerRecord(steamId, (record) => ({
        ...record,
        guessedGames: [
          ...record.guessedGames.filter((entry) => entry.appId !== game.appId),
          normalizeGuessedGame({
            appId: game.appId,
            name: game.name,
            coverUrl: game.coverUrl,
            steamUrl: game.steamUrl,
            reviewCount: game.reviewCount,
            guessedAt
          })
        ]
      }));
    },

    async updateGuessedGameMetadata(steamId, games) {
      const gameByAppId = new Map(
        games
          .map((game) => [Number.parseInt(game?.appId, 10), game])
          .filter(([appId]) => Number.isInteger(appId))
      );

      if (gameByAppId.size === 0) {
        return this.getPlayerRecord(steamId);
      }

      return this.updatePlayerRecord(steamId, (record) => ({
        ...record,
        guessedGames: record.guessedGames.map((game) => {
          const next = gameByAppId.get(game.appId);
          return next
            ? normalizeGuessedGame({
              ...game,
              name: next.name,
              coverUrl: next.coverUrl,
              steamUrl: next.steamUrl,
              reviewCount: next.reviewCount,
              guessedAt: game.guessedAt
            })
            : game;
        })
      }));
    },

    async listGuessedGames(steamId, {
      page = 1,
      pageSize,
      excludedAppIds = []
    }) {
      const record = await this.getPlayerRecord(steamId);
      const excluded = new Set(excludedAppIds);
      const safePageSize = Math.max(1, Number.parseInt(pageSize, 10) || 1);
      const sortedGames = record.guessedGames
        .map((game, index) => ({ game, index }))
        .filter(({ game }) => !excluded.has(game.appId))
        .sort(compareRecentGuessedGames)
        .map(({ game }) => game);
      const totalItems = sortedGames.length;
      const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
      const safePage = clampInteger(page, 1, totalPages);
      const offset = (safePage - 1) * safePageSize;

      return {
        items: sortedGames.slice(offset, offset + safePageSize),
        page: safePage,
        pageSize: safePageSize,
        totalItems,
        totalPages
      };
    },

    async clearPlayerHistory(steamId) {
      return this.updatePlayerRecord(steamId, () => createEmptyPlayerRecord());
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
  const guessedGames = normalizeGuessedGames(record);

  return {
    highScore: Math.max(0, Number.parseInt(record?.highScore ?? 0, 10) || 0),
    bestStreak: Math.max(0, Number.parseInt(record?.bestStreak ?? 0, 10) || 0),
    completedRuns: Math.max(0, Number.parseInt(record?.completedRuns ?? 0, 10) || 0),
    guessedGames,
    guessedAppIds: guessedGames.map((game) => game.appId),
    updatedAt: typeof record?.updatedAt === "string" ? record.updatedAt : null
  };
}

export function createEmptyPlayerRecord() {
  return {
    highScore: 0,
    bestStreak: 0,
    completedRuns: 0,
    guessedGames: [],
    guessedAppIds: [],
    updatedAt: null
  };
}

function normalizeGuessedGames(record) {
  const legacyAppIds = Array.isArray(record?.guessedAppIds)
    ? record.guessedAppIds.map((appId) => Number.parseInt(appId, 10)).filter(Number.isInteger)
    : [];
  const guessedGames = Array.isArray(record?.guessedGames)
    ? record.guessedGames.map(normalizeGuessedGame).filter(Boolean)
    : [];
  const legacyGames = legacyAppIds
    .filter((appId) => !guessedGames.some((game) => game.appId === appId))
    .map(createLegacyGuessedGame);

  return dedupeGuessedGames([...legacyGames, ...guessedGames]);
}

function normalizeGuessedGame(game) {
  const appId = Number.parseInt(game?.appId, 10);
  if (!Number.isInteger(appId)) {
    return null;
  }

  return {
    appId,
    name: typeof game?.name === "string" && game.name.length > 0
      ? game.name
      : `Steam App ${appId}`,
    coverUrl: typeof game?.coverUrl === "string" ? game.coverUrl : "",
    steamUrl: typeof game?.steamUrl === "string" && game.steamUrl.length > 0
      ? game.steamUrl
      : `https://store.steampowered.com/app/${appId}/`,
    reviewCount: Number.isInteger(game?.reviewCount) ? game.reviewCount : null,
    guessedAt: typeof game?.guessedAt === "string" ? game.guessedAt : null
  };
}

function createLegacyGuessedGame(appId) {
  return normalizeGuessedGame({ appId });
}

function dedupeGuessedGames(games) {
  const byAppId = new Map();

  for (const game of games) {
    if (!game) {
      continue;
    }

    if (byAppId.has(game.appId)) {
      byAppId.delete(game.appId);
    }
    byAppId.set(game.appId, game);
  }

  return Array.from(byAppId.values());
}

function compareRecentGuessedGames(left, right) {
  const rightTime = Date.parse(right.game.guessedAt ?? "");
  const leftTime = Date.parse(left.game.guessedAt ?? "");
  const normalizedRightTime = Number.isFinite(rightTime) ? rightTime : 0;
  const normalizedLeftTime = Number.isFinite(leftTime) ? leftTime : 0;

  return normalizedRightTime - normalizedLeftTime || right.index - left.index;
}

function clampInteger(value, min, max) {
  const integer = Number.parseInt(value, 10);
  if (!Number.isInteger(integer)) {
    return min;
  }
  return Math.min(max, Math.max(min, integer));
}
