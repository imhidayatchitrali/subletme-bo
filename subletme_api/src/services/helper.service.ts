import { Client } from '../database';
import { AddHelperModalRequest, HelperModal } from '../models/helper.modal';
import Logger from '../utils/logger';

class HelperService {
    private client: Client;
    private context: string;

    constructor() {
        this.context = 'HelperService';
        this.client = new Client();
        Logger.info('Initializing', this.context + ' - constructor');
    }

    async getUnseenHelpers(userId: number): Promise<HelperModal[]> {
        try {
            let query = `
                SELECT hm.* 
                FROM helper_modals hm 
                WHERE hm.is_active = true 
                AND NOT EXISTS (
                    SELECT 1 
                    FROM user_modal_views umv 
                    WHERE umv.helper_modal_id = hm.id 
                    AND umv.user_id = $1
                )
            `;

            const params: any[] = [userId];

            query += ` ORDER BY hm.id`;

            Logger.info(
                `Executing query for unseen helpers: ${query}`,
                this.context,
            );

            const result = await this.client.query(query, params);
            return result.rows;
        } catch (error) {
            Logger.error(
                `Error getting unseen helpers: ${error}`,
                this.context,
            );
            throw error;
        }
    }

    async markHelperAsSeen(userId: number, helperId: number): Promise<void> {
        try {
            await this.client.beginTransaction();
            const query = `
                INSERT INTO user_modal_views (user_id, helper_modal_id)
                VALUES ($1, $2)
                ON CONFLICT (user_id, helper_modal_id) DO NOTHING
            `;

            Logger.info(
                `Marking helper ${helperId} as seen for user ${userId}`,
                this.context,
            );

            await this.client.query(query, [userId, helperId]);
            await this.client.commit();
        } catch (error) {
            await this.client.rollback();
            Logger.error(
                `Error marking helper as seen: ${error}`,
                this.context,
            );
            throw error;
        } finally {
            await this.client.release(); // Always release connection
        }
    }

    async addHelperModal(input: AddHelperModalRequest): Promise<HelperModal> {
        try {
            await this.client.beginTransaction();
            const query = `
                INSERT INTO helper_modals (
                    code, route_path, image_url, description, button_text
                ) VALUES ($1, $2, $3, $4, $5)
                RETURNING *
            `;

            Logger.info(`Adding new helper modal: ${input.code}`, this.context);

            const result = await this.client.query(query, [
                input.code,
                input.routePath,
                input.imageUrl,
                input.description,
                input.buttonText,
            ]);
            await this.client.commit();
            return result.rows[0];
        } catch (error) {
            await this.client.rollback();
            Logger.error(`Error adding helper modal: ${error}`, this.context);
            throw error;
        } finally {
            await this.client.release(); // Always release connection
        }
    }

    async hasUserSeenHelper(
        userId: number,
        helperId: number,
    ): Promise<boolean> {
        try {
            const query = `
                SELECT EXISTS (
                    SELECT 1 
                    FROM user_modal_views 
                    WHERE user_id = $1 
                    AND helper_modal_id = $2
                ) AS has_seen
            `;

            Logger.info(
                `Checking if user ${userId} has seen helper ${helperId}`,
                this.context,
            );

            const result = await this.client.query(query, [userId, helperId]);
            return result.rows[0].has_seen;
        } catch (error) {
            Logger.error(
                `Error checking if user has seen helper: ${error}`,
                this.context,
            );
            throw error;
        }
    }
}

export default HelperService;
