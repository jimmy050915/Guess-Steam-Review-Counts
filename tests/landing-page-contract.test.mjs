import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { collectLocalizationKeys, validateLandingPageConfig } from "../src/shared/ui-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("app data declares bilingual login and main menu flow", async () => {
  const config = await readJson("data/ui/landing-page.json");
  const localeBundles = {
    "zh-CN": await readJson("data/localization/zh-CN.json"),
    "en-US": await readJson("data/localization/en-US.json")
  };

  assert.deepEqual(validateLandingPageConfig(config, localeBundles), []);
  assert.equal(config.pageId, "login-main-menu");
  assert.deepEqual(config.supportedLocales, ["zh-CN", "en-US"]);
  assert.equal(config.defaultLocale, "zh-CN");
  assert.equal(config.layout.kind, "login-to-main-menu-flow");
  assert.equal(config.layout.allowsCards, false);
  assert.equal(config.appState.initialScreenId, "login");
  assert.equal(config.appState.authenticatedScreenId, "main-menu");
  assert.equal(config.appState.stateStorageName, "gsc.authState");
  assert.equal(config.loginButton.shape, "capsule");
  assert.equal(config.loginButton.colorToken, "steam-green");
  assert.equal(config.loginButton.pressAnimation, "subtle-press");
  assert.equal(config.loginButton.actionKind, "local-auth-success");
  assert.equal(config.loginButton.successScreenId, "main-menu");
  assert.equal(config.layout.mainMenu.modeListShift, "left-on-mode-click");
  assert.equal(config.layout.mainMenu.descriptionReveal, "slide-from-right-after-click");
  assert.equal(config.mainMenu.modes.length, 1);
  assert.equal(config.mainMenu.modes[0].id, "standard-mode");
  assert.equal(config.mainMenu.modes[0].description.emptyContent, true);
  assert.equal(localeBundles["zh-CN"]["page.title"], "猜猜游戏评测量");
  assert.equal(localeBundles["zh-CN"]["brand.name"], "Guess Steam Review Counts");
  assert.equal(localeBundles["en-US"]["brand.name"], "Guess Steam Review Counts");
  assert.equal(localeBundles["zh-CN"]["landing.heading"], "猜猜游戏评测量");
  assert.equal(localeBundles["en-US"]["landing.heading"], "Guess Game Review Counts on Steam");
  assert.equal(localeBundles["zh-CN"]["landing.login.button"], "登录 Steam 账户");
  assert.equal(localeBundles["zh-CN"]["landing.login.success"], "登录成功");
  assert.equal(localeBundles["zh-CN"]["mainMenu.heading"], "主菜单");
  assert.equal(localeBundles["zh-CN"]["mainMenu.standardMode.button"], "标准模式");
  assert.equal(
    localeBundles["zh-CN"]["landing.intro"],
    "观赏 Steam 上任意一款游戏的宣传片，用你的直觉猜猜这款游戏的评测量。来试试吧！"
  );
  assert.match(localeBundles["en-US"]["landing.intro"], /Steam/);
});

test("client assets avoid framed layouts and preserve the pressed login motion", async () => {
  const html = await readText("src/client/index.html");
  const css = await readText("src/client/styles.css");
  const clientScript = await readText("src/client/main.js");

  assert.doesNotMatch(`${html}\n${css}`, /\bcard\b/i);
  assert.doesNotMatch(html, /brandTagline|data-lines/);
  assert.doesNotMatch(css, /\.eyebrow|\.data-lines|page-shell::after|intro-band::before/);
  assert.doesNotMatch(clientScript, /addEventListener\("mouseenter"/);
  assert.doesNotMatch(clientScript, /addEventListener\("mouseleave"/);
  assert.doesNotMatch(clientScript, /addEventListener\("focusout"/);
  assert.doesNotMatch(css, /:has\(\.mode-button:hover\)/);
  assert.match(html, /href="\/src\/client\/styles\.css"/);
  assert.match(html, /src="\/src\/client\/main\.js"/);
  assert.match(html, /id="mainMenuScreen"/);
  assert.match(html, /id="modeList"/);
  assert.match(html, /class="mode-description"/);
  assert.match(css, /--page-bg:\s*#1B2838/);
  assert.match(css, /body\s*\{[^}]*background:\s*var\(--page-bg\)/s);
  assert.match(css, /\.login-band\s*\{[^}]*background:\s*var\(--page-bg\)/s);
  assert.match(css, /\.login-button\s*\{/);
  assert.match(css, /\.login-button:active\s*\{/);
  assert.match(css, /\.menu-stage\.is-describing \.menu-options\s*\{[^}]*translateX\(-18vw\)/s);
  assert.match(css, /\.mode-description\s*\{[^}]*transform:\s*translateX\(100%\)/s);
  assert.match(css, /\.menu-stage\.is-describing \.mode-description\s*\{[^}]*transform:\s*translateX\(0\)/s);
  assert.match(css, /border-radius:\s*999px/);
  assert.match(css, /--steam-green:/);
});

test("repository policy documents the no framed-layout rule", async () => {
  const agents = await readText("AGENTS.md");
  const verifyScript = await readText("scripts/verify.mjs");

  assert.match(agents, /禁止卡片式布局/);
  assert.match(verifyScript, /禁止卡片式布局/);
});

test("every configured localization key exists in both locale bundles", async () => {
  const config = await readJson("data/ui/landing-page.json");
  const keys = collectLocalizationKeys(config);
  keys.add("page.title");

  for (const locale of config.supportedLocales) {
    const bundle = await readJson(`data/localization/${locale}.json`);
    for (const key of keys) {
      assert.equal(typeof bundle[key], "string", `${locale} missing ${key}`);
      assert.notEqual(bundle[key].length, 0, `${locale} has an empty ${key}`);
    }
  }
});

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}
