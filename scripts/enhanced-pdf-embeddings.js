#!/usr/bin/env node

import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { pipeline } from '@xenova/transformers';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
// 使用动态导入来处理pdf-parse的初始化问题
// import pdf from 'pdf-parse';
import { Poppler } from 'node-poppler';
import pdf2json from 'pdf2json';

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
    BATCH_SIZE: 1, // 进一步减少批处理大小避免内存问题
    RESUME_PROCESSING: true, // 启用断点续连
    MEMORY_CLEANUP_INTERVAL: 10, // 每处理10个文件清理一次内存
    PROCESSING_DELAY: 2000 // 处理间隔，毫秒
};

class EnhancedPDFProcessor {
    constructor() {
        this.embeddings = null;
        this.embeddingModel = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2";
        
        this.textSplitter = new RecursiveCharacterTextSplitter({
            chunkSize: CONFIG.CHUNK_SIZE,
            chunkOverlap: CONFIG.CHUNK_OVERLAP,
        });

        // 初始化PDF处理工具
        this.poppler = new Poppler();
        this.pdfParseAvailable = false; // 标记pdf-parse是否可用

        this.stats = {
            totalFiles: 0,
            processedFiles: 0,
            failedFiles: 0,
            skippedFiles: 0,
            totalChunks: 0,
            startTime: Date.now()
        };

        this.processedFiles = new Set(); // 跟踪已处理的文件
    }

    async initialize() {
        console.log('🚀 初始化增强版PDF处理器...');
        
        // 确保输出目录存在
        await fs.ensureDir(CONFIG.OUTPUT_DIR);
        await fs.ensureDir(path.join(CONFIG.OUTPUT_DIR, 'chunks'));
        await fs.ensureDir(path.join(CONFIG.OUTPUT_DIR, 'embeddings'));
        await fs.ensureDir(path.join(CONFIG.OUTPUT_DIR, 'metadata'));

        // 尝试加载pdf-parse（如果失败也继续）
        try {
            console.log('🔧 尝试加载pdf-parse...');
            this.pdfParse = await import('pdf-parse');
            this.pdfParseAvailable = true;
            console.log('✅ pdf-parse加载成功');
        } catch (error) {
            console.log('⚠️ pdf-parse加载失败，将使用其他PDF处理方法:', error.message);
            this.pdfParseAvailable = false;
        }

        // 加载本地embedding模型
        console.log(`🔧 加载本地embedding模型: ${this.embeddingModel}`);
        console.log('📥 首次使用时会自动下载模型，请耐心等待...');
        
        try {
            this.embeddings = await pipeline('feature-extraction', this.embeddingModel, {
                quantized: false,
            });
            console.log('✅ 模型加载完成');
        } catch (error) {
            console.error('❌ 模型加载失败:', error.message);
            throw error;
        }

        // 加载或初始化处理报告
        await this.loadProcessingReport();

        console.log('✅ 初始化完成');
        console.log(`📊 PDF处理方法: ${this.getAvailableMethods().join(', ')}`);
    }

    getAvailableMethods() {
        const methods = ['node-poppler'];
        if (this.pdfParseAvailable) {
            methods.push('pdf-parse'); // 作为备选方法
        }
        return methods;
    }

    async loadProcessingReport() {
        const reportPath = path.join(CONFIG.OUTPUT_DIR, 'processing_report.json');
        
        try {
            if (await fs.pathExists(reportPath)) {
                const report = await fs.readJson(reportPath);
                if (report.processedFiles && Array.isArray(report.processedFiles)) {
                    this.processedFiles = new Set(report.processedFiles);
                    console.log(`📋 载入处理报告: ${this.processedFiles.size} 个文件已处理`);
                }
            }
        } catch (error) {
            console.warn('⚠️ 载入处理报告失败，将从头开始:', error.message);
            this.processedFiles = new Set();
        }
    }

    async saveProcessingReport() {
        const reportPath = path.join(CONFIG.OUTPUT_DIR, 'processing_report.json');
        
        const report = {
            lastUpdated: new Date().toISOString(),
            totalProcessedFiles: this.processedFiles.size,
            processedFiles: Array.from(this.processedFiles),
            stats: this.stats,
            config: CONFIG
        };

        await fs.writeJson(reportPath, report, { spaces: 2 });
    }

