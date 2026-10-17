# 里程碑与GitHub任务

全部目标源于docs/design/source-v1.0.md；不删减P0/P1/P2。GitHub API当前代理403，以下是待发布规格，**不是已创建的远端Issues**。

机器规格：`.github/planning.json`；预览`pnpm planning:publish --dry-run`，权限/网络生效后执行`pnpm planning:publish`，按plan标记去重且保留用户编辑。

## Gate 0 — 技术风险证明

最小 APK、流式与取消、1000 消息 SQLite/FlashList、真实 CCv3 卡；真机退出条件全部满足才进入 Gate 1。

| 计划ID | Issue                                                                       | 本阶段状态                |
| ------ | --------------------------------------------------------------------------- | ------------------------- |
| G0-01  | [G0-01] chore: workspace skeleton + CI                                      | 本次实施/验证；以报告为准 |
| G0-02  | [G0-02] feat(core): typed domain and injected prompt contracts              | 本次实施/验证；以报告为准 |
| G0-03  | [G0-03] feat(provider): OpenAI-compatible streaming transport spike         | 本次实施/验证；以报告为准 |
| G0-04  | [G0-04] feat(mobile): Expo lab with SQLite and FlashList 1000-message probe | 本次实施/验证；以报告为准 |
| G0-05  | [G0-05] feat(codecs): real CCv3 JSON and PNG feasibility                    | 待实施/外部验收           |
| G0-06  | [G0-06] ci(release): EAS preview APK and real Android Gate 0 acceptance     | 待实施/外部验收           |
| G0-07  | [G0-07] security: unblock upstream node-forge and braces high advisories    | 上游阻塞                  |

## Gate 1 — v0.1 内测

Android offline-first / BYOK 单角色聊天、兼容导入导出、最小 Inspector、安全存储、恢复与基础可访问性。

| 计划ID | Issue                                                                                    | 本阶段状态      |
| ------ | ---------------------------------------------------------------------------------------- | --------------- |
| G1-01  | [G1-01] feat(mobile): single-character RP workflow and immutable message versions        | 待实施/外部验收 |
| G1-02  | [G1-02] feat(storage): production migrations, backup and interrupted-generation recovery | 待实施/外部验收 |
| G1-03  | [G1-03] feat(codecs): CCv2/CCv3 JSON and PNG compatibility and safe import               | 待实施/外部验收 |
| G1-04  | [G1-04] feat(security): BYOK SecureStore and endpoint boundaries                         | 待实施/外部验收 |
| G1-05  | [G1-05] feat(core): minimal Prompt Inspector and model-aware budgets                     | 待实施/外部验收 |

## Gate 2 — v0.2 RP 专业版

世界书子集、分支隔离、可溯源事实事件、FTS 中文评估、CHARX/JSONL 迁移。

| 计划ID | Issue                                                                        | 本阶段状态      |
| ------ | ---------------------------------------------------------------------------- | --------------- |
| G2-01  | [G2-01] feat(lorebook): traceable first-stage rules and compatibility matrix | 待实施/外部验收 |
| G2-02  | [G2-02] feat(branches): immutable DAG and branch-local memory isolation      | 待实施/外部验收 |
| G2-03  | [G2-03] feat(memory): canon, observed, inferred and summary provenance       | 待实施/外部验收 |
| G2-04  | [G2-04] feat(search): local FTS and Chinese retrieval evaluation             | 待实施/外部验收 |
| G2-05  | [G2-05] feat(migration): CHARX, SillyTavern JSONL and full Inspector         | 待实施/外部验收 |

## Gate 3 — 评估与公开测试

RP-Consistency 对照实验、设备性能基线、安全回归、可回退 Alpha/Beta APK。

| 计划ID | Issue                                                             | 本阶段状态      |
| ------ | ----------------------------------------------------------------- | --------------- |
| G3-01  | [G3-01] test(eval): RP-Consistency reproducible model comparisons | 待实施/外部验收 |
| G3-02  | [G3-02] release: performance, security and public Alpha/Beta      | 待实施/外部验收 |

## Backlog — v0.3+ 按反馈决策

Provider 扩展、多角色、可选向量、跨平台、受限插件、本地推理和多模态；不作为首发前置。

| 计划ID | Issue                                                                              | 本阶段状态      |
| ------ | ---------------------------------------------------------------------------------- | --------------- |
| P2-01  | [P2-01] research: optional providers, group RP, plugins and cross-platform roadmap | 待实施/外部验收 |

## 原文覆盖与退出顺序

| 原文章节                            | 实施依据/任务                               |
| ----------------------------------- | ------------------------------------------- |
| §0–3 定位/范围/栈                   | PRD、ADR0001；Gate0–3                       |
| §4 核心/Provider/Prompt/预算/世界书 | G0-02/03、G1-05、G2-01                      |
| §5 数据/分支/中文                   | G0-04、G1-02、G2-02/04                      |
| §6 记忆可靠性/评估                  | G2-03、G3-01                                |
| §7 数据兼容与导入安全               | G0-05、G1-03、G2-05                         |
| §8 UX                               | G1-01/05；完整导航/键盘/可访问性未被lab替代 |
| §9 隐私/许可/供应链                 | G1-04、G0-07、THREAT_MODEL、Apache-2.0      |
| §10–11 性能/测试                    | G0-06、G3-01/02、BENCHMARKS                 |
| §12–15 仓库/CI/gates/管理           | G0-01/06、CI、AGENTS、GATE0_PLAN            |
| §16 最终方向/P2                     | G3-02、P2-01，按证据和反馈决策              |

Gate0退出前不开展完整Gate1功能；G1需要两后端、30轮对话、杀进程恢复和20轮异常回归；G2需要规则golden、跨分支隔离及1k/5k基线；G3需要可复现评估/失败案例/可回退APK。首个PR只交付foundation与风险spike，未完成的Issue保持打开。

后续进展：G0-05的host实物PNG读取/提取JSON往返完成，native文件选择入口编译通过；G0-03的expo/fetch入口已接入但设备未验。G0-06已准备SDK/JDK17并跑原生任务，现被官方AAR域名403阻塞。详情见validation/gate0-followup.md，远端任务仍未创建。
