const crypto = require('crypto');

function createId(prefix) {
  const id = crypto.randomUUID();
  return prefix ? `${prefix}_${id}` : id;
}

module.exports = { createId };
