# Gate 0 实施与验收计划

状态：进行中；第一阶段已开始。**Gate 0未通过**。原文§13/14/15为退出依据；12–16周只是弹性整体规划，不作自动交付日期承诺。

## 阶段A：首个PR（本次）

1. 原文完整入库；基线、架构/安全/兼容/性能文档；按作者确认采用Apache-2.0。
2. pnpm Monorepo + TS references + CI + lint/format +核心边界负例。
3. Core固定快照/预算注入spike，独立Provider合同与SSE适配器；本地HTTP模拟、分块/错误/取消/超时。
4. Expo Router验证壳，独立SQLite probe migration和1k合成数据、50条keyset分页、FlashList v2、模拟流开始/取消。
5. 类型/单测/host SQL、Android JS导出、依赖扫描；记录失败而不宣称native通过。

本次不做完整角色/世界书/记忆/分支/导入功能，也不把自制卡称为真实卡验证；原规划仍保留。

## 阶段B：构建与网络真机技术证明

完成EAS项目/签名前置、生成preview独立APK，记录build ID/commit/log/hash。真机安装冷启动；App层注入expo/fetch，使用不含Key的模拟HTTP SSE（或用户自选真实endpoint），弱网下收流/取消/断流；验证取消后UI立刻停止、另一会话不受损。当前进程内mock和host HTTP不是这个验收。

## 阶段C：真实卡与性能出口

获取许可允许的真实CCv3 JSON/PNG样本，记录来源/许可/hash，测试chara/ccv3及未知extensions。真机release打开/分页/滑动1k消息、10%长段CJK混合，关闭重开；记录设备和性能原始数据。测失败则调整RN方案并与Kotlin路线复评，禁止直接扩展海量功能。

## Gate 0退出清单

- [ ] release/preview独立APK真实Android启动，无开发服务器依赖。
- [ ] 模拟或真实**网络**流可收可取消，含expo/fetch设备证据。
- [ ] SQLite/FlashList 1000消息真机不卡死，分页与持久化有证据。
- [ ] 许可清晰的真实CCv3 PNG/JSON可读与报告。
- [ ] 构建/设备/性能报告上传并可由commit复现。
- [ ] 编译、typecheck、lint、单测、关键golden、依赖扫描通过；人工审阅PR。

阶段A通过不自动勾选上述native清单。当前可复现命令和结果见[validation](validation/gate0-foundation.md)。

## 外部前置与下一步

GitHub API被代理403拒绝，已保存api.github.com网络补充草稿；需要环境设置保存生效，之后运行planning publisher创建任务，并创建draft PR。Git读权限不等于API/写权限，按实际命令记录。

Expo账户凭据未配置、无EAS project ID/签名，也无连接Android真机。本阶段不索要聊天中的密钥；未来通过安全环境设置配置，先做不依赖这些条件的工作。当前上游high漏洞跟踪G0-07，保留CI合并阻塞。
