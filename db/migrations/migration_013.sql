ALTER TABLE cities ADD COLUMN coordinates GEOGRAPHY(POINT, 4326);
ALTER TABLE cities ADD COLUMN radius INTEGER DEFAULT 5000;

-- Add a comment explaining what these columns are
COMMENT ON COLUMN cities.coordinates IS 'Geographic coordinates (longitude, latitude) representing the city center';
COMMENT ON COLUMN cities.radius IS 'Approximate radius of the city in meters';

-- Create a GiST index for the coordinates for faster spatial queries
CREATE INDEX idx_cities_coordinates ON cities USING GIST (coordinates);