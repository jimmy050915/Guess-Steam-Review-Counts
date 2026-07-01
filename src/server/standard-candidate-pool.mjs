import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export function createStandardCandidatePool({
  poolPath,
  schemaVersion = 1,
  maxEntriesPerBucket = 80,
  random = Math.random
}) {
  async function findCandidate(bucketIds, excludedAppIds = new Set()) {
    const store = await readStore();
    const excluded = new Set([...excludedAppIds].map((appId) => Number(appId)));

    for (const bucketId of bucketIds) {
      const candidates = (store.buckets[bucketId] ?? [])
        .filter((candidate) => Number.isInteger(candidate.appId) && !excluded.has(candidate.appId));

      if (candidates.length > 0) {
        return cloneCandidate(candidates[Math.floor(random() * candidates.length)]);
      }
    }

    return null;
  }

  async function findCandidateByAppId(appId) {
    const numericAppId = Number(appId);
    if (!Number.isInteger(numericAppId)) {
      return null;
    }

    const store = await readStore();
    for (const candidates of Object.values(store.buckets)) {
      const candidate = candidates.find((entry) => entry.appId === numericAppId);
      if (candidate) {
        return cloneCandidate(candidate);
      }
    }

    return null;
  }

  async function addCandidate(candidate) {
    if (!isPoolCandidate(candidate)) {
      return;
    }

    const store = await readStore();
    const bucket = store.buckets[candidate.reviewBucketId] ?? [];
    const withoutDuplicate = bucket.filter((entry) => entry.appId !== candidate.appId);
    withoutDuplicate.unshift({
      ...cloneCandidate(candidate),
      cachedAt: new Date().toISOString()
    });
    store.buckets[candidate.reviewBucketId] = withoutDuplicate.slice(0, maxEntriesPerBucket);
    store.updatedAt = new Date().toISOString();
    await writeStore(store);
  }

  async function removeCandidate(appId) {
    const numericAppId = Number(appId);
    if (!Number.isInteger(numericAppId)) {
      return;
    }

    const store = await readStore();
    let changed = false;
    for (const [bucketId, candidates] of Object.entries(store.buckets)) {
      const filtered = candidates.filter((candidate) => candidate.appId !== numericAppId);
      if (filtered.length !== candidates.length) {
        store.buckets[bucketId] = filtered;
        changed = true;
      }
    }

    if (changed) {
      store.updatedAt = new Date().toISOString();
      await writeStore(store);
    }
  }

  async function readStore() {
    try {
      return normalizeStore(JSON.parse(await readFile(poolPath, "utf8")));
    } catch (error) {
      if (error?.code === "ENOENT") {
        return createEmptyStore();
      }
      throw error;
    }
  }

  async function writeStore(store) {
    await mkdir(path.dirname(poolPath), { recursive: true });
    await writeFile(poolPath, `${JSON.stringify(normalizeStore(store), null, 2)}\n`, "utf8");
  }

  function normalizeStore(store) {
    if (!store || typeof store !== "object" || store.schemaVersion !== schemaVersion) {
      return createEmptyStore();
    }

    const buckets = {};
    for (const [bucketId, entries] of Object.entries(store.buckets ?? {})) {
      if (!Array.isArray(entries)) {
        continue;
      }

      buckets[bucketId] = entries
        .filter(isPoolCandidate)
        .slice(0, maxEntriesPerBucket)
        .map(cloneCandidate);
    }

    return {
      schemaVersion,
      updatedAt: typeof store.updatedAt === "string" ? store.updatedAt : null,
      buckets
    };
  }

  function createEmptyStore() {
    return {
      schemaVersion,
      updatedAt: null,
      buckets: {}
    };
  }

  return {
    addCandidate,
    findCandidateByAppId,
    findCandidate,
    removeCandidate,
    readStore
  };
}

function isPoolCandidate(candidate) {
  return Boolean(
    candidate
      && Number.isInteger(candidate.appId)
      && typeof candidate.name === "string"
      && typeof candidate.steamUrl === "string"
      && Number.isInteger(candidate.reviewCount)
      && typeof candidate.reviewBucketId === "string"
      && candidate.video
  );
}

function cloneCandidate(candidate) {
  return JSON.parse(JSON.stringify(candidate));
}
