# 移动端 AI Roleplay 开源框架：技术预研与设计方案（v1.0）

**日期**：2026-10-17  
**状态**：技术方案 / 未实施 / 未完成性能基准验证  
**目标平台**：Android 优先，未来扩展 iOS/Web/Desktop  
**构建方式**：GitHub + Codex Cloud + Expo EAS Build  
**暂用项目名**：RP Core（非最终商标）

> 关键定位：打造一个移动端优先、离线数据优先、角色扮演专用、可解释且可扩展的聊天系统。使用 RN/Expo 提供 Android 客户端，以纯 TypeScript 包提供可独立运行及测试的 RP Core。不是仅重做 SillyTavern 的前端，也不是立刻开发庞大插件平台。

## 0. 执行摘要与关键决策

1. **不以“原生角色聊天”作为唯一差异化功能**：SillyTavern、RisuAI、ChatterUI、Agnai 等已有丰富实现。差异化应集中在长对话流畅度、可解释上下文、事实溯源和数据可迁移性。
2. **v0.1 不设自建后端**：手机直接访问用户选择的兼容 API；对确实需要服务端鉴权、跨域代理或集中托管的功能以后再加可选服务。没有官方服务器，并不等于应用可在完全断网的情况下调用远程 LLM。
3. **纯 TS 核心独立于 UI、网络和数据库驱动**：核心采用接口注入，编排流程可在 Node.js 中进行单元测试。App 层负责 SQLite、KeyStore、安全导入、网络。
4. **最小可用版本严格收敛**：API、角色卡、独立角色聊天、流式返回、聊天存储、编辑、重新生成与可导出数据优先；高级 lorebook、记忆和插件按阶段演进。
5. **通过兼容测试而不是口头承诺宣布兼容**：Character Card V2/V3、PNG/JSON/CHARX、SillyTavern 世界书与 JSONL 分别有格式和行为层面的要求；逐一记录支持等级。
6. **不承诺天然比现有应用快**：设计方案只是技术假说。必须使用相同内容和设备进行 A/B 性能测试，发布可重复的基准脚本和环境说明。

## 1. 竞品与现有生态

| 产品 | 主要优势 | 局限/权衡 | 对新项目的启示 |
|---|---|---|---|
| SillyTavern | 提示词管理、世界书、角色卡、脚本与扩展、模型支持非常成熟；活跃维护 | Node 服务端 + Web 客户端，移动端使用和部署相较纯 APK 有摩擦；高度可配置也带来复杂度 | **不要低估规则兼容成本**；可参考公开行为/规范，独立实现内核 |
| RisuAI | 跨平台 RP、情绪图、群聊、lorebook、正则、插件、主题 | 产品定位与我们高度重叠 | 必须明确新项目不同于“另一款可玩的酒馆” |
| ChatterUI | 真正 Android 原生客户端、V2 卡、远程模型、设备 llama.cpp/GGUF | 侧重移动聊天，深入的上下文可解释性与叙事事实体系需具体比较 | 移动端角色聊天不是空白市场；本地模型是后续可选路径 |
| Agnai | 多角色、多模型、自托管和多用户 | 偏 Web/服务端的架构 | 不必 v0.1 建账号系统或同步服务器 |
| Chatbox | 清爽通用聊天 UI，易上手 | 深度 RP 工作流不是唯一目标 | UI 学其简洁而不复制品牌或资产 |

**注意**：表中“局限”主要是产品取舍而非经统一基准确认的性能事实。不能将特定 Bug 或单人报告推广为普遍结论。

资料：
- https://github.com/SillyTavern/SillyTavern
- https://docs.sillytavern.app/usage/core-concepts/worldinfo/
- https://github.com/kwaroran/RisuAI
- https://github.com/Vali-98/ChatterUI
- https://github.com/agnaistic/agnai

## 2. 用户画像、场景和边界

### 核心用户

- 有自己的 API / OpenAI-compatible 接口、需要本地保存数据的独立 RP 用户。
- 长篇叙事创作者：数百至数千消息，多角色，世界书，时间线，重写/分支，经常回查既有事实。
- 角色卡创作者：要求导入、编辑、导出无损、支持未知扩展字段。
- 开源开发者：需要测试文档、稳定接口和可独立使用的上下文引擎。

### v0.1 必须完成（P0）

