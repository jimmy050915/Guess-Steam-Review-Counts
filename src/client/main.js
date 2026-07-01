import { getLocalizedText } from "../shared/ui-contract.mjs";

const config = await readJson("/data/ui/landing-page.json");
const localeCache = new Map();
const appState = {
  activeModeId: null,
  screenId: config.appState.initialScreenId,
  signingIn: false,
  user: null
};

const elements = {
  accountAvatar: document.querySelector("#accountAvatar"),
  accountSteamId: document.querySelector("#accountSteamId"),
  accountSummary: document.querySelector("#accountSummary"),
  brandName: document.querySelector("#brandName"),
  introText: document.querySelector("#introText"),
  languageSwitch: document.querySelector("#languageSwitch"),
  loginButton: document.querySelector("#loginButton"),
  loginButtonText: document.querySelector("#loginButtonText"),
  loginScreen: document.querySelector("#loginScreen"),
  loginStatus: document.querySelector("#loginStatus"),
  logoutButton: document.querySelector("#logoutButton"),
  logoutButtonText: document.querySelector("#logoutButtonText"),
  mainMenuScreen: document.querySelector("#mainMenuScreen"),
  menuDescription: document.querySelector("#modeDescription"),
  menuStage: document.querySelector("#menuStage"),
  menuTitle: document.querySelector("#menuTitle"),
  modeList: document.querySelector("#modeList"),
  pageTitle: document.querySelector("#pageTitle"),
  standardGameScreen: document.querySelector("#standardGameScreen"),
  standardGameTitle: document.querySelector("#standardGameTitle")
};

const urlLocale = new URLSearchParams(window.location.search).get("lang");
const storedLocale = window.localStorage.getItem("gsc.locale");
const initialLocale = normalizeLocale(urlLocale ?? storedLocale ?? config.defaultLocale);

renderLanguageButtons();
renderModeButtons();
await applyLocale(initialLocale);
await syncSession();
applyAuthResultStatus();

elements.loginButton.addEventListener("click", () => {
  void signIn();
});

elements.logoutButton.addEventListener("click", () => {
  window.location.assign(config.auth.logoutPath);
});

