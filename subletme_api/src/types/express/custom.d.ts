type AuthenticatedUser = {
    userId: string;
    email: string;
    iat?: number; // JWT issued at
    exp?: number; // JWT expiration
};

export {};

declare global {
    namespace Express {
        // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
        export interface Request {
            user?: AuthenticatedUser;
        }
    }
}
