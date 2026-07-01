import { getLocalizedText } from "../shared/ui-contract.mjs";

const config = await readJson("/data/ui/landing-page.json");
const localeCache = new Map();
const appState = {
  activeModeId: null,
  screenId: config.appState.initialScreenId,
  signingIn: false,
  standardMode: {
    loading: false,
    state: null
  },
  user: null
};
const screenTransitionConfig = config.layout.screenTransition ?? {};
const screenTransitionMs = Number.isInteger(screenTransitionConfig.durationMs)
  ? screenTransitionConfig.durationMs
  : 160;
let hlsInstance = null;
let videoTrimController = null;
let shortVideoSkipInProgress = false;
let screenTransitionToken = 0;

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
  standardFinalScore: document.querySelector("#standardFinalScore"),
  standardFinalStreak: document.querySelector("#standardFinalStreak"),
  standardGameCover: document.querySelector("#standardGameCover"),
  standardGameCoverLink: document.querySelector("#standardGameCoverLink"),
  standardGameInfoHeading: document.querySelector("#standardGameInfoHeading"),
  standardGameLoading: document.querySelector("#standardGameLoading"),
  standardGameLoadingPanel: document.querySelector("#standardGameLoadingPanel"),
  standardGameLoadingProgress: document.querySelector("#standardGameLoadingProgress"),
  standardGameName: document.querySelector("#standardGameName"),
  standardGameScreen: document.querySelector("#standardGameScreen"),
  standardGameTitle: document.querySelector("#standardGameTitle"),
  standardGameVideo: document.querySelector("#standardGameVideo"),
  standardGuessButton: document.querySelector("#standardGuessButton"),
  standardGuessForm: document.querySelector("#standardGuessForm"),
  standardGuessHint: document.querySelector("#standardGuessHint"),
  standardGuessInput: document.querySelector("#standardGuessInput"),
  standardGuessLabel: document.querySelector("#standardGuessLabel"),
  standardGuessNumberLabel: document.querySelector("#standardGuessNumberLabel"),
  standardGuessNumberValue: document.querySelector("#standardGuessNumberValue"),
  standardGuessStatus: document.querySelector("#standardGuessStatus"),
  standardHealthLabel: document.querySelector("#standardHealthLabel"),
  standardHealthValue: document.querySelector("#standardHealthValue"),
  standardLastGame: document.querySelector("#standardLastGame"),
  standardLastGameCover: document.querySelector("#standardLastGameCover"),
  standardLastGameCoverLink: document.querySelector("#standardLastGameCoverLink"),
  standardLastGameHeading: document.querySelector("#standardLastGameHeading"),
  standardLastGameName: document.querySelector("#standardLastGameName"),
  standardLastGameReviewCount: document.querySelector("#standardLastGameReviewCount"),
  standardPlayLayout: document.querySelector("#standardPlayLayout"),
  standardRecordNotice: document.querySelector("#standardRecordNotice"),
  standardResultLayout: document.querySelector("#standardResultLayout"),
  standardResultTitle: document.querySelector("#standardResultTitle"),
  standardRestartButton: document.querySelector("#standardRestartButton"),
  standardReturnMenuButton: document.querySelector("#standardReturnMenuButton"),
  standardRevealedGame: document.querySelector("#standardRevealedGame"),
  standardReviewCount: document.querySelector("#standardReviewCount"),
  standardRoundResult: document.querySelector("#standardRoundResult"),
  standardScoreLabel: document.querySelector("#standardScoreLabel"),
  standardScoreValue: document.querySelector("#standardScoreValue"),
  standardStreakLabel: document.querySelector("#standardStreakLabel"),
  standardStreakValue: document.querySelector("#standardStreakValue"),
  standardWaitingReveal: document.querySelector("#standardWaitingReveal")
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

elements.standardGuessForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void handleStandardSubmit();
});

elements.standardGuessInput.addEventListener("wheel", preventFocusedNumberWheel, { passive: false });

elements.standardRestartButton.addEventListener("click", () => {
  void restartStandardGame();
});

elements.standardReturnMenuButton.addEventListener("click", () => {
  window.location.assign("/");
});