- Android 安装包（独立 APK），首次打开、升级后保留数据、无账户要求。
- 配置一个或多个 OpenAI-compatible endpoint（base URL、模型、Key、生成参数），连接测试，远程流式对话、取消、错误提示与重试。
- 单角色聊天：本地角色创建、Character Card V2/V3 的 JSON 导入和导出；PNG 卡导入实现优先；替换名字/描述/首句/示例对话/设定。
- 聊天列表：分页、虚拟列表、搜索当前聊天、复制、编辑、重试/重新生成、切换候选回复；记录时间与状态。
- SQLite 持久化、版本化 schema migration；可导出完整应用数据（不含密钥）并恢复。
- 最小 Prompt Inspector：展示分段、优先级、输入 token 估算、最终模型请求预览（默认不持久化）。
- 基本可访问性：系统字体、深色模式、长按菜单、键盘弹出不遮挡输入。
- 完整自动化单元测试与最小集成测试；首个物理 Android 真机 APK 验收。

### v0.2 推荐完成（P1）

- 世界书常量条目、关键词触发、优先级、预算和场景范围；对应 SillyTavern 部分功能的迁移与对照测试。
- 正式对话分支 DAG/树（消息不可变版本及活动路径选择）、跨分支状态隔离。
- 事件/事实/角色关系/阶段状态记录；支持用户确认/拒绝/修正提取结果；来源回链。
- 本地 FTS 检索、时间/角色过滤；先不依赖向量服务。中文 FTS5 分词效果单独验证。
- SillyTavern JSONL 导入与完整性报告；导出保留未知字段。
- Prompt Inspector 完整版：激活原因、预算溢出、模型发送请求摘要、资料来源。
- V3 CHARX（包含资源）支持，中文和多模态资产兼容测试。

### v0.3+（P2，视反馈）

- Provider 扩展：原生 Anthropic、Gemini、OpenRouter 特色能力；文本补全 API、缓存参数、停止词、推理模型约束。
- 多角色群聊与发言控制；局部场景状态和话语轮次控制。
- 可选向量检索/嵌入、混合召回、事实图谱；跨平台 Web/桌面前端。
- 插件 SDK + 权限声明 + 能力沙箱；语音/TTS、图像生成、VN 模式。
- 本地 GGUF 推理作为独立 native module 研究，避免强迫所有用户承受其复杂性。

### v0.1 明确不做

- 不做官方模型转发/付费 API 平台、账号注册和云端数据同步。
- 不做即时聊天社交网络、角色卡商店、任意 JavaScript 插件执行。
- 不做 100% SillyTavern 插件兼容、不做“任何 Provider 都兼容”的承诺。
- 不训练基础 LLM；本项目首先是客户端与上下文编排工程。

## 3. 技术栈选择及 ADR

**选定**：Expo（采用实施时稳定且依赖兼容的 SDK 版本）+ React Native New Architecture + TypeScript + Expo Router + SQLite + SecureStore + FlashList v2 + Vitest/测试框架 + GitHub Actions + EAS Build。

**理由**：一个 TypeScript 团队可同时实现 Android UI 和纯 TS RP Core；手机前端可独立编译和分发；RN 对聊天这样的列表应用已有成熟虚拟化方案；EAS 可远程生成 APK。

**替代方案对照**：
- Kotlin + Jetpack Compose：Android 体验和控制力强，但跨端/核心复用要另选 Rust/KMP；在手机操控 Codex 的快速验证目标下增加工程成本。
- Flutter + Dart：运行性能与 UI 统一性强，但 RP 引擎的 Web/npm 复用与生态适配需要增加桥接；不是错误方案，但当前不优先。
- PWA / Tauri / Capacitor：可快速复用网页生态，但本项目核心假设是 Android 原生体验，故非首选；RisuAI 已展示跨端方案。

**重要前提**：使用 FlashList 仍需要优化消息组件，v2 要求 RN New Architecture。对大文本、Markdown、长消息布局的实际流畅度必须在 release APK 下测试。

文档：
- https://docs.expo.dev/guides/new-architecture/
- https://docs.expo.dev/versions/latest/sdk/sqlite/
- https://docs.expo.dev/versions/latest/sdk/securestore/
- https://shopify.github.io/flash-list/docs/fundamentals/performance/
- https://docs.expo.dev/versions/latest/sdk/expo/ （`expo/fetch` streaming）
- https://docs.expo.dev/build-reference/apk/

## 4. 分层架构与契约

```text
apps/mobile (React Native + Expo)
   │     UI/导航/状态/文件导入/安全存储/真机能力
   ├───────────────┐
   ▼               ▼
packages/rp-core   packages/adapters
   │               ├── provider-openai-compatible
   │               ├── storage-sqlite (App 注入)
   │               ├── token-meter
   │               └── card-codecs (PNG/JSON/CHARX)
   │
   ├── PromptPipeline
   ├── Character/Lorebook/Persona
   ├── ConversationBranch
   ├── MemorySelector (v0.2)
   ├── ContextBudget
   └── Trace/DecisionReport
```

