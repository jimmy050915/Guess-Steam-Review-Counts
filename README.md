# Guess Steam Comments

一个 Web 小游戏项目：玩家根据 Steam 游戏信息猜测某款游戏的评论数。

当前阶段已建立仓库结构、协作规范、统一验证入口、Steam OpenID 登录、服务端 session、登出、左上角 Steam 用户名/头像展示、主菜单界面和标准模式游戏页。标准模式会从真实 Steam 数据准备 10 槽队列，玩家根据宣传片猜评测数；本阶段实现输入校验、揭晓、计算猜测误差、按误差率计分、超过 200% 误差扣血、血空结算和历史最佳记录。

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

标准模式候选来自 Steam 公开接口：服务端读取 app details、宣传片和全语言评测总数，只保留游戏、本阶段 SFW 规则允许的条目、至少 50 条评测且有可播放宣传片的候选。候选会按评测数分桶写入 `.cache/standard-candidate-pool.json`，补位时优先从当前目标桶抽取；标准模式按数据化误差档计分，误差不超过 10%、20%、30%、40%、60%、100% 分别获得 100、90、70、50、20、10 分，超过 100% 但不超过扣血阈值获得 1 分；历史最高分、最高连击和已猜过的 appId 写入 `.cache/standard-mode-store.json`，该目录不会进入版本控制。宣传片播放会裁掉前后各 10 秒，若已知时长裁剪后不足 10 秒则跳过该候选。

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
