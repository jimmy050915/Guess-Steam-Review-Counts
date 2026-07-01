import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { collectLocalizationKeys, validateLandingPageConfig } from "../src/shared/ui-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("landing page data declares bilingual intro and capsule Steam login", async () => {
  const config = await readJson("data/ui/landing-page.json");
  const localeBundles = {
    "zh-CN": await readJson("data/localization/zh-CN.json"),
    "en-US": await readJson("data/localization/en-US.json")
  };

  assert.deepEqual(validateLandingPageConfig(config, localeBundles), []);
  assert.deepEqual(config.supportedLocales, ["zh-CN", "en-US"]);
  assert.equal(config.defaultLocale, "zh-CN");
  assert.equal(config.layout.allowsCards, false);
  assert.equal(config.loginButton.shape, "capsule");
  assert.equal(config.loginButton.colorToken, "steam-green");
  assert.equal(config.loginButton.pressAnimation, "subtle-press");
  assert.equal(localeBundles["zh-CN"]["page.title"], "猜猜游戏评测量");
  assert.equal(localeBundles["zh-CN"]["brand.name"], "Guess Steam Review Counts");
  assert.equal(localeBundles["en-US"]["brand.name"], "Guess Steam Review Counts");
  assert.equal(localeBundles["zh-CN"]["landing.heading"], "猜猜游戏评测量");
  assert.equal(localeBundles["en-US"]["landing.heading"], "Guess Game Review Counts on Steam");
  assert.equal(localeBundles["zh-CN"]["landing.login.button"], "登录 Steam 账户");
  assert.equal(
    localeBundles["zh-CN"]["landing.intro"],
    "观赏 Steam 上任意一款游戏的宣传片，用你的直觉猜猜这款游戏的评测量。来试试吧！"
  );
  assert.match(localeBundles["en-US"]["landing.intro"], /Steam/);
});

test("client assets avoid framed layouts and preserve the pressed login motion", async () => {
  const html = await readText("src/client/index.html");
  const css = await readText("src/client/styles.css");

  assert.doesNotMatch(`${html}\n${css}`, /\bcard\b/i);
  assert.doesNotMatch(html, /brandTagline|data-lines/);
  assert.doesNotMatch(css, /\.eyebrow|\.data-lines|page-shell::after|intro-band::before/);
  assert.match(html, /href="\/src\/client\/styles\.css"/);
  assert.match(html, /src="\/src\/client\/main\.js"/);
  assert.match(css, /--page-bg:\s*#1B2838/);
  assert.match(css, /body\s*\{[^}]*background:\s*var\(--page-bg\)/s);
  assert.match(css, /\.intro-band\s*\{[^}]*background:\s*var\(--page-bg\)/s);
  assert.match(css, /\.login-button\s*\{/);
  assert.match(css, /\.login-button:active\s*\{/);
  assert.match(css, /border-radius:\s*999px/);
  assert.match(css, /--steam-green:/);
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
