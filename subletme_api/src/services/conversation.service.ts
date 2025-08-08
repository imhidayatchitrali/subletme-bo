import { Client } from '../database';
import {
    Conversation,
    ConversationWithDetails,
    Message,
} from '../models/conversation.model';
import { IOtherUserConversation } from '../models/user.model';
import Logger from '../utils/logger';

class ConversationService {
    private client: Client;
    private context: string;
    constructor() {
        this.context = 'ConversationService';
        this.client = new Client();
        Logger.info('Initializing', this.context + ' - constructor');
    }

    public async sendMessage(
        conversationId: number | undefined,
        propertyId: number | undefined,
        senderId: number,
        content: string,
        userId?: number, // Optional user_id for when host initiates conversation
    ): Promise<{ message: Message; conversation: Conversation }> {
        const methodContext = this.context + ' - sendMessage';
        try {
            Logger.info('Sending message', methodContext);
            // Start a transaction
            await this.client.beginTransaction();

            let actualConversationId = conversationId;

            // If no conversationId provided, we need to find or create the conversation
            if (!actualConversationId) {
                if (!propertyId) {
                    throw new Error(
                        'Either conversation_id or property_id must be provided',
                    );
                }

                // Get property details to identify host
                const propertyInfo = await this.client.query(
                    `SELECT host_id FROM properties WHERE id = $1`,
                    [propertyId],
                );

                if (propertyInfo.rows.length === 0) {
                    throw new Error('Property not found');
                }

                const hostId = propertyInfo.rows[0].host_id;
                const isHost = senderId === hostId;

                // Case 1: Sender is the user (not the host)
                if (!isHost) {
                    // Check if there's an approved property_swipe for this user
                    const swipeCheck = await this.client.query(
                        `
                        SELECT EXISTS (
                            SELECT 1 
                            FROM property_swipes
                            WHERE property_id = $1 AND user_id = $2 AND status = 'approved'
                        ) AS is_approved
                        `,
                        [propertyId, senderId],
                    );

                    const isApproved = swipeCheck.rows[0]?.is_approved;

                    if (!isApproved) {
                        throw new Error(
                            'Host has not approved swipe for this property',
                        );
                    }
                }
                // Case 2: Sender is the host
                else if (isHost && !userId) {
                    // Host is initiating conversation but didn't specify which user
                    const approvedSwipes = await this.client.query(
                        `
                        SELECT user_id, updated_at
                        FROM property_swipes
                        WHERE property_id = $1 AND status = 'approved'
                        `,
                        [propertyId],
                    );

                    if (approvedSwipes.rows.length === 0) {
                        throw new Error(
                            'No approved swipes found for this property',
                        );
                    }

                    if (approvedSwipes.rows.length > 1) {
                        // Multiple approved swipes exist - can't determine which user
                        throw new Error(
                            'Multiple approved swipes found. Please specify user_id to start conversation with.',
                        );
                    }

                    // Only one approved swipe - use that user
                    userId = approvedSwipes.rows[0].user_id;
                }

                // At this point, we know who the conversation is between:
                // - For user-initiated messages: senderId (user) and hostId
                // - For host-initiated messages: hostId (sender) and userId (specified or single approved)

                // Now check if a conversation already exists between these users for this property
                const existingConversation = await this.client.query(
                    `
                    SELECT c.id
                    FROM conversations c
                    WHERE 
                        c.property_id = $1 AND
                        (
                            (c.user_id = $2 AND EXISTS (
                                SELECT 1 FROM properties p 
                                WHERE p.id = c.property_id AND p.host_id = $3
                            ))
                            OR
                            (c.user_id = $3 AND EXISTS (
                                SELECT 1 FROM properties p 
                                WHERE p.id = c.property_id AND p.host_id = $2
                            ))
                        )
                    `,
                    [
                        propertyId,
                        isHost ? userId : senderId,
                        isHost ? senderId : hostId,
                    ],
                );

                if (existingConversation.rows.length > 0) {
                    // Conversation exists, use it
                    actualConversationId = existingConversation.rows[0].id;
                } else {
                    // Create a new conversation
                    const newConversation = await this.client.query(
                        `
                        INSERT INTO conversations (
                            property_id,
                            user_id,
                            created_at,
                            updated_at,
                            is_active
                        ) VALUES (
                            $1, $2, NOW(), NOW(), TRUE
                        ) RETURNING id
                        `,
                        [propertyId, isHost ? userId : senderId],
                    );

                    actualConversationId = newConversation.rows[0].id;
                }
            }

            // Check if user is a participant
            const participantCheck = await this.client.query(
                `
                SELECT EXISTS (
                    SELECT 1 
                    FROM conversations c
                    JOIN properties p ON c.property_id = p.id
                    WHERE c.id = $1 AND (c.user_id = $2 OR p.host_id = $2)
                ) AS is_participant
                `,
                [actualConversationId, senderId],
            );

            const isParticipant = participantCheck.rows[0]?.is_participant;

            if (!isParticipant) {
                throw new Error(
                    'User is not a participant in this conversation',
                );
            }

            // Insert the message
            const result = await this.client.query(
                `
                INSERT INTO messages (
                    conversation_id,
                    sender_id,
                    content,
                    sent_at
                ) VALUES (
                    $1, $2, $3, NOW()
                ) RETURNING id, conversation_id, sender_id, content, sent_at, read_at
                `,
                [actualConversationId, senderId, content],
            );

            // Update conversation timestamp
            await this.client.query(
                `
                UPDATE conversations
                SET updated_at = NOW()
                WHERE id = $1
                `,
                [actualConversationId],
            );

            // Commit the transaction
            await this.client.commit();

            // Get the conversation details
            const conversationDetails = await this.client.query(
                `
                SELECT id, property_id, user_id, created_at, updated_at, is_active
                FROM conversations
                WHERE id = $1
                `,
                [actualConversationId],
            );

            return {
                message: result.rows[0],
                conversation: conversationDetails.rows[0],
            };
        } catch (error: any) {
            await this.client.rollback();
            Logger.error('Error Sending message', methodContext, error.message);
            throw error;
        } finally {
            await this.client.release();
        }
    }

