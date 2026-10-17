# Gate 0 APK 交付记录

目标：作者仅用 HONOR 90 Pro 浏览器下载、安装原有 ARM64 测试 APK。不修改应用功能，不配置 Expo，不公开发布正式版本。

## 原始文件验证

- APK：`artifacts/mobile-ai-rp-gate0-arm64.apk`，0.0.2 / versionCode 2。
- 大小：34,286,401 bytes；唯一 ABI：arm64-v8a。
- SHA256：`1b8eafe2546423f13225c661b7a1b2b184652d9e335f11acdca97ab04e9533a9`。
- `apksigner verify --verbose --print-certs`：通过，APK Signature Scheme v2，Android Debug 测试证书。
- 证书 SHA256：`fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`。
- ZIP 完整性、16 KiB zipalign：通过。测试签名不作为生产签名。
- APK 源码提交：`5ac871540b9314c8c6b3398d687dcd320b6323aa`。本轮不重新构建或改写 APK。

## 上传问题与交付流程

已创建 [Draft Release](https://github.com/Remote-yet-Candid/Mobile-ai-rp/releases/tag/untagged-2a68d6ad11c8319d0221)，ID 415761004。仓库 API 实际返回 public；依赖未发布草稿限制附件访问，不将其描述为私有仓库。草稿需要登录拥有仓库写权限的账号查看。

网络与上传凭据生效后，修正令牌的 Contents 写权限，95-byte SHA256 文件已成功上传。完整 APK 请求仍被云代理返回认证错误；改换 HTTP 版本、内容类型及分块传输均未恢复。小型二进制及 8 MiB 请求能到达 GitHub，原文件请求失败。不据此认定存在某个已证实的代理大小上限。

采用 GitHub Actions 处理此次二进制交付：

1. 将原 APK 分为 5 个不超过 8 MiB 的临时附件，全部上传到同一 Draft Release，并核对 GitHub 返回的大小与 SHA256。
2. `.github/workflows/gate0-deliver-apk.yml` 仅在既有开发分支修改该流程文件时启动；不依赖 Expo 或长期用户令牌。仅交付 job 获得 `contents: write` 的短期 `GITHUB_TOKEN`。
3. 流程限定仓库、草稿 ID、版本、分片 ID 及各 SHA256，下载合并后检查原文件总大小与 SHA256；不重新构建，不覆盖已有 APK。
4. 将完整 APK 附加到该草稿，再实际下载 APK 和校验文件验证一致性；验证通过后才删除本次临时分片。任何失败均保留必要的诊断和传输文件。
5. 全程要求草稿保持未发布。APK、分片、密钥与本地回执不提交 Git。

首轮 Actions 在草稿身份校验处停止：GitHub 实际分配 `untagged-2a68d6ad11c8319d0221`，不是创建时请求的版本标签。没有执行 APK 上传或发布。流程改为核对实际标签、固定 Release ID 和源码提交后重试。

当前：5 个分片及校验文件已上传；修正后 Actions 实际执行和最终 APK 交付仍待核验。草稿本身不等于 APK 已交付。

## 本轮检查

- 工作流 YAML：Prettier 解析通过；内嵌 Python 语法检查通过。
- `pnpm check`：通过；8 个测试文件、87 项测试通过，类型、lint、格式、敏感文件和 Core 边界检查通过。
- `pnpm export:android`：通过，1409 modules，生成 Hermes Android bundle。
- `pnpm audit --audit-level high --prod`：失败，2 high / 1 moderate；node-forge、braces 上游 high 尚无补丁。保留合并阻塞，不扩大本轮范围修复依赖。

下一步：核验 Actions 交付结果，提供手机浏览器入口；由作者完成安装、独立启动、1000 条消息分页及重开持久化的基础真机验收。真实网络/取消、性能及其他 Gate 0 出口仍需单独证据，不能由文件交付代替。
