-- 用户/课程偏好与学习、报名、评分数据独立；不分配默认角色。
CREATE TABLE IF NOT EXISTS course_avatar_preferences (
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  avatar_id TEXT NOT NULL CHECK (avatar_id IN ('navigator','pathfinder','maker','decoder','collaborator','guardian')),
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (student_id, course_id)
);
