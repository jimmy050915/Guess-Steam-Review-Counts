const KEY_SUFFIX = "Key";
const KEY_LIST_SUFFIX = "Keys";

export function getLocalizedText(bundle, key) {
  if (!bundle || typeof bundle !== "object") {
    throw new Error("Localization bundle must be an object");
  }

  const value = bundle[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing localization key: ${key}`);
  }

  return value;
}

export function collectLocalizationKeys(value, keys = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectLocalizationKeys(item, keys);
    }
    return keys;
  }

  if (!value || typeof value !== "object") {
    return keys;
  }

  for (const [name, nestedValue] of Object.entries(value)) {
    if (name.endsWith(KEY_SUFFIX)) {
      if (typeof nestedValue !== "string" || nestedValue.length === 0) {
        throw new Error(`Localization field ${name} must contain a key string`);
      }
      keys.add(nestedValue);
    } else if (name.endsWith(KEY_LIST_SUFFIX)) {
      if (!Array.isArray(nestedValue)) {
        throw new Error(`Localization field ${name} must contain key strings`);
      }
      for (const key of nestedValue) {
        if (typeof key !== "string" || key.length === 0) {
          throw new Error(`Localization field ${name} must contain key strings`);
        }
        keys.add(key);
      }
    } else {
      collectLocalizationKeys(nestedValue, keys);
    }
  }

  return keys;
}

export function validateLandingPageConfig(config, localeBundles) {
  const errors = [];

  if (!config || typeof config !== "object") {
    return ["landing page config must be an object"];
  }

  if (config.schemaVersion !== 1) {
    errors.push("landing page config schemaVersion must be 1");
  }

  if (config.pageId !== "login-main-menu") {
    errors.push("landing page pageId must be login-main-menu");
  }

  if (config.layout?.kind !== "login-to-main-menu-flow") {
    errors.push("landing page layout kind must be login-to-main-menu-flow");
  }

  if (config.layout?.allowsCards !== false) {
    errors.push("landing page layout must explicitly disallow card layouts");
  }

  if (config.standardGame?.layout?.allowsCards !== false) {
    errors.push("standard game layout must explicitly disallow card layouts");
  }

  if (config.standardGame?.video?.hidePrePlayPoster !== true) {
    errors.push("standard game must hide pre-play trailer posters");
  }

  const screenIds = new Set((config.layout?.screens ?? []).map((screen) => screen.id));

  if (config.appState?.initialScreenId !== "login") {
    errors.push("app state initial screen must be login");
  }

  if (config.appState?.authenticatedScreenId !== "main-menu") {
    errors.push("app state authenticated screen must be main-menu");
  }

  if (!screenIds.has(config.appState?.initialScreenId)) {
    errors.push("app state initial screen must exist in layout screens");
  }

  if (!screenIds.has(config.appState?.authenticatedScreenId)) {
    errors.push("app state authenticated screen must exist in layout screens");
  }

  const standardGameScreen = config.layout?.screens?.find((screen) => screen.id === "standard-game");
  if (standardGameScreen?.role !== "gameplay") {
    errors.push("standard-game screen must declare gameplay role");
  }

  if (standardGameScreen?.routePath !== "/game/standard") {
    errors.push("standard-game screen route path must be /game/standard");
  }

  if (config.standardGame?.modeId !== "standard-mode") {
    errors.push("standard game modeId must be standard-mode");
  }

  for (const [fieldName, expectedValue] of Object.entries({
    statePath: "/api/standard/state",
    guessPath: "/api/standard/guess",
    nextPath: "/api/standard/next",
    skipShortVideoPath: "/api/standard/skip-short-video",
    restartPath: "/api/standard/restart"
  })) {
    if (config.standardGame?.api?.[fieldName] !== expectedValue) {
      errors.push(`standard game api ${fieldName} must be ${expectedValue}`);
    }
  }

  if (config.standardGame?.input?.min !== 50) {
    errors.push("standard game input minimum must be 50");
  }

  if (config.appState?.sessionSource !== "server-cookie") {
    errors.push("app state session source must be server-cookie");
  }

  if (config.auth?.provider !== "steam-openid") {
    errors.push("auth provider must be steam-openid");
  }

  for (const [fieldName, expectedValue] of Object.entries({
    loginPath: "/auth/steam",
    callbackPath: "/auth/steam/callback",
    sessionPath: "/api/session",
    logoutPath: "/auth/logout"
  })) {
    if (config.auth?.[fieldName] !== expectedValue) {
      errors.push(`auth ${fieldName} must be ${expectedValue}`);
    }
  }

  if (!Array.isArray(config.auth?.profileFields) || !config.auth.profileFields.includes("displayName") || !config.auth.profileFields.includes("steamId") || !config.auth.profileFields.includes("avatarUrl")) {
    errors.push("auth profile fields must include displayName, steamId and avatarUrl");
  }

  if (config.loginButton?.shape !== "capsule") {
    errors.push("login button shape must be capsule");
  }

  if (config.loginButton?.colorToken !== "steam-green") {
    errors.push("login button must use the steam-green color token");
  }

  if (config.loginButton?.pressAnimation !== "subtle-press") {
    errors.push("login button must use the subtle-press animation token");
  }

  if (config.loginButton?.actionKind !== "steam-openid-redirect") {
    errors.push("login button action must be steam-openid-redirect");
  }

  if (config.layout?.mainMenu?.kind !== "horizontal-shift-with-right-description") {
    errors.push("main menu layout kind must be horizontal-shift-with-right-description");
  }

  if (config.layout?.mainMenu?.modeListShift !== "left-on-mode-click") {
    errors.push("main menu must shift the mode list left on click");
  }

  if (config.layout?.mainMenu?.descriptionReveal !== "slide-from-right-after-click") {
    errors.push("main menu description must slide from the right after click");
  }

  if (config.layout?.mainMenu?.descriptionContent !== "mode-rules-and-records") {
    errors.push("main menu description content must use mode-rules-and-records");
  }

  if (config.layout?.screenTransition?.kind !== "fade") {
    errors.push("screen transition kind must be fade");
  }

  if (config.layout?.screenTransition?.durationMs !== 160) {
    errors.push("screen transition duration must be 160");
  }

  if (config.layout?.screenTransition?.reducedMotion !== "none") {
    errors.push("screen transition reduced motion behavior must be none");
  }

  if (!Array.isArray(config.mainMenu?.modes) || config.mainMenu.modes.length === 0) {
    errors.push("main menu must declare at least one mode");
  }

  const standardMode = config.mainMenu?.modes?.find((mode) => mode.id === "standard-mode");
  if (!standardMode) {
    errors.push("main menu must declare standard-mode");
  } else {
    if (standardMode.activeLabelKey !== "mainMenu.standardMode.readyButton") {
      errors.push("standard-mode must declare the ready button label key");
    }

    if (standardMode.startPath !== "/game/standard") {
      errors.push("standard-mode start path must be /game/standard");
    }

    if (standardMode.activeAnimation !== "subtle-float") {
      errors.push("standard-mode active animation must be subtle-float");
    }

    if (standardMode.description?.surfaceId !== "standard-mode-description") {
      errors.push("standard-mode description surface id must be standard-mode-description");
    }

    if (standardMode.description?.layout !== "mode-rules-and-records") {
      errors.push("standard-mode description layout must be mode-rules-and-records");
    }

    const rulesSection = standardMode.description?.sections?.find((section) => section.id === "rules");
    if (rulesSection?.headingKey !== "mainMenu.standardMode.description.heading" || rulesSection?.bodyKey !== "mainMenu.standardMode.description.body") {
      errors.push("standard-mode rules section must declare heading and body localization keys");
    }

    const filtersSection = standardMode.description?.sections?.find((section) => section.id === "filters");
    if (!Array.isArray(filtersSection?.listItemKeys) || filtersSection.listItemKeys.length !== 3) {
      errors.push("standard-mode filter section must declare three list item keys");
    }

    const records = standardMode.description?.records ?? [];
    if (!records.some((record) => record.id === "high-score") || !records.some((record) => record.id === "best-combo")) {
      errors.push("standard-mode description must declare high score and best combo records");
    }
  }

  if (!Array.isArray(config.supportedLocales) || config.supportedLocales.length < 2) {
    errors.push("landing page must declare at least two supported locales");
  }

  if (!config.supportedLocales?.includes(config.defaultLocale)) {
    errors.push("default locale must be included in supported locales");
  }

  const requiredKeys = collectLocalizationKeys(config);
  requiredKeys.add("page.title");

  for (const locale of config.supportedLocales ?? []) {
    const bundle = localeBundles[locale];
    if (!bundle) {
      errors.push(`missing localization bundle: ${locale}`);
      continue;
    }

    for (const key of requiredKeys) {
      if (typeof bundle[key] !== "string" || bundle[key].length === 0) {
        errors.push(`${locale} is missing localization key: ${key}`);
      }
    }
  }

  return errors;
}
