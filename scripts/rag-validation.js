#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔍 RAG数据验证开始...\n');

// RAG系统要求的标准
const RAG_REQUIREMENTS = {
  minChunkLength: 50,      // 最小chunk长度
  maxChunkLength: 8000,    // 最大chunk长度
  embeddingDimension: 384, // embedding维度
  requiredFields: ['content', 'embedding', 'metadata'],
  requiredMetadata: ['chunkIndex', 'source']
};

const processedDir = process.argv[2] || './output/processed';
const files = fs.readdirSync(processedDir).filter(f => f.endsWith('.json'));

let validationResults = {
  totalFiles: 0,
  validFiles: 0,
  invalidFiles: 0,
  ragReadyFiles: 0,
  issues: [],
  statistics: {
    totalChunks: 0,
    validChunks: 0,
    avgChunkLength: 0,
    embeddingConsistency: true,
    metadataCompliance: 0
  }
};

console.log('📋 验证标准:');
console.log(`  - Chunk长度: ${RAG_REQUIREMENTS.minChunkLength}-${RAG_REQUIREMENTS.maxChunkLength} 字符`);
console.log(`  - Embedding维度: ${RAG_REQUIREMENTS.embeddingDimension}`);
console.log(`  - 必需字段: ${RAG_REQUIREMENTS.requiredFields.join(', ')}`);
console.log(`  - 必需元数据: ${RAG_REQUIREMENTS.requiredMetadata.join(', ')}`);
console.log('\n🔍 开始验证...');

function validateChunk(chunk, chunkIndex, filename) {
  const issues = [];
  
  // 检查必需字段
  for (const field of RAG_REQUIREMENTS.requiredFields) {
    if (!chunk.hasOwnProperty(field)) {
      issues.push(`缺少字段: ${field}`);
    }
  }
  
  // 检查内容长度
  if (chunk.content) {
    const contentLength = chunk.content.length;
    if (contentLength < RAG_REQUIREMENTS.minChunkLength) {
      issues.push(`内容太短: ${contentLength} < ${RAG_REQUIREMENTS.minChunkLength}`);
    }
    if (contentLength > RAG_REQUIREMENTS.maxChunkLength) {
      issues.push(`内容太长: ${contentLength} > ${RAG_REQUIREMENTS.maxChunkLength}`);
    }
  } else {
    issues.push('内容为空');
  }
  
  // 检查embedding
  if (chunk.embedding) {
    if (!Array.isArray(chunk.embedding)) {
      issues.push('Embedding不是数组');
    } else if (chunk.embedding.length !== RAG_REQUIREMENTS.embeddingDimension) {
      issues.push(`Embedding维度错误: ${chunk.embedding.length} != ${RAG_REQUIREMENTS.embeddingDimension}`);
    }
  } else {
    issues.push('缺少embedding');
  }
  
  // 检查元数据
  if (chunk.metadata) {
    for (const field of RAG_REQUIREMENTS.requiredMetadata) {
      if (!chunk.metadata.hasOwnProperty(field)) {
        issues.push(`元数据缺少字段: ${field}`);
      }
    }
  } else {
    issues.push('缺少元数据');
  }
  
  return {
    valid: issues.length === 0,
    issues: issues
  };
}

function validateFile(filePath) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const filename = data.filename || path.basename(filePath);
    
    const fileValidation = {
      filename: filename,
      valid: true,
      ragReady: true,
      issues: [],
      chunks: data.chunks || [],
      chunkValidations: []
    };
    
    // 检查基本结构
    if (!data.chunks || !Array.isArray(data.chunks)) {
      fileValidation.valid = false;
      fileValidation.ragReady = false;
      fileValidation.issues.push('缺少chunks数组');
      return fileValidation;
    }
    
    if (data.chunks.length === 0) {
      fileValidation.valid = false;
      fileValidation.ragReady = false;
      fileValidation.issues.push('没有chunks');
      return fileValidation;
    }
    
    // 验证每个chunk
    let validChunks = 0;
    for (let i = 0; i < data.chunks.length; i++) {
      const chunkValidation = validateChunk(data.chunks[i], i, filename);
      fileValidation.chunkValidations.push(chunkValidation);
      
      if (chunkValidation.valid) {
        validChunks++;
      } else {
        fileValidation.valid = false;
        fileValidation.ragReady = false;
        fileValidation.issues.push(`Chunk ${i}: ${chunkValidation.issues.join(', ')}`);
      }
    }
    
    // 统计
    validationResults.statistics.totalChunks += data.chunks.length;
    validationResults.statistics.validChunks += validChunks;
    
    return fileValidation;
    
  } catch (error) {
    return {
      filename: path.basename(filePath),
      valid: false,
      ragReady: false,
      issues: [`解析错误: ${error.message}`],
      chunks: [],
      chunkValidations: []
    };
  }
}

