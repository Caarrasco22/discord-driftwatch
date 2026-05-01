module.exports = {
  defaultLanguage: process.env.DEFAULT_LANGUAGE || 'en',
  maxBaselines: 5,
  findingsRetentionDays: 30,
  auditRetentionDays: 30,
  databasePath: process.env.DATABASE_PATH || './data/driftwatch.sqlite'
};
