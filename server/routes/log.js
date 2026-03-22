/**
 * 日志查询路由
 *
 * 提供操作日志的查询接口。
 * 仅总主持人可查看系统日志。
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { getLogs } = require('../utils/logger');

/**
 * GET /api/logs
 * 查询操作日志
 * 查询参数:
 *   - limit: 返回数量限制，默认 100
 *   - action: 按操作类型筛选
 * 仅总主持人可查看
 */
router.get('/', requireAuth, requireRole('host'), (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const action = req.query.action || null;
    const logs = getLogs(limit, action);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: '查询日志失败: ' + err.message });
  }
});

module.exports = router;
