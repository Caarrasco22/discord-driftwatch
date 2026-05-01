const { initDatabase } = require('./database');

function runMigrations() {
  return initDatabase();
}

module.exports = { runMigrations };
