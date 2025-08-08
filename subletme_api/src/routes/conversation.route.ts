import express from 'express';
import ConversationController from '../controllers/conversation.controller';

const getConversationRoutes = () => {
    const router = express.Router();
    const controller = new ConversationController();

    router.get('/', controller.getConversations);

    router.get('/:id/other', controller.getOtherUserConversation);
    router.get(
        '/property/:id/other',
        controller.getOtherUserConversationFromProperty,
    );

    router.get('/:id', controller.getConversation);
    router.post('/send', controller.sendMessage);
    router.get('/:id/messages', controller.getMessages);

    return router;
};

export default getConversationRoutes;
