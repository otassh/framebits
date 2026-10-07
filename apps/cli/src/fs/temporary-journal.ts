import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Give one CLI transaction an isolated backup directory and remove it after
 * both success and failure. The operation error remains primary when cleanup
 * also fails, while the cleanup detail is retained in the surfaced message.
 */
export async function withTemporaryJournal<T>(
  operation: (journalDir: string) => Promise<T>,
  tempRoot: string = tmpdir(),
): Promise<T> {
  const journalDir = await mkdtemp(join(tempRoot, "framebits-journal-"));
  // Journal holds backups of user files: restrict to owner-only (0700,
  // best-effort on Windows where chmod is a no-op for ACLs).
  try {
    await chmod(journalDir, 0o700);
  } catch {
    // Best-effort.
  }
  let outcome: { ok: true; value: T } | { ok: false; error: unknown };
  try {
    outcome = { ok: true, value: await operation(journalDir) };
  } catch (error) {
    outcome = { ok: false, error };
  }

  let cleanupError: unknown;
  try {
    await rm(journalDir, { recursive: true, force: true });
  } catch (error) {
    cleanupError = error;
  }

  if (!outcome.ok) {
    if (cleanupError !== undefined) {
      throw new Error(
        `${errorMessage(outcome.error)} (journal cleanup failed for ${journalDir}: ${errorMessage(cleanupError)})`,
        { cause: outcome.error },
      );
    }
    throw outcome.error;
  }
  if (cleanupError !== undefined) {
    throw new Error(`journal cleanup failed for ${journalDir}: ${errorMessage(cleanupError)}`, {
      cause: cleanupError,
    });
  }
  return outcome.value;
}
