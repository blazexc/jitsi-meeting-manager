# 会议管理系统

基于 Jitsi 标准化部署 + 官方 IFrame API 的会议业务前端管理系统。

## 功能概览

- **三类角色**：总主持人 / 小组主持人 / 普通成员
- **分组会议**：支持 breakout rooms，自动分配和手动调度
- **权限管理**：基于角色的入会和会中控制
- **配置驱动**：通过 YAML 配置文件管理系统设置
- **录制控制**：按需开启/停止录制
- **通知系统**：会中消息通知和发言申请

## 系统架构

```
┌─────────────────────────────────────────┐
│              浏览器（前端）                │
│  登录页 │ 首页 │ 会议页 │ 配置编辑器 │ 日志 │
├─────────────────────────────────────────┤
│            业务后端 (Node.js)            │
│  认证 │ 配置管理 │ 会议管理 │ 日志记录    │
├─────────────────────────────────────────┤
│         Jitsi (自托管 Docker 部署)        │
│    音视频 │ 聊天 │ 屏幕共享 │ 录制        │
└─────────────────────────────────────────┘
```

## 快速开始

### 前置要求

- Node.js >= 18
- Docker & Docker Compose
- 已部署的 Jitsi 服务（标准 Docker 部署）

### 本地开发

```bash
# 1. 安装依赖
npm install

# 2. 启动开发服务器
npm run dev

# 3. 浏览器访问 http://localhost:3000
```

### Docker 部署

```bash
# 1. 构建并启动
docker-compose up -d --build

# 2. 查看日志
docker logs -f meeting-manager

# 3. 访问服务
# http://your-server:3000
```

## 默认账号

| 用户名 | 密码 | 角色 | 说明 |
|--------|------|------|------|
| admin | admin123 | 总主持人 | 系统管理员 |
| moderator1 | mod123 | 小组主持人 | 第一组主持人 |
| moderator2 | mod123 | 小组主持人 | 第二组主持人 |
| moderator3 | mod123 | 小组主持人 | 第三组主持人 |
| user1 ~ user6 | user123 | 普通成员 | 各组成员 |

## 页面清单

1. `/public/login.html` - 登录页
2. `/public/host-home.html` - 总主持人首页
3. `/public/moderator-home.html` - 小组主持人首页
4. `/public/member-home.html` - 普通成员首页
5. `/public/meeting.html` - 会议页面（Jitsi 嵌入）
6. `/public/config-editor.html` - 配置编辑页
7. `/public/logs.html` - 操作日志页

## API 接口

### 认证
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/join` - 成员入会
- `GET /api/auth/me` - 获取当前用户
- `POST /api/auth/logout` - 登出

### 配置管理
- `GET /api/config` - 获取配置（JSON）
- `GET /api/config/raw` - 获取原始 YAML
- `POST /api/config/save` - 保存配置
- `POST /api/config/validate` - 校验配置
- `GET /api/config/backups` - 备份列表
- `POST /api/config/rollback` - 回滚版本

### 会议管理
- `POST /api/meeting/create` - 创建会议
- `GET /api/meeting/list` - 会议列表
- `GET /api/meeting/:id` - 会议详情
- `GET /api/meeting/:id/join-info` - 入会信息
- `POST /api/meeting/:id/assign` - 分配成员
- `POST /api/meeting/:id/move` - 移动成员
- `POST /api/meeting/:id/end` - 结束会议

### 日志
- `GET /api/logs` - 查询操作日志

## 部署说明

### 端口说明

| 端口 | 服务 | 说明 |
|------|------|------|
| 3000 | 会议管理系统 | HTTP 服务，通过反向代理对外暴露 |
| 8443 | Jitsi | Jitsi Web 服务（已部署） |
| 10000/udp | Jitsi JVB | WebRTC 媒体传输 |

### Nginx 反向代理配置示例

```nginx
# 会议管理系统
server {
    listen 16443 ssl;
    server_name room.shukunnet.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## 配置文件说明

配置文件位于 `server/config/conference-config.yaml`，包含：

- **系统配置**：名称、Jitsi 域名、功能开关
- **角色配置**：各角色的权限列表
- **会议模板**：主会场和分组定义
- **用户列表**：用户账号、角色、分组
- **录制策略**：录制权限和房间
- **通知模板**：各类通知消息模板

可通过总主持人的配置编辑器在线修改。

## 技术栈

- **后端**：Node.js + Express
- **前端**：原生 HTML/CSS/JavaScript（无框架依赖）
- **会议引擎**：Jitsi Meet (IFrame API)
- **配置格式**：YAML
- **认证**：JWT
- **部署**：Docker

## 许可证

MIT
