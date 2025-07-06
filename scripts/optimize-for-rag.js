#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔧 开始优化数据以符合RAG要求...\n');

const MIN_CHUNK_LENGTH = 50;
const MAX_CHUNK_LENGTH = 8000;
const SEPARATOR = ' ';

const processedDir = './output/processed';
const optimizedDir = './output/optimized';

// 创建优化输出目录
if (!fs.existsSync(optimizedDir)) {
  fs.mkdirSync(optimizedDir, { recursive: true });
}

const files = fs.readdirSync(processedDir).filter(f => f.endsWith('.json'));

let statistics = {
  totalFiles: 0,
  processedFiles: 0,
  skippedFiles: 0,
  originalChunks: 0,
  optimizedChunks: 0,
  mergedChunks: 0,
  removedChunks: 0
};

function optimizeChunks(chunks) {
  if (!chunks || chunks.length === 0) {
    return [];
  }
  
  const optimized = [];
  let currentChunk = null;
  let mergedCount = 0;
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    
    if (!chunk.content || chunk.content.trim().length === 0) {
      statistics.removedChunks++;
      continue;
    }
    
    const contentLength = chunk.content.trim().length;
    
    if (contentLength < MIN_CHUNK_LENGTH) {
      // 内容太短，需要合并
      if (currentChunk) {
        // 与前一个chunk合并
        const combinedContent = currentChunk.content + SEPARATOR + chunk.content;
        if (combinedContent.length <= MAX_CHUNK_LENGTH) {
          currentChunk.content = combinedContent;
          mergedCount++;
          statistics.mergedChunks++;
        } else {
          // 合并后太长，保存当前chunk，开始新的
          optimized.push(currentChunk);
          currentChunk = {
            content: chunk.content,
            embedding: chunk.embedding,
            metadata: {
              ...chunk.metadata,
              chunkIndex: optimized.length,
              merged: false
            }
          };
        }
      } else {
        // 第一个chunk
        currentChunk = {
          content: chunk.content,
          embedding: chunk.embedding,
          metadata: {
            ...chunk.metadata,
            chunkIndex: optimized.length,
            merged: false
          }
        };
      }
    } else if (contentLength <= MAX_CHUNK_LENGTH) {
      // 内容长度合适
      if (currentChunk) {
        // 先保存之前的chunk
        optimized.push(currentChunk);
      }
      
      currentChunk = {
        content: chunk.content,
        embedding: chunk.embedding,
        metadata: {
          ...chunk.metadata,
          chunkIndex: optimized.length,
          merged: mergedCount > 0
        }
      };
      
      if (mergedCount > 0) {
        currentChunk.metadata.mergedCount = mergedCount;
        mergedCount = 0;
      }
    } else {
      // 内容太长，需要分割
      if (currentChunk) {
        optimized.push(currentChunk);
        currentChunk = null;
      }
      
      const parts = splitLongContent(chunk.content, MAX_CHUNK_LENGTH);
      for (let j = 0; j < parts.length; j++) {
        optimized.push({
          content: parts[j],
          embedding: chunk.embedding, // 使用原始embedding
          metadata: {
            ...chunk.metadata,
            chunkIndex: optimized.length,
            split: true,
            splitPart: j + 1,
            totalParts: parts.length
          }
        });
      }
    }
  }
  
  // 保存最后一个chunk
  if (currentChunk) {
    // 检查最后一个chunk是否太短
    if (currentChunk.content.trim().length < MIN_CHUNK_LENGTH && optimized.length > 0) {
      // 与最后一个chunk合并
      const lastChunk = optimized[optimized.length - 1];
      const combinedContent = lastChunk.content + SEPARATOR + currentChunk.content;
      if (combinedContent.length <= MAX_CHUNK_LENGTH) {
        lastChunk.content = combinedContent;
        lastChunk.metadata.merged = true;
        statistics.mergedChunks++;
      } else {
        optimized.push(currentChunk);
      }
    } else {
      optimized.push(currentChunk);
    }
  }
  
  return optimized;
}

