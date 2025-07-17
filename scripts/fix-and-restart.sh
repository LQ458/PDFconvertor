#!/bin/bash

echo "🔧 修复和重启PDF处理器..."
echo "支持 macOS 和 CentOS Linux 系统"

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

echo -e "${BLUE}🔍 检查和修复损坏的文件...${NC}"

# 检查并修复failures.json
FAILURES_FILE="embedding_data/failures.json"
if [ -f "$FAILURES_FILE" ]; then
    # 尝试验证JSON格式
    if command -v python3 &> /dev/null; then
        if ! python3 -m json.tool "$FAILURES_FILE" > /dev/null 2>&1; then
            echo -e "${YELLOW}⚠️ 修复损坏的 failures.json${NC}"
            echo "[]" > "$FAILURES_FILE"
        else
            echo -e "${GREEN}✅ failures.json格式正常${NC}"
        fi
    elif command -v python &> /dev/null; then
        if ! python -m json.tool "$FAILURES_FILE" > /dev/null 2>&1; then
            echo -e "${YELLOW}⚠️ 修复损坏的 failures.json${NC}"
            echo "[]" > "$FAILURES_FILE"
        else
            echo -e "${GREEN}✅ failures.json格式正常${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️ 未找到Python，跳过JSON验证${NC}"
    fi
else
    # 确保目录存在
    mkdir -p embedding_data
    echo "[]" > "$FAILURES_FILE"
    echo -e "${BLUE}📝 创建新的 failures.json${NC}"
fi

# 检查processing_report.json
REPORT_FILE="embedding_data/processing_report.json"
if [ -f "$REPORT_FILE" ]; then
    if command -v python3 &> /dev/null; then
        if ! python3 -m json.tool "$REPORT_FILE" > /dev/null 2>&1; then
            echo -e "${YELLOW}⚠️ 修复损坏的 processing_report.json${NC}"
            rm "$REPORT_FILE"
        else
            echo -e "${GREEN}✅ processing_report.json格式正常${NC}"
        fi
    elif command -v python &> /dev/null; then
        if ! python -m json.tool "$REPORT_FILE" > /dev/null 2>&1; then
            echo -e "${YELLOW}⚠️ 修复损坏的 processing_report.json${NC}"
            rm "$REPORT_FILE"
        else
            echo -e "${GREEN}✅ processing_report.json格式正常${NC}"
        fi
    fi
fi

# 检查Node.js版本
NODE_VERSION=$(node --version)
NODE_MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')

echo -e "${BLUE}📋 系统信息:${NC}"
echo -e "   - 操作系统: $OS_TYPE"
echo -e "   - Node.js版本: $NODE_VERSION"
echo -e "   - 项目目录: $PROJECT_ROOT"

