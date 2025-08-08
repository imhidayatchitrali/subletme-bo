import { minioClient } from '../minio';
import Logger from '../utils/logger';

export const uploadPhotoToMinio = async (
    file: Buffer,
    filePath: string,
    fileName: string,
): Promise<string> => {
    const methodContext = 'MinioHelper - uploadPhotoToMinio';

    // Check if MinIO is configured
    if (!minioClient) {
        Logger.warn('MinIO client not configured, skipping file upload', methodContext);
        // Return a placeholder URL or throw an error depending on your requirements
        return `placeholder://${fileName}`;
    }

    try {
        Logger.info('Starting file upload to MinIO', methodContext, {
            filePath,
            fileName,
            fileSize: file.length,
        });

        const bucketName = process.env.MINIO_BUCKET!;
        const uniqueFileName = `${filePath}/${Date.now()}-${fileName}`;

        Logger.info('Checking if bucket exists', methodContext, { bucketName });
        const bucketExists = await minioClient.bucketExists(bucketName);

        if (!bucketExists) {
            Logger.info('Creating bucket', methodContext, { bucketName });
            await minioClient.makeBucket(bucketName);
        }

        const policy = {
            Version: '2012-10-17',
            Statement: [
                {
                    Effect: 'Allow',
                    Principal: { AWS: ['*'] },
                    Action: ['s3:GetObject'],
                    Resource: [`arn:aws:s3:::${bucketName}/*`],
                },
            ],
        };

        await minioClient.setBucketPolicy(bucketName, JSON.stringify(policy));
        Logger.info('Bucket policy set successfully', methodContext);

        Logger.info('Uploading file', methodContext, {
            size: file.length,
            bucketName,
            uniqueFileName,
        });
        await minioClient.putObject(bucketName, uniqueFileName, file);

        const fileUrl = `https://${process.env.MINIO_ENDPOINT_PUBLIC}/${bucketName}/${uniqueFileName}`;
        Logger.info(
            'MinioHelper ::: uploadPhotoToMinio ::: Upload successful',
            fileUrl,
        );

        return fileUrl;
    } catch (error: any) {
        Logger.error('Error uploading file', methodContext, error.message);
        throw error;
    }
};

type FileData = {
    buffer: Buffer;
    type: string;
};

export const checkForFileAndReturn = (
    image: string | Express.Multer.File,
): FileData | null => {
    const methodContext = 'MinioHelper - checkForFileAndReturn';
    try {
        Logger.info('Processing file', methodContext);

        if (!image) {
            Logger.info('No image provided', methodContext);
            return null;
        }

        // Check if it's a base64 image
        if (typeof image === 'string' && image.includes('base64,')) {
            Logger.info('Processing base64 image', methodContext);
            // Extract actual base64 data
            const [metadata, base64Data] = image.split('base64,');

            if (!base64Data) {
                Logger.error('Invalid base64 data', methodContext);
                return null;
            }

            // Get the mime type
            const matches = metadata.match(/data:(.*?);/);
            const typeFile = matches ? matches[1] : 'application/octet-stream';
            const type = typeFile.split('/')[1];
            Logger.info('Detected file type', methodContext, type);

            // Convert base64 to buffer
            const buffer = Buffer.from(base64Data, 'base64');
            Logger.info('Converted to buffer', methodContext, {
                size: buffer.length,
            });

            return {
                buffer,
                type,
            };
        } else if (
            typeof image !== 'string' &&
            'buffer' in image &&
            'mimetype' in image
        ) {
            Logger.info(
                'Processing Multer file',
                methodContext,
                image.mimetype,
            );
            return {
                buffer: image.buffer,
                type: image.mimetype.split('/')[1],
            };
        } else {
            Logger.error(
                'MinioHelper ::: checkForFileAndReturn ::: Unsupported file format',
            );
            return null;
        }
    } catch (error: any) {
        Logger.error('Error processing file', methodContext, error.message);
        console.error('Error processing file:', error);
        return null;
    }
};

export const checkForFilesAndReturn = (
    image: string[] | Express.Multer.File[],
): FileData[] => {
    const methodContext = 'MinioHelper - checkForFilesAndReturn';
    Logger.info('Processing multiple files', methodContext);

    if (!image || image.length === 0) {
        Logger.info('No files provided', methodContext);
        return [];
    }

    Logger.info('Processing', methodContext, image.length);

    const results: FileData[] = [];
    for (const file of image) {
        const enc = checkForFileAndReturn(file);
        if (enc) {
            results.push(enc);
        }
    }

    Logger.info('Successfully processed', methodContext, results.length);
    return results;
};