**核心限制**：`rp-core` 不允许 import `react-native`、`expo-*`、SQLite、fetch、系统文件 API；只依赖 TypeScript 类型和可移植纯函数。所有时间、随机数、token 统计、提供商 I/O 均通过接口注入，保证确定性测试。

### 4.1 Provider 能力模型（示意）

```ts
type RPContent = { type: 'text'; text: string };
type RPMessage = {
  id: string;
  role: 'system' | 'developer' | 'user' | 'assistant';
  content: RPContent[];
};
type ProviderCapabilities = {
  streaming: boolean;
  systemRole: boolean;
  toolCalling: boolean;
  contextWindow?: number;
  supportsSeed?: boolean;
};
type RPRequest = {
  model: string;
  messages: RPMessage[];
  generation: { maxOutputTokens: number; temperature?: number };
};
type StreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'usage'; inputTokens?: number; outputTokens?: number }
  | { type: 'completed'; finishReason?: string }
  | { type: 'error'; kind: 'auth'|'rate_limit'|'network'|'timeout'|'provider'|'abort'; message: string };
interface RPProvider {
  capabilities(): Promise<ProviderCapabilities>;
  stream(req: RPRequest, signal: AbortSignal): AsyncIterable<StreamEvent>;
}
```

**注意**：此类型是概念契约，不是已经开发的 SDK。真实 Provider 可能不支持 `developer` 消息、随机种子、system role 或某些采样参数。适配器必须按照 capabilities 变换或拒绝，并在 Inspector 中提示不可兼容。`OpenAI-compatible` 只承诺经过协议测试的公共子集，不能假设所有网关行为完全一致。

### 4.2 Prompt 构建流水线

输入：当前活动对话路径 + 卡的某个固定修订版本 + Persona + Lorebook + 用户配置 + 模型能力。

```text
冻结会话快照
  -> 解析角色设定和人物身份
  -> 载入硬约束/世界规则
  -> 触发 Lorebook（可记录原因）
  -> 召回历史事实和摘要（v0.2）
  -> 组合最近聊天消息
  -> 预算分配、截断策略与失败策略
  -> 安全变量替换（仅允许已声明宏）
  -> 标准 RPRequest
  -> ProviderAdapter 转换
  -> 记录仅用于本次请求的决策轨迹（默认不保存完整 Prompt）
```

关键：**角色卡字段分两类**：供用户看的元数据（creator/tags/notes 等）和参与 Prompt 的文本。不得把 creator_notes 默认作为世界设定输入。未知 `extensions` 字段需要无损存储/导出，但不应默认执行或作为提示词注入。

### 4.3 Token 预算

`可用输入预算 = 模型上下文上限 - 预留输出 - 安全余量`。

建议可配置顺序：系统约束与硬设定 > 会话最新内容 > 角色信息 > 动态世界书 > 较旧历史/摘要（允许用户自定义策略）。

真实 token 统计按 Provider/tokenizer 优先；模型 tokenizer 不可用时给出保守估算和显式警告。**不要用字符数当成统一、准确的 token 数**。对于超预算条目，默认提示并记录剔除理由，不能静默截断关键设定。

### 4.4 世界书引擎两阶段策略

第一阶段：常量 / 指定范围 / 关键词、大小写、优先级、启用状态、扫描深度、预算与去重，所有激活可追踪。

第二阶段：条件键、正则、安全限制、递归、冷却、概率、插入位置、脚本与状态联动。必须将 SillyTavern 每项规则映射到兼容矩阵，并做同样输入是否选中同样条目的黄金样本测试。SillyTavern 现有 World Info 实际功能包含递归、条件、sticky/cooldown、预算、扫描深度等，不能只实现关键词就写“完全兼容”。

## 5. 对话图、版本化与数据层

### 5.1 核心模型

- `characters`: id / current_revision_id / display metadata。
- `character_revisions`: 某一次导入/编辑后的完整卡片快照、版本号、哈希、未知扩展；已进行的对话可保持所用版本。
- `conversations`: id / title / character_id / root_id / active_leaf_id / created_at。
- `message_nodes`: id / conversation_id / parent_id / role / actor_id / text / status / generation_id / created_at；采用不可变节点表示不同编辑与重试结果。
- `message_assets`: 与消息分离的资产记录（本地路径/哈希/类型/大小），避免 SQLite 内大 blob 占用和列表加载。
- `lorebooks`, `lore_entries`: 原文、作用域、条件、启用标志、排序字段。
- `facts`（v0.2）: subject / predicate / object / status / valid_from / valid_to / branch_id / source_node_id / confidence / confirmed_by_user。
- `events`（v0.2）: 叙事时间、事件摘要、涉及角色、来源消息与分支。
- `summaries`（v0.2）: 覆盖的消息范围、输入内容哈希、生成模型、用户修订和是否失效。
- `settings`, `provider_profiles`：普通配置数据库保存，**密钥另存在 SecureStore，只通过 profile ID 引用**。

