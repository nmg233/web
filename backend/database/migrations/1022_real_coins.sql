-- Additive account ledger. No import of demo balances or historical guesses.
CREATE TABLE student_coin_ledger (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 id TEXT NOT NULL UNIQUE,
 student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 reward_type TEXT NOT NULL CHECK(reward_type IN ('lesson','checkin')),
 amount INTEGER NOT NULL CHECK(typeof(amount)='integer' AND amount BETWEEN 0 AND 100),
 occurred_at TEXT NOT NULL, beijing_date TEXT NOT NULL,
 rule_version TEXT NOT NULL,
 lesson_id INTEGER, course_id INTEGER, report_id INTEGER, report_version INTEGER, report_score INTEGER,
 lesson_title TEXT, course_title TEXT, checkin_date TEXT,
 snapshot_json TEXT NOT NULL,
 CHECK((reward_type='lesson' AND lesson_id IS NOT NULL AND report_id IS NOT NULL AND report_version IS NOT NULL AND typeof(report_score)='integer' AND report_score BETWEEN 0 AND 100 AND amount=report_score AND checkin_date IS NULL) OR (reward_type='checkin' AND checkin_date IS NOT NULL AND lesson_id IS NULL AND amount BETWEEN 5 AND 10))
);
CREATE UNIQUE INDEX coin_lesson_once ON student_coin_ledger(student_id,lesson_id) WHERE reward_type='lesson';
CREATE UNIQUE INDEX coin_day_once ON student_coin_ledger(student_id,checkin_date) WHERE reward_type='checkin';
CREATE INDEX coin_owner_sequence ON student_coin_ledger(student_id,sequence DESC);
CREATE TABLE student_coin_checkins (
 student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 checkin_date TEXT NOT NULL,
 streak INTEGER NOT NULL CHECK(typeof(streak)='integer' AND streak>=1),
 amount INTEGER NOT NULL CHECK(typeof(amount)='integer' AND amount=min(4+streak,10)),
 ledger_id TEXT NOT NULL UNIQUE REFERENCES student_coin_ledger(id),
 PRIMARY KEY(student_id,checkin_date)
);
