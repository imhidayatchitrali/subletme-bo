import * as admin from 'firebase-admin';
import { NotificationPayload } from '../models/notification.model';
import Logger from '../utils/logger';
import dotenv from 'dotenv';
dotenv.config();

class NotificationService {
    private context: string;

    constructor() {
        this.context = 'NotificationService';
        Logger.info('Initializing', this.context + ' - constructor');

        // Check if is initialized
        if (admin.apps.length === 0) {
            Logger.info(
                'Firebase admin not initialized, initializing now',
                this.context,
            );

            try {

                if (!admin.apps.length) {
                    admin.initializeApp({
                        credential: admin.credential.cert({
                            projectId: process.env.FIREBASE_PROJECT_ID,
                            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
                        }),
                    });
                }

                Logger.info(
                    'Firebase admin initialized successfully',
                    this.context,
                );
            } catch (error: any) {
                Logger.error(
                    'Firebase initialization error',
                    this.context,
                    error.message,
                );
                throw error;
            }
        } else {
            Logger.info('Firebase admin already initialized', this.context);
        }
    }

    public async sendToUser(
        tokens: string[],
        payload: NotificationPayload,
    ): Promise<admin.messaging.BatchResponse> {
        const methodContext = this.context + ' - sendToUser';
        try {
            Logger.info('Sending notification', methodContext, {
                tokensCount: tokens.length,
                title: payload.title,
            });

            // Create the notification message
            const messages: admin.messaging.MulticastMessage = {
                tokens: tokens,
                notification: {
                    title: payload.title,
                    body: payload.body,
                    imageUrl: payload.imageUrl,
                },
                data: payload.data,
                android: {
                    priority: 'high',
                },
                apns: {
                    headers: {
                        'apns-priority': '10',
                    },
                },
            };

            Logger.info(
                'Notification message created, sending now',
                methodContext,
            );

            // Send the notification
            const response = await admin
                .messaging()
                .sendEachForMulticast(messages);

            Logger.info('Notification sent', methodContext, {
                success: response.successCount,
                failure: response.failureCount,
            });

            // Clean up failed tokens
            if (response.failureCount > 0) {
                const failedTokens: string[] = [];

                response.responses.forEach((resp, idx) => {
                    if (!resp.success) {
                        failedTokens.push(tokens[idx] as string);
                        Logger.error('Token failed', methodContext, {
                            token: tokens[idx],
                            response: resp.error?.message,
                        });
                    }
                });

                Logger.info(
                    'Failed tokens count',
                    methodContext,
                    failedTokens.length,
                );
                //TODO: For each failed token, find and remove it
            }

            return response;
        } catch (error: any) {
            Logger.error(
                'Error sending notification',
                methodContext,
                error.message,
            );
            throw error;
        }
    }
}

export default NotificationService;