### 5.2 分支语义

当用户选择“重新生成”时，不覆盖原消息：创建同父节点的兄弟节点并更新该对话的 active leaf。用户编辑旧消息时，创建新版本节点并从那里发展新路径，不能把另一条分支的未来事实带入当前分支的记忆。

需要处理：编辑前中后消息、重试中断、用户切换候选分支、删除节点、导出/导入保留分支、应用异常退出时部分流式消息的恢复。不要在每次分支时复制上千条历史消息。

### 5.3 检索与中文

v0.1 `messages` 普通索引 + LIKE/前缀/简单搜索即可（先确保正确）。v0.2 采用 FTS5 全文检索并显式评估中文：默认 `unicode61` 不能假设汉语分词效果理想；可以尝试内置 `trigram` tokenizer，但对少于三个 Unicode 字符的查询存在限制。必要时使用应用层 n-gram、独立中文分词或后续向量检索。不要将 embedding 变成首发前置条件。

参考：https://www.sqlite.org/fts5.html

## 6. 长期记忆：可靠性优先于“智能感”

### 6.1 四种数据不应混同

1. **作者/用户确认的世界设定（canon）**：最高确定性；建议用户可锁定，不允许模型自动改写。
2. **聊天中已发生的事件（observed）**：绑定具体消息源和分支，可能随着编辑/重试而失效。
3. **从消息抽取的候选事实（inferred）**：标注模型、信心及待确认状态，不能自动等同 canon。
4. **剧情总结（summary）**：可作为检索提示和上下文压缩，但其内容要可回溯并可重新生成。

对于 `同一个人物在第 A 章所在地 X，在第 B 章去了 Y`，不应该简单判为冲突，应建立有生效时间的事件；对于 `已确认某人死亡，后来模型称其仍活着`，需要检测并提示冲突，但保留世界观本来允许复活或平行分支的可能性。

### 6.2 记忆提取建议流程

消息保存 → 生成候选事件/事实 → 去重、时间排序、来源标记 → 与已有 canon/观察事实进行冲突检测 → 用户可查看/接受/纠正 → 写入事实库。检索前按照活动分支、世界、角色、当前场景过滤，后按关键字/关联实体/时间/可选语义检索排序。所有选中条目都显示“来源和理由”。

**避免的错误**：每轮都调用第二个昂贵 LLM 做完整世界总结；把猜测写成事实；摘要叠摘要无限漂移；跨分支复用无来源事实；把超过模型窗口的内容一次性全部塞进 Prompt。

### 6.3 评估方案

参考 LongMemEval 与 LoCoMo：构造固定的 RP 样本，测试对早期设定的准确回忆、时间顺序、关系状态更新、信息不足时弃答、跨分支干扰和与作者 canon 的一致性。

拟设计 **RP-Consistency 小型基准**（项目自研，不能冒称社区标准）：50–100 个故事样本，每个包含 100/500/1000 消息级别的场景；结合自动事实题、人工盲评/抽查和冲突标注。采用对照组：

- A 最近消息截断（baseline）；
- B 固定长度摘要；
- C FTS / 关键词检索；
- D 事实表 + 时间/分支过滤；
- E D + 语义检索（仅将来）。

同一底座模型、同一参数、相近 token 预算，计算回答正确率、矛盾率、引用准确率、额外时延、输入 token/成本；报告置信区间和失败例子，绝不预设 D/E 必胜。

资料：
- https://arxiv.org/abs/2410.10813 (LongMemEval)
- https://aclanthology.org/2024.acl-long.747/ (LoCoMo)
- https://arxiv.org/abs/2304.03442 (Generative Agents)

## 7. 角色卡与 SillyTavern 数据迁移

### 7.1 支持级别

- **Read**：可以读取，且字段保留。
- **Render**：元数据可以在编辑器展示。
- **Prompt-compatible**：此字段会按规范参与 Prompt 构造。
- **Behavior-compatible**：触发/注入效果与参考应用一致（必须黄金样本测试）。
- **Round-trip**：导入 → 导出没有数据损失（允许规范化但保留 unknown extension）。

