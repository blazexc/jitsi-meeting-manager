#!/bin/bash
# ============================================================
# 会议管理系统 - 一键部署脚本
#
# 在服务器上执行此脚本即可完成部署。
# 使用方法: bash deploy.sh
# ============================================================

set -e

echo "========================================="
echo "  会议管理系统 - 部署脚本"
echo "========================================="

# 项目目录
APP_DIR="/opt/meeting-manager"

# 1. 安装必要工具
echo "[1/6] 检查必要工具..."
if ! command -v docker &> /dev/null; then
    echo "正在安装 Docker..."
    curl -fsSL https://get.docker.com | sh
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "正在安装 Docker Compose..."
    apt-get update && apt-get install -y docker-compose-plugin
fi

if ! command -v git &> /dev/null; then
    apt-get update && apt-get install -y git
fi

# 2. 克隆或更新代码
echo "[2/6] 获取代码..."
if [ -d "$APP_DIR" ]; then
    cd "$APP_DIR"
    git pull origin main
else
    git clone https://github.com/blazexc/jitsi-meeting-manager.git "$APP_DIR"
    cd "$APP_DIR"
fi

# 3. 构建 Docker 镜像
echo "[3/6] 构建 Docker 镜像..."
docker build -t meeting-manager:latest .

# 4. 停止旧容器（如果存在）
echo "[4/6] 停止旧容器..."
docker stop meeting-manager 2>/dev/null || true
docker rm meeting-manager 2>/dev/null || true

# 5. 启动新容器
echo "[5/6] 启动服务..."
docker run -d \
  --name meeting-manager \
  --restart unless-stopped \
  -p 3000:3000 \
  -v "$APP_DIR/server/config:/app/server/config" \
  -v "$APP_DIR/config-backups:/app/config-backups" \
  -v "$APP_DIR/logs:/app/logs" \
  -e PORT=3000 \
  -e JWT_SECRET="jitsi-meeting-prod-$(date +%s)" \
  -e NODE_ENV=production \
  meeting-manager:latest

# 6. 验证
echo "[6/6] 验证部署..."
sleep 3
if docker ps | grep -q meeting-manager; then
    echo ""
    echo "========================================="
    echo "  部署成功！"
    echo ""
    echo "  HTTP 服务端口: 3000"
    echo "  访问地址: http://$(hostname -I | awk '{print $1}'):3000"
    echo ""
    echo "  默认管理员: admin / admin123"
    echo "========================================="
else
    echo "部署失败！请检查日志:"
    docker logs meeting-manager
fi
