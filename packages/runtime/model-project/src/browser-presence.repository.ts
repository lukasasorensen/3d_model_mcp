import type { Pool } from "pg";
import { browserPresenceSchema, type BrowserPresence } from "@rjls/contracts";
import { CadDomainError } from "./cad-domain-error.js";

export class BrowserPresenceRepository {
  constructor(private readonly pool: Pool, private readonly ownerId: string) {}
  async update(projectId: string, raw: BrowserPresence): Promise<void> {
    const status = browserPresenceSchema.parse(raw);
    const result = await this.pool.query(`INSERT INTO browser_presence (owner_id, project_id, session_id, status, tab_id)
      SELECT $1, id, $3, $4::jsonb, $5 FROM projects WHERE id = $2 AND owner_id = $1
      ON CONFLICT (owner_id, project_id, tab_id) DO UPDATE SET status = EXCLUDED.status, session_id = EXCLUDED.session_id, updated_at = now() RETURNING owner_id`,
    [this.ownerId, projectId, status.sessionId, JSON.stringify(status), status.tabId]);
    if (!result.rows.length) throw new CadDomainError("PROJECT_NOT_FOUND", "Project not found.");
    await this.pool.query("DELETE FROM browser_presence WHERE owner_id = $1 AND updated_at < now() - interval '45 seconds'", [this.ownerId]);
  }
  async availability(projectId: string, mode: "local-mcp" | "remote-mcp" | "chat"): Promise<"ready" | "busy" | "unavailable"> {
    const result = await this.pool.query<{ status: BrowserPresence; tab_id: string }>(`SELECT b.status, b.tab_id FROM browser_presence b JOIN projects p ON p.id = b.project_id AND p.owner_id = b.owner_id
      WHERE b.owner_id = $1 AND b.project_id = $2 AND b.updated_at > now() - interval '45 seconds'`, [this.ownerId, projectId]);
    const eligible = result.rows.map((r) => browserPresenceSchema.parse({ ...r.status, tabId: r.tab_id })).filter((s) => s.visible && s.ready && (mode === "chat" || (mode === "local-mcp" ? s.localEnabled : s.remoteEnabled)));
    return eligible.some((s) => !s.busy) ? "ready" : eligible.length ? "busy" : "unavailable";
  }
}
