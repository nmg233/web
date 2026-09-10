// 只导出账号清单，不包含密码、令牌或其他认证信息。
export function accountsToCSV(accounts) {
  const roles = { admin: '管理员', academic_mentor: '学术导师', teacher: '教师', student: '学生', media: '新媒体' };
  const cell = (value) => {
    let text = String(value ?? '');
    // 防止姓名、学校等用户输入被电子表格解释为公式。
    if (/^[\s]*[=+@-]|^[\t\r\n]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const rows = [
    ['姓名', '登录账号', '身份', '学校', '班级'],
    ...accounts.map((u) => [u.real_name, u.username, roles[u.role] || u.role, u.school_name, u.class_name]),
  ];
  return '\uFEFF' + rows.map((row) => row.map(cell).join(',')).join('\r\n');
}

// 仅创建/导入的当次结果显式调用，普通账号清单仍不导出密码。
export function temporaryAccountsToCSV(accounts) {
  const cell = (value) => {
    let text = String(value ?? '');
    if (/^[\s]*[=+@-]|^[\t\r\n]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return '\uFEFF' + [
    ['姓名', '登录账号', '临时密码'],
    ...accounts.map((u) => [u.real_name, u.username, u.temp_password]),
  ].map((row) => row.map(cell).join(',')).join('\r\n');
}

function downloadCSV(csv, filename) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadAccounts(accounts, filename = '用户登录账号.csv') {
  downloadCSV(accountsToCSV(accounts), filename);
}

export function downloadTemporaryAccounts(accounts) {
  downloadCSV(temporaryAccountsToCSV(accounts), '本次导入临时密码.csv');
}
