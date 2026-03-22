/**
 * 认证路由
 *
 * 处理用户登录、登出和身份信息查询。
 * 支持两种登录方式：
 * 1. 主持人：用户名 + 密码登录
 * 2. 普通成员：可通过会议链接 + 密码直接入会
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { getConfig } = require('../utils/configManager');
const { generateToken, requireAuth } = require('../middleware/auth');
const { logAction } = require('../utils/logger');

/**
 * POST /api/auth/login
 * 用户登录接口
 * 请求体: { username, password }
 * 返回: { token, user: { id, username, role, group, displayName } }
 */
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  // 参数检查
  if (!username || !password) {
    return res.status(400).json({ error: '请输入用户名和密码' });
  }

  // 从配置文件读取用户列表
  const config = getConfig();
  const users = config.users || [];

  // 查找用户
  const user = users.find(u => u.username === username);
  if (!user) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  // 验证密码（当前使用明文对比，后续可改为 bcrypt）
  if (user.password !== password) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  // 生成 JWT token
  const token = generateToken(user);

  // 记录登录日志
  logAction('user_login', username, `用户 ${user.displayName} 登录成功`, {
    role: user.role,
    group: user.group
  });

  // 返回用户信息和 token
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      group: user.group,
      displayName: user.displayName,
      canRecord: user.canRecord || false,
      canTranscribe: user.canTranscribe || false
    }
  });
});

/**
 * POST /api/auth/join
 * 普通成员通过会议密码入会
 * 请求体: { meetingId, password, displayName }
 * 返回: { token, user, meetingInfo }
 */
router.post('/join', (req, res) => {
  const { meetingId, password, displayName } = req.body;

  if (!meetingId || !password) {
    return res.status(400).json({ error: '请输入会议ID和密码' });
  }

  const config = getConfig();

  // 验证会议密码
  if (password !== config.meeting?.defaultPassword) {
    return res.status(401).json({ error: '会议密码错误' });
  }

  // 为临时参会者生成一个身份
  const guestUser = {
    id: 'guest-' + Date.now(),
    username: 'guest-' + Date.now(),
    role: 'member',
    group: '',
    displayName: displayName || '访客',
    canRecord: false,
    canTranscribe: false
  };

  const token = generateToken(guestUser);

  logAction('guest_join', guestUser.username, `访客 ${guestUser.displayName} 通过密码入会`);

  res.json({
    token,
    user: guestUser,
    meetingInfo: {
      mainRoom: config.meeting?.mainRoom || '主会场'
    }
  });
});

/**
 * GET /api/auth/me
 * 获取当前登录用户信息
 * 需要认证
 */
router.get('/me', requireAuth, (req, res) => {
  const config = getConfig();
  const roleConfig = config.roles && config.roles[req.user.role];

  res.json({
    user: req.user,
    role: roleConfig || {},
    permissions: roleConfig ? roleConfig.permissions : []
  });
});

/**
 * POST /api/auth/logout
 * 用户登出（前端清除 token 即可）
 */
router.post('/logout', requireAuth, (req, res) => {
  logAction('user_logout', req.user.username, `用户 ${req.user.displayName} 已登出`);
  res.json({ success: true, message: '已登出' });
});

module.exports = router;
