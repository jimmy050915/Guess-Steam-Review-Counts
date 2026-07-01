import { getLocalizedText } from "../shared/ui-contract.mjs";

const config = await readJson("/data/ui/landing-page.json");
const localeCache = new Map();

const elements = {
  brandName: document.querySelector("#brandName"),
  introText: document.querySelector("#introText"),
  languageSwitch: document.querySelector("#languageSwitch"),
  loginButton: document.querySelector("#loginButton"),
  loginButtonText: document.querySelector("#loginButtonText"),
  loginStatus: document.querySelector("#loginStatus"),
  pageTitle: document.querySelector("#pageTitle")
};

const urlLocale = new URLSearchParams(window.location.search).get("lang");
const storedLocale = window.localStorage.getItem("gsc.locale");
const initialLocale = normalizeLocale(urlLocale ?? storedLocale ?? config.defaultLocale);

renderLanguageButtons();
await applyLocale(initialLocale);

elements.loginButton.addEventListener("click", async () => {
  const bundle = await loadLocale(currentLocale());
  elements.loginStatus.textContent = getLocalizedText(bundle, config.loginButton.actionKind === "auth-intent-placeholder"
    ? "landing.login.pending"
    : config.layout.sections.find((section) => section.id === "login").pendingStatusKey);
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
  const introSection = config.layout.sections.find((section) => section.id === "intro");
  const loginSection = config.layout.sections.find((section) => section.id === "login");

  document.documentElement.lang = nextLocale;
  document.title = getLocalizedText(bundle, "page.title");
  elements.brandName.textContent = getLocalizedText(bundle, config.brand.nameKey);
  elements.brandName.setAttribute("aria-label", getLocalizedText(bundle, config.brand.nameKey));
  elements.pageTitle.textContent = getLocalizedText(bundle, introSection.headingKey);
  elements.introText.textContent = getLocalizedText(bundle, introSection.bodyKey);
  elements.loginButtonText.textContent = getLocalizedText(bundle, loginSection.buttonKey);
  elements.languageSwitch.setAttribute("aria-label", getLocalizedText(bundle, config.languageToggle.labelKey));

  for (const button of elements.languageSwitch.querySelectorAll("button")) {
    const isActive = button.dataset.locale === nextLocale;
    button.setAttribute("aria-pressed", String(isActive));
    button.textContent = getLocalizedText(bundle, button.dataset.labelKey);
  }

  elements.loginStatus.textContent = "";
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
