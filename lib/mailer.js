const fs = require('fs');
const dns = require('dns').promises;
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

const GMAIL_SMTP_HOST = 'smtp.gmail.com';

// Render's free-tier containers have broken IPv6 egress, but nodemailer's
// own DNS resolution (lib/shared/index.js resolveHostname) picks a *random*
// address out of the combined IPv4+IPv6 result set — there's no supported
// option to force IPv4 there, so it still connects over IPv6 about half the
// time and hangs (ETIMEDOUT) then hard-fails (ENETUNREACH). Resolving the
// A record ourselves and connecting to that literal IP sidesteps nodemailer's
// resolver entirely; `servername` keeps TLS SNI/cert validation matching the
// real hostname since `host` is now a bare IP.
async function getTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error('GMAIL_USER / GMAIL_APP_PASSWORD are not set');
  }

  const addresses = await dns.resolve4(GMAIL_SMTP_HOST);
  const host = addresses[Math.floor(Math.random() * addresses.length)];

  return nodemailer.createTransport({
    host,
    port: 465,
    secure: true,
    tls: { servername: GMAIL_SMTP_HOST },
    auth: { user, pass },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });
}

async function sendMenuEmail({ weekday, dateLabel, pdfPath, recipients }) {
  const t = await getTransporter();
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
  const t = await getTransporter();
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
