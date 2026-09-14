ALTER TYPE "public"."render_delivery_mode" ADD VALUE 'local-mcp';
--> statement-breakpoint
CREATE FUNCTION notify_project_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('rjls_changes', json_build_object('kind', 'project', 'ownerId', NEW.owner_id, 'projectId', NEW.id)::text);
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER project_current_changed AFTER UPDATE OF current_revision_id ON projects
FOR EACH ROW WHEN (OLD.current_revision_id IS DISTINCT FROM NEW.current_revision_id)
EXECUTE FUNCTION notify_project_change();
--> statement-breakpoint
CREATE FUNCTION notify_render_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE changed browser_render_jobs;
BEGIN
  IF TG_OP = 'DELETE' THEN changed := OLD; ELSE changed := NEW; END IF;
  PERFORM pg_notify('rjls_changes', json_build_object('kind', 'render', 'ownerId', changed.owner_id, 'projectId', changed.project_id, 'jobId', changed.id)::text);
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER render_job_changed AFTER INSERT OR UPDATE OR DELETE ON browser_render_jobs
FOR EACH ROW EXECUTE FUNCTION notify_render_change();
