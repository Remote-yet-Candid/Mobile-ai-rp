# Mobile AI RP

Android-first、offline-first、BYOK 的开源 AI Roleplay 应用与可复用 TypeScript 核心。Apache-2.0。

目前已有 **v0.1 单角色聊天原型**，不是正式发行产品；Gate 0 遗留真机与安全项独立跟踪。旧测试 APK 已在 HONOR 90 Pro 安装启动，v0.1 的真实 API 与升级使用待验收。应用不需要官方账号或自建服务器，远程 LLM 仍需用户选择的联网 API。

## 本地开发

```sh
node --version                # Node 24 LTS，基线 24.19.0
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm check
pnpm export:android           # Hermes JS bundle，不是 APK
pnpm --filter @mobile-ai-rp/mobile start
```

提交 pnpm-lock.yaml；不同时维护 npm/pnpm 两套锁文件。纯 TS 包可独立构建和在 Node 中测试，无需启动 Expo 或访问 LLM。

```sh
pnpm build:packages
pnpm test
pnpm mock:sse                 # 可选：合成 HTTP SSE 服务；Ctrl-C停止
```

## 架构与状态

- `apps/mobile`：Expo Router 聊天 UI、SecureStore 模型配置、角色导入及独立 SQLite 生产库；`/lab` 保留 FlashList/SQLite 技术探针。
- `packages/rp-core`：纯 TS 单角色 Prompt、固定快照、预算裁剪与检查，不依赖 UI、网络或数据库。
- `packages/rp-provider`：Provider能力与流式事件类型；`provider-openai-compat`：独立网络适配器。
- `packages/storage-contracts`：存储端口；`test-fixtures`：原创合成数据；`rp-card-codecs`：有界 JSON/PNG 数据读取。

[完整设计原文](docs/design/source-v1.0.md) · [Gate 0计划](docs/GATE0_PLAN.md) · [路线图与Issues](docs/ROADMAP.md) · [架构](docs/ARCHITECTURE.md) · [v0.1 验证与手机验收](docs/validation/v01-prototype.md) · [贡献规范](CONTRIBUTING.md)

GitHub任务规格在 `.github/planning.json`。`pnpm planning:publish --dry-run` 预览；GitHub API权限和网络可用后，`pnpm planning:publish` 幂等创建里程碑和Issues，保留已有任务编辑与关闭状态。发布后收据在 `artifacts/planning-published.json`。该命令会写GitHub，不属于安装步骤。

## Android APK

[构建与真机验收](docs/ANDROID_BUILD.md)说明 EAS 绑定、凭据、APK profile、设备记录与回滚。preview 明确生成 APK，production 生成 AAB。本地 ARM64 Release-mode 测试 APK 已编译并通过签名/ABI/内置 Hermes/ZIP/16KiB对齐检查；使用 DEBUG 测试证书。v0.1 / code4 已通过 [Draft 下载页](https://github.com/Remote-yet-Candid/Mobile-ai-rp/releases/tag/untagged-d72eaab4dd3d1d26a550) 交付，需要手机登录有仓库写权限的 GitHub 账户；覆盖安装后配置自己的模型 API 并导入角色卡。EAS 项目/正式签名/云构建仍未验证，本地 Gradle 构建不依赖 Expo Token。

当前安全扫描存在未修复的上游high公告，正式发布门槛保持阻断，详见验证记录。没有密钥或真实聊天数据写入仓库。不要将Key放入EXPO_PUBLIC变量、应用打包配置、日志或备份。

已补[卡片兼容证据](docs/CARD_COMPATIBILITY.md)、[本地Android构建](docs/LOCAL_ANDROID.md)及[HONOR90Pro验收步骤](docs/HONOR90PRO_ACCEPTANCE.md)。158项host测试通过，真实CCv3 PNG读取/提取JSON往返已实测；真机网络/取消/分页/卡片/性能仍待验证。5个里程碑、20个Issues及[草稿PR #21](https://github.com/Remote-yet-Candid/Mobile-ai-rp/pull/21)已创建，Gate0继续保持开放。

code2新增[ADB网络验收与设备冒烟入口](docs/ADB_ACCEPTANCE.md)，用于收流/取消/恢复及设备结果回填；云机软件模拟器未完成开机，不能替代真机结果。
