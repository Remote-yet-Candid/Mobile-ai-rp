# Codex Cloud任务启动

使用`/workspace/Mobile-ai-rp`现有checkout。每个任务已隔离，不主动创建worktree。先读AGENTS.md、PRD、ARCHITECTURE、GATE0_PLAN及最新validation记录，检查Git状态，保留已有改动。当前分支已正式初始化，不再按空仓库/npm流程处理。若新任务选择尚未合并本PR的main、仍无package.json，应切换到获授权的工作分支或先审阅合并；不要当作项目损坏，也不要在启动步骤重复初始化。

环境基线Node24 LTS（24.19.0）、pnpm11.25.0、Git。若`/workspace/.mobile-ai-rp-cli/node_modules/.bin/pnpm`存在，在每个需要的shell将该目录加到PATH。依赖恢复执行`bash /workspace/Mobile-ai-rp/scripts/cloud-install.sh`；使用pnpm锁文件，不创建npm锁文件，不执行EAS初始化或修改应用配置作为安装步骤。

从仓库根运行`pnpm check`，当前基线87项测试通过、0失败/跳过；`EXPO_NO_TELEMETRY=1 CI=1 pnpm export:android`验证Android Hermes bundle。`pnpm audit --audit-level high --prod`是独立合并门槛，当前存在未修复上游high，不能关闭或伪称通过；见validation。若新增测试，按实际计数记录，不硬套旧计数。

测试/导出无需常驻服务、LLM Key或Android SDK。需要交互开发时，在apps/mobile运行`EXPO_NO_TELEMETRY=1 CI=1 pnpm exec expo start --offline --localhost --port 8081`；查看启动日志，使用本地请求验证Metro，再用模拟器/真机做UI验收。不能仅以端口/PID认定应用工作；不能创建面向用户的localhost预览链接。进程不会随快照恢复，需要时重新启动。

可选HTTP模拟服务：根目录`pnpm mock:sse`（loopback8787）。GET /health应为status=ok；POST /v1/chat/completions应收到Unicode text_delta的SSE和[DONE]。停止仅限自己启动的服务。App当前使用进程内mock；该HTTP服务不会自动连接手机。

EAS账户/项目/签名及APK/网络/卡片/性能验收状态以docs/validation/gate0-adb-acceptance.md及后续报告为准；host实物CCv3读取不代表native通过。参照ANDROID_BUILD，不在聊天、Git或EXPO_PUBLIC写入凭据。已有Git读权限不证明GitHub API写权限；按网络状态与操作错误诊断，复用平台认证，不因gh登录提示就索要PAT。

GitHub API需api.github.com、Expo API需api.expo.dev、本地原生AAR需repo.reactnative.dev；先核实实际网络策略，不能以草稿推断运行状态。2026-10-17发布后GitHub权限已验证、5里程碑/20Issues与draft PR #21已创建。后续补齐任务先运行`pnpm planning:publish --dry-run`再按已授权目标运行`pnpm planning:publish`创建/复用5里程碑和20Issues。任务规格在.github/planning.json；不要重复创建已有plan标记任务。所有代码通过主题分支和一个可审阅PR，CI和人工审阅后合并，不直接推main。

可选native构建已准备JDK17/SDK/缓存，目标HONOR90Pro ARM64。`pnpm apk:local --check`检查路径；`pnpm apk:local`恢复构建。工具位置和代理CA配置见LOCAL_ANDROID.md；副本/缓存应保留在仓库外。检查缓存、代理与当前CA仍有效后再构建；不要给失败run配旧APK。EXPO_TOKEN仅通过设置安全配置；变量存在/状态ready不证明Expo接受，需实际eas whoami。不要输出值、读取凭据文件或因占位符外观认定令牌无效；根据服务端认证结果诊断。host测试与本地构建无需Expo令牌。最新报告入口为docs/validation/gate0-adb-acceptance.md，设备验收见docs/HONOR90PRO_ACCEPTANCE.md。

code2新增ADB网络验收与显式serial的Python冒烟入口，见docs/ADB_ACCEPTANCE.md；mock可用MOCK_INTERVAL_MS=1000降低发送频率供人工取消。可选x86_64构建用pnpm apk:local --abi=x86_64，绝不覆盖ARM64工件。云机无KVM的API35软件模拟启动曾在system_server出现ANR，不能拿该结果当手机/App失败；未满足完整开机前置时不运行UI用例。模拟器是可选补充，真实HONOR90Pro出口必须单独验收。
