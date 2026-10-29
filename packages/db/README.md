# @framebits/db

PostgreSQL storage for GitHub identities, hashed sessions, one-time OAuth
transactions, and shared rate limits. Build with `pnpm --filter @framebits/db build`.

Set `DATABASE_URL` in the root `.env` and run `pnpm db:migrate` to apply the
versioned schema. Migrations run in a transaction under an advisory lock and can
be rerun safely. The migration command only requires `DATABASE_URL`; HTTP routes
and GitHub sign-in are still pending in `@framebits/api`.

For real PostgreSQL integration checks, build the package, set
`TEST_DATABASE_URL` to a test database, then run
`pnpm --filter @framebits/db test:integration`. Each run creates and removes its
own temporary schema, testing migrations, concurrent OAuth consumption, session
rotation and rollback, concurrent rate limits, expiry, and cleanup.
