# 分层架构

```text
apps/mobile (UI / navigation / native / security)
  ├── rp-core ──(type only)── rp-provider
  ├── provider-openai-compat ── rp-provider
  ├── infra/storage/sqlite ── storage-contracts
  └── test-fixtures (Gate 0 synthetic data only)
```

rp-core是纯TypeScript决策逻辑，不依赖RN/Expo/SQLite、fetch、文件系统、环境变量、时间或随机数。Provider契约也无运行时依赖；I/O由适配器注入。boundary脚本检查源代码与运行依赖，并拒绝绕出包目录的相对导入、未审计包装库、动态导入和环境能力。它是工程守卫，不是执行不可信代码的安全沙箱。

当前 core 提供不可变请求快照、单角色 Prompt 构造、完整轮次裁剪及注入 token meter：输入预算=上下文-输出预留-安全余量；无模型tokenizer时明确标记estimate；超预算显式失败，不静默删硬设定。角色基础设定与最近活动历史已参与请求；完整 Persona/宏/Lorebook/检索/排序与 Trace 管线留待后续 Issue。真实token统计、时钟、ID与随机数均应以端口提供，不默认使用字符数冒充准确token。

Provider adapter负责URL/认证/HTTP/SSE/abort/timeout/错误映射。接口不向core注入Key；App 从 SecureStore 按 profile ID 按需读取，凭据绑定已保存的 HTTPS endpoint。v0.1 聊天使用 expo/fetch 发真实流式请求；/lab、/tools 保留隔离的技术验证入口。host HTTP 合同测试使用本地 Mock 服务器，不证明真实模型或 Android 网络已通过。

存储契约不依赖SQL驱动；Expo SQLite实现位于App infra。Gate0独立probe数据库/表避免与未来characters/revisions/conversations/message_nodes/assets/lore/settings/Provider生产schema混淆。生产schema必须包含不可变编辑/重生成版本、状态恢复及资产分离；Key不进SQL。v0.2的branch/facts/events/summaries必须绑定活动路径、时间、来源与失效，不复制完整历史。

编译产物通过package exports供Node测试，react-native条件解析源TS供Metro。TS project references固定依赖方向。每个包暂为private/0.0.0，不声称公共SDK稳定或已发布npm。

默认不存完整Prompt、聊天文本日志或认证头。Card codecs未来只解码允许的数据字段、保存unknown extensions，不能执行JS/HTML；creator_notes不默认进入Prompt。兼容分Read/Render/Prompt/Behavior/Round-trip五级，见API_COMPATIBILITY和DATA_FORMATS。

后续codec/Native probe：rp-card-codecs仅处理有界bytes/JSON，不导入RN/Node I/O；App infra/card-import负责明确选择的本地缓存副本。infra/provider将expo/fetch注入Provider适配器，/tools仅发送固定合成数据，不读取或发送卡片/Key。文件/网络操作不迁入Core。

## v0.1 生产数据与回退

`services/chat-session.ts` 负责注入 Provider、存储、ID、时钟和 abort；Core 不持有密钥，也不执行卡片宏、世界书或扩展。`prepareRoleplayRequest` 是实验性新增 API，按完整轮次裁剪历史；token 数明确标注估算。上下文检查在内存显示本次实际请求，不自动写日志。

`mobile-ai-rp.sqlite` 使用独立版本化迁移 v1，保存角色/不可变修订、会话、消息 DAG、生成尝试和非敏感模型配置。启动通过事务恢复未完成生成；仅成功回复切换活动叶，失败或取消保留部分文本及原路径。原 `gate0-probe.sqlite` 不改名、不清除，不把合成数据迁入业务库。用户数据未加密；Key 只进 SecureStore。PNG 本轮保存角色元数据，头像/资源渲染后续实现。

更新维持 Android applicationId 与原测试签名，code4 可覆盖安装 code2/code3；后续 schema 只能追加迁移，拒绝未知高版本并保留数据。回退二进制前应另行备份，不以卸载/清库解决问题；旧 Gate0 二进制不读取新库。完整备份恢复仍是后续任务，本轮未实现。Metro 保留正常 JS 解析，缺失相对 `.js` 时解析 TS 源文件，兼容 NodeNext 与 native 条件导出。
