export const ROLE_HOME = {
  admin: '/dashboard',
  academic_mentor: '/dashboard',
  teacher: '/observer',
  student: '/explore',
  media: '/dashboard',
};

export function homeForRole(role) {
  return ROLE_HOME[role] || '/dashboard';
}

const COMMON_RULES = [
  /^\/change-password$/,
  /^\/feedback(?:\/new|\/\d+)?$/,
  /^\/notifications(?:\/\d+)?$/,
];

const ROLE_PATH_RULES = {
  admin: [
    /^\/admin\/(?:organization|teaching|settings)$/,
    /^\/mentor\/(?:organization|teaching|guide|requests|feedback)$/,
    /^\/reward-management$/,
    /^\/dashboard(?:\/schools\/\d+|\/ai)?$/,
    /^\/glider$/,
    /^\/courses(?:\/import|\/create|\/\d+|\/\d+\/edit|\/\d+\/lessons\/\d+\/content)?$/,
    /^\/students(?:\/\d+)?$/,
    /^\/works(?:\/\d+)?$/,
    /^\/tasks(?:\/\d+)?$/,
    /^\/archives$/,
    /^\/feedback\/manage$/,
    /^\/mentor\/(?:content|reviews(?:\/\d+)?)$/,
    /^\/observer(?:\/students(?:\/\d+)?)?$/,
  ],
  academic_mentor: [
    /^\/mentor\/(?:organization|teaching|guide|requests|feedback)$/,
    /^\/dashboard(?:\/ai)?$/,
    /^\/glider$/,
    /^\/courses(?:\/import|\/create|\/\d+|\/\d+\/edit|\/\d+\/lessons\/\d+\/content)?$/,
    /^\/students(?:\/\d+)?$/,
    /^\/works(?:\/\d+)?$/,
    /^\/tasks(?:\/\d+)?$/,
    /^\/archives$/,
    /^\/mentor\/(?:content|reviews(?:\/\d+)?)$/,
  ],
  teacher: [
    /^\/observer(?:\/students(?:\/\d+)?)?$/,
    /^\/archives$/,
  ],
  student: [
    /^\/me$/,
    /^\/courses\/\d+\/(?:lab|glider|archives|reflection|assistant|tasks(?:\/\d+)?|works(?:\/(?:upload|\d+))?)$/,
    /^\/explore$/,
    /^\/lab$/,
    /^\/archives\/rewards$/,
    /^\/dashboard(?:\/ai)?$/,
    /^\/glider$/,
    /^\/courses(?:\/\d+|\/\d+\/learn|\/\d+\/lessons\/\d+\/learn)?$/,
    /^\/tasks(?:\/\d+)?$/,
    /^\/works(?:\/upload|\/\d+)?$/,
    /^\/archives(?:\/reflection)?$/,
  ],
  media: [
    /^\/dashboard$/,
    /^\/courses$/,
  ],
};

export function canRoleAccessPath(role, path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.includes('\\') || [...path].some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127 || char.charCodeAt(0) === 92)) return false;
  const pathname = path.split(/[?#]/, 1)[0];
  return [...COMMON_RULES, ...(ROLE_PATH_RULES[role] || [])].some((rule) => rule.test(pathname));
}
