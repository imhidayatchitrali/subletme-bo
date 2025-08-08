import { Request, Response } from 'express';
import Logger from '../utils/logger';
import UserService from '../services/user.service';
import GoogleService from '../services/google.service';
import {
    generateTemporaryTokenResponse,
    generateTokenResponse,
    validateTemporaryToken,
} from '../helpers/auth.helper';
import { IUser, IUserInput } from '../models/user.model';
import { OnboardingStep } from '../models/onboarding.model';
import AuthService from '../services/auth.service';
import AppleService from '../services/apple.service';
import { EmailService } from '../services/email.service';

class AuthController {
    private userService: UserService;
    private emailService: EmailService;
    private authService: AuthService;
    private googleService: GoogleService;
    private appleService: AppleService;
    private context: string;
    constructor() {
        this.userService = new UserService();
        this.emailService = new EmailService();
        this.googleService = new GoogleService();
        this.appleService = new AppleService();
        this.authService = new AuthService();
        this.context = 'AuthController';
        Logger.info('Initializing', this.context + ' - constructor');
    }

    private handleAuthError(error: unknown, res: Response) {
        const methodContext = this.context + ' - handleAuthError';
        if (error instanceof Error) {
            Logger.error(
                'Error in AuthController',
                methodContext,
                error.message,
            );

            switch (error.message) {
                case 'Invalid token':
                case 'Token expired':
                    return res.status(401).json({
                        error: 'Authentication failed',
                        code: 'token_expired',
                        message:
                            'Your session has expired. Please sign in again.',
                    });
                case 'JWT_SECRET is not configured':
                    return res.status(500).json({
                        error: 'Server configuration error',
                        code: 'server_config_error',
                        message: 'Authentication is not properly configured.',
                    });
                default:
                    return res.status(401).json({
                        error: 'Authentication failed',
                        message: 'Unable to authenticate. Please try again.',
                    });
            }
        }

        Logger.error(
            'Unexpected error in AuthController',
            methodContext,
            error,
        );
        return res.status(500).json({
            error: 'Internal server error',
            message: 'An unexpected error occurred.',
        });
    }

    public signinWithEmail = async (
        req: Request,
        res: Response,
    ): Promise<void> => {
        const methodContext = this.context + ' - signinWithEmail';
        try {
            const { email, password } = req.body;
            Logger.info('Starting singinWithEmail', methodContext, email);

            if (!email || !password) {
                Logger.error('Missing credentials', methodContext, email);
                res.status(400).json({
                    error: 'Validation failed',
                    code: 'missing_email_or_password',
                    message: 'Email and password are required',
                });
                return;
            }

            Logger.info('Finding user by email', methodContext, email);
            const user = await this.userService.findUserByEmail(email);

            if (!user) {
                Logger.error('User not found', methodContext, email);
                res.status(404).json({
                    error: 'User not found',
                    code: 'user_not_found',
                    message: 'User with this email does not exist',
                });
                return;
            }

            // Check if user is not using social sign-in
            if ((user.google_id || user.apple_id) && !user.hash_password) {
                Logger.error(
                    'User is signed in with social account',
                    methodContext,
                    user,
                );
                res.status(400).json({
                    error: 'Authentication failed',
                    code: 'email_login_failed_use_social_login',
                    message: 'User is signed in with social account',
                });
                return;
            }

            Logger.info('Validating password', methodContext, email);
            const isValidPassword = await this.authService.validatePassword(
                password,
                user.hash_password!,
            );

            if (!isValidPassword) {
                Logger.error('Invalid password', methodContext, email);
                res.status(401).json({
                    error: 'Authentication failed',
                    code: 'invalid_password',
                    message: 'Invalid password',
                });
                return;
            }

            Logger.info('Generating token', methodContext, user.id);
            const token = generateTokenResponse(user);
            const userResponse: IUser = {
                id: user.id,
                email: user.email,
                first_name: user.first_name,
                language: user.language,
                last_name: user.last_name,
                is_host: user.is_host,
                onboarding_step: user.onboarding_step,
                date_of_birth: user.date_of_birth,
                photo_url: user.photo_url,
            };

            Logger.info('Login successful', methodContext, user.id);
            res.json({
                token,
                user: userResponse,
            });
        } catch (error) {
            Logger.error(
                'Exception occurred during signinWithEmail',
                methodContext,
            );
            this.handleAuthError(error, res);
        }
    };

