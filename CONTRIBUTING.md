# 贡献指南

感谢你愿意改进 TECHSEED。欢迎提交 bug 报告、文档修正和代码改进。

## 开始开发

1. 使用 Node.js 22.12 或更新的 LTS 版本。
2. 运行 `npm ci` 安装 lockfile 中固定的依赖。
3. 复制 `.env.example` 为 `.env`，设置 12–128 个字符的 `ADMIN_DEFAULT_PASSWORD`。
4. 运行 `npm run dev` 启动本地开发服务。

## 提交前检查

```bash
npm run lint
npm run audit
npm run build
```

Pull Request 会由 GitHub Actions 在 Node.js 22 和 24 上自动执行相同检查。请说明改动动机、用户可见变化和手工验证步骤。

## 数据与隐私

- 不要提交 `.env`、`data/db.json`、学生信息、AI 密钥或其他运行时数据。
- 新功能应尽量减少收集和暴露的个人信息；修改学生可见数据或 AI 处理流程时，请在说明中写明影响。
- 修改报名信息用途说明时，请同步更新 `REGISTRATION_CONSENT_VERSION`，以便留存记录能对应到用户确认的文案版本。
- 不要使用真实学生档案作为开发或演示数据。
