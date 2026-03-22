/**
 * API 请求工具
 *
 * 封装了所有与后端通信的方法，包括认证、配置管理、会议管理等。
 * 自动处理 token 的携带和过期跳转。
 */

// API 基础路径
const API_BASE = '/api';

/**
 * 获取存储的 token
 * @returns {string|null} JWT token
 */
function getToken() {
  return localStorage.getItem('token');
}

/**
 * 保存 token
 * @param {string} token - JWT token
 */
function setToken(token) {
  localStorage.setItem('token', token);
}

/**
 * 清除 token
 */
function clearToken() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

/**
 * 获取当前登录用户信息
 * @returns {Object|null} 用户信息对象
 */
function getCurrentUser() {
  const userStr = localStorage.getItem('user');
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
}

/**
 * 保存用户信息到本地存储
 * @param {Object} user - 用户信息
 */
function saveUser(user) {
  localStorage.setItem('user', JSON.stringify(user));
}

/**
 * 通用 API 请求方法
 * @param {string} path - API 路径（不含基础路径）
 * @param {Object} options - fetch 选项
 * @returns {Promise<Object>} 响应数据
 */
async function request(path, options = {}) {
  const token = getToken();

  // 构建请求头
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  // 如果有 token，自动添加认证头
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers
    });

    // 处理 401 未认证（token 过期或无效）
    if (response.status === 401) {
      clearToken();
      // 重定向到登录页
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
      throw new Error('登录已过期，请重新登录');
    }

    const data = await response.json();

    // 处理非成功状态
    if (!response.ok) {
      throw new Error(data.error || data.message || '请求失败');
    }

    return data;
  } catch (err) {
    if (err.message === '登录已过期，请重新登录') throw err;
    throw new Error(err.message || '网络错误，请检查连接');
  }
}

// ===== 认证相关 API =====

/**
 * 用户登录
 * @param {string} username - 用户名
 * @param {string} password - 密码
 * @returns {Promise<Object>} { token, user }
 */
async function login(username, password) {
  const data = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
  setToken(data.token);
  saveUser(data.user);
  return data;
}

/**
 * 通过会议密码入会
 * @param {string} meetingId - 会议 ID
 * @param {string} password - 入会密码
 * @param {string} displayName - 显示名称
 * @returns {Promise<Object>} { token, user, meetingInfo }
 */
async function joinMeeting(meetingId, password, displayName) {
  const data = await request('/auth/join', {
    method: 'POST',
    body: JSON.stringify({ meetingId, password, displayName })
  });
  setToken(data.token);
  saveUser(data.user);
  return data;
}

/**
 * 获取当前用户信息
 * @returns {Promise<Object>} 用户和角色信息
 */
async function getMe() {
  return request('/auth/me');
}

/**
 * 登出
 */
async function logout() {
  try {
    await request('/auth/logout', { method: 'POST' });
  } finally {
    clearToken();
    window.location.href = '/login';
  }
}

// ===== 配置相关 API =====

/**
 * 获取系统配置（JSON）
 */
async function getConfig() {
  return request('/config');
}

/**
 * 获取配置原始 YAML
 */
async function getConfigRaw() {
  return request('/config/raw');
}

/**
 * 保存配置
 * @param {string} content - YAML 内容
 */
async function saveConfig(content) {
  return request('/config/save', {
    method: 'POST',
    body: JSON.stringify({ content })
  });
}

/**
 * 校验配置
 * @param {string} content - YAML 内容
 */
async function validateConfigApi(content) {
  return request('/config/validate', {
    method: 'POST',
    body: JSON.stringify({ content })
  });
}

/**
 * 获取配置备份列表
 */
async function getBackups(limit = 10) {
  return request(`/config/backups?limit=${limit}`);
}

/**
 * 获取备份内容
 */
async function getBackupContent(filename) {
  return request(`/config/backups/${filename}`);
}

/**
 * 回滚配置
 */
async function rollbackConfigApi(filename) {
  return request('/config/rollback', {
    method: 'POST',
    body: JSON.stringify({ filename })
  });
}

// ===== 会议相关 API =====

/**
 * 创建会议
 */
async function createMeeting(name, groups) {
  return request('/meeting/create', {
    method: 'POST',
    body: JSON.stringify({ name, groups })
  });
}

/**
 * 获取会议列表
 */
async function getMeetings() {
  return request('/meeting/list');
}

/**
 * 获取会议详情
 */
async function getMeetingDetail(id) {
  return request(`/meeting/${id}`);
}

/**
 * 获取入会信息
 */
async function getJoinInfo(meetingId) {
  return request(`/meeting/${meetingId}/join-info`);
}

/**
 * 分配成员到分组
 */
async function assignMember(meetingId, userId, groupId) {
  return request(`/meeting/${meetingId}/assign`, {
    method: 'POST',
    body: JSON.stringify({ userId, groupId })
  });
}

/**
 * 移动成员
 */
async function moveMember(meetingId, userId, fromGroupId, toGroupId) {
  return request(`/meeting/${meetingId}/move`, {
    method: 'POST',
    body: JSON.stringify({ userId, fromGroupId, toGroupId })
  });
}

/**
 * 结束会议
 */
async function endMeeting(meetingId) {
  return request(`/meeting/${meetingId}/end`, { method: 'POST' });
}

/**
 * 修改入会密码
 */
async function changeMeetingPassword(meetingId, password) {
  return request(`/meeting/${meetingId}/password`, {
    method: 'POST',
    body: JSON.stringify({ password })
  });
}

/**
 * 获取会议配置信息
 */
async function getMeetingConfigInfo() {
  return request('/meeting/config/info');
}

// ===== 日志相关 API =====

/**
 * 获取操作日志
 */
async function getLogsApi(limit = 100, action = null) {
  let url = `/logs?limit=${limit}`;
  if (action) url += `&action=${action}`;
  return request(url);
}

// 导出所有方法到全局
window.API = {
  getToken, setToken, clearToken, getCurrentUser, saveUser,
  login, joinMeeting, getMe, logout,
  getConfig, getConfigRaw, saveConfig, validateConfigApi,
  getBackups, getBackupContent, rollbackConfigApi,
  createMeeting, getMeetings, getMeetingDetail, getJoinInfo,
  assignMember, moveMember, endMeeting, changeMeetingPassword,
  getMeetingConfigInfo,
  getLogsApi
};
