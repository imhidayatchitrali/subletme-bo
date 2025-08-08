-- Simplified table for helper modals with image
CREATE TABLE helper_modals (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL, -- Unique identifier for the helper
    route_path VARCHAR(255) NOT NULL, -- Route path to match (e.g., '/dashboard', '/profile')
    image_url TEXT NOT NULL, -- URL for the image to display
    description TEXT NOT NULL, -- Description text
    button_text VARCHAR(50) NOT NULL, -- Custom button text
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table to track which users have seen which helpers
CREATE TABLE user_modal_views (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL, -- Reference to your users table
    helper_modal_id INT NOT NULL,
    viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (helper_modal_id) REFERENCES helper_modals(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, helper_modal_id) -- Ensure one record per user per helper
);

-- Indexes for performance
CREATE INDEX idx_user_modal_views_user_id ON user_modal_views(user_id);
CREATE INDEX idx_helper_modals_code ON helper_modals(code);
CREATE INDEX idx_helper_modals_is_active ON helper_modals(is_active);

-- Trigger to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_helper_modals_updated_at BEFORE UPDATE
    ON helper_modals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();