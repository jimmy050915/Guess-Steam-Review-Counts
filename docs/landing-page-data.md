# Landing Page Data Model

当前介绍、Steam OpenID 登录入口、登录状态切换、账号摘要、登出、主菜单与标准模式页面由数据驱动。客户端读取 `data/ui/landing-page.json`、标准模式 API 和 localization bundle 后渲染页面；服务端读取 `data/game/standard-mode.json` 后执行选游、队列、扣血和持久化记录。

## Stable Objects

- `login-main-menu`：页面 ID、schema 版本、默认语言、支持语言、布局约束、Steam OpenID 登录入口配置、账号摘要配置和主菜单配置。
- `locale bundle`：每种语言一个 JSON 文件，存放长期可见文案。
- `appState`：声明初始屏幕、认证成功屏幕和服务端 cookie session 来源；已登录用户可根据当前路径进入主菜单或标准模式游戏页骨架。
- `auth`：声明 `/auth/steam`、`/auth/steam/callback`、`/api/session`、`/auth/logout` 和账号摘要字段。账号摘要优先显示 `displayName`，SteamID 仅作为稳定身份保留。
- `loginButton`：表达 Steam OpenID 重定向意图、形状、颜色 token 和按压动画 token，不在前端完成认证。
- `mainMenu`：声明模式列表；当前只有 `standard-mode`，第一次点击展开右侧规则/过滤集/记录描述并切换为“再次点击开始游戏”，第二次点击进入 `/game/standard`。
- `standard-game`：标准模式游戏页，声明 `/api/standard/state`、`/api/standard/guess`、`/api/standard/next`、`/api/standard/skip-short-video`、`/api/standard/restart`、输入最小值、页面标签和错误文案 key。
- `standard-mode rules`：稳定规则对象，声明 10 槽队列、3 点血量、最低 50 条评测、超过 200% 误差扣血、需要视频、评论数分桶、候选桶池、视频裁剪、SFW 过滤和 `.cache/standard-mode-store.json` 运行数据位置。
- `standard-mode scoring`：稳定计分对象，声明按误差率升序匹配的分数档。误差不超过 10%、20%、30%、40%、60%、100% 分别获得 100、90、70、50、20、10 分；超过 100% 但不超过扣血阈值获得 1 分；超过扣血阈值不得分。

## Boundaries

- `data/` 存放稳定页面配置和中英文文案。
- `src/shared/` 存放 localization key 收集、标准模式配置校验、分桶、猜测误差计算、计分和扣血判断工具。
- `src/server/` 存放 Steam OpenID、Steam 标准模式候选适配、标准模式 Runner、分桶候选池和持久化 store。
- `src/client/` 只负责视觉层渲染、登录/登出意图表达、账号摘要展示、玩家输入表达和结果展示；扣血、揭晓和记录更新由服务端执行。
- `scripts/serve.mjs` 提供本地静态预览、Steam OpenID 路由、session API、登出和标准模式 API。
- `tests/` 校验页面数据、双语文案、Steam OpenID 配置、头像解析、胶囊登录按钮、主菜单标准模式入口、标准模式页面 DOM、过滤规则、队列补位、计分、扣血、结算和非卡片式布局约束。

本阶段接入 Steam OpenID 登录；头像优先通过 `STEAM_WEB_API_KEY` 调用 Steam Web API，未配置时降级读取公开 Steam Community profile XML。服务端 Steam 请求优先使用 `HTTPS_PROXY` / `HTTP_PROXY`，没有环境变量时会读取 Windows 当前用户代理设置。标准模式必须登录后才能开始；自定义过滤集和已猜游戏清除页面留到后续阶段。
