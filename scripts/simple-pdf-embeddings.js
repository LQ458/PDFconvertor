#!/usr/bin/env node

import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { pipeline } from '@xenova/transformers';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 配置
const CONFIG = {
    TRAINING_DATA_DIR: path.join(__dirname, '../training_data'),
    OUTPUT_DIR: path.join(__dirname, '../embedding_data'),
    CHUNK_SIZE: 1000,
    CHUNK_OVERLAP: 200,
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000,
    BATCH_SIZE: 5 // 每批处理的文件数
};

class SimplePDFProcessor {
    constructor() {
        this.embeddings = null; // 将在initialize中加载
        this.embeddingModel = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"; // 支持中文的多语言模型
        
        this.textSplitter = new RecursiveCharacterTextSplitter({
            chunkSize: CONFIG.CHUNK_SIZE,
            chunkOverlap: CONFIG.CHUNK_OVERLAP,
        });

        this.stats = {
            totalFiles: 0,
            processedFiles: 0,
            failedFiles: 0,
            totalChunks: 0,
            startTime: Date.now()
        };
    }

    async initialize() {
        console.log('🚀 初始化简单PDF处理器...');
        
        // 确保输出目录存在
        await fs.ensureDir(CONFIG.OUTPUT_DIR);
        await fs.ensureDir(path.join(CONFIG.OUTPUT_DIR, 'chunks'));
        await fs.ensureDir(path.join(CONFIG.OUTPUT_DIR, 'embeddings'));
        await fs.ensureDir(path.join(CONFIG.OUTPUT_DIR, 'metadata'));

        // 加载本地embedding模型
        console.log(`🔧 加载本地embedding模型: ${this.embeddingModel}`);
        console.log('📥 首次使用时会自动下载模型，请耐心等待...');
        
        try {
            this.embeddings = await pipeline('feature-extraction', this.embeddingModel, {
                quantized: false, // 使用完整精度获得更好的质量
            });
            console.log('✅ 模型加载完成');
        } catch (error) {
            console.error('❌ 模型加载失败:', error.message);
            throw error;
        }

        console.log('✅ 初始化完成');
    }

    async findAllPDFs(directory) {
        const pdfs = [];
        
        async function searchRecursive(dir) {
            const items = await fs.readdir(dir);
            
            for (const item of items) {
                const fullPath = path.join(dir, item);
                const stat = await fs.stat(fullPath);
                
                if (stat.isDirectory()) {
                    await searchRecursive(fullPath);
                } else if (item.toLowerCase().endsWith('.pdf')) {
                    pdfs.push(fullPath);
                }
            }
        }
        
        await searchRecursive(directory);
        return pdfs;
    }

    async extractTextFromPDF(pdfPath) {
        try {
            console.log(`📖 提取文本: ${path.basename(pdfPath)}`);
            
            const loader = new PDFLoader(pdfPath);
            const documents = await loader.load();
            
            // 合并所有页面的文本
            const fullText = documents.map(doc => doc.pageContent).join('\n\n');
            
            if (!fullText.trim()) {
                throw new Error('PDF文件为空或无法读取文本');
            }

            return {
                text: fullText,
                metadata: {
                    source: pdfPath,
                    totalPages: documents.length,
                    extractedAt: new Date().toISOString()
                }
            };
        } catch (error) {
            console.error(`❌ 提取失败 ${path.basename(pdfPath)}:`, error.message);
            throw error;
        }
    }

    async chunkText(text, metadata) {
        try {
            const documents = await this.textSplitter.createDocuments([text], [metadata]);
            return documents.map((doc, index) => ({
                content: doc.pageContent,
                metadata: {
                    ...doc.metadata,
                    chunkIndex: index,
                    chunkSize: doc.pageContent.length
                }
            }));
        } catch (error) {
            console.error('❌ 文本分块失败:', error.message);
            throw error;
        }
    }

