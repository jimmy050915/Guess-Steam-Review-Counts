const KEY_SUFFIX = "Key";

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

  if (typeof config.appState?.stateStorageName !== "string" || config.appState.stateStorageName.length === 0) {
    errors.push("app state must declare a storage name");
  }

  if (typeof config.appState?.authenticatedValue !== "string" || config.appState.authenticatedValue.length === 0) {
    errors.push("app state must declare an authenticated value");
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

  if (config.loginButton?.actionKind !== "local-auth-success") {
    errors.push("login button action must be local-auth-success");
  }

  if (config.loginButton?.successScreenId !== config.appState?.authenticatedScreenId) {
    errors.push("login button success screen must match authenticated screen");
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

  if (!Array.isArray(config.mainMenu?.modes) || config.mainMenu.modes.length === 0) {
    errors.push("main menu must declare at least one mode");
  }

  const standardMode = config.mainMenu?.modes?.find((mode) => mode.id === "standard-mode");
  if (!standardMode) {
    errors.push("main menu must declare standard-mode");
  } else {
    if (standardMode.description?.emptyContent !== true) {
      errors.push("standard-mode description must be an explicit empty placeholder");
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
