# 威胁模型 v0 / Gate0

资产：用户Key、聊天/角色/事实、SQLite/WAL/附件、导出、签名凭据与构建供应链。边界：App/native安全存储、纯Core、用户选择API、外部卡/ZIP/Markdown、不可信PR、EAS/GitHub。

| 输入/风险               | 强制策略                                                           | 当前状态                              |
| ----------------------- | ------------------------------------------------------------------ | ------------------------------------- |
| Key泄露                 | SecureStore按profile引用；不进SQL/导出/日志/EXPO_PUBLIC；脱敏诊断  | 未接入真实Key；Gate1安全实现待验      |
| 自定义endpoint/重定向   | HTTPS默认、拒嵌入凭据/URL query，禁止认证随重定向                  | 适配器合同覆盖；LAN例外未实现         |
| 卡片Prompt影响/代码执行 | unknown保留不执行、creator_notes不默认prompt、无文件/网络/扩展能力 | codec未实现；威胁测试Gate1/2          |
| PNG/CHARX资源           | 尺寸/解压预算、路径/类型白名单、Zip Slip/Bomb与外链提醒            | 未实现                                |
| Markdown与正则          | 禁HTML/脚本/远程自动资源；安全正则与限时                           | 未实现                                |
| 外部PR/依赖             | CI contents:read；无密钥；锁文件/供应链校验/audit                  | audit存在上游high，禁止忽略后宣称通过 |
| 断流/进程退出           | 超时/abort分类，不自动重复生成；事务/未完成状态恢复                | host合同/探针事务覆盖；native恢复待验 |
| Prompt/日志隐私         | 默认不持久化完整Prompt和文本，不上传聊天/资产路径                  | 当前验证无真实聊天；Inspector后续审计 |

SecureStore不能保护已root/解锁的整个系统，也不是完整备份。native资源权限由App强制，core边界脚本不是执行第三方代码的sandbox。默认不做任意JS插件或官方账号服务。完整删除/WAL生命周期与用户授权脱敏导出留待生产存储Issue。
