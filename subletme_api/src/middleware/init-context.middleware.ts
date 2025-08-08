import { Request, Response, NextFunction } from 'express';

export type Context = {
    userID?: string;
};

// Properly extend the Express Request type
export type ExtendedRequest = {
    context: Context;
} & Request;

// Declare the middleware as a RequestHandler
export const initContextMiddleware = (
    req: Request,
    _res: Response,
    next: NextFunction,
) => {
    (req as ExtendedRequest).context = {} as Context;
    next();
};
