import { Response, Request, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { UserToken } from '../models/request.model';
import Logger from '../utils/logger';

export const authMiddleware: RequestHandler = (
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    const methodContext = 'AuthMiddleware';
    try {
        const token = req.headers.authorization?.split(' ')[1];
        Logger.info('Token received', methodContext, token);
        if (!token) {
            throw new Error('No token provided');
        }
        // const decoded: UserToken = jwt.verify(token, process.env.JWT_SECRET) as UserToken;
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as UserToken;
        (req as any).token = decoded;
        next();
    } catch (error) {
        res.status(401).json({ message: 'Invalid token' });
    }
};

export const validateRequestBody = (requiredFields: string[]) => {
    const methodContext = 'ValidateRequestBody';
    return (req: Request, res: Response, next: NextFunction) => {
        const missingFields = requiredFields.filter(
            (field) => !req.body[field],
        );

        if (missingFields.length > 0) {
            Logger.error(
                'Validation failed',
                methodContext,
                `Missing fields: ${missingFields.join(', ')}`,
            );
            return res.status(400).json({
                error: 'Validation failed',
                message: `Missing required fields: ${missingFields.join(', ')}`,
                missingFields,
            });
        }

        next();
    };
};

export const authenticateUser = (
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    const methodContext = 'AuthenticateUser';
    try {
        const authHeader = req.headers.authorization;
        Logger.info('Authorization header:', methodContext, authHeader);
        if (!authHeader) {
            Logger.error('No authorization header found', methodContext);
            return res.status(401).json({
                error: 'Authentication required',
                message: 'No authorization header found',
            });
        }

        const token = authHeader.split(' ')[1]; // Bearer <token>

        if (!token) {
            Logger.error('No token provided', methodContext);
            return res.status(401).json({
                error: 'Authentication required',
                message: 'No token provided',
            });
        }

        if (!process.env.JWT_SECRET) {
            Logger.error('JWT secret not configured', methodContext);
            return res.status(500).json({
                error: 'Server configuration error',
                message: 'Authentication is not properly configured',
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (typeof decoded === 'string') {
            throw new Error('Invalid token payload');
        }

        (req as any).user = {
            email: decoded.email,
            userId: decoded.userId,
        };

        next();
    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            Logger.error('Token expired', methodContext, error);
            return res.status(401).json({
                error: 'Token expired',
                message: 'Your session has expired. Please sign in again.',
            });
        }

        if (error instanceof jwt.JsonWebTokenError) {
            Logger.error('Invalid token', methodContext, error);
            return res.status(401).json({
                error: 'Invalid token',
                message: 'Invalid authentication token',
            });
        }

        Logger.error('Authentication error:', methodContext, error);
        return res.status(401).json({
            error: 'Authentication failed',
            message: 'Unable to authenticate request',
        });
    }
};
