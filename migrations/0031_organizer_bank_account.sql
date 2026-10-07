-- +goose Up
-- Organizer bank account (for future payouts). Nullable so applications submitted earlier remain valid;
-- the application layer requires it for new submissions and resubmissions.
ALTER TABLE organizer_profiles ADD COLUMN IF NOT EXISTS bank_name VARCHAR(40);
ALTER TABLE organizer_profiles ADD COLUMN IF NOT EXISTS bank_account_name VARCHAR(80);
ALTER TABLE organizer_profiles ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(20);

-- +goose Down
ALTER TABLE organizer_profiles DROP COLUMN IF EXISTS bank_account_number;
ALTER TABLE organizer_profiles DROP COLUMN IF EXISTS bank_account_name;
ALTER TABLE organizer_profiles DROP COLUMN IF EXISTS bank_name;
