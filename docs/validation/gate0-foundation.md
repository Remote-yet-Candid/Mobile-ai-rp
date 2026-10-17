# Gate 0第一阶段验证报告

日期：2026-10-17（Asia/Shanghai）。范围：foundation + 可执行风险spike。**Gate 0未通过；非可发行APK。**

## 基线与设计

初始仓库仅README，工作区干净；起点`435dc1fb8d1ceafcdc51bd322c037c1ded657624`与远端main一致。所有开发在`feat/gate0-foundation`，不向main直接提交，不自动合并。原文完整读入并逐字保存到docs/design/source-v1.0.md，SHA256为`0b84f34dfdd676b37d226b6c1a7dc51f23d617f57c35d22d1bbbdce2e3ade96c`。作者在本次会话明确选择Apache-2.0。

## 环境与选型

| 项目                        | 实测/固定版本                          |
| --------------------------- | -------------------------------------- |
| OS / 架构                   | Linux x64                              |
| Node / npm / Git            | 24.19.0 LTS / 11.9.0 / 2.52.0          |
| pnpm / TypeScript / Vitest  | 11.25.0 / 6.0.3 / 5.0.5                |
| Expo / React Native / React | 58.0.14 / 0.88.0 / 19.3.0              |
| FlashList / expo-sqlite     | 2.3.2 / 58.0.13                        |
| Host SQLite engine          | 3.53.3（Node内置，不是手机native版本） |
| 可用资源快照                | 5个CPU；约34GB RAM；约30GB可用磁盘     |

正式方案采用pnpm，替代先前空仓库环境中npm工具安装流程；固定一套pnpm锁文件。依赖按官方Expo包bundledNativeModules.json/模板选择，保持TLS、完整性及pnpm供应链校验；初装一次npm工件503由下载器重试成功，没有修改checksum或关闭验证。

## 实际结果

| 命令/操作                                          | 结果                           | 证明与边界                                                                  |
| -------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------- |
| git ls-remote origin HEAD refs/heads/main          | 通过                           | scoped Git读取正常；不据此推断API权限                                       |
| pnpm install --frozen-lockfile（cloud-install.sh） | 退出0                          | 锁文件复现、workspace依赖、TS包构建；日志artifacts/frozen-install.log       |
| pnpm check                                         | 退出0                          | format、lint、敏感文件/已知token模式、核心边界、全包/App/测试类型检查、单测 |
| pnpm test（check内执行）                           | 58通过 / 0失败 / 0跳过，6文件  | 日志artifacts/check.log；不是Android人工验收                                |
| pnpm export:android                                | 退出0                          | Metro 1383 modules，Hermes bundle与27资产；不是APK                          |
| expo install --check（EXPO_OFFLINE=1）             | 退出0，Dependencies up to date | CLI同时警告离线校验不全面；不声称在线doctor已通过                           |
| 独立mock服务GET /health与POST /v1/chat/completions | 通过                           | 200、4段Unicode delta、[DONE]；只在loopback，完成后停止了自己启动的服务     |
| planning publisher --dry-run / JSON一致性          | 通过                           | 5里程碑、20唯一计划ID、合法引用；**未创建远端任务**                         |
| 源方案字节比对                                     | 通过                           | 原附件与入库文件完全相同                                                    |
| Git新分支push dry-run                              | 通过                           | 写入通道预检查；最终远端分支以实际push/ls-remote为准                        |
| pnpm audit --audit-level high --prod               | **退出1**                      | 两项上游high公告；metadata还报告1 moderate，见下方；CI保留阻塞              |
| GitHub REST/GraphQL                                | **代理403**                    | api.github.com CONNECT拒绝；gh登录提示不证明需新增PAT                       |
| 远端PR / Issues / milestones                       | **本次未创建**                 | API阻塞；提交分支和可发布任务规格不等于已存在GitHub对象                     |
| EAS APK / Android真机 / expo/fetch网络             | **未验证**                     | EXPO_TOKEN未配置、无project ID/签名、无连接设备                             |
| 真实CCv3 JSON/PNG                                  | **未实现**                     | codecs仅预留契约；不以合成数据冒充真实卡                                    |

核心测试覆盖固定快照、估算警告、预算边界/非法测量和确定性；边界负例覆盖RN/Expo/文件系统/包装库/fetch/Date/Math.random/动态与越界导入。Provider覆盖真实host HTTP请求、bytewise UTF-8、CR/LF、多data、usage/DONE、断流、401/403/429/5xx、取消、超时、脱敏与不自动重复生成。SQLite覆盖1k消息重开持久化、20页无重无漏、索引、回滚/约束、非法分页与10%长CJK数据。native mock也通过同一结构化streaming port验证；不依赖RN全局Response支持stream body。

