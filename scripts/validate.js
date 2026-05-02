const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REQUIRED_FILES = [
  'src/index.js',
  'src/deploy-commands.js',
  'src/commands/driftwatch.js',
  'src/db/database.js',
  'src/db/schema.sql',
  'scripts/doctor.js',
  '.env.example',
  'README.md'
];

const COMMONJS_MODULES = [
  './src/commands/driftwatch',
  './src/audits/logsAudit',
  './src/engines/logIntelligenceEngine',
  './src/engines/currentRiskEngine',
  './src/engines/riskScoreEngine',
  './src/reports/reportEmbeds',
  './src/reports/findingFormatter',
  './src/i18n',
  './scripts/doctor'
];

const FORBIDDEN_INTENTS = [
  'GatewayIntentBits.MessageContent',
  'GatewayIntentBits.GuildPresences',
  'GatewayIntentBits.GuildMembers',
  'IntentsBitField.Flags.MessageContent',
  'IntentsBitField.Flags.GuildPresences',
  'IntentsBitField.Flags.GuildMembers'
];

const RAW_AUDIT_PATTERNS = [
  'JSON.stringify(entry)',
  'JSON.stringify(auditLog)',
  'JSON.stringify(auditLogs)',
  'rawAuditLog',
  'raw_audit_log'
];

function main() {
  const root = process.cwd();
  const results = [];
  const jsFiles = listJavaScriptFiles(root);

  checkPackageJson(root, results);
  checkRequiredFiles(root, results);
  checkSyntax(root, jsFiles, results);
  checkCommonJsLoads(root, results);
  checkForbiddenStrings(root, jsFiles, results);
  checkSafeToAutoFix(root, jsFiles, results);
  checkRawAuditStorageHints(root, jsFiles, results);

  printResults(results);
  const failed = results.some((item) => item.status === 'FAIL');
  process.exitCode = failed ? 1 : 0;
}

function checkPackageJson(root, results) {
  try {
    JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    add(results, 'PASS', 'package.json valid');
  } catch (error) {
    add(results, 'FAIL', `package.json invalid: ${error.message}`);
  }
}

function checkRequiredFiles(root, results) {
  for (const file of REQUIRED_FILES) {
    add(results, fs.existsSync(path.join(root, file)) ? 'PASS' : 'FAIL', `required file exists: ${file}`);
  }
}

function checkSyntax(root, jsFiles, results) {
  let checked = 0;
  for (const file of jsFiles) {
    const result = spawnSync(process.execPath, ['--check', file], {
      cwd: root,
      encoding: 'utf8'
    });
    if (result.status !== 0) {
      add(results, 'FAIL', `syntax error: ${relative(root, file)}`, cleanOutput(result.stderr || result.stdout));
      continue;
    }
    checked += 1;
  }
  add(results, 'PASS', `checked ${checked} JS files`);
}

function checkCommonJsLoads(root, results) {
  for (const modulePath of COMMONJS_MODULES) {
    const result = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(modulePath)})`], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, DRIFTWATCH_VALIDATE: '1' }
    });
    if (result.status === 0) {
      add(results, 'PASS', `CommonJS load: ${modulePath}`);
    } else {
      add(results, 'FAIL', `CommonJS load failed: ${modulePath}`, cleanOutput(result.stderr || result.stdout));
    }
  }
}

function checkForbiddenStrings(root, jsFiles, results) {
  const matches = findStringMatches(root, jsFiles, FORBIDDEN_INTENTS);
  if (matches.length === 0) {
    add(results, 'PASS', 'no privileged intents detected');
    return;
  }

  for (const match of matches) {
    add(results, 'FAIL', `Privileged intent detected. Driftwatch v0.1 should not enable this intent: ${match.pattern} in ${match.file}:${match.line}`);
  }
}

function checkSafeToAutoFix(root, jsFiles, results) {
  const matches = findRegexMatches(root, jsFiles, /safeToAutoFix\s*:\s*true/g);
  if (matches.length === 0) {
    add(results, 'PASS', 'safeToAutoFix remains false');
    return;
  }

  for (const match of matches) {
    add(results, 'FAIL', `safeToAutoFix true detected: ${match.file}:${match.line}`);
  }
}

function checkRawAuditStorageHints(root, jsFiles, results) {
  const matches = findStringMatches(root, jsFiles, RAW_AUDIT_PATTERNS);
  if (matches.length === 0) {
    add(results, 'PASS', 'no obvious raw audit log storage patterns detected');
    return;
  }

  for (const match of matches) {
    add(results, 'WARN', `possible raw audit log storage pattern: ${match.pattern} in ${match.file}:${match.line}`);
  }
}

function listJavaScriptFiles(root) {
  const roots = ['src', 'scripts'];
  const files = [];
  for (const folder of roots) {
    walk(path.join(root, folder), files);
  }
  return files.filter((file) => file.endsWith('.js'));
}

function walk(currentPath, files) {
  if (!fs.existsSync(currentPath)) return;
  const ignored = new Set(['node_modules', 'data', 'coverage', '.git']);
  for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const entryPath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      walk(entryPath, files);
    } else {
      files.push(entryPath);
    }
  }
}

function findStringMatches(root, jsFiles, patterns) {
  const matches = [];
  for (const file of jsFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split(/\r?\n/);
    for (const pattern of patterns) {
      lines.forEach((lineText, index) => {
        if (lineText.includes(pattern)) {
          matches.push({ pattern, file: relative(root, file), line: index + 1 });
        }
      });
    }
  }
  return matches;
}

function findRegexMatches(root, jsFiles, regex) {
  const matches = [];
  for (const file of jsFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split(/\r?\n/);
    lines.forEach((lineText, index) => {
      if (regex.test(lineText)) {
        matches.push({ file: relative(root, file), line: index + 1 });
      }
      regex.lastIndex = 0;
    });
  }
  return matches;
}

function printResults(results) {
  console.log('Driftwatch Validate');
  console.log('Static/local project checks\n');

  for (const result of results) {
    console.log(`${result.status} ${result.message}`);
    if (result.detail) {
      console.log(`  ${result.detail}`);
    }
  }

  const counts = results.reduce((total, item) => {
    total[item.status] = (total[item.status] || 0) + 1;
    return total;
  }, {});
  console.log(`\nValidation summary: PASS ${counts.PASS || 0} | WARN ${counts.WARN || 0} | FAIL ${counts.FAIL || 0}`);
}

function add(results, status, message, detail = null) {
  results.push({ status, message, detail });
}

function cleanOutput(value) {
  return String(value || '').trim().split(/\r?\n/).slice(0, 4).join('\n  ');
}

function relative(root, file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
  listJavaScriptFiles,
  checkPackageJson,
  checkRequiredFiles,
  checkForbiddenStrings,
  checkSafeToAutoFix
};
