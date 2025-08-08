-- Migration: create_app_version_table

CREATE TABLE app_version (
  id SERIAL PRIMARY KEY,
  version VARCHAR(50) NOT NULL,
  ios_build_number INTEGER NOT NULL DEFAULT 1,
  android_build_number INTEGER NOT NULL DEFAULT 1,
  environment VARCHAR(20) NOT NULL DEFAULT 'develop', -- 'production' or 'develop'
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  required_update BOOLEAN DEFAULT FALSE,
  message TEXT,
  ios_download_url VARCHAR(255),
  android_download_url VARCHAR(255)
);

CREATE INDEX idx_app_version_environment ON app_version(environment);

INSERT INTO app_version (
  version,
  ios_build_number,
  android_build_number,
  environment, 
  required_update, 
  message, 
  ios_download_url, 
  android_download_url
)
VALUES (
  '1.0.0',
  1, 
  1, 
  'production', 
  false, 
  NULL, 
  'https://testflight.apple.com/join/kBMeYetz', 
  'https://play.google.com/apps/internaltest/4701552281438001759'
);

INSERT INTO app_version (
  version,
  ios_build_number,
  android_build_number,
  environment, 
  required_update, 
  message, 
  ios_download_url, 
  android_download_url
)
VALUES (
  '1.0.0',
  1, 
  1, 
  'develop', 
  false, 
  NULL, 
  'https://testflight.apple.com/join/kBMeYetz', 
  'https://play.google.com/apps/internaltest/4701552281438001759'
);
