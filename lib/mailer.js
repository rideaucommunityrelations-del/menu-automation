const fs = require('fs');
const nodemailer = require('nodemailer');

// Recipients come from an env var (not a file) because the free Render plan
// has no persistent disk — anything written to the filesystem is wiped on
// every restart/redeploy, so this can't rely on an uploaded/edited config file.
function getRecipients() {
  const raw = process.env.MENU_RECIPIENTS || '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error('GMAIL_USER / GMAIL_APP_PASSWORD are not set');
  }
  transporter = nodemailer.createTransport({
    // Explicit host/port instead of the 'gmail' shorthand, plus family: 4 —
    // Render's free-tier containers have broken IPv6 egress, and the gmail
    // shorthand's default DNS resolution tries the AAAA record first, which
    // hangs (ETIMEDOUT) then hard-fails (ENETUNREACH) before ever falling
    // back to IPv4.
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    family: 4,
    auth: { user, pass },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });
  return transporter;
}

async function sendMenuEmail({ weekday, dateLabel, pdfPath, recipients }) {
  const t = getTransporter();
  await t.sendMail({
    from: process.env.GMAIL_USER,
    to: recipients,
    subject: `Rideau Daily Menu — ${weekday}, ${dateLabel}`,
    text: `Attached is the Rideau menu for ${weekday}, ${dateLabel}.`,
    attachments: [
      {
        filename: `${weekday}_menu.pdf`,
        content: fs.createReadStream(pdfPath),
      },
    ],
  });
}

async function sendWeeklyMenuEmail({ weekStart, weekEnd, days, recipients }) {
  const t = getTransporter();
  await t.sendMail({
    from: process.env.GMAIL_USER,
    to: recipients,
    subject: `Rideau Weekly Menu — ${weekStart} to ${weekEnd}`,
    text: `Attached are the Rideau menus for the week of ${weekStart} to ${weekEnd} (${days.length} days).`,
    attachments: days.map((day) => ({
      filename: `${day.weekday}_menu.pdf`,
      content: fs.createReadStream(day.pdfPath),
    })),
  });
}

module.exports = { getRecipients, sendMenuEmail, sendWeeklyMenuEmail };
