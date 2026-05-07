-- Enable Row Level Security on the Drizzle migrations tracking table.
-- This table stores migration hashes and timestamps. It should never be
-- readable or writable by anon/authenticated users. With RLS enabled and
-- no policies, only the service_role (server backend) and table owner
-- can access it.
ALTER TABLE "__drizzle_migrations" ENABLE ROW LEVEL SECURITY;
