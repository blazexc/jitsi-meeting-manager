/**
 * 配置管理路由
 *
 * 提供配置文件的读取、保存、校验、备份和回滚功能。
 * 仅总主持人（host 角色）可以修改配置。
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  getConfig,
  getConfigRaw,
  saveConfig,
  validateConfig,
  getBackupList,
  rollbackConfig,
  getBackupContent
} = require('../utils/configManager');
const { logAction } = require('../utils/logger');

/**
 * GET /api/config
 * 获取当前配置（JSON 格式）
 * 需要认证，主持人和小组主持人可查看
 */
router.get('/', requireAuth, (req, res) => {
  try {
    const config = getConfig();
    res.json({ config });
  } catch (err) {
    res.status(500).json({ error: '读取配置失败: ' + err.message });
  }
});

/**
 * GET /api/config/raw
 * 获取配置文件原始 YAML 内容
 * 仅总主持人可查看原始 YAML（用于编辑器）
 */
router.get('/raw', requireAuth, requireRole('host'), (req, res) => {
  try {
    const raw = getConfigRaw();
    res.json({ content: raw });
  } catch (err) {
    res.status(500).json({ error: '读取配置失败: ' + err.message });
  }
});

/**
 * POST /api/config/save
 * 保存配置文件
 * 仅总主持人可操作
 * 请求体: { content: "YAML 字符串" }
 */
router.post('/save', requireAuth, requireRole('host'), (req, res) => {
  try {
    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ error: '配置内容不能为空' });
    }

    // 先校验
    const validation = validateConfig(content);
    if (validation.errors.length > 0) {
      return res.status(400).json({
        error: '配置校验未通过',
        errors: validation.errors,
        warnings: validation.warnings
      });
    }

    // 保存配置
    const result = saveConfig(content, req.user.username);

    // 记录日志
    logAction('config_save', req.user.username, '保存了配置文件', {
      warnings: validation.warnings
    });

    res.json({
      ...result,
      warnings: validation.warnings
    });
  } catch (err) {
    res.status(500).json({ error: '保存配置失败: ' + err.message });
  }
});

/**
 * POST /api/config/validate
 * 校验配置内容（不保存）
 * 仅总主持人可操作
 * 请求体: { content: "YAML 字符串" }
 */
router.post('/validate', requireAuth, requireRole('host'), (req, res) => {
  try {
    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ error: '配置内容不能为空' });
    }

    const result = validateConfig(content);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: '校验失败: ' + err.message });
  }
});

/**
 * GET /api/config/backups
 * 获取配置备份列表
 * 仅总主持人可操作
 */
router.get('/backups', requireAuth, requireRole('host'), (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const backups = getBackupList(limit);
    res.json({ backups });
  } catch (err) {
    res.status(500).json({ error: '获取备份列表失败: ' + err.message });
  }
});

/**
 * GET /api/config/backups/:filename
 * 获取指定备份的内容
 * 仅总主持人可操作
 */
router.get('/backups/:filename', requireAuth, requireRole('host'), (req, res) => {
  try {
    const content = getBackupContent(req.params.filename);
    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: '读取备份失败: ' + err.message });
  }
});

/**
 * POST /api/config/rollback
 * 回滚到指定备份版本
 * 仅总主持人可操作
 * 请求体: { filename: "备份文件名" }
 */
router.post('/rollback', requireAuth, requireRole('host'), (req, res) => {
  try {
    const { filename } = req.body;
    if (!filename) {
      return res.status(400).json({ error: '请指定备份文件名' });
    }

    const result = rollbackConfig(filename, req.user.username);

    // 记录日志
    logAction('config_rollback', req.user.username, `回滚配置到版本: ${filename}`);

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: '回滚失败: ' + err.message });
  }
});

module.exports = router;
