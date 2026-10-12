// 主题装饰不得额外请求普通教师没有权限的课程详情。
export function staffThemeCourseId(pathname,role) {
 return ['admin','academic_mentor'].includes(role) ? pathname.match(/^\/courses\/(\d+)(?:\/|$)/)?.[1] : undefined;
}
