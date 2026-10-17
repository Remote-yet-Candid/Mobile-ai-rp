# Mobile AI RP

Android-first、offline-first、BYOK 的开源 AI Roleplay 应用与可复用 TypeScript 核心。Apache-2.0。

目前处于 **Gate 0 技术验证**，不是可发行产品；尚无经真机验收的 APK。应用不需要官方账号或自建服务器，远程 LLM 仍需用户选择的联网 API。

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

- `apps/mobile`：Expo Router 验证壳、FlashList v2、native SQLite 适配；独立探针数据，非生产聊天schema。
- `packages/rp-core`：纯 TS 固定快照和预算契约，不依赖 UI、网络或数据库。
- `packages/rp-provider`：Provider能力与流式事件类型；`provider-openai-compat`：独立网络适配器。
- `packages/storage-contracts`：存储端口；`test-fixtures`：原创合成数据；`rp-card-codecs`：有界 JSON/PNG 数据读取。

[完整设计原文](docs/design/source-v1.0.md) · [Gate 0计划](docs/GATE0_PLAN.md) · [路线图与Issues](docs/ROADMAP.md) · [架构](docs/ARCHITECTURE.md) · [最新验证记录](docs/validation/gate0-followup.md) · [贡献规范](CONTRIBUTING.md)

GitHub任务规格在 `.github/planning.json`。`pnpm planning:publish --dry-run` 预览；GitHub API权限和网络可用后，`pnpm planning:publish` 幂等创建里程碑和Issues，保留已有任务编辑与关闭状态。发布后收据在 `artifacts/planning-published.json`。该命令会写GitHub，不属于安装步骤。

## Android APK

[构建与真机验收](docs/ANDROID_BUILD.md)说明 EAS 绑定、凭据、APK profile、设备记录与回滚。preview 明确生成 APK，production 生成 AAB。当前没有 Expo project ID、签名或EXPO_TOKEN，不能把配置文件/JS bundle当作构建完成。

当前安全扫描存在未修复的上游high公告，合并门槛保持失败，详见验证记录。没有密钥或真实聊天数据写入仓库。不要将Key放入EXPO_PUBLIC变量、应用打包配置、日志或备份。

本次后续已补[卡片兼容证据](docs/CARD_COMPATIBILITY.md)及[本地Android构建恢复](docs/LOCAL_ANDROID.md)。验证壳的“网络与卡片”入口使用expo/fetch与本地文件选择；83项host测试通过，真实CCv3 PNG读取/提取JSON往返已实测。原生ARM64构建仍被repo.reactnative.dev的代理403阻塞，未生成APK，未验证HONOR90Pro。
