#!/usr/bin/env node

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Poppler } from 'node-poppler';
import pdf2json from 'pdf2json';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testEnhancedPDFProcessing() {
    console.log('🧪 测试增强版PDF处理功能...');
    
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
    
    // 测试不同的PDF处理方法
    console.log('\n🔧 测试PDF处理方法:');
    
    // 1. 测试 node-poppler
    console.log('\n1️⃣ 测试 node-poppler...');
    try {
        const poppler = new Poppler();
        const options = {}; // 不传递 undefined 值
        
        const text = await poppler.pdfToText(testPDF, undefined, options);
        
        if (text && text.trim()) {
            console.log(`   ✅ node-poppler 成功: ${text.length}字符`);
            console.log(`   📝 前100字符预览: "${text.substring(0, 100)}..."`);
        } else {
            console.log(`   ⚠️ node-poppler 提取的内容为空`);
        }
    } catch (error) {
        console.log(`   ❌ node-poppler 失败: ${error.message}`);
    }
    
    // 2. 测试 pdf2json
    console.log('\n2️⃣ 测试 pdf2json...');
    try {
        const result = await new Promise((resolve, reject) => {
            const pdfParser = new pdf2json();
            
            pdfParser.on("pdfParser_dataError", errData => {
                reject(new Error(errData.parserError));
            });
            
            pdfParser.on("pdfParser_dataReady", pdfData => {
                try {
                    const text = pdfParser.getRawTextContent();
                    resolve(text);
                } catch (error) {
                    reject(error);
                }
            });

            pdfParser.loadPDF(testPDF);
        });
        
        if (result && result.trim()) {
            console.log(`   ✅ pdf2json 成功: ${result.length}字符`);
            console.log(`   📝 前100字符预览: "${result.substring(0, 100)}..."`);
        } else {
            console.log(`   ⚠️ pdf2json 提取的内容为空`);
        }
    } catch (error) {
        console.log(`   ❌ pdf2json 失败: ${error.message}`);
    }
    
    // 3. 测试 pdf-parse（如果可用）
    console.log('\n3️⃣ 测试 pdf-parse...');
    try {
        const pdfParse = await import('pdf-parse');
        const dataBuffer = await fs.readFile(testPDF);
        const data = await pdfParse.default(dataBuffer);
        
        if (data.text && data.text.trim()) {
            console.log(`   ✅ pdf-parse 成功: ${data.text.length}字符, ${data.numpages}页`);
            console.log(`   📝 前100字符预览: "${data.text.substring(0, 100)}..."`);
        } else {
            console.log(`   ⚠️ pdf-parse 提取的内容为空`);
        }
    } catch (error) {
        console.log(`   ❌ pdf-parse 失败: ${error.message}`);
    }
    
    // 内存使用情况
    console.log('\n📊 内存使用情况:');
    const memUsage = process.memoryUsage();
    console.log(`   - 堆内存使用: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
    console.log(`   - 堆内存总计: ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`);
    console.log(`   - 外部内存: ${Math.round(memUsage.external / 1024 / 1024)}MB`);
    
    console.log('\n✅ 测试完成!');
}

if (import.meta.url === `file://${process.argv[1]}`) {
    testEnhancedPDFProcessing().catch(error => {
        console.error('❌ 测试失败:', error);
        process.exit(1);
    });
} 