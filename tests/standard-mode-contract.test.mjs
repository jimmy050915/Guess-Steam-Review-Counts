import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  calculateGuessErrorPercent,
  calculateGuessScore,
  getReviewBucketId,
  getTrimmedVideoDurationSeconds,
  isDamageGuess,
  isVideoPlayableAfterTrim,
  validateStandardModeConfig
} from "../src/shared/standard-mode-contract.mjs";
import { createStandardCandidatePool } from "../src/server/standard-candidate-pool.mjs";
import { createStandardModeRunner } from "../src/server/standard-mode-runner.mjs";
import { createStandardModeStore } from "../src/server/standard-mode-store.mjs";
import {
  createSteamStandardCatalog,
  extractAppIdFromStoreSearchItem,
  normalizeDurationSeconds,
  passesDetailsFilters,
  selectTrailerVideo
} from "../src/server/steam-standard-catalog.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("standard mode data declares queue, filters and review buckets", async () => {
  const config = await readJson("data/game/standard-mode.json");

  assert.deepEqual(validateStandardModeConfig(config), []);
  assert.equal(config.rules.queueSize, 10);
  assert.equal(config.rules.readyQueueSize, 2);
  assert.equal(config.rules.initialHealth, 3);
  assert.equal(config.rules.minReviewCount, 50);
  assert.equal(config.rules.damageErrorPercent, 200);
  assert.equal(config.rules.requiresVideo, true);
  assert.equal(config.scoring.id, "standard-error-percent-v1");
  assert.deepEqual(
    config.scoring.scoreBands.map((band) => [band.id, band.maxErrorPercent, band.points]),
    [
      ["error-10", 10, 100],
      ["error-20", 20, 90],
      ["error-30", 30, 70],
      ["error-40", 40, 50],
      ["error-60", 60, 20],
      ["error-100", 100, 10],
      ["error-over-100-safe", 200, 1]
    ]
  );
  assert.equal(config.selection.storeSearchPageCount, 4);
  assert.equal(config.selection.storeSearchPageSize, 50);
  assert.equal(config.selection.storeSearchMaxStart, 5000);
  assert.equal(config.candidatePool.path, ".cache/standard-candidate-pool.json");
  assert.equal(config.candidatePool.maxEntriesPerBucket, 80);
  assert.equal(config.history.guessedGamesPageSize, 100);
  assert.equal(config.video.trimStartSeconds, 10);
  assert.equal(config.video.trimEndSeconds, 10);
  assert.equal(config.video.minimumPlayableSecondsAfterTrim, 10);
  assert.equal(getReviewBucketId(50, config.selection.reviewBuckets), "50-99");
  assert.equal(getReviewBucketId(50000, config.selection.reviewBuckets), "50000-plus");
  assert.equal(calculateGuessErrorPercent({ guess: 100, actual: 300 }), 200);
  assert.equal(calculateGuessErrorPercent({ guess: 100, actual: 301 }), 201);
  assert.equal(isDamageGuess({ guess: 100, actual: 300, damageErrorPercent: 200 }), false);
  assert.equal(isDamageGuess({ guess: 100, actual: 301, damageErrorPercent: 200 }), true);
  assert.equal(isDamageGuess({ guess: 301, actual: 100, damageErrorPercent: 200 }), true);
  assert.equal(calculateGuessScore({ errorPercent: 10, scoreBands: config.scoring.scoreBands }), 100);
  assert.equal(calculateGuessScore({ errorPercent: 10.1, scoreBands: config.scoring.scoreBands }), 90);
  assert.equal(calculateGuessScore({ errorPercent: 20, scoreBands: config.scoring.scoreBands }), 90);
  assert.equal(calculateGuessScore({ errorPercent: 30, scoreBands: config.scoring.scoreBands }), 70);
  assert.equal(calculateGuessScore({ errorPercent: 40, scoreBands: config.scoring.scoreBands }), 50);
  assert.equal(calculateGuessScore({ errorPercent: 47.2, scoreBands: config.scoring.scoreBands }), 20);
  assert.equal(calculateGuessScore({ errorPercent: 60, scoreBands: config.scoring.scoreBands }), 20);
  assert.equal(calculateGuessScore({ errorPercent: 100, scoreBands: config.scoring.scoreBands }), 10);
  assert.equal(calculateGuessScore({ errorPercent: 100.1, scoreBands: config.scoring.scoreBands }), 1);
  assert.equal(calculateGuessScore({ errorPercent: 200, scoreBands: config.scoring.scoreBands }), 1);
  assert.equal(calculateGuessScore({ errorPercent: 200.1, scoreBands: config.scoring.scoreBands }), 0);
  assert.equal(getTrimmedVideoDurationSeconds(45, config.video), 25);
  assert.equal(isVideoPlayableAfterTrim(45, config.video), true);
  assert.equal(isVideoPlayableAfterTrim(25, config.video), false);
});

