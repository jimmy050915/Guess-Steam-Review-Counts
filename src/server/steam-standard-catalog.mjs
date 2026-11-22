import {
  getReviewBucketId,
  isVideoPlayableAfterTrim
} from "../shared/standard-mode-contract.mjs";

const STEAM_APP_LIST_URL = "https://api.steampowered.com/ISteamApps/GetAppList/v2/";
const STEAM_APP_DETAILS_URL = "https://store.steampowered.com/api/appdetails";
const STEAM_APP_REVIEWS_URL = "https://api.steampowered.com/IUserReviewsService/GetAppReviews/v1/";
const STEAM_STORE_SEARCH_URL = "https://store.steampowered.com/search/results/";

export class SteamCandidateError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "SteamCandidateError";
    this.code = code;
  }
}

export function createSteamStandardCatalog({
  config,
  fetchImpl = fetch,
  candidatePool = null,
  random = Math.random
}) {
  let appListCache = null;
  let usesStoreSearchFallback = false;
  const loadedStoreSearchStarts = new Set();
  const rejectedAppIds = new Set();

  async function findCandidate({ excludedAppIds = new Set(), preferredBucketIds = [] } = {}) {
    const preferredBuckets = normalizePreferredBuckets(preferredBucketIds, config.selection.reviewBuckets);
    const pooledCandidate = await findPooledCandidate(preferredBuckets, excludedAppIds);
    if (pooledCandidate) {
      return pooledCandidate;
    }

    let appList = await loadAppList();
    if (appList.length === 0) {
      throw new SteamCandidateError("candidate_unavailable");
    }

    const maxAttempts = config.selection?.maxCandidateAttempts ?? 180;
    const maxBatches = usesStoreSearchFallback && preferredBuckets.length > 0 ? 3 : 1;
    const attemptedAppIds = new Set();
    let fallbackCandidate = null;

    for (let batchIndex = 0; batchIndex < maxBatches; batchIndex += 1) {
      const scanResult = await scanAppListForCandidate({
        appList,
        excludedAppIds,
        preferredBuckets,
        attemptedAppIds,
        maxAttempts
      });

      if (scanResult.candidate) {
        return scanResult.candidate;
      }

      fallbackCandidate ??= scanResult.fallbackCandidate;

      const nextPooledCandidate = await findPooledCandidate(preferredBuckets, excludedAppIds);
      if (nextPooledCandidate) {
        return nextPooledCandidate;
      }

      if (!usesStoreSearchFallback || preferredBuckets.length === 0 || batchIndex === maxBatches - 1) {
        break;
      }

      const previousLength = appList.length;
      appList = await appendStoreSearchAppList();
      if (appList.length === previousLength) {
        break;
      }
    }

    if (fallbackCandidate) {
      return fallbackCandidate;
    }

    throw new SteamCandidateError("candidate_unavailable");
  }

  async function scanAppListForCandidate({
    appList,
    excludedAppIds,
    preferredBuckets,
    attemptedAppIds,
    maxAttempts
  }) {
    const preferredBucketSet = new Set(preferredBuckets);
    const startIndex = Math.floor(random() * appList.length);
    let fallbackCandidate = null;

    for (let attempt = 0; attempt < Math.min(maxAttempts, appList.length); attempt += 1) {
      const app = appList[(startIndex + attempt) % appList.length];
      const appId = Number.parseInt(app.appid, 10);
      if (!Number.isInteger(appId)
        || excludedAppIds.has(appId)
        || rejectedAppIds.has(appId)
        || attemptedAppIds.has(appId)) {
        continue;
      }

      attemptedAppIds.add(appId);
      const candidate = await tryLoadCandidate(appId);
      if (!candidate) {
        continue;
      }

      await cacheCandidate(candidate);

      if (preferredBuckets.length === 0 || preferredBucketSet.has(candidate.reviewBucketId)) {
        return { candidate, fallbackCandidate };
      }

      fallbackCandidate ??= candidate;
    }

    return { candidate: null, fallbackCandidate };
  }

  async function tryLoadCandidate(appId) {
    let candidate = null;
    try {
      candidate = await loadCandidate(appId);
    } catch (error) {
      if (!(error instanceof SteamCandidateError)) {
        throw error;
      }
      // An upstream failure is not a permanent qualification result.
      return null;
    }

    if (!candidate) {
      rejectedAppIds.add(appId);
      return null;
    }

    return candidate;
  }

  async function findPooledCandidate(preferredBucketIds, excludedAppIds) {
    if (!candidatePool || preferredBucketIds.length === 0) {
      return null;
    }

    const candidate = await candidatePool.findCandidate(preferredBucketIds, excludedAppIds);
    if (!candidate) {
      return null;
    }

    if (!isVideoPlayableAfterTrim(candidate.video?.durationSeconds, config.video)) {
      await candidatePool.removeCandidate(candidate.appId);
      rejectedAppIds.add(candidate.appId);
      return null;
    }

    return candidate;
  }

  async function findPooledCandidateByAppId(appId) {
    if (typeof candidatePool?.findCandidateByAppId !== "function") {
      return null;
    }

    const candidate = await candidatePool.findCandidateByAppId(appId);
    if (!candidate) {
      return null;
    }

    if (!isVideoPlayableAfterTrim(candidate.video?.durationSeconds, config.video)) {
      await candidatePool.removeCandidate(candidate.appId);
      rejectedAppIds.add(candidate.appId);
      return null;
    }

    return candidate;
  }

  async function loadHistoryGame(appId) {
    const pooledCandidate = await findPooledCandidateByAppId(appId);
    if (pooledCandidate) {
      return pooledCandidate;
    }

    return loadCandidate(appId);
  }

  async function cacheCandidate(candidate) {
    if (candidatePool) {
      await candidatePool.addCandidate(candidate);
    }
  }

  async function loadAppList() {
    if (appListCache) {
      return appListCache;
    }

    try {
      const response = await fetchImpl(STEAM_APP_LIST_URL);
      if (!response.ok) {
        throw new SteamCandidateError("steam_request_failed");
      }

      const payload = await response.json();
      appListCache = Array.isArray(payload?.applist?.apps) ? payload.applist.apps : [];
    } catch {
      usesStoreSearchFallback = true;
      appListCache = [];
      appListCache = await appendStoreSearchAppList();
    }

    return appListCache;
  }

  async function appendStoreSearchAppList() {
    const apps = appListCache ?? [];
    const seenAppIds = new Set(apps.map((app) => Number(app.appid)));
    const pageCount = config.selection?.storeSearchPageCount ?? 4;
    const pageSize = config.selection?.storeSearchPageSize ?? 50;
    const pageStarts = selectStoreSearchPageStarts({ pageCount, pageSize });

    for (const start of pageStarts) {
      loadedStoreSearchStarts.add(start);
      const url = new URL(STEAM_STORE_SEARCH_URL);
      url.searchParams.set("query", "");
      url.searchParams.set("start", String(start));
      url.searchParams.set("count", String(pageSize));
      url.searchParams.set("dynamic_data", "");
      url.searchParams.set("force_infinite", "1");
      url.searchParams.set("category1", "998");
      url.searchParams.set("json", "1");

      let response = null;
      try {
        response = await fetchImpl(url);
      } catch {
        continue;
      }

      if (!response.ok) {
        continue;
      }

      const payload = await response.json();
      for (const item of payload?.items ?? []) {
        const appId = extractAppIdFromStoreSearchItem(item);
        if (!Number.isInteger(appId) || seenAppIds.has(appId)) {
          continue;
        }
        seenAppIds.add(appId);
        apps.push({
          appid: appId,
          name: typeof item.name === "string" ? item.name : String(appId)
        });
      }
    }

    if (apps.length === 0) {
      throw new SteamCandidateError("steam_request_failed");
    }

    return apps;
  }

  function selectStoreSearchPageStarts({ pageCount, pageSize }) {
    const starts = [];
    const maxStart = config.selection?.storeSearchMaxStart ?? (pageCount - 1) * pageSize;
    const pageSlots = Math.max(1, Math.floor(maxStart / pageSize) + 1);

    if (!loadedStoreSearchStarts.has(0)) {
      starts.push(0);
    }

    for (let attempt = 0; starts.length < pageCount && attempt < pageCount * 20; attempt += 1) {
      const start = Math.floor(random() * pageSlots) * pageSize;
      if (!loadedStoreSearchStarts.has(start) && !starts.includes(start)) {
        starts.push(start);
      }
    }

    for (let slot = 0; starts.length < pageCount && slot < pageSlots; slot += 1) {
      const start = slot * pageSize;
      if (!loadedStoreSearchStarts.has(start) && !starts.includes(start)) {
        starts.push(start);
      }
    }

    return starts;
  }

  async function loadCandidate(appId) {
    const details = await loadAppDetails(appId);
    if (!details || !passesDetailsFilters(details, config)) {
      return null;
    }

    const video = selectTrailerVideo(details.movies);
    if (config.rules.requiresVideo && !video) {
      return null;
    }

    if (video && !isVideoPlayableAfterTrim(video.durationSeconds, config.video)) {
      return null;
    }

    const reviewCount = await loadReviewCount(appId);
    if (!Number.isInteger(reviewCount) || reviewCount < config.rules.minReviewCount) {
      return null;
    }

    const reviewBucketId = getReviewBucketId(reviewCount, config.selection.reviewBuckets);
    if (!reviewBucketId) {
      return null;
    }

    return {
      appId,
      name: details.name,
      type: details.type,
      coverUrl: details.header_image ?? null,
      steamUrl: `https://store.steampowered.com/app/${appId}/`,
      reviewCount,
      reviewBucketId,
      video
    };
  }

  async function loadAppDetails(appId) {
    const url = new URL(STEAM_APP_DETAILS_URL);
    url.searchParams.set("appids", String(appId));
    url.searchParams.set("filters", "basic,genres,categories,movies,content_descriptors");

    let response = null;
    try {
      response = await fetchImpl(url);
    } catch {
      throw new SteamCandidateError("steam_request_failed");
    }
    if (!response.ok) {
      throw new SteamCandidateError("steam_request_failed");
    }

    const payload = await response.json();
    const result = payload?.[appId];
    return result?.success === true ? result.data : null;
  }

  async function loadReviewCount(appId) {
    const url = new URL(STEAM_APP_REVIEWS_URL);
    url.searchParams.set("input_json", JSON.stringify({
      appid: appId,
      languages: ["all"],
      purchase_type: 1, // All purchase types.
      review_type: 0, // All review types; required for the first-page total.
      day_range: 0, // No date limit.
      num_per_page: 1
    }));

    try {
      const response = await fetchImpl(url);
      if (!response.ok) {
        throw new SteamCandidateError("steam_request_failed");
      }
      const payload = await response.json();
      const count = payload?.response?.query_summary?.total_reviews;
      if (!Number.isSafeInteger(count) || count < 0) {
        throw new SteamCandidateError("steam_request_failed");
      }
      return count;
    } catch {
      throw new SteamCandidateError("steam_request_failed");
    }
  }

  return {
    findCandidate,
    rejectCandidate,
    loadHistoryGame,
    loadCandidate,
    loadAppList
  };

  async function rejectCandidate(appId) {
    const numericAppId = Number(appId);
    if (!Number.isInteger(numericAppId)) {
      return;
    }

    rejectedAppIds.add(numericAppId);
    if (candidatePool) {
      await candidatePool.removeCandidate(numericAppId);
    }
  }
}

