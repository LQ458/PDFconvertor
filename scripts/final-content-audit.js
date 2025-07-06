#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔍 最终内容审查 - 检查剩余无关数据...\n');

// 定义可能的无关内容模式
const SUSPICIOUS_PATTERNS = [
  // 微信相关
  /微信公众号/,
  /扫码关注/,
  /长按二维码/,
  /关注.*获取.*资料/,
  
  // 版权相关
  /版权所有.*版权所有/,
  /翻印必究/,
  /保留.*权利/,
  
  // 平台相关
  /搜狐/,
  /今日头条/,
  /百度文库/,
  /新浪/,
  
  // 社交媒体
  /点赞.*\d+/,
  /阅读.*\d+/,
  /转发.*分享/,
  /收藏.*关注/,
  
  // 广告推广
  /免费下载/,
  /限时优惠/,
  /更多精彩/,
  /敬请关注/,
  
  // 重复内容（同一短语出现3次以上）
  /(.{5,20})\1\1/
];

// 分析文件内容
function analyzeContent(content) {
  const issues = [];
  
  for (let i = 0; i < SUSPICIOUS_PATTERNS.length; i++) {
    const pattern = SUSPICIOUS_PATTERNS[i];
    const matches = content.match(pattern);
    if (matches) {
      issues.push({
        pattern: pattern.toString(),
        match: matches[0],
        type: getPatternType(i)
      });
    }
  }
  
  return issues;
}

function getPatternType(index) {
  if (index < 4) return '微信推广';
  if (index < 7) return '版权声明';
  if (index < 11) return '平台信息';
  if (index < 15) return '社交媒体';
  if (index < 19) return '广告推广';
  return '重复内容';
}

// 主处理流程
const optimizedDir = './output/optimized';
const files = fs.readdirSync(optimizedDir).filter(f => f.endsWith('.json'));

console.log(`📁 审查 ${files.length} 个文件...`);

let totalChunks = 0;
let suspiciousChunks = 0;
let issuesByType = {};
let suspiciousFiles = [];

for (const file of files) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(optimizedDir, file), 'utf8'));
    
    if (data.chunks && data.chunks.length > 0) {
      for (const chunk of data.chunks) {
        totalChunks++;
        const issues = analyzeContent(chunk.content);
        
        if (issues.length > 0) {
          suspiciousChunks++;
          
          // 统计问题类型
          for (const issue of issues) {
            if (!issuesByType[issue.type]) {
              issuesByType[issue.type] = 0;
            }
            issuesByType[issue.type]++;
          }
          
          // 记录有问题的文件
          if (!suspiciousFiles.find(f => f.file === file)) {
            suspiciousFiles.push({
              file: file,
              issues: issues,
              content: chunk.content.substring(0, 200) + '...'
            });
          }
        }
      }
    }
  } catch (error) {
    console.error(`❌ 处理文件失败: ${file}`);
  }
}

// 生成报告
console.log('\n📊 最终内容审查报告');
console.log('='.repeat(50));
console.log(`📦 总chunks数: ${totalChunks}`);
console.log(`⚠️  可疑chunks: ${suspiciousChunks}`);
console.log(`📈 数据清洁度: ${((totalChunks - suspiciousChunks) / totalChunks * 100).toFixed(1)}%`);

if (suspiciousChunks > 0) {
  console.log('\n🚨 发现的问题类型:');
  Object.entries(issuesByType).forEach(([type, count]) => {
    console.log(`   ${type}: ${count} 个`);
  });
  
  console.log(`\n📋 前10个有问题的文件:`);
  suspiciousFiles.slice(0, 10).forEach((item, index) => {
    console.log(`${index + 1}. ${path.basename(item.file)}`);
    console.log(`   问题: ${item.issues.map(i => i.type).join(', ')}`);
    console.log(`   内容: ${item.content}`);
    console.log('');
  });
} else {
  console.log('\n✅ 未发现可疑内容，数据清理完成！');
}

// 保存审查报告
const auditReport = {
  timestamp: new Date().toISOString(),
  summary: {
    totalChunks: totalChunks,
    suspiciousChunks: suspiciousChunks,
    cleanlinessRate: ((totalChunks - suspiciousChunks) / totalChunks * 100).toFixed(1)
  },
  issuesByType: issuesByType,
  suspiciousFiles: suspiciousFiles.slice(0, 20) // 只保存前20个
};

fs.writeFileSync('./output/final-content-audit-report.json', JSON.stringify(auditReport, null, 2));

console.log(`📄 详细审查报告已保存到: ./output/final-content-audit-report.json`);

// 最终评估
if (suspiciousChunks === 0) {
  console.log('\n🎉 恭喜！数据已完全清理，可用于生产环境！');
} else if (suspiciousChunks / totalChunks < 0.01) {
  console.log('\n👍 数据质量优秀，少量可疑内容可接受');
} else if (suspiciousChunks / totalChunks < 0.05) {
  console.log('\n⚠️  数据质量良好，建议进一步清理');
} else {
  console.log('\n❌ 仍有较多无关内容，需要继续优化');
} 