#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { PDFProcessor } = require('../dist/services/pdfProcessor');
const { saveProcessedData } = require('../dist/utils/fileSystem');

// 配置
const CONFIG = {
  // 教材目录
  textbookDirs: [
    '01.小学.全套教材',
    '02.初中.全套教材'
  ],
  
  // 并发处理限制
  concurrentLimit: 3,
  
  // 输出目录
  outputDir: process.env.OUTPUT_DIR || './output',
  
  // 是否生成embeddings
  generateEmbeddings: process.env.GENERATE_EMBEDDINGS !== 'false',
  
  // 支持的文件扩展名
  supportedExtensions: ['.pdf'],
  
  // 日志文件
  logFile: './batch-processing.log'
};

class BatchProcessor {
  constructor() {
    this.processor = new PDFProcessor();
    this.stats = {
      total: 0,
      processed: 0,
      failed: 0,
      skipped: 0,
      startTime: Date.now(),
      errors: []
    };
    
    // 确保输出目录存在
    if (!fs.existsSync(CONFIG.outputDir)) {
      fs.mkdirSync(CONFIG.outputDir, { recursive: true });
    }
  }

  /**
   * 扫描目录获取所有PDF文件
   */
  scanDirectories() {
    const allFiles = [];
    
    for (const dir of CONFIG.textbookDirs) {
      if (!fs.existsSync(dir)) {
        console.warn(`⚠️  目录不存在: ${dir}`);
        continue;
      }
      
      console.log(`📁 扫描目录: ${dir}`);
      const files = this.scanDirectory(dir);
      allFiles.push(...files);
      console.log(`📄 发现 ${files.length} 个PDF文件`);
    }
    
    return allFiles;
  }