function splitLongContent(content, maxLength) {
  const parts = [];
  const sentences = content.split(/[。！？；\n]/);
  let currentPart = '';
  
  for (const sentence of sentences) {
    if (sentence.trim().length === 0) continue;
    
    const sentenceWithPunctuation = sentence + (content.includes(sentence + '。') ? '。' : 
                                              content.includes(sentence + '！') ? '！' : 
                                              content.includes(sentence + '？') ? '？' : 
                                              content.includes(sentence + '；') ? '；' : '');
    
    if (currentPart.length + sentenceWithPunctuation.length <= maxLength) {
      currentPart += sentenceWithPunctuation;
    } else {
      if (currentPart.trim().length > 0) {
        parts.push(currentPart.trim());
      }
      currentPart = sentenceWithPunctuation;
    }
  }
  
  if (currentPart.trim().length > 0) {
    parts.push(currentPart.trim());
  }
  
  return parts.length > 0 ? parts : [content.substring(0, maxLength)];
}

async function generateNewEmbedding(content) {
  // 这里应该调用embedding API，但为了简化，我们使用原始embedding
  // 在实际应用中，应该重新生成embedding
  return null;
}

console.log(`正在优化 ${files.length} 个文件...`);

for (const file of files) {
  statistics.totalFiles++;
  const filePath = path.join(processedDir, file);
  const optimizedPath = path.join(optimizedDir, file);
  
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    if (!data.chunks || data.chunks.length === 0) {
      statistics.skippedFiles++;
      continue;
    }
    
    statistics.originalChunks += data.chunks.length;
    
    // 优化chunks
    const optimizedChunks = optimizeChunks(data.chunks);
    statistics.optimizedChunks += optimizedChunks.length;
    
    // 创建优化后的数据
    const optimizedData = {
      ...data,
      chunks: optimizedChunks,
      totalChunks: optimizedChunks.length,
      optimization: {
        timestamp: new Date().toISOString(),
        originalChunks: data.chunks.length,
        optimizedChunks: optimizedChunks.length,
        mergedChunks: statistics.mergedChunks,
        removedChunks: statistics.removedChunks
      }
    };
    
    // 保存优化后的文件
    fs.writeFileSync(optimizedPath, JSON.stringify(optimizedData, null, 2));
    statistics.processedFiles++;
    
    if (statistics.processedFiles % 100 === 0) {
      console.log(`  已优化: ${statistics.processedFiles}/${files.length}`);
    }
    
  } catch (error) {
    console.error(`❌ 处理文件失败: ${file}`, error.message);
    statistics.skippedFiles++;
  }
}

// 生成报告
console.log('\n📊 优化报告');
console.log('='.repeat(40));
console.log(`📁 总文件数: ${statistics.totalFiles}`);
console.log(`✅ 已处理: ${statistics.processedFiles}`);
console.log(`⏭️  已跳过: ${statistics.skippedFiles}`);
console.log(`📦 原始chunks: ${statistics.originalChunks}`);
console.log(`🎯 优化后chunks: ${statistics.optimizedChunks}`);
console.log(`🔗 合并的chunks: ${statistics.mergedChunks}`);
console.log(`🗑️  删除的chunks: ${statistics.removedChunks}`);
console.log(`📉 压缩率: ${((statistics.originalChunks - statistics.optimizedChunks) / statistics.originalChunks * 100).toFixed(1)}%`);

console.log(`\n✅ 优化完成！优化后的文件保存在: ${optimizedDir}`);
console.log('🔍 建议运行RAG验证来检查优化效果');

// 保存统计报告
const reportPath = './output/optimization-report.json';
fs.writeFileSync(reportPath, JSON.stringify(statistics, null, 2));
console.log(`📄 详细报告已保存到: ${reportPath}`); 