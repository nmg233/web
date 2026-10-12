-- Preserve existing snapshot JSON; capture authoring fields absent from older versions.
CREATE TABLE lesson_version_supplements (
  content_version_id INTEGER PRIMARY KEY REFERENCES lesson_content_versions(id) ON DELETE CASCADE,
  lesson_json TEXT NOT NULL,
  resources_json TEXT NOT NULL DEFAULT '[]',
  captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