  /**
   * 递归扫描单个目录
   */
  scanDirectory(dirPath) {
    const files = [];
    
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          // 递归扫描子目录
          files.push(...this.scanDirectory(fullPath));
        } else if (entry.isFile()) {
          // 检查文件扩展名
          const ext = path.extname(entry.name).toLowerCase();
          if (CONFIG.supportedExtensions.includes(ext)) {
            files.push({
              path: fullPath,
              name: entry.name,
              size: fs.statSync(fullPath).size,
              relativePath: path.relative(process.cwd(), fullPath)
            });
          }
        }
      }
    } catch (error) {
      console.error(`❌ 扫描目录失败: ${dirPath}`, error.message);
    }
    
    return files;
  }

  /**
   * 检查文件是否已处理
   */
  isAlreadyProcessed(filePath) {
    const filename = path.basename(filePath, '.pdf');
    const outputPattern = path.join(CONFIG.outputDir, `*_${filename}.json`);
    
    try {
      const outputDir = fs.readdirSync(CONFIG.outputDir);
      return outputDir.some(file => 
        file.includes(filename) && file.endsWith('.json')
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * 处理单个PDF文件
   */
  async processSingleFile(fileInfo) {
    const { path: filePath, name, size, relativePath } = fileInfo;
    
    try {
      console.log(`\n📄 处理文件: ${relativePath}`);
      console.log(`📏 文件大小: ${(size / 1024 / 1024).toFixed(2)} MB`);
      
      // 检查是否已处理
      if (this.isAlreadyProcessed(filePath)) {
        console.log(`⏭️  文件已处理，跳过: ${name}`);
        this.stats.skipped++;
        return { success: true, skipped: true };
      }
      
      // 处理PDF
      const startTime = Date.now();
      const result = await this.processor.processPDF(filePath, CONFIG.generateEmbeddings);
      const processingTime = Date.now() - startTime;
      
      // 保存结果
      const outputFilename = `${Date.now()}_${result.filename}.json`;
      await saveProcessedData(result, outputFilename, 'processed');
      
      console.log(`✅ 处理完成: ${name}`);
      console.log(`📊 统计: ${result.totalPages}页, ${result.totalChunks}个chunks`);
      console.log(`⏱️  处理时间: ${processingTime}ms`);
      console.log(`🧠 模型: ${result.processingStats.embeddingModel || '无embedding'}`);
      
      if (result.metadata.needsReview) {
        console.log(`⚠️  需要人工审查: ${name}`);
      }
      
      this.stats.processed++;
      return { 
        success: true, 
        result: {
          filename: result.filename,
          totalPages: result.totalPages,
          totalChunks: result.totalChunks,
          processingTime,
          embeddingModel: result.processingStats.embeddingModel,
          needsReview: result.metadata.needsReview
        }
      };
      
    } catch (error) {
      console.error(`❌ 处理失败: ${name}`, error.message);
      this.stats.failed++;
      this.stats.errors.push({
        file: relativePath,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      
      return { success: false, error: error.message };
    }
  }

  /**
   * 批量处理文件（带并发控制）
   */
  async processFiles(files) {
    console.log(`\n🚀 开始批量处理 ${files.length} 个PDF文件`);
    console.log(`⚙️  并发限制: ${CONFIG.concurrentLimit}`);
    console.log(`🧠 Embedding模型: ${process.env.EMBEDDING_MODEL || 'bge-large-zh-v1.5'}`);
    console.log(`📊 生成embeddings: ${CONFIG.generateEmbeddings ? '是' : '否'}`);
    
    const results = [];
    
    // 分批处理文件
    for (let i = 0; i < files.length; i += CONFIG.concurrentLimit) {
      const batch = files.slice(i, i + CONFIG.concurrentLimit);
      console.log(`\n📦 处理批次 ${Math.floor(i / CONFIG.concurrentLimit) + 1}/${Math.ceil(files.length / CONFIG.concurrentLimit)}`);
      
      // 并发处理当前批次
      const batchPromises = batch.map(file => this.processSingleFile(file));
      const batchResults = await Promise.allSettled(batchPromises);
      
      // 收集结果
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          console.error(`❌ 批次处理异常: ${batch[index].name}`, result.reason);
          this.stats.failed++;
          this.stats.errors.push({
            file: batch[index].relativePath,
            error: result.reason?.message || '未知错误',
            timestamp: new Date().toISOString()
          });
        }
      });
      
      // 显示进度
      const progress = ((i + batch.length) / files.length * 100).toFixed(1);
      console.log(`📈 总进度: ${progress}% (${i + batch.length}/${files.length})`);
    }
    
    return results;
  }

  /**
   * 生成处理报告
   */
  generateReport() {
    const endTime = Date.now();
    const totalTime = endTime - this.stats.startTime;
    
    const report = {
      summary: {
        total: this.stats.total,
        processed: this.stats.processed,
        failed: this.stats.failed,
        skipped: this.stats.skipped,
        successRate: this.stats.total > 0 ? ((this.stats.processed / this.stats.total) * 100).toFixed(1) : 0
      },
      timing: {
        startTime: new Date(this.stats.startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        totalTime: totalTime,
        totalTimeFormatted: this.formatTime(totalTime),
        averageTimePerFile: this.stats.processed > 0 ? Math.round(totalTime / this.stats.processed) : 0
      },
      configuration: {
        embeddingModel: process.env.EMBEDDING_MODEL || 'bge-large-zh-v1.5',
        generateEmbeddings: CONFIG.generateEmbeddings,
        chunkSize: process.env.CHUNK_SIZE || '2000',
        chunkOverlap: process.env.CHUNK_OVERLAP || '400',
        maxChunksPerDocument: process.env.MAX_CHUNKS_PER_DOCUMENT || '500',
        concurrentLimit: CONFIG.concurrentLimit
      },
      errors: this.stats.errors
    };
    
    return report;
  }

  /**
   * 格式化时间
   */
  formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}小时${minutes % 60}分钟${seconds % 60}秒`;
    } else if (minutes > 0) {
      return `${minutes}分钟${seconds % 60}秒`;
    } else {
      return `${seconds}秒`;
    }
  }

  /**
   * 保存处理报告
   */
  async saveReport(report) {
    const reportPath = path.join(CONFIG.outputDir, `batch_report_${Date.now()}.json`);
    
    try {
      await fs.promises.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
      console.log(`📊 处理报告已保存: ${reportPath}`);
    } catch (error) {
      console.error(`❌ 保存报告失败:`, error.message);
    }
  }

  /**
   * 主处理流程
   */
  async run() {
    try {
      console.log('📚 开始批量处理教材PDF文件...');
      console.log('=' * 50);
      
      // 1. 扫描文件
      const files = this.scanDirectories();
      this.stats.total = files.length;
      
      if (files.length === 0) {
        console.log('❌ 未找到任何PDF文件');
        return;
      }
      
      console.log(`\n📋 扫描完成，共发现 ${files.length} 个PDF文件`);
      
      // 显示文件大小统计
      const totalSize = files.reduce((sum, file) => sum + file.size, 0);
      console.log(`📏 总文件大小: ${(totalSize / 1024 / 1024 / 1024).toFixed(2)} GB`);
      
      // 2. 处理文件
      await this.processFiles(files);
      
      // 3. 生成报告
      const report = this.generateReport();
      
      // 4. 显示结果
      console.log('\n' + '=' * 50);
      console.log('📊 批量处理完成！');
      console.log('=' * 50);
      console.log(`📄 总文件数: ${report.summary.total}`);
      console.log(`✅ 处理成功: ${report.summary.processed}`);
      console.log(`❌ 处理失败: ${report.summary.failed}`);
      console.log(`⏭️  跳过文件: ${report.summary.skipped}`);
      console.log(`📈 成功率: ${report.summary.successRate}%`);
      console.log(`⏱️  总耗时: ${report.timing.totalTimeFormatted}`);
      console.log(`⚡ 平均处理时间: ${report.timing.averageTimePerFile}ms/文件`);
      
      if (report.errors.length > 0) {
        console.log(`\n❌ 错误详情:`);
        report.errors.forEach((error, index) => {
          console.log(`  ${index + 1}. ${error.file}: ${error.error}`);
        });
      }
      
      // 5. 保存报告
      await this.saveReport(report);
      
    } catch (error) {
      console.error('❌ 批量处理过程中发生严重错误:', error);
      process.exit(1);
    }
  }
}

// 主程序入口
async function main() {
  const processor = new BatchProcessor();
  await processor.run();
}

// 处理未捕获的异常
process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的Promise拒绝:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
  process.exit(1);
});

// 运行主程序
if (require.main === module) {
  main().catch(console.error);
}

module.exports = BatchProcessor; 