    public googleSignIn = async (
        req: Request,
        res: Response,
    ): Promise<void> => {
        const methodContext = this.context + ' - googleSignIn';
        try {
            Logger.info('Starting googleSignIn', methodContext, req.body);
            const { idToken, platform } = req.body;

            if (!idToken) {
                Logger.error('Missing ID token', methodContext, idToken);
                res.status(400).json({
                    error: 'Validation failed',
                    code: 'missing_id_token',
                    message: 'ID token is required',
                });
                return;
            }

            // Verify Google token
            Logger.info('Verifying Google token', methodContext, idToken);
            const googleToken =
                await this.googleService.verifyGoogleToken(idToken);

            Logger.info(
                'Google token verified successfully',
                methodContext,
                googleToken.email,
            );

            const input: IUserInput = {
                email: googleToken.email,
                first_name: googleToken.givenName,
                last_name: googleToken.familyName,
                google_id: googleToken.googleId,
                platform: platform,
                onboarding_step: OnboardingStep.COMPLETED,
            };

            // Find or create user in database
            Logger.info(
                'Finding or creating user',
                methodContext,
                googleToken.email,
            );
            const user = await this.userService.findOrCreateUser(input);
            Logger.info('User record processed', methodContext, user.id);

            // Generate response with JWT and user data
            Logger.info('Generating token', methodContext, user.id);
            const token = generateTokenResponse(user);
            const userResponse: IUser = {
                id: user?.id,
                email: user?.email,
                first_name: user?.first_name,
                last_name: user?.last_name,
                language: user.language,
                is_host: user.is_host,
                onboarding_step: user?.onboarding_step,
                date_of_birth: user?.date_of_birth,
                photo_url: user?.photo_url,
            };

            Logger.info('Login successful', methodContext, user.id);
            res.json({
                token,
                user: userResponse,
            });
        } catch (error) {
            Logger.error(
                'Exception occurred during googleSignIn',
                methodContext,
                error,
            );
            this.handleAuthError(error, res);
        }
    };

    public appleSignIn = async (req: Request, res: Response): Promise<void> => {
        const methodContext = this.context + ' - appleSignIn';
        try {
            Logger.info('Starting appleSignIn', methodContext, req.body);
            const { code, familyName, givenName } = req.body;

            if (!code) {
                Logger.error('Missing code', methodContext, code);
                res.status(400).json({
                    error: 'Validation failed',
                    code: 'missing_code',
                    message: 'Code is required',
                });
                return;
            }

            Logger.info('Verifying Apple token', methodContext, code);
            const appleTokens = await this.appleService.getAppleTokens(code);

            if (!appleTokens) {
                Logger.error('Invalid Apple token', methodContext, code);
                res.status(401).json({
                    error: 'Authentication failed',
                    code: 'invalid_apple_token',
                    message: 'Invalid Apple token',
                });
                return;
            }
            const appleUser = this.appleService.decodeAppleIdToken(
                appleTokens.id_token,
            );
            if (!appleUser) {
                Logger.error('Invalid Apple user', methodContext, code);
                res.status(401).json({
                    error: 'Authentication failed',
                    code: 'invalid_apple_user',
                    message: 'Invalid Apple user',
                });
                return;
            }

            const input: IUserInput = {
                email: appleUser.email,
                apple_id: appleUser.appleId,
                first_name: appleUser.givenName ?? givenName,
                last_name: appleUser.familyName ?? familyName,
                platform: 'ios',
                refresh_token: appleTokens.refresh_token,
                onboarding_step: OnboardingStep.COMPLETED,
            };

            // Find or create user in database
            Logger.info(
                'Finding or creating user',
                methodContext,
                appleUser.email,
            );
            const user = await this.userService.findOrCreateUser(input);
            Logger.info(
                'AuthController ::: appleSignIn ::: User record processed',
                user.id,
            );

            // Generate response with JWT and user data
            Logger.info('Generating token', methodContext, user.id);
            const response = generateTokenResponse(user);

            const userResponse: IUser = {
                id: user?.id,
                email: user?.email,
                first_name: user?.first_name,
                last_name: user?.last_name,
                language: user.language,
                is_host: user.is_host,
                onboarding_step: user?.onboarding_step,
                date_of_birth: user?.date_of_birth,
                photo_url: user?.photo_url,
            };

            Logger.info('Login successful', methodContext, user.id);
            res.json({
                token: response,
                user: userResponse,
            });
        } catch (error) {
            Logger.error(
                'Exception occurred during appleSignIn',
                methodContext,
                error,
            );
            this.handleAuthError(error, res);
        }
    };

    public refreshToken = async (
        req: Request,
        res: Response,
    ): Promise<void> => {
        const methodContext = this.context + ' - refreshToken';
        try {
            Logger.info('Starting refreshToken', methodContext, req.body);

            const userId = (req as any).user.userId;

            Logger.info('Finding user', methodContext, userId);
            const user = await this.userService.getUserMe(userId);

            if (!user) {
                Logger.error('User not found', methodContext, userId);
                res.status(404).json({
                    error: 'User not found',
                    message: 'Unable to refresh token for this user.',
                });
                return;
            }

            Logger.info('Generating new token', methodContext, userId);
            const response = generateTokenResponse(user);

            Logger.info('Token refreshed successfully', methodContext, userId);
            res.json({
                token: response,
                user: {
                    email: user.email,
                    firstName: user.first_name,
                    lastName: user.last_name,
                    language: user.language,
                    photoUrl: user.photo_url,
                },
            });
        } catch (error) {
            Logger.error(
                'Exception occurred during refreshToken',
                methodContext,
                error,
            );
            this.handleAuthError(error, res);
        }
    };