// 验证所有文件
console.log(`正在验证 ${files.length} 个文件...`);

for (const file of files) {
  validationResults.totalFiles++;
  const filePath = path.join(processedDir, file);
  const fileValidation = validateFile(filePath);
  
  if (fileValidation.valid) {
    validationResults.validFiles++;
  } else {
    validationResults.invalidFiles++;
    validationResults.issues.push(fileValidation);
  }
  
  if (fileValidation.ragReady) {
    validationResults.ragReadyFiles++;
  }
  
  // 进度显示
  if (validationResults.totalFiles % 100 === 0) {
    console.log(`  已验证: ${validationResults.totalFiles}/${files.length}`);
  }
}

// 计算统计
if (validationResults.statistics.totalChunks > 0) {
  validationResults.statistics.avgChunkLength = 
    validationResults.statistics.validChunks / validationResults.statistics.totalChunks * 100;
}

// 生成报告
console.log('\n📊 RAG验证报告');
console.log('='.repeat(50));
console.log(`📁 总文件数: ${validationResults.totalFiles}`);
console.log(`✅ 有效文件: ${validationResults.validFiles} (${(validationResults.validFiles/validationResults.totalFiles*100).toFixed(1)}%)`);
console.log(`❌ 无效文件: ${validationResults.invalidFiles} (${(validationResults.invalidFiles/validationResults.totalFiles*100).toFixed(1)}%)`);
console.log(`🎯 RAG-Ready文件: ${validationResults.ragReadyFiles} (${(validationResults.ragReadyFiles/validationResults.totalFiles*100).toFixed(1)}%)`);

console.log('\n📦 Chunk统计');
console.log('='.repeat(30));
console.log(`总chunks: ${validationResults.statistics.totalChunks}`);
console.log(`有效chunks: ${validationResults.statistics.validChunks}`);
console.log(`有效率: ${(validationResults.statistics.validChunks/validationResults.statistics.totalChunks*100).toFixed(1)}%`);

console.log('\n🚨 问题文件 (前20个)');
console.log('='.repeat(30));
validationResults.issues.slice(0, 20).forEach(issue => {
  console.log(`❌ ${issue.filename}:`);
  issue.issues.slice(0, 3).forEach(i => console.log(`   - ${i}`));
  if (issue.issues.length > 3) {
    console.log(`   - ... 还有 ${issue.issues.length - 3} 个问题`);
  }
});

// 最终评估
console.log('\n🎯 RAG-Ready评估');
console.log('='.repeat(30));
const ragReadyPercent = (validationResults.ragReadyFiles/validationResults.totalFiles*100).toFixed(1);

if (ragReadyPercent >= 95) {
  console.log('🎉 数据质量优秀！完全符合RAG系统要求');
} else if (ragReadyPercent >= 80) {
  console.log('👍 数据质量良好，大部分符合RAG系统要求');
} else if (ragReadyPercent >= 60) {
  console.log('⚠️  数据质量一般，需要改进以更好支持RAG系统');
} else {
  console.log('❌ 数据质量较差，需要大幅改进才能用于RAG系统');
}

// 保存详细报告
const reportPath = './output/rag-validation-report.json';
fs.writeFileSync(reportPath, JSON.stringify(validationResults, null, 2));
console.log(`\n📄 详细验证报告已保存到: ${reportPath}`);

// 如果有问题，提供修复建议
if (validationResults.invalidFiles > 0) {
  console.log('\n🔧 修复建议:');
  console.log('1. 重新处理无内容的PDF文件');
  console.log('2. 检查PDF文件是否损坏或为图片格式');
  console.log('3. 调整文本提取参数');
  console.log('4. 验证embedding模型是否正常工作');
}

process.exit(validationResults.ragReadyFiles === validationResults.totalFiles ? 0 : 1); 