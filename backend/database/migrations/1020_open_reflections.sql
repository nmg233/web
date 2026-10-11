-- Expand only. Legacy four fields/rows remain untouched and retain their meaning.
ALTER TABLE reflections ADD COLUMN reflection_version INTEGER NOT NULL DEFAULT 1 CHECK(reflection_version IN (1,2));
ALTER TABLE reflections ADD COLUMN entry_note TEXT;
ALTER TABLE reflections ADD COLUMN together_note TEXT;
ALTER TABLE reflections ADD COLUMN extra_note TEXT;
