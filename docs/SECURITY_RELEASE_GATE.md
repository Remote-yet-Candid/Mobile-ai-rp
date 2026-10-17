# 安全审计与发布门禁（Gate 0）

## 开发阶段与正式发布分开

当前 Expo CLI/Metro 间接依赖的 node-forge、braces 存在尚未修复的 high 安全公告；详见 [Issue #7](https://github.com/Remote-yet-Candid/Mobile-ai-rp/issues/7) 与 [既有核验记录](validation/gate0-ci-security.md)。不以功能通过推断安全通过。

- `.github/workflows/ci.yml`：普通 push(main)/PR/手动触发，仅运行 **Functional validation**（frozen install、pnpm check、Android export）。这是开发反馈，不等于生产发布批准。
- `.github/workflows/security-audit.yml`：独立 **Security audit**，每月首日计划运行及手动触发；继续执行 `pnpm audit --audit-level high --prod`，漏洞未修复时必须保持失败。这减少重复通知，但不会消除风险。定期计划任务只在仓库默认分支包含该工作流后才会自动执行；可能受到 GitHub Actions 调度延迟/停用政策影响。
- `.github/workflows/release-preflight.yml`：**仅手动触发**，对同一选定提交重新运行功能和安全检查，并由 **Release prerequisites** 检查实际结果；任一步失败/跳过/取消都会阻断门禁。它不执行发布，也不自动获得安全豁免。

## 目前可做与不可做

允许继续使用受控 code3 Gate 0 测试 APK 进行 Android 真机验收；继续保持 PR #21 为 Draft。既有 APK 仅为测试签名的技术验证产物，不是安全审计通过或可公开分发的正式版。

**禁止正式发布：** 在 Issue #7 风险得到可信修复或经明确安全评审处理、同一提交正式发布前检查通过、真机与人工安全审阅完成前，不得发布生产 APK/AAB、正式 Release 或对外声称安全合格。当前 manual preflight 是可审计的流程检查，不是硬性的 GitHub Releases API 保护：需要仓库管理员配置受保护 environment、权限和审核政策，并保证正式发布自动化依赖这些条件。

## main 分支保护的区分

建议日常 main 的 required status check 设为 `Functional validation`，以便正常进行开发分支审查与合并。不要将仅手动运行的 `Security audit`、`Release prerequisites` 错设为每个普通 PR 的必需检查，否则会产生永远待运行/无法合并的状态。**如果项目要求安全失败时连开发合并都禁止，则必须另行采用严格合并政策，不能声称当前开发友好策略提供了该保证。**

建议 `Require a pull request before merging`。若只有作者一个可审批成员，先不要设置无法满足的强制他人批准门槛。当前 API 没有核实仓库保护是否已启用；以上属于管理员待确认配置，不能把本文档当作已配置成功的证据。

## 安全漏洞跟踪原则

不关闭审计、不使用 `continue-on-error` 伪绿、不采用未验证 fork 或盲目 dependency override。出现可信补丁、影响范围变化或准备正式发布时及时手动执行安全审计。记录依赖版本、锁文件、风险说明和审核结果。安全扫描是辅助证据，不能替代人工安全审查。