function normalizePreferredBuckets(preferredBucketIds, buckets) {
  const bucketIds = new Set((buckets ?? []).map((bucket) => bucket.id));
  return preferredBucketIds.filter((bucketId) => bucketIds.has(bucketId));
}

export function extractAppIdFromStoreSearchItem(item) {
  const logo = typeof item?.logo === "string" ? item.logo : "";
  const match = logo.match(/\/apps\/(\d+)\//);
  return match ? Number.parseInt(match[1], 10) : null;
}

export function passesDetailsFilters(details, config) {
  if (!details || typeof details !== "object") {
    return false;
  }

  const gameOnly = config.filters.find((filter) => filter.id === "game-only");
  if (gameOnly && !gameOnly.allowedTypes.includes(details.type)) {
    return false;
  }

  const sfwFilter = config.filters.find((filter) => filter.id === "sfw-standard");
  if (sfwFilter) {
    const requiredAge = Number.parseInt(details.required_age ?? 0, 10) || 0;
    if (requiredAge > sfwFilter.requiredAgeMax) {
      return false;
    }

    const searchableText = JSON.stringify([
      details.name,
      details.genres,
      details.categories,
      details.content_descriptors
    ]).toLowerCase();

    for (const textMatch of sfwFilter.excludedTextMatches ?? []) {
      if (searchableText.includes(String(textMatch).toLowerCase())) {
        return false;
      }
    }
  }

  return true;
}

export function selectTrailerVideo(movies) {
  if (!Array.isArray(movies)) {
    return null;
  }

  for (const movie of movies) {
    const sources = [];
    if (typeof movie?.mp4?.max === "string") {
      sources.push({ kind: "mp4", type: "video/mp4", url: movie.mp4.max });
    }
    if (typeof movie?.webm?.max === "string") {
      sources.push({ kind: "webm", type: "video/webm", url: movie.webm.max });
    }
    if (typeof movie?.hls_h264 === "string") {
      sources.push({ kind: "hls", type: "application/vnd.apple.mpegurl", url: movie.hls_h264 });
    }

    if (sources.length > 0) {
      return {
        id: String(movie.id ?? ""),
        name: typeof movie.name === "string" ? movie.name : "",
        posterUrl: typeof movie.thumbnail === "string" ? movie.thumbnail : null,
        durationSeconds: normalizeDurationSeconds(movie.duration_seconds ?? movie.duration ?? movie.length),
        sources
      };
    }
  }

  return null;
}

export function normalizeDurationSeconds(value) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const parsed = Number.parseFloat(trimmed);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  const parts = trimmed.split(":").map((part) => Number.parseFloat(part));
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }

  return parts.reduce((total, part) => total * 60 + part, 0);
}
