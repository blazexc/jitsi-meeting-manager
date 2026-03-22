/**
 * 认证中间件
 *
 * 处理用户登录态验证和角色权限检查。
 * 使用 JWT token 进行无状态认证。
 */

const jwt = require('jsonwebtoken');
const { getConfig } = require('../utils/configManager');

// JWT 密钥（生产环境应使用环境变量）
const JWT_SECRET = process.env.JWT_SECRET || 'jitsi-meeting-manager-secret-key-2024';
// Token 有效期（24小时）
const TOKEN_EXPIRY = '24h';

/**
 * 生成 JWT Token
 * @param {Object} user - 用户对象（包含 id, username, role, group 等）
 * @returns {string} JWT token
 */
function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      group: user.group,
      displayName: user.displayName
    },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

/**
 * 验证认证中间件
 * 从请求头的 Authorization 字段或 cookie 中提取 token 并验证
 */
function requireAuth(req, res, next) {
  // 尝试从多个来源获取 token
  let token = null;

  // 1. 从 Authorization 头获取（Bearer token）
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }

  // 2. 从 cookie 获取
  if (!token && req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  // 3. 从查询参数获取（用于特殊场景）
  if (!token && req.query && req.query.token) {
    token = req.query.token;
  }

  // 无 token，返回未认证
  if (!token) {
    return res.status(401).json({ error: '未登录，请先登录系统' });
  }

  try {
    // 验证 token
    const decoded = jwt.verify(token, JWT_SECRET);
    // 将用户信息附加到请求对象
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

/**
 * 角色检查中间件生成器
 * @param  {...string} roles - 允许的角色列表
 * @returns {Function} Express 中间件
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: '未认证' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: '权限不足',
        message: `此操作需要以下角色之一: ${roles.join(', ')}`
      });
    }

    next();
  };
}

/**
 * 权限检查中间件生成器
 * 检查用户角色是否具有指定的权限
 * @param {string} permission - 需要的权限标识
 * @returns {Function} Express 中间件
 */
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: '未认证' });
    }

    const config = getConfig();
    const roleConfig = config.roles && config.roles[req.user.role];

    if (!roleConfig) {
      return res.status(403).json({ error: '未知角色' });
    }

    const permissions = roleConfig.permissions || [];
    if (!permissions.includes(permission)) {
      return res.status(403).json({
        error: '权限不足',
        message: `缺少权限: ${permission}`
      });
    }

    next();
  };
}

module.exports = {
  generateToken,
  requireAuth,
  requireRole,
  requirePermission,
  JWT_SECRET
};
