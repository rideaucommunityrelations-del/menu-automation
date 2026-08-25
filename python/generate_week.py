"""
End-to-end: raw weekly excel -> 7 finished daily menu PDFs.
Usage: python3 generate_week.py path/to/weekly_menu.xlsx output_folder/
"""
import sys, os
from parse_menu import parse_weekly_menu
from render_menu import render_day

def generate(xlsx_path, out_dir, year=None):
    os.makedirs(out_dir, exist_ok=True)
    days = parse_weekly_menu(xlsx_path, year=year)
    bg = os.path.join(os.path.dirname(__file__), "menu_background.png")
    paths = []
    for d in days:
        day_word = d["menu_date"].split(",")[0].title()
        out_path = os.path.join(out_dir, f"{day_word}_menu.pdf")
        render_day(bg, d, out_path)
        paths.append(out_path)
        print("Generated:", out_path)
    return paths

if __name__ == "__main__":
    xlsx_path = sys.argv[1]
    out_dir = sys.argv[2] if len(sys.argv) > 2 else "output"
    generate(xlsx_path, out_dir, year=2026)