    // Get all messages for a conversation
    public async getMessages(
        conversationId: number,
        userId: number,
    ): Promise<any> {
        const methodContext = this.context + ' - getMessages';
        try {
            Logger.info('Getting messages', methodContext);

            // Check if user is participant in conversation
            const participantCheck = await this.client.query(
                `
                SELECT EXISTS (
                    SELECT 1 
                    FROM conversations c
                    JOIN properties p ON c.property_id = p.id
                    WHERE c.id = $1 AND (c.user_id = $2 OR p.host_id = $2)
                ) AS is_participant
            `,
                [conversationId, userId],
            );

            const isParticipant = participantCheck.rows[0]?.is_participant;

            if (!isParticipant) {
                throw new Error(
                    'User is not a participant in this conversation',
                );
            }

            // Get all messages
            const result = await this.client.query(
                `
                SELECT 
                    m.id, 
                    m.conversation_id, 
                    m.sender_id, 
                    m.content, 
                    m.sent_at, 
                    m.read_at,
                    u.first_name as sender_name
                FROM messages m
                JOIN users u ON m.sender_id = u.id
                WHERE m.conversation_id = $1
                ORDER BY m.sent_at ASC
            `,
                [conversationId],
            );

            // Mark messages as read
            await this.client.query(
                `
                UPDATE messages
                SET read_at = NOW()
                WHERE 
                    conversation_id = $1 AND
                    sender_id != $2 AND
                    read_at IS NULL
            `,
                [conversationId, userId],
            );

            return result.rows;
        } catch (error: any) {
            Logger.error(
                'Error Getting messages',
                methodContext,
                error.message,
            );
            throw error;
        }
    }

