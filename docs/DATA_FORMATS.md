# 数据格式与迁移策略

当前只有Gate0独立探针表gate0_messages，user_version=1；host SQL测试不证明Expo native migration成功。生产模型将按原文§5实现characters/character_revisions/conversations/message_nodes/message_assets/lorebooks/lore_entries/settings/provider_profiles，v0.2补facts/events/summaries。Provider Key只通过profile ID引用SecureStore。

编辑/重新生成必须保存原节点，以兄弟/新版本与active leaf表示活动路径；禁止复制全部历史或串入另一分支未来事实。备份采用明确版本/完整性报告，不含Key，遇未来schema不重置用户数据。应用未完成消息、WAL/附件、删除和升级恢复均需验收。

| 格式                             | 当前                             | 计划                                          |
| -------------------------------- | -------------------------------- | --------------------------------------------- |
| CCv3真实JSON/PNG                 | host实物PNG读取/提取JSON往返通过 | native/独立JSON样本待验；见CARD_COMPATIBILITY |
| CCv2/CCv3 JSON和PNG              | 数据envelope/PNG tEXt部分实现    | G1完整字段、行为与迁移golden仍待完成          |
| PNG chara/ccv3双块               | V3优先/CRC/异常测试通过          | 重编码/像素解码不在当前支持范围               |
| CHARX资源/CJK多模态              | 未实现                           | Gate2 ZIP白名单、Zip Slip/Bomb边界            |
| SillyTavern JSONL swipe/metadata | 未实现                           | Gate2完整性报告与unknown round-trip           |
| WorldInfo/Persona/部分正则预设   | 未实现                           | Gate2规则级矩阵与行为golden                   |

unknown extensions需要原样保留但不默认执行或注入；creator_notes是元数据，不能当默认世界设定。限制原文件/解压总量、路径、资源类型、PNG元数据和正则执行预算；不得以能读一张自制卡声称已兼容。测试fixtures必须许可清晰，禁止私有聊天/密钥。

当前逐项证据以CARD_COMPATIBILITY.md为准。已实现JSON envelope和PNG tEXt数据读取/CRC及JSON字段往返，未实现PNG重新编码/完整字段行为/CHARX。