    async extractTextFromPDF(pdfPath) {
        const fileName = path.basename(pdfPath);
        
        // 检查是否已处理（断点续连）
        if (this.processedFiles.has(pdfPath)) {
            console.log(`⏭️ 跳过已处理文件: ${fileName}`);
            this.stats.skippedFiles++;
            return null;
        }

        // 优先使用稳定的方法，暂时移除pdf2json避免内存问题
        const methods = [
            { name: 'node-poppler', func: () => this.extractWithPoppler(pdfPath) }
        ];

        // 只有在pdf-parse可用时才添加作为备选
        if (this.pdfParseAvailable) {
            methods.push({ name: 'pdf-parse', func: () => this.extractWithPdfParse(pdfPath) });
        }

        for (const method of methods) {
            try {
                console.log(`📄 尝试用 ${method.name} 处理: ${fileName}`);
                const result = await method.func();
                
                if (result && result.text && result.text.trim()) {
                    console.log(`✅ ${method.name} 成功提取: ${fileName} (${result.text.length}字符)`);
                    return result;
                }
            } catch (error) {
                console.warn(`⚠️ ${method.name} 处理失败 ${fileName}: ${error.message}`);
                continue;
            }
        }

        throw new Error('所有PDF处理方法都失败了');
    }

    async extractWithPdfParse(pdfPath) {
        if (!this.pdfParseAvailable) {
            throw new Error('pdf-parse不可用');
        }

        const dataBuffer = await fs.readFile(pdfPath);
        const data = await this.pdfParse.default(dataBuffer);
        
        if (!data.text || !data.text.trim()) {
            throw new Error('PDF内容为空');
        }

        return {
            text: data.text,
            metadata: {
                source: pdfPath,
                totalPages: data.numpages,
                extractedAt: new Date().toISOString(),
                method: 'pdf-parse'
            }
        };
    }

    async extractWithPoppler(pdfPath) {
        // 修复node-poppler的参数问题
        const options = {};
        // 不传递 undefined 值，让 poppler 使用默认值
        
        const text = await this.poppler.pdfToText(pdfPath, undefined, options);

        if (!text || !text.trim()) {
            throw new Error('Poppler提取的内容为空');
        }

        return {
            text: text,
            metadata: {
                source: pdfPath,
                extractedAt: new Date().toISOString(),
                method: 'node-poppler'
            }
        };
    }

    async extractWithPdf2Json(pdfPath) {
        return new Promise((resolve, reject) => {
            const pdfParser = new pdf2json();
            
            pdfParser.on("pdfParser_dataError", errData => {
                reject(new Error(errData.parserError));
            });
            
            pdfParser.on("pdfParser_dataReady", pdfData => {
                try {
                    const text = pdfParser.getRawTextContent();
                    
                    if (!text || !text.trim()) {
                        reject(new Error('PDF2JSON提取的内容为空'));
                        return;
                    }

                    resolve({
                        text: text,
                        metadata: {
                            source: pdfPath,
                            totalPages: pdfData.Pages ? pdfData.Pages.length : 0,
                            extractedAt: new Date().toISOString(),
                            method: 'pdf2json'
                        }
                    });
                } catch (error) {
                    reject(error);
                }
            });

            pdfParser.loadPDF(pdfPath);
        });
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
        const batchSize = 1; // 进一步减少batch大小到1
        
        console.log(`🧮 生成embeddings (${chunks.length}个chunks)...`);
        
        for (let i = 0; i < chunks.length; i += batchSize) {
            const batch = chunks.slice(i, i + batchSize);
            const texts = batch.map(chunk => chunk.content);
            
            try {
                const batchEmbeddings = await this.embeddings(texts, {
                    pooling: 'mean',
                    normalize: true
                });
                
                // 转换为普通数组格式
                for (let j = 0; j < batch.length; j++) {
                    embeddings.push({
                        chunkIndex: batch[j].metadata.chunkIndex,
                        embedding: Array.from(batchEmbeddings[j].data),
                        metadata: batch[j].metadata
                    });
                }
                
                // 显示进度
                process.stdout.write(`\r🧮 进度: ${Math.min(i + batchSize, chunks.length)}/${chunks.length}`);
                
                // 增加延迟和强制垃圾回收
                if ((i + 1) % 5 === 0) {
                    // 每5个chunk强制垃圾回收
                    if (global.gc) {
                        global.gc();
                    }
                }
                
                // 增加处理延迟
                await new Promise(resolve => setTimeout(resolve, 500));
                
            } catch (error) {
                console.error(`\n❌ 批处理 ${i}-${i + batchSize - 1} 失败:`, error.message);
                throw error;
            }
        }
        
        console.log('\n✅ Embeddings生成完成');
        return embeddings;
    }

