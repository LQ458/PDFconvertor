import fs from 'fs';
import path from 'path';
import pdf from 'pdf-parse';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

// 导入开源embedding模型支持
import { HuggingFaceTransformersEmbeddings } from 'langchain/embeddings/hf_transformers';
import { pipeline } from '@xenova/transformers';

export interface ProcessedChunk {
  content: string;
  metadata: {
    page?: number;
    chunkIndex: number;
    source: string;
  };
  embedding?: number[];
}

export interface ProcessedDocument {
  filename: string;
  totalPages: number;
  totalChunks: number;
  chunks: ProcessedChunk[];
  metadata: {
    title?: string;
    author?: string;
    subject?: string;
    creator?: string;
    producer?: string;
    creationDate?: string;
    modificationDate?: string;
    fileSize: number;
    processingTime: number;
    needsReview: boolean;
    cleanedText: boolean;
  };
  processingStats: {
    originalTextLength: number;
    cleanedTextLength: number;
    averageChunkSize: number;
    embeddingModel?: string;
    processingDate: string;
  };
}

// 支持的embedding模型配置
export const EMBEDDING_MODELS = {
  // BGE系列 - 智源研究院（推荐）
  'bge-large-zh-v1.5': {
    name: 'BAAI/bge-large-zh-v1.5',
    dimensions: 1024,
    maxTokens: 512,
    description: '中文优化的大型模型，性能优异',
    instruction: '为这个句子生成表示以用于检索相关文章：'
  },
  'bge-base-zh-v1.5': {
    name: 'BAAI/bge-base-zh-v1.5', 
    dimensions: 768,
    maxTokens: 512,
    description: '中文优化的基础模型，性能与效率平衡',
    instruction: '为这个句子生成表示以用于检索相关文章：'
  },
  'bge-m3': {
    name: 'BAAI/bge-m3',
    dimensions: 1024,
    maxTokens: 8192,
    description: '多语言、长文本、多功能模型',
    instruction: ''
  },
  
  // Sentence Transformers系列
  'all-MiniLM-L6-v2': {
    name: 'sentence-transformers/all-MiniLM-L6-v2',
    dimensions: 384,
    maxTokens: 256,
    description: '轻量级英文模型，速度快',
    instruction: ''
  },
  'all-mpnet-base-v2': {
    name: 'sentence-transformers/all-mpnet-base-v2',
    dimensions: 768,
    maxTokens: 384,
    description: '高质量英文模型',
    instruction: ''
  },
  'all-MiniLM-L12-v2': {
    name: 'sentence-transformers/all-MiniLM-L12-v2',
    dimensions: 384,
    maxTokens: 256,
    description: '中等规模英文模型',
    instruction: ''
  },

  // 阿里巴巴GTE系列
  'gte-qwen2-1.5b': {
    name: 'Alibaba-NLP/gte-Qwen2-1.5B-instruct',
    dimensions: 1536,
    maxTokens: 32000,
    description: '阿里巴巴最新轻量级多语言模型',
    instruction: ''
  }
};

export class PDFProcessor {
  private textSplitter: RecursiveCharacterTextSplitter;
  private embeddingModel: string;
  private embeddingPipeline: any;
  private modelConfig: any;

