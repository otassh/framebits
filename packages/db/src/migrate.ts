import { createPostgresStore } from "./index.js";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  process.stderr.write("DATABASE_URL is required\n");
  process.exitCode = 1;
} else {
  const store = createPostgresStore(databaseUrl);
  try {
    await store.migrate();
    process.stdout.write("Database migrations applied\n");
  } catch {
    process.stderr.write("Database migration failed; check database configuration\n");
    process.exitCode = 1;
  } finally {
    await store.close();
  }
}
