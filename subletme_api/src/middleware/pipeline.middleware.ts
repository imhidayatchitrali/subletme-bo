import { Response, Request, NextFunction, RequestHandler } from 'express';

// Middleware for API key authentication
export const apiKeyAuth: RequestHandler = (
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    const apiKey = req.headers['x-api-key'] as string;

    if (!apiKey || apiKey !== process.env.VERSION_API_KEY) {
        throw new Error(`Invalid API key ${apiKey}`);
    }

    next();
};
