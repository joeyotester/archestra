-- Add shareMode column (private, organization)
ALTER TABLE "conversations" ADD COLUMN "share_mode" text DEFAULT 'private' NOT NULL;

-- Migrate existing is_shared data if the column exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'is_shared') THEN
    UPDATE "conversations" SET "share_mode" = 'organization' WHERE "is_shared" = true;
    ALTER TABLE "conversations" DROP COLUMN "is_shared";
  END IF;
END $$;
