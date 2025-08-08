-- Migration: add_address_field_to_users
-- Description: Adds a JSONB field to store address components from geocoding

-- Up Migration
ALTER TABLE users
ADD COLUMN address JSONB DEFAULT NULL;

-- Create an index to improve query performance on the address field
CREATE INDEX idx_users_address ON users USING GIN (address);

-- Add a comment to explain the structure
COMMENT ON COLUMN users.address IS 'Stores geocoded address components like city, country, and formatted_address';

-- Down Migration (in case you need to rollback)
-- ALTER TABLE users DROP COLUMN address;
-- DROP INDEX IF EXISTS idx_users_address;