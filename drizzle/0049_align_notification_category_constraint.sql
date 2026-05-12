-- Align production notification categories with application-emitted categories.
--
-- Context:
-- Free-preview notification inserts use category = 'letters'. Production drift
-- previously had chk_notification_category allowing only legacy categories,
-- which caused in-app notification inserts to fail while email/preview unlock
-- still succeeded.

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS chk_notification_category;

ALTER TABLE notifications
  ADD CONSTRAINT chk_notification_category
  CHECK (
    category IN (
      'general',
      'system',
      'letter_update',
      'letters',
      'billing',
      'marketing',
      'users',
      'employee'
    )
  );
