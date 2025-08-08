CREATE TABLE host_subletter_swipes (
    id SERIAL PRIMARY KEY,
    host_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subletter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_favorite BOOLEAN NOT NULL,  -- true for like, false for dislike
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(host_id, subletter_id)  -- prevent multiple swipes on same subletter by same host
);

-- Index on host_id to speed up queries filtering by host
CREATE INDEX idx_host_subletter_swipes_host_id ON host_subletter_swipes(host_id);

-- Index on subletter_id to speed up queries filtering by subletter
CREATE INDEX idx_host_subletter_swipes_subletter_id ON host_subletter_swipes(subletter_id);

-- Composite index on (host_id, subletter_id) for the unique constraint
-- This is likely already created automatically by the UNIQUE constraint
-- but we can explicitly create it to be sure
CREATE UNIQUE INDEX idx_host_subletter_swipes_host_subletter ON host_subletter_swipes(host_id, subletter_id);