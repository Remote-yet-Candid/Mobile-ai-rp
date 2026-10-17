# Android构建和真机验收

当前只有Android Hermes bundle导出能力；没有已生成/安装的APK。EAS云构建不要求本机Android SDK，但需要Expo账户、项目绑定及Android签名。不要把Key/token发送到聊天或提交Git。

1. 在正式构建任务中安全配置EXPO_TOKEN或使用已授权CLI登录。核对账户权限后，在apps/mobile用`eas init`绑定正确项目，审阅生成的extra.eas.projectId，不编造ID。
2. `dev.mobileairp.gate0`是实验package ID；公开发布前确认归属/最终application ID与升级连续性，不能随意改变已安装用户的签名/ID。
3. 配置签名（交互式首次配置/安全管理），GitHub android-preview environment中存最小权限EXPO_TOKEN并建议限制可构建分支与人工review。外部PR不给密钥。
4. 在仓库根运行`pnpm install --frozen-lockfile && pnpm check && pnpm export:android`；高危audit未修复禁止声称合并/发布就绪。
5. 在apps/mobile运行`eas build --platform android --profile preview --non-interactive`。preview是APK、production是AAB；non-interactive要求项目和签名均已提前准备。两者工具版本由eas.json固定，EAS实际镜像/日志另存。
6. 保存build ID/URL/commit/日志/APK SHA-256/版本/已知限制/回退APK。真正构建成功再填写，不提交token或签名文件。

手动workflow `.github/workflows/android-preview.yml` 不会在普通PR/推送时耗费构建额度。它会检查账户/绑定前置，未配置即失败；workflow定义完成不表示实际远端运行通过。

## 真机记录模板

- 设备/Android/API/内存：未记录
- APK build ID、commit、版本、hash、构建镜像：未生成
- 独立安装/冷启动（无Metro）：未验证
- SQLite准备1000消息、50条分页、滑动、关闭重开：未验证
- expo/fetch模拟/真实网络流收取、取消、弱网、断流：未验证
- 真实CCv3 JSON/PNG导入与来源：未验证
- 冷热20次/P95/FPS/内存原始日志：未记录
- 升级/卸载数据策略/回退：未验证

Lab内模拟是进程内SSE，不替代网络或真机验证。首次APK验收由持有Android设备的人按上述清单完成，问题回填对应Issue。
