-- Deduplicate existing rows before adding unique constraint (keep most recently updated per user)
DELETE FROM "subscriptions"
WHERE "id" NOT IN (
  SELECT DISTINCT ON ("user_id") "id"
  FROM "subscriptions"
  ORDER BY "user_id", "updated_at" DESC NULLS LAST, "id" DESC
);

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_unique" UNIQUE("user_id");