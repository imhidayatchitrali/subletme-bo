import express from 'express';
import getUserRoutes from './users.route';
import getAuthRoutes from './auth.route';
import { authMiddleware } from '../middleware/auth.middleware';
import {
    getProtectedOnboardingRoutes,
    getPublicOnboardingRoutes,
} from './onboarding.route';
import getPropertyRoutes from './property.route';
import getConfigRoutes from './config.route';
import { apiKeyAuth } from '../middleware/pipeline.middleware';
import getVersionRoutes from './version.route';
import getConversationRoutes from './conversation.route';
import getHelperRoutes from './helper.route';

const getAPIRouter = () => {
    const router = express.Router();
    // Health route
    router.get('/health', (req, res) => {
        res.json({ status: 'Up' });
    });
    router.use('/auth', getAuthRoutes());
    router.use('/config', [authMiddleware], getConfigRoutes());
router.use('/config', [authMiddleware], getConfigRoutes());
    router.use('/version', [apiKeyAuth], getVersionRoutes());
    router.use('/user', [authMiddleware], getUserRoutes());
    router.use('/property', [authMiddleware], getPropertyRoutes());
    router.use('/conversation', [authMiddleware], getConversationRoutes());
    router.use('/helpers', [authMiddleware], getHelperRoutes());
    // Public routes (no auth required)
    router.use('/onboarding-public', getPublicOnboardingRoutes());

    // Protected routes (auth required)
    router.use('/onboarding', [authMiddleware], getProtectedOnboardingRoutes());

    return router;
};

export default getAPIRouter;