test("steam candidate filters reject non-standard games and keep a valid video game", async () => {
  const config = await readJson("data/game/standard-mode.json");
  const validDetails = {
    type: "game",
    required_age: 0,
    name: "Playable Demo",
    header_image: "https://cdn.example/header.jpg",
    movies: [
      {
        id: 1,
        name: "Trailer",
        duration: "0:45",
        thumbnail: "https://cdn.example/poster.jpg",
        mp4: { max: "https://cdn.example/trailer.mp4" },
        hls_h264: "https://cdn.example/trailer.m3u8"
      }
    ],
    genres: [{ description: "Action" }],
    categories: []
  };

  assert.equal(passesDetailsFilters({ ...validDetails, type: "dlc" }, config), false);
  assert.equal(passesDetailsFilters({ ...validDetails, required_age: 18 }, config), false);
  assert.equal(passesDetailsFilters({ ...validDetails, genres: [{ description: "Adult Only" }] }, config), false);
  assert.equal(passesDetailsFilters(validDetails, config), true);

  const trailer = selectTrailerVideo(validDetails.movies);
  assert.equal(trailer.posterUrl, "https://cdn.example/poster.jpg");
  assert.equal(trailer.durationSeconds, 45);
  assert.equal(normalizeDurationSeconds("01:02:03"), 3723);
  assert.deepEqual(trailer.sources.map((source) => source.kind), ["mp4", "hls"]);
});

