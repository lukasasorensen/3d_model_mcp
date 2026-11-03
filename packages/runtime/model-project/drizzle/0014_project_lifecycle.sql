ALTER TABLE "projects" ADD COLUMN "is_archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "is_deleted" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TRIGGER project_deleted_changed AFTER UPDATE OF is_deleted ON projects
FOR EACH ROW WHEN (OLD.is_deleted IS DISTINCT FROM NEW.is_deleted)
EXECUTE FUNCTION notify_project_change();
