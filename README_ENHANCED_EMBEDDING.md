# 🚀 增强版PDF Embedding处理器

## 📋 概述

这是一个增强版的PDF文本提取和embedding生成系统，专为中文教材数据设计，具有以下特点：

- **🔧 多种PDF处理引擎**：支持`pdf-parse`、`node-poppler`、`pdf2json`三种PDF处理方法
- **⚡ 断点续连**：支持中断后继续处理，避免重复工作
- **🛡️ 健壮的错误处理**：优雅处理各种PDF格式和错误情况
- **🌐 本地运行**：完全离线，不依赖外部API
- **📊 详细报告**：提供处理进度和结果统计
- **🐧 跨平台支持**：支持 macOS 和 CentOS Linux 云服务器

## 🆚 新旧版本对比

| 特性 | 原版处理器 | 增强版处理器 |
|------|------------|--------------|
| PDF处理引擎 | 仅LangChain PDFLoader | pdf-parse + node-poppler + pdf2json |
| 断点续连 | ❌ | ✅ |
| 错误处理 | 基础 | 增强，自动重试多种方法 |
| JSON错误修复 | ❌ | ✅ |
| 处理报告 | 基础 | 详细统计和进度跟踪 |
| 批处理大小 | 5个文件 | 自适应（更稳定） |
| 跨平台支持 | 仅macOS | macOS + CentOS Linux |
| 内存优化 | 基础 | 智能内存管理 |

## 🖥️ 系统支持

### macOS
- macOS 10.15+ 
- Node.js 18+
- Homebrew (推荐)

### CentOS Linux (云服务器)
- CentOS 7/8 或 RHEL 7/8+
- 至少 2GB 内存 (推荐 4GB+)
- sudo 权限 (用于安装依赖)

## 📚 使用的库/模块

### 核心依赖
- **`pdf-parse`** - 纯JavaScript PDF文本提取库，基于pdf.js
- **`node-poppler`** - Poppler PDF工具的Node.js包装器（需要系统依赖）
- **`pdf2json`** - 功能丰富的PDF到JSON转换库
- **`@xenova/transformers`** - 本地sentence-transformers模型
- **`langchain`** - 文本分块工具

### 系统依赖

#### macOS
```bash
brew install poppler node
```

#### CentOS/RHEL
```bash
sudo yum install -y poppler-utils nodejs npm
# 或使用dnf (CentOS 8+)
sudo dnf install -y poppler-utils nodejs npm
```

## 🚀 快速开始

### 方式一：自动部署 (CentOS 推荐)

```bash
# 在项目根目录运行
chmod +x scripts/centos-setup.sh
./scripts/centos-setup.sh
```

这个脚本会自动：
- 检测系统版本
- 安装所有必要依赖
- 配置优化设置
- 验证安装结果

### 方式二：修复并启动（推荐）
```bash
# 一键修复已知问题并启动增强版处理器
cd scripts && ./fix-and-restart.sh
```

### 方式三：手动启动
```bash
# 使用增强版启动脚本
cd scripts && ./start-enhanced-embedding.sh
```

### 方式四：直接运行（高级用户）
```bash
# 直接运行处理器
NODE_OPTIONS="--max-old-space-size=4096 --expose-gc" node scripts/enhanced-pdf-embeddings.js
```

## 🔧 工作原理

### PDF处理策略
系统会依次尝试以下PDF处理方法，直到成功：

1. **node-poppler**（首选）
   - 优点：基于Poppler，处理能力强，支持复杂PDF
   - 需要：系统安装poppler工具
   - 稳定性：⭐⭐⭐⭐⭐

2. **pdf-parse**（备选）
   - 优点：纯JavaScript，无系统依赖，速度快
   - 适用：大多数标准PDF
   - 稳定性：⭐⭐⭐⭐

3. **pdf2json**（兜底）
   - 优点：功能丰富，支持特殊格式
   - 适用：其他方法失败的PDF
   - 稳定性：⭐⭐⭐

### 断点续连机制
- 系统会记录已处理的文件列表
- 重新运行时自动跳过已完成的文件
- 进度保存在`embedding_data/processing_report.json`

### 智能内存管理
- 根据系统内存自动调整处理批次
- 定期执行垃圾回收
- 内存不足时自动降级配置

## 📁 输出结构

```
embedding_data/
├── chunks/              # 文本分块数据
│   ├── 文件名1.json
│   └── 文件名2.json
├── embeddings/          # 向量数据
│   ├── 文件名1.json
│   └── 文件名2.json
├── metadata/           # 元数据
│   ├── 文件名1.json
│   └── 文件名2.json
├── processing_report.json  # 处理报告（支持断点续连）
└── failures.json          # 失败记录
```

## ⚙️ 配置选项

在`enhanced-pdf-embeddings.js`中可以调整：

```javascript
const CONFIG = {
    CHUNK_SIZE: 1000,           // 文本块大小
    CHUNK_OVERLAP: 200,         // 文本块重叠
    BATCH_SIZE: 1,              // 批处理大小（根据内存自动调整）
    RESUME_PROCESSING: true,    // 启用断点续连
    MEMORY_CLEANUP_INTERVAL: 10, // 内存清理间隔
    PROCESSING_DELAY: 2000,     // 处理延迟（毫秒）
};
```

## 🐛 问题解决

### 1. PDF提取失败
**问题**：显示"PDF文件为空或无法读取文本"
**解决**：
- 增强版会自动尝试3种不同的PDF处理方法
- 确保安装poppler工具：
  - macOS：`brew install poppler`
  - CentOS：`sudo yum install poppler-utils`

