const en = require('./en');
const es = require('./es');

const dictionaries = { en, es };

function getMessages(language) {
  return dictionaries[language] || dictionaries.en;
}

module.exports = { getMessages };
