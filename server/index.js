/**
 * 会议管理系统 - 主入口文件
 *
 * 启动 Express 服务器，加载所有路由和中间件。
 * 同时提供静态文件服务，用于前端页面。
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');

// 导入路由模块
const authRoutes = require('./routes/auth');
const configRoutes = require('./routes/config');
const meetingRoutes = require('./routes/meeting');
const logRoutes = require('./routes/log');

// 导入配置管理工具
const { loadConfig } = require('./utils/configManager');

// 创建 Express 应用实例
const app = express();

// 服务端口，可通过环境变量配置
const PORT = process.env.PORT || 3000;

// --- 中间件配置 ---

// 安全头部（放宽 CSP 以允许 Jitsi iframe 嵌入）
app.use(helmet({
  contentSecurityPolicy: false,  // 关闭 CSP，因为需要嵌入 Jitsi iframe
  crossOriginEmbedderPolicy: false  // 允许跨域嵌入
}));

// 跨域支持
app.use(cors({
  origin: true,      // 允许所有来源（生产环境应限制）
  credentials: true   // 允许携带 cookie
}));

// 请求体解析
app.use(express.json({ limit: '10mb' }));           // JSON 请求体
app.use(express.urlencoded({ extended: true }));      // 表单请求体

// Cookie 解析
app.use(cookieParser());

// 请求日志（开发模式使用 dev 格式）
app.use(morgan('dev'));

// --- 静态文件服务 ---
// 前端文件位于 client 目录
app.use(express.static(path.join(__dirname, '..', 'client')));

// --- API 路由 ---
app.use('/api/auth', authRoutes);       // 认证相关接口
app.use('/api/config', configRoutes);   // 配置管理接口
app.use('/api/meeting', meetingRoutes); // 会议管理接口
app.use('/api/logs', logRoutes);        // 日志查询接口

// --- 前端页面路由（SPA 风格，所有页面返回对应 HTML） ---
// 登录页
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'public', 'login.html'));
});

// 根路径重定向到登录页
app.get('/', (req, res) => {
  res.redirect('/login');
});

// 所有其他未匹配的路由返回首页（由前端路由处理）
app.get('*', (req, res) => {
  // 如果请求的是 API 路径但未匹配，返回 404
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: '接口不存在' });
  }
  // 否则返回首页 HTML
  res.sendFile(path.join(__dirname, '..', 'client', 'public', 'index.html'));
});

// --- 全局错误处理 ---
app.use((err, req, res, next) => {
  console.error('服务器错误:', err.stack);
  res.status(500).json({ error: '服务器内部错误', message: err.message });
});

// --- 启动服务器 ---
// 确保必要的目录存在
const configBackupDir = path.join(__dirname, '..', 'config-backups');
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(configBackupDir)) fs.mkdirSync(configBackupDir, { recursive: true });
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

// 初始化加载配置文件
try {
  loadConfig();
  console.log('配置文件加载成功');
} catch (err) {
  console.error('配置文件加载失败:', err.message);
  console.log('将使用默认配置');
}

// 启动监听
app.listen(PORT, '0.0.0.0', () => {
  console.log(`会议管理系统已启动，监听端口: ${PORT}`);
  console.log(`访问地址: http://localhost:${PORT}`);
});
