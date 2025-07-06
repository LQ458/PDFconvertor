#!/bin/bash

# PDF 预处理服务快速启动脚本

echo "🚀 开始启动 PDF 预处理服务..."

# 检查是否存在 .env 文件
if [ ! -f .env ]; then
    echo "⚠️  未找到 .env 文件，正在创建..."
    cp env.example .env
    echo "✏️  请编辑 .env 文件，设置 OPENAI_API_KEY 等必要环境变量"
    echo "📝 编辑完成后，请重新运行此脚本"
    exit 1
fi

# 检查 Node.js 版本
NODE_VERSION=$(node -v 2>/dev/null || echo "未安装")
if [[ "$NODE_VERSION" == "未安装" ]]; then
    echo "❌ 请先安装 Node.js (推荐版本 18+)"
    exit 1
fi

echo "✅ Node.js 版本: $NODE_VERSION"

# 检查是否存在 node_modules
if [ ! -d "node_modules" ]; then
    echo "📦 正在安装依赖..."
    npm install
fi

# 创建必要的目录
echo "📁 创建输出目录..."
mkdir -p output/processed output/vectors output/metadata temp

# 构建项目
echo "🔨 构建项目..."
npm run build

# 启动服务
echo "🚀 启动 PDF 预处理服务..."
echo "📍 服务将在 http://localhost:3001 启动"
echo "📚 API 文档: http://localhost:3001/api/health"
echo ""
echo "🛑 按 Ctrl+C 停止服务"
echo ""

npm start 