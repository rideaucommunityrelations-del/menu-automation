# Rideau Daily Menu Automation — Handoff Spec

## What this already does (built and tested)
- `parse_menu.py` — reads the chef's raw weekly menu excel (any week, handles messy
  label spacing) and returns 7 structured day-dicts.
- `render_menu.py` — takes one day-dict and `menu_background.png` (the real Canva
  design background, text fields blanked) and outputs a finished, pixel-matching
  daily menu PDF.
- `generate_week.py` — glues the two together: raw xlsx in, 7 PDFs out.
  Tested end-to-end on two real weekly files.

## What's needed to make this fully automated (your job)
Build a small web app around `generate_week.py` and deploy it free on Render,
same pattern as the existing Rideau lease-generator app
(https://lease-app.onrender.com).

### 1. Upload endpoint
A single-page app (or simple form) where reception/chef uploads the weekly xlsx.
On upload:
  - Run `generate_week.py` on it (call as a subprocess or port the parsing logic
    into your chosen backend language — Python is already proven to work here).
  - Store the 7 generated PDFs (filesystem is fine, this doesn't need a database).

### 2. Email sending
Use Nodemailer (or Python's smtplib) + a Gmail account with an App Password
(free, no paid email service needed). One email per day, with that day's PDF
attached, sent to the team distribution list (get the list of recipient emails
from Krit).

### 3. Scheduling
Render's free tier sleeps after 15 min idle, so use a free external cron
pinger (cron-job.org) to hit a `/send-daily-menu` endpoint once every morning.
That endpoint should:
  - Look up today's already-generated PDF (matched by weekday name).
  - Send it via email.
  - If nothing's been generated for the current week, no-op safely (don't crash) —
    just log it so it's visible if reception forgot to upload that week's file.

### 4. History / status page (optional but recommended)
A simple page showing: last file uploaded, when, which 7 PDFs were generated,
and a log of which emails sent successfully — same idea as the lease app's
history log. Makes it easy to debug if something didn't go out.

## Important constraints
- Do NOT use Canva's API for generation — Autofill/Bulk Create API access
  requires Canva Enterprise, which Rideau doesn't have. Everything here
  works entirely outside Canva using the pre-rendered background image.
- If the chef's raw excel layout changes significantly (categories renamed,
  reordered), `parse_menu.py`'s label-matching will raise a clear
  ValueError — surface that error to the uploader rather than failing silently.
- `render_menu.py`'s BODY_SIZE constant (currently 62) and the ZONES dict
  control text size/position — don't need to touch these unless the design
  changes.

## Files in this package
- parse_menu.py
- render_menu.py
- generate_week.py
- menu_background.png  (the blanked master template)
- fonts/Poppins-Bold.ttf

## End goal for reception's workflow
Reception's entire weekly task: open the app's one upload page, upload the
excel the chef sent them, click submit. Everything else — parsing,
rendering, scheduled sending — happens on its own.
