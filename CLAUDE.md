# TECHSEED AI 招新系统

xxxxx学院学生会技术部 AI 招新系统。前端使用 React、TypeScript 与 Vite，后端使用 Express，数据存储在本地 JSON 文件中。

## 开发约定

- 延续现有 React、TypeScript、Express 和 TailwindCSS 技术栈，保持学生端与管理端交互一致。
- 修改 API 时同步检查前端调用、类型定义与 README 使用说明。
- 保持候选人状态流转和管理端人工审核流程清晰；AI 评分仅作辅助参考。
- UI 中的学校名称统一读取 `VITE_ORGANIZATION_NAME`，未配置时使用“xxxxx学院”。

## 数据与凭据

- 不提交 `.env`、真实 API Key、运行时数据库文件或候选人个人资料。
- 涉及报名资料、登录凭据、导出和找回流程时，优先保护最小必要数据与访问范围。
- 生产环境使用 HTTPS；部署配置和真实运行数据不应写入公开文档。

## 验证

- 类型检查：`npm run lint`
- 前端与服务端构建：`npm run build`
