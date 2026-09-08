const NOTIFICATION_CATEGORIES = ['feedback', 'course', 'task', 'work', 'archive', 'account', 'system', 'security'];
const NOTIFICATION_LEVELS = ['normal', 'important', 'urgent', 'security'];
const NOTIFICATION_STATUSES = ['draft', 'scheduled', 'published', 'withdrawn'];

const NOTIFICATION_EVENTS = {
  FEEDBACK_SUBMITTED: 'feedback.submitted',
  FEEDBACK_REPLIED: 'feedback.replied',
  FEEDBACK_STATUS_CHANGED: 'feedback.status_changed',
  FEEDBACK_USER_REPLIED: 'feedback.user_replied',
  FEEDBACK_REOPENED: 'feedback.reopened',
  FEEDBACK_CLOSED: 'feedback.closed',
  WORK_SUBMITTED: 'work.submitted',
  WORK_RESUBMITTED: 'work.resubmitted',
  WORK_REVIEWED: 'work.reviewed',
  WORK_DELETED: 'work.deleted',
  ENROLLMENT_REMOVED: 'course.enrollment_removed',
};

const NOTIFICATION_LABELS = {
  categories: {
    feedback: '反馈',
    course: '课程',
    task: '任务',
    work: '作品',
    archive: '成长档案',
    account: '账号',
    system: '系统',
    security: '安全',
  },
  levels: {
    normal: '普通',
    important: '重要',
    urgent: '紧急',
    security: '安全',
  },
};

module.exports = {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_LEVELS,
  NOTIFICATION_STATUSES,
  NOTIFICATION_EVENTS,
  NOTIFICATION_LABELS,
};