elements.menuStage.addEventListener("click", (event) => {
  if (!event.target.closest(".mode-button")) {
    setActiveMode(null);
  }
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
  const standardGameScreen = getScreenConfig("standard-game");

  document.documentElement.lang = nextLocale;
  document.title = getLocalizedText(bundle, "page.title");
  elements.brandName.textContent = getLocalizedText(bundle, config.brand.nameKey);
  elements.brandName.setAttribute("aria-label", getLocalizedText(bundle, config.brand.nameKey));
  elements.pageTitle.textContent = getLocalizedText(bundle, loginScreen.headingKey);
  elements.introText.textContent = getLocalizedText(bundle, loginScreen.bodyKey);
  elements.loginButtonText.textContent = getLocalizedText(bundle, loginScreen.buttonKey);
  elements.logoutButtonText.textContent = getLocalizedText(bundle, "account.logout.button");
  elements.menuTitle.textContent = getLocalizedText(bundle, menuScreen.headingKey);
  elements.standardGameTitle.textContent = getLocalizedText(bundle, standardGameScreen.headingKey);
  elements.modeList.setAttribute("aria-label", getLocalizedText(bundle, menuScreen.ariaLabelKey));
  elements.languageSwitch.setAttribute("aria-label", getLocalizedText(bundle, config.languageToggle.labelKey));

  for (const button of elements.languageSwitch.querySelectorAll("button")) {
    const isActive = button.dataset.locale === nextLocale;
    button.setAttribute("aria-pressed", String(isActive));
    button.textContent = getLocalizedText(bundle, button.dataset.labelKey);
  }

  updateModeButtonLabels(bundle);
  if (appState.activeModeId) {
    renderModeDescription(getModeConfig(appState.activeModeId), bundle);
  }

  if (!appState.signingIn) {
    elements.loginStatus.textContent = "";
  }

  await renderAccountSummary();
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
    button.dataset.activeLabelKey = mode.activeLabelKey;
    button.dataset.activeAnimation = mode.activeAnimation;
    button.setAttribute("aria-controls", mode.description.surfaceId);
    button.setAttribute("aria-expanded", "false");
    button.addEventListener("click", () => {
      handleModeClick(mode);
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
  window.location.assign(config.auth.loginPath);
}

async function syncSession() {
  try {
    const response = await fetch(config.auth.sessionPath, {
      cache: "no-store",
      credentials: "same-origin"
    });

    if (!response.ok) {
      throw new Error(`Session request failed: ${response.status}`);
    }

    const session = await response.json();
    appState.user = session.authenticated ? session.user : null;
    await renderAccountSummary();
    setScreen(session.authenticated
      ? resolveAuthenticatedScreenId()
      : config.appState.initialScreenId);
  } catch {
    appState.user = null;
    await renderAccountSummary();
    setScreen(config.appState.initialScreenId);

    const bundle = await loadLocale(currentLocale());
    elements.loginStatus.textContent = getLocalizedText(bundle, config.auth.sessionErrorStatusKey);
  }
}

function setScreen(screenId) {
  const nextScreenId = getScreenConfig(screenId)?.id ?? config.appState.initialScreenId;
  const isLoginScreen = nextScreenId === config.appState.initialScreenId;
  const isMainMenuScreen = nextScreenId === config.appState.authenticatedScreenId;
  const isStandardGameScreen = nextScreenId === "standard-game";

  appState.screenId = nextScreenId;
  document.body.dataset.screen = appState.screenId;

  elements.loginScreen.hidden = !isLoginScreen;
  elements.mainMenuScreen.hidden = !isMainMenuScreen;
  elements.standardGameScreen.hidden = !isStandardGameScreen;

  if (!isMainMenuScreen) {
    setActiveMode(null);
  }

  if (isMainMenuScreen) {
    elements.loginStatus.textContent = "";
    elements.menuTitle.focus({ preventScroll: true });
  } else if (isStandardGameScreen) {
    elements.loginStatus.textContent = "";
    elements.standardGameTitle.focus({ preventScroll: true });
  }
}

function handleModeClick(mode) {
  if (appState.activeModeId === mode.id && mode.startPath) {
    window.location.assign(mode.startPath);
    return;
  }

  setActiveMode(mode.id);
}

function setActiveMode(modeId) {
  const mode = config.mainMenu.modes.find((candidate) => candidate.id === modeId);
  const bundle = localeCache.get(currentLocale());
  appState.activeModeId = mode?.id ?? null;

  elements.menuStage.classList.toggle("is-describing", Boolean(mode));
  elements.menuDescription.setAttribute("aria-hidden", String(!mode));

  if (mode) {
    renderModeDescription(mode, bundle);
  } else {
    elements.menuDescription.replaceChildren();
  }

  for (const button of elements.modeList.querySelectorAll("button")) {
    button.setAttribute("aria-expanded", String(button.dataset.modeId === appState.activeModeId));
  }

  updateModeButtonLabels(bundle);
}

function renderModeDescription(mode, bundle) {
  if (!mode || !bundle) {
    elements.menuDescription.replaceChildren();
    return;
  }

  const layout = document.createElement("div");
  const top = document.createElement("div");
  const records = document.createElement("div");

  layout.className = "mode-description-layout";
  layout.dataset.layout = mode.description.layout;
  top.className = "mode-description-top";
  records.className = "mode-description-records";

  for (const sectionConfig of mode.description.sections) {
    const section = document.createElement("section");
    const heading = document.createElement("h2");

    section.className = "mode-description-section";
    heading.textContent = getLocalizedText(bundle, sectionConfig.headingKey);
    section.append(heading);

    if (sectionConfig.bodyKey) {
      const paragraph = document.createElement("p");
      paragraph.textContent = getLocalizedText(bundle, sectionConfig.bodyKey);
      section.append(paragraph);
    }

    if (Array.isArray(sectionConfig.listItemKeys)) {
      const list = document.createElement("ol");
      for (const itemKey of sectionConfig.listItemKeys) {
        const item = document.createElement("li");
        item.textContent = getLocalizedText(bundle, itemKey);
        list.append(item);
      }
      section.append(list);
    }

    top.append(section);
  }

  for (const recordConfig of mode.description.records) {
    const label = document.createElement("h2");
    label.className = "mode-record-label";
    label.textContent = getLocalizedText(bundle, recordConfig.labelKey);
    records.append(label);
  }

  layout.append(top, records);
  elements.menuDescription.replaceChildren(layout);
}

function updateModeButtonLabels(bundle) {
  if (!bundle) {
    return;
  }

  for (const button of elements.modeList.querySelectorAll("button")) {
    const mode = getModeConfig(button.dataset.modeId);
    const labelKey = button.dataset.modeId === appState.activeModeId
      ? mode.activeLabelKey
      : mode.labelKey;
    button.querySelector(".mode-button-text").textContent = getLocalizedText(bundle, labelKey);
  }
}

async function applyAuthResultStatus() {
  const authResult = new URLSearchParams(window.location.search).get("auth");
  if (!authResult || appState.user) {
    return;
  }

  const bundle = await loadLocale(currentLocale());
  if (authResult === "failed") {
    elements.loginStatus.textContent = getLocalizedText(bundle, config.auth.failureStatusKey);
  }
}

async function renderAccountSummary() {
  const user = appState.user;
  elements.accountSummary.hidden = !user;

  if (!user) {
    elements.accountAvatar.removeAttribute("src");
    elements.accountSteamId.textContent = "";
    return;
  }

  const bundle = await loadLocale(currentLocale());
  const displayName = user.displayName || user.steamId;
  elements.accountSummary.setAttribute(
    "aria-label",
    `${getLocalizedText(bundle, config.auth.accountAriaLabelKey)} ${displayName}`
  );
  elements.accountSteamId.textContent = displayName;
  elements.accountSteamId.title = user.steamId;

  if (user.avatarUrl) {
    elements.accountAvatar.hidden = false;
    elements.accountAvatar.src = user.avatarUrl;
  } else {
    elements.accountAvatar.hidden = true;
    elements.accountAvatar.removeAttribute("src");
  }
}

function getScreenConfig(screenId) {
  return config.layout.screens.find((screen) => screen.id === screenId);
}

function getModeConfig(modeId) {
  return config.mainMenu.modes.find((mode) => mode.id === modeId);
}

function resolveAuthenticatedScreenId() {
  const routeScreen = config.layout.screens.find((screen) => screen.routePath === window.location.pathname);
  return routeScreen?.id ?? config.appState.authenticatedScreenId;
}
