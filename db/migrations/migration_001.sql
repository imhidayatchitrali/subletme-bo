-- Create a states table
CREATE TABLE states (
  id SERIAL PRIMARY KEY,
  country_id INTEGER REFERENCES countries(id),
  name VARCHAR(100) NOT NULL,
  code VARCHAR(10) NOT NULL
);

ALTER TABLE cities ADD COLUMN state_id INTEGER REFERENCES states(id) NULL;
