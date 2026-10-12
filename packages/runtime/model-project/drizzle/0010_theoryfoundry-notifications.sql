-- Update existing database triggers to publish on the TheoryFoundry channel.
CREATE OR REPLACE FUNCTION notify_project_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('theoryfoundry_changes', json_build_object('kind', 'project', 'ownerId', NEW.owner_id, 'projectId', NEW.id)::text);
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION notify_render_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE changed browser_render_jobs;
BEGIN
  IF TG_OP = 'DELETE' THEN changed := OLD; ELSE changed := NEW; END IF;
  PERFORM pg_notify('theoryfoundry_changes', json_build_object('kind', 'render', 'ownerId', changed.owner_id, 'projectId', changed.project_id, 'jobId', changed.id)::text);
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION notify_preview_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE changed browser_preview_jobs;
BEGIN
  IF TG_OP = 'DELETE' THEN changed := OLD; ELSE changed := NEW; END IF;
  PERFORM pg_notify('theoryfoundry_changes', json_build_object('kind', 'preview', 'ownerId', changed.owner_id, 'projectId', changed.project_id, 'jobId', changed.id)::text);
  RETURN NULL;
END;
$$;