不要混淆“能读”与“行为等效”。

### 7.2 导入次序

v0.1：规范 JSON V2/V3、PNG V2/V3，兼容 `chara`/`ccv3` PNG 文本块，发现两者均存在时遵循 V3 优先规范；对于角色卡拓展字段 `extensions` 原样存储。v0.2：CHARX（ZIP 包中的 `card.json` + 资源），SillyTavern 世界书 JSON、JSONL 聊天（包括 swipe/metadata）、个性设定、选择性正则预设。要做真实卡片测试集，不以“能导入一个自制卡”为验收通过。

**导入安全**：最大文件大小、解压总大小、资源类型和路径白名单；防 Zip Slip、Zip Bomb、PNG 解压与文本元数据异常；不执行卡片内的 JavaScript/HTML；图片/链接外链显式提醒；正则以限时/安全引擎处理。

规范：
- https://github.com/kwaroran/character-card-spec-v3/blob/main/SPEC_V3.md
- https://github.com/fuyn101/SillyTavern-Staff/blob/main/SPEC_V2.md
- https://github.com/SillyTavern/SillyTavern-Docs/blob/main/Usage/Characters/chatfilemanagement.md
- https://docs.sillytavern.app/usage/core-concepts/worldinfo/

## 8. UX 信息架构

底部导航建议：**会话 / 角色 / 世界书 / 设置**；次级入口：**提示词检查器、数据导入导出、模型配置**。

### 8.1 手机主对话页

- 头部：角色头像与名称、所选 Provider/Model、当前世界与设定、快速切换角色/模型。
- 消息区：消息分页、候选回复切换、编辑/引用/复制/继续/重试、保留原文和长段落换行、图片附件独立布局。
- 输入区：多行输入、停止生成、发送、快捷角色设定、Token 估算、键盘交互。
- 调试入口：本次激活条目、Token 预算、请求追踪（用户决定是否导出）。
- 通过轻量底部抽屉展示“设定/属性/人物关系”，避免用户频繁跳转到十几个设置页面。

### 8.2 首次启动体验

1. 创建本地工作区，无登录。
2. 导入一个角色卡或创建一个临时角色。
3. 输入自有 Provider 的 API Endpoint / Model / Key（支持连接测试）。
4. 显示示例消息和最小 Prompt Inspector，提供“开始聊天”。

## 9. 安全、隐私、开源许可

- **BYOK（Bring Your Own Key）**：用户 API Key 以 Android Keystore 支持的安全存储保存，不在 GitHub、日志、数据库导出文件、错误上报中明文出现。SecureStore 并不能保护已解锁或 root 的整个系统，也不是用户备份数据的替代。
- **联网边界**：默认只允许 HTTPS 远程 API；用户要访问本地 `http://192.168.*` 服务可在明确警告下启用局域网例外，并避免将私人密钥发送到不可信域。
- **日志**：debug 构建可查看网络错误/状态码与脱敏样本；聊天文本、完整 Prompt、头部授权、图片路径默认不记录或上传；允许用户手动导出脱敏诊断。
- **卡片为不可信外部输入**：角色卡字段会影响 RP 生成，但绝无能力读取密钥、发起未经批准的网络请求、打开本地私有文件或运行扩展 JS。系统层与数据层权限必须由 App 强制。
- **文本渲染**：禁用 Markdown 内嵌 HTML/脚本，远程资源默认不自动加载，避免意外跟踪。
- **删除与备份**：支持完整导出/导入和彻底删除；SQLite WAL/临时附件生命周期纳入安全设计；不把密钥导入/导出。
- **许可证**：若完全自行实现，优先考虑 Apache-2.0（最终由项目作者确认）以利于库复用。若复制/修改 AGPL/GPL 项目的受保护源代码，必须依法遵守许可证及传播/开源义务，不得擅自当作 Apache/MIT 代码。协议互通和独立实现不同于直接拷贝源码。
- **依赖供应链**：锁版本、Dependabot/Renovate、安全扫描、CI 最小权限；外部 PR 默认无构建密钥。

参考：https://cheatsheetseries.owasp.org/cheatsheets/RAG_Security_Cheat_Sheet.html

## 10. 性能目标与可重复验证

**全部为拟议验收门槛，不是现有实测结果。**

固定测试机型与 release APK，数据集包含：100 / 1000 / 5000 / 10000 条长短混合消息，至少 10% 超长消息，CJK/英文混合，角色图片与无图两套，模拟真实编辑和分支。

建议初期 SLO（可在实测后调整，公布硬件及分位数）：

