# Guess Steam Comments

一个 Web 小游戏项目：玩家根据 Steam 游戏信息猜测某款游戏的评论数。

当前阶段已建立仓库结构、协作规范、统一验证入口、Steam OpenID 登录、服务端 session、登出、左上角 Steam 用户名/头像展示和主菜单界面。主菜单先提供“标准模式”入口，第一次点击展开右侧描述区域并让按钮轻微浮动，第二次点击进入标准模式游戏页骨架；不实现实际玩法。

## Commands

```powershell
npm ci
npm run dev
npm run verify
```

`npm run verify` 是本地代理、Codex Actions 和 CI 的统一主验证入口。新增检查时应扩展仓库脚本，而不是在外部环境复制一套命令。

本地预览默认从 `5173` 端口启动；如果端口被占用，开发服务器会自动尝试后续端口，并在终端打印实际地址。

```powershell
http://127.0.0.1:5173
```

Steam 登录使用 OpenID，不需要把 Steam 密码交给本地页面。头像优先通过 `STEAM_WEB_API_KEY` 调用 `GetPlayerSummaries`；未配置该环境变量时，服务端会降级读取公开 Steam Community profile XML。

如果 Windows 当前用户配置了系统代理，开发服务器会自动读取并用于服务端 Steam OpenID 校验请求；也可以通过 `HTTPS_PROXY` 或 `HTTP_PROXY` 环境变量显式指定代理。

## Project Layout

- `data/`：稳定配置、默认资源、测试资源和后续可校验的数据文件。
- `src/shared/`：共享 schema、稳定 ID、localization key 和纯数据解释工具。
- `src/server/`：本地代理、Steam API 适配和服务端 Runner glue。
- `src/client/`：视觉层和输入表达。
- `tests/`：回归、数据校验、服务端和客户端边界测试。
- `scripts/`：仓库级自动化入口。
- `docs/`：设计决策、数据模型、接口说明和迁移记录。

## Repository Rules

开发约束以 `AGENTS.md` 为准。新增系统、规则、UI 配置前，先确定数据结构、字段位置、默认资源、测试资源、版本和兼容策略。
