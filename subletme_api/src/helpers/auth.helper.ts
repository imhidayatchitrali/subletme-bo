import jwt from 'jsonwebtoken';
import { IUser } from '../models/user.model';

export const generateTokenResponse = (userValue: IUser): string => {
    if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET is not configured');
    }

    const token = jwt.sign(
        {
            userId: userValue.id,
            email: userValue.email,
            firstName: userValue.first_name,
            lastName: userValue.last_name,
            onboardingStep: userValue.onboarding_step,
        },
        process.env.JWT_SECRET,
        {
            expiresIn: '7d',
        },
    );
    return token;
};

export const generateTemporaryTokenResponse = (email: string): string => {
    if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET is not configured');
    }

    const token = jwt.sign(
        {
            purpose: 'password_reset',
            email: email,
        },
        process.env.JWT_SECRET,
    );
    return token;
};

export const validateTemporaryToken = (token: string): any => {
    if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET is not configured');
    }

    return jwt.verify(token, process.env.JWT_SECRET);
};
