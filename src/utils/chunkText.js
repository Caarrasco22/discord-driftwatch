function chunkText(text, maxLength = 1900) {
  const value = String(text || '');
  if (value.length <= maxLength) return [value];

  const chunks = [];
  for (let index = 0; index < value.length; index += maxLength) {
    chunks.push(value.slice(index, index + maxLength));
  }
  return chunks;
}

module.exports = { chunkText };
