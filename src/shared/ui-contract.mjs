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

  if (config.pageId !== "intro-login") {
    errors.push("landing page pageId must be intro-login");
  }

  if (config.layout?.kind !== "single-screen-intro-login") {
    errors.push("landing page layout kind must be single-screen-intro-login");
  }

  if (config.layout?.allowsCards !== false) {
    errors.push("landing page layout must explicitly disallow card layouts");
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
