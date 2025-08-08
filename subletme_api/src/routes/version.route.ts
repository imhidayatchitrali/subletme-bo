import express from 'express';
import ConfigController from '../controllers/config.controller';

const getVersionRoutes = () => {
    const router = express.Router();
    const controller = new ConfigController();

    router.put('/', controller.updateVersion);
    router.get('/', controller.getVersion);

    return router;
};

export default getVersionRoutes;
