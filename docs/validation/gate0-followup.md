# Gate 0后续执行报告

历史记录：环境发布后的最新状态见[继续执行报告](gate0-published-environment.md)。以下保留当时失败证据。

日期2026-10-17（Asia/Shanghai）。延续feat/gate0-foundation，不触碰main。总体Gate0仍未通过。

## 本次完成

- 将card-codecs占位升级为数据读取包：V2/V3 JSON、PNG tEXt、CRC、ccv3优先、unknown extensions JSON往返、安全边界与错误码；Core仍无UI/网络/DB依赖。
- 实际下载并读取上游CCv3实物PNG，固定commit/来源/许可说明/SHA256，深比较提取JSON往返；没有将AGPL上游素材/源码纳入Apache项目。
- 新增/tools验证页：本地JSON/PNG选择、缓存副本清理、只显示元数据；HTTPS模拟网络走App注入expo/fetch，无密钥/真实聊天。入口已类型检查及Android bundle编译，未冒充真机通过。
- 补expo-system-ui使prebuild不再提示缺系统主题支持；官方SDK同组版本依赖，显式更新锁文件。
- 安装/校验Android SDK、NDK、CMake、官方JDK17，并实际尝试Release ARM64原生编译；工具和失败诊断均落盘。目标设备HONOR90Pro，系统版本尚待手机上记录。
- 增补本地构建恢复入口，不要求EAS Key；EAS认证需求EXPO_TOKEN已声明在草稿，未写值或索要聊天中的token。

## 检查结果

| 检查                                          | 结果/证据                                                                                      |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| pnpm check                                    | format/lint/secret/boundary/typecheck/单测通过；最终日志artifacts/check-followup.log           |
| pnpm test                                     | 83通过、0失败、0跳过，7文件；新codec测试含极深JSON解析前限制                                   |
| pnpm cards:external                           | 通过；固定551901-byte PNG、ccv3优先、4 extension字段、提取JSON完整往返；见CARD_COMPATIBILITY   |
| pnpm export:android                           | 退出0；1408模块、27资产、约3.2MB Hermes bundle；不是APK                                        |
| expo prebuild --platform android --no-install | 成功；native工程被Git忽略，不提交密钥                                                          |
| 原生assembleRelease首次                       | 缺Java17，诊断后已安装官方校验JDK17解决                                                        |
| 原生assembleRelease第二次                     | **退出1**；69 actionable tasks executed，screens/worklets在react-android AAR下载遇403；没有APK |
| pnpm apk:local --check / bash -n              | 通过；只校验脚本与现有工具路径，完整入口尚待放行后验证                                         |
| adb devices -l                                | 无设备；未安装/启动/测量HONOR90Pro                                                             |
| pnpm audit --audit-level high --prod          | **退出1**；2 high、metadata另报1 moderate，515 prod dependencies；无已发布修复版本             |
| gh api repos/...                              | **Forbidden**；实例allowlist仍无api.github.com，不把gh提示当作新增PAT依据                      |
| Expo API无凭据连接                            | **CONNECT 403**；EXPO_TOKEN未设置/未绑定                                                       |
| GitHub Issues/milestones/PR、EAS构建          | 本次仍未创建/执行，受下面外部前置阻塞                                                          |

node-forge latest仍1.4.0、braces latest仍3.0.3；官方upstream changelog与registry未提供可信修复版，保留audit门槛，不加入ignore/虚假版本/不受信fork。source和所有未知fields只作数据，不执行卡片代码；PNG像素不解码。详见CARD_COMPATIBILITY和LOCAL_ANDROID。

## 当前必须由环境/外部完成的前置

运行实例观察为restricted/enforced，但custom allowed hosts仍为空。配置工具已保存以下域名草稿，保存不是应用或发布：

| 目标                                         | 需要的配置                                                                                            |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 创建20Issues、5里程碑、draft PR及查询Actions | 应用api.github.com放行；之后用已有认证实际验证，不先索要新PAT                                         |
| 继续本地ARM64 APK原生编译                    | 应用repo.reactnative.dev放行；这是Maven Central官方AAR重定向目标，未改用不可信镜像                    |
| EAS账户/云构建                               | 应用api.expo.dev放行，并在环境设置安全填写已声明EXPO_TOKEN；再绑定正确project/signing，不能在聊天填值 |
| HONOR90Pro运行与性能                         | APK生成后在真实手机安装，记录系统版本/独立启动/1k消息/网络取消/文件导入/性能；本机未连接该设备        |

当前工具可保存配置草稿，不能替用户发布/应用平台设置；没有通过其他代理/远程任务绕过403。审阅保存并发布配置后，先复测对应操作再继续。upstream漏洞仍需可信修复，不由网络放行自动解决。

## 下一步

1. 运行时域名生效后先执行GitHub API read，再planning publisher与draft PR；确认远端CI真实结果。
2. pnpm apk:local恢复ARM64编译；成功后验证APK ABI/内置JS/签名/hash，再由HONOR90Pro真机逐项验收。测试签名不作production发布。
3. 安全绑定EAS项目，运行preview云APK；保留build ID/log/hash/版本/回滚，不能把本地构建等同EAS成功。
4. G0-07上游修复后更新锁文件、重跑audit/check/export；全部Gate0出口通过才进入Gate1，不扩展长期记忆或插件。

当前Hermes工件：`apps/mobile/dist/_expo/static/js/android/entry-907a21cae07e992490bfa68a684be608.hbc`，3174190 bytes，SHA256 `e0e2e522c86994e2d4a67fd53ddc2f0b92ffec38edbe70e52a0c009a8b77a9d5`。本次修改后的冻结安装/完整pnpm check已复验通过，工具入口preflight、规划dry-run与实物卡读取也复验通过；没有把缓存旧APK作为当前结果。

配置工具已确认status=saved、requires_publish=true。最新草稿包含3个域名和EXPO_TOKEN需求（无值），install_script与start_skill保持已测pnpm流程，并补native恢复说明。新配置尚未应用/发布；下次需先检查实际策略再重试阻塞命令。
