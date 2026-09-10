ALTER TABLE lessons ADD COLUMN status TEXT NOT NULL DEFAULT 'scheduled';
ALTER TABLE lessons ADD COLUMN cancel_reason TEXT;
ALTER TABLE lessons ADD COLUMN cancelled_at DATETIME;
