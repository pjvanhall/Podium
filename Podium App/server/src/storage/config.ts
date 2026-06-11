function getDataBackend() {
  const explicit = String(process.env.DATA_BACKEND || '').toLowerCase().trim();
  if (explicit) return explicit;

  if (process.env.DATABASE_URL && (process.env.NOSQL_CONNECTION_STRING || process.env.MONGODB_URI)) {
    return 'split';
  }

  return 'sqlite';
}

function isSplitStoreEnabled() {
  return getDataBackend() === 'split';
}

function getPostgresConnectionString() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
}

function getNoSqlConnectionString() {
  return process.env.NOSQL_CONNECTION_STRING || process.env.MONGODB_URI || '';
}

function getNoSqlDatabaseName() {
  return process.env.NOSQL_DB_NAME || process.env.MONGODB_DB_NAME || 'podium';
}

module.exports = {
  getDataBackend,
  getNoSqlConnectionString,
  getNoSqlDatabaseName,
  getPostgresConnectionString,
  isSplitStoreEnabled,
};
