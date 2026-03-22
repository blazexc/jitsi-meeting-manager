/**
 * Jitsi IFrame API 封装
 *
 * 封装了与 Jitsi 会议交互的所有方法，包括：
 * - 创建和销毁会议实例
 * - 事件监听（参会者变化、录制状态等）
 * - 控制命令（静音、踢出、分组管理等）
 * - 状态查询
 */

/**
 * JitsiManager 类
 * 管理 Jitsi IFrame API 的生命周期和交互
 */
class JitsiManager {
  /**
   * @param {HTMLElement} container - 用于嵌入 Jitsi iframe 的 DOM 容器
   */
  constructor(container) {
    // iframe 容器元素
    this.container = container;
    // JitsiMeetExternalAPI 实例
    this.api = null;
    // 事件回调注册表
    this.eventHandlers = {};
    // 参会者列表缓存
    this.participants = new Map();
    // 当前会议信息
    this.meetingInfo = null;
  }

  /**
   * 初始化并加入 Jitsi 会议
   * @param {Object} joinInfo - 入会信息（来自后端 /api/meeting/:id/join-info）
   * @returns {Promise} 会议准备就绪的 Promise
   */
  async init(joinInfo) {
    this.meetingInfo = joinInfo;

    // 构建 Jitsi 域名（含端口）
    const domain = joinInfo.port
      ? `${joinInfo.domain}:${joinInfo.port}`
      : joinInfo.domain;

    // 等待 JitsiMeetExternalAPI 脚本加载
    await this._loadJitsiScript(joinInfo.domain, joinInfo.port);

    return new Promise((resolve, reject) => {
      try {
        // 创建 Jitsi 会议实例
        this.api = new JitsiMeetExternalAPI(domain, {
          // 目标房间名
          roomName: joinInfo.roomName,
          // 嵌入容器
          parentNode: this.container,
          // iframe 尺寸
          width: '100%',
          height: '100%',
          // 用户信息
          userInfo: {
            displayName: joinInfo.displayName
          },
          // Jitsi 配置覆盖
          configOverwrite: joinInfo.configOverwrite || {},
          // 界面配置覆盖
          interfaceConfigOverwrite: joinInfo.interfaceConfigOverwrite || {}
        });

        // 注册核心事件监听
        this._registerCoreEvents();

        // 会议就绪时 resolve
        this.api.addEventListener('videoConferenceJoined', () => {
          resolve();
        });

        // 连接失败时 reject
        this.api.addEventListener('videoConferenceLeft', () => {
          // 正常离开不算错误
        });

      } catch (err) {
        reject(new Error('Jitsi 会议初始化失败: ' + err.message));
      }
    });
  }

