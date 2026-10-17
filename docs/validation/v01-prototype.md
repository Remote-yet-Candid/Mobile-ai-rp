# v0.1 单角色聊天原型：实际验证记录

2026-10-17。基于 PR #21 的 `feat/gate0-foundation` 提交 `9fb701523f37151ae0d1962845fc8a3ef2712b68`，独立分支 `feat/v01-roleplay-prototype`，叠加 PR 的 base 为该 Gate0 分支；不直接推 main、不合并。作者明确授权 Gate0 未完成项独立跟踪、并行推进 Gate1。本轮只交付一份集成测试 APK。

## 已实现范围

- 导入现有有界 V2/V3 JSON/PNG 解析结果，持久保存完整角色文档和未知字段；选择角色、查看设定、创建/重开聊天。生成预设只读识别，不当角色卡执行。
- 设置 HTTPS OpenAI-compatible Base URL、模型、上下文/输出预算和温度；SecureStore 存 Key，SQL 仅存白名单配置。切换 endpoint 清除旧凭据，拒绝凭据 URL、query/fragment 和重定向。
- `expo/fetch` 实际流式 Chat Completions，发送、停止、错误提示、重试、重新生成和成功候选切换；Markdown 基础文本显示、键盘避让和跟随滚动。
- 独立生产 SQLite v1，角色修订、消息 DAG、生成尝试、事务迁移；失败/取消不替换旧回复，重开恢复 interrupted 状态，拒绝未知 schema，不清库。
- 独立 TS Core 根据角色设定及最近活动路径组装请求，完整轮次预算裁剪、估算提示和本次上下文检查；creator_notes、世界书、扩展不默认注入或执行。

## 实际执行

环境：Node 24.19.0、pnpm 11.25.0、TypeScript 6.0.3、Expo 58、JDK 17.0.20.1；SDK/Gradle 使用现有本地工具链，不依赖 Expo Token。

| 命令                                          | 结果                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`              | 通过，8 workspace；新增唯一运行依赖为 SDK 对齐的 MIT expo-crypto 58.0.7，用于随机 ID                   |
| `pnpm check`                                  | 通过，13 文件 / 158 测试；含格式、lint、敏感文件、边界负例、TypeScript                                 |
| `pnpm export:android`                         | 通过，Hermes bundle 3.3MB；首次因 NodeNext `.js` 指向 TS 源解析失败，增加 Metro 正常优先的源解析后通过 |
| `pnpm audit --audit-level high --prod --json` | **失败 exit 1**，2 high / 1 moderate，未忽略/覆盖或重试掩盖                                            |
| `pnpm cards:external`                         | 通过，551901-byte 外部 CCv3 PNG 校验与 JSON 往返；不复制上游内容进源码或 APK                           |
| `pnpm apk:local --check`                      | 通过，本地 JDK/SDK/代理和 CA 前置可用；不是设备测试                                                    |

Mock 端到端使用实际 Node HTTP SSE + Provider adapter + 生产 SQLite + Core：角色设定进入请求、流式文本、认证失败后重试、不重复用户消息、取消/断流和重新生成保留旧路径、切换成功候选、预算失败不丢输入、数据库关闭重开、超过 2000 条历史边界排除孤立 assistant 并明确提示。敏感凭据使用显式合成值，验证不会进入 SQL 或上下文快照。存储测试另含迁移回滚、跨会话隔离和中断恢复。

日志保存在构建工作区 `artifacts/v01-*.log` / `v01-audit.json`，这些路径不是下载链接。APK 签名、大小、hash、交付与远端 CI 结果在构建后补充。

## 风险与验收边界

Issue #7 的 node-forge / braces high 未解决，正式发布继续阻断；保留独立失败的审计与 fail-closed 发布前置，功能检查不豁免安全评审。已有审计说明不能当成本轮 Android bundle 的全面安全证明。受控测试版使用测试签名。

本轮未实现长期记忆、世界书行为、完整宏系统、插件、资产渲染、聊天编辑、备份恢复或完整分支管理，不删除总体规划。基础 Markdown 不渲染 HTML/远程图片；超过 32768 字符/500 行的单条显示有提示，原文仍保留。消息读取/上下文最近窗口最多 2000 条，更早数据仍在库中。卡片限制保持 JSON 8MiB、文件32MiB及结构保护，超限准确报错，不宣称任意大卡支持。

## 待用户真机验收（HONOR 90 Pro，Android 15 / MagicOS 9.0）

1. 登录有仓库写权限的 GitHub 账户，从最终 Draft 下载 APK，覆盖安装并启动；不要卸载旧版清数据。
2. 导入一张实际 V2/V3 JSON 或 PNG 角色卡；查看角色信息、创建聊天。此前上传的生成预设不是角色卡。
3. 在手机模型设置填写自己服务的 HTTPS Base URL、准确模型名和 Key，保存；**不向聊天或 Issue 发 Key**。
4. 发送消息，确认来自该服务的真实流式回复及角色设定作用；停止、重新请求、断网重试，确认旧回复仍在。
5. 发多轮并打开上下文检查；关闭/强制结束 App 后重开，确认角色、历史与设置保留。
6. 检查键盘弹出、长回复滚动/Markdown；记录有问题的步骤与无敏感信息的错误提示。

以上均未伪装为主机测试通过。自动化没有调用付费服务或真实用户 Key。ADB/模拟器操作本轮未运行，原 Gate0 未完成的性能/网络/卡片证据继续保持未完成。
