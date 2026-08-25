const path = require('path');
const express = require('express');
const multer = require('multer');

const { generateWeek, MenuParseError } = require('../lib/generateWeek');
const { getRecipients, sendMenuEmail } = require('../lib/mailer');
const {
  insertBatch,
  listBatches,
  findBatchForDate,
  findBatchPdf,
  insertEmailLog,
  listEmailLog,
} = require('../db/db');

const router = express.Router();
const uploadStorage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'uploads'),
  filename: (req, file, cb) => cb(null, `${Date.now()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage: uploadStorage });

function todayISO(dateOverride) {
  return dateOverride || new Date().toISOString().slice(0, 10);
}

router.get('/', (req, res) => {
  res.render('index', { error: null, success: null });
});

router.post('/upload', upload.single('menu_file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).render('index', { error: 'No file was uploaded.', success: null });
  }

  const output_dir = String(Date.now());
  const outDir = path.join(__dirname, '..', 'output', output_dir);

  try {
    const manifest = await generateWeek(req.file.path, outDir);
    insertBatch({ source_filename: req.file.originalname, output_dir, manifest });

    res.render('index', {
      error: null,
      success: {
        source_filename: req.file.originalname,
        week_start: manifest[0].date_iso,
        week_end: manifest[manifest.length - 1].date_iso,
        pdfs: manifest.map((d) => ({
          weekday: d.weekday,
          download: `/download/${output_dir}/${d.pdf_filename}`,
        })),
      },
    });
  } catch (err) {
    const message = err instanceof MenuParseError
      ? err.message
      : 'Something went wrong generating the menus. Check the server log for details.';
    if (!(err instanceof MenuParseError)) console.error(err);
    res.status(400).render('index', { error: message, success: null });
  }
});

router.get('/history', (req, res) => {
  const batches = listBatches().map((b) => ({
    ...b,
    pdfs: b.pdfs.map((p) => ({
      ...p,
      download: `/download/${b.output_dir}/${p.pdf_filename}`,
    })),
  }));
  const emailLog = listEmailLog();
  res.render('history', { batches, emailLog });
});

// Hit by an external cron pinger (e.g. cron-job.org) once each morning.
// Looks up today's PDF and emails it; no-ops safely (never throws/crashes)
// if nothing was uploaded for the current week.
router.post('/send-daily-menu', async (req, res) => {
  const date_iso = todayISO(req.query.date || req.body.date);

  const batch = findBatchForDate(date_iso);
  if (!batch) {
    insertEmailLog({ status: 'skipped', message: `No batch covers ${date_iso}` });
    return res.json({ skipped: true, reason: `No menu batch covers ${date_iso}` });
  }

  const pdf = findBatchPdf(batch.id, date_iso);
  if (!pdf) {
    insertEmailLog({ batch_id: batch.id, status: 'skipped', message: `Batch ${batch.id} has no PDF for ${date_iso}` });
    return res.json({ skipped: true, reason: `Batch ${batch.id} has no PDF for ${date_iso}` });
  }

  const recipients = getRecipients();
  if (recipients.length === 0) {
    insertEmailLog({
      batch_id: batch.id,
      weekday: pdf.weekday,
      pdf_filename: pdf.pdf_filename,
      status: 'skipped',
      message: 'MENU_RECIPIENTS is not set',
    });
    return res.json({ skipped: true, reason: 'MENU_RECIPIENTS is not set' });
  }

  const pdfPath = path.join(__dirname, '..', 'output', batch.output_dir, pdf.pdf_filename);

  try {
    await sendMenuEmail({
      weekday: pdf.weekday,
      dateLabel: pdf.menu_date,
      pdfPath,
      recipients,
    });
    insertEmailLog({
      batch_id: batch.id,
      weekday: pdf.weekday,
      pdf_filename: pdf.pdf_filename,
      recipients: recipients.join(', '),
      status: 'sent',
    });
    res.json({ sent: true, weekday: pdf.weekday, recipients });
  } catch (err) {
    console.error(err);
    insertEmailLog({
      batch_id: batch.id,
      weekday: pdf.weekday,
      pdf_filename: pdf.pdf_filename,
      recipients: recipients.join(', '),
      status: 'error',
      message: err.message,
    });
    res.status(500).json({ sent: false, error: err.message });
  }
});

module.exports = router;