    async generateEmbeddings(chunks) {
        const embeddings = [];
        const batchSize = 5; // 本地模型批处理大小（较小以避免内存问题）
        
        console.log(`🧮 生成embeddings (${chunks.length}个chunks)...`);
        
        for (let i = 0; i < chunks.length; i += batchSize) {
            const batch = chunks.slice(i, i + batchSize);
            const texts = batch.map(chunk => chunk.content);
            
            try {
                // 使用本地模型生成embeddings
                const batchEmbeddings = [];
                
                for (const text of texts) {
                    const result = await this.embeddings(text, {
                        pooling: 'mean',
                        normalize: true
                    });
                    
                    // 将tensor转换为数组
                    const embedding = Array.from(result.data);
                    batchEmbeddings.push(embedding);
                }
                
                for (let j = 0; j < batch.length; j++) {
                    embeddings.push({
                        content: batch[j].content,
                        embedding: batchEmbeddings[j],
                        metadata: batch[j].metadata
                    });
                }
                
                console.log(`  ✅ 完成批次 ${Math.floor(i/batchSize) + 1}/${Math.ceil(chunks.length/batchSize)}`);
                
                // 给系统一点休息时间
                if (i + batchSize < chunks.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            } catch (error) {
                console.error('❌ Embeddings生成失败:', error.message);
                throw error;
            }
        }
        
        return embeddings;
    }

    async processPDF(pdfPath) {
        try {
            // 提取文本
            const { text, metadata } = await this.extractTextFromPDF(pdfPath);
            
            // 分块
            const chunks = await this.chunkText(text, metadata);
            this.stats.totalChunks += chunks.length;
            
            // 生成embeddings
            const embeddings = await this.generateEmbeddings(chunks);
            
            // 保存数据
            await this.saveProcessedData(pdfPath, {
                originalText: text,
                chunks,
                embeddings,
                metadata
            });
            
            this.stats.processedFiles++;
            console.log(`✅ 处理完成: ${path.basename(pdfPath)} (${chunks.length} chunks)`);
            
        } catch (error) {
            this.stats.failedFiles++;
            console.error(`❌ 处理失败: ${path.basename(pdfPath)} - ${error.message}`);
            
            // 记录失败信息
            await this.logFailure(pdfPath, error.message);
        }
    }

    async saveProcessedData(pdfPath, data) {
        const relativePath = path.relative(CONFIG.TRAINING_DATA_DIR, pdfPath);
        const baseName = path.basename(pdfPath, '.pdf');
        const outputName = relativePath.replace(/[\/\\]/g, '_').replace('.pdf', '');
        
        // 保存chunks
        const chunksFile = path.join(CONFIG.OUTPUT_DIR, 'chunks', `${outputName}_chunks.json`);
        await fs.writeJSON(chunksFile, data.chunks, { spaces: 2 });
        
        // 保存embeddings
        const embeddingsFile = path.join(CONFIG.OUTPUT_DIR, 'embeddings', `${outputName}_embeddings.json`);
        await fs.writeJSON(embeddingsFile, data.embeddings, { spaces: 2 });
        
        // 保存元数据
        const metadataFile = path.join(CONFIG.OUTPUT_DIR, 'metadata', `${outputName}_metadata.json`);
        await fs.writeJSON(metadataFile, {
            originalPath: pdfPath,
            outputName,
            ...data.metadata,
            processingStats: {
                chunksCount: data.chunks.length,
                embeddingsCount: data.embeddings.length,
                processedAt: new Date().toISOString()
            }
        }, { spaces: 2 });
    }

    async logFailure(pdfPath, errorMessage) {
        const failuresFile = path.join(CONFIG.OUTPUT_DIR, 'failures.json');
        let failures = [];
        
        if (await fs.pathExists(failuresFile)) {
            failures = await fs.readJSON(failuresFile);
        }
        
        failures.push({
            file: pdfPath,
            error: errorMessage,
            timestamp: new Date().toISOString()
        });
        
        await fs.writeJSON(failuresFile, failures, { spaces: 2 });
    }

    async generateSummaryReport() {
        const duration = Date.now() - this.stats.startTime;
        const report = {
            summary: {
                totalFiles: this.stats.totalFiles,
                processedFiles: this.stats.processedFiles,
                failedFiles: this.stats.failedFiles,
                successRate: `${((this.stats.processedFiles / this.stats.totalFiles) * 100).toFixed(1)}%`,
                totalChunks: this.stats.totalChunks,
                processingTime: `${Math.round(duration / 1000)}秒`,
                averageTimePerFile: `${Math.round(duration / this.stats.totalFiles / 1000)}秒`
            },
            outputLocation: CONFIG.OUTPUT_DIR,
            generatedAt: new Date().toISOString()
        };
        
        const reportFile = path.join(CONFIG.OUTPUT_DIR, 'processing_report.json');
        await fs.writeJSON(reportFile, report, { spaces: 2 });
        
        return report;
    }

    async run() {
        try {
            await this.initialize();
            
            console.log('🔍 搜索PDF文件...');
            const pdfFiles = await this.findAllPDFs(CONFIG.TRAINING_DATA_DIR);
            this.stats.totalFiles = pdfFiles.length;
            
            console.log(`📚 找到 ${pdfFiles.length} 个PDF文件`);
            
            if (pdfFiles.length === 0) {
                console.log('❌ 没有找到PDF文件');
                return;
            }
            
            // 按批次处理
            for (let i = 0; i < pdfFiles.length; i += CONFIG.BATCH_SIZE) {
                const batch = pdfFiles.slice(i, i + CONFIG.BATCH_SIZE);
                console.log(`\n📦 处理批次 ${Math.floor(i/CONFIG.BATCH_SIZE) + 1}/${Math.ceil(pdfFiles.length/CONFIG.BATCH_SIZE)}`);
                
                // 并行处理批次中的文件
                await Promise.all(batch.map(pdfPath => this.processPDF(pdfPath)));
                
                // 显示进度
                const progress = ((i + batch.length) / pdfFiles.length * 100).toFixed(1);
                console.log(`📊 总体进度: ${progress}% (${this.stats.processedFiles}/${this.stats.totalFiles})`);
            }
            
            // 生成总结报告
            const report = await this.generateSummaryReport();
            
            console.log('\n🎉 处理完成！');
            console.log(`📊 成功: ${report.summary.processedFiles}/${report.summary.totalFiles} (${report.summary.successRate})`);
            console.log(`📝 总chunks: ${report.summary.totalChunks}`);
            console.log(`⏱️  用时: ${report.summary.processingTime}`);
            console.log(`📁 输出目录: ${CONFIG.OUTPUT_DIR}`);
            
        } catch (error) {
            console.error('❌ 处理过程发生错误:', error);
            process.exit(1);
        }
    }
}

// 检查是否直接运行
if (import.meta.url === `file://${process.argv[1]}`) {
    const processor = new SimplePDFProcessor();
    processor.run().catch(console.error);
}

export default SimplePDFProcessor; 