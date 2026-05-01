function serializeBaseline(snapshot) {
  return JSON.stringify(snapshot);
}

function parseBaseline(value) {
  return JSON.parse(value);
}

module.exports = { serializeBaseline, parseBaseline };