function preventFocusedNumberWheel(event) {
  if (document.activeElement === elements.standardGuessInput) {
    event.preventDefault();
  }
}

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
  elements.standardGuessLabel.textContent = getLocalizedText(bundle, config.standardGame.labels.guessLabelKey);
  elements.standardGuessHint.textContent = getLocalizedText(bundle, config.standardGame.labels.guessHintKey);
  elements.standardHealthLabel.textContent = getLocalizedText(bundle, config.standardGame.labels.healthLabelKey);
  elements.standardScoreLabel.textContent = getLocalizedText(bundle, config.standardGame.labels.scoreLabelKey);
  elements.standardStreakLabel.textContent = getLocalizedText(bundle, config.standardGame.labels.streakLabelKey);
  elements.standardGuessNumberLabel.textContent = getLocalizedText(bundle, config.standardGame.labels.guessNumberLabelKey);
  elements.standardGameInfoHeading.textContent = getLocalizedText(bundle, config.standardGame.labels.gameInfoHeadingKey);
  elements.standardResultTitle.textContent = getLocalizedText(bundle, config.standardGame.labels.gameOverHeadingKey);
  elements.standardLastGameHeading.textContent = getLocalizedText(bundle, config.standardGame.labels.lastGameHeadingKey);
  elements.standardRestartButton.textContent = getLocalizedText(bundle, config.standardGame.labels.restartButtonKey);
  elements.standardReturnMenuButton.textContent = getLocalizedText(bundle, config.standardGame.labels.returnMenuButtonKey);
  elements.modeList.setAttribute("aria-label", getLocalizedText(bundle, menuScreen.ariaLabelKey));
  elements.languageSwitch.setAttribute("aria-label", getLocalizedText(bundle, config.languageToggle.labelKey));
  elements.standardGuessInput.min = String(config.standardGame.input.min);

  for (const button of elements.languageSwitch.querySelectorAll("button")) {
    const isActive = button.dataset.locale === nextLocale;
    button.setAttribute("aria-pressed", String(isActive));
    button.textContent = getLocalizedText(bundle, button.dataset.labelKey);
  }

  updateModeButtonLabels(bundle);
  if (appState.activeModeId) {
    renderModeDescription(getModeConfig(appState.activeModeId), bundle);
  }
  renderStandardGame();

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
  const shouldFade = shouldUseScreenTransition(nextScreenId);
  const transitionToken = ++screenTransitionToken;

  if (!shouldFade) {
    document.body.classList.remove("is-screen-fading");
    applyScreenState(nextScreenId);
    return;
  }

  document.body.classList.add("is-screen-fading");
  window.setTimeout(() => {
    if (transitionToken !== screenTransitionToken) {
      return;
    }

    applyScreenState(nextScreenId);
    window.requestAnimationFrame(() => {
      if (transitionToken === screenTransitionToken) {
        document.body.classList.remove("is-screen-fading");
      }
    });
  }, screenTransitionMs);
}

