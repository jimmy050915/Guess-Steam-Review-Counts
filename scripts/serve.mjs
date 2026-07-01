import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildSteamLoginUrl,
  loadSteamProfile,
  verifySteamOpenIdCallback
} from "../src/server/steam-openid.mjs";
import {
  createHttpFetch,
  resolveProxyUrl
} from "../src/server/http-client.mjs";
import { createStandardCandidatePool } from "../src/server/standard-candidate-pool.mjs";
import { createStandardModeRunner, StandardModeError } from "../src/server/standard-mode-runner.mjs";
import { createStandardModeStore } from "../src/server/standard-mode-store.mjs";
import { createSteamStandardCatalog } from "../src/server/steam-standard-catalog.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standardModeConfig = await readJsonFile(path.join(root, "data/game/standard-mode.json"));
const preferredPort = Number.parseInt(process.env.PORT ?? "5173", 10);
const host = "127.0.0.1";
const maxPortAttempts = 20;
const sessionCookieName = "gsc_session";
const loginStateCookieName = "gsc_openid_state";
const sessions = new Map();
const steamProxyUrl = resolveProxyUrl();
const steamFetch = createHttpFetch({
  proxyUrl: steamProxyUrl
});
const standardModeStore = createStandardModeStore({
  storePath: path.join(root, standardModeConfig.store.path)
});
const standardCandidatePool = createStandardCandidatePool({
  poolPath: path.join(root, standardModeConfig.candidatePool.path),
  schemaVersion: standardModeConfig.candidatePool.schemaVersion,
  maxEntriesPerBucket: standardModeConfig.candidatePool.maxEntriesPerBucket
});
const standardModeCatalog = createSteamStandardCatalog({
  config: standardModeConfig,
  fetchImpl: steamFetch,
  candidatePool: standardCandidatePool
});
const standardModeRunner = createStandardModeRunner({
  config: standardModeConfig,
  catalog: standardModeCatalog,
  store: standardModeStore
});

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"]
]);

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url ?? "/", requestOrigin(request));

    if (requestUrl.pathname === "/auth/steam") {
      handleSteamLogin(request, response, requestUrl);
      return;
    }

    if (requestUrl.pathname === "/auth/steam/callback") {
      await handleSteamCallback(request, response, requestUrl);
      return;
    }

    if (requestUrl.pathname === "/auth/logout") {
      handleLogout(request, response);
      return;
    }

    if (requestUrl.pathname === "/api/session") {
      await handleSession(request, response);
      return;
    }

    if (requestUrl.pathname === "/api/standard/state") {
      await handleStandardApi(request, response, "state", requestUrl);
      return;
    }

    if (requestUrl.pathname === "/api/standard/guess") {
      await handleStandardApi(request, response, "guess", requestUrl);
      return;
    }

    if (requestUrl.pathname === "/api/standard/next") {
      await handleStandardApi(request, response, "next", requestUrl);
      return;
    }

    if (requestUrl.pathname === "/api/standard/skip-short-video") {
      await handleStandardApi(request, response, "skip-short-video", requestUrl);
      return;
    }

    if (requestUrl.pathname === "/api/standard/restart") {
      await handleStandardApi(request, response, "restart", requestUrl);
      return;
    }

    if (requestUrl.pathname === "/api/standard/guessed-games") {
      await handleStandardApi(request, response, "guessed-games", requestUrl);
      return;
    }

    if (requestUrl.pathname === "/api/standard/guessed-games/clear") {
      await handleStandardApi(request, response, "clear-history", requestUrl);
      return;
    }

    await serveStatic(requestUrl, response);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    response.writeHead(500);
    response.end("Internal server error");
  }
});

listenOn(preferredPort, 0);

function handleSteamLogin(_request, response, requestUrl) {
  const state = randomToken();
  const returnToUrl = new URL("/auth/steam/callback", requestUrl.origin);
  returnToUrl.searchParams.set("state", state);

  const loginUrl = buildSteamLoginUrl({
    returnToUrl: returnToUrl.href,
    realmUrl: `${requestUrl.origin}/`
  });

  redirect(response, loginUrl.href, [
    serializeCookie(loginStateCookieName, state, {
      httpOnly: true,
      maxAge: 600,
      sameSite: "Lax"
    })
  ]);
}

async function handleStandardApi(request, response, action, requestUrl) {
  const session = getRequestSession(request);

  try {
    if (action === "state") {
      assertMethod(request, "GET");
      json(response, await standardModeRunner.getState(session));
      return;
    }

    if (action === "guess") {
      assertMethod(request, "POST");
      json(response, await standardModeRunner.guess(session, await readJsonBody(request)));
      return;
    }

    if (action === "next") {
      assertMethod(request, "POST");
      json(response, await standardModeRunner.next(session));
      return;
    }

    if (action === "skip-short-video") {
      assertMethod(request, "POST");
      json(response, await standardModeRunner.skipShortVideo(session, await readJsonBody(request)));
      return;
    }

    if (action === "guessed-games") {
      assertMethod(request, "GET");
      json(response, await standardModeRunner.listGuessedGames(session, {
        page: requestUrl.searchParams.get("page")
      }));
      return;
    }

    if (action === "clear-history") {
      assertMethod(request, "POST");
      json(response, await standardModeRunner.clearHistory(session));
      return;
    }

    assertMethod(request, "POST");
    json(response, await standardModeRunner.restart(session));
  } catch (error) {
    if (error instanceof StandardModeError) {
      errorJson(response, error.status, error.code);
      return;
    }
    throw error;
  }
}

