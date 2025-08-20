import { Client } from '../database';
import bcrypt from 'bcrypt';
import Logger from '../utils/logger';
import { SignupUserDBInsert } from '../models/onboarding.model';
import { IUser } from '../models/user.model';
import { EmailService } from './email.service';

// Add this type for verification methods
type VerificationType = 'phone' | 'email';

// Define an interface for the verification parameters
type VerificationParams = {
    userId?: number;
    verificationType: VerificationType;
    contactValue: string;
    countryCode?: string;
};

class AuthService {
    private client: Client;
    private context: string;
    private emailService: EmailService;

    constructor() {
        this.context = 'AuthService';
        this.client = new Client();
        this.emailService = new EmailService();
        Logger.info('Initializing', this.context + ' - constructor');
    }

    public async hashPassword(password: string): Promise<string> {
        const methodContext = this.context + ' - hashPassword';
        try {
            Logger.info('Hashing password', methodContext);
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);
            Logger.info('Password hashed successfully', methodContext);
            return hashedPassword;
        } catch (error) {
            Logger.error('Error hashing password:', methodContext, error);
            throw error;
        }
    }

    public async validatePassword(
        password: string,
        hash: string,
    ): Promise<boolean> {
        const methodContext = this.context + ' - validatePassword';
        try {
            Logger.info('Validating password', methodContext);
            const result = await bcrypt.compare(password, hash);
            Logger.info('Password validation completed', methodContext, {
                result,
            });
            return result;
        } catch (error) {
            Logger.error('Error validating password:', methodContext, error);
            throw error;
        }
    }

    public async signupUser(input: SignupUserDBInsert): Promise<IUser> {
        const methodContext = this.context + ' - signupUser';
        try {
            Logger.info('Starting user signup process', methodContext, {
                email: input.email,
            });
            await this.client.beginTransaction();

            // Hash password
            Logger.info('Hashing password', methodContext);
            const hashedPassword = await this.hashPassword(input.password);

            // Insert user and return User
            Logger.info('Inserting user into database', methodContext);
            const response = await this.client.query(
                `INSERT INTO users (email, hash_password, first_name, last_name, date_of_birth, platform, onboarding_step)
                VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
                [
                    input.email.toLowerCase(),
                    hashedPassword,
                    input.first_name,
                    input.last_name,
                    input.date_of_birth,
                    input.platform,
                    input.onboardingStep,
                ],
            );
            await this.client.commit();
            Logger.info('User signup completed successfully', methodContext, {
                userId: response.rows[0].id,
            });
            return response.rows[0] as IUser;
        } catch (error) {
            Logger.error('Error signing up user:', methodContext, error);
            await this.client.rollback();
            throw error;
        } finally {
            await this.client.release(); // Always release connection
        }
    }

    public async createAndSendVerificationCode(
        params: VerificationParams,
    ): Promise<{ success: boolean; message: string }> {
        const { userId, verificationType, contactValue, countryCode } = params;
        const methodContext = this.context + ' - createAndSendVerificationCode';
        try {
            Logger.info('Processing verification code request', methodContext, {
                userId,
                verificationType,
                contactValue,
            });
            await this.client.beginTransaction();

            // Check rate limiting if userId is provided
            if (userId) {
                Logger.info('Checking rate limits', methodContext);
                const rateLimitCheck = await this.client.query(
                    `
                SELECT id, last_code_request, code_requests_count
                FROM contact_verifications
                WHERE user_id = $1 AND verification_type = $2 AND contact_value = $3
                FOR UPDATE
                `,
                    [userId, verificationType, contactValue],
                );

                if (rateLimitCheck.rows[0]) {
                    const { id, last_code_request, code_requests_count } =
                        rateLimitCheck.rows[0];

                    if (
                        last_code_request &&
                        new Date().getTime() -
                            new Date(last_code_request).getTime() <
                            60000
                    ) {
                        return {
                            success: false,
                            message:
                                'Please wait 1 minute before requesting another code',
                        };
                    }

                    if (
                        code_requests_count >= 5 &&
                        new Date().getTime() -
                            new Date(last_code_request).getTime() <
                            24 * 60 * 60 * 1000
                    ) {
                        return {
                            success: false,
                            message: 'Maximum daily code requests reached',
                        };
                    }

                    // Check for existing valid code
                    const existingCode = await this.client.query(
                        `
                    SELECT code
                    FROM verification_codes
                    WHERE contact_verification_id = $1 AND expires_at > CURRENT_TIMESTAMP
                    ORDER BY created_at DESC
                    LIMIT 1
                    `,
                        [id],
                    );

                    if (existingCode.rows.length > 0) {
                        // Update request count and timestamp
                        await this.client.query(
                            `
                        UPDATE contact_verifications
                        SET last_code_request = CURRENT_TIMESTAMP,
                            code_requests_count = CASE 
                                WHEN last_code_request < CURRENT_TIMESTAMP - INTERVAL '24 hours'
                                THEN 1
                                ELSE code_requests_count + 1
                            END,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = $1
                        `,
                            [id],
                        );

                        await this.client.commit();

                        // Resend the existing code
                        const code = existingCode.rows[0].code;
                        await this.sendVerificationCode(
                            verificationType,
                            contactValue,
                            code,
                            countryCode,
                        );

                        Logger.info(
                            'Existing verification code resent',
                            methodContext,
                            {
                                userId,
                                verificationType,
                                contactValue,
                                code,
                            },
                        );

                        return {
                            success: true,
                            message: 'Code resent successfully',
                        };
                    }
                }
            } else {
                // For non-user verifications, check based on contact value
                Logger.info(
                    'Checking rate limits for non-user verification',
                    methodContext,
                );
                const rateLimitCheck = await this.client.query(
                    `
                SELECT id, last_code_request, code_requests_count
                FROM contact_verifications
                WHERE user_id IS NULL AND verification_type = $1 AND contact_value = $2
                FOR UPDATE
                `,
                    [verificationType, contactValue],
                );

                if (rateLimitCheck.rows[0]) {
                    const { id, last_code_request, code_requests_count } =
                        rateLimitCheck.rows[0];

                    if (
                        last_code_request &&
                        new Date().getTime() -
                            new Date(last_code_request).getTime() <
                            60000
                    ) {
                        return {
                            success: false,
                            message:
                                'Please wait 1 minute before requesting another code',
                        };
                    }

                    if (
                        code_requests_count >= 5 &&
                        new Date().getTime() -
                            new Date(last_code_request).getTime() <
                            24 * 60 * 60 * 1000
                    ) {
                        return {
                            success: false,
                            message: 'Maximum daily code requests reached',
                        };
                    }

                    // Check for existing valid code
                    const existingCode = await this.client.query(
                        `
                    SELECT code
                    FROM verification_codes
                    WHERE contact_verification_id = $1 AND expires_at > CURRENT_TIMESTAMP
                    ORDER BY created_at DESC
                    LIMIT 1
                    `,
                        [id],
                    );

                    if (existingCode.rows.length > 0) {
                        // Update request count and timestamp
                        await this.client.query(
                            `
                        UPDATE contact_verifications
                        SET last_code_request = CURRENT_TIMESTAMP,
                            code_requests_count = CASE 
                                WHEN last_code_request < CURRENT_TIMESTAMP - INTERVAL '24 hours'
                                THEN 1
                                ELSE code_requests_count + 1
                            END,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = $1
                        `,
                            [id],
                        );

                        await this.client.commit();

                        // Resend the existing code
                        const code = existingCode.rows[0].code;
                        await this.sendVerificationCode(
                            verificationType,
                            contactValue,
                            code,
                            countryCode,
                        );

                        Logger.info(
                            'Existing verification code resent',
                            methodContext,
                            {
                                verificationType,
                                contactValue,
                                code,
                            },
                        );

                        return {
                            success: true,
                            message: 'Code resent successfully',
                        };
                    }
                }
            }

            // Insert or update contact verification record
            Logger.info('Storing verification record', methodContext);
            const contactVerification = await this.client.query(
                `
            INSERT INTO contact_verifications (
                user_id, 
                verification_type, 
                contact_value, 
                country_code
            )
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (user_id, verification_type, contact_value) 
            DO UPDATE SET 
                updated_at = CURRENT_TIMESTAMP,
                last_code_request = CURRENT_TIMESTAMP,
                code_requests_count = CASE 
                    WHEN contact_verifications.last_code_request < CURRENT_TIMESTAMP - INTERVAL '24 hours'
                    THEN 1
                    ELSE contact_verifications.code_requests_count + 1
                END
            RETURNING id
            `,
                [
                    userId || null,
                    verificationType,
                    contactValue,
                    countryCode || null,
                ],
            );

            // Generate and store verification code
            Logger.info('Generating verification code', methodContext);
            const code = Math.floor(1000 + Math.random() * 9000).toString();
            await this.client.query(
                `
            INSERT INTO verification_codes (
                contact_verification_id,
                code,
                expires_at
            ) VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '1 year')
            `,
                [contactVerification.rows[0].id, code],
            );

            await this.client.commit();

            // Send verification code
            await this.sendVerificationCode(
                verificationType,
                contactValue,
                code,
                countryCode,
            );

            Logger.info('Verification code sent successfully', methodContext, {
                userId,
                verificationType,
                contactValue,
                code,
            });
            return { success: true, message: 'Code sent successfully' };
        } catch (error) {
            await this.client.rollback();
            Logger.error(
                'Error creating verification code:',
                methodContext,
                error,
            );
            throw error;
        } finally {
            await this.client.release(); // Always release connection
        }
    }

    public async verifyCode(params: {
        userId?: number;
        verificationType: VerificationType;
        contactValue: string;
        code: string;
        countryCode?: string;
        mockCode?: boolean;
    }): Promise<{
        success: boolean;
        message: string;
        code?: string;
        userId?: number;
    }> {
        const { userId, verificationType, contactValue, code, mockCode } =
            params;
        const methodContext = this.context + ' - verifyCode';
        try {
            Logger.info('Verifying code', methodContext, {
                userId,
                verificationType,
                contactValue,
            });
            await this.client.beginTransaction();

            // If mockCode is true, skip the actual verification process
            // TODO(krupikivan): Remove this when twilio is integrated
            if (mockCode) {
                Logger.info('Mock code verification', methodContext, {
                    userId,
                    verificationType,
                    contactValue,
                    code,
                });
                // await this.client.commit();
                const queryForMock = `
                    SELECT id, user_id
                    FROM contact_verifications
                    WHERE user_id = $1 AND verification_type = $2 AND contact_value = $3
                    ORDER BY created_at DESC
                    LIMIT 1
                `;
                const paramsForMock = [userId, verificationType, contactValue];
                const resultForMock = await this.client.query(
                    queryForMock,
                    paramsForMock,
                );
                if (resultForMock.rows.length > 0) {
                    const contactVerificationId = resultForMock.rows[0].id;
                    await this.client.query(
                        `
                        UPDATE contact_verifications
                        SET is_verified = TRUE, updated_at = CURRENT_TIMESTAMP
                        WHERE id = $1
                    `,
                        [contactVerificationId],
                    );
                }
                await this.client.query(
                    `
                    UPDATE users
                    SET onboarding_step = 
                        CASE 
                            WHEN onboarding_step = $1::onboarding_step
                            THEN $2::onboarding_step
                            ELSE onboarding_step
                        END
                    WHERE id = $3
                    `,
                    [
                        verificationType + '_verification',
                        'photo_upload',
                        userId,
                    ],
                );
                Logger.info('Mock code verified successfully', methodContext, {
                    userId,
                    verificationType,
                    contactValue,
                    code,
                });
                await this.client.commit();
                return {
                    success: true,
                    message: 'Mock code verified successfully',
                    userId,
                };
            }

            // First, find the verification code record without updating it yet
            let findCodeQuery;
            let findCodeParams;

            if (userId) {
                findCodeQuery = `
                    SELECT vc.id, vc.attempts, vc.is_used, vc.expires_at, cv.id as contact_verification_id, cv.user_id
                    FROM verification_codes vc
                    JOIN contact_verifications cv ON cv.id = vc.contact_verification_id
                    WHERE cv.user_id = $1
                    AND cv.verification_type = $2
                    AND cv.contact_value = $3
                    AND vc.code = $4
                    ORDER BY vc.created_at DESC
                    LIMIT 1
                `;
                findCodeParams = [userId, verificationType, contactValue, code];
            } else {
                findCodeQuery = `
                    SELECT vc.id, vc.attempts, vc.is_used, vc.expires_at, cv.id as contact_verification_id, cv.user_id
                    FROM verification_codes vc
                    JOIN contact_verifications cv ON cv.id = vc.contact_verification_id
                    WHERE cv.verification_type = $1
                    AND cv.contact_value = $2
                    AND vc.code = $3
                    ORDER BY vc.created_at DESC
                    LIMIT 1
                `;
                findCodeParams = [verificationType, contactValue, code];
            }

            const codeResult = await this.client.query(
                findCodeQuery,
                findCodeParams,
            );

            // If no matching code was found, we need to increment attempts for the most recent code
            if (codeResult.rows.length === 0) {
                // Find the most recent verification code for this contact, regardless of the code value
                let findLatestCodeQuery;
                let findLatestCodeParams;

                if (userId) {
                    findLatestCodeQuery = `
                        SELECT vc.id, vc.attempts
                        FROM verification_codes vc
                        JOIN contact_verifications cv ON cv.id = vc.contact_verification_id
                        WHERE cv.user_id = $1
                        AND cv.verification_type = $2
                        AND cv.contact_value = $3
                        ORDER BY vc.created_at DESC
                        LIMIT 1
                    `;
                    findLatestCodeParams = [
                        userId,
                        verificationType,
                        contactValue,
                    ];
                } else {
                    findLatestCodeQuery = `
                        SELECT vc.id, vc.attempts
                        FROM verification_codes vc
                        JOIN contact_verifications cv ON cv.id = vc.contact_verification_id
                        WHERE cv.verification_type = $1
                        AND cv.contact_value = $2
                        ORDER BY vc.created_at DESC
                        LIMIT 1
                    `;
                    findLatestCodeParams = [verificationType, contactValue];
                }

                const latestCodeResult = await this.client.query(
                    findLatestCodeQuery,
                    findLatestCodeParams,
                );

                if (latestCodeResult.rows.length > 0) {
                    // Increment attempts for the most recent code
                    const codeId = latestCodeResult.rows[0].id;
                    await this.client.query(
                        `
                        UPDATE verification_codes
                        SET attempts = attempts + 1
                        WHERE id = $1
                        `,
                        [codeId],
                    );

                    // Check if max attempts reached
                    // const currentAttempts =
                    //     latestCodeResult.rows[0].attempts + 1;
                    // if (currentAttempts >= 3) {
                    //     await this.client.commit();
                    //     Logger.warn(
                    //         'Maximum verification attempts reached',
                    //         methodContext,
                    //         {
                    //             userId,
                    //             verificationType,
                    //             contactValue,
                    //             attempts: currentAttempts,
                    //         },
                    //     );
                    //     return {
                    //         success: false,
                    //         code: 'max_attempts',
                    //         message:
                    //             'Maximum verification attempts reached. Please request a new code.',
                    //     };
                    // }
                }

                await this.client.commit();
                Logger.error('Invalid or expired code', methodContext, {
                    userId,
                    verificationType,
                    contactValue,
                });
                return {
                    success: false,
                    code: 'invalid_code',
                    message: 'Invalid or expired code',
                };
            }

            // We found a matching code, now process it
            const verificationCode = codeResult.rows[0];

            // Check if the code is already used
            if (verificationCode.is_used) {
                await this.client.commit();
                return {
                    success: false,
                    code: 'code_already_used',
                    message: 'This verification code has already been used',
                };
            }

            // Check if code is expired
            if (new Date(verificationCode.expires_at) < new Date()) {
                // Increment attempts, but we already know it's expired
                await this.client.query(
                    `
                    UPDATE verification_codes
                    SET attempts = attempts + 1
                    WHERE id = $1
                    `,
                    [verificationCode.id],
                );

                await this.client.commit();
                return {
                    success: false,
                    code: 'expired_code',
                    message:
                        'Verification code has expired. Please request a new code.',
                };
            }

            // Check attempts when the code is valid
            // if (verificationCode.attempts >= 2) {
            //     // This will be the 3rd attempt
            //     // Increment attempts for the last time
            //     await this.client.query(
            //         `
            //         UPDATE verification_codes
            //         SET attempts = attempts + 1
            //         WHERE id = $1
            //         `,
            //         [verificationCode.id],
            //     );

            //     await this.client.commit();
            //     return {
            //         success: false,
            //         code: 'max_attempts',
            //         message:
            //             'Maximum verification attempts reached. Please request a new code.',
            //     };
            // }

            // Code is valid - increment attempts, mark as used, and update verification status
            await this.client.query(
                `
                UPDATE verification_codes
                SET attempts = attempts + 1, is_used = TRUE
                WHERE id = $1
                `,
                [verificationCode.id],
            );

            await this.client.query(
                `
                UPDATE contact_verifications
                SET is_verified = TRUE, updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
                `,
                [verificationCode.contact_verification_id],
            );

            // Get the user ID from the result (useful for non-user verifications that are later associated with a user)
            const verifiedUserId = verificationCode.user_id;

            // Update user's onboarding step if needed and if userId exists
            if (verifiedUserId) {
                Logger.info('Updating user onboarding step', methodContext);

                // Determine next onboarding step based on verification type
                let nextStep = '';
                if (verificationType === 'phone') {
                    nextStep = 'photo_upload';
                } else if (verificationType === 'email') {
                    nextStep = 'phone_verification';
                }

                if (nextStep) {
                    await this.client.query(
                        `
                        UPDATE users
                        SET onboarding_step = 
                            CASE 
                                WHEN onboarding_step = $1::onboarding_step
                                THEN $2::onboarding_step
                                ELSE onboarding_step
                            END
                        WHERE id = $3
                        `,
                        [
                            verificationType + '_verification',
                            nextStep,
                            verifiedUserId,
                        ],
                    );
                }
            }

            await this.client.commit();
            Logger.info('Contact verified successfully', methodContext, {
                userId: verifiedUserId,
                verificationType,
                contactValue,
            });
            return {
                success: true,
                message: `${verificationType === 'phone' ? 'Phone number' : 'Email'} verified successfully`,
                userId: verifiedUserId,
            };
        } catch (error: any) {
            Logger.error('Error verifying code:', methodContext, error);
            await this.client.rollback();
            return {
                success: false,
                code: 'verification_error',
                message: error?.message || 'Error verifying code',
            };
        } finally {
            await this.client.release(); // Always release connection
        }
    }

    async isContactVerified(params: {
        userId?: number;
        verificationType: VerificationType;
        contactValue: string;
    }): Promise<boolean> {
        const { userId, verificationType, contactValue } = params;
        const methodContext = this.context + ' - isContactVerified';
        try {
            Logger.info(
                `Checking if ${verificationType} is verified`,
                methodContext,
                {
                    userId,
                    verificationType,
                    contactValue,
                },
            );

            let query;
            let queryParams;

            if (userId) {
                query = `
                    SELECT is_verified
                    FROM contact_verifications
                    WHERE user_id = $1 AND verification_type = $2 AND contact_value = $3
                `;
                queryParams = [userId, verificationType, contactValue];
            } else {
                query = `
                    SELECT is_verified
                    FROM contact_verifications
                    WHERE verification_type = $1 AND contact_value = $2 AND user_id IS NULL
                `;
                queryParams = [verificationType, contactValue];
            }

            const result = await this.client.query(query, queryParams);

            const isVerified = result.rows[0]?.is_verified || false;
            Logger.info(
                `${verificationType} verification check completed`,
                methodContext,
                {
                    userId,
                    verificationType,
                    contactValue,
                    isVerified,
                },
            );
            return isVerified;
        } finally {
            await this.client.release(); // Always release connection
        }
    }

    // Legacy method for backward compatibility
    async isPhoneVerified(
        userId: number,
        phoneNumber: string,
    ): Promise<boolean> {
        return this.isContactVerified({
            userId,
            verificationType: 'phone',
            contactValue: phoneNumber,
        });
    }

    // New method for email verification
    async isEmailVerified(userId: number, email: string): Promise<boolean> {
        return this.isContactVerified({
            userId,
            verificationType: 'email',
            contactValue: email,
        });
    }

    // New method for checking verification without userId
    async isContactVerifiedByValue(
        verificationType: VerificationType,
        contactValue: string,
    ): Promise<boolean> {
        return this.isContactVerified({
            verificationType,
            contactValue,
        });
    }

    public async completeOnboardingStep(
        userId: number,
        step: string,
    ): Promise<void> {
        const methodContext = this.context + ' - completeOnboardingStep';
        try {
            Logger.info('Updating onboarding step', methodContext, {
                userId,
                step,
            });
            await this.client.query(
                `
                UPDATE users
                SET onboarding_step = $1
                WHERE id = $2
                `,
                [step, userId],
            );
            Logger.info('Onboarding step updated successfully', methodContext, {
                userId,
                step,
            });
        } finally {
            await this.client.release(); // Always release connection
        }
    }

    // The following methods can remain unchanged as they don't interact with the verification tables
    public async createAndStoreOTP(email: number): Promise<string> {
        const methodContext = this.context + ' - createAndStoreOTP';
        try {
            Logger.info('Creating OTP', methodContext, email);
            await this.client.beginTransaction();

            Logger.info('Deleting existing OTPs', methodContext);
            await this.client.query('DELETE FROM otp WHERE email = $1', [
                email,
            ]);

            Logger.info('Generating new OTP code', methodContext);
            const code = Math.floor(1000 + Math.random() * 9000).toString();

            Logger.info('Storing OTP in database', methodContext);
            await this.client.query(
                `INSERT INTO otp (email, otp_code) 
                 VALUES ($1, $2)`,
                [email, code],
            );

            await this.client.commit();
            Logger.info('OTP created successfully', methodContext, { email });
            return code;
        } catch (error) {
            await this.client.rollback();
            Logger.error('Error creating OTP:', methodContext, error);
            throw error;
        } finally {
            await this.client.release(); // Always release connection
        }
    }

    public async verifyOTP(email: number, otp: string): Promise<boolean> {
        const methodContext = this.context + ' - verifyOTP';
        try {
            Logger.info('Verifying OTP', methodContext, email);
            const result = await this.client.query(
                `SELECT * FROM otp WHERE email = $1 AND otp_code = $2`,
                [email, otp],
            );
            if (result.rows.length === 0) {
                Logger.info('OTP not found', methodContext, email);
                return false;
            }
            const otpRecord = result.rows[0];
            if (new Date().getTime() > otpRecord.expires_at.getTime()) {
                Logger.info('OTP expired', methodContext, {
                    email,
                    otpId: otpRecord.id,
                });
                return false;
            }

            Logger.info('Deleting used OTP', methodContext, {
                email,
                otpId: otpRecord.id,
            });
            await this.client.query(`DELETE FROM otp WHERE id = $1`, [
                otpRecord.id,
            ]);

            Logger.info('OTP verified successfully', methodContext, { email });
            return true;
        } catch (error) {
            Logger.error('Error verifying OTP:', methodContext, error);
            return false;
        } finally {
            await this.client.release(); // Always release connection
        }
    }

    private async sendVerificationCode(
        verificationType: string,
        contactValue: string,
        code: string,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        countryCode?: string | null,
    ): Promise<void> {
        if (verificationType === 'phone') {
            // Send SMS with code (implement your SMS service here)
            // await this.smsService.sendSMS(countryCode + contactValue, `Your verification code is: ${code}`);
            Logger.info(
                'SMS verification code would be sent here',
                this.context + ' - sendVerificationCode',
            );
        } else if (verificationType === 'email') {
            Logger.info(
                'Sending email verification code',
                this.context + ' - sendVerificationCode',
            );
            const emailService = new EmailService();
            // Use either the specific contact value (which would be the email) or the provided email parameter
            const emailToUse = contactValue;
            await emailService.sendEmailVerificationCode(emailToUse, code);
        }
    }
}

export default AuthService;
