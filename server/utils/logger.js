/**
 * 操作日志工具
 *
 * 记录系统中的所有重要操作，包括配置修改、会议管理、
 * 成员调度等操作。日志以 JSON Lines 格式存储。
 */

const fs = require('fs');
const path = require('path');

// 日志文件路径
const LOG_DIR = path.join(__dirname, '..', '..', 'logs');
// 单个日志文件最大行数
const MAX_LOG_LINES = 5000;

/**
 * 获取当前日志文件路径
 * 日志文件按日期分割
 * @returns {string} 日志文件路径
 */
function getLogFilePath() {
  const today = new Date().toISOString().split('T')[0]; // 格式: 2024-01-15
  return path.join(LOG_DIR, `operations-${today}.log`);
}

/**
 * 记录操作日志
 * @param {string} action - 操作类型（如 'config_save', 'meeting_create' 等）
 * @param {string} operator - 操作人用户名
 * @param {string} detail - 操作详情描述
 * @param {Object} [extra] - 额外数据
 */
function logAction(action, operator, detail, extra = {}) {
  // 确保日志目录存在
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }

  // 构建日志条目
  const entry = {
    timestamp: new Date().toISOString(),   // 时间戳
    action,                                  // 操作类型
    operator: operator || 'system',          // 操作人
    detail,                                  // 操作详情
    ...extra                                 // 额外数据
  };

  // 追加到日志文件（每行一个 JSON 对象）
  const logFile = getLogFilePath();
  fs.appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf-8');
}

/**
 * 读取操作日志
 * @param {number} limit - 返回的最大条目数，默认 100
 * @param {string} [action] - 按操作类型筛选
 * @returns {Array} 日志条目数组（最新的在前）
 */
function getLogs(limit = 100, action = null) {
  if (!fs.existsSync(LOG_DIR)) {
    return [];
  }

  // 获取所有日志文件，按时间倒序
  const logFiles = fs.readdirSync(LOG_DIR)
    .filter(f => f.startsWith('operations-') && f.endsWith('.log'))
    .sort()
    .reverse();

  const logs = [];

  // 从最新的日志文件开始读取
  for (const file of logFiles) {
    if (logs.length >= limit) break;

    const content = fs.readFileSync(path.join(LOG_DIR, file), 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean).reverse();

    for (const line of lines) {
      if (logs.length >= limit) break;
      try {
        const entry = JSON.parse(line);
        // 如果指定了操作类型筛选
        if (action && entry.action !== action) continue;
        logs.push(entry);
      } catch (e) {
        // 跳过无法解析的行
      }
    }
  }

  return logs;
}

module.exports = { logAction, getLogs };
