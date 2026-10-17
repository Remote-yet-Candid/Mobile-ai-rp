# Gate 0卡片读取证据

rp-card-codecs为独立可移植数据包，不引用RN、Node文件系统、网络或图像解压。App只负责明确选择本地文件与读取缓存副本；Core仍与UI解耦。

## 支持与未支持

| 内容                                                | 本阶段证据                                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| V2/V3 JSON envelope/required text/arrays/extensions | 独立synthetic tests；未知字段不合并进App配置、不执行                                        |
| PNG tEXt ccv3/chara                                 | CRC与容器边界，双metadata固定V3优先；损坏V3不静默退到V2                                     |
| JSON字段round-trip                                  | 原创fixtures和从实际PNG提取的V3完整字段深比较通过                                           |
| Read真实CCv3                                        | SillyTavern默认Seraphina PNG通过；JSON是从同一实物卡提取/序列化，并非另一张独立原始JSON样本 |
| Render                                              | 只显示名称/spec/错误；不是完整角色编辑器                                                    |
| Prompt/Behavior兼容                                 | 未实现；creator_notes/unknown扩展不自动入Prompt；Lorebook/宏/脚本均未执行                   |
| PNG重新编码/嵌入资产、CHARX、完整V2/V3 schema       | 未实现，不宣称完整规范兼容                                                                  |
| Android文件选择/native运行                          | 接入DocumentPicker/File，类型与Metro导出验证；仍需真机                                      |

限制：文件8MiB、JSON1MiB、预解析嵌套64层、树50000节点、PNG8192块/16MP像素声明。严格UTF-8、base64、CRC、有限且安全整数；对不能可靠round-trip的数字显式拒绝。PNG只读metadata，不解压IDAT，也不证明像素可渲染；zTXt/iTXt卡元数据显式拒绝。V1不在支持范围内。

## 可复现实物样本

`pnpm cards:external` 已实际执行；固定SillyTavern提交`06bde939fb1e9c4c8d8641d810f0a916b5bce127`的`default/content/default_Seraphina.png`。551901 bytes，SHA256 `8a71e8270f54fafbccf905b1bdf053a6a55f57bea89c01fcd8c0e87ee76a2d52`。命中ccv3并记录v3_preferred_over_v2_metadata，4个未知extensions字段完整保留，提取的JSON往返一致。

上游仓库声明AGPL-3.0，credits将Seraphina署名给OtisAlejandro；没有假定素材另有宽松许可。本仓库不分发其图片、角色文本或实现源码，也不把第三方素材重新许可为Apache-2.0。校验仅在外部临时/ignored artifacts/external-card执行，报告只输出来源/hash/类型与计数。脚本按固定SHA256拒绝变化，不修改checksum以让验证通过。CI常规单测完全使用项目独立创作的合成fixture。

另检查RisuAI公开Rika/Yuzu样本，只发现legacy V1的chara payload，未将它们误报为V3验证样本，也未入库。规范依据为MIT许可的CCv3 SPEC（只依据协议独立实现，未复制竞品实现）。

后续G1仍需要更多许可清晰、独立JSON/PNG真实卡、恶意文件及字段/行为级兼容golden；单卡Read证据不能替代完整迁移兼容。
