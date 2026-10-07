const { pinyin } = require('pinyin-pro');

function namePinyin(name) {
  const text = typeof name === 'string' ? name.trim() : '';
  if (!text || text.length > 80) throw Object.assign(new Error('姓名须为 1–80 个字符'), { status: 400 });
  const value = pinyin(text, { toneType: 'none', type: 'array', surname: 'head', v: true })
    .join('').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!value || value.length > 80) throw Object.assign(new Error('姓名无法生成有效拼音，请使用中文或英文字母姓名'), { status: 400 });
  return value;
}
module.exports = { namePinyin };
