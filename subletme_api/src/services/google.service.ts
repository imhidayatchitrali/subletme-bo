import { OAuth2Client } from 'google-auth-library';
import { GoogleUser } from '../models/google.model';
import Logger from '../utils/logger';

export default class GoogleService {
    constructor() {
        Logger.info('GoogleService ::: constructor ::: Initialized');
    }

    public verifyGoogleToken = async (token: string): Promise<GoogleUser> => {
        try {
            Logger.info(
                'GoogleService ::: verifyGoogleToken ::: Starting verification',
            );

            if (!token) {
                Logger.error(
                    'GoogleService ::: verifyGoogleToken ::: No token provided',
                );
                throw new Error('No token provided');
            }

            Logger.info(
                'GoogleService ::: verifyGoogleToken ::: Creating OAuth2Client',
            );
            const client = new OAuth2Client();

            Logger.info(
                'GoogleService ::: verifyGoogleToken ::: Verifying ID token',
            );
            const ticket = await client.verifyIdToken({
                idToken: token,
                audience: process.env.GOOGLE_CLIENT_ID_SIGN_IN,
            });

            Logger.info(
                'GoogleService ::: verifyGoogleToken ::: Getting payload',
            );
            const payload = ticket.getPayload();
            if (!payload) {
                Logger.error(
                    'GoogleService ::: verifyGoogleToken ::: No payload found in token',
                );
                throw new Error('No payload found in token');
            }

            if (!payload.email) {
                Logger.error(
                    'GoogleService ::: verifyGoogleToken ::: No email found in token',
                );
                throw new Error('No email found in token');
            }

            Logger.info(
                'GoogleService ::: verifyGoogleToken ::: Token verified successfully',
                payload.email,
            );

            return {
                googleId: payload.sub,
                email: payload.email,
                givenName: payload.given_name,
                familyName: payload.family_name,
            };
        } catch (error: any) {
            Logger.error(
                'GoogleService ::: verifyGoogleToken ::: Token verification failed',
                error.message,
            );
            throw new Error('Invalid token');
        }
    };
}
