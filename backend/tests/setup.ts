const databasePath = process.env.DATABASE_PATH;

const isSafeDatabasePath =
  databasePath === ":memory:" ||
  databasePath?.startsWith("/tmp/") ||
  databasePath?.includes("-test-");

if (!isSafeDatabasePath) {
  console.error(
    `Unsafe DATABASE_PATH for tests: ${databasePath ?? "<unset>"}. ` +
      "Allowed values are :memory:, /tmp/*, or any path containing -test-.",
  );
  process.exit(1);
}
