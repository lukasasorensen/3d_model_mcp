import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function databaseShellArguments(connectionString) {
  let connection;
  try {
    connection = new URL(connectionString);
    if (!["postgres:", "postgresql:"].includes(connection.protocol))
      throw new Error();
    const database = decodeURIComponent(connection.pathname.slice(1));
    const user = decodeURIComponent(connection.username || "postgres");
    if (!database || database.includes("\0") || user.includes("\0"))
      throw new Error();
    return [
      "compose",
      "-f",
      "compose.local.yaml",
      "exec",
      "postgres",
      "psql",
      "-U",
      user,
      "-d",
      database,
    ];
  } catch {
    throw new Error(
      "DATABASE_URL must be a PostgreSQL URL with a database name.",
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const result = spawnSync(
      "docker",
      databaseShellArguments(process.env.DATABASE_URL),
      { stdio: "inherit" },
    );
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