| 指标 | v0.1 初始目标 | 方法 |
|---|---|---|
| 1000 条会话打开至最新消息可交互 | P95 < 1.5 秒 | Release APK，20 次冷/热启动分开统计 |
| 5000 条会话内持续滚动 | 中位帧率 >= 50 FPS，无长时间白屏 | RN performance monitor/平台 profiler |
| 单批 50 条消息 DB 分页查询 | P95 < 100 ms | 固定 SQLite 数据集和设备 |
| 长篇聊天内存 | 不随历史总条数近似线性上涨 | 对比 1k/5k/10k，追踪 memory |
| 流式取消 | 触发取消后立即停止 UI 累加且不中断其他会话数据 | 模拟 SSE 服务端、弱网络 |
| 断网恢复 | 已保存消息无丢失；未完成消息显示可恢复状态 | 强制杀进程、断电模拟、事务测试 |
| 导入导出 | 标准卡片字段不丢失；丢失字段有可读报告 | Golden files、round-trip 对比 |

**基线**：首先测量相同 Android 手机上的 ChatterUI/RisuAI/SillyTavern（能构造同环境时），避免因不同渲染形态、主题、图片尺寸、JS Dev Mode 而得出伪结论。无法统一环境时，只进行自身回归，不作“快 X 倍”宣传。

## 11. 测试与验收矩阵

1. `rp-core` 纯函数单测：角色拼装、变量替换、Lorebook 触发、预算、版本、排序、候选分支。
2. 合同测试：Provider 模拟服务器（SSE 分块、Unicode 跨 chunk、多行 data、[DONE]、断流、429、401、5xx、取消、超时、重连策略）。
3. 格式兼容：官方规范示例 + 开源许可允许的真实测试卡；PNG 双 metadata、未知 extensions、V2/V3 JSON、恶意大文件。
4. 数据持久化：schema migration、1000/10000 消息随机插入、崩溃恢复、备份还原、版本删除与索引校验。
5. 安全：密钥泄露扫描、日志脱敏、非法 URL/远程资源、Zip Slip、Regex DoS、Markdown 事件/脚本注入。
6. UI：Android 仿真或云端截图（条件允许）+ **至少一次真机逐功能人工验收**；Codex 的单元测试通过不能替代真实 APK 运行。
7. 记忆评估（v0.2）：LongMemEval/LoCoMo 子集与自研故事事实题；报告成本与效果，避免结果导向调参。

合并门槛：编译、类型检查、lint、单测、关键 golden test、依赖扫描全部通过；重大 API/格式变化需要 migration/变更文档；release 必须有 APK、构建日志、版本号、已知限制和回滚路径。

## 12. 仓库目录与持续集成

```text
rp-project/
├─ apps/
│  └─ mobile/
│     ├─ app/                 # Expo Router
│     ├─ src/
│     │  ├─ features/chat/
│     │  ├─ features/characters/
│     │  ├─ features/lorebooks/
│     │  ├─ features/settings/
│     │  └─ infra/           # Expo-specific adapters
│     ├─ app.json
│     └─ eas.json
├─ packages/
│  ├─ rp-core/                # No RN/Expo imports
│  ├─ rp-card-codecs/         # JSON/PNG/CHARX
│  ├─ rp-provider/            # Provider capabilities/types
│  ├─ provider-openai-compat/
│  ├─ storage-contracts/
│  └─ test-fixtures/
├─ docs/
│  ├─ PRD.md
│  ├─ ARCHITECTURE.md
│  ├─ API_COMPATIBILITY.md
│  ├─ DATA_FORMATS.md
│  ├─ THREAT_MODEL.md
│  ├─ BENCHMARKS.md
│  └─ ADR/
├─ .github/workflows/
│  ├─ ci.yml
│  └─ android-preview.yml
├─ AGENTS.md
├─ CONTRIBUTING.md
├─ LICENSE
├─ pnpm-workspace.yaml
└─ package.json
```

EAS `apps/mobile/eas.json` 示例：

```json
{
  "build": {
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" }
    },
    "production": {
      "android": { "buildType": "app-bundle" }
    }
  }
}
```

构建调用（在 `apps/mobile` 下运行，已配置 Expo 认证和 EAS 项目）：

```sh
npx eas-cli build --platform android --profile preview --non-interactive
```

`--non-interactive` 仅可在凭据、签名等已提前配置完整时使用。**Codex Cloud 环境创建/发布一般需先在 Web/桌面完成，之后手机可以发起任务**。新建任务有独立工作区，不应指望未提交工作跨任务自动保存。CI 中使用专用、最小权限的构建 Token，不通过聊天/提交泄露。

