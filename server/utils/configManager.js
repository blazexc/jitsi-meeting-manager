/**
 * 配置管理器
 *
 * 负责加载、保存、校验和版本管理配置文件。
 * 配置文件使用 YAML 格式存储，支持自动备份和回滚。
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// 配置文件路径
const CONFIG_FILE = path.join(__dirname, '..', 'config', 'conference-config.yaml');
// 默认配置文件路径
const DEFAULT_CONFIG_FILE = path.join(__dirname, '..', 'config', 'default-config.yaml');
// 配置备份目录
const BACKUP_DIR = path.join(__dirname, '..', '..', 'config-backups');
// 最大备份版本数
const MAX_BACKUPS = 20;

// 内存中缓存的配置对象
let currentConfig = null;

/**
 * 加载配置文件
 * 优先加载用户配置，如果不存在则加载默认配置
 * @returns {Object} 解析后的配置对象
 */
function loadConfig() {
  let configPath = CONFIG_FILE;

  // 如果用户配置不存在，使用默认配置并复制一份作为用户配置
  if (!fs.existsSync(CONFIG_FILE)) {
    if (fs.existsSync(DEFAULT_CONFIG_FILE)) {
      fs.copyFileSync(DEFAULT_CONFIG_FILE, CONFIG_FILE);
      console.log('已从默认配置创建用户配置文件');
    } else {
      throw new Error('配置文件不存在，且默认配置也不存在');
    }
  }

  // 读取并解析 YAML
  const content = fs.readFileSync(configPath, 'utf-8');
  currentConfig = yaml.load(content);
  return currentConfig;
}

/**
 * 获取当前内存中的配置
 * 如果未加载则先加载
 * @returns {Object} 配置对象
 */
function getConfig() {
  if (!currentConfig) {
    loadConfig();
  }
  return currentConfig;
}

/**
 * 获取配置文件的原始 YAML 文本
 * @returns {string} YAML 格式的配置文本
 */
function getConfigRaw() {
  if (!fs.existsSync(CONFIG_FILE)) {
    if (fs.existsSync(DEFAULT_CONFIG_FILE)) {
      return fs.readFileSync(DEFAULT_CONFIG_FILE, 'utf-8');
    }
    return '';
  }
  return fs.readFileSync(CONFIG_FILE, 'utf-8');
}

/**
 * 保存配置文件
 * 保存前自动创建备份
 * @param {string} yamlContent - YAML 格式的配置内容
 * @param {string} operator - 操作人用户名
 * @returns {Object} 包含保存结果信息
 */
function saveConfig(yamlContent, operator) {
  // 先解析验证 YAML 格式
  const parsed = yaml.load(yamlContent);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('无效的 YAML 内容');
  }

  // 创建备份
  if (fs.existsSync(CONFIG_FILE)) {
    createBackup(operator);
  }

  // 写入新配置
  fs.writeFileSync(CONFIG_FILE, yamlContent, 'utf-8');

  // 更新内存缓存
  currentConfig = parsed;

  return { success: true, message: '配置已保存' };
}

/**
 * 创建配置备份
 * @param {string} operator - 操作人
 */
function createBackup(operator) {
  // 确保备份目录存在
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  // 生成备份文件名（时间戳格式）
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupName = `config-${timestamp}-${operator || 'system'}.yaml`;
  const backupPath = path.join(BACKUP_DIR, backupName);

  // 复制当前配置到备份
  fs.copyFileSync(CONFIG_FILE, backupPath);

  // 清理旧备份，只保留最近 MAX_BACKUPS 个
  cleanOldBackups();
}

/**
 * 清理超出限制的旧备份文件
 */
function cleanOldBackups() {
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('config-') && f.endsWith('.yaml'))
    .sort()  // 按文件名排序（时间戳格式保证了字典序即时间序）
    .reverse();

  // 删除超出限制的旧版本
  if (files.length > MAX_BACKUPS) {
    files.slice(MAX_BACKUPS).forEach(f => {
      fs.unlinkSync(path.join(BACKUP_DIR, f));
    });
  }
}

/**
 * 获取备份版本列表
 * @param {number} limit - 返回的最大版本数，默认 5
 * @returns {Array} 备份版本信息数组
 */
function getBackupList(limit = 5) {
  if (!fs.existsSync(BACKUP_DIR)) {
    return [];
  }

  return fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('config-') && f.endsWith('.yaml'))
    .sort()
    .reverse()
    .slice(0, limit)
    .map(filename => {
      const stat = fs.statSync(path.join(BACKUP_DIR, filename));
      // 从文件名解析操作人
      const parts = filename.replace('config-', '').replace('.yaml', '').split('-');
      const operator = parts[parts.length - 1];
      return {
        filename,
        size: stat.size,
        createdAt: stat.mtime.toISOString(),
        operator
      };
    });
}

/**
 * 回滚到指定备份版本
 * @param {string} backupFilename - 备份文件名
 * @param {string} operator - 操作人
 * @returns {Object} 回滚结果
 */
function rollbackConfig(backupFilename, operator) {
  const backupPath = path.join(BACKUP_DIR, backupFilename);
  if (!fs.existsSync(backupPath)) {
    throw new Error('备份文件不存在: ' + backupFilename);
  }

  // 回滚前先备份当前配置
  if (fs.existsSync(CONFIG_FILE)) {
    createBackup(operator + '-pre-rollback');
  }

  // 用备份文件覆盖当前配置
  fs.copyFileSync(backupPath, CONFIG_FILE);

  // 重新加载配置到内存
  loadConfig();

  return { success: true, message: '已回滚到版本: ' + backupFilename };
}

