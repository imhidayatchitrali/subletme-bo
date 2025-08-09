
import { Request, Response } from 'express';
import {
    SignupUserDBInsert,
    PersonalInfoDTO,
    OnboardingStep,
} from '../models/onboarding.model';
import AuthService from '../services/auth.service';
import UserService from '../services/user.service';
import { convertToDBObject } from '../helpers/user.helper';
import { generateTokenResponse } from '../helpers/auth.helper';
import Logger from '../utils/logger';
import {
    checkForFileAndReturn,
    uploadPhotoToMinio,
} from '../helpers/minio.helper';

class OnboardingController {
    private authService: AuthService;
    private userService: UserService;
    private context: string;

    constructor() {
        this.context = 'OnboardingController';
        this.userService = new UserService();
        this.authService = new AuthService();
        Logger.info('Initializing', this.context + ' - constructor');
    }

    public submitPersonalInfo = async (req: Request, res: Response) => {
        const methodContext = this.context + ' - submitPersonalInfo';
        try {
            Logger.info('Starting process', methodContext);

            const input: PersonalInfoDTO = req.body;

            // Redact password for logging
            const inputLog = { ...input };
            if (inputLog.password) {
                inputLog.password = '********';
            }
            Logger.info('Received data', methodContext, inputLog);

            // Validate every field
            if (!input.email || !input.password) {
                Logger.error('Missing email or password', methodContext);
                return res
                    .status(400)
                    .json({ message: 'Email and password are required' });
            }
            if (!input.first_name || !input.last_name) {
                Logger.error('Missing first or last name', methodContext);
                return res
                    .status(400)
                    .json({ message: 'First name and last name are required' });
            }
            if (!input.date_of_birth) {
                Logger.error('Missing date of birth', methodContext);
                return res
                    .status(400)
                    .json({ message: 'Date of birth is required' });
            }

            // Validate Email not existing
            Logger.info('Checking if email exists', methodContext, {
                email: input.email,
            });
            const userExist = await this.userService.findUserByEmail(
                input.email,
            );
            if (userExist) {
                Logger.error('Email already exists', methodContext, {
                    email: input.email,
                });
                return res.status(400).json({
                    message: 'Email already exists',
                    code: 'email_already_exists',
                });
            }

            Logger.info('Validating date of birth', methodContext, {
                date: input.date_of_birth,
            });
            const dobValidated = convertToDBObject(input.date_of_birth);
            if (!dobValidated) {
                Logger.error('Invalid date of birth', methodContext, {
                    date: input.date_of_birth,
                });
                return res
                    .status(400)
                    .json({ message: 'Invalid date of birth' });
            }

            const inputToSave = {
                ...input,
                date_of_birth: dobValidated,
                onboardingStep: OnboardingStep.PHONE_VERIFICATION,
            } as SignupUserDBInsert;

            // Signup user
            Logger.info('Creating new user', methodContext, {
                email: input.email,
            });
            const user = await this.authService.signupUser(inputToSave);
            Logger.info('User created successfully', methodContext, {
                userId: user.id,
            });

            const token = generateTokenResponse(user);
            Logger.info('Token generated for user', methodContext, {
                userId: user.id,
            });

            return res.status(201).json({
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    first_name: user.first_name,
                    last_name: user.last_name,
                    language: user.language,
                    date_of_birth: user.date_of_birth,
                    onboarding_step: user.onboarding_step,
                },
            });
        } catch (error: any) {
            Logger.error(error.message || 'Error', methodContext);
            return res.status(500).json({ message: 'Internal server error' });
        }
    };

    public sendValidationCode = async (req: Request, res: Response) => {
        const methodContext = this.context + ' - sendValidationCode';
        try {
            Logger.info('Starting process', methodContext);

            const { dialCode, phoneNumber } = req.body;
            Logger.info('Sending code', methodContext, {
                dialCode,
                phoneNumber,
            });

            const userId = (req as any).token.userId;
            Logger.info('User ID', methodContext, { userId });

            await this.authService.createAndSendVerificationCode({
                userId,
                countryCode: dialCode,
                contactValue: phoneNumber,
                verificationType: 'phone',
            });

            Logger.info('Code sent successfully', methodContext, { userId });
            return res.status(200).json({ message: 'Validation code sent' });
        } catch (error: any) {
            Logger.error(error.message || 'Error', methodContext);
            return res.status(500).json({ message: 'Internal server error' });
        }
    };

    public verifyCode = async (req: Request, res: Response) => {
        const methodContext = this.context + ' - verifyCode';
        try {
            Logger.info('Starting process', methodContext);

            const { dialCode, phoneNumber, code } = req.body;

            Logger.info('Verifying code', methodContext, {
                dialCode,
                phoneNumber,
                code,
            });

            const userId = (req as any).token.userId;
            Logger.info('User ID', methodContext, { userId });

            if (!userId) {
                Logger.error('Missing user ID in token', methodContext);
                return res.status(401).json({ message: 'Unauthorized' });
            }
            // Until we get Twilio to work we are skiping the code verification and use a mock code
            // TODO(krupikivan): Remove this when twilio is integrated
            const mockCode = true;
            if (mockCode === true && code !== '000222444666') {
                Logger.error('Invalid code', methodContext, { code });
                return res.status(400).json({
                    message: 'Invalid code',
                    code: 'invalid_code',
                });
            }
            const result = await this.authService.verifyCode({
                userId: userId,
                verificationType: 'phone',
                countryCode: dialCode,
                contactValue: phoneNumber,
                code: code,
                mockCode: mockCode,
            });

            if (!result.success) {
                Logger.error('Verification failed', methodContext, result);
                return res.status(400).json({
                    code: result.code,
                    message: result.message,
                });
            }

            Logger.info('Verification successful', methodContext, { userId });
            return res
                .status(200)
                .json({ message: 'Phone number verified successfully' });
        } catch (error: any) {
            Logger.error(error.message || 'Error', methodContext);
            return res.status(500).json({ message: 'Internal server error' });
        }
    };

    public uploadPhotos = async (req: Request, res: Response) => {
        const methodContext = this.context + ' - uploadPhotos';
        try {
            Logger.info('Starting process', methodContext);

            const userId = (req as any).token.userId;
            Logger.info('Processing photos for user', methodContext, {
                userId,
            });

            const files = req.files as Express.Multer.File[];

            if (!files || files.length === 0) {
                Logger.error('No images provided', methodContext, { userId });
                return res.status(400).json({
                    message:
                        'No images provided. Please upload at least one image.',
                });
            }

            // Process each file
            const photoResults = [];
            let isFirstPhoto = true;

            for (const file of files) {
                // Process file
                const fileData = checkForFileAndReturn(file);

                if (!fileData) {
                    Logger.error('Invalid image format', methodContext, {
                        userId,
                    });
                    continue; // Skip this file and process the next one
                }

                // Check file size
                const maxSize = 5 * 1024 * 1024; // 5MB
                if (fileData.buffer.length > maxSize) {
                    Logger.error('Image too large', methodContext, {
                        userId,
                        fileSize: fileData.buffer.length,
                    });
                    continue; // Skip this file and process the next one
                }

                // Generate unique file paths for each photo
                const timestamp = Date.now().toString();
                const filePath = `users/${userId}`;
                const fileName = `photo_${timestamp}.${fileData.type}`;

                Logger.info('Uploading to path', methodContext, {
                    filePath,
                    fileName,
                });

                // Upload to Minio
                const url = await uploadPhotoToMinio(
                    fileData.buffer,
                    filePath,
                    fileName,
                );

                Logger.info('Upload successful', methodContext, { url });

                // Save photo URL to database
                const photoId = await this.userService.saveUserPhoto(
                    userId,
                    url,
                    isFirstPhoto, // Set as profile if it's the first photo
                );

                photoResults.push({
                    id: photoId,
                    url: url,
                    isProfile: isFirstPhoto,
                });

                // Only the first photo should be set as profile
                if (isFirstPhoto) {
                    isFirstPhoto = false;
                }
            }

            Logger.info('Completing onboarding', methodContext, {
                userId,
                uploadedPhotos: photoResults.length,
            });
            await this.authService.completeOnboardingStep(
                userId,
                OnboardingStep.COMPLETED,
            );

            Logger.info('Process completed successfully', methodContext, {
                userId,
            });
            return res
                .status(200)
                .json({ message: 'Photos uploaded successfully' });
        } catch (error: any) {
            Logger.error(error.message || 'Error', methodContext);
            return res.status(500).json({ message: 'Internal server error' });
        }
    };

    public sendEmailValidationCode = async (req: Request, res: Response) => {
        const methodContext = this.context + ' - sendEmailValidationCode';
        try {
            Logger.info('Starting process', methodContext);

            const { email } = req.body;
            Logger.info('Sending email validation code', methodContext, {
                email,
            });

            await this.authService.createAndSendVerificationCode({
                verificationType: 'email',
                contactValue: email,
            });

            Logger.info('Code sent successfully', methodContext, { email });
            return res.status(200).json({ message: 'Validation code sent' });
        } catch (error: any) {
            Logger.error(error.message || 'Error', methodContext);
            return res.status(500).json({ message: 'Internal server error' });
        }
    };

    public verifyEmailCode = async (req: Request, res: Response) => {
        const methodContext = this.context + ' - verifyEmailCode';
        try {
            Logger.info('Starting process', methodContext);

            const { email, code } = req.body;
            Logger.info('Verifying email code', methodContext, {
                email,
                code,
            });

            const result = await this.authService.verifyCode({
                verificationType: 'email',
                contactValue: email,
                code: code,
            });

            if (!result.success) {
                Logger.error('Verification failed', methodContext, result);
                return res.status(400).json({
                    code: result.code,
                    message: result.message,
                });
            }

            Logger.info('Verification successful', methodContext, { email });
            return res
                .status(200)
                .json({ message: 'Email verified successfully' });
        } catch (error: any) {
            Logger.error(error.message || 'Error', methodContext);
            return res.status(500).json({ message: 'Internal server error' });
        }
    };
}

export default OnboardingController;
