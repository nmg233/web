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

export function downloadAccounts(accounts, filename = '用户登录账号.csv') {
  const url = URL.createObjectURL(new Blob([accountsToCSV(accounts)], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
