-- First, create the new table without dropping the photo_url column yet
CREATE TABLE user_photos (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    photo_url TEXT NOT NULL,
    is_profile BOOLEAN DEFAULT FALSE,
    display_order INTEGER NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_display_order UNIQUE (user_id, display_order)
);

-- Create indexes
CREATE INDEX idx_user_photos_user_id ON user_photos(user_id);
CREATE INDEX idx_user_photos_profile ON user_photos(user_id, is_profile);

-- Migrate existing photos to the new table
INSERT INTO user_photos (user_id, photo_url, is_profile, display_order)
SELECT id, photo_url, TRUE, 1
FROM users
WHERE photo_url IS NOT NULL AND photo_url != '';

-- Now add the trigger for future operations
CREATE OR REPLACE FUNCTION ensure_one_profile_photo()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_profile = TRUE THEN
        UPDATE user_photos
        SET is_profile = FALSE
        WHERE user_id = NEW.user_id
        AND id != NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ensure_one_profile_photo
BEFORE INSERT OR UPDATE ON user_photos
FOR EACH ROW
EXECUTE FUNCTION ensure_one_profile_photo();