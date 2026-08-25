const path = require('path');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, 'menu.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS batches (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    source_filename TEXT NOT NULL,
    output_dir      TEXT NOT NULL,
    week_start      TEXT NOT NULL,
    week_end        TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS batch_pdfs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id      INTEGER NOT NULL REFERENCES batches(id),
    weekday       TEXT NOT NULL,
    menu_date     TEXT NOT NULL,
    date_iso      TEXT NOT NULL,
    pdf_filename  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS email_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id    INTEGER,
    weekday     TEXT,
    pdf_filename TEXT,
    recipients  TEXT,
    status      TEXT NOT NULL,
    message     TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const insertBatchStmt = db.prepare(`
  INSERT INTO batches (source_filename, output_dir, week_start, week_end)
  VALUES (@source_filename, @output_dir, @week_start, @week_end)
`);

const insertBatchPdfStmt = db.prepare(`
  INSERT INTO batch_pdfs (batch_id, weekday, menu_date, date_iso, pdf_filename)
  VALUES (@batch_id, @weekday, @menu_date, @date_iso, @pdf_filename)
`);

const insertEmailLogStmt = db.prepare(`
  INSERT INTO email_log (batch_id, weekday, pdf_filename, recipients, status, message)
  VALUES (@batch_id, @weekday, @pdf_filename, @recipients, @status, @message)
`);

function insertBatch({ source_filename, output_dir, manifest }) {
  const week_start = manifest[0].date_iso;
  const week_end = manifest[manifest.length - 1].date_iso;

  const insertAll = db.transaction(() => {
    const info = insertBatchStmt.run({ source_filename, output_dir, week_start, week_end });
    const batch_id = info.lastInsertRowid;
    for (const day of manifest) {
      insertBatchPdfStmt.run({
        batch_id,
        weekday: day.weekday,
        menu_date: day.menu_date,
        date_iso: day.date_iso,
        pdf_filename: day.pdf_filename,
      });
    }
    return batch_id;
  });

  return insertAll();
}

function listBatches() {
  const batches = db
    .prepare('SELECT * FROM batches ORDER BY week_start DESC, id DESC')
    .all();
  const pdfsStmt = db.prepare('SELECT * FROM batch_pdfs WHERE batch_id = ? ORDER BY date_iso ASC');
  return batches.map((b) => ({ ...b, pdfs: pdfsStmt.all(b.id) }));
}

function findBatchForDate(date_iso) {
  return db
    .prepare('SELECT * FROM batches WHERE week_start <= ? AND week_end >= ? ORDER BY created_at DESC LIMIT 1')
    .get(date_iso, date_iso);
}

function findBatchPdf(batch_id, date_iso) {
  return db
    .prepare('SELECT * FROM batch_pdfs WHERE batch_id = ? AND date_iso = ?')
    .get(batch_id, date_iso);
}

function insertEmailLog(entry) {
  insertEmailLogStmt.run({
    batch_id: null,
    weekday: null,
    pdf_filename: null,
    recipients: null,
    message: null,
    ...entry,
  });
}

function listEmailLog(limit = 50) {
  return db
    .prepare('SELECT * FROM email_log ORDER BY created_at DESC, id DESC LIMIT ?')
    .all(limit);
}

module.exports = {
  db,
  insertBatch,
  listBatches,
  findBatchForDate,
  findBatchPdf,
  insertEmailLog,
  listEmailLog,
};
