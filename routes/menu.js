const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const archiver = require('archiver');

const { generateWeek, MenuParseError } = require('../lib/generateWeek');
const { getRecipients, sendMenuEmail, sendWeeklyMenuEmail } = require('../lib/mailer');
const {
  insertBatch,
  listBatches,
  findBatchByOutputDir,
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

// Sends the whole week's 7 PDFs to reception in one email right after
// upload/generation. Never throws — a failed send shouldn't fail the upload
// response, since the PDFs were already generated successfully; the outcome
// is logged to email_log and surfaced in the upload success banner instead.
async function sendWeeklyBatchEmail({ batch_id, output_dir, manifest }) {
  const week_start = manifest[0].date_iso;
  const week_end = manifest[manifest.length - 1].date_iso;

  const recipients = getRecipients();
  if (recipients.length === 0) {
    const message = 'MENU_RECIPIENTS is not set';
    insertEmailLog({ batch_id, weekday: 'All 7 days', status: 'skipped', message });
    return { status: 'skipped', message };
  }

  const days = manifest.map((d) => ({
    weekday: d.weekday,
    pdfPath: path.join(__dirname, '..', 'output', output_dir, d.pdf_filename),
  }));

  try {
    await sendWeeklyMenuEmail({ weekStart: week_start, weekEnd: week_end, days, recipients });
    insertEmailLog({
      batch_id,
      weekday: 'All 7 days',
      recipients: recipients.join(', '),
      status: 'sent',
    });
    return { status: 'sent', recipients };
  } catch (err) {
    console.error(err);
    insertEmailLog({
      batch_id,
      weekday: 'All 7 days',
      recipients: recipients.join(', '),
      status: 'error',
      message: err.message,
    });
    return { status: 'error', message: err.message };
  }
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
    const batch_id = insertBatch({ source_filename: req.file.originalname, output_dir, manifest });
    const weeklyEmail = await sendWeeklyBatchEmail({ batch_id, output_dir, manifest });

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
        download_all: `/download-all/${output_dir}`,
        weeklyEmail,
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
    download_all: `/download-all/${b.output_dir}`,
  }));
  const emailLog = listEmailLog();
  res.render('history', { batches, emailLog });
});

router.get('/download-all/:output_dir', (req, res) => {
  const batch = findBatchByOutputDir(req.params.output_dir);
  if (!batch) return res.status(404).send('No menu batch found for that upload.');

  res.attachment(`Rideau_Menu_${batch.week_start}_to_${batch.week_end}.zip`);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => {
    console.error(err);
    res.status(500).end();
  });
  archive.pipe(res);

  for (const pdf of batch.pdfs) {
    const pdfPath = path.join(__dirname, '..', 'output', batch.output_dir, pdf.pdf_filename);
    if (fs.existsSync(pdfPath)) {
      archive.file(pdfPath, { name: `${pdf.weekday}_menu.pdf` });
    }
  }

  archive.finalize();
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

// TEMPORARY: diagnostic route to figure out which outbound SMTP port (if any)
// Render's free tier allows. Remove once the mailer issue is resolved.
router.get('/debug-smtp', async (req, res) => {
  const net = require('net');
  const tls = require('tls');
  const dns = require('dns').promises;

  const results = {};
  let addr;
  try {
    const addresses = await dns.resolve4('smtp.gmail.com');
    addr = addresses[0];
    results.resolvedIPv4 = addr;
  } catch (err) {
    return res.json({ error: `DNS resolve4 failed: ${err.message}` });
  }

  function tryConnect(port, useTls) {
    return new Promise((resolve) => {
      const start = Date.now();
      const connectFn = useTls ? tls.connect : net.connect;
      const socket = connectFn({ host: addr, port, servername: 'smtp.gmail.com', timeout: 8000 }, () => {
        resolve({ ok: true, ms: Date.now() - start });
        socket.destroy();
      });
      socket.on('timeout', () => {
        resolve({ ok: false, error: 'timeout', ms: Date.now() - start });
        socket.destroy();
      });
      socket.on('error', (err) => {
        resolve({ ok: false, error: err.message, ms: Date.now() - start });
      });
    });
  }

  results.port465_tls = await tryConnect(465, true);
  results.port587_plain = await tryConnect(587, false);
  results.port25_plain = await tryConnect(25, false);

  res.json(results);
});

module.exports = router;
