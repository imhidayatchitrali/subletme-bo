import { IAuth } from './auth.model';

export type UserToken = {
    userId: string;
    email: string;
    photoUrl: string;
    firstName: string;
    lastName: string;
    iat: number;
    exp: number;
};

export type BaseRequest = {
    token: UserToken;
} & Express.Request;

export type AuthRequest = {
    body: IAuth;
} & BaseRequest;
