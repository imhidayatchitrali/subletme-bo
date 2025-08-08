-- First create the new contact_verifications table
CREATE TABLE contact_verifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    verification_type VARCHAR(10) NOT NULL CHECK (verification_type IN ('phone', 'email')),
    contact_value VARCHAR(255) NOT NULL,
    country_code VARCHAR(5),
    is_verified BOOLEAN DEFAULT FALSE,
    last_code_request timestamp without time zone,
    code_requests_count INTEGER DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, verification_type, contact_value)
);

-- Migrate data from phone_verifications to contact_verifications
INSERT INTO contact_verifications (
    user_id, 
    verification_type,
    contact_value,
    country_code,
    is_verified,
    last_code_request,
    code_requests_count,
    created_at,
    updated_at
)
SELECT 
    user_id,
    'phone',
    phone_number,
    country_code,
    is_verified,
    last_code_request,
    code_requests_count,
    created_at,
    updated_at
FROM phone_verifications;

-- Create the new verification_codes table without dropping the old one yet
CREATE TABLE verification_codes_new (
    id SERIAL PRIMARY KEY,
    contact_verification_id INTEGER NOT NULL REFERENCES contact_verifications(id),
    code VARCHAR(6) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    attempts INTEGER DEFAULT 0,
    is_used BOOLEAN DEFAULT FALSE,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

-- Migrate data from old verification_codes to the new table
-- We need to map the phone_verification_id to the new contact_verification_id
INSERT INTO verification_codes_new (
    contact_verification_id,
    code,
    expires_at,
    attempts,
    is_used,
    created_at,
    updated_at
)
SELECT 
    cv.id,
    vc.code,
    vc.expires_at,
    vc.attempts,
    vc.is_used,
    vc.created_at,
    vc.updated_at
FROM verification_codes vc
JOIN phone_verifications pv ON vc.phone_verification_id = pv.id
JOIN contact_verifications cv ON cv.user_id = pv.user_id 
    AND cv.contact_value = pv.phone_number 
    AND cv.verification_type = 'phone';

-- Drop the old verification_codes table
DROP TABLE verification_codes;

-- Rename the new verification_codes table
ALTER TABLE verification_codes_new RENAME TO verification_codes;

-- Now it's safe to drop the phone_verifications table
DROP TABLE phone_verifications;

-- Create all the necessary indexes
CREATE INDEX idx_contact_verifications_user_id ON contact_verifications(user_id);
CREATE INDEX idx_contact_verifications_type_value ON contact_verifications(verification_type, contact_value);
CREATE INDEX idx_verification_codes_contact_verification_id ON verification_codes(contact_verification_id);

-- Add comments to document the change
COMMENT ON TABLE contact_verifications IS 'Stores verification status for both phone numbers and email addresses';
COMMENT ON TABLE verification_codes IS 'Stores verification codes for both phone and email verification processes';