# Landing Page Data Model

当前介绍、Steam OpenID 登录入口、登录状态切换、账号摘要、登出与主菜单由 `data/ui/landing-page.json` 驱动，客户端只读取配置、session API 和 localization bundle 后渲染页面。

## Stable Objects

- `login-main-menu`：页面 ID、schema 版本、默认语言、支持语言、布局约束、Steam OpenID 登录入口配置、账号摘要配置和主菜单配置。
- `locale bundle`：每种语言一个 JSON 文件，存放长期可见文案。
- `appState`：声明初始屏幕、认证成功屏幕和服务端 cookie session 来源；已登录用户可根据当前路径进入主菜单或标准模式游戏页骨架。
- `auth`：声明 `/auth/steam`、`/auth/steam/callback`、`/api/session`、`/auth/logout` 和账号摘要字段。账号摘要优先显示 `displayName`，SteamID 仅作为稳定身份保留。
- `loginButton`：表达 Steam OpenID 重定向意图、形状、颜色 token 和按压动画 token，不在前端完成认证。
- `mainMenu`：声明模式列表；当前只有 `standard-mode`，第一次点击展开右侧规则/过滤集/记录描述并切换为“再次点击开始游戏”，第二次点击进入 `/game/standard`。
- `standard-game`：标准模式游戏页骨架，当前只声明路由和标题，不承载实际玩法规则。

## Boundaries

- `data/` 存放稳定页面配置和中英文文案。
- `src/shared/` 存放 localization key 收集和配置校验工具。
- `src/server/` 存放 Steam OpenID URL 构造、回调校验、SteamID 解析和头像资料解析。
- `src/client/` 只负责视觉层渲染、登录/登出意图表达、账号摘要展示和展示状态切换。
- `scripts/serve.mjs` 提供本地静态预览、Steam OpenID 路由、session API 和登出。
- `tests/` 校验页面数据、双语文案、Steam OpenID 配置、头像解析、胶囊登录按钮、主菜单标准模式入口、二次点击开始路径、右侧描述内容、轻微浮动动效和非卡片式布局约束。

本阶段接入 Steam OpenID 登录；头像优先通过 `STEAM_WEB_API_KEY` 调用 Steam Web API，未配置时降级读取公开 Steam Community profile XML。服务端 Steam 请求优先使用 `HTTPS_PROXY` / `HTTP_PROXY`，没有环境变量时会读取 Windows 当前用户代理设置。当前只实现标准模式游戏页跳转骨架，不实现实际玩法流程。
