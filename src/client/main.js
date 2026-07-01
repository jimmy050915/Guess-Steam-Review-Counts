import { getLocalizedText } from "../shared/ui-contract.mjs";

const config = await readJson("/data/ui/landing-page.json");
const localeCache = new Map();
const appState = {
  activeModeId: null,
  screenId: config.appState.initialScreenId,
  signingIn: false
};

const elements = {
  brandName: document.querySelector("#brandName"),
  introText: document.querySelector("#introText"),
  languageSwitch: document.querySelector("#languageSwitch"),
  loginButton: document.querySelector("#loginButton"),
  loginButtonText: document.querySelector("#loginButtonText"),
  loginScreen: document.querySelector("#loginScreen"),
  loginStatus: document.querySelector("#loginStatus"),
  mainMenuScreen: document.querySelector("#mainMenuScreen"),
  menuDescription: document.querySelector("#modeDescription"),
  menuStage: document.querySelector("#menuStage"),
  menuTitle: document.querySelector("#menuTitle"),
  modeList: document.querySelector("#modeList"),
  pageTitle: document.querySelector("#pageTitle")
};

const urlLocale = new URLSearchParams(window.location.search).get("lang");
const storedLocale = window.localStorage.getItem("gsc.locale");
const initialLocale = normalizeLocale(urlLocale ?? storedLocale ?? config.defaultLocale);
const storedAuthState = window.sessionStorage.getItem(config.appState.stateStorageName);

renderLanguageButtons();
renderModeButtons();
await applyLocale(initialLocale);
setScreen(storedAuthState === config.appState.authenticatedValue
  ? config.appState.authenticatedScreenId
  : config.appState.initialScreenId);

elements.loginButton.addEventListener("click", () => {
  void signIn();
});

function currentLocale() {
  return document.documentElement.lang || config.defaultLocale;
}

function normalizeLocale(locale) {
  return config.supportedLocales.includes(locale) ? locale : config.defaultLocale;
}

async function applyLocale(locale) {
  const nextLocale = normalizeLocale(locale);
  const bundle = await loadLocale(nextLocale);
  const loginScreen = getScreenConfig(config.appState.initialScreenId);
  const menuScreen = getScreenConfig(config.appState.authenticatedScreenId);

  document.documentElement.lang = nextLocale;
  document.title = getLocalizedText(bundle, "page.title");
  elements.brandName.textContent = getLocalizedText(bundle, config.brand.nameKey);
  elements.brandName.setAttribute("aria-label", getLocalizedText(bundle, config.brand.nameKey));
  elements.pageTitle.textContent = getLocalizedText(bundle, loginScreen.headingKey);
  elements.introText.textContent = getLocalizedText(bundle, loginScreen.bodyKey);
  elements.loginButtonText.textContent = getLocalizedText(bundle, loginScreen.buttonKey);
  elements.menuTitle.textContent = getLocalizedText(bundle, menuScreen.headingKey);
  elements.modeList.setAttribute("aria-label", getLocalizedText(bundle, menuScreen.ariaLabelKey));
  elements.languageSwitch.setAttribute("aria-label", getLocalizedText(bundle, config.languageToggle.labelKey));

  for (const button of elements.languageSwitch.querySelectorAll("button")) {
    const isActive = button.dataset.locale === nextLocale;
    button.setAttribute("aria-pressed", String(isActive));
    button.textContent = getLocalizedText(bundle, button.dataset.labelKey);
  }

  for (const button of elements.modeList.querySelectorAll("button")) {
    button.querySelector(".mode-button-text").textContent = getLocalizedText(bundle, button.dataset.labelKey);
  }

  if (!appState.signingIn) {
    elements.loginStatus.textContent = "";
  }

  window.localStorage.setItem("gsc.locale", nextLocale);
}

async function loadLocale(locale) {
  if (!localeCache.has(locale)) {
    localeCache.set(locale, await readJson(`/data/localization/${locale}.json`));
  }
  return localeCache.get(locale);
}

async function readJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }
  return response.json();
}

function renderLanguageButtons() {
  elements.languageSwitch.replaceChildren();

  for (const option of config.languageToggle.options) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.locale = option.locale;
    button.dataset.labelKey = option.labelKey;
    button.addEventListener("click", () => {
      void applyLocale(option.locale);
    });
    elements.languageSwitch.append(button);
  }
}

function renderModeButtons() {
  elements.modeList.replaceChildren();
  elements.menuDescription.id = config.mainMenu.modes[0]?.description.surfaceId ?? elements.menuDescription.id;

  for (const mode of config.mainMenu.modes) {
    const button = document.createElement("button");
    const label = document.createElement("span");

    button.type = "button";
    button.className = "mode-button";
    button.dataset.modeId = mode.id;
    button.dataset.labelKey = mode.labelKey;
    button.setAttribute("aria-controls", mode.description.surfaceId);
    button.setAttribute("aria-expanded", "false");
    button.addEventListener("click", () => {
      setActiveMode(mode.id);
    });

    label.className = "mode-button-text";
    button.append(label);
    elements.modeList.append(button);
  }
}

async function signIn() {
  if (appState.signingIn) {
    return;
  }

  appState.signingIn = true;
  elements.loginButton.disabled = true;
  elements.loginButton.setAttribute("aria-busy", "true");

  const bundle = await loadLocale(currentLocale());
  const loginScreen = getScreenConfig(config.appState.initialScreenId);
  elements.loginStatus.textContent = getLocalizedText(bundle, loginScreen.pendingStatusKey);

  await delay(config.loginButton.successDelayMs);

  window.sessionStorage.setItem(config.appState.stateStorageName, config.appState.authenticatedValue);
  elements.loginStatus.textContent = getLocalizedText(bundle, loginScreen.successStatusKey);
  setScreen(config.loginButton.successScreenId);

  appState.signingIn = false;
  elements.loginButton.disabled = false;
  elements.loginButton.removeAttribute("aria-busy");
}

function setScreen(screenId) {
  const isAuthenticatedScreen = screenId === config.appState.authenticatedScreenId;
  appState.screenId = isAuthenticatedScreen ? config.appState.authenticatedScreenId : config.appState.initialScreenId;
  document.body.dataset.screen = appState.screenId;

  elements.loginScreen.hidden = isAuthenticatedScreen;
  elements.mainMenuScreen.hidden = !isAuthenticatedScreen;

  if (isAuthenticatedScreen) {
    elements.loginStatus.textContent = "";
    elements.menuTitle.focus({ preventScroll: true });
  } else {
    setActiveMode(null);
  }
}

function setActiveMode(modeId) {
  const mode = config.mainMenu.modes.find((candidate) => candidate.id === modeId);
  appState.activeModeId = mode?.id ?? null;

  elements.menuStage.classList.toggle("is-describing", Boolean(mode));
  elements.menuDescription.replaceChildren();
  elements.menuDescription.setAttribute("aria-hidden", String(!mode));

  for (const button of elements.modeList.querySelectorAll("button")) {
    button.setAttribute("aria-expanded", String(button.dataset.modeId === appState.activeModeId));
  }
}

function getScreenConfig(screenId) {
  return config.layout.screens.find((screen) => screen.id === screenId);
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, Number.isFinite(ms) ? ms : 0);
  });
}