    public async getConversations(
        userId: number,
    ): Promise<ConversationWithDetails[]> {
        const methodContext = this.context + ' - getConversations';
        try {
            Logger.info('Getting conversations for user', methodContext);

            // Query for conversations where user is either the user or the host
            const result = await this.client.query(
                `
                WITH conversation_data AS (
                    SELECT 
                        c.id AS conversation_id,
                        c.property_id,
                        c.user_id,
                        c.created_at,
                        c.updated_at,
                        c.is_active,
                        p.host_id,
                        p.title AS property_title,
                        -- Get the latest message in each conversation
                        (SELECT content 
                         FROM messages m2 
                         WHERE m2.conversation_id = c.id 
                         ORDER BY sent_at DESC 
                         LIMIT 1) AS last_message,
                        -- Get the timestamp of the latest message
                        (SELECT sent_at 
                         FROM messages m3 
                         WHERE m3.conversation_id = c.id 
                         ORDER BY sent_at DESC 
                         LIMIT 1) AS last_message_time,
                        -- Count unread messages
                        (SELECT COUNT(*) 
                         FROM messages m4 
                         WHERE m4.conversation_id = c.id 
                           AND m4.sender_id != $1
                           AND m4.read_at IS NULL) AS unread_count
                    FROM conversations c
                    JOIN properties p ON c.property_id = p.id
                    WHERE c.user_id = $1 OR p.host_id = $1
                )
                SELECT 
                    cd.*,
                    -- User details (the other party in the conversation)
                    CASE 
                        WHEN cd.user_id = $1 THEN host.id
                        ELSE guest.id
                    END AS other_user_id,
                    CASE 
                        WHEN cd.user_id = $1 THEN host.first_name
                        ELSE guest.first_name
                    END AS other_user_first_name,
                    CASE 
                        WHEN cd.user_id = $1 THEN host.last_name
                        ELSE guest.last_name
                    END AS other_user_last_name,
                    -- Get profile photo
                    CASE 
                        WHEN cd.user_id = $1 THEN 
                            (SELECT photo_url 
                             FROM user_photos 
                             WHERE user_id = cd.host_id AND is_profile = TRUE 
                             LIMIT 1)
                        ELSE 
                            (SELECT photo_url 
                             FROM user_photos 
                             WHERE user_id = cd.user_id AND is_profile = TRUE 
                             LIMIT 1)
                    END AS other_user_photo
                FROM conversation_data cd
                JOIN users host ON cd.host_id = host.id
                JOIN users guest ON cd.user_id = guest.id
                ORDER BY cd.last_message_time DESC NULLS LAST, cd.updated_at DESC
            `,
                [userId],
            );

            return result.rows.map(
                (row: any) =>
                    ({
                        unread_count: parseInt(row.unread_count),
                        conversation_id: row.conversation_id,
                        property_id: row.property_id,
                        property_title: row.property_title,
                        host_id: row.host_id,
                        last_message: row.last_message,
                        last_message_time: row.last_message_time,
                        created_at: row.created_at,
                        updated_at: row.updated_at,
                        is_active: row.is_active,
                        other_user_id: row.other_user_id,
                        other_user_first_name: row.other_user_first_name,
                        other_user_last_name: row.other_user_last_name,
                        other_user_photo: row.other_user_photo,
                    }) as ConversationWithDetails,
            );
        } catch (error: any) {
            Logger.error(
                'Error getting conversations',
                methodContext,
                error.message,
            );
            throw error;
        }
    }