资料：
- https://help.openai.com/en/articles/20001545-using-codex-cloud
- https://docs.expo.dev/build-reference/apk/
- https://docs.expo.dev/build/internal-distribution/

## 13. 分阶段执行和里程碑（12–16 周的弹性规划）

> 工期是单人配合 AI 开发的工作量规划，不是对自动编码速度的保证；兼容性/真机问题可能延长。先完成短周期验证再决定是否投入后续。

### Gate 0：技术风险证明（第 1–2 周）

- 建 GitHub 仓库、Codex Cloud 环境、pnpm monorepo、TypeScript。
- 用真实设备安装最低限 Expo APK；串起用户可填的 OpenAI-compatible 远程接口（无测试 Key 时用模拟 SSE）。
- 将 1000 条消息放入 SQLite，使用 FlashList 打开、分页与滑动；记录设备和性能。
- 能解析一张实物 CCv3 PNG/JSON 卡。记录导入结果。

**退出条件**：APK 在真实 Android 上独立启动；模拟/真实网络流可收到并取消；1000 条消息不因架构问题卡死；上传构建报告。失败则重新评估 RN/Kotlin 路线，不进入海量功能开发。

### Gate 1：v0.1 内测版（第 3–6 周）

- 完成会话和角色列表、输入、流式、取消、编辑/重新生成、SecureStore、导入导出和基础 Inspector。
- API 兼容故障测试、Schema Migration、基本安全测试、CI + 每个发布标签自动生成 APK。

**退出条件**：使用两种不同 OpenAI-compatible 后端通过 smoke test；同一角色能完成 30 轮对话、杀进程恢复、不丢消息；标准格式导入/导出通过 golden tests；20 轮异常恢复回归。

### Gate 2：v0.2 RP 专业版（第 7–11 周）

- 世界书第一阶段、branch graph、历史检索、事实/事件存储和来源管理、Inspector 激活原因。
- SillyTavern 角色与 JSONL 迁移工具；定义兼容矩阵和失败报告。

**退出条件**：世界书例子触发与优先级测试通过；跨分支不串事实；本地查询在 1000/5000 条数据上达到公布的基线要求。

### Gate 3：记忆评估与公开测试（第 12–16 周）

- 构建 RP-Consistency 数据集、模型对照实验和指标报表。
- 修复最常见的崩溃、导入失败和长消息性能问题；补充 README、贡献规范、许可与隐私声明。
- 发布 Alpha/Beta、收集用户反馈，再决定 v0.3 插件 SDK/多端。

**退出条件**：基准具备可复现脚本，公开失败案例；没有声称未验证的“无限记忆”或“性能领先”；有可下载安装与回退的 APK。

## 14. 项目重大风险与决策闸门

| 风险 | 影响 | 预防/处理 | 必须验证的节点 |
|---|---|---|---|
| RN 长文本渲染、复杂 Markdown 卡顿 | 高 | 虚拟化、局部渲染、release 测试；必要时 native text 方案 | Gate 0 |
| Expo/Codex 依赖与云编译失败 | 高 | 最小真机 APK 先行；固定版本及 lockfile；保留构建日志 | Gate 0 |
| API 兼容不完整 | 高 | capabilities + 模拟 SSE + 两个不同兼容后端 | Gate 1 |
| SillyTavern 迁移不保真 | 高 | 字段级、行为级兼容矩阵；golden files | Gate 2 |
| 自动记忆产生错误事实 | 高 | 来源、状态、人工确认、可撤销、基准 | Gate 2–3 |
| Key/聊天隐私泄露 | 极高 | SecureStore、脱敏、默认不上传、审计、威胁建模 | 持续 |
| 用户需求无限膨胀 | 高 | P0/P1/P2，gate 未通过不拓展 | 全期 |
| 单人维护插件生态过重 | 高 | 不提前做任意代码插件；先发布稳定接口 | Gate 3+ |
| 许可证兼容问题 | 高 | 独立实现、保留归属、审查依赖、必要时咨询法律专业人士 | 初期 |
| 无成本控制的记忆生成 | 中 | 默认不自动调用额外 LLM；显示调用额度与估计成本 | Gate 2 |

## 15. 给 Codex Cloud 的任务管理规范

**不要一次发“请你开发完整 SillyTavern 替代品”**。先发下面的工程约束提示词，之后逐个 GitHub Issue 交付。

### 第 0 条：仓库启动指令

