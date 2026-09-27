-- +goose Up
ALTER TABLE organizer_profile_history DROP CONSTRAINT organizer_profile_history_type_chk;
ALTER TABLE organizer_profile_history
  ADD CONSTRAINT organizer_profile_history_type_chk CHECK (
    event_type IN (
      'SUBMITTED',
      'EDITED',
      'RESUBMITTED',
      'APPROVED',
      'REJECTED',
      'SUSPENDED',
      'RESTORED',
      'APPEALED',
      'APPEAL_DISMISSED',
      'REVOKED'
    )
  );

-- +goose Down
ALTER TABLE organizer_profile_history DROP CONSTRAINT organizer_profile_history_type_chk;
ALTER TABLE organizer_profile_history
  ADD CONSTRAINT organizer_profile_history_type_chk CHECK (
    event_type IN (
      'SUBMITTED',
      'EDITED',
      'RESUBMITTED',
      'APPROVED',
      'REJECTED',
      'SUSPENDED',
      'RESTORED',
      'APPEALED',
      'APPEAL_DISMISSED'
    )
  );
