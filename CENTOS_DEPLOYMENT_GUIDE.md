# 🐧 CentOS 云服务器部署指南

## 快速部署 (5分钟搞定)

### 1. 环境要求
- CentOS 7/8 或 RHEL 7/8+
- 至少 2GB 内存 (推荐 4GB+)
- sudo 权限
- 网络连接 (首次下载模型需要)

### 2. 一键部署
```bash
# 1. 克隆项目
git clone <your-repo-url>
cd PDFconvertor

# 2. 运行自动部署脚本
chmod +x scripts/centos-setup.sh
./scripts/centos-setup.sh

# 3. 重新加载环境变量
source ~/.bashrc
```

### 3. 上传PDF文件
```bash
# 本地上传到服务器
scp -r local_pdf_folder/ user@server:/path/to/PDFconvertor/training_data/
```

### 4. 开始处理
```bash
# 在screen中运行（推荐）
screen -S pdf_processor
cd scripts && ./start-enhanced-embedding.sh

# 分离会话: Ctrl+A, 然后按 D
# 重新连接: screen -r pdf_processor
```

## 手动部署步骤

如果自动脚本失败，可以手动安装：

### 1. 安装系统依赖
```bash
# 更新系统
sudo yum update -y

# 安装基础工具
sudo yum install -y curl wget git python3 gcc gcc-c++ make poppler-utils
```

### 2. 安装Node.js
```bash
# 安装最新Node.js
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs
```

### 3. 安装项目依赖
```bash
# 安装pnpm
npm install -g pnpm

# 安装项目依赖
pnpm install
```

### 4. 配置环境
```bash
# 设置内存限制
echo 'export NODE_OPTIONS="--max-old-space-size=3072 --expose-gc"' >> ~/.bashrc
source ~/.bashrc
```

## 常见问题解决

### 权限问题
```bash
# 如果没有sudo权限，联系管理员安装：
sudo yum install -y poppler-utils nodejs npm python3
```

### 内存不足
```bash
# 检查系统内存
free -h

# 如果内存<2GB，调整配置：
export NODE_OPTIONS="--max-old-space-size=1536 --expose-gc"
```

### 网络问题
```bash
# 如果下载模型失败，可以配置代理：
npm config set proxy http://proxy-server:port
npm config set https-proxy http://proxy-server:port
```

### 防火墙问题
```bash
# 如果需要开放端口（一般不需要，本地处理）
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```

## 监控和维护

### 查看进程状态
```bash
# 查看Node.js进程
ps aux | grep node

# 查看内存使用
free -h

# 查看磁盘空间
df -h
```

### 查看处理进度
```bash
# 实时监控处理文件数
watch -n 30 'ls embedding_data/chunks/ | wc -l'

# 查看处理报告
cat embedding_data/processing_report.json | python3 -m json.tool
```

### 日志分析
```bash
# 查看系统日志
journalctl -u node --since "1 hour ago"

# 查看进程日志
tail -f /var/log/messages | grep node
```

## 性能优化建议

### 硬件配置
- **最低配置**: 2核CPU, 2GB内存, 20GB硬盘
- **推荐配置**: 4核CPU, 4GB内存, 50GB SSD
- **高性能配置**: 8核CPU, 8GB内存, 100GB SSD

### 系统优化
```bash
# 增加文件描述符限制
echo "* soft nofile 65536" >> /etc/security/limits.conf
echo "* hard nofile 65536" >> /etc/security/limits.conf

# 优化内核参数
echo "vm.max_map_count=262144" >> /etc/sysctl.conf
sysctl -p
```

### 批量处理策略
- 小文件（<10MB）：可以增加批处理大小
- 大文件（>50MB）：建议单个处理
- 超大文件（>100MB）：考虑预先分割

## 安全注意事项

### 文件权限
```bash
# 确保处理目录权限正确
chmod 755 training_data/ embedding_data/
chmod 644 training_data/*.pdf
```

### 进程安全
```bash
# 使用普通用户运行，避免root权限
whoami  # 确保不是root

# 限制进程资源
ulimit -m 4194304  # 限制内存为4GB
```

### 数据备份
```bash
# 定期备份处理结果
tar -czf embedding_backup_$(date +%Y%m%d).tar.gz embedding_data/

# 上传到对象存储或其他服务器
```

## 故障排除

### 完全重置
```bash
# 如果遇到严重问题，可以完全重置
rm -rf node_modules/ embedding_data/
./scripts/centos-setup.sh
```

### 联系支持
如果问题无法解决，请提供：
1. 系统版本：`cat /etc/centos-release`
2. 内存信息：`free -h`
3. Node.js版本：`node --version`
4. 错误日志：完整的错误输出

---

**部署成功后，您可以开始处理PDF文件了！** 🎉 