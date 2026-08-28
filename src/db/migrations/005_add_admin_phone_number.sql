ALTER TABLE admins
ADD COLUMN IF NOT EXISTS phone_number TEXT;

UPDATE admins
SET phone_number = '251978164708'
WHERE email = 'admin@test.com'
  AND phone_number IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'admins_phone_number_key'
  ) THEN
    ALTER TABLE admins
    ADD CONSTRAINT admins_phone_number_key UNIQUE (phone_number);
  END IF;
END $$;
