import express from 'express';
import OnboardingController from '../controllers/onboarding.controller';
import { upload } from '../app';

export const getPublicOnboardingRoutes = () => {
    const router = express.Router();
    const controller = new OnboardingController();

    router.post('/personal-info', controller.submitPersonalInfo);
    router.post('/send-email-code', controller.sendEmailValidationCode);
    router.post('/verify-email-code', controller.verifyEmailCode);

    return router;
};

export const getProtectedOnboardingRoutes = () => {
    const router = express.Router();
    const controller = new OnboardingController();

    router.post('/send-code', controller.sendValidationCode);
    router.post('/verify-code', controller.verifyCode);
    router.post(
        '/upload-photo',
        upload.array('images', 6),
        controller.uploadPhotos,
    );

    return router;
};
