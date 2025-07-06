#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🧹 开始智能内容过滤，清理无关数据...\n');

// 定义精确的过滤规则 - 只删除明确的无关内容
const EXACT_FILTER_PATTERNS = [
  // 完整的版权声明段落
  /^本公众账号分享的资源版权属于原出版机构，本资源为电子载体，传播分享仅.*?限于家庭使用.*?不得以任何理由在商业行为.*?中使用.*?若喜欢此资源，建议购买实体产品.*?$/,
  
  // 搜狐平台声明
  /^返回搜狐，查看更多.*?声明：该文观点仅代表作者本人，搜狐号系信息发布平台，搜狐仅提供信息存储空间服务.*?$/,
  
  // 单独的阅读数和点赞数
  /^阅读\s*\(\d+\)$/,
  /^点赞\s*\(\d+\)$/,
  
  // 纯粹的空白内容
  /^[\s\n\r\u3000]*$/,
  
  // 只有标点符号
  /^[\.。，,；;：:\s]*$/,
  
  // 只有横线
  /^[－—\-\s]*$/
];

// 内容清理规则 - 从内容中移除特定片段但保留其他内容
const CONTENT_CLEANING_PATTERNS = [
  // 移除版权声明但保留其他内容
  {
    pattern: /本公众账号分享的资源版权属于原出版机构，本资源为电子载体，传播分享仅.*?限于家庭使用.*?不得以任何理由在商业行为.*?中使用.*?若喜欢此资源，建议购买实体产品。?/g,
    replacement: ''
  },
  
  // 移除搜狐声明但保留其他内容
  {
    pattern: /返回搜狐，查看更多.*?声明：该文观点仅代表作者本人，搜狐号系信息发布平台，搜狐仅提供信息存储空间服务。?/g,
    replacement: ''
  },
  
  // 移除阅读点赞数
  {
    pattern: /阅读\s*\(\d+\)/g,
    replacement: ''
  },
  
  {
    pattern: /点赞\s*\(\d+\)/g,
    replacement: ''
  }
];

// 检查内容是否应该被完全过滤
function shouldFilterContent(content) {
  if (!content || typeof content !== 'string') {
    return true;
  }
  
  const trimmedContent = content.trim();
  
  // 检查长度 - 降低最小长度要求
  if (trimmedContent.length < 5) {
    return true;
  }
  
  // 检查是否匹配精确过滤模式
  for (const pattern of EXACT_FILTER_PATTERNS) {
    if (pattern.test(trimmedContent)) {
      return true;
    }
  }
  
  return false;
}

// 智能内容清理 - 只清理无关片段，保留有价值内容
function cleanContent(content) {
  if (!content) return '';
  
  let cleaned = content;
  
  // 应用内容清理规则
  for (const rule of CONTENT_CLEANING_PATTERNS) {
    cleaned = cleaned.replace(rule.pattern, rule.replacement);
  }
  
  // 清理多余空白
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  return cleaned;
}

// 检查内容是否包含教育相关关键词
function hasEducationalContent(content) {
  const educationalKeywords = [
    '课本', '教材', '学习', '练习', '作业', '考试', '题目', '答案',
    '数学', '语文', '英语', '物理', '化学', '生物', '历史', '地理',
    '政治', '科学', '音乐', '美术', '体育', '道德', '法治',
    '年级', '单元', '章节', '课时', '知识', '技能', '能力',
    '教学', '学生', '老师', '教师', '课堂', '教育'
  ];
  
  const lowerContent = content.toLowerCase();
  return educationalKeywords.some(keyword => content.includes(keyword));
}

