const fs = require('fs');
const path = require('path');

const REQUIRED_FILES = [
  'package.json',
  '.env.example',
  'src/index.js',
  'src/deploy-commands.js',
  'src/commands/driftwatch.js',
  'src/db/schema.sql'
];

const REQUIRED_ENV = [
  'DISCORD_TOKEN',
  'DISCORD_CLIENT_ID'
];

const OPTIONAL_ENV = [
  'DISCORD_GUILD_ID'
];

const REQUIRED_DEPENDENCIES = [
  'discord.js',
  'better-sqlite3',
  'dotenv'
];

function main() {
  const root = process.cwd();
  const results = [];
  const env = readEnvFile(path.join(root, '.env'), results);

  checkNodeVersion(results);
  checkRequiredFiles(root, results);
  checkDependencies(root, results);
  checkEnvironment(env, results);
  checkDatabasePath(root, env, results);

  printResults(results);
  process.exitCode = results.some((item) => item.status === 'FAIL') ? 1 : 0;
}

function checkNodeVersion(results) {
  const major = Number(process.versions.node.split('.')[0]);
  add(results, major >= 20 ? 'PASS' : 'FAIL', `Node.js ${process.versions.node}`, 'Node.js 20 or newer is recommended for Driftwatch v0.1.');
}

function checkRequiredFiles(root, results) {
  for (const file of REQUIRED_FILES) {
    add(results, fs.existsSync(path.join(root, file)) ? 'PASS' : 'FAIL', `required file exists: ${file}`);
  }
}

function checkDependencies(root, results) {
  for (const dependency of REQUIRED_DEPENDENCIES) {
    try {
      require(require.resolve(dependency, { paths: [root] }));
      add(results, 'PASS', `dependency loaded: ${dependency}`);
    } catch (error) {
      add(results, 'FAIL', `dependency loaded: ${dependency}`, 'Run npm install, then run npm run doctor again.');
    }
  }
}

function readEnvFile(envPath, results) {
  if (!fs.existsSync(envPath)) {
    add(results, 'FAIL', '.env exists', 'Create it with: cp .env.example .env');
    return {};
  }

  add(results, 'PASS', '.env exists');
  const values = {};
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, '');
    values[key] = value;
  }
  return values;
}

function checkEnvironment(env, results) {
  for (const key of REQUIRED_ENV) {
    add(results, env[key] ? 'PASS' : 'FAIL', `${key} configured`);
  }

  for (const key of OPTIONAL_ENV) {
    add(results, env[key] ? 'PASS' : 'WARN', `${key} configured`, `${key} is optional, but guild commands deploy faster during testing.`);
  }
}

function checkDatabasePath(root, env, results) {
  const databasePath = env.DATABASE_PATH || './data/driftwatch.sqlite';
  const resolved = path.resolve(root, databasePath);
  const directory = path.dirname(resolved);

  try {
    fs.mkdirSync(directory, { recursive: true });
    fs.accessSync(directory, fs.constants.W_OK);
    add(results, 'PASS', `database directory writable: ${path.relative(root, directory) || '.'}`);
  } catch (error) {
    add(results, 'FAIL', `database directory writable: ${directory}`, error.message);
  }
}

function printResults(results) {
  console.log('Driftwatch Doctor');
  console.log('Local self-hosting checks\n');

  for (const result of results) {
    console.log(`${result.status} ${result.message}`);
    if (result.detail) console.log(`  ${result.detail}`);
  }

  const counts = results.reduce((total, item) => {
    total[item.status] = (total[item.status] || 0) + 1;
    return total;
  }, {});
  console.log(`\nDoctor summary: PASS ${counts.PASS || 0} | WARN ${counts.WARN || 0} | FAIL ${counts.FAIL || 0}`);
}

function add(results, status, message, detail = null) {
  results.push({ status, message, detail });
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
  readEnvFile,
  checkNodeVersion,
  checkRequiredFiles,
  checkEnvironment,
  checkDatabasePath
};