    async processPDF(pdfPath) {
        const fileName = path.basename(pdfPath);
        
        try {
            console.log(`\n📖 处理PDF: ${fileName}`);
            
            // 提取文本
            const extractResult = await this.extractTextFromPDF(pdfPath);
            if (!extractResult) {
                return; // 文件已被跳过
            }
            
            const { text, metadata } = extractResult;
            
            // 分块
            const chunks = await this.chunkText(text, metadata);
            console.log(`📄 生成 ${chunks.length} 个文本块`);
            
            // 生成embeddings
            const embeddings = await this.generateEmbeddings(chunks);
            
            // 保存结果
            await this.saveResults(pdfPath, { chunks, embeddings, metadata });
            
            // 标记为已处理
            this.processedFiles.add(pdfPath);
            
            // 更新统计
            this.stats.processedFiles++;
            this.stats.totalChunks += chunks.length;
            
            console.log(`✅ 处理完成: ${fileName}`);
            
        } catch (error) {
            console.error(`❌ 处理失败: ${fileName} - ${error.message}`);
            await this.logFailure(pdfPath, error.message);
            this.stats.failedFiles++;
        }
    }

    async saveResults(pdfPath, data) {
        const fileName = path.basename(pdfPath, '.pdf');
        
        // 保存chunks
        const chunksFile = path.join(CONFIG.OUTPUT_DIR, 'chunks', `${fileName}.json`);
        await fs.writeJSON(chunksFile, data.chunks, { spaces: 2 });
        
        // 保存embeddings
        const embeddingsFile = path.join(CONFIG.OUTPUT_DIR, 'embeddings', `${fileName}.json`);
        await fs.writeJSON(embeddingsFile, data.embeddings, { spaces: 2 });
        
        // 保存metadata
        const metadataFile = path.join(CONFIG.OUTPUT_DIR, 'metadata', `${fileName}.json`);
        await fs.writeJSON(metadataFile, {
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
        
        try {
            if (await fs.pathExists(failuresFile)) {
                const content = await fs.readFile(failuresFile, 'utf8');
                if (content.trim()) {
                    failures = JSON.parse(content);
                }
            }
        } catch (error) {
            console.warn('⚠️ 读取failures.json失败，将创建新文件');
            failures = [];
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
                skippedFiles: this.stats.skippedFiles,
                failedFiles: this.stats.failedFiles,
                successRate: `${((this.stats.processedFiles / (this.stats.totalFiles - this.stats.skippedFiles)) * 100).toFixed(1)}%`,
                totalChunks: this.stats.totalChunks,
                processingTime: `${Math.round(duration / 1000)}秒`,
                averageTimePerFile: this.stats.processedFiles > 0 ? `${Math.round(duration / this.stats.processedFiles / 1000)}秒` : '0秒'
            },
            outputLocation: CONFIG.OUTPUT_DIR,
            processedFiles: Array.from(this.processedFiles), // 保存已处理文件列表
            generatedAt: new Date().toISOString()
        };
        
        const reportFile = path.join(CONFIG.OUTPUT_DIR, 'processing_report.json');
        await fs.writeJSON(reportFile, report, { spaces: 2 });
        
        return report;
    }

    async findPDFFiles(dir) {
        const files = [];
        
        async function scanDir(currentDir) {
            const items = await fs.readdir(currentDir);
            
            for (const item of items) {
                const fullPath = path.join(currentDir, item);
                const stat = await fs.stat(fullPath);
                
                if (stat.isDirectory()) {
                    await scanDir(fullPath);
                } else if (path.extname(item).toLowerCase() === '.pdf') {
                    files.push(fullPath);
                }
            }
        }
        
        await scanDir(dir);
        return files;
    }

    async run() {
        try {
            await this.initialize();
            
            console.log(`🔍 扫描PDF文件: ${CONFIG.TRAINING_DATA_DIR}`);
            const pdfFiles = await this.findPDFFiles(CONFIG.TRAINING_DATA_DIR);
            
            if (pdfFiles.length === 0) {
                console.log('❌ 未找到PDF文件');
                return;
            }
            
            this.stats.totalFiles = pdfFiles.length;
            console.log(`📚 找到 ${pdfFiles.length} 个PDF文件`);
            
            // 过滤已处理的文件
            const remainingFiles = pdfFiles.filter(file => !this.processedFiles.has(file));
            console.log(`📋 需要处理 ${remainingFiles.length} 个文件 (跳过 ${pdfFiles.length - remainingFiles.length} 个已处理文件)`);
            
            // 单个文件处理（避免并发内存问题）
            for (let i = 0; i < remainingFiles.length; i++) {
                const pdfPath = remainingFiles[i];
                const fileIndex = i + 1;
                const totalRemaining = remainingFiles.length;
                
                console.log(`\n📦 处理进度: ${fileIndex}/${totalRemaining} (总进度: ${this.stats.processedFiles + this.stats.skippedFiles + 1}/${this.stats.totalFiles})`);
                
                try {
                    await this.processPDF(pdfPath);
                    
                    // 定期保存进度和清理内存
                    if (fileIndex % CONFIG.MEMORY_CLEANUP_INTERVAL === 0) {
                        console.log('\n🧹 执行内存清理...');
                        
                        // 保存当前进度
                        await this.saveProcessingReport();
                        
                        // 强制垃圾回收
                        if (global.gc) {
                            global.gc();
                        }
                        
                        // 显示内存使用情况
                        const memUsage = process.memoryUsage();
                        console.log(`📊 内存使用: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB / ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`);
                    }
                    
                    // 处理间隔延迟
                    if (CONFIG.PROCESSING_DELAY > 0) {
                        await new Promise(resolve => setTimeout(resolve, CONFIG.PROCESSING_DELAY));
                    }
                    
                } catch (error) {
                    console.error(`❌ 处理 ${path.basename(pdfPath)} 时发生严重错误:`, error.message);
                    
                    // 记录失败但继续处理其他文件
                    await this.logFailure(pdfPath, error.message);
                    this.stats.failedFiles++;
                    
                    // 如果是内存错误，增加延迟
                    if (error.message.includes('heap') || error.message.includes('memory')) {
                        console.log('🧹 检测到内存问题，执行清理...');
                        if (global.gc) {
                            global.gc();
                        }
                        await new Promise(resolve => setTimeout(resolve, 5000));
                    }
                }
            }
            
            // 生成最终报告
            const finalReport = await this.generateSummaryReport();
            
            console.log('\n🎉 处理完成!');
            console.log(`📊 统计信息:`);
            console.log(`   - 总文件数: ${finalReport.summary.totalFiles}`);
            console.log(`   - 处理成功: ${finalReport.summary.processedFiles}`);
            console.log(`   - 跳过文件: ${finalReport.summary.skippedFiles}`);
            console.log(`   - 处理失败: ${finalReport.summary.failedFiles}`);
            console.log(`   - 成功率: ${finalReport.summary.successRate}`);
            console.log(`   - 总块数: ${finalReport.summary.totalChunks}`);
            console.log(`   - 处理时间: ${finalReport.summary.processingTime}`);
            console.log(`   - 平均时间: ${finalReport.summary.averageTimePerFile}`);
            console.log(`📁 输出位置: ${CONFIG.OUTPUT_DIR}`);
            
        } catch (error) {
            console.error('❌ 处理过程发生严重错误:', error);
            throw error;
        }
    }
}

// 主函数
if (import.meta.url === `file://${process.argv[1]}`) {
    const processor = new EnhancedPDFProcessor();
    processor.run().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

export default EnhancedPDFProcessor; 