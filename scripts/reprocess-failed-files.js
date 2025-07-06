#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔍 正在扫描需要重新处理的文件...');

// 扫描所有处理过的文件
const processedDir = './output/processed';
const files = fs.readdirSync(processedDir);
const failedFiles = [];

for (const file of files) {
  if (!file.endsWith('.json')) continue;
  
  const filePath = path.join(processedDir, file);
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // 检查是否需要重新处理
    const needsReprocessing = 
      data.processingStats?.embeddingModel === 'BAAI/bge-large-zh-v1.5' ||
      !data.chunks || 
      data.chunks.length === 0 ||
      !data.chunks[0]?.embedding;
    
    if (needsReprocessing) {
      failedFiles.push({
        processedFile: filePath,
        originalFile: data.filename
      });
    }
  } catch (error) {
    console.error(`❌ 读取文件失败: ${file}`, error.message);
    failedFiles.push({
      processedFile: filePath,
      originalFile: file.replace(/^\d+_/, '').replace('.json', '')
    });
  }
}

console.log(`📊 发现 ${failedFiles.length} 个文件需要重新处理`);

if (failedFiles.length === 0) {
  console.log('✅ 所有文件都已正确处理');
  process.exit(0);
}

// 删除失败的处理文件
console.log('🗑️  正在删除失败的处理文件...');
for (const file of failedFiles) {
  try {
    fs.unlinkSync(file.processedFile);
    console.log(`✅ 删除: ${path.basename(file.processedFile)}`);
  } catch (error) {
    console.error(`❌ 删除失败: ${file.processedFile}`, error.message);
  }
}

console.log(`🚀 开始重新处理 ${failedFiles.length} 个文件...`);
console.log('⏳ 这可能需要几分钟时间...');

// 重新运行批量处理
try {
  execSync('node scripts/batch-process-textbooks.js', { stdio: 'inherit' });
  console.log('✅ 重新处理完成');
} catch (error) {
  console.error('❌ 重新处理失败:', error.message);
  process.exit(1);
} 