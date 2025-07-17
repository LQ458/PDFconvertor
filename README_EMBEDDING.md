# 本地PDF文本提取与Embeddings生成系统

这是一个简单、高效的PDF文本提取和embeddings生成系统，使用本地模型，无需OpenAI API密钥。

## ✨ 特性

- 🚀 **完全本地运行** - 无需任何外部API密钥
- 🇨🇳 **支持中文** - 使用多语言embedding模型
- 📚 **批量处理** - 自动处理整个目录树中的PDF文件
- 💾 **结构化输出** - 生成JSON格式的chunks和embeddings
- 🔧 **高度可配置** - 支持自定义分块大小、重叠等参数
- 📊 **详细报告** - 提供处理进度和质量统计

## 🎯 适用场景

- 教育内容RAG系统
- 知识库构建
- 文档检索系统
- 语义搜索应用

## 📋 系统要求

- Node.js >= 18
- pnpm 包管理器
- 至少 2GB 可用内存（用于embedding模型）

## 🚀 快速开始

### 1. 准备数据

将你的PDF文件放入 `training_data` 目录：

```
training_data/
├── 小学/
│   ├── 数学/
│   │   ├── 人教版/
│   │   │   ├── 义务教育教科书·数学一年级上册.pdf
│   │   │   └── 义务教育教科书·数学二年级上册.pdf
│   │   └── 苏教版/
│   └── 语文/
└── 初中/
    ├── 数学/
    └── 物理/
```

### 2. 安装依赖

```bash
pnpm install
```

### 3. 运行处理

```bash
# 方式1：使用启动脚本（推荐）
cd scripts
./start-embedding.sh

# 方式2：直接运行
node scripts/simple-pdf-embeddings.js
```

### 4. 测试单个文件

```bash
# 测试第一个找到的PDF文件
node scripts/test-single-pdf.js
```

## 📁 输出结构

处理完成后，会在 `embedding_data` 目录生成以下文件：

```
embedding_data/
├── chunks/           # 文本分块结果
│   ├── 小学_数学_人教版_义务教育教科书·数学一年级上册_chunks.json
│   └── ...
├── embeddings/       # 向量数据
│   ├── 小学_数学_人教版_义务教育教科书·数学一年级上册_embeddings.json
│   └── ...
├── metadata/         # 元数据信息
│   ├── 小学_数学_人教版_义务教育教科书·数学一年级上册_metadata.json
│   └── ...
├── processing_report.json  # 处理总结报告
└── failures.json           # 失败文件记录（如果有）
```

## 🔧 配置选项

复制 `env.template` 为 `.env` 来自定义配置：

```bash
cp env.template .env
```

可配置参数：

- `CHUNK_SIZE`: 文本分块大小（默认1000字符）
- `CHUNK_OVERLAP`: 分块重叠大小（默认200字符）
- `BATCH_SIZE`: 批处理大小（默认5个文件）
- `EMBEDDING_MODEL`: embedding模型名称

## 📊 数据格式说明

### Chunks文件格式

```json
[
  {
    "content": "这是一段文本内容...",
    "metadata": {
      "source": "/path/to/file.pdf",
      "totalPages": 100,
      "extractedAt": "2024-01-01T00:00:00.000Z",
      "chunkIndex": 0,
      "chunkSize": 856
    }
  }
]
```

### Embeddings文件格式

```json
[
  {
    "content": "这是一段文本内容...",
    "embedding": [0.1234, -0.5678, 0.9012, ...], // 384维向量
    "metadata": {
      "source": "/path/to/file.pdf",
      "chunkIndex": 0,
      "chunkSize": 856
    }
  }
]
```

## 🤖 使用的模型

- **Embedding模型**: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`
  - 支持100+种语言（包括中文）
  - 输出384维向量
  - 模型大小：~120MB

## 🔍 故障排除

### 常见问题

1. **内存不足**
   - 减少 `BATCH_SIZE` 参数
   - 减少 `CHUNK_SIZE` 参数

2. **模型下载失败**
   - 检查网络连接
   - 尝试重新运行

3. **PDF解析失败**
   - 检查PDF文件是否损坏
   - 某些PDF可能包含特殊格式，查看 `failures.json` 了解详情

### 性能优化

- **内存使用**: 约1-2GB（包括模型和处理缓存）
- **处理速度**: 根据文件大小，约每分钟10-50个PDF
- **首次运行**: 会下载模型，需要额外时间

## 📈 处理统计

系统会生成详细的处理报告：

- 总文件数 / 成功处理数 / 失败数
- 成功率百分比
- 总文本块数
- 处理耗时
- 平均每文件处理时间

## 🔗 集成RAG系统

生成的embeddings可以直接用于：

- 向量数据库（如Chroma、Pinecone、Qdrant）
- 语义搜索
- 问答系统
- 文档推荐

示例使用代码请查看相关RAG集成文档。

## 📝 更新日志

- **v1.0.0**: 初始版本，支持本地embedding生成
- 删除了复杂的OCR和质量管理功能，专注于简单高效的文本提取

## 🤝 贡献

欢迎提交Issue和Pull Request来改进这个系统！

## �� 许可证

MIT License 