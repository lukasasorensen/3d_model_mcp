import type { Pool } from "pg";
export interface LocalAccountInput {
  email: string;
  name: string;
  password: string;
}
export class LocalSetupService {
  constructor(
    private readonly pool: Pick<Pool, "connect">,
    private readonly signup: (input: LocalAccountInput) => Promise<Response>,
  ) {}
  async create(input: LocalAccountInput): Promise<Response> {
    const connection = await this.pool.connect();
    let locked = false;
    try {
      // Serialize first-account creation across requests and application processes.
      locked =
        (
          await connection.query<{ acquired: boolean }>(
            "SELECT pg_try_advisory_lock(83726451) AS acquired",
          )
        ).rows[0]?.acquired === true;
      if (!locked)
        return Response.json(
          { error: { code: "SETUP_BUSY" } },
          { status: 409 },
        );
      const result = await connection.query<{ present: boolean }>(
        'SELECT EXISTS (SELECT 1 FROM "user") AS present',
      );
      if (result.rows[0]?.present)
        return Response.json(
          { error: { code: "SETUP_COMPLETE" } },
          { status: 409 },
        );
      return await this.signup(input);
    } finally {
      try {
        if (locked)
          await connection.query("SELECT pg_advisory_unlock(83726451)");
      } finally {
        connection.release();
      }
    }
  }
}