# 如果是较新的Node.js版本，处理pdf-parse兼容性问题
if [ "$NODE_MAJOR_VERSION" -ge 20 ]; then
    echo -e "${YELLOW}⚠️ 检测到较新的Node.js版本，可能存在pdf-parse兼容性问题${NC}"
    
    # 清理包管理器缓存（支持不同系统）
    clean_cache() {
        echo -e "${BLUE}🧹 清理包管理器缓存...${NC}"
        
        case $OS_TYPE in
            "macos")
                if command -v pnpm &> /dev/null; then
                    pnpm store prune || true
                fi
                npm cache clean --force || true
                ;;
            "centos"|"redhat"|"debian"|"linux")
                # Linux系统上的缓存清理
                if command -v pnpm &> /dev/null; then
                    pnpm store prune || true
                fi
                npm cache clean --force || true
                
                # 清理yarn缓存（如果存在）
                if command -v yarn &> /dev/null; then
                    yarn cache clean || true
                fi
                ;;
        esac
    }
    
    clean_cache
    
    # 重新安装关键依赖（支持不同包管理器）
    reinstall_dependencies() {
        echo -e "${BLUE}📦 重新安装PDF处理相关依赖...${NC}"
        
        # 检测可用的包管理器
        if command -v pnpm &> /dev/null; then
            PKG_MANAGER="pnpm"
        elif command -v npm &> /dev/null; then
            PKG_MANAGER="npm"
        else
            echo -e "${RED}❌ 未找到包管理器${NC}"
            return 1
        fi
        
        echo -e "${BLUE}使用包管理器: $PKG_MANAGER${NC}"
        
        # 移除可能有问题的包
        $PKG_MANAGER remove pdf-parse 2>/dev/null || true
        $PKG_MANAGER remove node-poppler 2>/dev/null || true
        $PKG_MANAGER remove pdf2json 2>/dev/null || true
        
        # 重新安装，使用适当的参数
        case $PKG_MANAGER in
            "pnpm")
                $PKG_MANAGER add pdf-parse@1.1.1 --force || echo -e "${YELLOW}⚠️ pdf-parse安装失败，将使用其他方法${NC}"
                $PKG_MANAGER add node-poppler@8.0.3 --force || echo -e "${YELLOW}⚠️ node-poppler安装失败${NC}"
                $PKG_MANAGER add pdf2json@3.1.6 --force || echo -e "${YELLOW}⚠️ pdf2json安装失败${NC}"
                ;;
            "npm")
                $PKG_MANAGER install pdf-parse@1.1.1 --force || echo -e "${YELLOW}⚠️ pdf-parse安装失败，将使用其他方法${NC}"
                $PKG_MANAGER install node-poppler@8.0.3 --force || echo -e "${YELLOW}⚠️ node-poppler安装失败${NC}"
                $PKG_MANAGER install pdf2json@3.1.6 --force || echo -e "${YELLOW}⚠️ pdf2json安装失败${NC}"
                ;;
        esac
    }
    
    reinstall_dependencies
fi

# 检查系统依赖（根据操作系统）
check_system_dependencies() {
    echo -e "${BLUE}🔧 检查系统依赖...${NC}"
    
    case $OS_TYPE in
        "macos")
            if ! command -v pdftotext &> /dev/null; then
                echo -e "${YELLOW}⚠️ 未安装poppler工具${NC}"
                echo -e "${BLUE}💡 建议运行: brew install poppler${NC}"
                echo -e "${BLUE}📝 没有poppler也可以继续，将优先使用其他方法${NC}"
            else
                echo -e "${GREEN}✅ Poppler工具已安装${NC}"
            fi
            ;;
        "centos"|"redhat")
            if ! command -v pdftotext &> /dev/null; then
                echo -e "${YELLOW}⚠️ 未安装poppler工具${NC}"
                
                # 尝试自动安装
                if sudo -n true 2>/dev/null; then
                    echo -e "${BLUE}🔧 尝试自动安装poppler-utils...${NC}"
                    
                    if command -v dnf &> /dev/null; then
                        sudo dnf install -y poppler-utils || echo -e "${YELLOW}⚠️ 自动安装失败${NC}"
                    elif command -v yum &> /dev/null; then
                        sudo yum install -y poppler-utils || echo -e "${YELLOW}⚠️ 自动安装失败${NC}"
                    fi
                    
                    # 验证安装
                    if command -v pdftotext &> /dev/null; then
                        echo -e "${GREEN}✅ Poppler工具安装成功${NC}"
                    fi
                else
                    echo -e "${BLUE}💡 请手动安装: sudo yum install -y poppler-utils${NC}"
                    echo -e "${BLUE}📝 没有poppler也可以继续，但可能影响性能${NC}"
                fi
            else
                echo -e "${GREEN}✅ Poppler工具已安装${NC}"
            fi
            ;;
        "debian")
            if ! command -v pdftotext &> /dev/null; then
                echo -e "${YELLOW}⚠️ 未安装poppler工具${NC}"
                echo -e "${BLUE}💡 建议运行: sudo apt-get install poppler-utils${NC}"
                echo -e "${BLUE}📝 没有poppler也可以继续，将优先使用其他方法${NC}"
            else
                echo -e "${GREEN}✅ Poppler工具已安装${NC}"
            fi
            ;;
        *)
            echo -e "${YELLOW}⚠️ 未知操作系统，跳过系统依赖检查${NC}"
            ;;
    esac
}

