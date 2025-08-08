CREATE EXTENSION IF NOT EXISTS postgis;
CREATE TYPE auth_platform AS ENUM ('android', 'ios');
CREATE TYPE onboarding_step as ENUM ('personal_info', 'phone_verification', 'photo_upload', 'completed');
CREATE TYPE gender as ENUM ('male', 'female', 'other');

-- Users Table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(254) UNIQUE NOT NULL,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    language VARCHAR(50) DEFAULT 'en',
    location geography(POINT),
    hash_password VARCHAR(255),
    date_of_birth DATE,
    photo_url TEXT,
    bio TEXT,
    gender gender,
    refresh_token VARCHAR(255),
    onboarding_step onboarding_step NOT NULL,
    google_id VARCHAR(255) UNIQUE,
    apple_id VARCHAR(255) UNIQUE,
    platform auth_platform NOT NULL,
    location_updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

-- Create indices for faster lookups
CREATE INDEX idx_google_id ON users(google_id);
CREATE INDEX idx_apple_id ON users(apple_id);
CREATE INDEX idx_email ON users(email);
CREATE INDEX users_location_idx ON users USING GIST (location);

-- Phone Verification Table
CREATE TABLE phone_verifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    phone_number VARCHAR(20) NOT NULL,
    country_code VARCHAR(5) NOT NULL,
    is_verified BOOLEAN DEFAULT FALSE,
    last_code_request timestamp without time zone,
    code_requests_count INTEGER DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, phone_number)
);

