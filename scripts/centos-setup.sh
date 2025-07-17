#!/bin/bash

# CentOS Linux 系统一键部署脚本
# 自动安装所有必要的依赖和工具

echo "🐧 CentOS PDF Embedding 处理器部署脚本"
echo "=================================================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 检查是否为root用户
check_root() {
    if [ "$EUID" -eq 0 ]; then
        echo -e "${YELLOW}⚠️ 检测到root用户，建议使用普通用户运行此脚本${NC}"
        echo -e "${BLUE}如果继续，将为当前用户设置环境${NC}"
        read -p "是否继续? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# 检测系统版本
detect_system() {
    echo -e "${BLUE}🔍 检测系统信息...${NC}"
    
    if [ -f /etc/centos-release ]; then
        OS_VERSION=$(cat /etc/centos-release)
        echo -e "${GREEN}✅ 检测到: $OS_VERSION${NC}"
    elif [ -f /etc/redhat-release ]; then
        OS_VERSION=$(cat /etc/redhat-release)
        echo -e "${GREEN}✅ 检测到: $OS_VERSION${NC}"
    else
        echo -e "${RED}❌ 未检测到CentOS/RHEL系统${NC}"
        exit 1
    fi
    
    # 检测包管理器
    if command -v dnf &> /dev/null; then
        PKG_MANAGER="dnf"
    elif command -v yum &> /dev/null; then
        PKG_MANAGER="yum"
    else
        echo -e "${RED}❌ 未找到包管理器${NC}"
        exit 1
    fi
    
    echo -e "${BLUE}使用包管理器: $PKG_MANAGER${NC}"
}

# 更新系统
update_system() {
    echo -e "${BLUE}📦 更新系统包...${NC}"
    
    if sudo -n true 2>/dev/null; then
        sudo $PKG_MANAGER update -y
    else
        echo -e "${YELLOW}⚠️ 需要sudo权限更新系统包${NC}"
        echo -e "${BLUE}💡 请运行: sudo $PKG_MANAGER update -y${NC}"
        read -p "是否跳过系统更新? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# 安装基础工具
install_basic_tools() {
    echo -e "${BLUE}🔧 安装基础工具...${NC}"
    
    BASIC_PACKAGES=(
        "curl"
        "wget"
        "git"
        "python3"
        "python3-pip"
        "gcc"
        "gcc-c++"
        "make"
        "poppler-utils"
        "which"
        "procps-ng"
    )
    
    for package in "${BASIC_PACKAGES[@]}"; do
        if ! rpm -q $package &> /dev/null; then
            echo -e "${YELLOW}安装 $package...${NC}"
            if sudo -n true 2>/dev/null; then
                sudo $PKG_MANAGER install -y $package
            else
                echo -e "${RED}❌ 需要sudo权限安装 $package${NC}"
                exit 1
            fi
        else
            echo -e "${GREEN}✅ $package 已安装${NC}"
        fi
    done
}

# 安装Node.js
install_nodejs() {
    echo -e "${BLUE}📱 安装Node.js...${NC}"
    
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version)
        echo -e "${GREEN}✅ Node.js已安装: $NODE_VERSION${NC}"
        
        # 检查版本是否足够新
        NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
        if [ "$NODE_MAJOR" -lt 18 ]; then
            echo -e "${YELLOW}⚠️ Node.js版本较旧，建议升级到v18+${NC}"
            install_nodejs_from_nodesource
        fi
    else
        install_nodejs_from_nodesource
    fi
}

install_nodejs_from_nodesource() {
    echo -e "${BLUE}🔄 从NodeSource安装最新Node.js...${NC}"
    
    # 安装NodeSource仓库
    if sudo -n true 2>/dev/null; then
        curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
        sudo $PKG_MANAGER install -y nodejs
        
        # 验证安装
        if command -v node &> /dev/null; then
            NODE_VERSION=$(node --version)
            echo -e "${GREEN}✅ Node.js安装成功: $NODE_VERSION${NC}"
        else
            echo -e "${RED}❌ Node.js安装失败${NC}"
            exit 1
        fi
    else
        echo -e "${RED}❌ 需要sudo权限安装Node.js${NC}"
        echo -e "${BLUE}💡 请手动运行:${NC}"
        echo -e "   curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -"
        echo -e "   sudo $PKG_MANAGER install -y nodejs"
        exit 1
    fi
}

# 安装pnpm
install_pnpm() {
    echo -e "${BLUE}📦 安装pnpm包管理器...${NC}"
    
    if command -v pnpm &> /dev/null; then
        PNPM_VERSION=$(pnpm --version)
        echo -e "${GREEN}✅ pnpm已安装: $PNPM_VERSION${NC}"
    else
        echo -e "${YELLOW}安装pnpm...${NC}"
        npm install -g pnpm
        
        # 验证安装
        if command -v pnpm &> /dev/null; then
            PNPM_VERSION=$(pnpm --version)
            echo -e "${GREEN}✅ pnpm安装成功: $PNPM_VERSION${NC}"
        else
            echo -e "${YELLOW}⚠️ pnpm安装失败，将使用npm${NC}"
        fi
    fi
}

# 配置项目环境
setup_project() {
    echo -e "${BLUE}🏗️  配置项目环境...${NC}"
    
    # 确保在正确的目录
    PROJECT_ROOT=$(pwd)
    echo -e "${BLUE}项目目录: $PROJECT_ROOT${NC}"
    
    # 安装项目依赖
    if [ -f "package.json" ]; then
        echo -e "${YELLOW}安装项目依赖...${NC}"
        
        if command -v pnpm &> /dev/null; then
            pnpm install
        else
            npm install
        fi
        
        echo -e "${GREEN}✅ 项目依赖安装完成${NC}"
    else
        echo -e "${RED}❌ 未找到package.json文件${NC}"
        echo -e "${BLUE}请确保在项目根目录运行此脚本${NC}"
        exit 1
    fi
    
    # 创建必要的目录
    mkdir -p training_data
    mkdir -p embedding_data
    
    # 设置脚本权限
    chmod +x scripts/*.sh 2>/dev/null || true
}

# 配置系统优化
optimize_system() {
    echo -e "${BLUE}⚡ 配置系统优化...${NC}"
    
    # 检查内存
    TOTAL_MEM=$(free -m | awk 'NR==2{printf "%.0f", $2}')
    echo -e "${BLUE}系统内存: ${TOTAL_MEM}MB${NC}"
    
    if [ "$TOTAL_MEM" -lt 2048 ]; then
        echo -e "${YELLOW}⚠️ 系统内存较低，建议升级到至少2GB${NC}"
    fi
    
    # 配置环境变量
    echo -e "${BLUE}配置环境变量...${NC}"
    
    ENV_FILE="$HOME/.bashrc"
    
    # 添加NODE_OPTIONS到bashrc（如果不存在）
    if ! grep -q "NODE_OPTIONS" "$ENV_FILE"; then
        echo "" >> "$ENV_FILE"
        echo "# PDF Processor Environment" >> "$ENV_FILE"
        echo "export NODE_OPTIONS=\"--max-old-space-size=3072 --expose-gc\"" >> "$ENV_FILE"
        echo -e "${GREEN}✅ 环境变量已添加到 $ENV_FILE${NC}"
    fi
}

# 运行测试
run_test() {
    echo -e "${BLUE}🧪 运行系统测试...${NC}"
    
    # 检查所有依赖
    echo -e "${YELLOW}检查依赖...${NC}"
    
    DEPS=(
        "node:Node.js"
        "npm:NPM"
        "python3:Python3"
        "pdftotext:Poppler"
        "git:Git"
    )
    
    for dep in "${DEPS[@]}"; do
        cmd="${dep%%:*}"
        name="${dep##*:}"
        
        if command -v $cmd &> /dev/null; then
            version=$($cmd --version 2>/dev/null | head -1)
            echo -e "${GREEN}✅ $name: $version${NC}"
        else
            echo -e "${RED}❌ $name: 未安装${NC}"
        fi
    done
    
    # 检查项目结构
    echo -e "${YELLOW}检查项目结构...${NC}"
    
    REQUIRED_FILES=(
        "package.json"
        "scripts/enhanced-pdf-embeddings.js"
        "scripts/start-enhanced-embedding.sh"
        "scripts/fix-and-restart.sh"
    )
    
    for file in "${REQUIRED_FILES[@]}"; do
        if [ -f "$file" ]; then
            echo -e "${GREEN}✅ $file${NC}"
        else
            echo -e "${RED}❌ $file 缺失${NC}"
        fi
    done
}

# 显示使用说明
show_usage() {
    echo -e "\n${GREEN}🎉 部署完成！${NC}"
    echo -e "${BLUE}================================================${NC}"
    echo -e "${YELLOW}使用说明:${NC}"
    echo ""
    echo -e "1. ${BLUE}放置PDF文件${NC}:"
    echo -e "   将PDF文件放到 training_data/ 目录中"
    echo ""
    echo -e "2. ${BLUE}启动处理${NC}:"
    echo -e "   cd scripts && ./start-enhanced-embedding.sh"
    echo ""
    echo -e "3. ${BLUE}修复问题${NC}:"
    echo -e "   cd scripts && ./fix-and-restart.sh"
    echo ""
    echo -e "4. ${BLUE}查看结果${NC}:"
    echo -e "   ls embedding_data/"
    echo ""
    echo -e "${YELLOW}注意事项:${NC}"
    echo -e "- 首次运行会下载AI模型(~120MB)"
    echo -e "- 处理大量PDF文件需要较长时间"
    echo -e "- 支持断点续连，可中断后继续"
    echo -e "- 建议在screen/tmux中运行长时间任务"
    echo ""
    echo -e "${BLUE}更多帮助: https://github.com/您的项目/README.md${NC}"
}

# 主函数
main() {
    echo -e "${GREEN}开始CentOS系统部署...${NC}"
    
    check_root
    detect_system
    update_system
    install_basic_tools
    install_nodejs
    install_pnpm
    setup_project
    optimize_system
    run_test
    show_usage
    
    echo -e "\n${GREEN}✅ 所有步骤完成！${NC}"
    echo -e "${BLUE}重新加载环境变量: source ~/.bashrc${NC}"
}

# 错误处理
set -e
trap 'echo -e "\n${RED}❌ 部署过程中发生错误，请检查上述输出${NC}"' ERR

# 运行主函数
main 