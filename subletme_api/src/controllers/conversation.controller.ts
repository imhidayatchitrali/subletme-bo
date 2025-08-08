import { Request, Response } from 'express';
import Logger from '../utils/logger';
import ConversationService from '../services/conversation.service';

class ConversationController {
    private service: ConversationService;
    private context: string;

    constructor() {
        this.context = 'ConversationController';
        this.service = new ConversationService();
        Logger.info('Initializing', this.context + ' - constructor');
    }

    public sendMessage = async (req: Request, res: Response) => {
        const methodContext = this.context + ' - sendMessage';
        try {
            Logger.info('Starting', methodContext);

            const { conversation_id, property_id, content, user_id } = req.body;
            const senderId = (req as any).token.userId;

            // Validate inputs
            if (
                (!conversation_id && !property_id) ||
                !senderId ||
                !content ||
                content.trim() === ''
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        'Missing required parameters. Either conversation_id or property_id must be provided, along with content.',
                });
            }

            const result = await this.service.sendMessage(
                conversation_id,
                property_id,
                senderId,
                content,
                user_id, // Pass the optional user_id
            );

            return res.status(201).json({
                success: true,
                data: {
                    message: result.message,
                    conversation: result.conversation,
                    is_new_conversation: !conversation_id, // Flag to indicate if this is a new conversation
                },
            });
        } catch (e: any) {
            Logger.error(e.message || 'Error', methodContext);

            // Handle specific error cases
            if (e.message.includes('not a participant')) {
                return res.status(403).json({
                    success: false,
                    message: 'User is not a participant in this conversation',
                });
            }

            if (e.message.includes('not approved swipe')) {
                return res.status(403).json({
                    success: false,
                    message: 'Host has not approved swipe for this property',
                });
            }

            if (e.message.includes('Multiple approved swipes')) {
                return res.status(400).json({
                    success: false,
                    message:
                        'Multiple approved swipes found. Please specify user_id to start conversation with.',
                });
            }

            res.status(400).json({
                success: false,
                message: e.message ?? 'Error sending message',
            });
        }
    };

    public getMessages = async (req: Request, res: Response) => {
        const methodContext = this.context + ' - getMessages';
        try {
            Logger.info('Starting', methodContext);

            const conversationId = parseInt(req.params.id);
            const userId = (req as any).token.userId;

            if (!conversationId || !userId) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required parameters',
                });
            }

            const messages = await this.service.getMessages(
                conversationId,
                userId,
            );

            return res.status(200).json({
                success: true,
                data: messages,
            });
        } catch (e: any) {
            Logger.error(e.message || 'Error', methodContext);

            if (e.message.includes('not a participant')) {
                return res.status(403).json({
                    success: false,
                    message: 'User is not a participant in this conversation',
                });
            }

            res.status(400).json({
                success: false,
                message: e.message ?? 'Error getting messages',
            });
        }
    };

    public getConversations = async (req: Request, res: Response) => {
        const methodContext = this.context + ' - getConversations';
        try {
            Logger.info('Starting', methodContext);

            const userId = (req as any).token.userId;

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required',
                });
            }

            const conversations = await this.service.getConversations(userId);

            return res.status(200).json({
                success: true,
                data: conversations,
            });
        } catch (e: any) {
            Logger.error(e.message || 'Error', methodContext);

            res.status(400).json({
                success: false,
                message: e.message ?? 'Error getting conversations',
            });
        }
    };

    public getConversation = async (req: Request, res: Response) => {
        const methodContext = this.context + ' - getConversation';
        try {
            Logger.info('Starting', methodContext);

            const conversationId = parseInt(req.params.id);
            const userId = (req as any).token.userId;

            if (!conversationId || !userId) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required parameters',
                });
            }

            const conversation = await this.service.getConversation(
                conversationId,
                userId,
            );

            return res.status(200).json({
                success: true,
                data: conversation,
            });
        } catch (e: any) {
            Logger.error(e.message || 'Error', methodContext);

            if (e.message.includes('not a participant')) {
                return res.status(403).json({
                    success: false,
                    message: 'User is not a participant in this conversation',
                });
            }

            res.status(400).json({
                success: false,
                message: e.message ?? 'Error getting conversation',
            });
        }
    };

    public getOtherUserConversation = async (req: Request, res: Response) => {
        const methodContext = this.context + ' - getOtherUserConversation';
        try {
            Logger.info('Starting', methodContext);

            const conversationId = parseInt(req.params.id);
            const userId = (req as any).token.userId;

            if (!conversationId || !userId) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required parameters',
                });
            }

            const otherUser = await this.service.getOtherUserConversation(
                conversationId,
                userId,
            );

            return res.status(200).json({
                success: true,
                data: otherUser,
            });
        } catch (e: any) {
            Logger.error(e.message || 'Error', methodContext);

            if (e.message.includes('not a participant')) {
                return res.status(403).json({
                    success: false,
                    message: 'User is not a participant in this conversation',
                });
            }

            res.status(400).json({
                success: false,
                message: e.message ?? 'Error getting other user',
            });
        }
    };

    public getOtherUserConversationFromProperty = async (
        req: Request,
        res: Response,
    ) => {
        const methodContext =
            this.context + ' - getOtherUserConversationFromProperty';
        try {
            Logger.info('Starting', methodContext);

            const propertyId = parseInt(req.params.id);
            const userId = (req as any).token.userId;

            if (!propertyId || !userId) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required parameters',
                });
            }

            const otherUser =
                await this.service.getOtherUserConversationFromProperty(
                    propertyId,
                    userId,
                );

            return res.status(200).json({
                success: true,
                data: otherUser,
            });
        } catch (e: any) {
            Logger.error(e.message || 'Error', methodContext);

            if (e.message.includes('not a participant')) {
                return res.status(403).json({
                    success: false,
                    message: 'User is not a participant in this conversation',
                });
            }

            res.status(400).json({
                success: false,
                message: e.message ?? 'Error getting other user',
            });
        }
    };
}

export default ConversationController;
