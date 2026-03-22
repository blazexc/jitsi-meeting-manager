/**
 * 会议管理路由
 *
 * 处理会议的创建、查询、成员管理等操作。
 * 会议的实际音视频功能由 Jitsi 提供，此路由负责业务逻辑层。
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const { getConfig, saveConfig, getConfigRaw } = require('../utils/configManager');
const { logAction } = require('../utils/logger');
const yaml = require('js-yaml');

// 内存中存储活跃会议信息（生产环境可用 Redis）
const activeMeetings = new Map();

/**
 * POST /api/meeting/create
 * 创建会议
 * 总主持人和小组主持人可创建
 * 请求体: { name: "会议名称", groups?: [...] }
 */
router.post('/create', requireAuth, requirePermission('create_meeting'), (req, res) => {
  try {
    const { name, groups } = req.body;
    const config = getConfig();

    if (!name) {
      return res.status(400).json({ error: '请输入会议名称' });
    }

    // 生成唯一的会议 ID
    const meetingId = `${config.system?.meetingPrefix || 'mtg'}-${Date.now().toString(36)}`;

    // 创建会议记录
    const meeting = {
      id: meetingId,
      name,
      createdBy: req.user.username,
      createdAt: new Date().toISOString(),
      status: 'active',
      // Jitsi 房间名（主会场）
      mainRoomName: `${meetingId}-main`,
      // 分组信息
      groups: [],
      // 参会者列表
      participants: []
    };

    // 如果指定了分组，创建分组房间
    if (groups && Array.isArray(groups)) {
      meeting.groups = groups.map(g => ({
        id: g.id || `group-${uuidv4().slice(0, 8)}`,
        name: g.name,
        moderatorId: g.moderatorId || '',
        roomName: `${meetingId}-${g.id || 'group-' + uuidv4().slice(0, 8)}`,
        participants: g.participants || [],
        status: 'created'
      }));
    } else if (config.meeting?.groups) {
      // 使用配置文件中的分组
      meeting.groups = config.meeting.groups.map(g => ({
        id: g.id,
        name: g.name,
        moderatorId: g.moderatorId,
        roomName: `${meetingId}-${g.id}`,
        participants: [],
        status: 'created'
      }));
    }

    // 存储到内存
    activeMeetings.set(meetingId, meeting);

    // 记录日志
    logAction('meeting_create', req.user.username,
      `创建会议: ${name} (${meetingId})，包含 ${meeting.groups.length} 个分组`);

    res.json({
      meeting: {
        id: meeting.id,
        name: meeting.name,
        mainRoomName: meeting.mainRoomName,
        groups: meeting.groups,
        createdAt: meeting.createdAt
      }
    });
  } catch (err) {
    res.status(500).json({ error: '创建会议失败: ' + err.message });
  }
});

/**
 * GET /api/meeting/list
 * 获取活跃会议列表
 */
router.get('/list', requireAuth, (req, res) => {
  const meetings = Array.from(activeMeetings.values())
    .filter(m => m.status === 'active')
    .map(m => ({
      id: m.id,
      name: m.name,
      createdBy: m.createdBy,
      createdAt: m.createdAt,
      groupCount: m.groups.length,
      participantCount: m.participants.length
    }));

  res.json({ meetings });
});

/**
 * GET /api/meeting/:id
 * 获取会议详情
 */
router.get('/:id', requireAuth, (req, res) => {
  const meeting = activeMeetings.get(req.params.id);
  if (!meeting) {
    return res.status(404).json({ error: '会议不存在' });
  }

  // 根据角色返回不同信息
  const config = getConfig();
  let responseData = { ...meeting };

  // 普通成员只能看到自己所在组的信息
  if (req.user.role === 'member') {
    const userConfig = (config.users || []).find(u => u.id === req.user.id);
    const userGroup = userConfig?.group;
    if (userGroup) {
      responseData.groups = meeting.groups.filter(g => g.id === userGroup);
    }
  }
  // 小组主持人只能看到自己的组和主会场
  else if (req.user.role === 'moderator') {
    const userGroup = req.user.group;
    if (userGroup) {
      responseData.groups = meeting.groups.filter(g => g.id === userGroup);
    }
  }

  res.json({ meeting: responseData });
});

/**
 * GET /api/meeting/:id/join-info
 * 获取入会信息（Jitsi 连接参数）
 */
router.get('/:id/join-info', requireAuth, (req, res) => {
  const meeting = activeMeetings.get(req.params.id);
  if (!meeting) {
    return res.status(404).json({ error: '会议不存在' });
  }

  const config = getConfig();
  const jitsiDomain = config.system?.jitsiDomain || 'meet.jitsi';
  const jitsiPort = config.system?.jitsiPort;

  // 确定用户应该进入的房间
  let roomName = meeting.mainRoomName;  // 默认进入主会场
  let targetGroup = null;

  // 如果用户有所属分组，找到对应的分组房间
  if (req.user.group) {
    targetGroup = meeting.groups.find(g => g.id === req.user.group);
    if (targetGroup) {
      roomName = targetGroup.roomName;
    }
  }

  // 构建 Jitsi 连接信息
  const joinInfo = {
    domain: jitsiDomain,
    port: jitsiPort,
    roomName,
    displayName: req.user.displayName,
    role: req.user.role,
    group: targetGroup ? {
      id: targetGroup.id,
      name: targetGroup.name
    } : null,
    // 会议配置覆盖（传给 Jitsi IFrame API）
    configOverwrite: {
      startWithAudioMuted: req.user.role === 'member',  // 普通成员默认静音
      startWithVideoMuted: false,
      enableClosePage: false,
      disableDeepLinking: true,
      toolbarButtons: getToolbarButtons(req.user.role, config)
    },
    interfaceConfigOverwrite: {
      SHOW_JITSI_WATERMARK: false,
      SHOW_WATERMARK_FOR_GUESTS: false,
      SHOW_BRAND_WATERMARK: false,
      TOOLBAR_ALWAYS_VISIBLE: true,
      DISABLE_JOIN_LEAVE_NOTIFICATIONS: false
    }
  };

  res.json({ joinInfo });
});