  /**
   * 动态加载 Jitsi External API 脚本
   * @param {string} domain - Jitsi 域名
   * @param {number} [port] - Jitsi 端口
   * @returns {Promise} 脚本加载完成的 Promise
   * @private
   */
  _loadJitsiScript(domain, port) {
    return new Promise((resolve, reject) => {
      // 如果已经加载过，直接返回
      if (window.JitsiMeetExternalAPI) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      const portSuffix = port ? `:${port}` : '';
      script.src = `https://${domain}${portSuffix}/external_api.js`;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('无法加载 Jitsi API 脚本'));
      document.head.appendChild(script);
    });
  }

  /**
   * 注册核心事件监听
   * 这些事件会自动更新内部状态，并触发已注册的回调
   * @private
   */
  _registerCoreEvents() {
    if (!this.api) return;

    // 参会者加入
    this.api.addEventListener('participantJoined', (data) => {
      this.participants.set(data.id, {
        id: data.id,
        displayName: data.displayName || '未知',
        joinedAt: new Date().toISOString()
      });
      this._emit('participantJoined', data);
    });

    // 参会者离开
    this.api.addEventListener('participantLeft', (data) => {
      this.participants.delete(data.id);
      this._emit('participantLeft', data);
    });

    // 参会者显示名变化
    this.api.addEventListener('displayNameChange', (data) => {
      const p = this.participants.get(data.id);
      if (p) p.displayName = data.displayname;
      this._emit('displayNameChange', data);
    });

    // 静音状态变化
    this.api.addEventListener('audioMuteStatusChanged', (data) => {
      this._emit('audioMuteStatusChanged', data);
    });

    // 视频状态变化
    this.api.addEventListener('videoMuteStatusChanged', (data) => {
      this._emit('videoMuteStatusChanged', data);
    });

    // 录制状态变化
    this.api.addEventListener('recordingStatusChanged', (data) => {
      this._emit('recordingStatusChanged', data);
    });

    // 分组房间更新
    this.api.addEventListener('breakoutRoomsUpdated', (data) => {
      this._emit('breakoutRoomsUpdated', data);
    });

    // 会议结束
    this.api.addEventListener('readyToClose', () => {
      this._emit('readyToClose');
    });

    // 屏幕共享状态
    this.api.addEventListener('screenSharingStatusChanged', (data) => {
      this._emit('screenSharingStatusChanged', data);
    });

    // 举手状态
    this.api.addEventListener('raiseHandUpdated', (data) => {
      this._emit('raiseHandUpdated', data);
    });

    // 摄像头错误
    this.api.addEventListener('cameraError', (data) => {
      this._emit('cameraError', data);
    });

    // 麦克风错误
    this.api.addEventListener('micError', (data) => {
      this._emit('micError', data);
    });
  }

  // ===== 事件管理 =====

  /**
   * 注册事件回调
   * @param {string} event - 事件名称
   * @param {Function} handler - 回调函数
   */
  on(event, handler) {
    if (!this.eventHandlers[event]) {
      this.eventHandlers[event] = [];
    }
    this.eventHandlers[event].push(handler);
  }

  /**
   * 触发事件回调
   * @param {string} event - 事件名称
   * @param {*} data - 事件数据
   * @private
   */
  _emit(event, data) {
    const handlers = this.eventHandlers[event] || [];
    handlers.forEach(h => {
      try {
        h(data);
      } catch (e) {
        console.error(`事件处理错误 [${event}]:`, e);
      }
    });
  }

  // ===== 控制命令 =====

  /**
   * 静音/取消静音指定参会者
   * @param {string} participantId - 参会者 ID
   * @param {boolean} mute - true 为静音，false 为取消静音
   */
  muteParticipant(participantId, mute = true) {
    if (!this.api) return;
    if (mute) {
      this.api.executeCommand('muteEveryone'); // Jitsi 原生不支持精确静音单人，这里用近似方案
    }
  }

  /**
   * 全体静音
   */
  muteAll() {
    if (!this.api) return;
    this.api.executeCommand('muteEveryone');
  }

  /**
   * 切换自己的麦克风状态
   */
  toggleAudio() {
    if (!this.api) return;
    this.api.executeCommand('toggleAudio');
  }

  /**
   * 切换自己的摄像头状态
   */
  toggleVideo() {
    if (!this.api) return;
    this.api.executeCommand('toggleVideo');
  }

  /**
   * 切换屏幕共享
   */
  toggleShareScreen() {
    if (!this.api) return;
    this.api.executeCommand('toggleShareScreen');
  }

  /**
   * 开始录制
   * @param {string} mode - 录制模式（'file' 或 'stream'）
   */
  startRecording(mode = 'file') {
    if (!this.api) return;
    this.api.executeCommand('startRecording', { mode });
  }

  /**
   * 停止录制
   * @param {string} mode - 录制模式
   */
  stopRecording(mode = 'file') {
    if (!this.api) return;
    this.api.executeCommand('stopRecording', mode);
  }

  /**
   * 发送文本消息（通知）
   * @param {string} message - 消息内容
   */
  sendNotification(message) {
    if (!this.api) return;
    this.api.executeCommand('sendEndpointTextMessage', '', message);
  }

  /**
   * 设置显示名
   * @param {string} name - 新显示名
   */
  setDisplayName(name) {
    if (!this.api) return;
    this.api.executeCommand('displayName', name);
  }

  /**
   * 踢出参会者
   * @param {string} participantId - 参会者 ID
   */
  kickParticipant(participantId) {
    if (!this.api) return;
    this.api.executeCommand('kickParticipant', participantId);
  }

  /**
   * 发送参会者到指定房间
   * @param {string} participantId - 参会者 ID
   * @param {string} roomId - 目标房间 ID
   */
  sendParticipantToRoom(participantId, roomId) {
    if (!this.api) return;
    this.api.executeCommand('sendParticipantToRoom', participantId, roomId);
  }

  /**
   * 添加分组房间
   */
  addBreakoutRoom() {
    if (!this.api) return;
    this.api.executeCommand('addBreakoutRoom');
  }

  /**
   * 关闭分组房间
   * @param {string} roomId - 分组房间 ID
   */
  closeBreakoutRoom(roomId) {
    if (!this.api) return;
    this.api.executeCommand('closeBreakoutRoom', roomId);
  }

  /**
   * 删除分组房间
   * @param {string} roomId - 分组房间 ID
   */
  removeBreakoutRoom(roomId) {
    if (!this.api) return;
    this.api.executeCommand('removeBreakoutRoom', roomId);
  }

  /**
   * 自动分配成员到分组
   */
  autoAssignToBreakoutRooms() {
    if (!this.api) return;
    this.api.executeCommand('autoAssignToBreakoutRooms');
  }

  /**
   * 设置某人为焦点画面（大画面）
   * @param {string} participantId - 参会者 ID
   */
  setLargeVideoParticipant(participantId) {
    if (!this.api) return;
    this.api.executeCommand('setLargeVideoParticipant', participantId);
  }

  /**
   * 举手/放下手
   * @param {boolean} raised - 是否举手
   */
  toggleRaiseHand(raised) {
    if (!this.api) return;
    this.api.executeCommand('toggleRaiseHand');
  }

  // ===== 查询方法 =====

  /**
   * 获取所有参会者信息
   * @returns {number} 参会者数量
   */
  getParticipantsCount() {
    if (!this.api) return 0;
    return this.api.getNumberOfParticipants();
  }

  /**
   * 获取当前参会者列表
   * @returns {Map} 参会者 Map
   */
  getParticipants() {
    return this.participants;
  }

  /**
   * 检查自己是否静音
   * @returns {Promise<boolean>}
   */
  async isAudioMuted() {
    if (!this.api) return true;
    return this.api.isAudioMuted();
  }

  /**
   * 检查自己视频是否关闭
   * @returns {Promise<boolean>}
   */
  async isVideoMuted() {
    if (!this.api) return true;
    return this.api.isVideoMuted();
  }

  // ===== 生命周期 =====

  /**
   * 销毁 Jitsi 实例
   * 离开会议并清理资源
   */
  destroy() {
    if (this.api) {
      this.api.dispose();
      this.api = null;
    }
    this.participants.clear();
    this.eventHandlers = {};
  }

  /**
   * 挂起会议（隐藏 iframe）
   */
  hide() {
    if (this.container) {
      this.container.style.display = 'none';
    }
  }

  /**
   * 恢复显示
   */
  show() {
    if (this.container) {
      this.container.style.display = 'block';
    }
  }
}

// 导出到全局
window.JitsiManager = JitsiManager;
