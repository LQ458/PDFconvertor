#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🧹 开始增强内容过滤，处理新发现的无关数据...\n');

// 定义增强的过滤规则
const ENHANCED_FILTER_PATTERNS = [
  // 原有的过滤规则
  /^本公众账号分享的资源版权属于原出版机构，本资源为电子载体，传播分享仅.*?限于家庭使用.*?不得以任何理由在商业行为.*?中使用.*?若喜欢此资源，建议购买实体产品.*?$/,
  /^返回搜狐，查看更多.*?声明：该文观点仅代表作者本人，搜狐号系信息发布平台，搜狐仅提供信息存储空间服务.*?$/,
  /^阅读\s*\(\d+\)$/,
  /^点赞\s*\(\d+\)$/,
  
  // 新增的过滤规则
  // 微信公众号推广 - 重复内容
  /^关注微信公众号.*?获取更多学习资料！.*?关注微信公众号.*?获取更多学习资料！/,
  
  // 版权声明 - 重复内容
  /^上海市教育委员会版权所有.*?上海市教育委员会版权所有/,
  /^.*?版权所有.*?版权所有.*?版权所有/,
  
  // 纯粹的空白内容
  /^[\s\n\r\u3000]*$/,
  /^[\.。，,；;：:\s]*$/,
  /^[－—\-\s]*$/
];

// 内容清理规则 - 处理部分清理
const ENHANCED_CLEANING_PATTERNS = [
  // 清理重复的微信公众号推广
  {
    pattern: /(关注微信公众号.*?获取更多学习资料！\s*){2,}/g,
    replacement: ''
  },
  
  // 清理重复的版权声明
  {
    pattern: /(上海市教育委员会版权所有\s*){2,}/g,
    replacement: ''
  },
  
  {
    pattern: /(.*?版权所有\s*){3,}/g,
    replacement: ''
  },
  
  // 原有的清理规则
  {
    pattern: /本公众账号分享的资源版权属于原出版机构，本资源为电子载体，传播分享仅.*?限于家庭使用.*?不得以任何理由在商业行为.*?中使用.*?若喜欢此资源，建议购买实体产品。?/g,
    replacement: ''
  },
  
  {
    pattern: /返回搜狐，查看更多.*?声明：该文观点仅代表作者本人，搜狐号系信息发布平台，搜狐仅提供信息存储空间服务。?/g,
    replacement: ''
  },
  
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
  
  // 检查长度
  if (trimmedContent.length < 10) {
    return true;
  }
  
  // 检查重复内容比例
  const contentLength = trimmedContent.length;
  
  // 检查是否主要由重复短语组成
  const phrases = [
    '关注微信公众号',
    '获取更多学习资料',
    '版权所有'
  ];
  
  for (const phrase of phrases) {
    const matches = (trimmedContent.match(new RegExp(phrase, 'g')) || []).length;
    if (matches > 3 && (matches * phrase.length) / contentLength > 0.5) {
      return true; // 如果重复短语占内容的50%以上，则过滤
    }
  }
  
  // 检查是否匹配精确过滤模式
  for (const pattern of ENHANCED_FILTER_PATTERNS) {
    if (pattern.test(trimmedContent)) {
      return true;
    }
  }
  
  return false;
}

// 增强内容清理
function cleanContent(content) {
  if (!content) return '';
  
  let cleaned = content;
  
  // 应用增强清理规则
  for (const rule of ENHANCED_CLEANING_PATTERNS) {
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
    '教学', '学生', '老师', '教师', '课堂', '教育', '目录',
    '第一课', '第二课', '汉语拼音', '识字', '课文'
  ];
  
  return educationalKeywords.some(keyword => content.includes(keyword));
}

// 检查内容质量
function assessContentQuality(content) {
  if (!content) return 0;
  
  const trimmedContent = content.trim();
  
  // 基础长度检查
  if (trimmedContent.length < 20) return 0;
  
  // 检查是否包含教育内容
  if (hasEducationalContent(trimmedContent)) return 3;
  
  // 检查字符多样性
  const uniqueChars = new Set(trimmedContent.replace(/\s/g, ''));
  if (uniqueChars.size < 5) return 0;
  
  // 检查重复内容比例
  const words = trimmedContent.split(/\s+/);
  const uniqueWords = new Set(words);
  const repetitionRatio = 1 - (uniqueWords.size / words.length);
  
  if (repetitionRatio > 0.8) return 0; // 重复率太高
  if (repetitionRatio > 0.6) return 1; // 重复率较高
  
  return 2; // 一般质量
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
      
      // 评估内容质量
      const qualityScore = assessContentQuality(cleanedContent);
      
      if (qualityScore === 0) {
        removedCount++;
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
          qualityScore: qualityScore,
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
      enhancedFiltering: {
        timestamp: new Date().toISOString(),
        originalChunks: originalCount,
        filteredChunks: filteredChunks.length,
        removedChunks: removedCount,
        cleanedChunks: cleanedCount,
        removalRate: (removedCount / originalCount * 100).toFixed(1),
        cleaningRate: (cleanedCount / originalCount * 100).toFixed(1),
        version: 'enhanced'
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
console.log(`📁 找到 ${files.length} 个文件需要增强过滤`);

let totalStats = {
  processedFiles: 0,
  originalChunks: 0,
  filteredChunks: 0,
  removedChunks: 0,
  cleanedChunks: 0
};

console.log('🧹 开始增强内容过滤...');

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
console.log('\n📊 增强内容过滤报告');
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
const reportPath = './output/enhanced-content-filter-report.json';
const report = {
  timestamp: new Date().toISOString(),
  statistics: totalStats,
  qualityScore: qualityScore,
  filteringStrategy: 'enhanced',
  newPatternsHandled: [
    '重复微信公众号推广',
    '重复版权声明',
    '内容质量评估',
    '重复内容检测'
  ]
};

fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(`\n📄 详细报告已保存到: ${reportPath}`);
console.log('✅ 增强内容过滤完成！');

// 显示新增的过滤策略
console.log('\n🎯 新增过滤策略:');
console.log('🧹 处理重复的微信公众号推广内容');
console.log('🧹 处理重复的版权声明');
console.log('📊 基于内容质量评估的智能过滤');
console.log('🔍 重复内容比例检测');
console.log('✅ 保留所有有价值的教育内容'); 