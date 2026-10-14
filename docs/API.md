# TECHSEED API Reference

[简体中文](#简体中文) · [English](#english)

This reference describes the HTTP API currently implemented by `server.ts`. All routes use the same origin as the web app and are prefixed with `/api`.

## 简体中文

### 认证方式

- **管理员接口**：先调用 `POST /api/auth/login`，再通过 `Authorization: Bearer <token>` 发送返回的管理员 Token。Token 有效期为 12 小时。管理员接口缺少或携带无效 Token 时返回 `401`。
- **学生接口**：报名或进度找回成功后会返回 `studentToken`。访问候选人专属接口时，通过 `X-Student-Token: <studentToken>` 发送。找回流程会轮换 Token，旧 Token 随即失效。
- **候选人 ID**：`/api/candidates/:id` 与 `/api/interviews/:id` 中的 `:id` 都是候选人 ID，不是面试记录 ID。
- **不要把 Token 放进 URL**。URL 可能进入浏览器历史、代理日志或分析系统。

除健康检查、登录、报名、进度找回和公开批次列表外，接口默认要求管理员 Token。学生端公开路由仍会检查候选人 Token，不能仅凭候选人 ID 访问个人资料或面试。

### 接口目录

| 方法 | 路径 | 权限 | 说明 / 主要参数 |
| --- | --- | --- | --- |
| `GET` | `/api/health` | 公开 | 返回服务状态和时间戳 |
| `POST` | `/api/auth/login` | 公开；限流 | JSON：`username`, `password`。成功返回 `token`、用户信息和有效期 |
| `POST` | `/api/auth/change-password` | 管理员 | JSON：`username`, `oldPassword`, `newPassword`；成功后撤销旧会话并返回新 Token |
| `GET` | `/api/auth/users` | 管理员 | 返回管理员账号列表 |
| `GET` | `/api/logo-status` | 公开 | 返回当前组织 Logo 是否存在 |
| `POST` | `/api/upload-logo` | 管理员 | JSON：`dataUrl`，上传组织 Logo |
| `POST` | `/api/admin/clear-data` | 管理员 | JSON：`batchId`；删除指定批次的候选人及关联记录 |
| `POST` | `/api/candidates` | 公开；限流 | JSON：`profile`, `batchId`, `privacyConsentVersion`；成功返回 `201`、候选人资料和学生 Token。重复报名返回 `409` |
| `POST` | `/api/student/recover` | 公开；限流 | JSON：`studentId`, `name`, `phone`；验证后返回候选人资料、面试记录和轮换后的学生 Token |
| `GET` | `/api/candidates` | 管理员 | 支持 `batchId`, `search`, `status`, `grade`, `techDirection`, `sortField`, `sortOrder`, `minScore` 查询参数 |
| `GET` | `/api/candidates/:id` | 学生 Token 或管理员 | 返回候选人资料及面试；学生视图会隐藏联系方式和内部评估信息 |
| `PATCH` | `/api/candidates/:id/status` | 管理员 | JSON：目标 `status`，可选 `operator`, `reason` |
| `POST` | `/api/candidates/:id/admit` | 管理员 | JSON：可选 `operator`, `comment`；人工录取候选人 |
| `POST` | `/api/candidates/:id/reject` | 管理员 | JSON：可选 `operator`, `reason`；记录人工审核结果 |
| `POST` | `/api/candidates/:id/manual-review` | 管理员 | JSON：`result`, `reviewerName`, `overallEvaluation` |
| `DELETE` | `/api/candidates/:id` | 管理员 | 删除候选人及关联记录 |
| `POST` | `/api/candidates/:id/notes` | 管理员 | JSON：`authorId`, `authorName`, `content` |
| `POST` | `/api/candidates/:id/join-confirm` | 学生 Token 或管理员 | 候选人确认已加入招新群；仅符合状态要求的候选人可执行 |
| `POST` | `/api/interviews` | 学生 Token 或管理员 | JSON：`candidateId`；开始或恢复该候选人的面试 |
| `GET` | `/api/interviews/:id` | 学生 Token 或管理员 | 返回候选人的面试记录；学生视图不包含内部分析字段 |
| `POST` | `/api/interviews/:id/answer` | 学生 Token 或管理员；限流 | JSON：`answer`, 可选 `submissionId`；单次回答最多 4000 个字符 |
| `POST` | `/api/interviews/:id/complete` | 学生 Token 或管理员；限流 | 完成面试并生成评估；没有非空候选人回答时返回 `409` |
| `GET` | `/api/evaluations/:candidateId` | 管理员 | 返回完整 AI 评估报告 |
| `GET` | `/api/dashboard/stats` | 管理员 | 可用 `batchId` 限定统计批次 |
| `GET` | `/api/recruitment-batches` | 公开 | 返回招新批次列表 |
| `POST` | `/api/recruitment-batches` | 管理员 | 创建招新批次；需提供批次名称和年份 |
| `PATCH` | `/api/recruitment-batches/:id/active` | 管理员 | 将指定批次设为当前启用批次 |
| `GET` | `/api/wechat-qr?candidateId=:id` | 学生 Token 或管理员 | 获取该候选人所属批次的群二维码；资格不符时不会返回可用二维码 |
| `GET` | `/api/wechat-qr?adminMode=true` | 管理员 | 返回所有批次的二维码 |
| `GET` | `/api/wechat-qr?batchId=:id` | 管理员 | 返回指定批次的二维码；不带候选人 ID 的查询必须使用管理员 Token |
| `POST` | `/api/wechat-qr` | 管理员 | 创建或更新二维码；可配置批次、标题和有效期 |
| `DELETE` | `/api/wechat-qr/:id` | 管理员 | 删除二维码；可用 `batchId` 限定批次 |
| `GET` | `/api/prompts` | 管理员 | 列出 AI 提示词配置 |
| `PATCH` | `/api/prompts/:id` | 管理员 | JSON：`prompt`, 可选 `updatedBy` |
| `GET` | `/api/ai-settings` | 管理员 | 返回 AI 配置状态；API Key 以掩码形式返回 |
| `PATCH` | `/api/ai-settings` | 管理员 | 更新主模型或备用模型配置；API Key 不会在响应中明文返回 |
| `GET` | `/api/export/candidates.csv` | 管理员 | 可用 `batchId` 限定导出批次；导出包含报名个人信息 |

### 请求与错误

- JSON 请求使用 `Content-Type: application/json`。
- 常见错误状态：`400` 参数无效、`401` 未认证、`403` 无候选人操作资格、`404` 记录不存在、`409` 状态冲突或重复报名、`413` 请求内容过大、`429` 请求过于频繁。
- `429` 响应包含 `Retry-After`。公开报名、登录、找回和面试提交接口均有限流。
- 候选人导出、评估报告与管理员接口包含敏感数据；不要把真实响应粘贴到公开 Issue、截图或日志中。

## English

### Authentication

- **Admin routes:** call `POST /api/auth/login`, then send its token as `Authorization: Bearer <token>`. Admin tokens expire after 12 hours.
- **Applicant routes:** registration and account recovery return a `studentToken`. Send it as `X-Student-Token: <studentToken>`. Recovery rotates the token and invalidates the previous one.
- The `:id` in `/api/candidates/:id` and `/api/interviews/:id` is the **candidate ID**.
- Never put tokens in URLs. URLs can be recorded in browser history, proxy logs, and analytics systems.

The endpoint table above lists all routes and their access requirements. Public student routes still verify the per-candidate token before exposing or changing private data. Admin-only routes require a valid admin token.

All JSON endpoints accept `Content-Type: application/json`. Common error statuses are `400`, `401`, `403`, `404`, `409`, `413`, and `429`; rate-limited responses include `Retry-After`. The CSV export and evaluation reports contain sensitive applicant data and must be handled as confidential records.
