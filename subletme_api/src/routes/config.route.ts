import express from 'express';
import ConfigController from '../controllers/config.controller';

const getConfigRoutes = () => {
    const router = express.Router();
    const controller = new ConfigController();

    router.get('/property', controller.getData);
    router.get('/locations', controller.getLocations);
    router.get('/filters', controller.getFilters);
    router.get('/complete', controller.completeLocations);

    return router;
};

export default getConfigRoutes;
