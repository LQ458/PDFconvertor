import express, { Router } from 'express';
import multer from 'multer';
import { PDFProcessor } from '../services/pdfProcessor';
import { saveProcessedData } from '../utils/fileSystem';
import path from 'path';
import fs from 'fs';

const router: Router = express.Router();

// 配置multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = process.env.TEMP_DIR || './temp';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // 保持原始文件名，添加时间戳避免冲突
    const timestamp = Date.now();
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    cb(null, `${timestamp}_${originalName}`);
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('只支持PDF文件'));
    }
  }
});

const processor = new PDFProcessor();

// 单个PDF文件上传和处理
router.post('/single', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '未找到上传的PDF文件' });
    }

    const generateEmbeddings = req.body.generateEmbeddings !== 'false';
    const filePath = req.file.path;
    
    console.log(`📁 开始处理上传的PDF: ${req.file.originalname}`);
    
    // 处理PDF
    const result = await processor.processPDF(filePath, generateEmbeddings);
    
    // 保存处理结果
    const outputDir = process.env.OUTPUT_DIR || './output';
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const outputPath = path.join(outputDir, `${Date.now()}_${result.filename}.json`);
    await saveProcessedData(result, path.basename(outputPath), 'processed');
    
    // 清理临时文件
    fs.unlinkSync(filePath);
    
    res.json({
      success: true,
      message: 'PDF处理完成',
      data: {
        filename: result.filename,
        totalPages: result.totalPages,
        totalChunks: result.totalChunks,
        processingTime: result.metadata.processingTime,
        embeddingModel: result.processingStats.embeddingModel,
        needsReview: result.metadata.needsReview,
        outputPath: outputPath
      }
    });

  } catch (error) {
    console.error('PDF处理失败:', error);
    
    // 清理临时文件
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      error: '处理PDF时发生错误',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

// 批量PDF文件上传和处理
router.post('/batch', upload.array('pdfs', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: '未找到上传的PDF文件' });
    }

    const files = req.files as Express.Multer.File[];
    const generateEmbeddings = req.body.generateEmbeddings !== 'false';
    
    console.log(`📁 开始批量处理${files.length}个PDF文件`);
    
    const results = [];
    const errors = [];
    
    for (const file of files) {
      try {
        const result = await processor.processPDF(file.path, generateEmbeddings);
        
        // 保存处理结果
        const outputDir = process.env.OUTPUT_DIR || './output';
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }
        
        const outputPath = path.join(outputDir, `${Date.now()}_${result.filename}.json`);
        await saveProcessedData(result, path.basename(outputPath), 'processed');
        
        results.push({
          filename: result.filename,
          totalPages: result.totalPages,
          totalChunks: result.totalChunks,
          processingTime: result.metadata.processingTime,
          embeddingModel: result.processingStats.embeddingModel,
          needsReview: result.metadata.needsReview,
          outputPath: outputPath
        });
        
        // 清理临时文件
        fs.unlinkSync(file.path);
        
      } catch (error) {
        errors.push({
          filename: file.originalname,
          error: error instanceof Error ? error.message : '未知错误'
        });
        
        // 清理临时文件
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      }
    }
    
    res.json({
      success: true,
      message: `批量处理完成，成功${results.length}个，失败${errors.length}个`,
      data: {
        successful: results,
        failed: errors,
        summary: {
          total: files.length,
          successful: results.length,
          failed: errors.length
        }
      }
    });

  } catch (error) {
    console.error('批量处理失败:', error);
    
    // 清理所有临时文件
    if (req.files) {
      const files = req.files as Express.Multer.File[];
      files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }
    
    res.status(500).json({
      error: '批量处理PDF时发生错误',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

// 获取支持的embedding模型列表
router.get('/models', (req, res) => {
  try {
    const models = PDFProcessor.getSupportedModels();
    res.json({
      success: true,
      data: {
        models,
        currentModel: process.env.EMBEDDING_MODEL || 'bge-large-zh-v1.5'
      }
    });
  } catch (error) {
    res.status(500).json({
      error: '获取模型列表失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

// 获取处理状态和配置
router.get('/status', (req, res) => {
  try {
    const currentModel = process.env.EMBEDDING_MODEL || 'bge-large-zh-v1.5';
    const models = PDFProcessor.getSupportedModels();
    const modelConfig = models[currentModel as keyof typeof models];
    
    res.json({
      success: true,
      data: {
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
      }
    });
  } catch (error) {
    res.status(500).json({
      error: '获取状态失败',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

export default router; 