    public async getConversation(
        conversationId: number,
        userId: number,
    ): Promise<ConversationWithDetails> {
        const methodContext = this.context + ' - getConversation';
        try {
            Logger.info('Getting conversation', methodContext);

            // Check if user is participant in conversation
            const participantCheck = await this.client.query(
                `
                SELECT EXISTS (
                    SELECT 1 
                    FROM conversations c
                    JOIN properties p ON c.property_id = p.id
                    WHERE c.id = $1 AND (c.user_id = $2 OR p.host_id = $2)
                ) AS is_participant
                `,
                [conversationId, userId],
            );

            const isParticipant = participantCheck.rows[0]?.is_participant;

            if (!isParticipant) {
                throw new Error(
                    'User is not a participant in this conversation',
                );
            }

            // Get the conversation details
            const result = await this.client.query(
                `
                SELECT 
                    c.id AS conversation_id,
                    c.property_id,
                    c.user_id,
                    c.created_at,
                    c.updated_at,
                    c.is_active,
                    p.host_id,
                    p.title AS property_title,
                    -- Get the latest message in the conversation
                    (SELECT content 
                     FROM messages m2 
                     WHERE m2.conversation_id = c.id 
                     ORDER BY sent_at DESC 
                     LIMIT 1) AS last_message,
                    -- Get the timestamp of the latest message
                    (SELECT sent_at 
                     FROM messages m3 
                     WHERE m3.conversation_id = c.id 
                     ORDER BY sent_at DESC 
                     LIMIT 1) AS last_message_time,
                    -- Count unread messages
                    (SELECT COUNT(*) 
                     FROM messages m4 
                     WHERE m4.conversation_id = c.id 
                       AND m4.sender_id != $2
                       AND m4.read_at IS NULL) AS unread_count
                FROM conversations c
                JOIN properties p ON c.property_id = p.id
                WHERE c.id = $1
                `,
                [conversationId, userId],
            );

            if (result.rows.length === 0) {
                throw new Error('Conversation not found');
            }

            const conversation = result.rows[0];

            // Get the other user details
            const otherUserId =
                conversation.user_id === userId
                    ? conversation.host_id
                    : conversation.user_id;

            const otherUserDetails = await this.client.query(
                `
                SELECT id, first_name, last_name
                FROM users
                WHERE id = $1
                `,
                [otherUserId],
            );

            if (otherUserDetails.rows.length === 0) {
                throw new Error('Other user not found');
            }

            const otherUser = otherUserDetails.rows[0];

            // Get profile photo
            const otherUserPhoto = await this.client.query(
                `
                SELECT photo_url
                FROM user_photos
                WHERE user_id = $1 AND is_profile = TRUE
                LIMIT 1
                `,
                [otherUserId],
            );

            const photoUrl =
                otherUserPhoto.rows.length > 0
                    ? otherUserPhoto.rows[0].photo_url
                    : null;

            // Construct the final conversation object
            const conversationDetails: ConversationWithDetails = {
                id: conversation.conversation_id,
                conversation_id: conversation.conversation_id,
                property_id: conversation.property_id,
                user_id: conversation.user_id,
                created_at: conversation.created_at,
                updated_at: conversation.updated_at,
                is_active: conversation.is_active,
                property_title: conversation.property_title,
                host_id: conversation.host_id,
                last_message: conversation.last_message,
                last_message_time: conversation.last_message_time,
                unread_count: parseInt(conversation.unread_count),
                other_user_id: otherUser.id,
                other_user_first_name: otherUser.first_name,
                other_user_last_name: otherUser.last_name,
                other_user_photo: photoUrl,
            };

            // Return the conversation details
            return conversationDetails;
        } catch (error: any) {
            Logger.error(
                'Error getting conversation',
                methodContext,
                error.message,
            );
            throw error;
        }
    }

    /**
     * Get information about the other participant in a conversation
     * @param conversationId ID of the conversation
     * @param userId ID of the current user
     * @returns Details about the other user and the property
     */
    public async getOtherUserConversation(
        conversationId: number,
        userId: number,
    ): Promise<IOtherUserConversation> {
        const methodContext = this.context + ' - getOtherUserConversation';
        try {
            Logger.info('Getting other user from conversation', methodContext, {
                conversationId,
                userId,
            });

            // First, get conversation details and property info
            const conversationDetails = await this.client.query(
                `
            SELECT 
                c.id AS conversation_id,
                c.property_id,
                c.user_id,
                p.host_id,
                p.title AS property_title
            FROM conversations c
            JOIN properties p ON c.property_id = p.id
            WHERE c.id = $1
            `,
                [conversationId],
            );

            if (conversationDetails.rows.length === 0) {
                throw new Error('Conversation not found');
            }

            const { user_id, host_id, property_title } =
                conversationDetails.rows[0];

            // Validate that the current user is a participant
            if (user_id !== userId && host_id !== userId) {
                throw new Error(
                    'User is not a participant in this conversation',
                );
            }

            // Determine the other user's ID (if current user is host, other is user, and vice versa)
            const otherUserId = userId === host_id ? user_id : host_id;

            // Get other user's details
            const otherUserDetails = await this.client.query(
                `
            SELECT 
                u.id AS other_user_id,
                u.first_name AS other_user_first_name,
                u.last_name AS other_user_last_name,
                (SELECT photo_url FROM user_photos 
                 WHERE user_id = u.id AND is_profile = TRUE 
                 LIMIT 1) AS other_user_photo
            FROM users u
            WHERE u.id = $1
            `,
                [otherUserId],
            );

            if (otherUserDetails.rows.length === 0) {
                throw new Error('Other user not found');
            }

            const otherUser = otherUserDetails.rows[0];

            // Combine the information into the final result
            const result: IOtherUserConversation = {
                other_user_id: otherUser.other_user_id,
                other_user_first_name: otherUser.other_user_first_name,
                other_user_last_name: otherUser.other_user_last_name,
                other_user_photo: otherUser.other_user_photo,
                property_title: property_title,
            };

            Logger.info('Successfully got other user info', methodContext, {
                conversationId,
                userId,
                otherUserId,
            });

            return result;
        } catch (error: any) {
            Logger.error(
                'Error getting other user from conversation',
                methodContext,
                error.message,
            );
            throw error;
        }
    }

