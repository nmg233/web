const crypto = require('crypto');

// 12 位、四类字符；首位为字母/数字，方便 CSV 原样分发且不会被解释为公式。
const CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*?';

function generateTemporaryPassword() {
  let password;
  do {
    password = Array.from({ length: 12 }, () => CHARACTERS[crypto.randomInt(CHARACTERS.length)]).join('');
  } while (!/^[A-Za-z0-9]/.test(password) || !/[A-Z]/.test(password)
    || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[!@#$%&*?]/.test(password));
  return password;
}

module.exports = { generateTemporaryPassword };