/**
 * POST /api/meeting/:id/assign
 * 分配成员到分组
 * 仅总主持人可操作
 * 请求体: { userId, groupId }
 */
router.post('/:id/assign', requireAuth, requirePermission('assign_members'), (req, res) => {
  const meeting = activeMeetings.get(req.params.id);
  if (!meeting) {
    return res.status(404).json({ error: '会议不存在' });
  }

  const { userId, groupId } = req.body;
  const group = meeting.groups.find(g => g.id === groupId);
  if (!group) {
    return res.status(404).json({ error: '分组不存在' });
  }

  // 从其他组移除该成员
  meeting.groups.forEach(g => {
    g.participants = g.participants.filter(p => p !== userId);
  });

  // 添加到目标组
  if (!group.participants.includes(userId)) {
    group.participants.push(userId);
  }

  logAction('member_assign', req.user.username,
    `将成员 ${userId} 分配到分组 ${group.name}`);

  res.json({ success: true, message: `已将成员分配到 ${group.name}` });
});

/**
 * POST /api/meeting/:id/move
 * 跨组移动成员
 * 仅总主持人可操作
 * 请求体: { userId, fromGroupId, toGroupId }
 */
router.post('/:id/move', requireAuth, requirePermission('move_members'), (req, res) => {
  const meeting = activeMeetings.get(req.params.id);
  if (!meeting) {
    return res.status(404).json({ error: '会议不存在' });
  }

  const { userId, fromGroupId, toGroupId } = req.body;

  // 从源组移除
  const fromGroup = meeting.groups.find(g => g.id === fromGroupId);
  if (fromGroup) {
    fromGroup.participants = fromGroup.participants.filter(p => p !== userId);
  }

  // 添加到目标组
  const toGroup = meeting.groups.find(g => g.id === toGroupId);
  if (!toGroup) {
    return res.status(404).json({ error: '目标分组不存在' });
  }
  if (!toGroup.participants.includes(userId)) {
    toGroup.participants.push(userId);
  }

  logAction('member_move', req.user.username,
    `将成员 ${userId} 从 ${fromGroup?.name || fromGroupId} 移至 ${toGroup.name}`);

  res.json({ success: true });
});

/**
 * POST /api/meeting/:id/end
 * 结束会议
 * 仅总主持人可操作
 */
router.post('/:id/end', requireAuth, requireRole('host'), (req, res) => {
  const meeting = activeMeetings.get(req.params.id);
  if (!meeting) {
    return res.status(404).json({ error: '会议不存在' });
  }

  meeting.status = 'ended';
  meeting.endedAt = new Date().toISOString();

  logAction('meeting_end', req.user.username, `结束会议: ${meeting.name}`);

  res.json({ success: true, message: '会议已结束' });
});

/**
 * POST /api/meeting/:id/password
 * 修改会议入会密码
 * 仅总主持人可操作
 * 请求体: { password: "新密码" }
 */
router.post('/:id/password', requireAuth, requirePermission('change_meeting_password'), (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 4) {
      return res.status(400).json({ error: '密码至少4位' });
    }

    // 更新配置文件中的密码
    const rawConfig = getConfigRaw();
    const config = yaml.load(rawConfig);
    config.meeting.defaultPassword = password;
    const newYaml = yaml.dump(config, { lineWidth: -1 });
    saveConfig(newYaml, req.user.username);

    logAction('password_change', req.user.username, '修改了入会密码');

    res.json({ success: true, message: '入会密码已修改' });
  } catch (err) {
    res.status(500).json({ error: '修改密码失败: ' + err.message });
  }
});

/**
 * GET /api/meeting/config/info
 * 获取当前会议配置信息（用于前端展示）
 */
router.get('/config/info', requireAuth, (req, res) => {
  const config = getConfig();

  const info = {
    systemName: config.system?.name || '会议系统',
    jitsiDomain: config.system?.jitsiDomain,
    jitsiPort: config.system?.jitsiPort,
    features: config.system?.features || {},
    mainRoom: config.meeting?.mainRoom || '主会场',
    groups: (config.meeting?.groups || []).map(g => ({
      id: g.id,
      name: g.name,
      moderatorId: g.moderatorId
    })),
    users: (config.users || []).map(u => ({
      id: u.id,
      username: u.username,
      role: u.role,
      group: u.group,
      displayName: u.displayName
    }))
  };

  res.json(info);
});

/**
 * 根据角色获取工具栏按钮列表
 * @param {string} role - 用户角色
 * @param {Object} config - 系统配置
 * @returns {Array} 工具栏按钮列表
 */
function getToolbarButtons(role, config) {
  const features = config.system?.features || {};

  // 基础按钮（所有角色可用）
  const baseButtons = ['microphone', 'camera', 'hangup', 'tileview', 'fullscreen'];

  // 根据功能开关添加
  if (features.chat) baseButtons.push('chat');
  if (features.screenShare && role !== 'member') baseButtons.push('desktop');

  // 主持人额外按钮
  if (role === 'host' || role === 'moderator') {
    baseButtons.push('mute-everyone', 'participants-pane');
    if (features.recording) baseButtons.push('recording');
    if (features.breakoutRooms && role === 'host') baseButtons.push('breakout-rooms');
  }

  return baseButtons;
}

module.exports = router;
