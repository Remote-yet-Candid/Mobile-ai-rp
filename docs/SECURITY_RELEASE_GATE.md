# 安全审计与 Gate 0 推进规则

## 当前判断

截至2026-10-17（Asia/Shanghai），node-forge 与 braces 两项 high 公告均未撤回，公告没有已修复版本，npm 已发布版本也没有可信修复。详细来源、受影响路径和实际命令见[核验记录](validation/gate0-ci-security.md)及[Issue #7](https://github.com/Remote-yet-Candid/Mobile-ai-rp/issues/7)。依赖来自工具链，不能因此忽略审计；当前 Android bundle 的模块检查也不构成整体安全豁免。

## 相互独立的结果

| GitHub Actions 检查名 | 内容                                                       | 当前预期 | 意义                                                  |
| --------------------- | ---------------------------------------------------------- | -------- | ----------------------------------------------------- |
| Functional validation | frozen install、格式/lint/边界/类型/100项测试、Android导出 | 通过     | 工程功能基线；不证明真机或安全通过                    |
| Security audit        | frozen install、`pnpm audit --audit-level high --prod`     | 失败     | 两项 high 尚未修复；网络/安装错误同样不能视为审计通过 |
| Release prerequisites | 检查上述两个 Job 的实际结果，失败/取消/跳过均阻断          | 失败     | 自动发布前置未满足；不会把跳过的审计当成成功          |

功能 Job 不依赖审计 Job，审计失败不再遮盖已通过的测试与导出。审计失败仍使整个 workflow 失败。没有 `continue-on-error`、漏洞忽略表、`audit fix --force`、盲目 override 或未核验 fork。

PR 更新触发一次 CI，main 推送仍检查；同一 PR 的过时运行自动取消，避免 push 和 PR 为同一分支重复跑两遍。取消不代表成功，不针对上游未修复公告无限重试。

## Gate 0 可以继续的范围

使用现有 code3 Draft 测试 APK，集中完成 HONOR 90 Pro（Android15 / MagicOS9.0）的真实卡读取、1000消息分页/重开、真实网络收流/取消等证据。仅用合成数据和作者明确选择的本地文件，不因功能正常宣称安全或 Gate 0 全部通过。按阶段汇总问题；仅在验收阻断缺陷或一个完整验收批次完成后制作新 APK，不为 CI/文档小更新重打包。

现有分发 workflow 只允许向固定未发布 Draft 附加已校验测试文件；不发布正式版本。不把工具链的 forge 验证等同于 Android 平台 TLS 或 `apksigner` 的 APK v2 校验。禁止将开发/构建服务公开暴露并处理不可信证书或 glob 配置；不执行卡片、预设或第三方扩展脚本，不使用测试凭据处理生产签名或私有聊天。

## 正式发布必须满足

1. Issue #7 的修复条件完成：可信上游修复版本或经供应链/兼容性评审的依赖链变更；冻结锁文件、重新核对实际安装版本和路径，high/critical 审计归零。未解决的其他风险也必须逐项记录和评审。
2. 同一待发布提交的 `Functional validation`、`Security audit`、`Release prerequisites` 全部成功；人工安全评审和 Gate 0 真机验收完成并记录审核者、提交、证据和未决风险。不以旧提交的绿色状态代替当前提交。
3. 后续正式发布/production workflow 必须依赖这些前置结果，并使用需要人工安全审核的受保护发布 environment。当前没有自动正式发布流程；不得通过脚本或 GitHub 发布按钮绕过上述政策。

仓库管理员应将上述三个检查设为 main 的必需检查，并要求 PR review，禁止直接推送和绕过检查。当前两个可用认证读取传统分支保护均返回403，branch rules 查询为空；这不证明传统保护不存在，也不证明已配置强制检查。**代码中的失败检查已提供；本次未修改 GitHub 管理设置，现有强制保护是否启用尚未核实，需管理员在仓库设置中核对并补齐。**不要把此文档或失败 Job 当作已启用远端权限保护的证据。

复查在上游发布/公告更新、依赖变更或正式阶段评审时进行；Dependabot 每周检查继续保留。只重新运行有新增证据或网络故障诊断依据的失败步骤。
