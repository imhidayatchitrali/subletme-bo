-- Step 1: Add the new status column with a default value
ALTER TABLE property_swipes 
ADD COLUMN status VARCHAR(20);

-- Step 2: Set default values based on existing is_favorite column
UPDATE property_swipes
SET status = CASE 
    WHEN is_favorite = true THEN 'pending'
    ELSE NULL  -- No status needed for disliked properties
    END;

-- Step 3: Create or update the hide_until for disliked properties
UPDATE property_swipes
SET hide_until = created_at + INTERVAL '7 days'
WHERE is_favorite = false AND hide_until IS NULL;

-- Step 4: Add the constraint on status, allowing NULL values
ALTER TABLE property_swipes
ADD CONSTRAINT check_valid_status 
CHECK (status IS NULL OR status IN ('pending', 'approved', 'withdrawn'));

-- Step 5: Make sure status is set to NOT NULL only for liked properties
ALTER TABLE property_swipes
ADD CONSTRAINT status_required_for_favorites
CHECK (
    (is_favorite = true AND status IS NOT NULL) OR 
    (is_favorite = false AND status IS NULL)
);

-- Step 6: Add the updated_at column
ALTER TABLE property_swipes
ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Step 7: Optional - Add a trigger to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_property_swipes_updated_at
BEFORE UPDATE ON property_swipes
FOR EACH ROW
EXECUTE FUNCTION update_modified_column();

-- Step 8: Create an index on status for faster querying (optional but recommended)
CREATE INDEX idx_property_swipes_status ON property_swipes(status);

ALTER TABLE property_swipes
DROP COLUMN is_favorite;

-------------------------------------------------------------------------------------------------------

-- Migration for property_swipe_history table
ALTER TABLE property_swipe_history 
ADD COLUMN action VARCHAR(20);

-- Update existing records
UPDATE property_swipe_history
SET action = CASE 
    WHEN is_favorite = true THEN 'like'
    ELSE 'dislike'
    END;

-- Set NOT NULL constraint
ALTER TABLE property_swipe_history
ALTER COLUMN action SET NOT NULL;

-- Add constraint to limit valid actions
ALTER TABLE property_swipe_history
ADD CONSTRAINT check_valid_action 
CHECK (action IN ('like', 'dislike', 'withdraw'));

-- Remove the old is_favorite column
ALTER TABLE property_swipe_history
DROP COLUMN is_favorite;

-- Optional: Add index for faster querying
CREATE INDEX idx_property_swipe_history_action ON property_swipe_history(action);

CREATE TABLE user_firebase_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    firebase_token VARCHAR(255) NOT NULL,
    device_metadata JSONB DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, firebase_token)
);