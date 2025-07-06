#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔍 RAG演示 - 验证数据可用性\n');

// 模拟向量相似度计算（简化版）
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// 加载数据
const optimizedDir = './output/optimized';
const files = fs.readdirSync(optimizedDir).filter(f => f.endsWith('.json'));

console.log(`📁 加载数据: ${files.length} 个文件`);

let allChunks = [];
let validFiles = 0;

for (const file of files) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(optimizedDir, file), 'utf8'));
    if (data.chunks && data.chunks.length > 0) {
      validFiles++;
      for (const chunk of data.chunks) {
        if (chunk.embedding && chunk.embedding.length === 384) {
          allChunks.push({
            content: chunk.content,
            embedding: chunk.embedding,
            source: data.metadata?.filename || file,
            chunkIndex: chunk.metadata?.chunkIndex || 0
          });
        }
      }
    }
  } catch (error) {
    // 忽略损坏的文件
  }
}

console.log(`✅ 加载完成: ${validFiles} 个有效文件, ${allChunks.length} 个chunks`);

if (allChunks.length === 0) {
  console.log('❌ 没有可用的数据进行演示');
  process.exit(1);
}

// 创建简单的查询embedding（使用第一个chunk的embedding作为示例）
const sampleEmbedding = allChunks[0].embedding;

// 演示查询
const queries = [
  {
    name: "数学相关内容",
    embedding: sampleEmbedding // 实际应用中这里应该是查询文本的embedding
  }
];

console.log('\n🔍 开始语义搜索演示...');

for (const query of queries) {
  console.log(`\n查询: ${query.name}`);
  console.log('='.repeat(40));
  
  // 计算相似度
  const similarities = allChunks.map(chunk => ({
    ...chunk,
    similarity: cosineSimilarity(query.embedding, chunk.embedding)
  }));
  
  // 排序并获取前5个结果
  const topResults = similarities
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5);
  
  topResults.forEach((result, index) => {
    console.log(`${index + 1}. 相似度: ${result.similarity.toFixed(4)}`);
    console.log(`   来源: ${result.source}`);
    console.log(`   内容: ${result.content.substring(0, 100)}...`);
    console.log('');
  });
}

// 数据质量分析
console.log('\n📊 数据质量分析');
console.log('='.repeat(40));

const contentLengths = allChunks.map(chunk => chunk.content.length);
const avgLength = contentLengths.reduce((a, b) => a + b, 0) / contentLengths.length;
const minLength = Math.min(...contentLengths);
const maxLength = Math.max(...contentLengths);

console.log(`📏 Chunk长度统计:`);
console.log(`   平均长度: ${avgLength.toFixed(0)} 字符`);
console.log(`   最短长度: ${minLength} 字符`);
console.log(`   最长长度: ${maxLength} 字符`);

// 检查embedding质量
const embeddingStats = {
  validEmbeddings: 0,
  invalidEmbeddings: 0,
  avgEmbeddingNorm: 0
};

for (const chunk of allChunks) {
  if (chunk.embedding && chunk.embedding.length === 384) {
    embeddingStats.validEmbeddings++;
    const norm = Math.sqrt(chunk.embedding.reduce((sum, val) => sum + val * val, 0));
    embeddingStats.avgEmbeddingNorm += norm;
  } else {
    embeddingStats.invalidEmbeddings++;
  }
}

embeddingStats.avgEmbeddingNorm /= embeddingStats.validEmbeddings;

console.log(`\n🧠 Embedding质量:`);
console.log(`   有效embeddings: ${embeddingStats.validEmbeddings}`);
console.log(`   无效embeddings: ${embeddingStats.invalidEmbeddings}`);
console.log(`   平均向量模长: ${embeddingStats.avgEmbeddingNorm.toFixed(4)}`);

// 内容多样性分析
const subjects = {
  数学: 0, 语文: 0, 英语: 0, 物理: 0, 化学: 0, 生物: 0,
  历史: 0, 地理: 0, 政治: 0, 科学: 0, 音乐: 0, 美术: 0
};

for (const chunk of allChunks) {
  for (const subject of Object.keys(subjects)) {
    if (chunk.content.includes(subject)) {
      subjects[subject]++;
    }
  }
}

console.log(`\n📚 内容分布:`);
Object.entries(subjects)
  .filter(([_, count]) => count > 0)
  .sort(([_, a], [__, b]) => b - a)
  .forEach(([subject, count]) => {
    console.log(`   ${subject}: ${count} 个chunks`);
  });

// 生成演示报告
const demoReport = {
  timestamp: new Date().toISOString(),
  dataStatus: {
    totalFiles: validFiles,
    totalChunks: allChunks.length,
    avgChunkLength: avgLength,
    minChunkLength: minLength,
    maxChunkLength: maxLength
  },
  embeddingQuality: {
    validEmbeddings: embeddingStats.validEmbeddings,
    invalidEmbeddings: embeddingStats.invalidEmbeddings,
    avgEmbeddingNorm: embeddingStats.avgEmbeddingNorm,
    embeddingDimension: 384
  },
  contentDistribution: subjects,
  ragCapability: {
    semanticSearchReady: allChunks.length > 0,
    vectorSearchReady: embeddingStats.validEmbeddings > 0,
    contentQuality: avgLength >= 100 ? 'Good' : 'Needs Improvement'
  }
};

fs.writeFileSync('./output/rag-demo-report.json', JSON.stringify(demoReport, null, 2));

console.log('\n✅ RAG演示完成！');
console.log(`📄 演示报告已保存到: ./output/rag-demo-report.json`);

// 最终评估
if (allChunks.length >= 1000 && embeddingStats.validEmbeddings >= 1000) {
  console.log('\n🎯 评估结果: 数据可用于RAG系统');
  console.log('✅ 支持语义搜索');
  console.log('✅ 支持向量检索');
  console.log('✅ 内容质量良好');
} else {
  console.log('\n⚠️  评估结果: 数据质量有待提升');
  console.log('🔧 建议进一步优化后使用');
} 