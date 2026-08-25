"""
Thin wrapper the Node app shells out to. Uses parse_menu.parse_weekly_menu and
render_menu.render_day exactly as generate_week.py does, but (a) defaults to the
current year instead of generate_week.py's hardcoded 2026 so the service keeps
working past this year, and (b) prints a JSON manifest (weekday/date/pdf filename
per day) on stdout so the Node side can store it without re-parsing dates itself.
On a bad upload (label mismatch etc.) prints {"error": "..."} and exits 1 so the
web app can surface the message to the uploader instead of a raw traceback.
"""
import sys, os, json
from datetime import datetime

sys.path.insert(0, os.path.dirname(__file__))
from parse_menu import parse_weekly_menu
from render_menu import render_day


def run(xlsx_path, out_dir, year=None):
    os.makedirs(out_dir, exist_ok=True)
    days = parse_weekly_menu(xlsx_path, year=year)
    bg = os.path.join(os.path.dirname(__file__), "menu_background.png")

    manifest = []
    for d in days:
        day_word = d["menu_date"].split(",")[0].title()
        out_path = os.path.join(out_dir, f"{day_word}_menu.pdf")
        render_day(bg, d, out_path)
        date_iso = datetime.strptime(d["menu_date"], "%A, %B %d, %Y").strftime("%Y-%m-%d")
        manifest.append({
            "weekday": day_word,
            "menu_date": d["menu_date"],
            "date_iso": date_iso,
            "pdf_filename": os.path.basename(out_path),
        })
    return manifest


if __name__ == "__main__":
    xlsx_path = sys.argv[1]
    out_dir = sys.argv[2]
    try:
        result = run(xlsx_path, out_dir)
    except ValueError as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
    print(json.dumps(result))
