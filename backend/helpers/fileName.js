function decodeOriginalName(name) {
  if (!name || /^[\x00-\x7F]*$/.test(name) || /[\u3400-\u9FFF]/.test(name)) return name;
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('\uFFFD') ? name : decoded;
}

module.exports = { decodeOriginalName };
