# Contributing

项目采用 Apache-2.0；提交贡献须有权提供该代码与资产。不要复制不兼容的第三方实现；引用规范与独立协议实现分开记录，fixtures保留来源/许可/哈希，禁止私人卡片与聊天记录。

从默认分支创建主题分支，关联Issue，小范围PR，人工审阅后合并。未完成技术证明使用draft PR，禁止自动合并。公开格式/API/数据库变化需要迁移说明与失败回滚路径。

Node 24 LTS + pnpm 11.25.0；`pnpm install --frozen-lockfile`。修改依赖时显式更新锁文件。提交前运行：

```sh
pnpm check
pnpm export:android
pnpm audit --audit-level high --prod
```

CI使用最小contents:read权限，外部PR没有构建密钥；EAS仅手动workflow。当前上游high公告不能通过忽略audit解决。实际远端CI、Android native、设备性能分别记录，不得由本地单测代替。

报告命令、版本、通过/失败/跳过/未运行、问题与下一步。变更仅限当前Gate/Issue；未来世界书/记忆/插件不在首阶段实现。参见docs/ROADMAP.md和docs/validation/。
