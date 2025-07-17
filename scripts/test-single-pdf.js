#!/usr/bin/env node

import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { pipeline } from '@xenova/transformers';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testSinglePDF() {
    console.log('🧪 测试单个PDF文件处理...');
    
    // 找到第一个PDF文件进行测试
    const trainingDataDir = path.join(__dirname, '../training_data');
    
    if (!await fs.pathExists(trainingDataDir)) {
        console.error('❌ 找不到training_data目录');
        return;
    }
    
    console.log('🔍 搜索PDF文件...');
    
    async function findFirstPDF(dir) {
        const items = await fs.readdir(dir);
        
        for (const item of items) {
            const fullPath = path.join(dir, item);
            const stat = await fs.stat(fullPath);
            
            if (stat.isDirectory()) {
                const result = await findFirstPDF(fullPath);
                if (result) return result;
            } else if (item.toLowerCase().endsWith('.pdf')) {
                return fullPath;
            }
        }
        return null;
    }
    
    const testPDF = await findFirstPDF(trainingDataDir);
    
    if (!testPDF) {
        console.error('❌ 没有找到PDF文件');
        return;
    }
    
    console.log(`📖 测试文件: ${path.basename(testPDF)}`);
    
    try {
        // 1. 提取文本
        console.log('1️⃣ 提取文本...');
        const loader = new PDFLoader(testPDF);
        const documents = await loader.load();
        const fullText = documents.map(doc => doc.pageContent).join('\n\n');
        
        console.log(`   ✅ 提取完成: ${documents.length}页, ${fullText.length}字符`);
        console.log(`   📝 前200字符预览: "${fullText.substring(0, 200)}..."`);
        
        // 2. 文本分块
        console.log('2️⃣ 文本分块...');
        const textSplitter = new RecursiveCharacterTextSplitter({
            chunkSize: 500,
            chunkOverlap: 50,
        });
        
        const chunks = await textSplitter.createDocuments([fullText]);
        console.log(`   ✅ 分块完成: ${chunks.length}个chunks`);
        
        if (chunks.length > 0) {
            console.log(`   📝 第一个chunk预览: "${chunks[0].pageContent.substring(0, 100)}..."`);
        }
        
        // 3. 加载embedding模型
        console.log('3️⃣ 加载embedding模型...');
        console.log('   📥 首次使用会下载模型，请耐心等待...');
        
        const embeddings = await pipeline('feature-extraction', 
            'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2', 
            { quantized: false }
        );
        
        console.log('   ✅ 模型加载完成');
        
        // 4. 生成embeddings（只测试前3个chunks）
        console.log('4️⃣ 生成embeddings（测试前3个chunks）...');
        const testChunks = chunks.slice(0, Math.min(3, chunks.length));
        const embeddingResults = [];
        
        for (let i = 0; i < testChunks.length; i++) {
            const text = testChunks[i].pageContent;
            console.log(`   处理chunk ${i + 1}/${testChunks.length}...`);
            
            const result = await embeddings(text, {
                pooling: 'mean',
                normalize: true
            });
            
            const embedding = Array.from(result.data);
            embeddingResults.push({
                text: text.substring(0, 100) + '...',
                embeddingDimension: embedding.length,
                embeddingSample: embedding.slice(0, 5) // 显示前5个维度
            });
            
            console.log(`   ✅ Chunk ${i + 1}: ${embedding.length}维向量`);
        }
        
        // 5. 保存测试结果
        console.log('5️⃣ 保存测试结果...');
        const testOutputDir = path.join(__dirname, '../test_output');
        await fs.ensureDir(testOutputDir);
        
        const testResult = {
            testFile: testPDF,
            extractionResults: {
                totalPages: documents.length,
                totalCharacters: fullText.length,
                textPreview: fullText.substring(0, 500)
            },
            chunkingResults: {
                totalChunks: chunks.length,
                testChunks: testChunks.length,
                chunkSizes: testChunks.map(chunk => chunk.pageContent.length)
            },
            embeddingResults,
            testTime: new Date().toISOString()
        };
        
        const testResultFile = path.join(testOutputDir, 'test_result.json');
        await fs.writeJSON(testResultFile, testResult, { spaces: 2 });
        
        console.log('✅ 测试完成！');
        console.log('📊 测试结果:');
        console.log(`   📄 文件: ${path.basename(testPDF)}`);
        console.log(`   📖 页数: ${documents.length}`);
        console.log(`   📝 字符数: ${fullText.length}`);
        console.log(`   🧩 Chunks: ${chunks.length}`);
        console.log(`   🧮 测试embeddings: ${embeddingResults.length}`);
        console.log(`   📁 结果保存在: ${testResultFile}`);
        
        // 显示embedding质量评估
        if (embeddingResults.length > 0) {
            console.log('🔍 Embedding质量评估:');
            embeddingResults.forEach((result, i) => {
                console.log(`   Chunk ${i + 1}: ${result.embeddingDimension}维, 样本值: [${result.embeddingSample.map(v => v.toFixed(4)).join(', ')}]`);
            });
        }
        
    } catch (error) {
        console.error('❌ 测试失败:', error.message);
        console.error(error.stack);
    }
}

// 检查是否直接运行
if (import.meta.url === `file://${process.argv[1]}`) {
    testSinglePDF().catch(console.error);
}

export default testSinglePDF; 