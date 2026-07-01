# Guess Steam Comments

一个 Web 小游戏项目：玩家根据 Steam 游戏信息猜测某款游戏的评论数。

当前阶段已建立仓库结构、协作规范、统一验证入口，以及介绍页、登录成功状态切换和主菜单界面。主菜单先提供“标准模式”入口，点击后展开右侧描述区域；不实现实际玩法、Steam API、本地代理或真实 Steam 登录。

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
