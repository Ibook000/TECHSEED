# 安全政策 | Security Policy

[简体中文](#报告安全问题) · [English](#security-policy)

## 报告安全问题

请勿在公开 Issue、Pull Request 或截图中发布可利用漏洞细节、访问令牌、AI 密钥、`.env` 文件或真实报名信息。

如果仓库启用了 GitHub 私密漏洞报告，请通过仓库的 **Security → Report a vulnerability** 私下联系维护者。若该入口不可用，请通过仓库所有者的 GitHub 个人资料联系维护者，并只提供初步影响范围；确认沟通渠道后再传递复现细节。

报告中请尽可能包含受影响版本、影响范围和安全复现步骤。请在维护者确认并准备好修复前，避免公开披露可直接利用的细节。

## 部署注意事项

- 使用 HTTPS，并为管理员初始密码和 AI 服务密钥设置独立强密钥。
- `data/db.json` 含报名资料和配置密钥，应限制文件访问并加密备份。
- 生产部署前请配置可信反向代理层数，并定期验证备份可恢复。
- 当前 JSON 数据库和内存限流面向单实例部署；多实例部署前应迁移到共享持久化和限流服务。

## Security policy

### Reporting a vulnerability

Do not disclose exploitable vulnerability details, access tokens, AI keys, `.env` files, or real applicant information in public issues, pull requests, or screenshots.

If private vulnerability reporting is enabled for this repository, contact the maintainers through **Security → Report a vulnerability**. If that option is unavailable, contact the repository owner through their GitHub profile and share only a high-level impact summary until a private communication channel is confirmed.

Please include the affected version, impact, and safe reproduction steps where possible. Avoid publishing details that would enable exploitation until the maintainers have acknowledged the report and prepared a fix.

### Deployment guidance

- Use HTTPS and unique, strong values for the initial administrator password and AI provider keys.
- `data/db.json` contains applicant records and configured secrets. Restrict access to the file and encrypt backups.
- Configure the trusted proxy hop count before production deployment, and periodically verify that backups can be restored.
- The JSON database and in-memory rate limiter are designed for a single instance. Move to shared persistence and shared rate limiting before running multiple instances.