async function handleSteamCallback(request, response, requestUrl) {
  const cookies = parseCookies(request.headers.cookie);
  const expectedState = cookies.get(loginStateCookieName);
  const returnedState = requestUrl.searchParams.get("state");

  if (!expectedState || expectedState !== returnedState) {
    redirectAuthFailure(response, "state");
    return;
  }

  try {
    const verifiedIdentity = await verifySteamOpenIdCallback(requestUrl.searchParams, {
      fetchImpl: steamFetch
    });
    const profile = await loadSteamProfile(verifiedIdentity.steamId, {
      fetchImpl: steamFetch
    });
    const sessionId = randomToken();

    sessions.set(sessionId, {
      displayName: profile.displayName,
      steamId: profile.steamId,
      avatarUrl: profile.avatarUrl,
      createdAt: Date.now()
    });

    redirect(response, "/?auth=success", [
      serializeCookie(sessionCookieName, sessionId, {
        httpOnly: true,
        maxAge: 60 * 60 * 24 * 7,
        sameSite: "Lax"
      }),
      expireCookie(loginStateCookieName)
    ]);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    redirectAuthFailure(response, "steam");
  }
}

function handleLogout(request, response) {
  const cookies = parseCookies(request.headers.cookie);
  const sessionId = cookies.get(sessionCookieName);
  if (sessionId) {
    sessions.delete(sessionId);
  }

  redirect(response, "/?auth=logout", [
    expireCookie(sessionCookieName),
    expireCookie(loginStateCookieName)
  ]);
}

async function handleSession(request, response) {
  const session = getRequestSession(request);

  if (session?.steamId && !session.displayName) {
    const profile = await loadSteamProfile(session.steamId, {
      fetchImpl: steamFetch
    });
    session.displayName = profile.displayName;
    session.avatarUrl = profile.avatarUrl ?? session.avatarUrl;
  }

  json(response, {
    authenticated: Boolean(session),
    user: session
      ? {
          displayName: session.displayName,
          steamId: session.steamId,
          avatarUrl: session.avatarUrl
        }
      : null
  });
}

function getRequestSession(request) {
  const cookies = parseCookies(request.headers.cookie);
  return sessions.get(cookies.get(sessionCookieName));
}

async function serveStatic(requestUrl, response) {
  const clientRoutePaths = new Set(["/", "/game/standard", "/history/guessed"]);
  const pathname = clientRoutePaths.has(requestUrl.pathname)
    ? "/src/client/index.html"
    : decodeURIComponent(requestUrl.pathname);
  const absolutePath = path.resolve(root, pathname.slice(1));

  if (!absolutePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile()) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Length": fileStat.size,
      "Content-Type": mimeTypes.get(path.extname(absolutePath)) ?? "application/octet-stream"
    });
    createReadStream(absolutePath).pipe(response);
  } catch (error) {
    if (error?.code === "ENOENT") {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    throw error;
  }
}

function redirectAuthFailure(response, reason) {
  redirect(response, `/?auth=failed&reason=${encodeURIComponent(reason)}`, [
    expireCookie(loginStateCookieName)
  ]);
}

function redirect(response, location, cookies = []) {
  response.writeHead(302, {
    Location: location,
    ...(cookies.length > 0 ? { "Set-Cookie": cookies } : {})
  });
  response.end();
}

function json(response, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(200, {
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(body);
}

function errorJson(response, status, code) {
  const body = JSON.stringify({ error: code });
  response.writeHead(status, {
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(body);
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function assertMethod(request, expectedMethod) {
  if (request.method !== expectedMethod) {
    throw new StandardModeError("method_not_allowed", 405);
  }
}

async function readJsonFile(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function requestOrigin(request) {
  return `http://${request.headers.host ?? `${host}:${preferredPort}`}`;
}

function parseCookies(cookieHeader) {
  const cookies = new Map();

  for (const part of String(cookieHeader ?? "").split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (!rawName) {
      continue;
    }
    cookies.set(rawName, decodeURIComponent(rawValue.join("=")));
  }

  return cookies;
}

function serializeCookie(name, value, {
  httpOnly = false,
  maxAge,
  pathValue = "/",
  sameSite = "Lax"
} = {}) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${pathValue}`,
    `SameSite=${sameSite}`
  ];

  if (httpOnly) {
    parts.push("HttpOnly");
  }

  if (Number.isInteger(maxAge)) {
    parts.push(`Max-Age=${maxAge}`);
  }

  return parts.join("; ");
}

function expireCookie(name) {
  return serializeCookie(name, "", {
    maxAge: 0
  });
}

function randomToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function listenOn(port, attempt) {
  server.once("error", (error) => {
    if (error?.code === "EADDRINUSE" && attempt < maxPortAttempts) {
      listenOn(port + 1, attempt + 1);
      return;
    }

    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });

  server.listen(port, host, () => {
    console.log(`dev server: http://${host}:${port}`);
    if (steamProxyUrl) {
      console.log(`dev server: Steam requests use proxy ${steamProxyUrl}`);
    }
  });
}
