# A Careful Finance Foundation

Fastifly is built to keep your records dependable.

Before adding advanced finance features, the app first needs to get the basics right: money, saving, access, and storage.

## Money Should Stay Exact

Fastifly stores money in a way that avoids rounding surprises.

If you save 12.55, the app should not quietly turn it into 12.549999 or 12.5500001 behind the scenes.

## Records Need Stable IDs

Every important record gets a stable ID.

That helps the app keep track of the same record across saving, syncing, importing, exporting, and backups.

## Database Changes Are Tested

Fastifly supports both SQLite and PostgreSQL.

That means you can choose a simple setup or a larger database setup. The project tests both paths so they do not drift apart.

## Errors Should Be Clear

When something fails, the app should respond in a predictable way.

Fastifly is built with request IDs, clear error shapes, and health checks so problems can be found and fixed instead of becoming mystery failures.

## Why This Matters

Finance apps become valuable over time.

After months or years, your history matters. A good foundation helps protect that history from small technical mistakes that become big user problems later.
