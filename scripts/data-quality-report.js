#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('📊 生成数据质量报告...\n');

const processedDir = './output/processed';
const files = fs.readdirSync(processedDir).filter(f => f.endsWith('.json'));

let totalFiles = 0;
let filesWithContent = 0;
let filesWithEmbeddings = 0;
let totalChunks = 0;
let totalTextLength = 0;
let embeddingDimensions = new Set();
let models = new Set();
let errors = [];

const chunkDistribution = {};
const filesByChunks = {
  '0': [],
  '1-5': [],
  '6-20': [],
  '21-50': [],
  '50+': []
};

console.log('🔍 正在分析文件...');

for (const file of files) {
  totalFiles++;
  const filePath = path.join(processedDir, file);
  
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // 基本统计
    const chunks = data.chunks || [];
    const chunkCount = chunks.length;
    totalChunks += chunkCount;
    
    if (chunkCount > 0) {
      filesWithContent++;
      
      // 检查embedding
      if (chunks[0]?.embedding) {
        filesWithEmbeddings++;
        embeddingDimensions.add(chunks[0].embedding.length);
      }
      
      // 计算文本长度
      const textLength = chunks.reduce((sum, chunk) => sum + (chunk.content?.length || 0), 0);
      totalTextLength += textLength;
    }
    
    // 模型统计
    if (data.processingStats?.embeddingModel) {
      models.add(data.processingStats.embeddingModel);
    }
    
    // 分类文件
    if (chunkCount === 0) {
      filesByChunks['0'].push(data.filename || file);
    } else if (chunkCount <= 5) {
      filesByChunks['1-5'].push(data.filename || file);
    } else if (chunkCount <= 20) {
      filesByChunks['6-20'].push(data.filename || file);
    } else if (chunkCount <= 50) {
      filesByChunks['21-50'].push(data.filename || file);
    } else {
      filesByChunks['50+'].push(data.filename || file);
    }
    
    // chunks分布
    chunkDistribution[chunkCount] = (chunkDistribution[chunkCount] || 0) + 1;
    
  } catch (error) {
    errors.push(`${file}: ${error.message}`);
  }
}

// 生成报告
console.log('📋 数据质量报告');
console.log('='.repeat(50));
console.log(`📁 总文件数: ${totalFiles}`);
console.log(`📄 有内容文件: ${filesWithContent} (${(filesWithContent/totalFiles*100).toFixed(1)}%)`);
console.log(`🔢 有embedding文件: ${filesWithEmbeddings} (${(filesWithEmbeddings/totalFiles*100).toFixed(1)}%)`);
console.log(`📦 总chunks数: ${totalChunks}`);
console.log(`📝 总文本长度: ${totalTextLength.toLocaleString()} 字符`);
console.log(`📊 平均每文件chunks: ${(totalChunks/totalFiles).toFixed(1)}`);
console.log(`📏 平均每chunk文本长度: ${totalChunks > 0 ? (totalTextLength/totalChunks).toFixed(0) : 0} 字符`);

console.log('\n🎯 Embedding信息');
console.log('='.repeat(30));
console.log(`🤖 使用的模型: ${Array.from(models).join(', ')}`);
console.log(`📐 向量维度: ${Array.from(embeddingDimensions).join(', ')}`);

console.log('\n📈 文件分布');
console.log('='.repeat(30));
Object.entries(filesByChunks).forEach(([range, files]) => {
  console.log(`${range.padEnd(8)} chunks: ${files.length.toString().padStart(4)} 文件`);
});

console.log('\n🚨 问题文件');
console.log('='.repeat(30));
console.log(`❌ 无内容文件: ${totalFiles - filesWithContent}`);
console.log(`❌ 无embedding文件: ${totalFiles - filesWithEmbeddings}`);
console.log(`❌ 处理错误: ${errors.length}`);

if (errors.length > 0) {
  console.log('\n错误详情:');
  errors.forEach(error => console.log(`  - ${error}`));
}

// RAG-Ready评估
console.log('\n🎯 RAG-Ready评估');
console.log('='.repeat(30));
const ragReady = filesWithEmbeddings;
const ragReadyPercent = (ragReady/totalFiles*100).toFixed(1);
console.log(`✅ RAG-Ready文件: ${ragReady}/${totalFiles} (${ragReadyPercent}%)`);

if (ragReadyPercent >= 95) {
  console.log('🎉 数据质量优秀！');
} else if (ragReadyPercent >= 80) {
  console.log('👍 数据质量良好');
} else {
  console.log('⚠️  数据质量需要改进');
}

// 保存详细报告
const report = {
  timestamp: new Date().toISOString(),
  summary: {
    totalFiles,
    filesWithContent,
    filesWithEmbeddings,
    totalChunks,
    totalTextLength,
    ragReadyPercent: parseFloat(ragReadyPercent)
  },
  distribution: filesByChunks,
  models: Array.from(models),
  embeddingDimensions: Array.from(embeddingDimensions),
  errors
};

fs.writeFileSync('./output/data-quality-report.json', JSON.stringify(report, null, 2));
console.log('\n📄 详细报告已保存到: ./output/data-quality-report.json'); 