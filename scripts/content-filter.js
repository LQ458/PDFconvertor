#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🧹 开始内容过滤，清理无关数据...\n');

// 定义过滤规则
const FILTER_PATTERNS = {
  // 版权和法律声明
  copyright: [
    /本公众账号分享的资源版权属于原出版机构/,
    /本资源为电子载体，传播分享仅.*限于家庭使用/,
    /不得以任何理由在商业行为.*中使用/,
    /若喜欢此资源，建议购买实体产品/,
    /版权所有.*翻印必究/,
    /未经许可.*不得转载/,
    /保留所有权利/
  ],
  
  // 平台和媒体信息
  platform: [
    /返回搜狐，查看更多/,
    /搜狐号系信息发布平台/,
    /搜狐仅提供信息存储空间服务/,
    /该文观点仅代表作者本人/,
    /微信公众号.*关注/,
    /扫码关注.*公众号/,
    /长按二维码.*关注/
  ],
  
  // 广告和推广
  advertising: [
    /阅读.*\(\d+\)/,
    /点赞.*\(\d+\)/,
    /转发.*分享/,
    /更多精彩内容/,
    /敬请关注/,
    /欢迎订阅/,
    /免费下载/,
    /限时优惠/
  ],
  
  // 作者和编辑信息
  author: [
    /作者：.*编辑：/,
    /责任编辑：/,
    /审核：.*校对：/,
    /来源：.*整理：/,
    /编者按/,
    /小编推荐/
  ],
  
  // 技术标记和元数据
  metadata: [
    /^\d+\/\d+$/,  // 页码
    /^第.*页$/,
    /^页码：\d+$/,
    /文件大小：.*MB/,
    /下载次数：\d+/,
    /上传时间：/
  ],
  
  // 空白和无意义内容
  empty: [
    /^[\s\n\r]*$/,
    /^[\.。，,\s]*$/,
    /^[\u3000\s]*$/,  // 全角空格
    /^[－—\-\s]*$/    // 各种横线
  ]
};

// 合并所有模式
const ALL_PATTERNS = Object.values(FILTER_PATTERNS).flat();

// 检查内容是否应该被过滤
function shouldFilterContent(content) {
  if (!content || typeof content !== 'string') {
    return true;
  }
  
  const trimmedContent = content.trim();
  
  // 检查长度
  if (trimmedContent.length < 10) {
    return true;
  }
  
  // 检查是否匹配过滤模式
  for (const pattern of ALL_PATTERNS) {
    if (pattern.test(trimmedContent)) {
      return true;
    }
  }
  
  // 检查是否主要由特殊字符组成
  const specialCharRatio = (trimmedContent.match(/[^\u4e00-\u9fa5\w\s]/g) || []).length / trimmedContent.length;
  if (specialCharRatio > 0.5) {
    return true;
  }
  
  // 检查重复字符
  const uniqueChars = new Set(trimmedContent.replace(/\s/g, ''));
  if (uniqueChars.size < 5 && trimmedContent.length > 20) {
    return true;
  }
  
  return false;
}

// 智能内容清理
function cleanContent(content) {
  if (!content) return '';
  
  let cleaned = content;
  
  // 移除常见的无关片段
  const removePatterns = [
    /本公众账号分享的资源版权属于原出版机构[^。]*。/g,
    /返回搜狐，查看更多[^。]*。?/g,
    /声明：该文观点仅代表作者本人[^。]*。/g,
    /搜狐号系信息发布平台[^。]*。/g,
    /阅读\s*\(\d+\)/g,
    /点赞\s*\(\d+\)/g
  ];
  
  for (const pattern of removePatterns) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  // 清理多余空白
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  return cleaned;
}

