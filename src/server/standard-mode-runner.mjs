import {
  calculateGuessErrorPercent,
  calculateGuessScore,
  isDamageGuess,
  isVideoPlayableAfterTrim,
  normalizeIntegerGuess
} from "../shared/standard-mode-contract.mjs";
import { SteamCandidateError } from "./steam-standard-catalog.mjs";

export class StandardModeError extends Error {
  constructor(code, status = 400, message = code) {
    super(message);
    this.name = "StandardModeError";
    this.code = code;
    this.status = status;
  }
}

export function createStandardModeRunner({ config, catalog, store, random = Math.random }) {
  async function getState(session) {
    assertSession(session);
    const run = await ensureRun(session);
    await fillQueue(session, run, config.rules.readyQueueSize);
    return presentRun(session, run, { config, store });
  }

  async function guess(session, payload) {
    assertSession(session);
    const run = await ensureRun(session);
    await fillQueue(session, run, 1);

    if (run.status === "game-over") {
      return presentRun(session, run, { config, store });
    }

    if (run.revealed) {
      return presentRun(session, run, { config, store });
    }

    const guessValue = normalizeIntegerGuess(payload?.reviewCountGuess);
    if (!Number.isInteger(guessValue) || guessValue < config.rules.minReviewCount) {
      throw new StandardModeError("invalid_guess", 400);
    }

    const currentGame = run.queue[0];
    const damaged = isDamageGuess({
      guess: guessValue,
      actual: currentGame.reviewCount,
      damageErrorPercent: config.rules.damageErrorPercent
    });
    const errorPercent = calculateGuessErrorPercent({
      guess: guessValue,
      actual: currentGame.reviewCount
    });
    const roundScore = calculateGuessScore({
      errorPercent,
      scoreBands: config.scoring.scoreBands
    });
    run.score += roundScore;

    if (damaged) {
      run.health = Math.max(0, run.health - 1);
      run.streak = 0;
    } else {
      run.streak += 1;
      run.bestRunStreak = Math.max(run.bestRunStreak, run.streak);
    }

    run.revealed = {
      game: currentGame,
      guess: guessValue,
      damaged,
      errorPercent,
      score: roundScore
    };
    run.lastGame = currentGame;

    await addGuessedAppId(store, session.steamId, currentGame.appId);

    if (run.health <= 0) {
      run.status = "game-over";
      run.recordHighlights = await completeRun(store, session.steamId, run);
    }

    return presentRun(session, run, { config, store });
  }

  async function next(session) {
    assertSession(session);
    const run = await ensureRun(session);

    if (run.status === "game-over") {
      return presentRun(session, run, { config, store });
    }

    if (!run.revealed) {
      throw new StandardModeError("guess_required", 409);
    }

    run.queue.shift();
    run.revealed = null;
    run.guessNumber += 1;
    await fillQueue(session, run, config.rules.readyQueueSize);

    return presentRun(session, run, { config, store });
  }

  async function skipShortVideo(session, payload) {
    assertSession(session);
    const run = await ensureRun(session);
    await fillQueue(session, run, 1);

    if (run.status === "game-over") {
      return presentRun(session, run, { config, store });
    }

    if (run.revealed) {
      throw new StandardModeError("skip_not_allowed", 409);
    }

    const currentGame = run.queue[0];
    const serverDuration = currentGame?.video?.durationSeconds;
    const clientDuration = Number.parseFloat(payload?.durationSeconds);
    const durationSeconds = Number.isFinite(serverDuration) ? serverDuration : clientDuration;

    if (isVideoPlayableAfterTrim(durationSeconds, config.video)) {
      throw new StandardModeError("skip_not_allowed", 409);
    }

    if (typeof catalog.rejectCandidate === "function") {
      await catalog.rejectCandidate(currentGame.appId);
    }
    run.skippedAppIds.push(currentGame.appId);
    run.queue.shift();
    run.revealed = null;

    await fillQueue(session, run, config.rules.readyQueueSize);
    return presentRun(session, run, { config, store });
  }

  async function restart(session) {
    assertSession(session);
    session.standardModeRun = createRun(config);
    await fillQueue(session, session.standardModeRun, config.rules.readyQueueSize);
    return presentRun(session, session.standardModeRun, { config, store });
  }

  async function ensureRun(session) {
    if (!session.standardModeRun) {
      session.standardModeRun = createRun(config);
    }

    return session.standardModeRun;
  }

  async function fillQueue(session, run, targetSize = config.rules.queueSize) {
    if (run.status === "game-over") {
      return;
    }

    const playerRecord = await store.getPlayerRecord(session.steamId);
    const excludedAppIds = new Set(playerRecord.guessedAppIds);
    for (const appId of run.skippedAppIds) {
      excludedAppIds.add(appId);
    }
    for (const game of run.queue) {
      excludedAppIds.add(game.appId);
    }

    while (run.queue.length < targetSize) {
      const targetBucketId = selectLeastCoveredBucketId(run.queue, config.selection.reviewBuckets, random);
      const preferredBucketIds = targetBucketId ? [targetBucketId] : [];
      try {
        const candidate = await catalog.findCandidate({ excludedAppIds, preferredBucketIds });
        run.queue.push(candidate);
        excludedAppIds.add(candidate.appId);
      } catch (error) {
        if (error instanceof SteamCandidateError) {
          throw new StandardModeError(error.code, 503);
        }
        throw error;
      }
    }
  }

  return {
    getState,
    guess,
    next,
    skipShortVideo,
    restart
  };
}

