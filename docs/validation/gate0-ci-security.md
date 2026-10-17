# Gate 0 CI 拆分与漏洞核验

核验日期：2026-10-17（Asia/Shanghai）。目标是让真机功能验收独立推进，同时保留真实安全失败和正式发布门槛。本次不改应用、依赖版本或锁文件，不构建/上传 APK。

## 最新修复状态

| 包 / 实际锁定版本 | 公告与状态                                                                                                                               | 修复状态                                                                                                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| node-forge 1.4.0  | [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv)，CVE-2026-85393，high，影响 <=1.4.0；公告更新2026-10-01，未撤回 | 公告 first_patched_version=null；npm latest=1.4.0，已发布列表没有更高修复版；[上游PR1152](https://github.com/digitalbazaar/forge/pull/1152)仍open、未合并，不当作可信已发布修复 |
| braces 3.0.3      | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)，CVE-2026-93687，high，影响 <=3.0.3；公告更新2026-10-02，未撤回 | 公告 first_patched_version=null；npm latest=3.0.3，已发布列表没有更高修复版；旧漏洞的3.0.3修复不能解决本次新公告                                                                |

来源为 GitHub Advisory API、公告链接、上游 PR API 和当前配置的 npm registry 元数据；没有把未发布提交、占位版本、降级或 fork 伪装成修复。结构化证据见[状态快照](gate0-security-status-2026-10-17.json)，原始 API/audit/why 输出仅在 ignored artifacts 中保存。

## 实际影响与边界

- node-forge：RSA PKCS#1 v1.5 验证未严格检查嵌套 DigestAlgorithm 元素，低公钥指数等攻击条件下可能接受伪造签名。实际路径含 `expo > @expo/cli > @expo/code-signing-certificates > node-forge` 以及 CLI 直接依赖。安装包中证书/CSR/签名验证代码实际调用 forge 的 verify API；不能只凭“间接依赖”判定无风险。audit列出58条路径，是同一个安装版本的多条依赖链，不是58个独立漏洞。
- braces：深嵌套 brace pattern 可使递归 AST 遍历栈耗尽，导致 Node 进程 RangeError / 拒绝服务。路径如 `expo > @expo/cli > @expo/metro > metro-file-map > micromatch > braces`；Metro watcher 的文件筛选调用 micromatch，风险在接收攻击者可控模式的构建/开发工具使用方式。audit列出100条路径。
- 应用/Core 源码没有直接调用上述包。当前 `pnpm export:android --source-maps` 导出的 Android bundle map 包含1400个 source条目，匹配 node-forge/braces 包路径均为0；当前本地卡片入口只执行有界数据解析，没有把卡片内容交给上述 Node 工具。这个证据限于当前 bundle 模块清单，不证明所有未来配置、构建机或供应链都无风险，也不能将两包从 `--prod` 审计中排除。
- 两包经 Expo 的生产依赖图进入 `pnpm audit --prod`，不是把它们改标 devDependency 就能真实消除的风险。Android 平台 HTTPS 和本地 APK v2 签名使用各自平台工具，不等于本公告中的 forge JS 验证。

缓解：冻结已核验依赖、可信工具输入、隔离构建环境、不向外公开开发服务、不执行不可信项目配置/扩展/卡片脚本；Gate0只做受控测试，不使用生产签名材料。这里是减少暴露，不是漏洞修复或正式发布豁免。

## CI 行为

`.github/workflows/ci.yml` 拆为独立 `Functional validation` / `Security audit`。第三个 `Release prerequisites` 总是读取两者的实际结果，任何失败/取消/跳过都返回失败；功能验证可独立显示通过，正式发布前置仍失败。审计命令与退出码原样保留，不关闭/忽略公告，不自动重复失败。PR和main各按对应事件运行；同一PR的新提交取消过时运行，不再为每个PR提交同时运行push和pull_request两份CI。

分支保护读取返回403，main branch rules查询为空；传统保护及必需检查设置无法核实。未写入未知规则或索要更广的令牌。管理员仍需按[发布规则](../SECURITY_RELEASE_GATE.md)设置必需检查与人工审核，不能宣称已强制执行。

## 实测结果与下一步

- `pnpm audit --audit-level high --prod --json`：退出1，2 high / 1 moderate（metadata）。两项high的 patched_versions 均为null；没有无限重试。
- `pnpm why node-forge --prod`、`pnpm why braces --prod`：完成；包与版本和锁文件一致。
- `pnpm view <package> version dist-tags --json` 与 `versions --json`：完成；最新版仍落在漏洞范围。
- `pnpm export:android --source-maps`：通过，产出Hermes与map，完成上述模块清单核验。
- YAML经Prettier解析/格式检查通过；`pnpm check`通过，9 files / 100 tests，格式、lint、敏感文件、Core边界及类型检查通过。拆分后远端Job待本次实际执行后记录。

下一步优先以现有code3 APK完成真实卡、分页/持久化和网络/取消证据。安全修复等待可信上游版本/兼容依赖链，变更时再审查发布来源与完整性、更新锁文件、重跑功能/导出/审计并进行人工安全评审；当前Issue #7保持打开。