// 处理文件
function filterFile(filePath) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    if (!data.chunks || data.chunks.length === 0) {
      return { original: 0, filtered: 0, removed: 0, cleaned: 0 };
    }
    
    const originalCount = data.chunks.length;
    const filteredChunks = [];
    let removedCount = 0;
    let cleanedCount = 0;
    
    for (const chunk of data.chunks) {
      // 检查是否应该完全过滤
      if (shouldFilterContent(chunk.content)) {
        removedCount++;
        continue;
      }
      
      // 清理内容
      const cleanedContent = cleanContent(chunk.content);
      
      // 如果清理后内容太短，检查是否包含教育内容
      if (cleanedContent.length < 20) {
        if (hasEducationalContent(chunk.content)) {
          // 保留原始内容，因为可能包含重要的教育信息
          filteredChunks.push({
            ...chunk,
            metadata: {
              ...chunk.metadata,
              contentPreserved: true,
              reason: 'Educational content detected'
            }
          });
        } else {
          removedCount++;
        }
        continue;
      }
      
      // 检查内容是否被清理过
      const wasContentCleaned = cleanedContent !== chunk.content;
      if (wasContentCleaned) {
        cleanedCount++;
      }
      
      filteredChunks.push({
        ...chunk,
        content: cleanedContent,
        metadata: {
          ...chunk.metadata,
          contentCleaned: wasContentCleaned,
          originalLength: chunk.content.length,
          cleanedLength: cleanedContent.length
        }
      });
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
      smartFiltering: {
        timestamp: new Date().toISOString(),
        originalChunks: originalCount,
        filteredChunks: filteredChunks.length,
        removedChunks: removedCount,
        cleanedChunks: cleanedCount,
        removalRate: (removedCount / originalCount * 100).toFixed(1),
        cleaningRate: (cleanedCount / originalCount * 100).toFixed(1)
      }
    };
    
    fs.writeFileSync(filePath, JSON.stringify(filteredData, null, 2));
    
    return {
      original: originalCount,
      filtered: filteredChunks.length,
      removed: removedCount,
      cleaned: cleanedCount
    };
    
  } catch (error) {
    console.error(`❌ 处理文件失败: ${path.basename(filePath)}`, error.message);
    return { original: 0, filtered: 0, removed: 0, cleaned: 0 };
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
  removedChunks: 0,
  cleanedChunks: 0
};

console.log('🧹 开始智能内容过滤...');

for (const file of files) {
  const filePath = path.join(optimizedDir, file);
  const stats = filterFile(filePath);
  
  totalStats.processedFiles++;
  totalStats.originalChunks += stats.original;
  totalStats.filteredChunks += stats.filtered;
  totalStats.removedChunks += stats.removed;
  totalStats.cleanedChunks += stats.cleaned;
  
  if (totalStats.processedFiles % 100 === 0) {
    console.log(`  已处理: ${totalStats.processedFiles}/${files.length}`);
  }
}

// 生成报告
console.log('\n📊 智能内容过滤报告');
console.log('='.repeat(50));
console.log(`📁 处理文件数: ${totalStats.processedFiles}`);
console.log(`📦 原始chunks: ${totalStats.originalChunks}`);
console.log(`✅ 保留chunks: ${totalStats.filteredChunks}`);
console.log(`🧹 清理chunks: ${totalStats.cleanedChunks}`);
console.log(`🗑️  删除chunks: ${totalStats.removedChunks}`);
console.log(`📉 删除率: ${(totalStats.removedChunks / totalStats.originalChunks * 100).toFixed(1)}%`);
console.log(`🧽 清理率: ${(totalStats.cleanedChunks / totalStats.originalChunks * 100).toFixed(1)}%`);
console.log(`📈 保留率: ${(totalStats.filteredChunks / totalStats.originalChunks * 100).toFixed(1)}%`);

// 质量评估
const qualityScore = totalStats.filteredChunks / totalStats.originalChunks;
if (qualityScore >= 0.95) {
  console.log('\n✅ 过滤质量: 优秀 (保留了几乎所有有价值内容)');
} else if (qualityScore >= 0.85) {
  console.log('\n👍 过滤质量: 良好 (成功过滤噪音，保留教育内容)');
} else if (qualityScore >= 0.70) {
  console.log('\n⚠️  过滤质量: 一般 (可能需要调整规则)');
} else {
  console.log('\n❌ 过滤质量: 较差 (过度过滤，请检查规则)');
}

// 保存过滤报告
const reportPath = './output/smart-content-filter-report.json';
const report = {
  timestamp: new Date().toISOString(),
  statistics: totalStats,
  qualityScore: qualityScore,
  filteringStrategy: 'smart',
  preservedEducationalContent: true
};

fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(`\n📄 详细报告已保存到: ${reportPath}`);
console.log('✅ 智能内容过滤完成！');

// 显示过滤策略
console.log('\n🎯 过滤策略:');
console.log('✅ 保留所有教育相关内容');
console.log('🧹 清理版权声明和平台信息');
console.log('🗑️  删除纯粹的噪音数据');
console.log('📚 优先保护课本和教材内容'); 