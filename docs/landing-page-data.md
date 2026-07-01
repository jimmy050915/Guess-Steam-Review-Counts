# Landing Page Data Model

当前介绍、登录状态切换与主菜单由 `data/ui/landing-page.json` 驱动，客户端只读取配置和 localization bundle 后渲染页面。

## Stable Objects

- `login-main-menu`：页面 ID、schema 版本、默认语言、支持语言、布局约束、登录入口配置和主菜单配置。
- `locale bundle`：每种语言一个 JSON 文件，存放长期可见文案。
- `appState`：声明初始屏幕、认证成功屏幕、会话状态存储名称和已认证值。
- `loginButton`：表达登录意图、形状、颜色 token、按压动画 token 和本地成功跳转目标，不执行真实 Steam 登录。
- `mainMenu`：声明模式列表；当前只有 `standard-mode`，点击后展开的描述区域是显式空内容占位。

## Boundaries

- `data/` 存放稳定页面配置和中英文文案。
- `src/shared/` 存放 localization key 收集和配置校验工具。
- `src/client/` 只负责视觉层渲染、登录意图表达和展示状态切换。
- `scripts/serve.mjs` 只提供本地静态预览。
- `tests/` 校验页面数据、双语文案、胶囊登录按钮、主菜单标准模式入口和非卡片式布局约束。

本阶段不接入 Steam API、本地代理、真实 OAuth 或玩法流程。
