import express from 'express';
import HelperController from '../controllers/helper.controller';

const getHelperRoutes = () => {
    const router = express.Router();
    const controller = new HelperController();

    router.get('/unseen', controller.getUnseenHelpers);
    router.post('/:id/mark-seen', controller.markHelperAsSeen);
    router.post('/', controller.addHelperModal);
    return router;
};

export default getHelperRoutes;
