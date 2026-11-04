-- Better Auth stores authorization codes as JSON text without a user foreign key.
CREATE FUNCTION guard_oauth_verification_owner() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE payload jsonb;
BEGIN
  IF NEW.value IS JSON OBJECT THEN
    payload := NEW.value::jsonb;
    IF payload->>'type' = 'authorization_code' THEN
      PERFORM id FROM "user" WHERE id=payload->>'userId' FOR KEY SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Authorization code owner unavailable' USING ERRCODE='23503';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER verification_owner_exists BEFORE INSERT OR UPDATE OF value ON verification
FOR EACH ROW EXECUTE FUNCTION guard_oauth_verification_owner();
