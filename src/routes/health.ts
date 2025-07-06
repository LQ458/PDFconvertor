import { Router, Request, Response } from 'express';

const router: Router = Router();

// 健康检查端点
router.get('/', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'PDF预处理服务',
    version: '1.0.0',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    endpoints: {
      health: '/api/health',
      uploadPdf: '/api/pdf/upload',
      processPdf: '/api/pdf/process',
      getProcessedData: '/api/pdf/data/:id',
      listProcessed: '/api/pdf/list'
    }
  });
});

export { router as healthRouter }; 