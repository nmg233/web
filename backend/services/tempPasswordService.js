const { namePinyin } = require('../helpers/namePinyin');

function generateTemporaryPassword(realName) {
  const password = `${namePinyin(realName)}@123`;
  // bcrypt 仅处理前 72 字节，禁止悄悄截断长姓名生成的初始密码。
  if (Buffer.byteLength(password, 'utf8') > 72) {
    throw Object.assign(new Error('姓名拼音过长：初始密码不能超过 72 字节，请核对姓名'), { status: 400 });
  }
  return password;
}

module.exports = { generateTemporaryPassword };
