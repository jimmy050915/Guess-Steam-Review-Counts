export function validateStandardModeConfig(config) {
  const errors = [];

  if (!config || typeof config !== "object") {
    return ["standard mode config must be an object"];
  }

  if (config.schemaVersion !== 1) {
    errors.push("standard mode config schemaVersion must be 1");
  }

  if (config.modeId !== "standard-mode") {
    errors.push("standard mode modeId must be standard-mode");
  }

  const rules = config.rules ?? {};
  if (rules.queueSize !== 10) {
    errors.push("standard mode queueSize must be 10");
  }

  if (rules.readyQueueSize !== 2) {
    errors.push("standard mode readyQueueSize must be 2");
  }

  if (rules.readyQueueSize > rules.queueSize) {
    errors.push("standard mode readyQueueSize must not exceed queueSize");
  }

  if (rules.initialHealth !== 3) {
    errors.push("standard mode initialHealth must be 3");
  }

  if (rules.scoreBase !== 0) {
    errors.push("standard mode scoreBase must be 0");
  }

  if (rules.minReviewCount !== 50) {
    errors.push("standard mode minReviewCount must be 50");
  }

  if (rules.damageErrorPercent !== 200) {
    errors.push("standard mode damageErrorPercent must be 200");
  }

  if (rules.requiresVideo !== true) {
    errors.push("standard mode must require video candidates");
  }

  const scoring = config.scoring ?? {};
  if (scoring.id !== "standard-error-percent-v1") {
    errors.push("standard mode scoring id must be standard-error-percent-v1");
  }

  const scoreBands = scoring.scoreBands;
  if (!Array.isArray(scoreBands) || scoreBands.length === 0) {
    errors.push("standard mode scoring must declare score bands");
  } else {
    let previousMaxErrorPercent = -Infinity;
    let previousPoints = Infinity;
    for (const band of scoreBands) {
      if (
        !band.id ||
        !Number.isFinite(band.maxErrorPercent) ||
        band.maxErrorPercent <= 0 ||
        !Number.isInteger(band.points) ||
        band.points < 0
      ) {
        errors.push("standard mode score bands must declare id, positive maxErrorPercent and non-negative integer points");
        continue;
      }

      if (band.maxErrorPercent <= previousMaxErrorPercent) {
        errors.push("standard mode score bands must be sorted by ascending maxErrorPercent");
      }

      if (band.points > previousPoints) {
        errors.push("standard mode score bands must not award more points for wider error ranges");
      }

      previousMaxErrorPercent = band.maxErrorPercent;
      previousPoints = band.points;
    }

    if (scoreBands.at(-1)?.maxErrorPercent !== rules.damageErrorPercent) {
      errors.push("standard mode final score band must end at damageErrorPercent");
    }
  }

  const buckets = config.selection?.reviewBuckets;
  if (!Array.isArray(buckets) || buckets.length === 0) {
    errors.push("standard mode must declare review buckets");
  } else {
    for (const bucket of buckets) {
      if (!bucket.id || !Number.isInteger(bucket.min) || !(Number.isInteger(bucket.max) || bucket.max === null)) {
        errors.push("standard mode review buckets must declare id, min and max");
      }
    }
  }

  if (config.selection?.storeSearchPageCount !== 4) {
    errors.push("standard mode storeSearchPageCount must be 4");
  }

  if (config.selection?.storeSearchPageSize !== 50) {
    errors.push("standard mode storeSearchPageSize must be 50");
  }

  if (!Number.isInteger(config.selection?.storeSearchMaxStart) || config.selection.storeSearchMaxStart < config.selection.storeSearchPageSize) {
    errors.push("standard mode storeSearchMaxStart must be an integer at least one page");
  }

  if (config.candidatePool?.path !== ".cache/standard-candidate-pool.json") {
    errors.push("standard mode candidate pool path must be .cache/standard-candidate-pool.json");
  }

  if (config.candidatePool?.schemaVersion !== 1) {
    errors.push("standard mode candidate pool schemaVersion must be 1");
  }

  if (!Number.isInteger(config.candidatePool?.maxEntriesPerBucket) || config.candidatePool.maxEntriesPerBucket < 10) {
    errors.push("standard mode candidate pool maxEntriesPerBucket must be at least 10");
  }

  if (config.history?.guessedGamesPageSize !== 100) {
    errors.push("standard mode guessed games page size must be 100");
  }

  if (config.video?.trimStartSeconds !== 10 || config.video?.trimEndSeconds !== 10) {
    errors.push("standard mode video trim must remove 10 seconds from both ends");
  }

  if (config.video?.minimumPlayableSecondsAfterTrim !== 10) {
    errors.push("standard mode video minimum playable seconds after trim must be 10");
  }

  const filters = config.filters ?? [];
  if (!filters.some((filter) => filter.id === "game-only" && filter.type === "app-type")) {
    errors.push("standard mode must declare game-only filter");
  }

  const sfwFilter = filters.find((filter) => filter.id === "sfw-standard");
  if (sfwFilter?.requiredAgeMax !== 0 || !sfwFilter.excludedTextMatches?.includes("adult only")) {
    errors.push("standard mode SFW filter must exclude age-gated and Adult Only games");
  }

  if (!filters.some((filter) => filter.id === "minimum-review-count" && filter.value === rules.minReviewCount)) {
    errors.push("standard mode must declare minimum-review-count filter");
  }

  if (config.store?.path !== ".cache/standard-mode-store.json") {
    errors.push("standard mode store path must be .cache/standard-mode-store.json");
  }

  return errors;
}