敏感文件检查只检查候选仓库内容中的已知Key模式/签名/环境文件，不等同完整历史扫描或安全认证。没有写入真实凭据/聊天。

补充：用预装EAS CLI 25.1.1所带`@expo/eas-json`的`EasJsonSchema.validate`实际校验`apps/mobile/eas.json`，无schema错误，preview=apk / production=app-bundle；未调用账户或云构建API。

## 本阶段发现与修正

1. 初次测试找不到root workspace fixture与Array.fromAsync测试类型；补显式workspace dev依赖与Node测试ESNext类型，修正HTTP RequestListener类型。
2. Vite8/OXC不能解析Expo tsconfig包简写；改为App局部node_modules中官方base.json的显式路径。TS与测试均重验。
3. SQL `INSERT OR IGNORE`会吞掉CHECK错误，约束测试确实失败；改为仅ON CONFLICT(sequence) DO NOTHING，非法role测试通过，不用关闭断言解决。
4. 检查Expo/RN运行时发现全局Response不保证接受stream；传输端口采用结构类型，native mock直接提供body/headers，避免依赖Node Response行为。
5. EAS project:info没有--non-interactive选项；按实际CLI help修正workflow，仍未运行真实账户操作。

## 依赖安全阻塞（G0-07）

- `node-forge` 1.4.0：high，[公告](https://github.com/advisories/GHSA-86w9-cpqp-85rv)；扫描未报告已修复版本。
- `braces` 3.0.3：high，[公告](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)；扫描未报告已修复版本。

npm view当前最高版本仍为node-forge1.4.0和braces3.0.3；暂无可安装可信修复版。依赖路径主要为Expo CLI/code-signing与Metro/micromatch工具链，业务Core不导入这些包；这不使high扫描自动通过。保留审查、CI audit失败与公开跟踪，不任意加入ignore/unsafe override或未审计fork。上游修复后再更新锁文件并重跑check/export/audit。

## GitHub与云配置

api.github.com域名补充已保存到环境草稿，尚未生效，最新实例策略仍为enforced且无自定义允许域名；沿用平台Git认证，不提取token。机器规格在.github/planning.json，publisher按plan marker幂等创建/复用任务并保留编辑/关闭状态；远端运行仍需网络/权限实际验证。PR文本在.github/gate0-pr.md，供创建draft PR使用；在远端PR成功前不宣称本阶段通过PR审阅。

配置工具已返回status=saved、requires_publish=true，且读回逐字匹配。云install/start内容更新为scripts/cloud-install.sh和docs/CLOUD_START.md对应的正式pnpm流程；配置草稿保存、运行时应用、发布快照和新任务恢复是不同状态，以工具成功与实际任务测试为准，不声称已经重新发布。

## 下一步与退出门槛

1. 在环境设置保存api.github.com放行（并保留api.expo.dev），复测实际API；发布20Issues/5里程碑、建立draft PR并核对Actions结果。
2. G0-07跟进可信依赖修复；没有修复前保持合并阻塞。
3. G0-05取得许可清晰真实CCv3卡并实现JSON/PNG安全读入，记录来源/hash/兼容等级。
4. G0-06安全绑定EAS账户/项目/签名，生成APK并按ANDROID_BUILD真机安装；G0-03/04补真实expo/fetch网络、取消、1k SQLite/FlashList/持久化及设备性能。
5. 所有Gate0退出条件审阅通过后，才进入Gate1正式30轮聊天与生产存储/安全/Inspector；Gate2/3/P2目标完整保留在ROADMAP及原文。

本次导出工件：`apps/mobile/dist/_expo/static/js/android/entry-dc5b53594c5fa0d2e1af4b8cf38961d8.hbc`，3095030字节，SHA256 `d7e193ec3a14f25d7f7b6b95a06e95f1f2ac432296415e5e665fd39ee3d647ef`。构建输出在ignored dist；以后每次导出应按当前工件重新记录，不把host导出耗时当手机基准。

## 远端分支交付补记

`git push --set-upstream origin feat/gate0-foundation`实际成功。随后`git ls-remote origin refs/heads/main refs/heads/feat/gate0-foundation`确认代码提交`0843a4b7df204a4f4cecf791d4d7782aee05f795`已到远端主题分支，main仍为`435dc1fb8d1ceafcdc51bd322c037c1ded657624`。该补记仅修改文档，后续提交继续fast-forward到同一分支，不直接推main。

Actions workflow随分支推送可能自动触发，但由于GitHub API被拒绝，其远端运行结果**未查询/未验证**，不能称未运行或已通过。本次尚未通过API创建PR/Issues/milestones。可用GitHub返回的[创建PR入口](https://github.com/Remote-yet-Candid/Mobile-ai-rp/pull/new/feat/gate0-foundation)，正文已保存在.github/gate0-pr.md；该入口不是已存在的PR链接。
