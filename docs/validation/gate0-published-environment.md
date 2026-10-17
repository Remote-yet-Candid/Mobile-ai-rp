# Gate 0：环境发布后继续执行

历史记录：code2与模拟器诊断等最新结果见[ADB验收后续报告](gate0-adb-acceptance.md)。以下保留code1原始工件证据。

日期2026-10-17，分支feat/gate0-foundation，代码基线b79d84b。Gate0仍在进行，未进入Gate1。

## 环境与远端协作

运行时spec revision 2与observed revision一致、observations_current=true、connected。restricted/enforced策略实际含api.github.com、api.expo.dev和repo.reactnative.dev；保留平台代理和TLS验证。

当前实例实际版本：Node24.19.0 LTS、npm11.9.0、pnpm11.25.0、Git2.52.0、gh2.46.0、Temurin17.0.20.1+1；Expo58.0.14/RN0.88.0/TS6.0.3沿用冻结锁文件。原生工具校验来源见LOCAL_ANDROID。

- GitHub API实际返回仓库admin/maintain/push权限。5里程碑和20Issues创建成功，重复运行复用现有对象，API复核仍为5和20，未产生重复任务。回执见[github-planning-receipt.json](github-planning-receipt.json)。
- [草稿PR #21](https://github.com/Remote-yet-Candid/Mobile-ai-rp/pull/21)已创建；保留草稿，不推main、不自动合并、不将未验收Issue关闭。
- 首次publisher失败于gh2.46.0不支持--slurp，尚未进行远端写入。修正为--paginate配合逐项JSON Lines输出后发布与重复执行成功；不依赖最新gh独有参数。
- [远端CI b79d84b](https://github.com/Remote-yet-Candid/Mobile-ai-rp/actions/runs/39016499715)的jobs/steps API确认：frozen install、pnpm check和Android export均success；audit步骤failure。日志压缩包跳转results-receiver.actions.githubusercontent.com被策略拒绝，因此不声称读取完整日志；步骤状态与本地audit独立复核一致。
- EXPO_TOKEN变量存在，配置状态ready，但EAS25.1.1实际whoami返回“The bearer token is invalid”。ready仅说明配置交付状态，不能证明Expo接受凭据。未将令牌写入日志或Git，未编造account/project ID。
- 使用同一受支持代理路径对api.expo.dev/graphql进行独立只读meActor请求，服务端同样返回AUTHENTICATION_ERROR、isTransient=false。不是根据本地占位符外观判定令牌有效性。
- 已更新并保存start_skill启动说明草稿，移除旧的“域名仍403/令牌未配置”假设，改为按实际服务响应及最新报告判断；install_script、网络域名和凭据绑定未变。草稿保存未发布，也不妨碍当前实例继续工作。

## 本次检查

| 检查                                 | 结果                                                                                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pnpm check                           | 退出0；格式/lint/secret/boundary/types通过；7文件83测试，0失败/跳过。日志artifacts/check-published.log与check-published-final.log（最终复验同为83通过） |
| pnpm planning:publish                | 创建5里程碑/20Issues；第二次退出0且数量不变                                                                                                             |
| pnpm audit --audit-level high --prod | 退出1；2 high，metadata另1 moderate。node-forge/braces暂无patched_versions；registry latest分别仍1.4.0/3.0.3；保留门槛                                  |
| EAS whoami                           | 退出1；已到达Expo，但bearer token invalid；云端构建未提交                                                                                               |
| pnpm apk:local                       | 退出0；bundle子任务54s，assembleRelease 6m45s，530任务（467执行/63缓存）；APK签名验证通过                                                               |

Android导出本次退出0（1408模块、内置Hermes工件），日志artifacts/export-published.log。本地mock服务在本实例重新启动，通过GET /health与POST中文SSE/[DONE]检查后已停止；仅loopback功能验证，不算手机网络证据。adb devices -l无连接设备。

## 本地APK工件

文件：artifacts/mobile-ai-rp-gate0-arm64.apk，34278797 bytes（约32.7MiB）。应用源码基线b79d84b；本次其后的改动仅规划脚本与文档，不改变App/packages/锁文件。

- SHA256：`87e7debed20137d29e734195fd1f3420f719a8e36ca2be4e5710d8cd8976d93e`。
- 包名dev.mobileairp.gate0、0.0.1/code1、minSdk24/target36；aapt2确认无application-debuggable，唯一native ABI为arm64-v8a。
- ZIP全部条目CRC检查、zipalign -c -P 16 4均通过；内置assets/index.android.bundle为2593784-byte Hermes字节码，校验头与SHA256完成。无需Metro的结构前置已确认，但不能由此推断实际冷启动成功。
- apksigner verify通过v2签名，证书CN=Android Debug；证书SHA256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`。这是本地Release-mode测试签名，绝非EAS/production构建。私钥/keystore与APK均不入Git。
- 当前绑定令牌值未在受检bundle/json/xml/dex条目中发现；这不是通用密钥泄漏审计，仍保持仓库secret检查。
- 首次临时工件断言按旧aapt字段sdkVersion读取，遇新版输出minSdkVersion而失败；修正验证命令后全部通过，未改变APK或放松24/36要求。
- 详细可追溯数据见[android-apk-validation.json](android-apk-validation.json)，原始日志artifacts/android-local-bundle.log、android-local-build.log、android-apk-badging.txt、android-apk-manifest.txt。

## 下一步与退出门槛

本地ARM64构建与工件静态核验完成；接下来按[HONOR90Pro验收单](../HONOR90PRO_ACCEPTANCE.md)实际安装运行。host通过不替代真机网络取消、SQLite/FlashList分页、卡片选择和性能证据。

EAS需在安全环境设置替换有效EXPO_TOKEN，再核实whoami、正确账户下项目绑定与签名，运行preview APK并记录build ID/log/hash。当前凭据不能完成这一步；不要把值发在聊天。

上游high漏洞跟踪[Issue #7](https://github.com/Remote-yet-Candid/Mobile-ai-rp/issues/7)。未使用ignore、不受信fork或虚假版本以使CI变绿。全部Gate0出口通过并人工审阅后才进入Gate1。
