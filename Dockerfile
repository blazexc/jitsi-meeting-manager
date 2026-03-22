# ============================================================
# 会议管理系统 Dockerfile
#
# 基于 Node.js 18 Alpine 镜像构建
# 包含后端 API 服务和前端静态文件
# ============================================================

# 使用 Node.js 18 Alpine 作为基础镜像（体积小）
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 复制 package.json（利用 Docker 缓存层，依赖未变时不重新安装）
COPY package.json ./

# 安装生产环境依赖
RUN npm install --production

# 复制所有源代码
COPY . .

# 确保必要目录存在
RUN mkdir -p config-backups logs

# 暴露服务端口（默认 3000）
EXPOSE 3000

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3000

# 启动命令
CMD ["node", "server/index.js"]
