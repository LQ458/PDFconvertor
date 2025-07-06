#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('📊 生成最终数据质量报告...\n');

// 读取各个处理阶段的报告
const reports = {};

// 读取重新处理报告
try {
  const reprocessFiles = fs.readdirSync('./output').filter(f => f.startsWith('batch_report_'));
  if (reprocessFiles.length > 0) {
    const latestReprocessFile = reprocessFiles.sort().pop();
    reports.reprocess = JSON.parse(fs.readFileSync(`./output/${latestReprocessFile}`, 'utf8'));
  }
} catch (error) {
  console.log('⚠️  重新处理报告未找到');
}

// 读取RAG优化报告
try {
  reports.ragOptimization = JSON.parse(fs.readFileSync('./output/rag-optimization-report.json', 'utf8'));
} catch (error) {
  console.log('⚠️  RAG优化报告未找到');
}

// 读取内容过滤报告
try {
  reports.contentFilter = JSON.parse(fs.readFileSync('./output/smart-content-filter-report.json', 'utf8'));
} catch (error) {
  console.log('⚠️  内容过滤报告未找到');
}

// 读取最新的RAG验证报告
try {
  reports.ragValidation = JSON.parse(fs.readFileSync('./output/rag-validation-report.json', 'utf8'));
} catch (error) {
  console.log('⚠️  RAG验证报告未找到');
}

// 分析优化数据目录
const optimizedDir = './output/optimized';
let currentStats = {
  totalFiles: 0,
  filesWithChunks: 0,
  totalChunks: 0,
  totalCharacters: 0,
  avgChunksPerFile: 0,
  avgChunkLength: 0
};

if (fs.existsSync(optimizedDir)) {
  const files = fs.readdirSync(optimizedDir).filter(f => f.endsWith('.json'));
  currentStats.totalFiles = files.length;
  
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(optimizedDir, file), 'utf8'));
      if (data.chunks && data.chunks.length > 0) {
        currentStats.filesWithChunks++;
        currentStats.totalChunks += data.chunks.length;
        
        for (const chunk of data.chunks) {
          currentStats.totalCharacters += chunk.content.length;
        }
      }
    } catch (error) {
      // 忽略损坏的文件
    }
  }
  
  currentStats.avgChunksPerFile = currentStats.totalChunks / currentStats.filesWithChunks;
  currentStats.avgChunkLength = currentStats.totalCharacters / currentStats.totalChunks;
}

// 生成综合报告
const finalReport = {
  timestamp: new Date().toISOString(),
  summary: {
    title: 'PDF预处理系统 - 最终数据质量报告',
    processingPipeline: [
      '1. PDF文本提取和embedding生成',
      '2. 数据质量审查和重新处理',
      '3. RAG优化（chunk合并）',
      '4. 智能内容过滤（清理无关数据）',
      '5. 最终质量验证'
    ]
  },
  
  currentDataStatus: {
    totalFiles: currentStats.totalFiles,
    filesWithContent: currentStats.filesWithChunks,
    contentRate: (currentStats.filesWithChunks / currentStats.totalFiles * 100).toFixed(1),
    totalChunks: currentStats.totalChunks,
    totalCharacters: currentStats.totalCharacters,
    avgChunksPerFile: currentStats.avgChunksPerFile.toFixed(1),
    avgChunkLength: currentStats.avgChunkLength.toFixed(0)
  },
  
  processingHistory: {
    reprocessing: reports.reprocess ? {
      timestamp: reports.reprocess.timestamp,
      totalFiles: reports.reprocess.summary?.totalFiles || 'N/A',
      successRate: reports.reprocess.summary?.successRate || 'N/A',
      processingTime: reports.reprocess.summary?.totalTime || 'N/A'
    } : null,
    
    ragOptimization: reports.ragOptimization ? {
      timestamp: reports.ragOptimization.timestamp,
      originalChunks: reports.ragOptimization.statistics?.originalChunks || 'N/A',
      optimizedChunks: reports.ragOptimization.statistics?.optimizedChunks || 'N/A',
      improvementRate: reports.ragOptimization.statistics?.improvementRate || 'N/A'
    } : null,
    
    contentFiltering: reports.contentFilter ? {
      timestamp: reports.contentFilter.timestamp,
      originalChunks: reports.contentFilter.statistics?.originalChunks || 'N/A',
      filteredChunks: reports.contentFilter.statistics?.filteredChunks || 'N/A',
      removalRate: reports.contentFilter.statistics?.removedChunks / reports.contentFilter.statistics?.originalChunks * 100 || 'N/A'
    } : null
  },
  
  qualityMetrics: {
    ragReadiness: reports.ragValidation ? {
      totalFiles: reports.ragValidation.summary?.totalFiles || 'N/A',
      ragReadyFiles: reports.ragValidation.summary?.ragReadyFiles || 'N/A',
      ragReadyRate: reports.ragValidation.summary?.ragReadyRate || 'N/A',
      chunkValidityRate: reports.ragValidation.chunkStats?.validityRate || 'N/A'
    } : null,
    
    dataIntegrity: {
      embeddingModel: 'sentence-transformers/all-MiniLM-L6-v2',
      embeddingDimension: 384,
      chunkSizeRange: '50-8000 characters',
      encoding: 'UTF-8'
    }
  },
  
  recommendations: []
};