  constructor() {
    // 从环境变量获取配置
    const chunkSize = parseInt(process.env.CHUNK_SIZE || '2000');
    const chunkOverlap = parseInt(process.env.CHUNK_OVERLAP || '400');
    this.embeddingModel = process.env.EMBEDDING_MODEL || 'all-MiniLM-L6-v2';
    
    // 获取模型配置
    this.modelConfig = EMBEDDING_MODELS[this.embeddingModel as keyof typeof EMBEDDING_MODELS];
    if (!this.modelConfig) {
      console.warn(`未知的embedding模型: ${this.embeddingModel}, 使用默认模型 all-MiniLM-L6-v2`);
      this.embeddingModel = 'all-MiniLM-L6-v2';
      this.modelConfig = EMBEDDING_MODELS['all-MiniLM-L6-v2'];
    }

    // 配置文本分割器
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize,
      chunkOverlap,
      separators: [
        '\n\n',
        '\n',
        '。',
        '！',
        '？',
        '；',
        '.',
        '!',
        '?',
        ';',
        ' ',
        ''
      ],
    });

    console.log(`📊 使用embedding模型: ${this.modelConfig.name}`);
    console.log(`📐 向量维度: ${this.modelConfig.dimensions}`);
    console.log(`📏 最大tokens: ${this.modelConfig.maxTokens}`);
  }

  /**
   * 初始化embedding模型
   */
  private async initEmbeddingModel() {
    if (this.embeddingPipeline) return;

    try {
      console.log(`🔄 正在加载embedding模型: ${this.modelConfig.name}...`);
      
      // 使用Xenova Transformers加载模型
      this.embeddingPipeline = await pipeline(
        'feature-extraction',
        this.modelConfig.name,
        {
          quantized: false, // 不使用量化模型，避免找不到model_quantized.onnx
          local_files_only: false,
          revision: 'main'
        }
      );
      
      console.log(`✅ Embedding模型加载成功!`);
    } catch (error) {
      console.error(`❌ 加载embedding模型失败:`, error);
      throw new Error(`无法加载embedding模型: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 生成文本embedding
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      await this.initEmbeddingModel();
      
      // 添加指令前缀（如果模型需要）
      const inputText = this.modelConfig.instruction ? 
        this.modelConfig.instruction + text : text;
      
      // 生成embedding
      const result = await this.embeddingPipeline(inputText, {
        pooling: 'mean',
        normalize: true
      });
      
      // 确保返回正确格式的向量
      if (result && typeof result === 'object' && 'data' in result) {
        // 处理Tensor对象
        return Array.from(result.data);
      } else if (Array.isArray(result) && Array.isArray(result[0])) {
        return result[0];
      } else if (Array.isArray(result)) {
        return result;
      } else {
        console.error('未知的embedding格式:', typeof result, result);
        throw new Error('模型返回的embedding格式不正确');
      }
    } catch (error) {
      console.error('生成embedding失败:', error);
      throw error;
    }
  }

  /**
   * 清理文本内容
   */
  private cleanText(text: string): { cleanedText: string; needsReview: boolean } {
    let cleaned = text;
    let needsReview = false;

    // 首先清理多余的空白字符
    cleaned = cleaned
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim();

    // 如果文本太短，直接返回
    if (cleaned.length < 10) {
      return { cleanedText: cleaned, needsReview: true };
    }

    // 移除出版社信息（更保守的模式）
    const publisherPatterns = [
      /^.*出版社.*$/gm,
      /^.*Publishing.*$/gim,
      /^.*Press.*$/gim,
      /^Copyright.*\d{4}.*$/gim,
      /^版权所有.*$/gm,
    ];

    publisherPatterns.forEach(pattern => {
      cleaned = cleaned.replace(pattern, '');
    });

    // 移除作者信息（只匹配单独行）
    const authorPatterns = [
      /^作者[：:]\s*[\u4e00-\u9fa5a-zA-Z\s]+$/gm,
      /^编著[：:]\s*[\u4e00-\u9fa5a-zA-Z\s]+$/gm,
      /^主编[：:]\s*[\u4e00-\u9fa5a-zA-Z\s]+$/gm,
      /^Author[s]?[：:]\s*[a-zA-Z\s]+$/gim,
      /^By\s+[a-zA-Z\s]+$/gim,
    ];

    authorPatterns.forEach(pattern => {
      cleaned = cleaned.replace(pattern, '');
    });

    // 移除页眉页脚（只匹配单独行）
    const headerFooterPatterns = [
      /^第\s*\d+\s*页$/gm,
      /^Page\s*\d+$/gim,
      /^\s*\d+\s*$/gm,
    ];

    headerFooterPatterns.forEach(pattern => {
      cleaned = cleaned.replace(pattern, '');
    });

    // 再次清理空白字符
    cleaned = cleaned
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim();

    // 检测乱码文本
    const totalChars = cleaned.length;
    if (totalChars > 0) {
      // 统计非中文、非英文、非数字、非标点的字符
      const weirdChars = cleaned.match(/[^\u4e00-\u9fa5a-zA-Z0-9\s\.,;:!?()[\]{}"'`~@#$%^&*+=|\\/<>-]/g);
      const weirdCharRatio = weirdChars ? weirdChars.length / totalChars : 0;
      
      if (weirdCharRatio > 0.2) {
        needsReview = true;
        console.warn(`⚠️  检测到可能的乱码文本，乱码比例: ${(weirdCharRatio * 100).toFixed(1)}%`);
      }
    }

    // 如果清理后文本太短，保留原始文本
    if (cleaned.length < text.length * 0.1) {
      console.warn(`⚠️  文本清理过度，保留原始文本`);
      cleaned = text.replace(/\s+/g, ' ').trim();
      needsReview = true;
    }

    return { cleanedText: cleaned, needsReview };
  }

  /**
   * 处理单个PDF文件
   */
  async processPDF(filePath: string, generateEmbeddings: boolean = true): Promise<ProcessedDocument> {
    const startTime = Date.now();
    
    try {
      console.log(`📄 开始处理PDF: ${path.basename(filePath)}`);
      
      // 读取PDF文件
      const fileBuffer = fs.readFileSync(filePath);
      const fileStats = fs.statSync(filePath);
      
      // 解析PDF
      const pdfData = await pdf(fileBuffer);
      
      // 清理文本
      const { cleanedText, needsReview } = this.cleanText(pdfData.text);
      
      // 分割文本
      const textChunks = await this.textSplitter.splitText(cleanedText);
      
      // 限制chunk数量
      const maxChunks = parseInt(process.env.MAX_CHUNKS_PER_DOCUMENT || '500');
      const limitedChunks = textChunks.slice(0, maxChunks);
      
      if (textChunks.length > maxChunks) {
        console.warn(`⚠️  文档chunk数量超限，已截取前${maxChunks}个chunks`);
      }

      // 处理chunks并生成embeddings
      const chunks: ProcessedChunk[] = [];
      
      for (let i = 0; i < limitedChunks.length; i++) {
        const chunk = limitedChunks[i];
        
        const processedChunk: ProcessedChunk = {
          content: chunk,
          metadata: {
            chunkIndex: i,
            source: path.basename(filePath)
          }
        };

        // 生成embedding（如果启用）
        if (generateEmbeddings && chunk.trim().length > 0) {
          try {
            processedChunk.embedding = await this.generateEmbedding(chunk);
            console.log(`✅ 已生成第${i + 1}/${limitedChunks.length}个chunk的embedding`);
          } catch (error) {
            console.error(`❌ 生成第${i + 1}个chunk的embedding失败:`, error);
            // 继续处理其他chunks，不中断整个流程
          }
        }

        chunks.push(processedChunk);
      }

      const processingTime = Date.now() - startTime;

      const result: ProcessedDocument = {
        filename: path.basename(filePath),
        totalPages: pdfData.numpages,
        totalChunks: chunks.length,
        chunks,
        metadata: {
          title: pdfData.info?.Title,
          author: pdfData.info?.Author,
          subject: pdfData.info?.Subject,
          creator: pdfData.info?.Creator,
          producer: pdfData.info?.Producer,
          creationDate: pdfData.info?.CreationDate,
          modificationDate: pdfData.info?.ModificationDate,
          fileSize: fileStats.size,
          processingTime,
          needsReview,
          cleanedText: true
        },
        processingStats: {
          originalTextLength: pdfData.text.length,
          cleanedTextLength: cleanedText.length,
          averageChunkSize: Math.round(chunks.reduce((sum, chunk) => sum + chunk.content.length, 0) / chunks.length),
          embeddingModel: generateEmbeddings ? this.modelConfig.name : undefined,
          processingDate: new Date().toISOString()
        }
      };

      console.log(`✅ PDF处理完成: ${result.filename}`);
      console.log(`📊 统计: ${result.totalPages}页, ${result.totalChunks}个chunks, 耗时${processingTime}ms`);
      
      if (needsReview) {
        console.warn(`⚠️  文档 ${result.filename} 需要人工审查`);
      }

      return result;

    } catch (error) {
      console.error(`❌ 处理PDF失败: ${filePath}`, error);
      throw error;
    }
  }

  /**
   * 批量处理PDF文件
   */
  async processPDFs(filePaths: string[], generateEmbeddings: boolean = true): Promise<ProcessedDocument[]> {
    const results: ProcessedDocument[] = [];
    
    console.log(`🚀 开始批量处理${filePaths.length}个PDF文件`);
    
    for (let i = 0; i < filePaths.length; i++) {
      const filePath = filePaths[i];
      
      try {
        console.log(`📝 处理进度: ${i + 1}/${filePaths.length}`);
        const result = await this.processPDF(filePath, generateEmbeddings);
        results.push(result);
      } catch (error) {
        console.error(`❌ 处理文件失败: ${filePath}`, error);
        // 继续处理其他文件
      }
    }
    
    console.log(`✅ 批量处理完成，成功处理${results.length}/${filePaths.length}个文件`);
    
    return results;
  }

  /**
   * 获取支持的模型列表
   */
  static getSupportedModels() {
    return EMBEDDING_MODELS;
  }

  /**
   * 验证模型是否支持
   */
  static isModelSupported(modelName: string): boolean {
    return modelName in EMBEDDING_MODELS;
  }
} 