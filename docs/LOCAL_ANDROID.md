# Gate 0本地Android构建记录与恢复

目标设备：作者提供HONOR 90 Pro，选择arm64-v8a。手机当前Android/MagicOS版本尚未记录，adb未连接设备。minSdk24，compileSdk37，targetSdk36；不宣称真机已运行。

## 当前结果

Expo prebuild已成功；原生Gradle实际执行69个任务，在react-native-screens/worklets的AAR依赖解析处失败。Maven Central将`react-android-0.88.0-release.aar`跳转到`https://repo.reactnative.dev/maven2/...`，代理返回403。**没有生成APK**，更没有验证签名/安装/启动。该域名已补入环境草稿；需要运行时设置生效后再重试。

## 已准备且实际使用的工具

| 工具                   | 版本/位置                                                             |
| ---------------------- | --------------------------------------------------------------------- |
| SDK command-line tools | 23.0，/workspace/.android-sdk/cmdline-tools/23.0                      |
| SDK/Build Tools        | Android37/37.0，Build Tools37.0.0；Gradle另安装36.0.0                 |
| NDK                    | 27.1.12297006                                                         |
| CMake                  | 3.30.5已安装；worklets按配置自动安装3.22.1                            |
| Gradle                 | 9.4.1                                                                 |
| Java                   | Temurin17.0.20.1+1，/workspace/.mobile-ai-rp-native/jdk17；主机另有21 |
| Gradle缓存/配置        | /workspace/.mobile-ai-rp-gradle                                       |
| JVM信任库              | /workspace/.mobile-ai-rp-native/cacerts；系统CA+环境代理CA            |

React Native Gradle插件要求jvmToolchain(17)，最初只有21导致失败，已补17解决，不改上游源码。限制2个Gradle worker、6GiB JVM，ARM64单架构；实例cgroup上限32GiB、CPU quota4。复用有效输出，不四架构重编译。

## 下载验证来源

- Google官方repository2-1.xml中的commandlinetools-linux-16111833_latest.zip（181052239 bytes）：官方SHA1 `e025545c62a8e64c7559119566a569fb1dec5f60` 已比对；SDKmanager正常安装包，未关闭校验。
- Temurin官方jdk-17.0.20.1+1发布文件OpenJDK17U-jdk_x64_linux_hotspot_17.0.20.1_1.tar.gz：官方SHA256 `3808d1d15e3ec6bd5b84057fb5d84c33d8a1536a258146bcea2e603fc726e08e` 已比对。
- Gradle官方gradle-9.4.1-bin.zip.sha256：`2ab2958f2a1e51120c326cad6f385153bb11ee93b3c216c5fccebfdfbb7ec6cb`；将distributionSha256Sum添加到生成的wrapper配置，下载成功并通过校验。

SDK/JDK仅在仓库外准备；没有复制进应用代码或关闭TLS。Java信任库从系统cacerts复制并通过keytool导入NODE_EXTRA_CA_CERTS指向的公开代理CA；默认CA库口令不是应用密钥。代理设置使用环境HTTPS_PROXY解析出的主机/端口，非私有网络绕行。新实例代理CA变化需重建该公开信任配置，不能假定旧证书永远有效。

## 重试入口

```sh
pnpm apk:local --check       # 已运行通过；只检查工具路径，不构建
pnpm apk:local               # 放行repo.reactnative.dev后执行
```

入口由本次实际命令整理：缺原生目录时prebuild，核对Gradle版本/官方checksum，刷新workspace JS bundle后复用native输出assembleRelease，成功后复制到ignored artifacts并验证签名/hash。入口语法和preflight通过，完整入口在域名放行后尚未跑通，不能把它称为成功构建脚本。

当前原生目录由Expo生成且被Git忽略；不将生成的debug.keystore提交Git。不覆盖未来人工维护的原生工程，SDK/config插件变化先审阅再明确重新生成。Release-mode probe默认使用Expo模板DEBUG测试签名；未来真实EAS发布必须独立配置正确签名与application ID。不得当作production版发布。

日志：artifacts/android-release-build.log（缺JDK17）、android-release-build-jdk17.log（AAR403）、android-sdk-install.log。已经下载的SDK/缓存随环境文件保留，但草稿保存不等于发布快照或验证新任务恢复。
