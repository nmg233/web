ALTER TABLE lessons ADD COLUMN review_content TEXT;
ALTER TABLE lessons ADD COLUMN report_guidance TEXT;
ALTER TABLE lessons ADD COLUMN experiment_guidance TEXT;
ALTER TABLE lessons ADD COLUMN article_blocks TEXT NOT NULL DEFAULT '[]';
ALTER TABLE resources ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0;
