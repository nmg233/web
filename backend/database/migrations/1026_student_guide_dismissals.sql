-- One row per student account: closing the login guide popup stays closed across devices.
CREATE TABLE student_guide_dismissals (
 student_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 dismissed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
