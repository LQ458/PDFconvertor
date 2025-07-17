#!/bin/bash

# 系统兼容性测试脚本
# 验证 macOS 和 CentOS 系统上的所有组件

echo "🔍 系统兼容性测试"
echo "=================================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 测试计数器
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# 测试函数
test_command() {
    local name="$1"
    local command="$2"
    local expected="$3"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    echo -n "📋 测试 $name ... "
    
    if eval "$command" &> /dev/null; then
        echo -e "${GREEN}✅ 通过${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        return 0
    else
        echo -e "${RED}❌ 失败${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        if [ -n "$expected" ]; then
            echo -e "   ${YELLOW}期望: $expected${NC}"
        fi
        return 1
    fi
}

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
echo -e "${BLUE}🖥️  操作系统: $OS_TYPE${NC}"
echo ""

# 系统基础测试
echo -e "${YELLOW}=== 系统基础组件测试 ===${NC}"

test_command "Shell环境" "[ -n \"$BASH_VERSION\" ] || [ -n \"$ZSH_VERSION\" ]"
test_command "基础命令-ls" "command -v ls"
test_command "基础命令-grep" "command -v grep"
test_command "基础命令-find" "command -v find"

if [ "$OS_TYPE" = "macos" ]; then
    test_command "macOS版本" "sw_vers"
elif [[ "$OS_TYPE" =~ ^(centos|redhat|linux)$ ]]; then
    test_command "Linux发行版" "[ -f /etc/os-release ] || [ -f /etc/centos-release ]"
    test_command "内存信息" "command -v free"
fi

echo ""

# Node.js 生态测试
echo -e "${YELLOW}=== Node.js 生态测试 ===${NC}"

