ALTER TABLE notifications ADD COLUMN IF NOT EXISTS category varchar(50) NOT NULL DEFAULT 'general';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notifications_category_check'
  ) THEN
    ALTER TABLE notifications ADD CONSTRAINT notifications_category_check
      CHECK (category IN ('users', 'letters', 'employee', 'general'));
  END IF;
END $$;
