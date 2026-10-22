// Named, additive extension: does not reserve or rewrite numbered upstream migrations.
const NAME = 'content-authoring-v1';
function apply(db) {
  return db.transaction(() => {
    db.exec(`CREATE TABLE IF NOT EXISTS app_schema_extensions (
      name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    const columns = db.pragma('table_info(lessons)');
    const existing = columns.find(c => c.name === 'cards_required');
    if (existing && (existing.type.toUpperCase() !== 'INTEGER' || db.prepare('SELECT 1 FROM lessons WHERE cards_required IS NOT NULL AND cards_required NOT IN (0,1) LIMIT 1').get())) {
      throw Error('已有 cards_required 定义或数据不兼容，停止扩展；未改写旧数据');
    }
    if (!columns.some(c => c.name === 'cards_required')) {
      db.exec('ALTER TABLE lessons ADD COLUMN cards_required INTEGER CHECK(cards_required IN (0,1))');
    }
    db.exec(`CREATE TABLE IF NOT EXISTS course_lab_settings (
      course_id INTEGER PRIMARY KEY REFERENCES courses(id),
      experiment_id TEXT NOT NULL DEFAULT 'glider' CHECK(experiment_id='glider'),
      title TEXT, introduction TEXT,
      cover_image_id TEXT REFERENCES course_theme_images(id),
      background_image_id TEXT REFERENCES course_theme_images(id),
      revision INTEGER NOT NULL DEFAULT 1,
      updated_by INTEGER REFERENCES users(id), updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);
    const required = ['course_id','experiment_id','title','introduction','cover_image_id','background_image_id','revision','updated_by','updated_at'];
    const actual = db.pragma('table_info(course_lab_settings)').map(c => c.name);
    if (!required.every(c => actual.includes(c))) throw Error('实验室填写扩展结构不一致，请核对备份；未重建数据');
    db.prepare('INSERT OR IGNORE INTO app_schema_extensions(name) VALUES(?)').run(NAME);
    return {name: NAME, applied: true};
  }).immediate();
}
module.exports = {apply, NAME};
