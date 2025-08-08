import express from 'express';
import PropertyController from '../controllers/property.controller';
import { upload } from '../app';

const getPropertyRoutes = () => {
    const router = express.Router();
    const controller = new PropertyController();

    router.get('/', controller.getProperties);
    router.get('/status', controller.getPropertiesByStatus); // This is the endpoint to get the properties swipes for the user
    router.get('/host', controller.getHostProperties);
    router.get('/:id', controller.getPropertyDetails);
    router.post('/publish', upload.array('images'), controller.publish);
    router.post('/:id/unlike', controller.unlikeProperty);
    router.post('/:id/like', controller.likeProperty);
    router.post('/:id/withdraw', controller.withdrawPropertyRequest);
    router.delete('/:id', controller.deleteProperty);
    router.put('/:id', upload.array('images'), controller.update);

    return router;
};

export default getPropertyRoutes;
