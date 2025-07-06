import express, { Express } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pdfProcessorRouter from './routes/pdfProcessor';
import uploadRouter from './routes/upload';
import { healthRouter } from './routes/health';
import { errorHandler } from './middleware/errorHandler';
import { createDirectories } from './utils/fileSystem';

// 加载环境变量
dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 创建必要的目录
createDirectories();

// 路由
app.use('/api/health', healthRouter);
app.use('/api/pdf', pdfProcessorRouter);
app.use('/api/upload', uploadRouter);

// 错误处理中间件
app.use(errorHandler);

// 启动服务器
app.listen(PORT, () => {
  console.log(`🚀 PDF预处理服务已启动在端口 ${PORT}`);
  console.log(`📝 API文档: http://localhost:${PORT}/api/health`);
  console.log(`🔄 环境: ${process.env.NODE_ENV || 'development'}`);
});

export default app; 