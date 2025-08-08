import nodemailer from 'nodemailer';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import Logger from '../utils/logger';

class EmailService {
    private transporter: nodemailer.Transporter;
    private oauth2Client: OAuth2Client;
    private context: string;
    constructor() {
        this.context = 'ConfigService';
        Logger.info('Initializing', this.context + ' - constructor');

        try {
            this.oauth2Client = new google.auth.OAuth2(
                process.env.GOOGLE_CLIENT_ID,
                process.env.GOOGLE_CLIENT_SECRET,
                'https://developers.google.com/oauthplayground',
            );

            Logger.info('OAuth2Client created successfully', this.context);

            // Uncommented credentials setup for future use
            // this.oauth2Client.setCredentials({
            //     refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
            // });
        } catch (error: any) {
            Logger.error(
                'Failed to initialize OAuth2Client',
                this.context,
                error.message,
            );
            throw error;
        }
    }

    public createTransporter = async (): Promise<void> => {
        const methodContext = this.context + ' - createTransporter';
        try {
            Logger.info('Creating email transporter', methodContext);

            this.transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.GOOGLE_EMAIL_PASSWORD,
                },
            }) as nodemailer.Transporter;

            Logger.info('Transporter created successfully', methodContext);
        } catch (error: any) {
            Logger.error(
                'Error creating transporter',
                methodContext,
                error.message,
            );
            throw error;
        }
    };

    public sendEmailVerificationCode = async (
        email: string,
        code: string,
    ): Promise<boolean> => {
        const methodContext = this.context + ' - sendEmailVerificationCode';
        try {
            Logger.info('Sending verification code', methodContext, email);

            Logger.info('Creating transporter', methodContext);
            await this.createTransporter();

            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: email,
                subject: 'SubletMe Verification Code',
                text: 'Your verification code is: ' + code,
            };

            Logger.info('Prepared email content', methodContext, email);

            const info = await this.transporter.sendMail(mailOptions);

            Logger.info('Email sent successfully', methodContext, {
                email,
                messageId: info.messageId,
            });
            return true;
        } catch (error: any) {
            Logger.error('Error sending email', methodContext, {
                email,
                error: error.message,
            });
            throw error;
        }
    };
}

export { EmailService };