    /**
     * Get the other user information based on a property
     * If current user is the property host, returns the user who swiped on the property
     * If current user is a regular user, returns the host of the property
     * @param propertyId The property ID
     * @param userId Current user ID
     */
    public async getOtherUserConversationFromProperty(
        propertyId: number,
        userId: number,
    ): Promise<IOtherUserConversation> {
        const methodContext =
            this.context + ' - getOtherUserConversationFromProperty';
        try {
            Logger.info(
                'Getting other user info from property',
                methodContext,
                {
                    propertyId,
                    userId,
                },
            );

            // First, get property info to determine the host
            const propertyInfo = await this.client.query(
                `SELECT 
                p.id,
                p.host_id,
                p.title AS property_title
             FROM properties p
             WHERE p.id = $1`,
                [propertyId],
            );

            if (propertyInfo.rows.length === 0) {
                Logger.error('Property not found', methodContext, {
                    propertyId,
                });
                throw new Error('Property not found');
            }

            const { host_id, property_title } = propertyInfo.rows[0];
            const isHost = userId === host_id;

            let otherUserInfo;

            if (isHost) {
                // Current user is the host - get the user who swiped on this property
                // Get the most recent approved swipe if there are multiple
                otherUserInfo = await this.client.query(
                    `SELECT 
                    u.id AS other_user_id,
                    u.first_name AS other_user_first_name,
                    u.last_name AS other_user_last_name,
                    (SELECT photo_url FROM user_photos 
                     WHERE user_id = u.id AND is_profile = TRUE 
                     LIMIT 1) AS other_user_photo,
                    $1::text AS property_title,
                    $2::integer AS property_id
                 FROM property_swipes ps
                 JOIN users u ON ps.user_id = u.id
                 WHERE ps.property_id = $2 
                   AND ps.status = 'approved'
                 ORDER BY ps.updated_at DESC
                 LIMIT 1`,
                    [property_title, propertyId],
                );

                if (otherUserInfo.rows.length === 0) {
                    Logger.error(
                        'No approved swipes found for this property',
                        methodContext,
                        {
                            propertyId,
                            isHost,
                        },
                    );
                    throw new Error(
                        'No approved swipes found for this property',
                    );
                }
            } else {
                // Current user is not the host - get the host info
                // Check if the current user has an approved swipe on this property
                const swipeCheck = await this.client.query(
                    `SELECT EXISTS (
                    SELECT 1 
                    FROM property_swipes ps
                    WHERE ps.property_id = $1 AND ps.user_id = $2 AND ps.status = 'approved'
                ) AS has_approved_swipe`,
                    [propertyId, userId],
                );

                const hasApprovedSwipe = swipeCheck.rows[0]?.has_approved_swipe;

                if (!hasApprovedSwipe) {
                    Logger.error(
                        'User does not have an approved swipe for this property',
                        methodContext,
                        {
                            propertyId,
                            userId,
                        },
                    );
                    throw new Error(
                        'User does not have an approved swipe for this property',
                    );
                }

                // Get the host information
                otherUserInfo = await this.client.query(
                    `SELECT 
                    u.id AS other_user_id,
                    u.first_name AS other_user_first_name,
                    u.last_name AS other_user_last_name,
                    (SELECT photo_url FROM user_photos 
                     WHERE user_id = u.id AND is_profile = TRUE 
                     LIMIT 1) AS other_user_photo,
                    $1::text AS property_title,
                    $2::integer AS property_id
                 FROM users u
                 WHERE u.id = $3`,
                    [property_title, propertyId, host_id],
                );

                if (otherUserInfo.rows.length === 0) {
                    Logger.error('Host information not found', methodContext, {
                        propertyId,
                        host_id,
                    });
                    throw new Error('Host information not found');
                }
            }

            Logger.info('Successfully got other user info', methodContext, {
                propertyId,
                userId,
                isHost,
            });

            return otherUserInfo.rows[0] as IOtherUserConversation;
        } catch (error: any) {
            Logger.error(
                'Error getting other user info from property',
                methodContext,
                {
                    propertyId,
                    userId,
                    error: error.message,
                },
            );
            throw error;
        }
    }
}

export default ConversationService;
