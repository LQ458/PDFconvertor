#!/bin/bash

# 增强版PDF Embedding处理启动脚本
# 支持断点续连、多种PDF处理库、更好的错误处理
# 支持 macOS 和 CentOS Linux 系统

set -e  # 遇到错误时停止

echo "🚀 启动增强版PDF Embedding处理器..."

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# 切换到项目根目录
cd "$PROJECT_ROOT"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 检测操作系统
detect_os() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "macos"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if [ -f /etc/centos-release ]; then
            echo "centos"
        elif [ -f /etc/redhat-release ]; then
            echo "redhat"
        elif [ -f /etc/debian_version ]; then
            echo "debian"
        else
            echo "linux"
        fi
    else
        echo "unknown"
    fi
}

OS_TYPE=$(detect_os)
echo -e "${BLUE}🖥️  检测到操作系统: $OS_TYPE${NC}"

# 检查Node.js版本
echo -e "${BLUE}📋 检查运行环境...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js 未安装${NC}"
    
    # 根据操作系统提供安装建议
    case $OS_TYPE in
        "macos")
            echo -e "${BLUE}💡 请安装Node.js: brew install node${NC}"
            ;;
        "centos"|"redhat")
            echo -e "${BLUE}💡 请安装Node.js:${NC}"
            echo -e "   sudo yum install -y nodejs npm"
            echo -e "   # 或者使用NodeSource仓库获取最新版本:"
            echo -e "   curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -"
            echo -e "   sudo yum install -y nodejs"
            ;;
        "debian")
            echo -e "${BLUE}💡 请安装Node.js: sudo apt-get install -y nodejs npm${NC}"
            ;;
        *)
            echo -e "${BLUE}💡 请安装Node.js (版本 >= 18)${NC}"
            ;;
    esac
    exit 1
fi

NODE_VERSION=$(node --version)
echo -e "${GREEN}✅ Node.js: $NODE_VERSION${NC}"

# 检查Node.js版本兼容性
NODE_MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
if [ "$NODE_MAJOR_VERSION" -ge 20 ]; then
    echo -e "${YELLOW}⚠️ 检测到较新的Node.js版本 ($NODE_VERSION)${NC}"
    echo -e "${BLUE}💡 将优先使用node-poppler处理PDF文件${NC}"
fi

# 检查包管理器
check_package_manager() {
    case $OS_TYPE in
        "macos")
            if ! command -v pnpm &> /dev/null; then
                echo -e "${RED}❌ pnpm 未安装，正在安装...${NC}"
                npm install -g pnpm
            fi
            ;;
        "centos"|"redhat")
            # 在CentOS上，优先使用npm，也支持安装pnpm
            if ! command -v npm &> /dev/null; then
                echo -e "${RED}❌ npm 未安装${NC}"
                exit 1
            fi
            
            if ! command -v pnpm &> /dev/null; then
                echo -e "${YELLOW}⚠️ pnpm 未安装，正在安装...${NC}"
                npm install -g pnpm
            fi
            ;;
        *)
            if ! command -v npm &> /dev/null; then
                echo -e "${RED}❌ npm 未安装${NC}"
                exit 1
            fi
            
            if ! command -v pnpm &> /dev/null; then
                echo -e "${YELLOW}⚠️ pnpm 未安装，使用npm代替${NC}"
            fi
            ;;
    esac
}

check_package_manager

PNPM_VERSION=$(pnpm --version 2>/dev/null || echo "未安装")
echo -e "${GREEN}✅ pnpm: $PNPM_VERSION${NC}"

# 安装依赖（如果需要）
install_dependencies() {
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}📦 安装依赖包...${NC}"
        
        if command -v pnpm &> /dev/null; then
            pnpm install
        else
            npm install
        fi
    fi
}

install_dependencies

# 检查训练数据目录
TRAINING_DATA_DIR="$PROJECT_ROOT/training_data"
if [ ! -d "$TRAINING_DATA_DIR" ]; then
    echo -e "${RED}❌ 训练数据目录不存在: $TRAINING_DATA_DIR${NC}"
    exit 1
fi

