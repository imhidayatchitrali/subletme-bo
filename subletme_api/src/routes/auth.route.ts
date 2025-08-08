import { Router } from 'express';
import AuthController from '../controllers/auth.controller';
import {
    authenticateUser,
    validateRequestBody,
} from '../middleware/auth.middleware';

class AuthRoutes {
    private router: Router;
    private authController: AuthController;

    constructor() {
        this.router = Router();
        this.authController = new AuthController();
        this.initializeRoutes();
    }

    private initializeRoutes(): void {
        this.router.post(
            '/login',
            validateRequestBody(['email', 'password']),
            this.authController.signinWithEmail,
        );

        // Social authentication routes
        this.router.post(
            '/google',
            validateRequestBody(['idToken']),
            this.authController.googleSignIn,
        );

        this.router.post(
            '/apple',
            validateRequestBody(['code']),
            this.authController.appleSignIn,
        );

        this.router.post(
            '/forgot-password',
            validateRequestBody(['email']),
            this.authController.forgotPassword,
        );

        this.router.post(
            '/verify-code',
            validateRequestBody(['code', 'email']),
            this.authController.verifyCode,
        );

        this.router.post(
            '/reset-password',
            validateRequestBody(['token', 'password']),
            this.authController.resetPassword,
        );

        // Token management
        this.router.post(
            '/refresh',
            authenticateUser,
            this.authController.refreshToken,
        );

        // Signout
        this.router.post(
            '/signout',
            authenticateUser,
            this.authController.signout,
        );
    }

    public getRouter(): Router {
        return this.router;
    }
}

// Create and export a function to get the router instance
export const getAuthRoutes = (): Router => {
    const authRoutes = new AuthRoutes();
    return authRoutes.getRouter();
};

export default getAuthRoutes;
