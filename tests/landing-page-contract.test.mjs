import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { collectLocalizationKeys, validateLandingPageConfig } from "../src/shared/ui-contract.mjs";
import {
  normalizeProxyUrl,
  resolveProxyUrl,
  selectWindowsProxyServer
} from "../src/server/http-client.mjs";
import {
  buildCheckAuthenticationParams,
  buildSteamLoginUrl,
  extractSteamIdFromClaimedId,
  OPENID_NS,
  parseOpenIdVerification,
  parseSteamProfileXml,
  STEAM_OPENID_ENDPOINT
} from "../src/server/steam-openid.mjs";

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
  assert.equal(config.standardGame.layout.allowsCards, false);
  assert.equal(config.standardGame.video.hidePrePlayPoster, true);
  assert.equal(config.appState.initialScreenId, "login");
  assert.equal(config.appState.authenticatedScreenId, "main-menu");
  assert.equal(config.appState.sessionSource, "server-cookie");
  assert.equal(config.layout.screens.find((screen) => screen.id === "standard-game").routePath, "/game/standard");
  assert.equal(config.layout.screens.find((screen) => screen.id === "guessed-games").routePath, "/history/guessed");
  assert.equal(config.standardGame.api.statePath, "/api/standard/state");
  assert.equal(config.standardGame.api.guessPath, "/api/standard/guess");
  assert.equal(config.standardGame.api.nextPath, "/api/standard/next");
  assert.equal(config.standardGame.api.skipShortVideoPath, "/api/standard/skip-short-video");
  assert.equal(config.standardGame.api.restartPath, "/api/standard/restart");
  assert.equal(config.guessedGames.api.listPath, "/api/standard/guessed-games");
  assert.equal(config.guessedGames.api.clearPath, "/api/standard/guessed-games/clear");
  assert.equal(config.guessedGames.layout.kind, "paged-history-list");
  assert.equal(config.guessedGames.layout.allowsCards, false);
  assert.equal(config.standardGame.input.min, 50);
  assert.equal(config.auth.provider, "steam-openid");
  assert.equal(config.auth.loginPath, "/auth/steam");
  assert.equal(config.auth.callbackPath, "/auth/steam/callback");
  assert.equal(config.auth.sessionPath, "/api/session");
  assert.equal(config.auth.logoutPath, "/auth/logout");
  assert.deepEqual(config.auth.profileFields, ["displayName", "steamId", "avatarUrl"]);
  assert.equal(config.loginButton.shape, "capsule");
  assert.equal(config.loginButton.colorToken, "steam-green");
  assert.equal(config.loginButton.pressAnimation, "subtle-press");
  assert.equal(config.loginButton.actionKind, "steam-openid-redirect");
  assert.equal(config.layout.mainMenu.modeListShift, "left-on-mode-click");
  assert.equal(config.layout.mainMenu.descriptionReveal, "slide-from-right-after-click");
  assert.equal(config.layout.mainMenu.descriptionContent, "mode-rules-and-records");
  assert.deepEqual(config.layout.screenTransition, {
    kind: "fade",
    durationMs: 160,
    reducedMotion: "none"
  });
  assert.deepEqual(config.mainMenu.navigation.map((item) => [item.id, item.path]), [
    ["guessed-games", "/history/guessed"]
  ]);
  assert.equal(config.mainMenu.modes.length, 1);
  const standardMode = config.mainMenu.modes[0];
  assert.equal(standardMode.id, "standard-mode");
  assert.equal(standardMode.activeLabelKey, "mainMenu.standardMode.readyButton");
  assert.equal(standardMode.startPath, "/game/standard");
  assert.equal(standardMode.activeAnimation, "subtle-float");
  assert.equal(standardMode.description.layout, "mode-rules-and-records");
  assert.deepEqual(
    standardMode.description.sections.map((section) => section.id),
    ["rules", "filters"]
  );
  assert.deepEqual(
    standardMode.description.sections.find((section) => section.id === "filters").listItemKeys,
    [
      "mainMenu.standardMode.filters.item.gameOnly",
      "mainMenu.standardMode.filters.item.sfw",
      "mainMenu.standardMode.filters.item.minReviews"
    ]
  );
  assert.deepEqual(
    standardMode.description.records.map((record) => record.id),
    ["high-score", "best-combo"]
  );
  assert.equal(localeBundles["zh-CN"]["page.title"], "猜猜游戏评测量");
  assert.equal(localeBundles["zh-CN"]["brand.name"], "Guess Steam Review Counts");
  assert.equal(localeBundles["en-US"]["brand.name"], "Guess Steam Review Counts");
  assert.equal(localeBundles["zh-CN"]["landing.heading"], "猜猜游戏评测量");
  assert.equal(localeBundles["en-US"]["landing.heading"], "Guess Game Review Counts on Steam");
  assert.equal(localeBundles["zh-CN"]["landing.login.button"], "登录 Steam 账户");
  assert.equal(localeBundles["zh-CN"]["landing.login.success"], "登录成功");
  assert.equal(localeBundles["zh-CN"]["account.summaryLabel"], "已登录 Steam 用户");
  assert.equal(localeBundles["zh-CN"]["account.logout.button"], "登出");
  assert.equal(localeBundles["zh-CN"]["mainMenu.heading"], "主菜单");
  assert.equal(localeBundles["zh-CN"]["mainMenu.standardMode.button"], "标准模式");
  assert.equal(localeBundles["zh-CN"]["mainMenu.standardMode.readyButton"], "再次点击开始游戏");
  assert.equal(localeBundles["zh-CN"]["mainMenu.guessedGames.button"], "猜过的游戏");
  assert.equal(localeBundles["zh-CN"]["mainMenu.standardMode.description.heading"], "标准模式");
  assert.equal(localeBundles["zh-CN"]["mainMenu.standardMode.description.body"], "三条生命，按误差率获得100到1分，猜测误差超过200%则损失生命。");
  assert.equal(localeBundles["zh-CN"]["mainMenu.standardMode.filters.heading"], "标准过滤集");
  assert.equal(localeBundles["zh-CN"]["mainMenu.standardMode.filters.item.gameOnly"], "只选取游戏，不选取DLC等其他内容。");
  assert.equal(localeBundles["zh-CN"]["mainMenu.standardMode.filters.item.sfw"], "排除需要年龄认证以及带有 Adult Only 标签的游戏。");
  assert.equal(localeBundles["zh-CN"]["mainMenu.standardMode.filters.item.minReviews"], "选择的游戏至少有50条评论。");
  assert.equal(localeBundles["zh-CN"]["mainMenu.standardMode.records.highScore"], "最高分：");
  assert.equal(localeBundles["zh-CN"]["mainMenu.standardMode.records.bestCombo"], "最高连击数：");
  assert.equal(localeBundles["zh-CN"]["game.standard.heading"], "标准模式");
  assert.equal(localeBundles["zh-CN"]["game.standard.submit"], "提交");
  assert.equal(localeBundles["zh-CN"]["game.standard.next"], "下一款游戏");
  assert.equal(localeBundles["zh-CN"]["game.standard.restart"], "重新开始");
  assert.equal(localeBundles["zh-CN"]["game.standard.result.errorPercent"], "猜测误差");
  assert.equal(localeBundles["zh-CN"]["game.standard.result.score"], "本轮得分");
  assert.equal(localeBundles["zh-CN"]["game.standard.gameOver"], "游戏结束");
  assert.equal(localeBundles["zh-CN"]["game.standard.noRecordNotice"], "暂无");
  assert.equal(localeBundles["zh-CN"]["history.guessed.heading"], "猜过的游戏");
  assert.equal(localeBundles["zh-CN"]["history.guessed.clear"], "清空历史记录");
  assert.equal(localeBundles["zh-CN"]["history.guessed.pageStatus"], "第 {page} / {totalPages} 页");
  assert.equal(localeBundles["en-US"]["mainMenu.standardMode.readyButton"], "Click again to start");
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
  const serverScript = await readText("scripts/serve.mjs");

  assert.doesNotMatch(`${html}\n${css}`, /\bcard\b/i);
  assert.doesNotMatch(html, /brandTagline|data-lines/);
  assert.doesNotMatch(css, /\.eyebrow|\.data-lines|page-shell::after|intro-band::before/);
  assert.doesNotMatch(clientScript, /addEventListener\("mouseenter"/);
  assert.doesNotMatch(clientScript, /addEventListener\("mouseleave"/);
  assert.doesNotMatch(clientScript, /addEventListener\("focusout"/);
  assert.doesNotMatch(css, /:has\(\.mode-button:hover\)/);
  assert.doesNotMatch(clientScript, /sessionStorage|local-auth-success/);
  assert.match(clientScript, /window\.location\.assign\(config\.auth\.loginPath\)/);
  assert.match(clientScript, /window\.location\.assign\(config\.auth\.logoutPath\)/);
  assert.match(clientScript, /fetch\(config\.auth\.sessionPath/);
  assert.match(clientScript, /fetch\(path,\s*\{/);
  assert.match(clientScript, /config\.standardGame\.api\.statePath/);
  assert.match(clientScript, /config\.standardGame\.api\.guessPath/);
  assert.match(clientScript, /config\.standardGame\.api\.nextPath/);
  assert.match(clientScript, /config\.standardGame\.api\.skipShortVideoPath/);
  assert.match(clientScript, /config\.standardGame\.api\.restartPath/);
  assert.match(clientScript, /config\.guessedGames\.api\.listPath/);
  assert.match(clientScript, /config\.guessedGames\.api\.clearPath/);
  assert.match(clientScript, /loadGuessedGames\(1\)/);
  assert.match(clientScript, /clearGuessedGamesHistory/);
  assert.match(clientScript, /showModal/);
  assert.match(clientScript, /result\.errorPercent/);
  assert.match(clientScript, /formatPercent\(result\.errorPercent\)/);
  assert.match(clientScript, /result\.score/);
  assert.match(clientScript, /document\.createElement\("br"\)/);
  assert.match(clientScript, /standardGuessInput\.addEventListener\("wheel", preventFocusedNumberWheel, \{ passive: false \}\)/);
  assert.match(clientScript, /event\.preventDefault\(\)/);
  assert.match(clientScript, /screenTransitionConfig/);
  assert.match(clientScript, /body\.classList\.add\("is-screen-fading"\)/);
  assert.match(clientScript, /hidePrePlayPoster/);
  assert.match(clientScript, /videoConfig\.posterUrl && !config\.standardGame\.video\.hidePrePlayPoster/);
  assert.match(clientScript, /node_modules\/hls\.js\/dist\/hls\.mjs/);
  assert.match(clientScript, /handleModeClick\(mode\)/);
  assert.match(clientScript, /window\.location\.assign\(mode\.startPath\)/);
  assert.match(clientScript, /renderModeDescription\(mode,\s*bundle\)/);
  assert.match(clientScript, /mode-description-records/);
  assert.match(clientScript, /resolveAuthenticatedScreenId\(\)/);
  assert.match(clientScript, /event\.target\.closest\("\.mode-button"\)/);
  assert.match(clientScript, /setActiveMode\(null\)/);
  assert.match(serverScript, /new Set\(\["\/", "\/game\/standard", "\/history\/guessed"\]\)/);
  assert.match(serverScript, /\/api\/standard\/state/);
  assert.match(serverScript, /\/api\/standard\/skip-short-video/);
  assert.match(serverScript, /\/api\/standard\/guessed-games/);
  assert.match(serverScript, /standardModeRunner\.listGuessedGames/);
  assert.match(serverScript, /standardModeRunner\.clearHistory/);
  assert.match(serverScript, /standardModeRunner\.guess/);
  assert.match(html, /href="\/src\/client\/styles\.css"/);
  assert.match(html, /src="\/src\/client\/main\.js"/);
  assert.match(html, /id="accountSummary"/);
  assert.match(html, /id="accountAvatar"/);
  assert.match(html, /id="accountSteamId"/);
  assert.match(html, /id="logoutButton"/);
  assert.match(html, /id="mainMenuScreen"/);
  assert.match(html, /id="menuNavigation"/);
  assert.match(html, /id="guessedGamesScreen"/);
  assert.match(html, /id="guessedGamesTitle"/);
  assert.match(html, /id="guessedGamesList"/);
  assert.match(html, /id="guessedGamesPreviousButton"/);
  assert.match(html, /id="guessedGamesNextButton"/);
  assert.match(html, /id="guessedGamesClearButton"/);
  assert.match(html, /id="guessedGamesClearDialog"/);
  assert.match(html, /id="guessedGamesClearConfirmButton"/);
  assert.match(html, /id="standardGameScreen"/);
  assert.match(html, /id="standardGameTitle"/);
  assert.match(html, /id="standardGameVideo"/);
  assert.match(html, /id="standardGameLoadingPanel"/);
  assert.match(html, /id="standardGameLoadingProgress"/);
  assert.match(html, /id="standardGuessForm"/);
  assert.match(html, /id="standardRevealedGame"/);
  assert.match(html, /id="standardResultLayout"/);
  assert.match(html, /id="standardRestartButton"/);
  assert.match(html, /id="standardReturnMenuButton"/);
  assert.match(html, /rel="noreferrer noopener"/);
  assert.match(html, /id="modeList"/);
  assert.match(html, /class="mode-description"/);
  assert.ok(
    html.indexOf('id="standardGameLoadingPanel"') > html.indexOf('<video class="game-video" id="standardGameVideo"'),
    "standard loading panel must render after the video element"
  );
  assert.match(css, /--page-bg:\s*#1B2838/);
  assert.match(css, /body\s*\{[^}]*background:\s*var\(--page-bg\)/s);
  assert.match(css, /\.login-band\s*\{[^}]*background:\s*var\(--page-bg\)/s);
  assert.match(css, /\.login-button\s*\{/);
  assert.match(css, /\.login-button:active\s*\{/);
  assert.match(css, /--description-width:\s*min\(38vw,\s*520px\)/);
  assert.match(css, /calc\(100vw - var\(--description-width\) - var\(--menu-gap\) - 16vw\)/);
  assert.match(css, /\.menu-stage\.is-describing \.menu-options\s*\{[^}]*transform:\s*translateX\(calc\(\(var\(--description-width\) \+ var\(--menu-gap\)\) \/ -2\)\)/s);
  assert.match(css, /\.mode-description\s*\{[^}]*transform:\s*translateX\(100%\)/s);
  assert.match(css, /\.menu-stage\.is-describing \.mode-description\s*\{[^}]*transform:\s*translateX\(0\)/s);
  assert.match(css, /\.mode-description-layout\s*\{[^}]*justify-content:\s*space-between/s);
  assert.match(css, /\.mode-description-records\s*\{/);
  assert.match(css, /\.menu-navigation\s*\{/);
  assert.match(css, /\.menu-link-button\s*\{/);
  assert.match(css, /\.history-stage\s*\{/);
  assert.match(css, /\.history-list\s*\{/);
  assert.match(css, /\.history-game-link\s*\{/);
  assert.match(css, /\.history-pagination\s*\{/);
  assert.match(css, /\.history-dialog\s*\{/);
  assert.match(css, /\.game-stage\s*\{/);
  assert.match(css, /\.game-play-layout\s*\{/);
  assert.match(css, /\.video-area\s*\{/);
  assert.match(css, /\.game-loading-panel\s*\{/);
  assert.match(css, /\.game-loading-progress\s*\{/);
  assert.match(css, /@keyframes loading-progress-slide/);
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\)/);
  assert.match(css, /body\.is-screen-fading \.page-shell/);
  assert.match(css, /\.game-status-area\s*\{/);
  assert.match(css, /\.game-result-layout\s*\{/);
  assert.match(css, /\.result-actions\s*\{/);
  assert.match(css, /\.mode-button\[data-active-animation="subtle-float"\]\[aria-expanded="true"\]\s*\{[^}]*animation:\s*subtle-button-float/s);
  assert.match(css, /@keyframes subtle-button-float/);
  assert.match(css, /border-radius:\s*999px/);
  assert.match(css, /--steam-green:/);
});

test("steam openid helpers build login and verification payloads", () => {
  const loginUrl = buildSteamLoginUrl({
    returnToUrl: "http://127.0.0.1:5173/auth/steam/callback?state=abc",
    realmUrl: "http://127.0.0.1:5173/"
  });

  assert.equal(loginUrl.origin + loginUrl.pathname, STEAM_OPENID_ENDPOINT);
  assert.equal(loginUrl.searchParams.get("openid.ns"), OPENID_NS);
  assert.equal(loginUrl.searchParams.get("openid.mode"), "checkid_setup");
  assert.equal(loginUrl.searchParams.get("openid.return_to"), "http://127.0.0.1:5173/auth/steam/callback?state=abc");
  assert.equal(loginUrl.searchParams.get("openid.realm"), "http://127.0.0.1:5173/");

  const callbackParams = new URLSearchParams({
    "openid.ns": OPENID_NS,
    "openid.mode": "id_res",
    "openid.claimed_id": "https://steamcommunity.com/openid/id/76561198000000000",
    "openid.identity": "https://steamcommunity.com/openid/id/76561198000000000",
    "ignored": "value"
  });
  const verificationParams = buildCheckAuthenticationParams(callbackParams);

  assert.equal(verificationParams.get("openid.mode"), "check_authentication");
  assert.equal(verificationParams.get("ignored"), null);
  assert.equal(extractSteamIdFromClaimedId(callbackParams.get("openid.claimed_id")), "76561198000000000");
  assert.equal(parseOpenIdVerification("ns:http://specs.openid.net/auth/2.0\nis_valid:true\n"), true);
  assert.equal(parseOpenIdVerification("is_valid:false\n"), false);
});

test("steam profile xml parser extracts avatar for the account summary", () => {
  const profile = parseSteamProfileXml(
    "<profile><steamID><![CDATA[Demo User]]></steamID><avatarFull><![CDATA[https://avatars.steamstatic.com/example_full.jpg]]></avatarFull></profile>",
    "76561198000000000"
  );

  assert.deepEqual(profile, {
    displayName: "Demo User",
    steamId: "76561198000000000",
    avatarUrl: "https://avatars.steamstatic.com/example_full.jpg"
  });
});

test("steam http client resolves Windows proxy settings for server-side verification", () => {
  assert.equal(normalizeProxyUrl("127.0.0.1:7890"), "http://127.0.0.1:7890");
  assert.equal(
    selectWindowsProxyServer("http=127.0.0.1:7890;https=127.0.0.1:7891"),
    "127.0.0.1:7891"
  );
  assert.equal(
    resolveProxyUrl({
      env: {},
      platform: "win32",
      execFileSyncImpl: (_command, args) => {
        const valueName = args.at(-1);
        if (valueName === "ProxyEnable") {
          return "ProxyEnable    REG_DWORD    0x1";
        }
        return "ProxyServer    REG_SZ    127.0.0.1:7890";
      }
    }),
    "http://127.0.0.1:7890"
  );
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