# 统计PDF文件数量
PDF_COUNT=$(find "$TRAINING_DATA_DIR" -name "*.pdf" | wc -l)
echo -e "${GREEN}📚 找到 $PDF_COUNT 个PDF文件${NC}"

if [ "$PDF_COUNT" -eq 0 ]; then
    echo -e "${RED}❌ 未找到PDF文件${NC}"
    exit 1
fi

# 检查输出目录
OUTPUT_DIR="$PROJECT_ROOT/embedding_data"
if [ -d "$OUTPUT_DIR" ]; then
    echo -e "${YELLOW}📁 输出目录已存在，支持断点续连${NC}"
    
    # 检查是否有损坏的文件
    FAILURES_FILE="$OUTPUT_DIR/failures.json"
    if [ -f "$FAILURES_FILE" ]; then
        # 尝试验证JSON格式
        if command -v python3 &> /dev/null; then
            if ! python3 -m json.tool "$FAILURES_FILE" > /dev/null 2>&1; then
                echo -e "${YELLOW}⚠️ 发现损坏的 failures.json，正在修复...${NC}"
                echo "[]" > "$FAILURES_FILE"
            fi
        elif command -v python &> /dev/null; then
            if ! python -m json.tool "$FAILURES_FILE" > /dev/null 2>&1; then
                echo -e "${YELLOW}⚠️ 发现损坏的 failures.json，正在修复...${NC}"
                echo "[]" > "$FAILURES_FILE"
            fi
        fi
    fi
else
    echo -e "${BLUE}📁 创建输出目录: $OUTPUT_DIR${NC}"
fi

# 系统依赖检查（针对node-poppler）
install_poppler() {
    echo -e "${BLUE}🔧 检查系统依赖...${NC}"
    
    case $OS_TYPE in
        "macos")
            if ! command -v pdftotext &> /dev/null; then
                echo -e "${YELLOW}⚠️ 未找到poppler工具${NC}"
                echo -e "${BLUE}💡 建议安装poppler以获得最佳性能: brew install poppler${NC}"
                echo -e "${BLUE}📝 没有poppler也可以继续，将使用其他PDF处理方法${NC}"
            else
                echo -e "${GREEN}✅ Poppler工具已安装${NC}"
            fi
            ;;
        "centos"|"redhat")
            if ! command -v pdftotext &> /dev/null; then
                echo -e "${YELLOW}⚠️ 未找到poppler工具，正在尝试安装...${NC}"
                
                # 检查是否有sudo权限
                if sudo -n true 2>/dev/null; then
                    echo -e "${BLUE}🔧 自动安装poppler-utils...${NC}"
                    
                    # 尝试不同的包管理器
                    if command -v dnf &> /dev/null; then
                        sudo dnf install -y poppler-utils
                    elif command -v yum &> /dev/null; then
                        sudo yum install -y poppler-utils
                    else
                        echo -e "${RED}❌ 找不到包管理器 (yum/dnf)${NC}"
                    fi
                    
                    # 验证安装
                    if command -v pdftotext &> /dev/null; then
                        echo -e "${GREEN}✅ Poppler工具安装成功${NC}"
                    else
                        echo -e "${YELLOW}⚠️ Poppler安装可能失败，但可以继续${NC}"
                    fi
                else
                    echo -e "${YELLOW}⚠️ 需要sudo权限安装poppler-utils${NC}"
                    echo -e "${BLUE}💡 请运行: sudo yum install -y poppler-utils${NC}"
                    echo -e "${BLUE}📝 没有poppler也可以继续，但可能影响PDF处理性能${NC}"
                fi
            else
                echo -e "${GREEN}✅ Poppler工具已安装${NC}"
            fi
            ;;
        "debian")
            if ! command -v pdftotext &> /dev/null; then
                echo -e "${YELLOW}⚠️ 未找到poppler工具${NC}"
                echo -e "${BLUE}💡 建议安装poppler: sudo apt-get install poppler-utils${NC}"
                echo -e "${BLUE}📝 没有poppler也可以继续，将使用其他PDF处理方法${NC}"
            else
                echo -e "${GREEN}✅ Poppler工具已安装${NC}"
            fi
            ;;
        *)
            echo -e "${YELLOW}⚠️ 未知操作系统，跳过系统依赖检查${NC}"
            ;;
    esac
}