### 2. 内存不足错误
**问题**：`JavaScript heap out of memory`
**解决**：
- 系统会自动根据可用内存调整配置
- 手动设置：`export NODE_OPTIONS="--max-old-space-size=4096"`
- 云服务器建议至少4GB内存

### 3. 权限错误 (CentOS)
**问题**：无法安装系统依赖
**解决**：
```bash
# 确保有sudo权限
sudo yum install -y poppler-utils python3 nodejs npm

# 或使用部署脚本
./scripts/centos-setup.sh
```

### 4. Node.js版本问题
**问题**：Node.js版本过旧
**解决**：
```bash
# CentOS - 安装最新Node.js
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs

# macOS
brew install node
```

### 5. 断点续连不工作
**问题**：重复处理已完成的文件
**解决**：
- 检查`embedding_data/processing_report.json`是否存在
- 确保`CONFIG.RESUME_PROCESSING = true`

## 📊 性能优化

### 推荐的系统配置

#### 云服务器 (CentOS)
- **CPU**：2核心以上
- **内存**：4GB以上 (最低2GB)
- **存储**：SSD硬盘，至少20GB可用空间
- **网络**：稳定的网络连接 (首次下载模型)

#### 本地机器 (macOS)
- **内存**：至少4GB可用内存
- **存储**：SSD硬盘（提高文件I/O速度）
- **CPU**：多核处理器（支持并行处理）

### 处理大量文件的策略
1. **自适应批处理**：系统根据内存自动调整批次大小
2. **定期保存**：每批完成后保存进度
3. **内存清理**：处理间隔加入延迟，避免内存堆积
4. **长时间任务**：建议在`screen`或`tmux`中运行

```bash
# 使用screen (推荐用于云服务器)
screen -S pdf_processing
cd scripts && ./start-enhanced-embedding.sh
# Ctrl+A+D 分离，screen -r pdf_processing 重新连接
```

## 🔄 从旧版本迁移

如果你之前使用过简单版处理器：

1. **备份数据**：
   ```bash
   cp -r embedding_data embedding_data_backup
   ```

2. **使用增强版**：
   ```bash
   ./scripts/fix-and-restart.sh
   ```

3. **验证结果**：检查新的处理报告和统计信息

## 📈 监控和调试

### 查看处理进度
```bash
# 查看详细报告
cat embedding_data/processing_report.json | python3 -m json.tool

# 查看失败记录
cat embedding_data/failures.json | python3 -m json.tool

# 统计已处理文件
ls embedding_data/chunks/ | wc -l
```

### 系统资源监控
```bash
# 查看内存使用
free -h

# 查看CPU使用
top -p $(pgrep node)

# 查看磁盘空间
df -h embedding_data/
```

### 调试模式
在脚本中启用更详细的日志：
```javascript
console.log('🔍 调试信息:', {...调试数据});
```

## 🚀 云服务器部署最佳实践

### 1. 环境准备
```bash
# 更新系统
sudo yum update -y

# 安装基础工具
sudo yum install -y git curl wget vim

# 克隆项目
git clone <your-repo-url>
cd PDFconvertor
```

### 2. 自动部署
```bash
# 运行自动部署脚本
chmod +x scripts/centos-setup.sh
./scripts/centos-setup.sh
```

### 3. 上传PDF文件
```bash
# 使用scp上传
scp -r local_pdf_folder/ user@server:/path/to/PDFconvertor/training_data/

# 或使用rsync
rsync -av local_pdf_folder/ user@server:/path/to/PDFconvertor/training_data/
```

### 4. 后台运行
```bash
# 使用screen
screen -S pdf_processor
cd scripts && ./start-enhanced-embedding.sh

# 分离会话
# Ctrl+A, 然后按D

# 重新连接
screen -r pdf_processor
```

### 5. 监控进度
```bash
# 另一个终端监控
watch -n 30 'ls embedding_data/chunks/ | wc -l'

# 查看内存使用
watch -n 10 'free -h'
```

## 🤝 贡献

如果你遇到新的PDF格式问题或有改进建议，欢迎：
1. 提交Issue描述问题
2. 提供失败的PDF样本（如果可以的话）
3. 贡献代码改进

## 📝 更新日志

### v2.1 跨平台版 (当前版本)
- ✅ 添加CentOS Linux系统支持
- ✅ 智能操作系统检测
- ✅ 自动内存优化配置
- ✅ 一键部署脚本
- ✅ 云服务器优化

### v2.0 增强版
- ✅ 添加多种PDF处理引擎支持
- ✅ 实现断点续连功能
- ✅ 改进错误处理和恢复
- ✅ 优化内存使用和批处理
- ✅ 添加详细的处理报告

### v1.0 简单版
- ✅ 基础PDF文本提取
- ✅ 本地embedding生成
- ✅ 基础错误处理

---

## 📞 技术支持

如果遇到问题，请提供以下信息：

1. **系统信息**：
   ```bash
   # Linux
   cat /etc/*release
   free -h
   node --version
   
   # macOS
   sw_vers
   system_profiler SPHardwareDataType | grep Memory
   node --version
   ```

2. **错误日志**：完整的错误输出

3. **文件信息**：PDF文件的基本信息（大小、页数等）

**联系方式**：
- GitHub Issues：[项目Issues页面]
- 邮箱：[您的邮箱]
- 文档：[在线文档链接]

---

**祝您使用愉快！** 🎉 