> 你是移动端 TypeScript/React Native 架构工程师。请按照仓库 `docs/PRD.md`、`docs/ARCHITECTURE.md` 和 `AGENTS.md` 实施 RP Core。项目目标是 Android-first、offline-first、BYOK AI RP 客户端。采用 pnpm monorepo，apps/mobile 为 Expo，packages/rp-core 为纯 TypeScript、不得引用任何 React Native/Expo 运行时。先只完成 Gate 0 的可运行骨架，不要擅自开发完整世界书、插件或长期记忆。所有修改附测试、命令与实测结果。不能完成 Android 真机验证时明确写成“未验证”，不要伪称通过。严格不把 API Key、签名密钥或聊天内容放入仓库。一次只提交一个可审阅 PR，并说明选择与取舍。

### 建议前 8 个 Issues

1. `chore: workspace skeleton + CI` — pnpm, TS references, lint, test, formatting, AGENTS.md。
2. `feat(core): typed domain model` — character, conversation, message, branches; serialization and tests。
3. `feat(provider): OpenAI-compatible streaming transport` — SSE incremental parser, abort, failure mapping, mock server。
4. `feat(mobile): Expo navigation + chat shell` — UI with mock data, keyboard, theme。
5. `feat(storage): SQLite migrations + paging` — CRUD, branch-safe query, 1k sample generator。
6. `feat(codecs): CCv2/CCv3 JSON and PNG import` — metadata chunks, golden fixtures, error cases。
7. `feat(security): SecureStore and BYOK config` — no key in export/logs, endpoint tests。
8. `ci(release): EAS APK preview build` — manual preview flow, release checklist, build instructions and artifact links。

每个 Issue 都明确：范围、非范围、修改的公开接口、测试、构建命令、验收日志、迁移风险。CI 通过后由人审阅合并。Codex 生成的文件只有在实际构建和真机验证后才视为“已完成”。

## 16. 最终建议

这是一个值得做的独立开源工程；但真正困难的部分不是聊天气泡，而是角色卡兼容、世界书行为、正确的上下文预算、对话分支的数据一致性，以及长期记忆是否可信。

**最优第一步是 Gate 0（技术风险证明），不是 UI 设计，也不是全面重写酒馆。** 使用手机 + Codex Cloud 的前提，是先通过 Web/桌面配置仓库及云环境，再使用 EAS 生成安装包并进行 Android 真机验收。

建议先实现一个“能在手机安装、能跑完整的 30 轮 RP、有可靠本地存储和角色卡导入”的版本；之后再用真实问题和性能数据决定是否值得继续投资长期记忆、完整世界书及插件体系。

---

## 参考资料清单（截至 2026-10-17 的可访问公开资料）

**竞品与源码**
1. SillyTavern: https://github.com/SillyTavern/SillyTavern
2. RisuAI: https://github.com/kwaroran/RisuAI
3. ChatterUI: https://github.com/Vali-98/ChatterUI
4. Agnai: https://github.com/agnaistic/agnai

**协议与导入**
5. Character Card V3: https://github.com/kwaroran/character-card-spec-v3/blob/main/SPEC_V3.md
6. Character Card V2: https://github.com/fuyn101/SillyTavern-Staff/blob/main/SPEC_V2.md
7. SillyTavern World Info: https://docs.sillytavern.app/usage/core-concepts/worldinfo/
8. SillyTavern Prompt Manager: https://github.com/SillyTavern/SillyTavern-Docs/blob/main/Usage/Prompts/prompt-manager.md
9. SillyTavern Chat Management: https://github.com/SillyTavern/SillyTavern-Docs/blob/main/Usage/Characters/chatfilemanagement.md

**客户端基础设施**
10. Expo New Architecture: https://docs.expo.dev/guides/new-architecture/
11. Expo SQLite: https://docs.expo.dev/versions/latest/sdk/sqlite/
12. Expo SecureStore: https://docs.expo.dev/versions/latest/sdk/securestore/
13. Expo streaming fetch: https://docs.expo.dev/versions/latest/sdk/expo/
14. FlashList v2 performance: https://shopify.github.io/flash-list/docs/fundamentals/performance/
15. EAS APK: https://docs.expo.dev/build-reference/apk/
16. Codex Cloud: https://help.openai.com/en/articles/20001545-using-codex-cloud
17. SQLite FTS5: https://www.sqlite.org/fts5.html

**记忆与安全**
18. LongMemEval: https://arxiv.org/abs/2410.10813
19. LoCoMo: https://aclanthology.org/2024.acl-long.747/
20. Generative Agents: https://arxiv.org/abs/2304.03442
21. OWASP RAG Security: https://cheatsheetseries.owasp.org/cheatsheets/RAG_Security_Cheat_Sheet.html
