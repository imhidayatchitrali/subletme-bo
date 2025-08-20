import express, { Request, Response, Application } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
export const app: Application = express();
import multer from 'multer';

import { initContextMiddleware } from './middleware/init-context.middleware';

import getAPIRouter from './routes/index';

// Configure multer to store files in memory
export const upload = multer({
    storage: multer.memoryStorage(), // Store files in memory as buffers
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB file size limit
});

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));
app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok' });
});

// app.use('/api/', [initContextMiddleware], getAPIRouter());
app.use([initContextMiddleware], getAPIRouter());

app.use('*', (_req, res) => {
    res.status(404).json({
        message: 'Not found',
    });
});

export default app;
