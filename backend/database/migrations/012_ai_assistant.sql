CREATE TABLE IF NOT EXISTS ai_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  model TEXT NOT NULL DEFAULT 'deepseek-flash',
  base_url TEXT NOT NULL DEFAULT 'https://api.deepseek.com',
  api_key_encrypted TEXT,
  system_prompt TEXT NOT NULL,
  retrieval_enabled INTEGER NOT NULL DEFAULT 1 CHECK (retrieval_enabled IN (0, 1)),
  show_sources INTEGER NOT NULL DEFAULT 1 CHECK (show_sources IN (0, 1)),
  expansion_level TEXT NOT NULL DEFAULT 'balanced' CHECK (expansion_level IN ('strict', 'balanced', 'open')),
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resource_id INTEGER NOT NULL UNIQUE,
  course_id INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'failed', 'unsupported')),
  error_message TEXT,
  indexed_at DATETIME,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  course_id INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  locator TEXT,
  text TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES ai_documents(id) ON DELETE CASCADE,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  UNIQUE (document_id, chunk_index)
);

CREATE VIRTUAL TABLE IF NOT EXISTS ai_chunks_fts USING fts5(text, content='ai_chunks', content_rowid='id', tokenize='trigram');
CREATE TRIGGER IF NOT EXISTS ai_chunks_ai AFTER INSERT ON ai_chunks BEGIN
  INSERT INTO ai_chunks_fts(rowid, text) VALUES (new.id, new.text);
END;
CREATE TRIGGER IF NOT EXISTS ai_chunks_ad AFTER DELETE ON ai_chunks BEGIN
  INSERT INTO ai_chunks_fts(ai_chunks_fts, rowid, text) VALUES ('delete', old.id, old.text);
END;
CREATE TRIGGER IF NOT EXISTS ai_chunks_au AFTER UPDATE ON ai_chunks BEGIN
  INSERT INTO ai_chunks_fts(ai_chunks_fts, rowid, text) VALUES ('delete', old.id, old.text);
  INSERT INTO ai_chunks_fts(rowid, text) VALUES (new.id, new.text);
END;
CREATE INDEX IF NOT EXISTS idx_ai_documents_course ON ai_documents(course_id, enabled, status);
CREATE INDEX IF NOT EXISTS idx_ai_chunks_document ON ai_chunks(document_id);
