# Minecraft 白名单申请系统

基于 Node.js 的白名单申请管理系统，集成 MCDR Whitelist API。

## 功能特点

- 🎮 **前台申请**：玩家可提交白名单申请
- 🔍 **信息验证**：支持 QQ 信息和 MC 皮肤预览
- 🔧 **后台管理**：审核申请、手动添加白名单
- 📧 **邮件通知**：申请通过后自动发送邮件到 QQ 邮箱
- 💾 **数据存储**：使用 SQLite 数据库存储申请记录
- 🎨 **精美 UI**：现代化的界面设计

## 端口说明

- **前端页面**：http://localhost:11451
- **后台管理**：http://localhost:11452 (或 http://localhost:11451/admin)

## 安装步骤

1. 安装依赖
```bash
npm install
```

2. 配置环境变量（可选）

复制 `.env.example` 为 `.env` 并修改配置：
```bash
cp .env.example .env
```

编辑 `.env` 文件：
```
# MCDR Whitelist API 配置
MCDR_API_URL=http://your-mcdr-server:23333
MCDR_API_TOKEN=your_token_here

# 163 邮箱配置
EMAIL_HOST=smtp.163.com
EMAIL_USER=your_email@163.com
EMAIL_PASS=your_smtp_password
```

3. 启动服务
```bash
npm start
```

## 使用说明

### 前台申请流程

1. 访问 http://localhost:11451
2. 填写 QQ 号码和 Minecraft ID
3. 点击"查看 QQ 信息"和"查看皮肤"按钮验证信息
4. 勾选"我是正版玩家"（如果是正版账号）
5. 提交申请，等待管理员审核

### 后台管理

1. 访问 http://localhost:11452
2. 查看申请列表和统计数据
3. 对Pending状态的申请进行"通过"或"拒绝"操作
4. 可以手动添加白名单用户
5. 通过申请后，系统会自动：
   - 调用 MCDR API 将玩家加入白名单
   - 发送邮件到申请人的 QQ 邮箱

## API 端点

### 前台 API
- `GET /api/qq-info/:qqNumber` - 获取 QQ 信息
- `GET /api/mc-skin/:minecraftId` - 获取 MC 皮肤
- `POST /api/apply` - 提交申请
- `GET /api/application/:qqNumber` - 查询申请状态

### 后台 API
- `GET /api/applications` - 获取所有申请
- `POST /api/approve/:id` - 批准申请
- `POST /api/reject/:id` - 拒绝申请
- `POST /api/manual-add` - 手动添加
- `DELETE /api/application/:id` - 删除记录

## MCDR Whitelist API 配置

确保你的 MCDR 服务器已安装 whitelist_api 插件，并在配置中允许 API 访问。

参考文档：https://mcdreforged.com/zh-CN/plugin/whitelist_api/introduction

## 注意事项

1. 邮箱发送需要配置正确的 SMTP 密码（不是登录密码，是 SMTP 授权码）
2. MCDR API 地址需要确保服务器可以访问
3. 生产环境建议添加后台管理的身份验证
4. 数据库文件存储在 `whitelist.db`

## 技术栈

- Node.js + Express
- SQLite (better-sqlite3)
- Nodemailer (邮件发送)
- Axios (HTTP 请求)
- Crafatar API (MC 皮肤)

## License

ISC
