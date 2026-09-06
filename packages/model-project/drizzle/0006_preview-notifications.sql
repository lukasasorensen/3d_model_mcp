CREATE FUNCTION notify_preview_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE changed browser_preview_jobs;
BEGIN
  IF TG_OP = 'DELETE' THEN changed := OLD; ELSE changed := NEW; END IF;
  PERFORM pg_notify('rjls_changes', json_build_object('kind', 'preview', 'ownerId', changed.owner_id, 'projectId', changed.project_id, 'jobId', changed.id)::text);
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER preview_job_changed AFTER INSERT OR UPDATE OR DELETE ON browser_preview_jobs
FOR EACH ROW EXECUTE FUNCTION notify_preview_change();
