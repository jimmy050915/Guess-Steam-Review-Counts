# Landing Page Data Model

当前介绍与登录页由 `data/ui/landing-page.json` 驱动，客户端只读取配置和 localization bundle 后渲染页面。

## Stable Objects

- `landing-page`：页面 ID、schema 版本、默认语言、支持语言、布局约束和登录入口配置。
- `locale bundle`：每种语言一个 JSON 文件，存放长期可见文案。
- `loginButton`：只表达登录意图、形状、颜色 token 和按压动画 token，不执行真实 Steam 登录。

## Boundaries

- `data/` 存放稳定页面配置和中英文文案。
- `src/shared/` 存放 localization key 收集和配置校验工具。
- `src/client/` 只负责视觉层渲染与输入表达。
- `scripts/serve.mjs` 只提供本地静态预览。
- `tests/` 校验页面数据、双语文案、胶囊登录按钮和非卡片布局约束。

本阶段不接入 Steam API、本地代理、真实 OAuth 或玩法流程。