    public signout = async (req: Request, res: Response): Promise<void> => {
        const methodContext = this.context + ' - signout';
        try {
            Logger.info('Starting signout', methodContext, req.body);
            const userId = (req as any).user.userId;
            Logger.info('User ID from request', methodContext, userId);

            const user = await this.userService.getUserMe(userId);

            if (!user) {
                Logger.error('User not found', methodContext, userId);
                res.status(404).json({
                    error: 'User not found',
                    message: 'User not found',
                });
                return;
            }

            Logger.info('Signing out user', methodContext, userId);
            res.json({
                message: 'User signed out successfully',
            });
        } catch (error) {
            Logger.error('AuthController ::: signout ::: Exception occurred');
            this.handleAuthError(error, res);
        }
    };

    public forgotPassword = async (
        req: Request,
        res: Response,
    ): Promise<void> => {
        const methodContext = this.context + ' - forgotPassword';
        try {
            Logger.info('Starting', methodContext);
            const { email } = req.body;
            Logger.info('Request body', methodContext, email);

            const user = await this.userService.findUserByEmail(email);

            if (!user) {
                Logger.error('User not found', methodContext, email);
                res.status(404).json({
                    error: 'User not found',
                    message: 'User with this email does not exist',
                });
                return;
            }

            Logger.info('User found', methodContext, email);
            const code = await this.authService.createAndStoreOTP(email);

            Logger.info('Sending verification email', methodContext, email);
            await this.emailService.sendEmailVerificationCode(email, code);

            Logger.info('Verification code sent', methodContext, email);
            res.json({
                message: 'Verification code sent to email',
            });
        } catch (error) {
            Logger.error('Exception occurred', methodContext, error);
            this.handleAuthError(error, res);
        }
    };

    public verifyCode = async (req: Request, res: Response): Promise<void> => {
        const methodContext = this.context + ' - verifyCode';
        try {
            const { code, email } = req.body;
            Logger.info('Starting verifyCode', methodContext, req.body);

            const isValid = await this.authService.verifyOTP(email, code);

            if (!isValid) {
                Logger.error('Invalid verification code', methodContext, email);
                res.status(400).json({
                    error: 'Validation failed',
                    code: 'invalid_verification_code',
                    message: 'Invalid verification code',
                });
                return;
            }

            Logger.info('Verification code is valid', methodContext, email);
            Logger.info('Generating temporary token', methodContext, email);
            const token = generateTemporaryTokenResponse(email);
            Logger.info('Temporary token generated', methodContext, email);
            res.json({
                token: token,
            });
        } catch (error) {
            Logger.error('Exception occurred', methodContext, error);
            this.handleAuthError(error, res);
        }
    };

    public resetPassword = async (
        req: Request,
        res: Response,
    ): Promise<void> => {
        const methodContext = this.context + ' - resetPassword';
        try {
            Logger.info('Starting resetPassword', methodContext, req.body);
            const { token, password } = req.body;

            const decodedToken = validateTemporaryToken(token);
            if (decodedToken.purpose !== 'password_reset') {
                Logger.error(
                    'Invalid token purpose',
                    methodContext,
                    decodedToken.purpose,
                );
                res.status(400).json({
                    error: 'Validation failed',
                    message: 'Invalid token purpose',
                });
                return;
            }

            Logger.info(
                'Finding user by email',
                methodContext,
                decodedToken.email,
            );
            const user = await this.userService.findUserByEmail(
                decodedToken.email,
            );

            if (!user) {
                Logger.error(
                    'User not found',
                    methodContext,
                    decodedToken.email,
                );
                res.status(404).json({
                    error: 'User not found',
                    message: 'User with this email does not exist',
                });
                return;
            }

            Logger.info('User found', methodContext, decodedToken.email);
            const hashedPassword =
                await this.authService.hashPassword(password);

            Logger.info('Updating user password', methodContext, user.id);
            await this.userService.updateUserPassword(user.id, hashedPassword);

            Logger.info(
                'Password updated successfully',
                methodContext,
                user.id,
            );
            res.json({
                message: 'Password reset successfully',
            });
        } catch (error) {
            Logger.error(
                'Exception occurred during resetPassword',
                methodContext,
                error,
            );
            this.handleAuthError(error, res);
        }
    };
}

export default AuthController;
