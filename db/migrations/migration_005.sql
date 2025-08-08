-- Migration: add_rejected_status_to_property_tables.sql

-- 1. Update property_swipes table constraint
ALTER TABLE property_swipes
DROP CONSTRAINT IF EXISTS check_valid_status;

ALTER TABLE property_swipes
ADD CONSTRAINT check_valid_status 
CHECK (status IS NULL OR status IN ('pending', 'approved', 'withdrawn', 'rejected'));

COMMENT ON CONSTRAINT check_valid_status ON property_swipes IS 
'Ensures that status can only be NULL, pending, approved, withdrawn, or rejected';

-- 2. Update property_swipe_history table constraint
ALTER TABLE property_swipe_history
DROP CONSTRAINT IF EXISTS check_valid_action;

ALTER TABLE property_swipe_history
ADD CONSTRAINT check_valid_action
CHECK (action::text = ANY (ARRAY['like'::character varying::text, 'dislike'::character varying::text, 'withdraw'::character varying::text, 'reject'::character varying::text]));

COMMENT ON CONSTRAINT check_valid_action ON property_swipe_history IS
'Ensures that action can only be like, dislike, withdraw, or reject';