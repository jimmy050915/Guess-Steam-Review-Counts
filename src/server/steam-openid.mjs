import process from "node:process";

export const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";
export const STEAM_OPENID_PROVIDER = "https://steamcommunity.com/openid";
export const OPENID_NS = "http://specs.openid.net/auth/2.0";
export const IDENTIFIER_SELECT = `${OPENID_NS}/identifier_select`;

const STEAM_CLAIMED_ID_PATTERN = /^https?:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;

export function buildSteamLoginUrl({ returnToUrl, realmUrl }) {
  const url = new URL(STEAM_OPENID_ENDPOINT);
  url.search = new URLSearchParams({
    "openid.ns": OPENID_NS,
    "openid.mode": "checkid_setup",
    "openid.return_to": returnToUrl,
    "openid.realm": realmUrl,
    "openid.identity": IDENTIFIER_SELECT,
    "openid.claimed_id": IDENTIFIER_SELECT
  }).toString();
  return url;
}

export function buildCheckAuthenticationParams(callbackParams) {
  const params = new URLSearchParams();

  for (const [key, value] of callbackParams) {
    if (key.startsWith("openid.")) {
      params.append(key, value);
    }
  }

  params.set("openid.mode", "check_authentication");
  return params;
}

export function parseOpenIdVerification(bodyText) {
  return bodyText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .some((line) => line === "is_valid:true");
}

export function extractSteamIdFromClaimedId(claimedId) {
  if (typeof claimedId !== "string") {
    return null;
  }

  const match = claimedId.match(STEAM_CLAIMED_ID_PATTERN);
  return match?.[1] ?? null;
}

export async function verifySteamOpenIdCallback(callbackParams, { fetchImpl = fetch } = {}) {
  if (callbackParams.get("openid.ns") !== OPENID_NS) {
    throw new Error("invalid_openid_namespace");
  }

  if (callbackParams.get("openid.mode") !== "id_res") {
    throw new Error("invalid_openid_mode");
  }

  if (callbackParams.get("openid.op_endpoint") !== STEAM_OPENID_ENDPOINT) {
    throw new Error("invalid_openid_endpoint");
  }

  const steamId = extractSteamIdFromClaimedId(callbackParams.get("openid.claimed_id"));
  if (!steamId) {
    throw new Error("invalid_steam_claimed_id");
  }

  const verificationParams = buildCheckAuthenticationParams(callbackParams);
  const response = await fetchImpl(STEAM_OPENID_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: verificationParams.toString()
  });

  if (!response.ok) {
    throw new Error("steam_openid_verification_http_error");
  }

  const bodyText = await response.text();
  if (!parseOpenIdVerification(bodyText)) {
    throw new Error("steam_openid_verification_failed");
  }

  return {
    steamId,
    claimedId: callbackParams.get("openid.claimed_id")
  };
}

export async function loadSteamProfile(steamId, {
  apiKey = process.env.STEAM_WEB_API_KEY,
  fetchImpl = fetch
} = {}) {
  if (typeof steamId !== "string" || !/^\d{17}$/.test(steamId)) {
    throw new Error("invalid_steam_id");
  }

  if (apiKey) {
    const playerSummary = await tryLoadPlayerSummary(steamId, apiKey, fetchImpl);
    if (playerSummary) {
      return playerSummary;
    }
  }

  const xmlProfile = await tryLoadCommunityXmlProfile(steamId, fetchImpl);
  return xmlProfile ?? {
    displayName: steamId,
    steamId,
    avatarUrl: null
  };
}

export function parseSteamProfileXml(xmlText, steamId) {
  return {
    displayName: readXmlTag(xmlText, "steamID") ?? steamId,
    steamId,
    avatarUrl: readXmlTag(xmlText, "avatarFull") ?? readXmlTag(xmlText, "avatarMedium") ?? readXmlTag(xmlText, "avatarIcon")
  };
}

async function tryLoadPlayerSummary(steamId, apiKey, fetchImpl) {
  try {
    const url = new URL("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("steamids", steamId);

    const response = await fetchImpl(url);
    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    const player = payload?.response?.players?.[0];
    if (!player) {
      return null;
    }

    return {
      displayName: player.personaname ?? steamId,
      steamId,
      avatarUrl: player.avatarfull ?? player.avatarmedium ?? player.avatar ?? null
    };
  } catch {
    return null;
  }
}

async function tryLoadCommunityXmlProfile(steamId, fetchImpl) {
  try {
    const url = new URL(`https://steamcommunity.com/profiles/${steamId}`);
    url.searchParams.set("xml", "1");

    const response = await fetchImpl(url);
    if (!response.ok) {
      return null;
    }

    const profile = parseSteamProfileXml(await response.text(), steamId);
    return profile.avatarUrl ? profile : null;
  } catch {
    return null;
  }
}

function readXmlTag(xmlText, tagName) {
  if (typeof xmlText !== "string") {
    return null;
  }

  const pattern = new RegExp(`<${tagName}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tagName}>`, "i");
  const rawValue = xmlText.match(pattern)?.[1]?.trim();
  return rawValue ? decodeXmlEntities(rawValue) : null;
}

function decodeXmlEntities(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'");
}
