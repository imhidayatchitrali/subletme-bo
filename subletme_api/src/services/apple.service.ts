import jwt from 'jsonwebtoken';
import axios from 'axios';
import { AppleTokens } from '../models/apple.model';

export default class AppleService {
    private generateClientSecret = async (): Promise<string> => {
        try {
            const payload = {
                iss: process.env.APPLE_TEAM_ID,
                iat: Math.floor(Date.now() / 1000),
                exp: Math.floor(Date.now() / 1000) + 15777000, // 6 months
                aud: 'https://appleid.apple.com',
                sub: process.env.APPLE_CLIENT_ID,
            };

            return jwt.sign(payload, process.env.APPLE_PRIVATE_KEY!, {
                algorithm: 'ES256',
                keyid: process.env.APPLE_KEY_ID,
            });
        } catch (error) {
            throw new Error('Invalid token');
        }
    };

    public getAppleTokens = async (code: string): Promise<AppleTokens> => {
        const clientSecret = await this.generateClientSecret();

        const params = new URLSearchParams();
        params.append('client_id', process.env.APPLE_CLIENT_ID!);
        params.append('client_secret', clientSecret);
        params.append('code', code);
        params.append('grant_type', 'authorization_code');

        const response = await axios.post(
            'https://appleid.apple.com/auth/token',
            params,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            },
        );

        return response.data as AppleTokens;
    };

    public decodeAppleIdToken = (idToken: string) => {
        const decoded = jwt.decode(idToken, { complete: true });

        if (!decoded) throw new Error('Invalid token');
        const payload = decoded.payload as Record<string, any>;

        return {
            email: payload.email,
            appleId: payload.sub,
            givenName: payload.given_name,
            familyName: payload.family_name,
        };
    };

    public revokeToken = async (token: string) => {
        const params = new URLSearchParams();
        const clientSecret = await this.generateClientSecret();
        params.append('client_id', process.env.APPLE_CLIENT_ID!);
        params.append('client_secret', clientSecret);
        params.append('token', token);

        await axios.post('https://appleid.apple.com/auth/revoke', params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });
    };
}
