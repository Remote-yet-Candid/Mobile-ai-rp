# API兼容矩阵（实验性）

| 能力                                 | 当前范围       | 证据/限制                                    |
| ------------------------------------ | -------------- | -------------------------------------------- |
| OpenAI chat/completions文本SSE       | 合同spike      | host模拟；真实后端与Android未验证            |
| system/user/assistant                | 已编码公共子集 | 无tool/multimodal/seed/cache承诺             |
| developer role                       | 显式拒绝       | capabilities.developerRole=false             |
| UTF-8分块、CR/LF、multi-data、DONE   | 合同测试       | 仅声明实际测试通过的情况                     |
| usage / finish_reason                | 有限映射       | schema异常报错                               |
| 401/403/429/5xx、断流、取消、timeout | 测试覆盖       | 错误不输出服务端敏感body，无自动重连重复生成 |
| 自定义Provider能力探测/真实窗口      | 未实现         | contextWindow由未来模型配置/探测提供         |
| Anthropic/Gemini/OpenRouter特色/补全 | P2             | 未实现                                       |

适配器默认HTTPS，禁止URL内认证/query/fragment和重定向；仅测试显式允许HTTP loopback。真实LAN例外需要App警告与信任范围，尚未实现。

Gate1必须两种不同OpenAI-compatible后端smoke，不以一个mock称为所有网关兼容。协议/格式支持与触发行为等效分别定义。Read、Render、Prompt-compatible、Behavior-compatible、Round-trip都要附各自证据。

当前timeoutMs是整个生成请求的总deadline（默认30秒），不是idle timeout；真实模型应用集成时需显式配置并进行长输出/弱网验证。