function shouldUseScreenTransition(nextScreenId) {
  if (screenTransitionConfig.kind !== "fade" || screenTransitionMs <= 0) {
    return false;
  }

  if (!document.body.dataset.screen || appState.screenId === nextScreenId) {
    return false;
  }

  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function applyScreenState(nextScreenId) {
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
    void loadStandardState();
  } else {
    detachStandardVideo();
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

async function loadStandardState() {
  if (!appState.user || appState.standardMode.loading) {
    return;
  }

  appState.standardMode.loading = true;
  renderStandardGame();

  try {
    appState.standardMode.state = await requestStandardApi(config.standardGame.api.statePath, {
      method: "GET"
    });
    elements.standardGuessStatus.textContent = "";
  } catch (error) {
    elements.standardGuessStatus.textContent = await getStandardErrorText(error.code);
  } finally {
    appState.standardMode.loading = false;
    renderStandardGame();
  }
}

async function handleStandardSubmit() {
  const state = appState.standardMode.state;
  if (!state || appState.standardMode.loading) {
    return;
  }

  if (state.result) {
    await nextStandardGame();
    return;
  }

  const guessValue = elements.standardGuessInput.value;
  const parsedGuess = Number.parseInt(guessValue, 10);
  if (!Number.isInteger(parsedGuess) || parsedGuess < config.standardGame.input.min) {
    elements.standardGuessStatus.textContent = await getStandardErrorText("invalid_guess");
    return;
  }

  appState.standardMode.loading = true;
  renderStandardGame();
  try {
    appState.standardMode.state = await requestStandardApi(config.standardGame.api.guessPath, {
      method: "POST",
      body: {
        [config.standardGame.input.name]: parsedGuess
      }
    });
    elements.standardGuessStatus.textContent = "";
  } catch (error) {
    elements.standardGuessStatus.textContent = await getStandardErrorText(error.code);
  } finally {
    appState.standardMode.loading = false;
    renderStandardGame();
  }
}

async function nextStandardGame() {
  appState.standardMode.loading = true;
  renderStandardGame();
  try {
    appState.standardMode.state = await requestStandardApi(config.standardGame.api.nextPath, {
      method: "POST"
    });
    elements.standardGuessInput.value = "";
    elements.standardGuessStatus.textContent = "";
  } catch (error) {
    elements.standardGuessStatus.textContent = await getStandardErrorText(error.code);
  } finally {
    appState.standardMode.loading = false;
    renderStandardGame();
  }
}

async function restartStandardGame() {
  if (appState.standardMode.loading) {
    return;
  }

  appState.standardMode.loading = true;
  renderStandardGame();
  try {
    appState.standardMode.state = await requestStandardApi(config.standardGame.api.restartPath, {
      method: "POST"
    });
    elements.standardGuessInput.value = "";
    elements.standardGuessStatus.textContent = "";
  } catch (error) {
    elements.standardGuessStatus.textContent = await getStandardErrorText(error.code);
  } finally {
    appState.standardMode.loading = false;
    renderStandardGame();
  }
}

async function requestStandardApi(path, { method, body } = {}) {
  const response = await fetch(path, {
    method,
    cache: "no-store",
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error ?? "state_unavailable");
    error.code = payload.error ?? "state_unavailable";
    throw error;
  }

  return payload;
}

function renderStandardGame() {
  const bundle = localeCache.get(currentLocale());
  if (!bundle) {
    return;
  }

  const state = appState.standardMode.state;
  const isLoading = appState.standardMode.loading;
  const isGameOver = state?.status === "game-over";
  const showLoading = isLoading || !state;
  const loadingText = showLoading
    ? getLocalizedText(bundle, config.standardGame.labels.loadingKey)
    : "";

  elements.standardPlayLayout.hidden = isGameOver;
  elements.standardResultLayout.hidden = !isGameOver;
  elements.standardGameLoadingPanel.hidden = !showLoading;
  elements.standardGameLoading.textContent = loadingText;
  elements.standardRestartButton.disabled = isLoading;

  if (showLoading) {
    elements.standardGameLoadingProgress.setAttribute("aria-valuetext", loadingText);
  } else {
    elements.standardGameLoadingProgress.removeAttribute("aria-valuetext");
  }

  if (!state) {
    elements.standardHealthValue.textContent = "";
    elements.standardScoreValue.textContent = "";
    elements.standardStreakValue.textContent = "";
    elements.standardGuessNumberValue.textContent = "";
    elements.standardGuessButton.textContent = getLocalizedText(bundle, config.standardGame.labels.submitButtonKey);
    elements.standardGuessButton.disabled = true;
    elements.standardGuessInput.disabled = true;
    return;
  }

  elements.standardHealthValue.textContent = state.health.hearts || "0";
  elements.standardScoreValue.textContent = formatNumber(state.score);
  elements.standardStreakValue.textContent = formatNumber(state.streak);
  elements.standardGuessNumberValue.textContent = formatNumber(state.guessNumber);
  elements.standardGuessButton.textContent = getLocalizedText(
    bundle,
    state.result ? config.standardGame.labels.nextButtonKey : config.standardGame.labels.submitButtonKey
  );
  elements.standardGuessButton.disabled = isLoading || isGameOver;
  elements.standardGuessInput.disabled = isLoading || Boolean(state.result) || isGameOver;

  if (!isGameOver && state.current?.video) {
    void attachStandardVideo(state.current.video);
  }

  renderRevealedGame(state, bundle);
  renderStandardResult(state, bundle);
}

function renderRevealedGame(state, bundle) {
  const result = state.result;
  elements.standardRevealedGame.hidden = !result;
  elements.standardWaitingReveal.hidden = Boolean(result);
  elements.standardWaitingReveal.textContent = getLocalizedText(bundle, config.standardGame.labels.waitingRevealKey);

  if (!result) {
    elements.standardGameCover.removeAttribute("src");
    elements.standardGameCoverLink.removeAttribute("href");
    elements.standardGameName.removeAttribute("href");
    elements.standardGameName.textContent = "";
    elements.standardReviewCount.textContent = "";
    elements.standardRoundResult.textContent = "";
    return;
  }

  renderGameIdentity({
    game: result.game,
    cover: elements.standardGameCover,
    coverLink: elements.standardGameCoverLink,
    nameLink: elements.standardGameName,
    reviewCount: elements.standardReviewCount,
    bundle
  });
  const roundStatusText = getLocalizedText(
    bundle,
    result.damaged
      ? config.standardGame.labels.resultDamagedKey
      : config.standardGame.labels.resultCorrectKey
  );
  const errorText = `${getLocalizedText(bundle, config.standardGame.labels.resultErrorPercentKey)}：${formatPercent(result.errorPercent)}`;
  const scoreText = `${getLocalizedText(bundle, config.standardGame.labels.resultScoreKey)}：${formatNumber(result.score ?? 0)}`;
  elements.standardRoundResult.replaceChildren(
    `${roundStatusText} ${errorText}`,
    document.createElement("br"),
    scoreText
  );
}

function renderStandardResult(state, bundle) {
  if (state.status !== "game-over") {
    return;
  }

  detachStandardVideo();
  elements.standardFinalScore.textContent = `${getLocalizedText(bundle, config.standardGame.labels.finalScoreLabelKey)} ${formatNumber(state.score)}`;
  elements.standardFinalStreak.textContent = `${getLocalizedText(bundle, config.standardGame.labels.finalStreakLabelKey)} ${formatNumber(state.finalStreak ?? state.runBestStreak ?? state.streak)}`;

  const notices = [];
  if (state.recordHighlights.highScore) {
    notices.push(getLocalizedText(bundle, config.standardGame.labels.newHighScoreKey));
  }
  if (state.recordHighlights.bestStreak) {
    notices.push(getLocalizedText(bundle, config.standardGame.labels.newBestStreakKey));
  }
  elements.standardRecordNotice.textContent = notices.length > 0
    ? notices.join(" ")
    : getLocalizedText(bundle, config.standardGame.labels.noRecordNoticeKey);

  if (state.lastGame) {
    renderGameIdentity({
      game: state.lastGame,
      cover: elements.standardLastGameCover,
      coverLink: elements.standardLastGameCoverLink,
      nameLink: elements.standardLastGameName,
      reviewCount: elements.standardLastGameReviewCount,
      bundle
    });
  }

  elements.standardResultTitle.focus({ preventScroll: true });
}

function renderGameIdentity({ game, cover, coverLink, nameLink, reviewCount, bundle }) {
  cover.src = game.coverUrl;
  cover.alt = game.name;
  coverLink.href = game.steamUrl;
  coverLink.target = "_blank";
  coverLink.rel = "noreferrer noopener";
  nameLink.href = game.steamUrl;
  nameLink.target = "_blank";
  nameLink.rel = "noreferrer noopener";
  nameLink.textContent = game.name;
  reviewCount.textContent = `${getLocalizedText(bundle, config.standardGame.labels.reviewCountLabelKey)}：${formatNumber(game.reviewCount)}`;
}

async function attachStandardVideo(videoConfig) {
  const sourceKey = JSON.stringify(videoConfig.sources);
  if (elements.standardGameVideo.dataset.sourceKey === sourceKey) {
    setupStandardVideoWindow(videoConfig);
    return;
  }

  detachStandardVideo();
  elements.standardGameVideo.dataset.sourceKey = sourceKey;
  setupStandardVideoWindow(videoConfig);
  if (videoConfig.posterUrl && !config.standardGame.video.hidePrePlayPoster) {
    elements.standardGameVideo.poster = videoConfig.posterUrl;
  } else {
    elements.standardGameVideo.removeAttribute("poster");
  }

  const nativeSource = videoConfig.sources.find((source) => source.kind !== "hls" && elements.standardGameVideo.canPlayType(source.type));
  if (nativeSource) {
    elements.standardGameVideo.src = nativeSource.url;
    elements.standardGameVideo.load();
    return;
  }

  const hlsSource = videoConfig.sources.find((source) => source.kind === "hls");
  if (hlsSource && elements.standardGameVideo.canPlayType("application/vnd.apple.mpegurl")) {
    elements.standardGameVideo.src = hlsSource.url;
    elements.standardGameVideo.load();
    return;
  }

  if (hlsSource) {
    const { default: Hls } = await import("/node_modules/hls.js/dist/hls.mjs");
    if (Hls.isSupported()) {
      hlsInstance = new Hls();
      hlsInstance.loadSource(hlsSource.url);
      hlsInstance.attachMedia(elements.standardGameVideo);
    }
  }
}

function detachStandardVideo() {
  detachStandardVideoTrim();
  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }
  elements.standardGameVideo.removeAttribute("src");
  elements.standardGameVideo.removeAttribute("poster");
  delete elements.standardGameVideo.dataset.sourceKey;
  delete elements.standardGameVideo.dataset.trimStart;
  delete elements.standardGameVideo.dataset.trimEnd;
  elements.standardGameVideo.load();
}

function setupStandardVideoWindow(videoConfig) {
  detachStandardVideoTrim();

  const playback = appState.standardMode.state?.videoPlayback ?? {};
  const trimStartSeconds = normalizePlaybackSeconds(playback.trimStartSeconds);
  const trimEndSeconds = normalizePlaybackSeconds(playback.trimEndSeconds);
  const minimumPlayableSeconds = normalizePlaybackSeconds(playback.minimumPlayableSecondsAfterTrim);
  const video = elements.standardGameVideo;
  let trimEndAt = null;
  let skipRequested = false;

  const applyWindow = () => {
    const metadataDuration = Number.isFinite(video.duration) && video.duration > 0
      ? video.duration
      : null;
    const configuredDuration = Number.isFinite(videoConfig.durationSeconds) && videoConfig.durationSeconds > 0
      ? videoConfig.durationSeconds
      : null;
    const durationSeconds = metadataDuration ?? configuredDuration;

    if (!durationSeconds) {
      if (trimStartSeconds > 0 && video.currentTime < trimStartSeconds) {
        video.currentTime = trimStartSeconds;
      }
      return;
    }

    const trimStartAt = Math.min(trimStartSeconds, durationSeconds);
    const trimEndAtCandidate = Math.max(trimStartAt, durationSeconds - trimEndSeconds);
    const playableSeconds = trimEndAtCandidate - trimStartAt;

    if (playableSeconds < minimumPlayableSeconds) {
      if (!skipRequested) {
        skipRequested = true;
        void skipShortStandardVideo(durationSeconds);
      }
      return;
    }

    trimEndAt = trimEndAtCandidate;
    video.dataset.trimStart = String(trimStartAt);
    video.dataset.trimEnd = String(trimEndAt);

    if (video.currentTime < trimStartAt || video.currentTime >= trimEndAt) {
      video.currentTime = trimStartAt;
    }
  };

  const clampToWindow = () => {
    if (trimEndAt === null) {
      applyWindow();
      return;
    }

    const trimStartAt = Number.parseFloat(video.dataset.trimStart);
    if (!Number.isFinite(trimStartAt)) {
      return;
    }

    if (video.currentTime < trimStartAt || video.currentTime >= trimEndAt) {
      video.currentTime = trimStartAt;
    }
  };

  const stopAtTrimEnd = () => {
    if (trimEndAt === null) {
      applyWindow();
      return;
    }

    if (video.currentTime >= trimEndAt - 0.05) {
      video.pause();
      clampToWindow();
    }
  };

  video.addEventListener("loadedmetadata", applyWindow);
  video.addEventListener("durationchange", applyWindow);
  video.addEventListener("seeking", clampToWindow);
  video.addEventListener("timeupdate", stopAtTrimEnd);
  videoTrimController = () => {
    video.removeEventListener("loadedmetadata", applyWindow);
    video.removeEventListener("durationchange", applyWindow);
    video.removeEventListener("seeking", clampToWindow);
    video.removeEventListener("timeupdate", stopAtTrimEnd);
  };

  applyWindow();
}

function detachStandardVideoTrim() {
  if (videoTrimController) {
    videoTrimController();
    videoTrimController = null;
  }
}

async function skipShortStandardVideo(durationSeconds) {
  if (shortVideoSkipInProgress || appState.standardMode.loading) {
    return;
  }

  shortVideoSkipInProgress = true;
  appState.standardMode.loading = true;
  renderStandardGame();

  try {
    appState.standardMode.state = await requestStandardApi(config.standardGame.api.skipShortVideoPath, {
      method: "POST",
      body: { durationSeconds }
    });
    elements.standardGuessInput.value = "";
    elements.standardGuessStatus.textContent = "";
  } catch (error) {
    elements.standardGuessStatus.textContent = await getStandardErrorText(error.code);
  } finally {
    shortVideoSkipInProgress = false;
    appState.standardMode.loading = false;
    renderStandardGame();
  }
}

function normalizePlaybackSeconds(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 0;
}

async function getStandardErrorText(errorCode) {
  const bundle = await loadLocale(currentLocale());
  const entry = config.standardGame.errorMessages[errorCode] ?? config.standardGame.errorMessages.state_unavailable;
  return getLocalizedText(bundle, entry.messageKey);
}

function formatNumber(value) {
  return new Intl.NumberFormat(currentLocale()).format(value ?? 0);
}

function formatPercent(value) {
  return `${new Intl.NumberFormat(currentLocale(), {
    maximumFractionDigits: 1
  }).format(value ?? 0)}%`;
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
