import * as Minio from 'minio';

// Only initialize MinIO client if environment variables are present
export const minioClient = process.env.MINIO_ENDPOINT && process.env.MINIO_PORT && process.env.MINIO_ACCESS_KEY && process.env.MINIO_SECRET_KEY
    ? new Minio.Client({
        endPoint: process.env.MINIO_ENDPOINT,
        port: parseInt(process.env.MINIO_PORT),
        useSSL: process.env.MINIO_USE_SSL === 'true',
        accessKey: process.env.MINIO_ACCESS_KEY,
        secretKey: process.env.MINIO_SECRET_KEY,
    })
    : null;