install_poppler

# 设置环境变量（根据系统优化）
set_environment() {
    case $OS_TYPE in
        "macos")
            export NODE_OPTIONS="--max-old-space-size=8192 --expose-gc --no-warnings"
            ;;
        "centos"|"redhat"|"linux")
            # 云服务器通常内存较少，使用更保守的设置
            TOTAL_MEM=$(free -m 2>/dev/null | awk 'NR==2{printf "%.0f", $2}' || echo "4096")
            
            if [ "$TOTAL_MEM" -gt 8192 ]; then
                export NODE_OPTIONS="--max-old-space-size=6144 --expose-gc --no-warnings"
            elif [ "$TOTAL_MEM" -gt 4096 ]; then
                export NODE_OPTIONS="--max-old-space-size=3072 --expose-gc --no-warnings"
            else
                export NODE_OPTIONS="--max-old-space-size=2048 --expose-gc --no-warnings"
                echo -e "${YELLOW}⚠️ 检测到较低内存 (${TOTAL_MEM}MB)，已优化内存设置${NC}"
            fi
            ;;
        *)
            export NODE_OPTIONS="--max-old-space-size=4096 --expose-gc --no-warnings"
            ;;
    esac
    
    echo -e "${BLUE}⚙️ 内存设置: $NODE_OPTIONS${NC}"
}

set_environment

echo -e "${GREEN}🎯 开始处理PDF文件...${NC}"
echo -e "${BLUE}📋 处理配置:${NC}"
echo -e "   - 操作系统: $OS_TYPE"
echo -e "   - 训练数据目录: $TRAINING_DATA_DIR"
echo -e "   - 输出目录: $OUTPUT_DIR"
echo -e "   - PDF文件数量: $PDF_COUNT"
echo -e "   - 支持断点续连: 是"
echo -e "   - PDF处理策略: 智能选择最佳方法"

# 运行增强版处理器
echo -e "\n${GREEN}🚀 启动增强版PDF处理器...${NC}"

# 使用更好的错误处理
if node scripts/enhanced-pdf-embeddings.js; then
    echo -e "\n${GREEN}🎉 处理完成！${NC}"
    echo -e "${BLUE}📁 查看结果目录: $OUTPUT_DIR${NC}"
    
    # 显示简单统计
    if [ -f "$OUTPUT_DIR/processing_report.json" ]; then
        echo -e "\n${BLUE}📊 处理统计:${NC}"
        CHUNKS_COUNT=$(ls "$OUTPUT_DIR/chunks/" 2>/dev/null | wc -l || echo "0")
        EMBEDDINGS_COUNT=$(ls "$OUTPUT_DIR/embeddings/" 2>/dev/null | wc -l || echo "0")
        echo -e "   - 处理的文件: $CHUNKS_COUNT"
        echo -e "   - 生成的embeddings: $EMBEDDINGS_COUNT"
    fi
    
    echo -e "\n${GREEN}✅ 增强版PDF处理器运行成功！${NC}"
else
    EXITCODE=$?
    echo -e "\n${RED}❌ 处理器运行失败 (退出码: $EXITCODE)${NC}"
    
    # 检查是否是pdf-parse相关错误
    echo -e "\n${YELLOW}🔍 错误诊断:${NC}"
    if [ "$EXITCODE" -eq 1 ]; then
        echo -e "${BLUE}💡 可能的解决方案:${NC}"
        echo -e "   1. 运行修复脚本: ./scripts/fix-and-restart.sh"
        echo -e "   2. 检查Node.js版本兼容性"
        
        case $OS_TYPE in
            "macos")
                echo -e "   3. 安装poppler工具: brew install poppler"
                ;;
            "centos"|"redhat")
                echo -e "   3. 安装poppler工具: sudo yum install poppler-utils"
                ;;
            "debian")
                echo -e "   3. 安装poppler工具: sudo apt-get install poppler-utils"
                ;;
        esac
        
        echo -e "   4. 清理重新安装: rm -rf node_modules && npm install"
    fi
    
    exit $EXITCODE
fi 