-- Verification Codes Table
CREATE TABLE verification_codes (
    id SERIAL PRIMARY KEY,
    phone_verification_id INTEGER NOT NULL REFERENCES phone_verifications(id),
    code VARCHAR(6) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    attempts INTEGER DEFAULT 0,
    is_used BOOLEAN DEFAULT FALSE,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

-- Create indices for faster lookups
CREATE INDEX idx_phone_verifications_user ON phone_verifications(user_id);
CREATE INDEX idx_verification_codes_phone ON verification_codes(phone_verification_id);
CREATE INDEX idx_verification_codes_expires ON verification_codes(expires_at);

-- Place Types Table
CREATE TABLE place_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    icon VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Countries Table
CREATE TABLE countries (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code CHAR(2) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create a states table
CREATE TABLE states (
  id SERIAL PRIMARY KEY,
  country_id INTEGER REFERENCES countries(id),
  name VARCHAR(100) NOT NULL,
  code VARCHAR(10) NOT NULL
);

-- Cities Table
CREATE TABLE cities (
    id SERIAL PRIMARY KEY,
    country_id INTEGER REFERENCES countries(id),
    state_id INTEGER REFERENCES states(id),
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(country_id, name)
);

CREATE INDEX idx_cities_country ON cities(country_id);

-- Locations Table
CREATE TABLE locations (
    id SERIAL PRIMARY KEY,
    city_id INTEGER REFERENCES cities(id) NOT NULL,
    address TEXT NOT NULL,
    coordinates geography(POINT) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Locations Table Indexes
CREATE INDEX idx_locations_coordinates ON locations USING GIST(coordinates);
CREATE INDEX idx_locations_city ON locations(city_id);

-- Properties Table
CREATE TABLE properties (
    id SERIAL PRIMARY KEY,
    host_id INTEGER NOT NULL REFERENCES users(id),
    place_type_id INTEGER REFERENCES place_types(id),
    location_id INTEGER REFERENCES locations(id),
    max_guests INTEGER NOT NULL,
    bedrooms INTEGER NOT NULL,
    beds INTEGER NOT NULL,
    bathrooms INTEGER NOT NULL,
    roommates INTEGER DEFAULT 0,
    size_sqm DECIMAL(8,2),
    title VARCHAR(35) NOT NULL,
    description VARCHAR(105),
    last_minute_enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT title_length CHECK (char_length(title) <= 35),
    CONSTRAINT description_length CHECK (char_length(description) <= 105)
);

-- Properties Table Indexes
CREATE INDEX idx_properties_host_id ON properties(host_id);
CREATE INDEX idx_properties_place_type_id ON properties(place_type_id);
CREATE INDEX idx_properties_location_id ON properties(location_id);
CREATE INDEX idx_properties_created_at ON properties(created_at);
CREATE INDEX idx_properties_title ON properties USING GIN (to_tsvector('english', title));

-- Photos Table
CREATE TABLE property_photos (
    id SERIAL PRIMARY KEY,
    property_id INTEGER REFERENCES properties(id) ON DELETE CASCADE,
    photo_url TEXT NOT NULL,
    display_order INTEGER NOT NULL,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_property_photo_order UNIQUE (property_id, display_order)
);

-- Property Photos Index
CREATE INDEX idx_property_photos_property_id ON property_photos(property_id);
CREATE INDEX idx_property_photos_display_order ON property_photos(property_id, display_order);

-- Availability Table
CREATE TABLE availability (
    id SERIAL PRIMARY KEY,
    property_id INTEGER REFERENCES properties(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    price_per_night DECIMAL(10,2) NOT NULL,
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_date_range CHECK (end_date >= start_date)
);

-- Availability Indexes
CREATE INDEX idx_availability_property_id ON availability(property_id);
-- For date range queries
CREATE INDEX idx_availability_dates ON availability(property_id, start_date, end_date);
CREATE INDEX idx_availability_price ON availability(price_per_night);

-- First create the amenities master table
CREATE TABLE amenities (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    icon VARCHAR(50) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Then create the junction table property_amenities
CREATE TABLE property_amenities (
    id SERIAL PRIMARY KEY,
    property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    amenity_id INTEGER NOT NULL REFERENCES amenities(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Prevent duplicate amenities for the same property
    UNIQUE(property_id, amenity_id)
);

-- Property Amenities Index
CREATE INDEX idx_property_amenities_property_id ON property_amenities(property_id);
CREATE INDEX idx_property_amenities_amenity_id ON property_amenities(amenity_id);


-- First create the styles table
CREATE TABLE styles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    icon VARCHAR(50) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create property_styles junction table
CREATE TABLE property_styles (
    id SERIAL PRIMARY KEY,
    property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    style_id INTEGER NOT NULL REFERENCES styles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(property_id, style_id)
);

CREATE INDEX idx_property_styles_property_id ON property_styles(property_id);
CREATE INDEX idx_property_styles_style_id ON property_styles(style_id);

-- Create rules table
CREATE TABLE rules (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    icon VARCHAR(50) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create property_rules junction table
CREATE TABLE property_rules (
    id SERIAL PRIMARY KEY,
    property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    rule_id INTEGER NOT NULL REFERENCES rules(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(property_id, rule_id)
);

-- Property Dates Table
CREATE TABLE property_dates (
    id SERIAL PRIMARY KEY,
    property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    price_per_night DECIMAL NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_property_dates_property_id ON property_dates(property_id);
CREATE INDEX idx_property_dates_date_range ON property_dates(start_date, end_date);

CREATE TABLE otp (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    otp_code VARCHAR(4) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '60 minutes')
);

-- Create index for faster lookups and cleanup
CREATE INDEX idx_otp_email ON otp(email);
CREATE INDEX idx_otp_expires_at ON otp(expires_at);


-- Property Rules Index
CREATE INDEX idx_property_rules_property_id ON property_rules(property_id);
CREATE INDEX idx_property_rules_rule_id ON property_rules(rule_id);

CREATE TABLE reviews (
    id SERIAL PRIMARY KEY,
    property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating DECIMAL(2,1) NOT NULL CHECK (rating >= 0 AND rating <= 5),
    comment TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_property_review UNIQUE (user_id, property_id)
);

-- Add an index to improve query performance
CREATE INDEX idx_reviews_property_id ON reviews(property_id);
CREATE INDEX idx_reviews_user_id ON reviews(user_id);


-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_reviews_updated_at
    BEFORE UPDATE ON reviews
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


CREATE TABLE property_swipes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    is_favorite BOOLEAN NOT NULL,  -- true for right swipe (favorite), false for left swipe (reject)
    hide_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, property_id)  -- prevent multiple swipes on same property
);

-- Add indexes for better query performance
CREATE INDEX idx_property_swipes_user_id ON property_swipes(user_id);
CREATE INDEX idx_property_swipes_property_id ON property_swipes(property_id);

CREATE TABLE property_swipe_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    is_favorite BOOLEAN NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_property_swipe_history_user_id ON property_swipe_history(user_id);
CREATE INDEX idx_property_swipe_history_property_id ON property_swipe_history(property_id);


CREATE OR REPLACE FUNCTION reset_property_hide_until()
RETURNS TRIGGER AS $$
BEGIN
    -- Only run if there's an actual change to relevant property attributes
    IF (OLD.updated_at != NEW.updated_at) THEN
        
        -- Clear hide_until for all swipes related to this property
        UPDATE property_swipes
        SET hide_until = NULL
        WHERE property_id = NEW.id;
    END IF;
    
    -- Update the updated_at timestamp
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reset_property_hide_until_trigger
BEFORE UPDATE ON properties
FOR EACH ROW
EXECUTE FUNCTION reset_property_hide_until();

CREATE OR REPLACE FUNCTION find_properties_within_range(
    user_id INTEGER,
    distance_range_meters FLOAT DEFAULT 10000  -- 10km default
)
RETURNS TABLE (
    property_id INTEGER,
    property_title VARCHAR(35),
    host_id INTEGER,
    address TEXT,
    city_name VARCHAR(255),
    distance_meters FLOAT,
    max_guests INTEGER,
    bedrooms INTEGER,
    beds INTEGER,
    bathrooms INTEGER,
    is_within_range BOOLEAN
)
LANGUAGE SQL
AS $$
    SELECT 
        p.id AS property_id,
        p.title AS property_title,
        p.host_id,
        l.address,
        c.name AS city_name,
        ST_Distance(l.coordinates, u.location) AS distance_meters,
        p.max_guests,
        p.bedrooms,
        p.beds,
        p.bathrooms,
        ST_DWithin(l.coordinates, u.location, distance_range_meters) AS is_within_range
    FROM 
        properties p
    JOIN 
        locations l ON p.location_id = l.id
    JOIN 
        cities c ON l.city_id = c.id
    CROSS JOIN (
        SELECT location
        FROM users
        WHERE id = user_id
    ) AS u
    ORDER BY
        distance_meters ASC;
$$;

INSERT INTO countries (name, code) VALUES
('United States', 'US'),
('Israel', 'IL');

INSERT INTO states (country_id, name, code) 
VALUES ((SELECT id FROM countries WHERE code = 'US'), 'Florida', 'FL'),
         ((SELECT id FROM countries WHERE code = 'US'), 'New York', 'NY');

-- Insert Israeli cities (no state_id needed)
INSERT INTO cities (country_id, name, state_id) VALUES
((SELECT id FROM countries WHERE code = 'IL'), 'Tel Aviv', NULL);

-- Insert all the Florida cities
INSERT INTO cities (country_id, name, state_id) VALUES
((SELECT id FROM countries WHERE code = 'US'), 'Aventura', 
 (SELECT id FROM states WHERE code = 'FL')),
((SELECT id FROM countries WHERE code = 'US'), 'Fort Lauderdale', 
 (SELECT id FROM states WHERE code = 'FL')),
((SELECT id FROM countries WHERE code = 'US'), 'Hallandale Beach', 
 (SELECT id FROM states WHERE code = 'FL')),
((SELECT id FROM countries WHERE code = 'US'), 'Hollywood', 
 (SELECT id FROM states WHERE code = 'FL')),
((SELECT id FROM countries WHERE code = 'US'), 'Miami Beach', 
 (SELECT id FROM states WHERE code = 'FL')),
((SELECT id FROM countries WHERE code = 'US'), 'North Miami Beach', 
 (SELECT id FROM states WHERE code = 'FL')),
((SELECT id FROM countries WHERE code = 'US'), 'South Beach Miami', 
 (SELECT id FROM states WHERE code = 'FL')),
((SELECT id FROM countries WHERE code = 'US'), 'Sunny Isles Beach', 
 (SELECT id FROM states WHERE code = 'FL')),
((SELECT id FROM countries WHERE code = 'US'), 'Brickell Miami', 
 (SELECT id FROM states WHERE code = 'FL')),
((SELECT id FROM countries WHERE code = 'US'), 'Coconut Grove Miami', 
 (SELECT id FROM states WHERE code = 'FL')),
((SELECT id FROM countries WHERE code = 'US'), 'Design District Miami', 
 (SELECT id FROM states WHERE code = 'FL')),
((SELECT id FROM countries WHERE code = 'US'), 'Downtown Miami', 
 (SELECT id FROM states WHERE code = 'FL')),
((SELECT id FROM countries WHERE code = 'US'), 'Edgewater Miami', 
 (SELECT id FROM states WHERE code = 'FL')),
((SELECT id FROM countries WHERE code = 'US'), 'Midtown Miami', 
 (SELECT id FROM states WHERE code = 'FL')),
((SELECT id FROM countries WHERE code = 'US'), 'Wynwood, Miami', 
 (SELECT id FROM states WHERE code = 'FL')),
((SELECT id FROM countries WHERE code = 'US'), 'Manhattan', 
 (SELECT id FROM states WHERE code = 'NY')),
((SELECT id FROM countries WHERE code = 'US'), 'Brooklyn', 
 (SELECT id FROM states WHERE code = 'NY')),
((SELECT id FROM countries WHERE code = 'US'), 'Queens', 
 (SELECT id FROM states WHERE code = 'NY')),
((SELECT id FROM countries WHERE code = 'US'), 'The Bronx', 
 (SELECT id FROM states WHERE code = 'NY')),
((SELECT id FROM countries WHERE code = 'US'), 'Staten Island', 
 (SELECT id FROM states WHERE code = 'NY'));

-- Insert some common amenities
INSERT INTO amenities (name, icon) VALUES
    ('WiFi', 'wifi'),
    ('TV', 'tv'),
    ('Dish washer', 'dish_washer'),
    ('Heater', 'heater'),
    ('Elevator', 'elevator'),
    ('Balcony', 'balcony'),
    ('Shelter', 'shelter'),
    ('Washer', 'washer'),
    ('Kitchen', 'kitchen'),
    ('Free Parking', 'free_parking'),
    ('Paid Parking', 'paid_parking');

-- Insert styles
INSERT INTO styles (name, icon) VALUES
    ('Peaceful', 'peaceful'),
    ('Unique', 'unique'),
    ('Family-friendly', 'family-friendly'),
    ('Stylish', 'stylish'),
    ('Central', 'central'),
    ('Spacious', 'spacious');

-- Insert place_types
INSERT INTO place_types (name, icon) VALUES
    ('House', 'house'),
    ('Room', 'room'),
    ('Flat Villa', 'flat_villa'),
    ('Basement', 'basement'),
    ('Penthouse', 'penthouse'),
    ('Apartment', 'apartment'),
    ('Studio', 'studio');

-- Insert rules
INSERT INTO rules (name, icon) VALUES
    ('Pets', 'pets'),
    ('Smoking', 'smoking'),
    ('Noise at night', 'noise_at_night');