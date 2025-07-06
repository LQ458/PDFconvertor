import { Router, Request, Response } from 'express';
import multer from 'multer';
import { PDFProcessor } from '../services/pdfProcessor';
import { createError, asyncHandler } from '../middleware/errorHandler';
import { loadProcessedData, listProcessedFiles, saveProcessedData } from '../utils/fileSystem';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const router: Router = Router();
const pdfProcessor = new PDFProcessor();

// 配置multer用于文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = process.env.TEMP_DIR || './temp';
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    cb(null, `${timestamp}_${originalName}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
  },
  fileFilter: (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(createError(400, '只支持PDF文件') as any);
    }
  },
});

// 上传并处理PDF
router.post('/upload', upload.single('pdf'), asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw createError(400, '请上传PDF文件');
  }

  const { 
    generateEmbeddings = 'true',
    notifyRAG = 'false',
  } = req.body;

  try {
    const processedDoc = await pdfProcessor.processPDF(
      req.file.path,
      generateEmbeddings === 'true'
    );

    // 保存处理结果
    const outputDir = process.env.OUTPUT_DIR || './output';
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const outputFilename = `${Date.now()}_${processedDoc.filename}.json`;
    await saveProcessedData(processedDoc, outputFilename, 'processed');

    // 清理临时文件
    fs.unlinkSync(req.file.path);

    // 如果需要，通知RAG应用
    if (notifyRAG === 'true') {
      await notifyRAGApplication(processedDoc);
    }

    res.json({
      success: true,
      message: 'PDF处理完成',
      data: {
        filename: processedDoc.filename,
        totalChunks: processedDoc.totalChunks,
        totalPages: processedDoc.totalPages,
        processingTime: processedDoc.metadata.processingTime,
        embeddingModel: processedDoc.processingStats.embeddingModel,
        needsReview: processedDoc.metadata.needsReview,
        hasEmbeddings: !!processedDoc.chunks.some(chunk => chunk.embedding),
      },
    });
  } catch (error: any) {
    // 清理临时文件
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    console.error('PDF处理失败:', error);
    throw createError(500, `PDF处理失败: ${error.message || error}`);
  }
}));

// 获取处理后的文档数据
router.get('/data/:filename', asyncHandler(async (req: Request, res: Response) => {
  const { filename } = req.params;
  const { type = 'processed' } = req.query;

  try {
    const data = await loadProcessedData(filename, type as any);
    
    res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    throw createError(404, `未找到文档数据: ${filename}`);
  }
}));

// 列出所有处理过的文档
router.get('/list', asyncHandler(async (req: Request, res: Response) => {
  const { type = 'processed' } = req.query;

  try {
    const files = await listProcessedFiles(type as any);
    const documents = [];

    for (const file of files) {
      try {
        const data = await loadProcessedData(file, type as any);
        documents.push({
          filename: data.filename,
          totalChunks: data.totalChunks,
          totalPages: data.totalPages,
          processingTime: data.metadata?.processingTime,
          embeddingModel: data.processingStats?.embeddingModel,
          needsReview: data.metadata?.needsReview,
          processingDate: data.processingStats?.processingDate,
        });
      } catch (error: any) {
        console.error(`加载文件失败: ${file}`, error);
      }
    }

    res.json({
      success: true,
      total: documents.length,
      documents,
    });
  } catch (error: any) {
    throw createError(500, `获取文档列表失败: ${error.message || error}`);
  }
}));

// 批量处理PDF
router.post('/batch', upload.array('pdfs'), asyncHandler(async (req: Request, res: Response) => {
  if (!req.files || req.files.length === 0) {
    throw createError(400, '请上传至少一个PDF文件');
  }

  const { 
    generateEmbeddings = 'true',
    notifyRAG = 'false',
  } = req.body;

  const results = [];
  const errors = [];

  for (const file of req.files as Express.Multer.File[]) {
    try {
      const processedDoc = await pdfProcessor.processPDF(
        file.path,
        generateEmbeddings === 'true'
      );

      // 保存处理结果
      const outputDir = process.env.OUTPUT_DIR || './output';
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      const outputFilename = `${Date.now()}_${processedDoc.filename}.json`;
      await saveProcessedData(processedDoc, outputFilename, 'processed');

      results.push({
        filename: processedDoc.filename,
        totalChunks: processedDoc.totalChunks,
        totalPages: processedDoc.totalPages,
        processingTime: processedDoc.metadata.processingTime,
        embeddingModel: processedDoc.processingStats.embeddingModel,
        needsReview: processedDoc.metadata.needsReview,
        hasEmbeddings: !!processedDoc.chunks.some(chunk => chunk.embedding),
      });

      // 清理临时文件
      fs.unlinkSync(file.path);

      // 如果需要，通知RAG应用
      if (notifyRAG === 'true') {
        await notifyRAGApplication(processedDoc);
      }

    } catch (error: any) {
      // 清理临时文件
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      
      errors.push({
        filename: file.originalname,
        error: error.message || error,
      });
    }
  }

  res.json({
    success: true,
    message: `批量处理完成: ${results.length} 个成功, ${errors.length} 个失败`,
    results,
    errors,
  });
}));

// 获取处理器状态
router.get('/status', asyncHandler(async (req: Request, res: Response) => {
  const currentModel = process.env.EMBEDDING_MODEL || 'bge-large-zh-v1.5';
  const models = PDFProcessor.getSupportedModels();
  const modelConfig = models[currentModel as keyof typeof models];
  
  res.json({
    success: true,
    status: {
      currentModel,
      modelConfig,
      settings: {
        chunkSize: parseInt(process.env.CHUNK_SIZE || '2000'),
        chunkOverlap: parseInt(process.env.CHUNK_OVERLAP || '400'),
        maxChunksPerDocument: parseInt(process.env.MAX_CHUNKS_PER_DOCUMENT || '500'),
        generateEmbeddings: process.env.GENERATE_EMBEDDINGS !== 'false',
        outputDir: process.env.OUTPUT_DIR || './output',
        tempDir: process.env.TEMP_DIR || './temp'
      }
    },
  });
}));

// 获取支持的embedding模型列表
router.get('/models', asyncHandler(async (req: Request, res: Response) => {
  const models = PDFProcessor.getSupportedModels();
  
  res.json({
    success: true,
    data: {
      models,
      currentModel: process.env.EMBEDDING_MODEL || 'bge-large-zh-v1.5'
    }
  });
}));

// 导出处理后的数据到RAG应用
router.post('/export/:format', asyncHandler(async (req: Request, res: Response) => {
  const { format } = req.params;
  const { files = [] } = req.body;

  if (!['json', 'langchain', 'openai'].includes(format)) {
    throw createError(400, '不支持的导出格式');
  }

  try {
    const exportedData = await exportData(files, format);
    
    res.json({
      success: true,
      message: `数据已导出为${format}格式`,
      data: exportedData,
    });
  } catch (error: any) {
    throw createError(500, `导出失败: ${error.message || error}`);
  }
}));

// 通知RAG应用的辅助函数
async function notifyRAGApplication(processedDoc: any): Promise<void> {
  const webhookUrl = process.env.RAG_WEBHOOK_URL;
  const apiKey = process.env.RAG_API_KEY;

  if (!webhookUrl) {
    console.log('⚠️  未配置RAG webhook URL，跳过通知');
    return;
  }

  try {
    const payload = {
      type: 'document_processed',
      data: {
        filename: processedDoc.filename,
        totalChunks: processedDoc.totalChunks,
        totalPages: processedDoc.totalPages,
        processingTime: processedDoc.metadata.processingTime,
        embeddingModel: processedDoc.processingStats.embeddingModel,
        needsReview: processedDoc.metadata.needsReview,
        chunks: processedDoc.chunks.map((chunk: any) => ({
          content: chunk.content,
          metadata: chunk.metadata,
          hasEmbedding: !!chunk.embedding
        }))
      },
      timestamp: new Date().toISOString(),
    };

    const headers: any = {
      'Content-Type': 'application/json',
    };

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    await axios.post(webhookUrl, payload, { headers });
    console.log('✅ RAG应用通知成功');
  } catch (error: any) {
    console.error('❌ RAG应用通知失败:', error.message);
  }
}

// 数据导出辅助函数
async function exportData(fileList: string[], format: string): Promise<any> {
  const documents = [];

  for (const filename of fileList) {
    try {
      const data = await loadProcessedData(filename, 'processed');
      documents.push(data);
    } catch (error) {
      console.error(`加载文件失败: ${filename}`, error);
    }
  }

  switch (format) {
    case 'json':
      return {
        format: 'json',
        documents,
        totalDocuments: documents.length,
        exportDate: new Date().toISOString(),
      };

    case 'langchain':
      return {
        format: 'langchain',
        documents: documents.map(doc => ({
          pageContent: doc.chunks.map((chunk: any) => chunk.content).join('\n\n'),
          metadata: {
            filename: doc.filename,
            totalPages: doc.totalPages,
            totalChunks: doc.totalChunks,
            embeddingModel: doc.processingStats?.embeddingModel,
          },
        })),
        totalDocuments: documents.length,
        exportDate: new Date().toISOString(),
      };

    case 'openai':
      return {
        format: 'openai',
        documents: documents.map(doc => ({
          input: doc.chunks.map((chunk: any) => chunk.content).join(' '),
          metadata: {
            filename: doc.filename,
            totalPages: doc.totalPages,
            totalChunks: doc.totalChunks,
            embeddingModel: doc.processingStats?.embeddingModel,
          },
        })),
        totalDocuments: documents.length,
        exportDate: new Date().toISOString(),
      };

    default:
      throw new Error('不支持的导出格式');
  }
}

export default router; 