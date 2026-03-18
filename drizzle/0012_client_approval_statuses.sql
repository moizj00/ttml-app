-- Migration: Add client_approval_pending and client_approved to letter_status enum
-- These values support Change 7: client approval step after attorney approval

ALTER TYPE letter_status ADD VALUE IF NOT EXISTS 'client_approval_pending';
ALTER TYPE letter_status ADD VALUE IF NOT EXISTS 'client_approved';
