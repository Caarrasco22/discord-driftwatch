const fs = require('fs');
const path = require('path');

const levels = ['debug', 'info', 'warn', 'error'];
const configuredLevel = process.env.LOG_LEVEL || 'info';

function shouldLog(level) {
  return levels.indexOf(level) >= levels.indexOf(configuredLevel);
}

function write(level, message, meta) {
  if (!shouldLog(level)) return;

  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    message,
    ...(meta ? { meta } : {})
  });

  console[level === 'debug' ? 'log' : level](line);

  try {
    const logsDir = path.resolve(process.cwd(), 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    fs.appendFileSync(path.join(logsDir, 'driftwatch.log'), `${line}\n`);
  } catch (error) {
    console.warn(JSON.stringify({
      time: new Date().toISOString(),
      level: 'warn',
      message: 'Unable to write log file',
      meta: { error: error.message }
    }));
  }
}

module.exports = {
  debug: (message, meta) => write('debug', message, meta),
  info: (message, meta) => write('info', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  error: (message, meta) => write('error', message, meta)
};
