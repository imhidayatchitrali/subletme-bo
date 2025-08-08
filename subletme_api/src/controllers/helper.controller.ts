import { Request, Response } from 'express';
import HelperService from '../services/helper.service';
import Logger from '../utils/logger';
import { AddHelperModalRequest } from '../models/helper.modal';

class HelperController {
    private service: HelperService;
    private context: string;

    constructor() {
        this.context = 'HelperController';
        this.service = new HelperService();
        Logger.info('Initializing', this.context + ' - constructor');
    }

    getUnseenHelpers = async (req: Request, res: Response): Promise<void> => {
        const methodContext = this.context + ' - getUnseenHelpers';
        try {
            Logger.info('Starting process', methodContext);
            const userId = (req as any).token.userId;

            Logger.info(
                `Getting unseen helpers for user ${userId} on route`,
                methodContext,
            );

            const helpers = await this.service.getUnseenHelpers(userId);
            Logger.info('Unseen fetched', methodContext, { helpers });
            res.status(200).json({
                results: helpers,
            });
        } catch (error) {
            Logger.error(
                `Error getting unseen helpers: ${error}`,
                methodContext,
            );
            res.status(500).json({ error: 'Failed to get unseen helpers' });
        }
    };

    /**
     * Mark a helper as seen by a user
     */
    markHelperAsSeen = async (req: Request, res: Response): Promise<void> => {
        const methodContext = this.context + ' - markHelperAsSeen';
        try {
            const userId = (req as any).token.userId;
            const helperId = parseInt(req.params.id);
            Logger.info(
                `Starting process to mark helper as seen for user ${userId}`,
                methodContext,
                { helperId },
            );

            // Check if already seen
            const hasSeen = await this.service.hasUserSeenHelper(
                userId,
                helperId,
            );
            if (hasSeen) {
                res.status(200).json({ success: true });
                return;
            }

            await this.service.markHelperAsSeen(userId, helperId);
            Logger.info(
                `Helper ${helperId} marked as seen for user ${userId}`,
                methodContext,
            );
            res.status(200).json({ success: true });
        } catch (error) {
            Logger.error(
                `Error marking helper as seen: ${error}`,
                methodContext,
            );
            res.status(500).json({ error: 'Failed to mark helper as seen' });
        }
    };

    addHelperModal = async (req: Request, res: Response): Promise<void> => {
        const methodContext = this.context + ' - addHelperModal';
        try {
            const helperData = req.body as AddHelperModalRequest;
            Logger.info(
                'Starting process to add new helper modal',
                methodContext,
                helperData,
            );

            const newHelper = await this.service.addHelperModal(helperData);

            Logger.info('New helper modal added', methodContext, { newHelper });
            res.status(201).json({
                success: true,
                result: newHelper,
            });
        } catch (error) {
            Logger.error('Error adding new helper modal', methodContext, error);
            res.status(500).json({ error: 'Failed to add new helper modal' });
        }
    };
}

export default HelperController;
