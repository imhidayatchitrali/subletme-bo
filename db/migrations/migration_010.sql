-- Conversations table to track chats between users about properties
CREATE TABLE conversations (
    id SERIAL PRIMARY KEY,
    property_id INTEGER NOT NULL REFERENCES properties(id),
    user_id INTEGER NOT NULL REFERENCES users(id),      -- The user who liked the property
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- Messages table to store actual chat messages
CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id),
    sender_id INTEGER NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP WITH TIME ZONE NULL      -- NULL means unread, timestamp indicates when it was read
);

-- Create indexes for performance
CREATE INDEX idx_conversations_property_id ON conversations(property_id);
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_sender_id ON messages(sender_id);
CREATE INDEX idx_messages_sent_at ON messages(sent_at);
CREATE INDEX idx_messages_read_at ON messages(read_at);  -- Index for checking unread messages

-- Function to mark messages as read
CREATE OR REPLACE FUNCTION mark_messages_as_read(p_conversation_id INT, p_user_id INT)
RETURNS VOID AS $$
BEGIN
    UPDATE messages
    SET read_at = CURRENT_TIMESTAMP
    WHERE 
        conversation_id = p_conversation_id AND
        sender_id != p_user_id AND
        read_at IS NULL;
END;
$$ LANGUAGE plpgsql;

-- Function to get unread message count for a user
CREATE OR REPLACE FUNCTION get_unread_message_count(p_user_id INT)
RETURNS TABLE (conversation_id INT, unread_count BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id AS conversation_id,
        COUNT(m.id) AS unread_count
    FROM 
        conversations c
    JOIN 
        properties p ON c.property_id = p.id
    LEFT JOIN 
        messages m ON c.id = m.conversation_id AND m.read_at IS NULL AND m.sender_id != p_user_id
    WHERE 
        c.user_id = p_user_id OR p.host_id = p_user_id
    GROUP BY 
        c.id;
END;
$$ LANGUAGE plpgsql;