// 处理文件
function filterFile(filePath) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    if (!data.chunks || data.chunks.length === 0) {
      return { original: 0, filtered: 0, removed: 0 };
    }
    
    const originalCount = data.chunks.length;
    const filteredChunks = [];
    let removedCount = 0;
    
    for (const chunk of data.chunks) {
      if (shouldFilterContent(chunk.content)) {
        removedCount++;
        continue;
      }
      
      // 清理内容
      const cleanedContent = cleanContent(chunk.content);
      
      if (cleanedContent.length >= 20) {  // 最小长度阈值
        filteredChunks.push({
          ...chunk,
          content: cleanedContent,
          metadata: {
            ...chunk.metadata,
            filtered: true,
            originalLength: chunk.content.length,
            cleanedLength: cleanedContent.length
          }
        });
      } else {
        removedCount++;
      }
    }
    
    // 更新chunk索引
    filteredChunks.forEach((chunk, index) => {
      chunk.metadata.chunkIndex = index;
    });
    
    // 保存过滤后的数据
    const filteredData = {
      ...data,
      chunks: filteredChunks,
      totalChunks: filteredChunks.length,
      filtering: {
        timestamp: new Date().toISOString(),
        originalChunks: originalCount,
        filteredChunks: filteredChunks.length,
        removedChunks: removedCount,
        removalRate: (removedCount / originalCount * 100).toFixed(1)
      }
    };
    
    fs.writeFileSync(filePath, JSON.stringify(filteredData, null, 2));
    
    return {
      original: originalCount,
      filtered: filteredChunks.length,
      removed: removedCount
    };
    
  } catch (error) {
    console.error(`❌ 处理文件失败: ${path.basename(filePath)}`, error.message);
    return { original: 0, filtered: 0, removed: 0 };
  }
}

// 主处理流程
const optimizedDir = './output/optimized';
if (!fs.existsSync(optimizedDir)) {
  console.error('❌ 优化数据目录不存在');
  process.exit(1);
}

const files = fs.readdirSync(optimizedDir).filter(f => f.endsWith('.json'));
console.log(`📁 找到 ${files.length} 个文件需要过滤`);

let totalStats = {
  processedFiles: 0,
  originalChunks: 0,
  filteredChunks: 0,
  removedChunks: 0
};

console.log('🧹 开始内容过滤...');

for (const file of files) {
  const filePath = path.join(optimizedDir, file);
  const stats = filterFile(filePath);
  
  totalStats.processedFiles++;
  totalStats.originalChunks += stats.original;
  totalStats.filteredChunks += stats.filtered;
  totalStats.removedChunks += stats.removed;
  
  if (totalStats.processedFiles % 100 === 0) {
    console.log(`  已处理: ${totalStats.processedFiles}/${files.length}`);
  }
}

// 生成报告
console.log('\n📊 内容过滤报告');
console.log('='.repeat(50));
console.log(`📁 处理文件数: ${totalStats.processedFiles}`);
console.log(`📦 原始chunks: ${totalStats.originalChunks}`);
console.log(`✅ 保留chunks: ${totalStats.filteredChunks}`);
console.log(`🗑️  删除chunks: ${totalStats.removedChunks}`);
console.log(`📉 删除率: ${(totalStats.removedChunks / totalStats.originalChunks * 100).toFixed(1)}%`);
console.log(`📈 保留率: ${(totalStats.filteredChunks / totalStats.originalChunks * 100).toFixed(1)}%`);

// 质量评估
const qualityScore = totalStats.filteredChunks / totalStats.originalChunks;
if (qualityScore >= 0.8) {
  console.log('\n✅ 过滤质量: 优秀 (保留了大部分有价值内容)');
} else if (qualityScore >= 0.6) {
  console.log('\n👍 过滤质量: 良好 (成功过滤了噪音数据)');
} else if (qualityScore >= 0.4) {
  console.log('\n⚠️  过滤质量: 一般 (可能过度过滤)');
} else {
  console.log('\n❌ 过滤质量: 较差 (过度过滤，请检查规则)');
}

// 保存过滤报告
const reportPath = './output/content-filter-report.json';
const report = {
  timestamp: new Date().toISOString(),
  statistics: totalStats,
  filterPatterns: Object.keys(FILTER_PATTERNS),
  qualityScore: qualityScore
};

fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(`\n📄 详细报告已保存到: ${reportPath}`);
console.log('✅ 内容过滤完成！建议重新运行RAG验证检查效果');

// 显示一些过滤示例
console.log('\n📝 过滤示例 (已删除的内容类型):');
console.log('- 版权声明和法律条文');
console.log('- 微信公众号和平台信息');
console.log('- 广告和推广内容');
console.log('- 作者和编辑信息');
console.log('- 页码和技术元数据');
console.log('- 空白和无意义内容'); 