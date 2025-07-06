import fs from 'fs-extra';
import path from 'path';

export const createDirectories = async (): Promise<void> => {
  const dirs = [
    process.env.OUTPUT_DIR || './output',
    process.env.TEMP_DIR || './temp',
    './output/processed',
    './output/vectors',
    './output/metadata'
  ];

  for (const dir of dirs) {
    try {
      await fs.ensureDir(dir);
      console.log(`📁 目录已创建: ${dir}`);
    } catch (error) {
      console.error(`❌ 创建目录失败: ${dir}`, error);
    }
  }
};

export const cleanupTempFiles = async (tempDir: string): Promise<void> => {
  try {
    await fs.remove(tempDir);
    console.log(`🗑️ 临时文件已清理: ${tempDir}`);
  } catch (error) {
    console.error(`❌ 清理临时文件失败: ${tempDir}`, error);
  }
};

export const saveProcessedData = async (
  data: any,
  filename: string,
  type: 'processed' | 'vectors' | 'metadata' = 'processed'
): Promise<string> => {
  const outputDir = process.env.OUTPUT_DIR || './output';
  const filePath = path.join(outputDir, type, filename);
  
  try {
    await fs.writeJSON(filePath, data, { spaces: 2 });
    console.log(`💾 数据已保存: ${filePath}`);
    return filePath;
  } catch (error) {
    console.error(`❌ 保存数据失败: ${filePath}`, error);
    throw error;
  }
};

export const loadProcessedData = async (
  filename: string,
  type: 'processed' | 'vectors' | 'metadata' = 'processed'
): Promise<any> => {
  const outputDir = process.env.OUTPUT_DIR || './output';
  const filePath = path.join(outputDir, type, filename);
  
  try {
    const data = await fs.readJSON(filePath);
    return data;
  } catch (error) {
    console.error(`❌ 加载数据失败: ${filePath}`, error);
    throw error;
  }
};

export const listProcessedFiles = async (
  type: 'processed' | 'vectors' | 'metadata' = 'processed'
): Promise<string[]> => {
  const outputDir = process.env.OUTPUT_DIR || './output';
  const dirPath = path.join(outputDir, type);
  
  try {
    const files = await fs.readdir(dirPath);
    return files.filter(file => file.endsWith('.json'));
  } catch (error) {
    console.error(`❌ 列出文件失败: ${dirPath}`, error);
    return [];
  }
}; 