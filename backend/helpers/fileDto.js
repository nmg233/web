// 文件信息脱敏 DTO：API 响应不下发服务器绝对路径（file_path），
// 仅暴露前端展示所需的 has_file / file_name / file_type / file_size 等元数据。
// 下载仍走各自鉴权接口，内部继续使用 file_path。
function toFileDto(row) {
  if (!row) return row;
  const { file_path, ...rest } = row;
  return { ...rest, has_file: !!file_path };
}

module.exports = { toFileDto };
