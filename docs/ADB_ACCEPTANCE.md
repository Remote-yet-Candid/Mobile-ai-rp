# Gate 0：ADB网络与设备冒烟验收

此入口只验证合成数据，不实现正式聊天。手机需要USB调试授权给你信任的电脑；指定设备序列号，禁止自动选中其他手机。完成后按需要关闭USB调试。验证APK使用测试证书，正式版将单独管理签名。

## 手动网络验收

电脑运行Node24与`pnpm mock:sse`，使用Android SDK的adb执行：

```sh
adb devices -l
adb -s YOUR_SERIAL reverse tcp:8787 tcp:8787
```

在0.0.2/code2验证壳进入“网络与卡片”，点击“运行ADB网络验收”。这会通过真实`expo/fetch`依次执行完整SSE、首片段后Abort、同一适配器重新请求；只显示completed/cancelledAfterFirstDelta/recovered三个布尔结果。全部为true才通过该冒烟项。“分享网络验收报告”需你主动选择分享目标，报告不含Key、endpoint或聊天文本。

Android网络安全配置只允许127.0.0.1明文HTTP；公网接口继续HTTPS和系统证书校验。没有全局cleartext、信任所有证书、用户CA注入或远程代理绕行。127.0.0.1只有在ADB转发/本机服务可用时才可达；不能将云机loopback地址直接填到远程手机当作服务。

```sh
adb -s YOUR_SERIAL reverse --remove tcp:8787
```

然后停止自己启动的mock服务。网络中断/弱网与手动取消按钮体验仍按HONOR90PRO_ACCEPTANCE执行；自动首片段取消不替代这些用例。

## 自动冒烟入口

安装Python3及Android SDK platform-tools，在仓库根运行：

```sh
python3 scripts/android-smoke.py --serial YOUR_SERIAL \
  --apk artifacts/mobile-ai-rp-gate0-arm64.apk --pages 3
```

如SDK不在云环境默认路径，用ANDROID_HOME指定实际SDK。`--apk`可省略以测试已安装版本；`--pages`范围1–20，20页覆盖1000条。模拟器使用单独的x86_64工件：`pnpm apk:local --abi=x86_64`；HONOR90Pro仍用默认ARM64工件。不同ABI不会覆盖ignored artifacts里的另一份APK。

脚本先检查完整开机，安装/覆盖测试包（不清数据），实际启动App、准备1000合成消息并分页、杀进程重开检查持久化，然后启动自己拥有的mock和ADB转发、点击原生网络验收、读取结果并截图。遇已有8787转发/端口占用则失败而保留原状，不停止别人的进程。不root、不卸载、不清用户数据库。脚本结束清理自己创建的服务和转发。

结果在ignored `artifacts/android-smoke/report.json`及PNG截图。退出0并且status=passed才表示这些步骤通过；启动超时、服务不存在或无法找到UI均为失败，不能把命令已发出作为安装/启动成功。原始截图/报告先审阅，再决定是否作为公开Issue附件，脚本不会自动上传。

模拟器仅提供补充功能证据，软件执行模式耗时不作为手机性能。真机独立启动、长文滚动、20轮冷热性能、弱网、文件选择仍需另行记录。设备系统/ABI由实际getprop读取，不预填HONOR90Pro的Android版本。

## 版本与回退

0.0.2/code2增加该验证入口、127.0.0.1安全规则并移除悬浮窗/广泛外部存储权限；系统文件选择器仍按单文件授权。probe SQLite schema仍为1，无生产schema迁移或重置。保持相同测试签名/包名时可以覆盖升级；从code2降回code1可能被系统拒绝，禁止通过卸载删除数据来掩盖回退问题。未来正式EAS签名与当前测试签名不互通。
