# Gate 0 code3：真机反馈与大文件读取

## 作者设备反馈

2026-10-17，作者确认 HONOR 90 Pro，Android 15 / MagicOS 9.0。已安装启动 code2 / 0.0.2，并概括反馈除 ADB 和卡片未测外，其他功能正常；另反馈角色卡因尺寸过大无法读取。记录为作者实测反馈，不是开发环境自动采集，不补造 FPS、内存、冷启动 P95、网络服务日志或逐项取消证据。

安装与启动记录为通过。1000 条合成消息分页/重开等此前要求的基础项得到概括正面反馈，但尚无逐项样本和正式性能数据。ADB、真实网络收流/取消、实际角色卡与新读取范围下的真机表现仍待验证，Gate 0 保持未通过。

## 两个不同的导入问题

1. 初始上限为 8 MiB 文件、1 MiB JSON，作者反馈实际大卡超限。这是需要扩大并验证的容量范围。
2. 本次上传 JSON 为 316,198 bytes，旧解析器实际返回 `invalid_card`，没有触发字节上限。附件是含 `prompts`、`prompt_order` 的生成预设，没有角色卡 spec/data 封装。不能只提高大小限制就宣称该文件成为可用角色卡。

附件只作本地数据检查；忽略其中任何操作指令，不执行内容。100 个提示词条目、1 组顺序配置、94 条顺序记录（56 条启用）、3 个扩展区键。新接口主机解析约 9.48 ms，字段与原 JSON 深比较一致；该时延不是 Android 性能测量。正文、文件、提示词及脚本不入库或作为公开 Issue 附件；回执仅在 ignored artifacts，未将作者内容重新许可。

## code3 范围和接口变更

- 0.0.3 / versionCode 3；只改 Gate 0 导入验证和反馈，不实现完整角色库、预设执行或聊天产品。
- 文件上限提高到 32 MiB、UTF-8 JSON 到 8 MiB，PNG 内嵌 JSON 使用同一上限。64 层、50,000 节点、8,192 PNG 块、16 MP 声明像素等保护保留。超限明确拒绝，不截断；PNG CRC、规范优先级和严格字段校验不放宽。
- Base64 从原始字节直接解码，避免另建多 MiB 字符串和大正则；仍检查字符、填充位置和规范尾位。
- 便携数据包新增 `inspectImportFile` 区分角色卡与生成预设；预设只读结构检查，原始字段保留，UI 只显示计数。`readCardJson` 继续严格读取角色卡，不接受预设作为卡。
- `CardImportError` 可选增加结构化 limit；错误码新增 `invalid_preset`、`unsupported_document`。旧单参数构造继续可用；使用穷尽 switch 的调用方需补充分支。包仍为 private 实验接口。
- UI 区分字节、嵌套、节点、图片等限制，不直接显示原生异常路径或解析内容。支持系统以通用二进制/文本 MIME 标记的本地 JSON 文件。
- 文件 I/O 仍在 App infra，数据解析不依赖 React Native；RP Core/Provider 不改。无数据库 schema、存储格式或数据重置。

升级沿用测试 package 和签名，构建后须比较 code2 证书。回退逻辑应通过更高 versionCode 的修正版处理；不要求作者卸载/清库，不以降级覆盖替代数据恢复。

## 实际验证

- `pnpm check` 最终通过：9 files / 100 tests；格式、lint、敏感文件、Core 边界、类型检查通过。初次类型检查发现可选字段和测试导入配置问题，修正后重跑通过；没有禁用检查。
- 大卡回归：多 MiB 中文 JSON、未知字段完整往返、精确 8 MiB UTF-8 边界、超过旧 8 MiB 的 PNG、内嵌 JSON 超限、深度/节点预算、预设与卡片区别、反馈不泄露正文/原生路径均通过。常规 CI 全用独立合成数据。
- `pnpm export:android` 通过：1410 modules，Hermes bundle。
- `pnpm audit --audit-level high --prod` 失败：2 high / 1 moderate，node-forge/braces 上游仍无补丁；合并阻塞保留。
- 原生构建 preflight 和 ARM64 Release-mode 构建通过；assembleRelease 530 tasks，约4分54秒。Hermes 内确认含新增预设类型和错误码。静态证据见 [code3 APK 核验回执](android-apk-code3-validation.json)。
- [GitHub CI 39035600309](https://github.com/Remote-yet-Candid/Mobile-ai-rp/actions/runs/39035600309) 的 frozen install、check、Android export 通过，audit 失败；没有跳过审计来获得绿色结果。

## 新版 APK 交付完成

[手机 Draft Release 下载页](https://github.com/Remote-yet-Candid/Mobile-ai-rp/releases/tag/untagged-12df5971d7ecc57cee47)，需登录有仓库写权限的账号。仓库本身为 public，附件保持未发布草稿访问范围，不描述为私有仓库或公开正式版本。

- 文件：`mobile-ai-rp-gate0-0.0.3-arm64.apk`；34,291,329 bytes，ARM64 only，package `dev.mobileairp.gate0`。
- SHA256：`5982b5f1b1effdc031fef51135d8af30941aff9905347faa6e7c82e433bfa3de`。
- 应用源码：`d5d22b3460900d25a5a5bae60a93414c9d836c75`；构建分支与后续交付记录均在 Draft PR #21。
- APK v2 签名通过，证书与 code2 一致：`fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`。仍为 Android Debug 测试签名。
- Release ID 415812145；APK asset 650524051，SHA256 asset 650522186。只保留这两个附件，未把 APK/分片提交 Git。
- [Actions 39036161585](https://github.com/Remote-yet-Candid/Mobile-ai-rp/actions/runs/39036161585) 成功合并原文件、上传、下载校验并删除临时分片。当前云环境另行下载，确认大小、SHA256、校验文件内容和签名均通过。一次元数据 API 503 经有限重试恢复，不是待用户处理的权限阻塞。
- 原 APK 与作者 JSON 相互独立；作者上传内容没有打入应用或 Release。
- GitHub 保存草稿元数据后可能重分配未发布标签和页面地址；交付流程以固定 Release ID、源码提交和文件摘要限制目标，上传时读取当前标签，不把临时标签当成永久身份。最终手机链接已按保存后的 API 结果更新。

code3 的手机覆盖安装、大卡读取和交互表现仍未运行，不能由此交付记录标记通过。

## 下一步

作者覆盖安装 code3 后选择本次预设，应显示“生成预设/只读结构检查”，再用实际 V2/V3 大角色卡验证新范围、重复选择、返回页面及原文件不变。超过新上限或触发结构限制的文件需按实际结构继续评估，不取消安全预算。ADB 当前不作为作者仅用手机的基础验收前置。