check_system_dependencies

# 设置优化的运行环境（根据系统内存）
set_optimized_environment() {
    echo -e "${BLUE}⚙️ 设置优化的运行环境...${NC}"
    
    case $OS_TYPE in
        "macos")
            export NODE_OPTIONS="--max-old-space-size=8192 --expose-gc --no-warnings"
            ;;
        "centos"|"redhat"|"debian"|"linux")
            # 检测系统内存
            if command -v free &> /dev/null; then
                TOTAL_MEM=$(free -m | awk 'NR==2{printf "%.0f", $2}')
                echo -e "${BLUE}检测到系统内存: ${TOTAL_MEM}MB${NC}"
                
                if [ "$TOTAL_MEM" -gt 8192 ]; then
                    export NODE_OPTIONS="--max-old-space-size=6144 --expose-gc --no-warnings"
                elif [ "$TOTAL_MEM" -gt 4096 ]; then
                    export NODE_OPTIONS="--max-old-space-size=3072 --expose-gc --no-warnings"
                else
                    export NODE_OPTIONS="--max-old-space-size=2048 --expose-gc --no-warnings"
                    echo -e "${YELLOW}⚠️ 内存较低，已优化内存设置${NC}"
                fi
            else
                export NODE_OPTIONS="--max-old-space-size=4096 --expose-gc --no-warnings"
            fi
            ;;
        *)
            export NODE_OPTIONS="--max-old-space-size=4096 --expose-gc --no-warnings"
            ;;
    esac
    
    echo -e "${BLUE}内存设置: $NODE_OPTIONS${NC}"
}

set_optimized_environment

echo -e "${GREEN}🚀 启动增强版PDF处理器...${NC}"

# 使用更好的错误捕获
if ./scripts/start-enhanced-embedding.sh; then
    echo -e "\n${GREEN}🎉 修复并重启成功！${NC}"
else
    EXITCODE=$?
    echo -e "\n${RED}❌ 启动失败 (退出码: $EXITCODE)${NC}"
    
    echo -e "\n${YELLOW}🔍 进一步诊断:${NC}"
    
    # 检查特定错误模式
    if [ "$EXITCODE" -eq 1 ]; then
        echo -e "${BLUE}💡 尝试以下解决方案:${NC}"
        echo -e "   1. 完全重新安装依赖:"
        
        case $OS_TYPE in
            "macos")
                if command -v pnpm &> /dev/null; then
                    echo -e "      ${BLUE}rm -rf node_modules pnpm-lock.yaml && pnpm install${NC}"
                else
                    echo -e "      ${BLUE}rm -rf node_modules package-lock.json && npm install${NC}"
                fi
                ;;
            *)
                echo -e "      ${BLUE}rm -rf node_modules package-lock.json && npm install${NC}"
                ;;
        esac
        
        echo -e "   2. 检查Node.js版本兼容性"
        echo -e "   3. 手动测试PDF处理:"
        echo -e "      ${BLUE}node scripts/test-enhanced-single.js${NC}"
        echo -e "   4. 检查PDF文件权限和路径"
        
        # 系统特定的建议
        case $OS_TYPE in
            "centos"|"redhat")
                echo -e "   5. 确保系统依赖:"
                echo -e "      ${BLUE}sudo yum install -y poppler-utils python3${NC}"
                ;;
            "debian")
                echo -e "   5. 确保系统依赖:"
                echo -e "      ${BLUE}sudo apt-get install -y poppler-utils python3${NC}"
                ;;
        esac
    fi
    
    echo -e "\n${BLUE}📋 如果问题持续，请提供以下信息：${NC}"
    echo -e "   - 操作系统: $OS_TYPE"
    echo -e "   - Node.js版本: $NODE_VERSION"
    echo -e "   - 系统内存: $(free -m 2>/dev/null | awk 'NR==2{printf "%.0f MB", $2}' || echo '未知')"
    echo -e "   - 具体错误信息"
    
    exit $EXITCODE
fi 