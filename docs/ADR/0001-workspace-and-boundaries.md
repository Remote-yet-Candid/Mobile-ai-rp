# ADR 0001：pnpm workspace、纯TS边界和受控spike

状态：采用（2026-10-17）。

早先仅准备环境时使用npm安装仓库外工具；正式技术方案明确选择pnpm Monorepo。正式仓库采用pnpm 11.25.0，npm仍用于引导安装pnpm，不创建package-lock.json。Node 24.19.0 LTS、TS6.0.3、Expo58.0.14/RN0.88.0、FlashList2.3.2依据实施时官方Expo包bundledNativeModules.json和模板版本固定。RN0.88采用New Architecture；不能据此推断性能达标。

纯Core与Provider类型分包；网络适配器注入传输，SQLite由App实现端口。TS references/exports和边界守卫约束依赖；不提前发布稳定SDK。Gate0探针表独立，不作为未来完整branch/character schema。时间/随机/token/I/O必须注入。

采用Expo Router做Android lab，不提前打磨正式UI；用原创合成数据，不冒充真实卡/LLM。host测试与Hermes导出必须通过，native/APK/设备/真实卡另设验收。上游安全公告不关闭检查处理。

2026-10-17作者明确选择Apache-2.0，允许商业和闭源衍生；所有依赖/卡片资产仍须分别许可审查。未复制竞品受保护实现。

代价：workspace/SDK版本管理成本；新SDK和测试工具兼容需实测。若Gate0 native性能或构建不可行，公开证据并重评RN/Kotlin，不悄悄删目标。
