import client from './client';

export const authAPI = {
  login: (real_name, password) => client.post('/auth/login', { real_name, password }),
  register: (data) => client.post('/auth/register', data),
  me: () => client.get('/auth/me'),
  refresh: (refresh_token) => client.post('/auth/refresh', { refresh_token }),
  logout: (refresh_token) => client.post('/auth/logout', { refresh_token }),
  changePassword: (data) => client.post('/auth/change-password', data),
  adminResetPassword: (userId) => client.post('/auth/admin/reset-password', { user_id: userId }),
  getSchools: () => client.get('/auth/schools'),
  getClasses: (schoolId) => client.get(`/auth/classes?school_id=${schoolId}`),
};

export const dashboardAPI = {
  getIndex: () => client.get('/dashboard'),
  getSchools: () => client.get('/dashboard/schools'),
  addSchool: (data) => client.post('/dashboard/schools', data),
  getSchool: (id) => client.get(`/dashboard/schools/${id}`),
  deleteSchool: (id) => client.post(`/dashboard/schools/${id}/delete`),
  addClass: (schoolId, data) => client.post(`/dashboard/schools/${schoolId}/classes`, data),
  deleteClass: (schoolId, classId) => client.post(`/dashboard/schools/${schoolId}/classes/${classId}/delete`),
};

export const courseAPI = {
  list: (params) => client.get('/courses', { params }),
  create: (data) => client.post('/courses', data),
  detail: (id) => client.get(`/courses/${id}`),
  update: (id, data) => client.put(`/courses/${id}`, data),
  delete: (id) => client.delete(`/courses/${id}`),
  addLesson: (courseId, data) => client.post(`/courses/${courseId}/lessons`, data),
  addTask: (lessonId, data) => client.post(`/courses/lessons/${lessonId}/tasks`, data),
  uploadResource: (courseId, formData) => client.post(`/courses/${courseId}/resources`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  downloadResource: (resourceId) => client.get(`/courses/resources/${resourceId}/download`, { responseType: 'blob' }),
  enroll: (courseId, studentIds) => client.post(`/courses/${courseId}/enroll`, { student_ids: studentIds }),
  studentEnroll: (courseId) => client.post('/courses/enroll', { course_id: courseId }),
  updateProgress: (courseId, data) => client.post(`/courses/${courseId}/progress`, data),
};

export const taskAPI = {
  list: (params) => client.get('/tasks', { params }),
  detail: (id) => client.get(`/tasks/${id}`),
};

export const studentAPI = {
  list: (params) => client.get('/students', { params }),
  create: (data) => client.post('/students', data),
  detail: (id) => client.get(`/students/${id}`),
  update: (id, data) => client.put(`/students/${id}`, data),
  delete: (id) => client.delete(`/students/${id}`),
  batchImport: (data) => client.post('/students/import', data),
  importFile: (formData) => client.post('/students/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  getClasses: (schoolId) => client.get(`/students/classes/${schoolId}`),
  createSchool: (data) => client.post('/students/schools', data),
  deleteSchool: (id) => client.delete(`/students/schools/${id}`),
  createClass: (data) => client.post('/students/classes', data),
  deleteClass: (id) => client.delete(`/students/classes/${id}`),
  createUser: (data) => client.post('/students/users', data),
  updateUser: (id, data) => client.put(`/students/users/${id}`, data),
  deleteUser: (id) => client.delete(`/students/users/${id}`),
  batchDeleteUsers: (ids) => client.post('/students/users/batch-delete', { ids }),
  getAssignOptions: () => client.get('/students/options'),
  assign: (id, data) => client.put(`/students/${id}/assign`, data),
};

export const workAPI = {
  list: (params) => client.get('/works', { params }),
  uploadOptions: () => client.get('/works/upload-options'),
  upload: (formData) => client.post('/works', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  detail: (id) => client.get(`/works/${id}`),
  download: (id) => client.get(`/works/${id}/download`, { responseType: 'blob' }),
  delete: (id) => client.delete(`/works/${id}`),
  reject: (id, reason) => client.post(`/works/${id}/reject`, { reason }),
  pendingTasks: () => client.get('/works/pending-tasks'),
  review: (id, data) => client.post(`/works/${id}/review`, data),
};

export const archiveAPI = {
  getTree: (params) => client.get('/archives/tree', { params }),
  generate: (studentId) => client.get('/archives/generate', { params: { student_id: studentId } }),
  generateBatch: (params) => client.get('/archives/generate-batch', { params }),
  getReflections: () => client.get('/archives/reflection'),
  submitReflection: (data) => client.post('/archives/reflection', data),
  submitEvaluation: (data) => client.post('/archives/evaluation', data),
  addGrowthRecord: (data) => client.post('/archives/growth-records', data),
};

export const aiAPI = {
  getCourses: () => client.get('/dashboard/ai/courses'),
  ask: (question, course_id) => client.post('/dashboard/ai/ask', { question, course_id }),
};

export const feedbackAPI = {
  options: () => client.get('/feedback/options'),
  create: (formData) => client.post('/feedback', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  mine: (params) => client.get('/feedback/mine', { params }),
  detail: (id) => client.get(`/feedback/${id}`),
  reply: (id, content) => client.post(`/feedback/${id}/messages`, { content }),
  confirm: (id) => client.post(`/feedback/${id}/confirm`),
  reopen: (id, reason) => client.post(`/feedback/${id}/reopen`, { reason }),
  manageList: (params) => client.get('/feedback/manage/list', { params }),
  stats: () => client.get('/feedback/manage/stats'),
  updateStatus: (id, status) => client.patch(`/feedback/${id}/status`, { status }),
  updatePriority: (id, priority) => client.patch(`/feedback/${id}/priority`, { priority }),
  addInternalNote: (id, content) => client.post(`/feedback/${id}/internal-notes`, { content }),
  resolve: (id, resolution) => client.post(`/feedback/${id}/resolve`, { resolution }),
  downloadAttachment: (id) => client.get(`/feedback/attachments/${id}`, { responseType: 'blob' }),
};

export const notificationAPI = {
  list: (params) => client.get('/notifications', { params }),
  recent: (limit = 10) => client.get('/notifications/recent', { params: { limit } }),
  unreadCount: () => client.get('/notifications/unread-count'),
  detail: (id) => client.get(`/notifications/${id}`),
  markRead: (id) => client.patch(`/notifications/${id}/read`),
  markUnread: (id) => client.patch(`/notifications/${id}/unread`),
  markAllRead: () => client.post('/notifications/read-all'),
  hide: (id) => client.patch(`/notifications/${id}/hide`),
  hideRead: () => client.post('/notifications/hide-read'),
};