test("standard candidate pool stores candidates by bucket and respects exclusions", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "gsc-pool-"));
  const poolPath = path.join(tempDir, "standard-candidate-pool.json");

  try {
    const pool = createStandardCandidatePool({
      poolPath,
      maxEntriesPerBucket: 2,
      random: () => 0
    });

    await pool.addCandidate(createCandidate(10, "1000-1999"));
    assert.equal((await pool.findCandidate(["1000-1999"], new Set())).appId, 10);
    assert.equal(await pool.findCandidate(["1000-1999"], new Set([10])), null);

    await pool.removeCandidate(10);
    assert.equal(await pool.findCandidate(["1000-1999"], new Set()), null);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("steam catalog returns pooled candidates before probing Steam", async () => {
  const config = await readJson("data/game/standard-mode.json");
  const catalog = createSteamStandardCatalog({
    config,
    candidatePool: {
      async findCandidate(bucketIds) {
        return bucketIds.includes("50-99") ? createCandidate(99, "50-99") : null;
      },
      async addCandidate() {},
      async removeCandidate() {}
    },
    fetchImpl: async () => {
      throw new Error("Steam should not be probed when the target bucket is pooled");
    }
  });

  const candidate = await catalog.findCandidate({ preferredBucketIds: ["50-99"] });
  assert.equal(candidate.appId, 99);
  assert.equal(candidate.reviewBucketId, "50-99");
});

test("steam catalog skips invalid candidates and returns a real normalized candidate", async () => {
  const config = await readJson("data/game/standard-mode.json");
  const detailsByAppId = new Map([
    [1, { success: true, data: { type: "dlc", required_age: 0, name: "DLC" } }],
    [2, { success: true, data: { type: "game", required_age: 18, name: "Age Gate" } }],
    [3, { success: true, data: { type: "game", required_age: 0, name: "Adult", genres: [{ description: "Adult Only" }] } }],
    [4, { success: true, data: { type: "game", required_age: 0, name: "No Video", movies: [] } }],
    [5, { success: true, data: validDetailsFor(5, "Low Reviews") }],
    [6, { success: true, data: validDetailsFor(6, "Valid Game") }]
  ]);
  const reviewsByAppId = new Map([
    [5, 49],
    [6, 100]
  ]);
  const catalog = createSteamStandardCatalog({
    config,
    random: () => 0,
    fetchImpl: async (input) => {
      const url = new URL(String(input));
      if (url.href.includes("GetAppList")) {
        return jsonResponse({
          applist: {
            apps: [1, 2, 3, 4, 5, 6].map((appid) => ({ appid, name: `App ${appid}` }))
          }
        });
      }

      if (url.href.includes("appdetails")) {
        return jsonResponse({
          [url.searchParams.get("appids")]: detailsByAppId.get(Number(url.searchParams.get("appids")))
        });
      }

      const appId = Number(url.pathname.split("/").at(-1));
      return jsonResponse({
        query_summary: {
          total_reviews: reviewsByAppId.get(appId) ?? 0
        }
      });
    }
  });

  const candidate = await catalog.findCandidate();
  assert.equal(candidate.appId, 6);
  assert.equal(candidate.name, "Valid Game");
  assert.equal(candidate.reviewCount, 100);
  assert.equal(candidate.reviewBucketId, "100-199");
  assert.equal(candidate.steamUrl, "https://store.steampowered.com/app/6/");
});

test("steam catalog falls back to store search when Web API app list is unavailable", async () => {
  const config = await readJson("data/game/standard-mode.json");
  const catalog = createSteamStandardCatalog({
    config,
    random: () => 0,
    fetchImpl: async (input) => {
      const url = new URL(String(input));
      if (url.href.includes("GetAppList")) {
        return jsonResponse({}, { ok: false, status: 404 });
      }

      if (url.href.includes("search/results")) {
        return jsonResponse({
          items: [
            {
              name: "Fallback Game",
              logo: "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/220/capsule_sm_120.jpg"
            }
          ]
        });
      }

      if (url.href.includes("appdetails")) {
        return jsonResponse({
          220: { success: true, data: validDetailsFor(220, "Fallback Game") }
        });
      }

      return jsonResponse({
        query_summary: {
          total_reviews: 1000
        }
      });
    }
  });

  assert.equal(
    extractAppIdFromStoreSearchItem({
      logo: "https://cdn.example/steam/apps/220/capsule.jpg"
    }),
    220
  );

  const candidate = await catalog.findCandidate();
  assert.equal(candidate.appId, 220);
  assert.equal(candidate.name, "Fallback Game");
});

test("standard runner validates guesses, reveals results, refills queue and persists records", async () => {
  const config = await readJson("data/game/standard-mode.json");
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "gsc-standard-"));
  const storePath = path.join(tempDir, "standard-mode-store.json");

  try {
    const store = createStandardModeStore({ storePath });
    let nextAppId = 1;
    const catalog = {
      async findCandidate({ excludedAppIds, preferredBucketIds }) {
        while (excludedAppIds.has(nextAppId)) {
          nextAppId += 1;
        }
        const appId = nextAppId;
        nextAppId += 1;
        return createCandidate(appId, preferredBucketIds[0] ?? "1000-1999");
      }
    };
    const runner = createStandardModeRunner({ config, catalog, store });
    const session = { steamId: "76561198000000000" };

    const initial = await runner.getState(session);
    assert.equal(initial.health.current, 3);
    assert.equal(initial.score, 0);
    assert.equal(initial.current.game, null);
    assert.equal(initial.queue.ready, 2);
    assert.equal(initial.queue.target, 10);
    assert.equal(session.standardModeRun.queue.length, 2);

    await assert.rejects(
      () => runner.guess(session, { reviewCountGuess: 49 }),
      { code: "invalid_guess" }
    );

    const firstGuess = await runner.guess(session, { reviewCountGuess: 1000 });
    assert.equal(firstGuess.result.damaged, false);
    assert.equal(firstGuess.result.errorPercent, 0);
    assert.equal(firstGuess.result.score, 100);
    assert.equal(firstGuess.score, 100);
    assert.equal(firstGuess.health.current, 3);
    assert.equal(firstGuess.streak, 1);
    assert.equal(firstGuess.runBestStreak, 1);
    assert.equal(firstGuess.result.game.name, "Game 1");
    assert.equal(firstGuess.current.game.reviewCount, 1000);
    assert.equal((await store.getPlayerRecord(session.steamId)).guessedAppIds.includes(1), true);

    await runner.next(session);
    assert.equal(session.standardModeRun.queue.length, 2);

    const safeMissGuess = await runner.guess(session, { reviewCountGuess: 400 });
    assert.equal(safeMissGuess.result.errorPercent, 150);
    assert.equal(safeMissGuess.result.damaged, false);
    assert.equal(safeMissGuess.result.score, 1);
    assert.equal(safeMissGuess.score, 101);
    assert.equal(safeMissGuess.health.current, 3);
    assert.equal(safeMissGuess.streak, 2);
    assert.equal(safeMissGuess.runBestStreak, 2);

    const guessedHistory = await runner.listGuessedGames(session, { page: 1 });
    assert.equal(guessedHistory.pageSize, 100);
    assert.equal(guessedHistory.totalItems, 2);
    assert.deepEqual(guessedHistory.items.map((game) => game.appId), [2, 1]);
    assert.equal(guessedHistory.items[0].name, "Game 2");
    assert.equal(guessedHistory.items[0].coverUrl, "https://cdn.example/2.jpg");
    assert.equal(guessedHistory.items.some((game) => game.appId === 3), false);

    await runner.next(session);

    const firstDamagedGuess = await runner.guess(session, { reviewCountGuess: 100 });
    assert.equal(firstDamagedGuess.result.errorPercent, 900);
    assert.equal(firstDamagedGuess.result.damaged, true);
    assert.equal(firstDamagedGuess.result.score, 0);
    assert.equal(firstDamagedGuess.score, 101);
    await runner.next(session);
    await runner.guess(session, { reviewCountGuess: 100 });
    await runner.next(session);
    const gameOver = await runner.guess(session, { reviewCountGuess: 100 });

    assert.equal(gameOver.status, "game-over");
    assert.equal(gameOver.health.current, 0);
    assert.equal(gameOver.streak, 0);
    assert.equal(gameOver.finalStreak, 2);
    assert.equal(gameOver.score, 101);
    assert.equal(gameOver.recordHighlights.highScore, true);
    assert.equal(gameOver.recordHighlights.bestStreak, true);
    assert.equal(gameOver.lastGame.name, "Game 5");

    const stored = JSON.parse(await readFile(storePath, "utf8"));
    const record = stored.players[session.steamId];
    assert.equal(record.completedRuns, 1);
    assert.equal(record.highScore, 101);
    assert.equal(record.bestStreak, 2);
    assert.deepEqual(record.guessedAppIds.slice(0, 5), [1, 2, 3, 4, 5]);
    assert.deepEqual(record.guessedGames.slice(0, 5).map((game) => game.appId), [1, 2, 3, 4, 5]);
    assert.equal(record.guessedGames[0].name, "Game 1");
    assert.equal(typeof record.guessedGames[0].guessedAt, "string");

    const clearedHistory = await runner.clearHistory(session);
    assert.equal(clearedHistory.totalItems, 0);
    assert.deepEqual(clearedHistory.items, []);

    const clearedRecord = await store.getPlayerRecord(session.steamId);
    assert.equal(clearedRecord.highScore, 0);
    assert.equal(clearedRecord.bestStreak, 0);
    assert.equal(clearedRecord.completedRuns, 0);
    assert.deepEqual(clearedRecord.guessedAppIds, []);
    assert.deepEqual(clearedRecord.guessedGames, []);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("standard runner hydrates legacy guessed app ids for the history page", async () => {
  const config = await readJson("data/game/standard-mode.json");
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "gsc-standard-history-"));
  const storePath = path.join(tempDir, "standard-mode-store.json");

  try {
    const store = createStandardModeStore({ storePath });
    const session = { steamId: "76561198000000002" };
    const hydratedCandidate = createCandidate(42, "1000-1999");
    const catalog = {
      async findCandidate() {
        return createCandidate(100, "1000-1999");
      },
      async loadHistoryGame(appId) {
        assert.equal(appId, 42);
        return hydratedCandidate;
      }
    };
    const runner = createStandardModeRunner({ config, catalog, store });

    await store.updatePlayerRecord(session.steamId, (record) => ({
      ...record,
      guessedAppIds: [42]
    }));

    const history = await runner.listGuessedGames(session, { page: 1 });
    assert.equal(history.totalItems, 1);
    assert.equal(history.items[0].appId, 42);
    assert.equal(history.items[0].name, "Game 42");
    assert.equal(history.items[0].coverUrl, "https://cdn.example/42.jpg");

    const record = await store.getPlayerRecord(session.steamId);
    assert.equal(record.guessedGames[0].name, "Game 42");
    assert.equal(record.guessedGames[0].coverUrl, "https://cdn.example/42.jpg");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("standard runner skips trailers that are too short after trimming", async () => {
  const config = await readJson("data/game/standard-mode.json");
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "gsc-standard-skip-"));
  const storePath = path.join(tempDir, "standard-mode-store.json");

  try {
    const store = createStandardModeStore({ storePath });
    const rejectedAppIds = [];
    let nextAppId = 1;
    const catalog = {
      async findCandidate({ excludedAppIds, preferredBucketIds }) {
        while (excludedAppIds.has(nextAppId)) {
          nextAppId += 1;
        }
        const appId = nextAppId;
        nextAppId += 1;
        const candidate = createCandidate(appId, preferredBucketIds[0] ?? "1000-1999");
        candidate.video.durationSeconds = appId === 1 ? 25 : 45;
        return candidate;
      },
      async rejectCandidate(appId) {
        rejectedAppIds.push(appId);
      }
    };
    const runner = createStandardModeRunner({ config, catalog, store });
    const session = { steamId: "76561198000000001" };

    const state = await runner.skipShortVideo(session, { durationSeconds: 25 });

    assert.equal(state.status, "playing");
    assert.equal(state.guessNumber, 1);
    assert.equal(state.queue.ready, 2);
    assert.equal(state.current.game, null);
    assert.equal(session.standardModeRun.queue[0].appId, 2);
    assert.deepEqual(rejectedAppIds, [1]);
    assert.deepEqual((await store.getPlayerRecord(session.steamId)).guessedAppIds, []);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

function validDetailsFor(appId, name) {
  return {
    steam_appid: appId,
    type: "game",
    required_age: 0,
    name,
    header_image: `https://cdn.example/${appId}.jpg`,
    movies: [
      {
        id: appId,
        name: "Trailer",
        duration: "0:45",
        thumbnail: `https://cdn.example/${appId}-poster.jpg`,
        mp4: { max: `https://cdn.example/${appId}.mp4` }
      }
    ],
    genres: [{ description: "Action" }],
    categories: []
  };
}

function createCandidate(appId, reviewBucketId) {
  return {
    appId,
    name: `Game ${appId}`,
    type: "game",
    coverUrl: `https://cdn.example/${appId}.jpg`,
    steamUrl: `https://store.steampowered.com/app/${appId}/`,
    reviewCount: 1000,
    reviewBucketId,
    video: {
      posterUrl: `https://cdn.example/${appId}-poster.jpg`,
      sources: [
        { kind: "mp4", type: "video/mp4", url: `https://cdn.example/${appId}.mp4` }
      ]
    }
  };
}

function jsonResponse(payload, options = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    json: async () => payload
  };
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}