export function createRun(config) {
  return {
    status: "playing",
    health: config.rules.initialHealth,
    score: config.rules.scoreBase,
    streak: 0,
    bestRunStreak: 0,
    guessNumber: 1,
    queue: [],
    skippedAppIds: [],
    revealed: null,
    lastGame: null,
    recordHighlights: {
      highScore: false,
      bestStreak: false
    }
  };
}

export function findLeastCoveredBucketIds(queue, buckets) {
  const counts = new Map(buckets.map((bucket) => [bucket.id, 0]));
  for (const game of queue) {
    counts.set(game.reviewBucketId, (counts.get(game.reviewBucketId) ?? 0) + 1);
  }

  const lowestCount = Math.min(...counts.values());
  return buckets
    .filter((bucket) => counts.get(bucket.id) === lowestCount)
    .map((bucket) => bucket.id);
}

export function selectLeastCoveredBucketId(queue, buckets, random = Math.random) {
  const bucketIds = findLeastCoveredBucketIds(queue, buckets);
  if (bucketIds.length === 0) {
    return null;
  }

  return bucketIds[Math.floor(random() * bucketIds.length)];
}

async function addGuessedAppId(store, steamId, appId) {
  await store.updatePlayerRecord(steamId, (record) => ({
    ...record,
    guessedAppIds: [...record.guessedAppIds, appId]
  }));
}

async function completeRun(store, steamId, run) {
  let highlights = {
    highScore: false,
    bestStreak: false
  };

  await store.updatePlayerRecord(steamId, (record) => {
    highlights = {
      highScore: record.completedRuns === 0 || run.score > record.highScore,
      bestStreak: record.completedRuns === 0 || run.bestRunStreak > record.bestStreak
    };

    return {
      ...record,
      highScore: highlights.highScore ? run.score : record.highScore,
      bestStreak: highlights.bestStreak ? run.bestRunStreak : record.bestStreak,
      completedRuns: record.completedRuns + 1
    };
  });

  return highlights;
}

async function presentRun(session, run, { config, store }) {
  const record = await store.getPlayerRecord(session.steamId);
  const currentGame = run.queue[0] ?? run.lastGame;
  const revealed = Boolean(run.revealed);

  return {
    status: run.status,
    health: {
      current: run.health,
      max: config.rules.initialHealth,
      hearts: "❤️".repeat(run.health)
    },
    score: run.score,
    streak: run.streak,
    runBestStreak: run.bestRunStreak,
    finalStreak: run.status === "game-over" ? run.bestRunStreak : run.streak,
    guessNumber: run.guessNumber,
    queue: {
      ready: run.queue.length,
      target: config.rules.queueSize
    },
    minReviewCount: config.rules.minReviewCount,
    damageErrorPercent: config.rules.damageErrorPercent,
    videoPlayback: {
      trimStartSeconds: config.video?.trimStartSeconds ?? 0,
      trimEndSeconds: config.video?.trimEndSeconds ?? 0,
      minimumPlayableSecondsAfterTrim: config.video?.minimumPlayableSecondsAfterTrim ?? 0
    },
    current: currentGame
      ? {
          video: currentGame.video,
          revealed,
          game: revealed ? presentGame(currentGame) : null
        }
      : null,
    result: run.revealed
      ? {
          guess: run.revealed.guess,
          damaged: run.revealed.damaged,
          errorPercent: run.revealed.errorPercent,
          score: run.revealed.score,
          game: presentGame(run.revealed.game)
        }
      : null,
    lastGame: run.lastGame ? presentGame(run.lastGame) : null,
    records: {
      highScore: record.highScore,
      bestStreak: record.bestStreak
    },
    recordHighlights: run.recordHighlights
  };
}

function presentGame(game) {
  return {
    appId: game.appId,
    name: game.name,
    coverUrl: game.coverUrl,
    steamUrl: game.steamUrl,
    reviewCount: game.reviewCount
  };
}

function assertSession(session) {
  if (!session?.steamId) {
    throw new StandardModeError("auth_required", 401);
  }
}
