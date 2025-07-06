// RAG 应用集成示例
// 这个示例展示了如何在 RAG 应用中集成 PDF 预处理服务

const express = require('express');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs-extra');

const app = express();
app.use(express.json());

// PDF 预处理服务的配置
const PDF_PROCESSOR_BASE_URL = 'http://localhost:3001';

// 模拟向量数据库存储
const vectorDB = new Map();

// 配置文件上传
const upload = multer({ dest: 'uploads/' });

// 1. 上传 PDF 到预处理服务
app.post('/api/upload-pdf', upload.single('pdf'), async (req, res) => {
  try {
    console.log('📤 上传 PDF 到预处理服务...');
    
    // 创建FormData
    const formData = new FormData();
    const fileBuffer = await fs.readFile(req.file.path);
    formData.append('pdf', new Blob([fileBuffer]), req.file.originalname);
    formData.append('generateVectors', 'true');
    formData.append('saveToFile', 'true');
    formData.append('includeMetadata', 'true');
    formData.append('notifyRAG', 'true');
    
    // 发送到预处理服务
    const response = await axios.post(`${PDF_PROCESSOR_BASE_URL}/api/pdf/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    
    console.log('✅ PDF 预处理完成:', response.data);
    
    // 清理临时文件
    await fs.remove(req.file.path);
    
    res.json({
      success: true,
      message: 'PDF 上传成功，正在处理中...',
      processingId: response.data.data.id
    });
    
  } catch (error) {
    console.error('❌ PDF 上传失败:', error.message);
    res.status(500).json({
      success: false,
      message: '上传失败',
      error: error.message
    });
  }
});

// 2. 接收预处理服务的 webhook 通知
app.post('/api/webhook/processed-documents', async (req, res) => {
  try {
    const { event, data } = req.body;
    
    if (event === 'document_processed') {
      console.log('📢 收到处理完成通知:', data);
      
      // 拉取处理后的数据
      await pullAndStoreDocument(data.id);
      
      res.json({ success: true });
    } else {
      res.json({ success: true, message: '未知事件类型' });
    }
  } catch (error) {
    console.error('❌ Webhook 处理失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 3. 从预处理服务拉取数据并存储
async function pullAndStoreDocument(documentId) {
  try {
    console.log('📥 拉取处理后的数据...');
    
    // 获取 LangChain 格式的数据
    const response = await axios.post(`${PDF_PROCESSOR_BASE_URL}/api/pdf/export/${documentId}`, {
      format: 'langchain',
      includeVectors: 'true'
    });
    
    const { documents } = response.data.data;
    
    console.log(`📊 收到 ${documents.length} 个文档块`);
    
    // 存储到向量数据库（这里是模拟）
    for (const doc of documents) {
      vectorDB.set(doc.metadata.id, {
        content: doc.pageContent,
        embedding: doc.metadata.embedding,
        metadata: doc.metadata
      });
    }
    
    console.log('💾 文档已存储到向量数据库');
    
  } catch (error) {
    console.error('❌ 拉取数据失败:', error.message);
  }
}

// 4. RAG 查询接口
app.post('/api/chat', async (req, res) => {
  try {
    const { question } = req.body;
    
    console.log('🤔 收到查询:', question);
    
    // 1. 生成查询向量（简化版本）
    const queryEmbedding = await generateQueryEmbedding(question);
    
    // 2. 向量检索
    const relevantChunks = await searchSimilarChunks(queryEmbedding, 5);
    
    // 3. 构建上下文
    const context = relevantChunks.map(chunk => chunk.content).join('\n\n');
    
    // 4. 生成答案（这里使用简化版本）
    const answer = await generateAnswer(question, context);
    
    res.json({
      success: true,
      answer,
      sources: relevantChunks.map(chunk => ({
        id: chunk.metadata.id,
        source: chunk.metadata.source,
        chunkIndex: chunk.metadata.chunkIndex
      }))
    });
    
  } catch (error) {
    console.error('❌ 查询失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 5. 生成查询向量嵌入
async function generateQueryEmbedding(query) {
  // 这里应该调用 OpenAI 生成向量嵌入
  // 为了简化，这里返回随机向量
  return Array.from({ length: 1536 }, () => Math.random());
}

// 6. 向量相似度搜索
async function searchSimilarChunks(queryEmbedding, topK = 5) {
  const chunks = Array.from(vectorDB.values());
  
  // 计算余弦相似度
  const similarities = chunks.map(chunk => {
    const similarity = cosineSimilarity(queryEmbedding, chunk.embedding);
    return { ...chunk, similarity };
  });
  
  // 排序并返回前 topK 个
  return similarities
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

// 7. 计算余弦相似度
function cosineSimilarity(a, b) {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  
  return dotProduct / (magnitudeA * magnitudeB);
}

// 8. 生成答案
async function generateAnswer(question, context) {
  // 这里应该调用 LLM 生成答案
  // 为了简化，返回基于上下文的简单答案
  return `基于提供的文档内容，我找到了以下相关信息：\n\n${context.slice(0, 500)}...\n\n请注意，这是基于文档内容的回答。`;
}

// 9. 健康检查
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    vectorDB: {
      totalDocuments: vectorDB.size
    },
    timestamp: new Date().toISOString()
  });
});

// 10. 列出已存储的文档
app.get('/api/documents', (req, res) => {
  const documents = Array.from(vectorDB.values())
    .reduce((acc, chunk) => {
      const source = chunk.metadata.source;
      if (!acc[source]) {
        acc[source] = {
          source,
          chunks: 0,
          lastUpdate: chunk.metadata.timestamp
        };
      }
      acc[source].chunks++;
      return acc;
    }, {});
  
  res.json({
    success: true,
    documents: Object.values(documents)
  });
});

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 RAG 应用已启动在端口 ${PORT}`);
  console.log(`📱 健康检查: http://localhost:${PORT}/api/health`);
  console.log(`📄 文档列表: http://localhost:${PORT}/api/documents`);
  console.log(`💬 聊天接口: POST http://localhost:${PORT}/api/chat`);
  console.log(`📤 上传PDF: POST http://localhost:${PORT}/api/upload-pdf`);
});

module.exports = app; 