export function getReviewBucketId(reviewCount, buckets) {
  if (!Number.isFinite(reviewCount)) {
    return null;
  }

  return buckets.find((bucket) => {
    const isAboveMin = reviewCount >= bucket.min;
    const isBelowMax = bucket.max === null || reviewCount <= bucket.max;
    return isAboveMin && isBelowMax;
  })?.id ?? null;
}

export function calculateGuessErrorPercent({ guess, actual }) {
  if (!Number.isFinite(guess) || !Number.isFinite(actual) || guess <= 0 || actual <= 0) {
    return null;
  }

  return Number(((Math.max(guess / actual, actual / guess) - 1) * 100).toFixed(1));
}

export function isDamageGuess({ guess, actual, damageErrorPercent }) {
  const errorPercent = calculateGuessErrorPercent({ guess, actual });
  if (errorPercent === null || !Number.isFinite(damageErrorPercent)) {
    return false;
  }

  return errorPercent > damageErrorPercent;
}

export function calculateGuessScore({ errorPercent, scoreBands }) {
  if (!Number.isFinite(errorPercent) || !Array.isArray(scoreBands)) {
    return 0;
  }

  const scoreBand = scoreBands.find((band) => (
    Number.isFinite(band.maxErrorPercent) &&
    errorPercent <= band.maxErrorPercent
  ));
  if (!scoreBand) {
    return 0;
  }

  return Math.max(0, Number.parseInt(scoreBand.points, 10) || 0);
}

export function getTrimmedVideoDurationSeconds(durationSeconds, videoConfig) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return null;
  }

  const trimStart = Number.isFinite(videoConfig?.trimStartSeconds)
    ? videoConfig.trimStartSeconds
    : 0;
  const trimEnd = Number.isFinite(videoConfig?.trimEndSeconds)
    ? videoConfig.trimEndSeconds
    : 0;

  return Math.max(0, durationSeconds - trimStart - trimEnd);
}

export function isVideoPlayableAfterTrim(durationSeconds, videoConfig) {
  const playableSeconds = getTrimmedVideoDurationSeconds(durationSeconds, videoConfig);
  if (playableSeconds === null) {
    return true;
  }

  const minimumPlayableSeconds = Number.isFinite(videoConfig?.minimumPlayableSecondsAfterTrim)
    ? videoConfig.minimumPlayableSecondsAfterTrim
    : 0;
  return playableSeconds >= minimumPlayableSeconds;
}

export function normalizeIntegerGuess(value) {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return Number.parseInt(value.trim(), 10);
  }

  return null;
}
