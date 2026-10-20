// Inspect server-owned schema identifiers, not request-supplied table/column names.
const quote = value => '"' + value.replaceAll('"', '""') + '"';
function assertNoReferences(db, parent, id, message, allowed = []) {
  for (const {name} of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()) {
    if (allowed.includes(name)) continue;
    for (const fk of db.prepare(`PRAGMA foreign_key_list(${quote(name)})`).all()) {
      if (fk.table !== parent || (fk.to && fk.to !== 'id')) continue;
      if (db.prepare(`SELECT 1 FROM ${quote(name)} WHERE ${quote(fk.from)}=? LIMIT 1`).get(id)) {
        throw Object.assign(new Error(message), {status:409});
      }
    }
  }
}
module.exports = {assertNoReferences};
