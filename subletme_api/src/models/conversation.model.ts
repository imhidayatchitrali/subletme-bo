export type Message = {
    id: number;
    conversation_id: number;
    sender_id: number;
    content: string;
    sent_at: Date;
    read_at: Date | null;
    sender_name?: string; // Optional field when joined with users
};

export type Conversation = {
    id: number;
    property_id: number;
    user_id: number;
    created_at: Date;
    updated_at: Date;
    is_active: boolean;
};

export type ConversationWithDetails = {
    conversation_id: number; // Same as id, but returned from query
    property_title: string; // Title of the property
    host_id: number; // ID of the property host
    last_message: string | null; // Content of the most recent message
    last_message_time: Date | null; // Timestamp of the most recent message
    unread_count: number; // Number of unread messages
    other_user_id: number; // ID of the other user in the conversation
    other_user_first_name: string; // Name of the other user
    other_user_last_name: string; // Last Name of the other user
    other_user_photo: string | null; // Profile photo URL of the other user
} & Conversation;
