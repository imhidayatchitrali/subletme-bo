import express from 'express';
import UserController from '../controllers/user.controller';
import { upload } from '../app';

const getUserRoutes = () => {
    const router = express.Router();
    const controller = new UserController();

    router.get('/me', controller.getUser);
    router.put('/', controller.updateUser);
    router.put(
        '/photos',
        upload.array('images', 6),
        controller.updateUserPhotos,
    );

    router.post('/language', controller.updateLanguage);
    router.post('/device', controller.updateDeviceInfo);
    router.get('/sublet/:id', controller.getUserSubletDetails);
    router.get('/subletters', controller.getUsersNearMe);
    router.get('/swipes', controller.getUsersSwipes); // This is the endpoint to get the user swipes for the host
    router.post('/:id/unlike', controller.unlikeUserSublet);
    router.post('/:id/like', controller.likeUserSublet);
    router.post('/:id/reject/:propertyId', controller.rejectUserRequest);
    router.post('/:id/approve/:propertyId', controller.approveUserRequest);

    return router;
};

export default getUserRoutes;