/**
 * 读取指定备份的内容
 * @param {string} backupFilename - 备份文件名
 * @returns {string} YAML 内容
 */
function getBackupContent(backupFilename) {
  const backupPath = path.join(BACKUP_DIR, backupFilename);
  if (!fs.existsSync(backupPath)) {
    throw new Error('备份文件不存在');
  }
  return fs.readFileSync(backupPath, 'utf-8');
}

/**
 * 校验配置文件内容
 * @param {string} yamlContent - 待校验的 YAML 内容
 * @returns {Object} 包含 errors 和 warnings 数组
 */
function validateConfig(yamlContent) {
  const errors = [];    // 错误列表
  const warnings = [];  // 警告列表

  // 1. 检查 YAML 格式
  let config;
  try {
    config = yaml.load(yamlContent);
  } catch (e) {
    errors.push('YAML 格式错误: ' + e.message);
    return { errors, warnings };
  }

  if (!config || typeof config !== 'object') {
    errors.push('配置内容为空或不是有效的对象');
    return { errors, warnings };
  }

  // 2. 检查必需的顶级字段
  const requiredSections = ['system', 'roles', 'meeting', 'users'];
  requiredSections.forEach(section => {
    if (!config[section]) {
      errors.push(`缺少必需的配置节: ${section}`);
    }
  });

  // 如果缺少必需节，后续检查无意义
  if (errors.length > 0) return { errors, warnings };

  // 3. 检查系统配置
  if (!config.system.name) warnings.push('系统名称未设置');
  if (!config.system.jitsiDomain) errors.push('Jitsi 域名未设置');

  // 4. 检查角色配置
  const validRoles = Object.keys(config.roles || {});
  if (validRoles.length === 0) {
    errors.push('至少需要定义一个角色');
  }

  // 5. 检查会议配置
  if (config.meeting) {
    if (!config.meeting.mainRoom) warnings.push('主会场名称未设置');

    const groupIds = new Set();
    if (config.meeting.groups && Array.isArray(config.meeting.groups)) {
      config.meeting.groups.forEach((group, index) => {
        // 检查组 ID 是否重复
        if (groupIds.has(group.id)) {
          errors.push(`分组 ID 重复: ${group.id} (第 ${index + 1} 个)`);
        }
        groupIds.add(group.id);

        if (!group.name) warnings.push(`分组 ${group.id} 缺少名称`);
        if (!group.moderatorId) warnings.push(`分组 ${group.id} 未指定主持人`);
      });
    }
  }

  // 6. 检查用户配置
  if (config.users && Array.isArray(config.users)) {
    const userIds = new Set();
    const usernames = new Set();
    const groupIds = new Set(
      (config.meeting?.groups || []).map(g => g.id)
    );

    config.users.forEach((user, index) => {
      // 检查用户 ID 重复
      if (userIds.has(user.id)) {
        errors.push(`用户 ID 重复: ${user.id}`);
      }
      userIds.add(user.id);

      // 检查用户名重复
      if (usernames.has(user.username)) {
        errors.push(`用户名重复: ${user.username}`);
      }
      usernames.add(user.username);

      // 检查角色是否合法
      if (user.role && !validRoles.includes(user.role)) {
        errors.push(`用户 ${user.username} 的角色 "${user.role}" 不在定义的角色列表中`);
      }

      // 检查所属组是否存在（成员和主持人需要检查）
      if (user.group && user.group !== '' && !groupIds.has(user.group)) {
        errors.push(`用户 ${user.username} 所属的组 "${user.group}" 不存在`);
      }

      // 检查必需字段
      if (!user.username) errors.push(`第 ${index + 1} 个用户缺少用户名`);
      if (!user.password) warnings.push(`用户 ${user.username || index} 未设置密码`);
      if (!user.displayName) warnings.push(`用户 ${user.username || index} 未设置显示名`);
    });

    // 检查分组主持人是否存在
    if (config.meeting?.groups) {
      config.meeting.groups.forEach(group => {
        if (group.moderatorId && !userIds.has(group.moderatorId)) {
          warnings.push(`分组 ${group.name} 的主持人 ID "${group.moderatorId}" 在用户列表中未找到`);
        }
      });
    }
  }

  // 7. 检查录制配置
  if (config.recording) {
    if (config.recording.allowedRoles) {
      config.recording.allowedRoles.forEach(role => {
        if (!validRoles.includes(role)) {
          warnings.push(`录制配置中的角色 "${role}" 不在角色定义中`);
        }
      });
    }
    if (config.recording.allowedRooms && config.recording.allowedRooms.length > 0) {
      const groupIds = new Set(
        (config.meeting?.groups || []).map(g => g.id)
      );
      config.recording.allowedRooms.forEach(room => {
        if (room !== 'main' && !groupIds.has(room)) {
          warnings.push(`录制配置中的房间 "${room}" 不存在`);
        }
      });
    }
  }

  return { errors, warnings };
}

module.exports = {
  loadConfig,
  getConfig,
  getConfigRaw,
  saveConfig,
  validateConfig,
  getBackupList,
  rollbackConfig,
  getBackupContent
};
