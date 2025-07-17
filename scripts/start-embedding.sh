#!/bin/bash

echo "🚀 启动PDF文本提取和Embeddings生成..."
echo "使用本地模型，无需OpenAI API密钥"
echo ""

# 检查Node.js版本
NODE_VERSION=$(node --version 2>/dev/null)
if [ $? -ne 0 ]; then
    echo "❌ 错误: 未安装Node.js"
    echo "请先安装Node.js (版本 >= 18)"
    exit 1
fi

echo "✅ Node.js版本: $NODE_VERSION"

# 检查pnpm
if ! command -v pnpm &> /dev/null; then
    echo "❌ 错误: 未安装pnpm"
    echo "请先安装pnpm: npm install -g pnpm"
    exit 1
fi

echo "✅ pnpm已安装"

# 检查依赖是否安装
if [ ! -d "../node_modules" ]; then
    echo "📦 安装依赖..."
    cd .. && pnpm install
    cd scripts
fi

# 检查training_data目录
if [ ! -d "../training_data" ]; then
    echo "❌ 错误: 找不到training_data目录"
    echo "请确保training_data目录存在并包含PDF文件"
    exit 1
fi

# 检查是否有PDF文件
PDF_COUNT=$(find ../training_data -name "*.pdf" -type f 2>/dev/null | wc -l)
if [ "$PDF_COUNT" -eq 0 ]; then
    echo "❌ 错误: training_data目录中没有找到PDF文件"
    exit 1
fi

echo "📚 找到 $PDF_COUNT 个PDF文件"

# 检查.env文件
if [ ! -f "../.env" ]; then
    echo "⚠️  警告: 未找到.env文件"
    echo "如需自定义配置，请从env.template复制创建.env文件"
fi

echo ""
echo "开始处理..."
echo "首次运行时会自动下载embedding模型，请耐心等待"
echo ""

# 运行处理脚本
cd .. && node scripts/simple-pdf-embeddings.js

echo ""
echo "🎉 处理完成！查看embedding_data目录获取结果" 