# 分层架构

```text
apps/mobile (UI / navigation / native / security)
  ├── rp-core ──(type only)── rp-provider
  ├── provider-openai-compat ── rp-provider
  ├── infra/storage/sqlite ── storage-contracts
  └── test-fixtures (Gate 0 synthetic data only)
```

rp-core是纯TypeScript决策逻辑，不依赖RN/Expo/SQLite、fetch、文件系统、环境变量、时间或随机数。Provider契约也无运行时依赖；I/O由适配器注入。boundary脚本检查源代码与运行依赖，并拒绝绕出包目录的相对导入、未审计包装库、动态导入和环境能力。它是工程守卫，不是执行不可信代码的安全沙箱。

当前core只验证不可变请求快照和注入token meter：输入预算=上下文-输出预留-安全余量；无模型tokenizer时明确标记estimate；超预算显式失败，不静默删硬设定。完整角色/Persona/宏/Lorebook/检索/排序与Trace管线留待后续Issue。真实token统计、时钟、ID与随机数均应以端口提供，不默认使用字符数冒充准确token。

Provider adapter负责URL/认证/HTTP/SSE/abort/timeout/错误映射。接口不向core注入Key；App未来从SecureStore按profile ID按需读取。当前native验证壳使用进程内mock，没有真实Key或真实LLM。host HTTP合同测试使用本地服务器，不证明expo/fetch在Android的表现。

存储契约不依赖SQL驱动；Expo SQLite实现位于App infra。Gate0独立probe数据库/表避免与未来characters/revisions/conversations/message_nodes/assets/lore/settings/Provider生产schema混淆。生产schema必须包含不可变编辑/重生成版本、状态恢复及资产分离；Key不进SQL。v0.2的branch/facts/events/summaries必须绑定活动路径、时间、来源与失效，不复制完整历史。

编译产物通过package exports供Node测试，react-native条件解析源TS供Metro。TS project references固定依赖方向。每个包暂为private/0.0.0，不声称公共SDK稳定或已发布npm。

默认不存完整Prompt、聊天文本日志或认证头。Card codecs未来只解码允许的数据字段、保存unknown extensions，不能执行JS/HTML；creator_notes不默认进入Prompt。兼容分Read/Render/Prompt/Behavior/Round-trip五级，见API_COMPATIBILITY和DATA_FORMATS。

后续codec/Native probe：rp-card-codecs仅处理有界bytes/JSON，不导入RN/Node I/O；App infra/card-import负责明确选择的本地缓存副本。infra/provider将expo/fetch注入Provider适配器，/tools仅发送固定合成数据，不读取或发送卡片/Key。文件/网络操作不迁入Core。