test_command "Node.js" "command -v node"
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "   ${BLUE}版本: $NODE_VERSION${NC}"
    
    NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
    if [ "$NODE_MAJOR" -ge 18 ]; then
        echo -e "   ${GREEN}✅ 版本满足要求 (>= 18)${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "   ${RED}❌ 版本过低，需要 >= 18${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
fi

test_command "NPM" "command -v npm"
test_command "PNPM" "command -v pnpm"

echo ""

# PDF处理工具测试
echo -e "${YELLOW}=== PDF处理工具测试 ===${NC}"

test_command "Poppler (pdftotext)" "command -v pdftotext"
if command -v pdftotext &> /dev/null; then
    POPPLER_VERSION=$(pdftotext -v 2>&1 | head -1)
    echo -e "   ${BLUE}版本: $POPPLER_VERSION${NC}"
fi

test_command "Python3" "command -v python3"
test_command "JSON工具" "echo '{}' | python3 -m json.tool"

echo ""

# 项目结构测试
echo -e "${YELLOW}=== 项目结构测试 ===${NC}"

PROJECT_FILES=(
    "package.json:项目配置"
    "scripts/enhanced-pdf-embeddings.js:增强版处理器"
    "scripts/start-enhanced-embedding.sh:启动脚本"
    "scripts/fix-and-restart.sh:修复脚本"
    "scripts/centos-setup.sh:CentOS部署脚本"
)

for file_info in "${PROJECT_FILES[@]}"; do
    file="${file_info%%:*}"
    desc="${file_info##*:}"
    test_command "$desc" "[ -f \"$file\" ]"
done

echo ""

# 目录权限测试
echo -e "${YELLOW}=== 目录权限测试 ===${NC}"

test_command "training_data目录" "[ -d training_data ] || mkdir -p training_data"
test_command "embedding_data目录" "[ -d embedding_data ] || mkdir -p embedding_data"
test_command "scripts目录权限" "[ -r scripts/ ] && [ -x scripts/ ]"

echo ""

# 依赖包测试
echo -e "${YELLOW}=== Node.js依赖测试 ===${NC}"

if [ -f "package.json" ]; then
    test_command "node_modules存在" "[ -d node_modules ]"
    
    # 测试关键依赖
    KEY_DEPS=(
        "@xenova/transformers"
        "langchain"
        "node-poppler"
    )
    
    for dep in "${KEY_DEPS[@]}"; do
        test_command "依赖: $dep" "[ -d \"node_modules/$dep\" ] || [ -d \"node_modules/.pnpm/$dep\"* ]"
    done
else
    echo -e "${RED}❌ package.json 未找到${NC}"
    FAILED_TESTS=$((FAILED_TESTS + 1))
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
fi

echo ""

# 内存和性能测试
echo -e "${YELLOW}=== 系统资源测试 ===${NC}"

# 检查内存
if command -v free &> /dev/null; then
    TOTAL_MEM=$(free -m | awk 'NR==2{printf "%.0f", $2}')
    echo -e "${BLUE}系统内存: ${TOTAL_MEM}MB${NC}"
    
    if [ "$TOTAL_MEM" -ge 2048 ]; then
        echo -e "${GREEN}✅ 内存充足 (>= 2GB)${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "${YELLOW}⚠️ 内存较低，建议增加到2GB+${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
elif [[ "$OS_TYPE" == "macos" ]]; then
    # macOS 内存检测
    TOTAL_MEM_BYTES=$(sysctl hw.memsize | awk '{print $2}')
    TOTAL_MEM=$((TOTAL_MEM_BYTES / 1024 / 1024))
    echo -e "${BLUE}系统内存: ${TOTAL_MEM}MB${NC}"
    
    if [ "$TOTAL_MEM" -ge 4096 ]; then
        echo -e "${GREEN}✅ 内存充足 (>= 4GB)${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "${YELLOW}⚠️ 内存较低，建议增加到4GB+${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
fi

# 检查磁盘空间
AVAILABLE_SPACE=$(df -h . | awk 'NR==2 {print $4}' | sed 's/[^0-9.]*//g')
echo -e "${BLUE}可用磁盘空间: $(df -h . | awk 'NR==2 {print $4}')${NC}"

if [ "${AVAILABLE_SPACE%.*}" -ge 10 ]; then
    echo -e "${GREEN}✅ 磁盘空间充足${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo -e "${YELLOW}⚠️ 磁盘空间较少，建议保留20GB+${NC}"
    FAILED_TESTS=$((FAILED_TESTS + 1))
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))

echo ""

# 网络连接测试（可选）
echo -e "${YELLOW}=== 网络连接测试 ===${NC}"

test_command "DNS解析" "nslookup google.com > /dev/null 2>&1"
test_command "HTTP连接" "curl -s --connect-timeout 5 https://www.google.com > /dev/null"

echo ""

# 功能性测试
echo -e "${YELLOW}=== 功能性测试 ===${NC}"

# 测试脚本权限
SCRIPTS=(
    "scripts/start-enhanced-embedding.sh"
    "scripts/fix-and-restart.sh"
    "scripts/centos-setup.sh"
)

for script in "${SCRIPTS[@]}"; do
    if [ -f "$script" ]; then
        test_command "$(basename $script) 可执行" "[ -x \"$script\" ]"
    fi
done

# 测试Node.js能否运行基本代码
test_command "Node.js基本功能" "node -e \"console.log('test')\" > /dev/null 2>&1"

echo ""

# 生成测试报告
echo -e "${BLUE}=================================="
echo -e "🏁 测试完成报告"
echo -e "==================================${NC}"

echo -e "${BLUE}操作系统: $OS_TYPE${NC}"
echo -e "${BLUE}总测试数: $TOTAL_TESTS${NC}"
echo -e "${GREEN}通过测试: $PASSED_TESTS${NC}"
echo -e "${RED}失败测试: $FAILED_TESTS${NC}"

SUCCESS_RATE=$((PASSED_TESTS * 100 / TOTAL_TESTS))
echo -e "${BLUE}成功率: $SUCCESS_RATE%${NC}"

echo ""

if [ "$FAILED_TESTS" -eq 0 ]; then
    echo -e "${GREEN}🎉 所有测试通过！系统已准备就绪${NC}"
    echo -e "${BLUE}💡 您可以开始运行: ./scripts/start-enhanced-embedding.sh${NC}"
elif [ "$SUCCESS_RATE" -ge 80 ]; then
    echo -e "${YELLOW}⚠️ 大部分测试通过，系统基本可用${NC}"
    echo -e "${BLUE}💡 建议修复失败的测试项，然后运行: ./scripts/fix-and-restart.sh${NC}"
else
    echo -e "${RED}❌ 多个关键测试失败，建议检查系统配置${NC}"
    
    # 根据操作系统提供修复建议
    case $OS_TYPE in
        "macos")
            echo -e "${BLUE}💡 macOS修复建议:${NC}"
            echo -e "   brew install node poppler"
            echo -e "   npm install -g pnpm"
            ;;
        "centos"|"redhat")
            echo -e "${BLUE}💡 CentOS修复建议:${NC}"
            echo -e "   运行自动部署脚本: ./scripts/centos-setup.sh"
            echo -e "   或手动安装: sudo yum install -y nodejs npm poppler-utils"
            ;;
        *)
            echo -e "${BLUE}💡 通用修复建议:${NC}"
            echo -e "   检查Node.js、npm、poppler工具的安装"
            ;;
    esac
fi

echo ""
echo -e "${BLUE}📋 详细系统信息:${NC}"
echo -e "   Shell: $SHELL"
echo -e "   工作目录: $(pwd)"
echo -e "   用户: $(whoami)"
if command -v node &> /dev/null; then
    echo -e "   Node.js: $(node --version)"
fi
if command -v npm &> /dev/null; then
    echo -e "   NPM: $(npm --version)"
fi

exit $FAILED_TESTS 