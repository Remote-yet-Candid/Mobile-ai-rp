# Gate 0：ADB验收入口与运行环境诊断

日期2026-10-17；App源码提交5ac8715，延续feat/gate0-foundation / PR #21。Gate0未通过，不启动Gate1。

## 实际新增

0.0.2/code2验证壳增加“运行ADB网络验收”：App注入expo/fetch，向固定127.0.0.1:8787的合成服务依次收完流、首片段后取消、重新请求；可主动分享仅含平台/API与布尔结果的报告。纯RP Core/Provider契约仍不依赖原生、网络或DB。

Expo配置插件只为127.0.0.1开放HTTP，base-config仍禁止其他明文请求，保留系统HTTPS证书验证。移除SYSTEM_ALERT_WINDOW、READ_EXTERNAL_STORAGE、WRITE_EXTERNAL_STORAGE，文件导入仍使用SAF单文件授权。probe SQLite版本仍1，没有清库或生产schema迁移；同测试签名/包名可覆盖升级，降级/正式签名限制见ADB_ACCEPTANCE。

增加[显式设备冒烟脚本](../../scripts/android-smoke.py)，计划覆盖安装、UI启动、合成1000条分页、杀进程重开、真实网络验收、截图和报告；不会root/卸载/清数据或自动选中手机。脚本完整UI流程本次未能运行，不能称为已验证自动化。命令与人工操作见[ADB_ACCEPTANCE](../ADB_ACCEPTANCE.md)。mock服务支持MOCK_INTERVAL_MS，便于人工慢流取消，不改变协议。

## 本次检查与结果

| 项目                                          | 结果                                                                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| pnpm check                                    | 8文件87测试通过、0失败/跳过；format/lint/secret/boundary/App与tests类型通过，日志check-gate0-acceptance-final.log与check-gate0-acceptance-complete.log |
| 真实本机HTTP合同                              | 新测试检查三次请求、服务端取消连接和后续正常请求；另验证不响应Abort的传输不能假通过                                                                    |
| 仓库mock实际启动与验收runner                  | Node24直接运行，MOCK_INTERVAL_MS=150；completed/cancelledAfterFirstDelta/recovered全部true；仅host证据                                                 |
| 公网HTTP边界                                  | 新负例确认allowInsecureLoopback=true仍拒绝普通公网host及127.0.0.1.example.com；不放宽HTTPS规则                                                         |
| pnpm export:android                           | 退出0；更新后的1409模块Hermes导出，日志export-gate0-acceptance.log                                                                                     |
| pnpm cards:external                           | 退出0；固定真实CCv3 PNG及提取JSON往返复验，来源/许可/hash沿用CARD_COMPATIBILITY；未入库素材                                                            |
| expo prebuild --platform android --no-install | 退出0；.mjs配置插件实际执行，生成对应网络规则与权限删除标记；未修改生产存储                                                                            |
| x86_64 Release APK                            | 退出0；bundle1m34s、assemble9m48s，530任务（501执行/29缓存）；签名校验通过                                                                             |
| ARM64 Release APK                             | 退出0；bundle1m04s、assemble3m05s，530任务（55执行/475缓存）；签名校验通过                                                                             |
| pnpm audit --audit-level high --prod          | 退出1；2 high、metadata另1 moderate；未关闭/忽略检查                                                                                                   |
| EAS whoami                                    | 退出1，配置值已交付但服务端仍返回bearer token invalid；未提交云构建                                                                                    |

上游官方GitHub公告API复查：node-forge GHSA-86w9-cpqp-85rv（<=1.4.0）和braces GHSA-vfj7-8cjw-p6xm（<=3.0.3）均first_patched_version=null。保留Issue #7与CI合并阻塞，不使用虚假版本、任意fork或忽略规则。

## APK静态核验

两个code2工件均通过ZIP条目完整性、唯一指定ABI、内置Hermes头与hash、v2测试签名、16KiB zipalign，以及aapt2的包名/版本/minSdk24/target36/非debuggable检查。APK实际权限表没有悬浮窗/广泛存储权限；从编译资源表定位网络配置后，验证只有127.0.0.1明文例外，base-config=false且没有自定义信任锚。首次按未压缩资源名查找失败，改按aapt2资源表解析真实res/w_.xml路径后通过；未修改APK或跳过检查。

- ARM64：34286401 bytes，SHA256 `1b8eafe2546423f13225c661b7a1b2b184652d9e335f11acdca97ab04e9533a9`。
- x86_64：34878923 bytes，SHA256 `65a8635814a0a9da95e1ad41ac25a40d2f6f4f23534f547e51d11a137db667e6`。
- 证书仍是Android Debug测试证书，非EAS/production；私钥不入Git。App源码与提交5ac8715一致，之后仅有mock间隔配置与文档变更。

完整回执见[android-apk-v2-validation.json](android-apk-v2-validation.json)。artifacts/mobile-ai-rp-gate0-arm64.apk现在指向code2；code1备份为mobile-ai-rp-gate0-arm64-code1.apk，其旧hash保留在历史报告。不得拿旧二进制配新版结果。

## 软件模拟器：失败证据

当前云机无/dev/kvm。通过官方Android CLI安装Emulator37.2.12和AOSP API35/default/x86_64 rev2，使用-no-window/-no-audio/-no-snapshot/-accel off/-gpu swiftshader、2核、约2.5GiB RAM、320×640启动。保留下载与TLS校验，没有尝试获取额外虚拟化权限或网络绕行。

约16分钟内ADB从offline变成device，zygote64/system_server及package服务陆续出现，但sys.boot_completed始终未为1。系统ActivityManager记录pid600（system_server）的ANR与stack dump deadline exceeded。一次code1 x86_64 APK安装尝试退出1，Android StorageManagerService因PackageManagerInternal.freeStorage为null抛NPE；应用未启动。此失败来自尚未就绪的系统安装服务，不能归咎于React Native/本应用，更不能据此作手机性能结论。

自动脚本实际执行退出1：“Android has not completed boot; no app test was performed”，在前置检查处停止。UI启动、原生SQLite/FlashList、expo/fetch和文件选择用例均未运行。已通过指定serial的emu kill停止自己创建的模拟器；adb devices恢复无连接设备，未留下mock或ADB reverse。

诊断在ignored artifacts/emulator-api35.log、emulator-system-anr.log、android-smoke-attempt.log与android-smoke/report.json。APK构建成功和模拟器进程退出0均不表示Android验收成功。

## 尚需完成

在HONOR90Pro或具备硬件加速的Android环境实际运行code2 APK，按HONOR90PRO_ACCEPTANCE/ADB_ACCEPTANCE记录独立启动、分页持久化、网络/取消/恢复、弱网和文件选择；真实手机性能仍需要原始样本。当前没有手机系统版本或任何真机通过结论。

在环境设置安全更新有效EXPO_TOKEN，实际whoami成功后再完成正确账户的项目绑定、签名和EAS preview APK；不要在聊天发送值。安全扫描需可信上游修复。保留草稿PR，以上出口与人工审阅全部完成后才可退出Gate0。

已保存更新的start_skill启动说明草稿（status=saved、requires_publish=true），包含87测试基线、code2/ADB命令、模拟器失败限制；install_script/网络/凭据要求保持原样。保存不是运行时变更或环境发布，不阻塞当前开发。
