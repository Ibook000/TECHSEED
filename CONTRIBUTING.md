# 贡献指南 | Contributing

[简体中文](#贡献流程) · [English](#contributing)

## 贡献流程

欢迎提交 Bug 报告、文档修正和代码改进。小型改动可以直接发起 Pull Request；较大的功能改动建议先开 Issue 讨论范围，避免重复劳动。

1. Fork 仓库并创建功能分支。
2. 在本地完成改动，避免提交真实报名数据、密钥或运行时文件。
3. 提交前运行下方检查，并在 PR 中说明动机、用户可见变化和手工验证步骤。
4. 确认 CI 检查通过后提交 Pull Request。

## 本地开发

1. 使用 Node.js 22.12 或更新的 LTS 版本。
2. 运行 `npm ci` 安装 lockfile 中固定的依赖。
3. 复制 `.env.example` 为 `.env`，设置 12–128 个字符的 `ADMIN_DEFAULT_PASSWORD`。
4. 运行 `npm run dev` 启动本地开发服务。

提交前运行：

```bash
npm test
npm run lint
npm run audit
npm run build
```

Pull Request 的 GitHub Actions 会在 Node.js 22 和 24 上执行这些检查，并运行 CodeQL 静态安全扫描。当前单元测试覆盖评分、身份信息脱敏、密码策略和审核结果校验；如果改动核心状态流转或权限逻辑，请在 PR 中说明测试覆盖和手工验证步骤。

## 数据与隐私

- 不要提交 `.env`、`data/db.json`、学生信息、AI 密钥或其他运行时数据。
- 新功能应尽量减少收集和暴露的个人信息；修改学生可见数据或 AI 处理流程时，请在说明中写明影响。
- 修改报名信息用途说明时，请同步更新 `REGISTRATION_CONSENT_VERSION`，以便留存记录能对应到用户确认的文案版本。
- 不要使用真实学生档案作为开发或演示数据。

## Contributing

Bug reports, documentation fixes, and code improvements are welcome. For small changes, you can open a pull request directly. For larger features, please open an issue first to agree on scope and avoid duplicated work.

1. Fork the repository and create a feature branch.
2. Make your changes locally. Do not include real applicant records, secrets, or runtime data.
3. Before opening a pull request, run the checks below and describe the motivation, user-visible changes, and manual verification steps.
4. Open a pull request after the CI checks pass.

### Local setup

1. Use Node.js 22.12 or a newer LTS release.
2. Run `npm ci` to install the locked dependencies.
3. Copy `.env.example` to `.env` and set a unique `ADMIN_DEFAULT_PASSWORD` of 12–128 characters.
4. Run `npm run dev` to start the local development server.

Run these checks before submitting:

```bash
npm test
npm run lint
npm run audit
npm run build
```

GitHub Actions runs these checks on Node.js 22 and 24 and performs CodeQL static analysis. Current unit tests cover scoring, identifier redaction, password policy, and review decision validation. For changes to core state transitions or authorization, describe relevant test coverage and any manual verification in the pull request.

### Data and privacy

- Never commit `.env`, `data/db.json`, applicant information, AI keys, or other runtime data.
- Minimize the collection and exposure of personal information. Explain the impact when changing applicant-facing data or AI processing.
- If you change the purpose statement shown during registration, update `REGISTRATION_CONSENT_VERSION` so consent records stay linked to the correct text.
- Never use real applicant records for development or demos.
