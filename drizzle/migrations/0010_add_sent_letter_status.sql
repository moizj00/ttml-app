ALTER TYPE "letter_status" ADD VALUE IF NOT EXISTS 'pipeline_failed';
ALTER TYPE "letter_status" ADD VALUE IF NOT EXISTS 'sent';