// 生成建议
const ragReadyRate = parseFloat(reports.ragValidation?.summary?.ragReadyRate || 0);
const contentRate = parseFloat(finalReport.currentDataStatus.contentRate);

if (ragReadyRate >= 90) {
  finalReport.recommendations.push('✅ 数据质量优秀，可直接用于生产环境RAG系统');
} else if (ragReadyRate >= 70) {
  finalReport.recommendations.push('👍 数据质量良好，建议进行小幅优化后使用');
} else if (ragReadyRate >= 50) {
  finalReport.recommendations.push('⚠️  数据质量一般，建议进一步优化');
} else {
  finalReport.recommendations.push('❌ 数据质量较差，需要大幅改进');
}

if (contentRate < 60) {
  finalReport.recommendations.push('🔄 建议重新处理无内容的PDF文件，可能需要OCR处理');
}

if (currentStats.avgChunkLength < 100) {
  finalReport.recommendations.push('📏 平均chunk长度较短，建议调整分块策略');
}

finalReport.recommendations.push('📊 建议定期运行数据质量检查');
finalReport.recommendations.push('🔍 建议创建RAG演示验证实际效果');

// 保存报告
const reportPath = './output/final-data-quality-report.json';
fs.writeFileSync(reportPath, JSON.stringify(finalReport, null, 2));

// 显示报告
console.log('📊 最终数据质量报告');
console.log('='.repeat(60));
console.log(`📅 报告时间: ${new Date().toLocaleString('zh-CN')}`);
console.log(`📁 总文件数: ${finalReport.currentDataStatus.totalFiles}`);
console.log(`✅ 有内容文件: ${finalReport.currentDataStatus.filesWithContent} (${finalReport.currentDataStatus.contentRate}%)`);
console.log(`📦 总chunks: ${finalReport.currentDataStatus.totalChunks}`);
console.log(`📝 总字符数: ${finalReport.currentDataStatus.totalCharacters.toLocaleString()}`);
console.log(`📊 平均chunks/文件: ${finalReport.currentDataStatus.avgChunksPerFile}`);
console.log(`📏 平均chunk长度: ${finalReport.currentDataStatus.avgChunkLength} 字符`);

console.log('\n🎯 RAG就绪状态');
console.log('='.repeat(30));
if (reports.ragValidation) {
  console.log(`📋 RAG-Ready文件: ${reports.ragValidation.summary?.ragReadyFiles}/${reports.ragValidation.summary?.totalFiles} (${reports.ragValidation.summary?.ragReadyRate}%)`);
  console.log(`✅ Chunk有效率: ${reports.ragValidation.chunkStats?.validityRate}%`);
} else {
  console.log('⚠️  RAG验证数据不可用');
}

console.log('\n🔧 处理历史');
console.log('='.repeat(30));
if (reports.reprocess) {
  console.log(`📄 重新处理: ${reports.reprocess.summary?.totalFiles} 文件`);
}
if (reports.ragOptimization) {
  console.log(`🔄 RAG优化: ${reports.ragOptimization.statistics?.originalChunks} → ${reports.ragOptimization.statistics?.optimizedChunks} chunks`);
}
if (reports.contentFilter) {
  console.log(`🧹 内容过滤: 删除了 ${(reports.contentFilter.statistics?.removedChunks / reports.contentFilter.statistics?.originalChunks * 100).toFixed(1)}% 无关内容`);
}

console.log('\n💡 建议');
console.log('='.repeat(30));
finalReport.recommendations.forEach(rec => console.log(rec));

console.log(`\n📄 详细报告已保存到: ${reportPath}`);

// 生成处理管道图
console.log('\n🔄 处理管道总结');
console.log('='.repeat(50));
console.log('原始PDF文件');
console.log('    ↓ (PDF文本提取 + Embedding生成)');
console.log(`${reports.reprocess?.summary?.totalFiles || 'N/A'} 个处理文件`);
console.log('    ↓ (数据质量审查 + 重新处理)');
console.log(`${reports.ragOptimization?.statistics?.originalChunks || 'N/A'} 个原始chunks`);
console.log('    ↓ (RAG优化 - chunk合并)');
console.log(`${reports.ragOptimization?.statistics?.optimizedChunks || 'N/A'} 个优化chunks`);
console.log('    ↓ (智能内容过滤)');
console.log(`${finalReport.currentDataStatus.totalChunks} 个最终chunks`);
console.log('    ↓ (质量验证)');
console.log(`${reports.ragValidation?.summary?.ragReadyFiles || 'N/A'} 个RAG-Ready文件`);

console.log('\n✅ 最终数据质量报告生成完成！'); 