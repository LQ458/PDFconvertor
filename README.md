# PDF预处理服务

🚀 **专为RAG应用设计的PDF预处理服务** - 支持多种开源Embedding模型，无需OpenAI API

## ✨ 主要特性

- 🔧 **多种开源Embedding模型** - 支持BGE、Sentence Transformers等
- 🇨🇳 **中文优化** - 特别针对中文教材和文档优化
- 🧹 **智能文本清理** - 自动移除出版社信息，检测乱码
- 📊 **多种输出格式** - JSON、LangChain、OpenAI格式
- 🚀 **高效批处理** - 支持大规模文档处理
- 🌐 **RESTful API** - 完整的HTTP接口

## 🤖 支持的模型

| 模型 | 维度 | 语言 | 描述 |
|------|------|------|------|
| bge-large-zh-v1.5 | 1024 | 🇨🇳 | 中文优化大型模型 (推荐) |
| bge-base-zh-v1.5 | 768 | 🇨🇳 | 中文优化基础模型 |
| bge-m3 | 1024 | 🌍 | 多语言长文本模型 |
| all-mpnet-base-v2 | 768 | 🇺🇸 | 高质量英文模型 |
| all-MiniLM-L6-v2 | 384 | ⚡ | 轻量级高速模型 |

## 🚀 快速开始

### 1. 安装依赖
```bash
pnpm install
```

### 2. 配置环境
```bash
# 复制环境配置
cp .env.example .env

# 选择embedding模型（可选）
EMBEDDING_MODEL=bge-large-zh-v1.5  # 中文文档推荐
EMBEDDING_MODEL=all-MiniLM-L6-v2   # 快速处理推荐
```

### 3. 启动服务
```bash
pnpm run build
pnpm start
```

### 4. 测试服务
```bash
# 检查服务状态
curl http://localhost:3001/api/health

# 查看支持的模型
curl http://localhost:3001/api/pdf/models

# 上传PDF文件
curl -X POST -F "pdf=@your-file.pdf" -F "generateEmbeddings=true" http://localhost:3001/api/pdf/upload
```

## 📊 项目状态

- ✅ **服务运行正常** - 端口3001
- ✅ **多模型支持** - 7种embedding模型
- ✅ **API完整** - 文件上传、批处理、数据导出
- ✅ **文档完整** - 详细使用指南
- ✅ **无外部依赖** - 不需要OpenAI API key

## 📚 详细文档

查看 [使用指南.md](./使用指南.md) 获取完整的使用说明。

## 🔧 快速命令

```bash
# 查看可用模型
curl http://localhost:3001/api/pdf/models

# 批量处理教材
node scripts/batch-process-textbooks.js

# 检查服务状态
curl http://localhost:3001/api/pdf/status
```

---

**🎉 现在您可以使用完全开源的方案处理PDF文档了！**
