# 数据格式与迁移策略

当前只有Gate0独立探针表gate0_messages，user_version=1；host SQL测试不证明Expo native migration成功。生产模型将按原文§5实现characters/character_revisions/conversations/message_nodes/message_assets/lorebooks/lore_entries/settings/provider_profiles，v0.2补facts/events/summaries。Provider Key只通过profile ID引用SecureStore。

编辑/重新生成必须保存原节点，以兄弟/新版本与active leaf表示活动路径；禁止复制全部历史或串入另一分支未来事实。备份采用明确版本/完整性报告，不含Key，遇未来schema不重置用户数据。应用未完成消息、WAL/附件、删除和升级恢复均需验收。

| 格式                             | 当前   | 计划                                        |
| -------------------------------- | ------ | ------------------------------------------- |
| CCv3真实JSON/PNG                 | 未实现 | Gate0 feasibility，许可/来源/hash记录       |
| CCv2/CCv3 JSON和PNG              | 未实现 | Gate1 Read/Render/Prompt/Round-trip分别测试 |
| PNG chara/ccv3双块               | 未实现 | V3优先、大小/编码/压缩异常测试              |
| CHARX资源/CJK多模态              | 未实现 | Gate2 ZIP白名单、Zip Slip/Bomb边界          |
| SillyTavern JSONL swipe/metadata | 未实现 | Gate2完整性报告与unknown round-trip         |
| WorldInfo/Persona/部分正则预设   | 未实现 | Gate2规则级矩阵与行为golden                 |

unknown extensions需要原样保留但不默认执行或注入；creator_notes是元数据，不能当默认世界设定。限制原文件/解压总量、路径、资源类型、PNG元数据和正则执行预算；不得以能读一张自制卡声称已兼容。测试fixtures必须许可清晰，禁止私有聊天/密钥。
