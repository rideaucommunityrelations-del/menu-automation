"""
Rideau daily menu renderer.
Takes the blank Canva background + one day's data -> outputs a finished PDF page
that visually matches the real Canva design.
"""
from PIL import Image, ImageDraw, ImageFont
import os

FONT_DIR = os.path.join(os.path.dirname(__file__), "fonts")
POPPINS_BOLD = os.path.join(FONT_DIR, "Poppins-Bold.ttf")

PAGE_W, PAGE_H = 2550, 3300
CENTER_X = PAGE_W // 2

INK = (20, 20, 20)

# One consistent size/weight for ALL text on the page (matches Canva's actual body font: Poppins Bold)
BODY_SIZE = 62

# Zones: (top_y, bottom_y, max_text_width, line_spacing)
ZONES = {
    "date":            (443, 598, 1900, 0),
    "soup":            (830, 1194, 1900, 14),
    "sandwich":        (1194, 1712, 1950, 14),
    "appetizer":       (2180, 2566, 1500, 14),  # narrower: chef art on the right
    "dinner_entrees":  (2572, 3010, 1950, 14),
    "dessert":         (3010, 3195, 1900, 0),
    "side_note":       (1712, 1966, 1900, 0),
}

FONT = ImageFont.truetype(POPPINS_BOLD, BODY_SIZE)


def wrap_text(draw, text, font, max_width):
    words = text.split()
    lines, cur = [], ""
    for w in words:
        test = (cur + " " + w).strip()
        bbox = draw.textbbox((0, 0), test, font=font)
        if bbox[2] - bbox[0] <= max_width or not cur:
            cur = test
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def line_height(draw, font):
    bbox = draw.textbbox((0, 0), "Ag", font=font)
    return (bbox[3] - bbox[1]) * 1.28


def draw_centered_line(draw, text, cy, font=FONT, color=INK):
    bbox = draw.textbbox((0, 0), text, font=font)
    w = bbox[2] - bbox[0]
    x = CENTER_X - w / 2
    draw.text((x, cy), text, font=font, fill=color)


def draw_single_block(draw, zone_key, text):
    top, bottom, max_w, _ = ZONES[zone_key]
    lines = wrap_text(draw, text, FONT, max_w)
    lh = line_height(draw, FONT)
    total_h = lh * len(lines)
    cy = (top + bottom) / 2 - total_h / 2
    for ln in lines:
        draw_centered_line(draw, ln, cy)
        cy += lh


def draw_paired_block(draw, zone_key, item1, item2):
    top, bottom, max_w, spacing = ZONES[zone_key]

    lines1 = wrap_text(draw, item1, FONT, max_w)
    lines2 = wrap_text(draw, item2, FONT, max_w)
    lh = line_height(draw, FONT)

    total_h = lh * len(lines1) + lh + lh * len(lines2) + spacing * 2
    cy = (top + bottom) / 2 - total_h / 2

    for ln in lines1:
        draw_centered_line(draw, ln, cy)
        cy += lh
    cy += spacing
    draw_centered_line(draw, "or", cy)
    cy += lh + spacing
    for ln in lines2:
        draw_centered_line(draw, ln, cy)
        cy += lh


def render_day(background_path, data, output_pdf_path):
    """
    data: dict with keys:
      menu_date, daily_soup, soup_of_week, sandwich_of_day, lunch_entree,
      appetizer, dinner_entree_1, dinner_entree_2, dinner_dessert
    """
    img = Image.open(background_path).convert("RGB")
    draw = ImageDraw.Draw(img)

    top, bottom, _, _ = ZONES["date"]
    draw_centered_line(draw, data["menu_date"].upper(), (top + bottom) / 2 - line_height(draw, FONT) / 2)

    draw_paired_block(draw, "soup", data["daily_soup"], data["soup_of_week"])
    draw_paired_block(draw, "sandwich", data["sandwich_of_day"], data["lunch_entree"])
    draw_paired_block(draw, "appetizer", data["appetizer"], "Rideau House Salad")
    draw_paired_block(draw, "dinner_entrees", data["dinner_entree_1"], data["dinner_entree_2"])
    draw_single_block(draw, "dessert", data["dinner_dessert"])

    # Fixed side note (same every day) with underline beneath
    top, bottom, max_w, _ = ZONES["side_note"]
    line1, line2 = "Choice of Fresh Cut Fruit", "Jello, Applesauce or Ice Cream"
    lh = line_height(draw, FONT)
    total_h = lh * 2
    cy = (top + bottom) / 2 - total_h / 2
    draw_centered_line(draw, line1, cy)
    cy += lh
    draw_centered_line(draw, line2, cy)
    bbox = draw.textbbox((0, 0), line2, font=FONT)
    underline_w = (bbox[2] - bbox[0]) * 1.15
    uy = cy + lh + 6
    draw.line([(CENTER_X - underline_w / 2, uy), (CENTER_X + underline_w / 2, uy)], fill=INK, width=4)

    img.save(output_pdf_path, "PDF", resolution=300.0)


if __name__ == "__main__":
    sample = {
        "menu_date": "TUESDAY, AUGUST 18, 2026",
        "daily_soup": "Potato and Leek Soup",
        "soup_of_week": "Yellow Split Pea and Vegetable Soup (No Dairy)",
        "sandwich_of_day": "Pulled Pork Bun with Grainy Dijon Mayo, Pickle, and Side Coleslaw",
        "lunch_entree": "Stuffed Jacket Potato with Beef and Bean Chili garnished with Green Onion and Sour Cream",
        "appetizer": "Vegetable Samosa with Raita Sauce",
        "dinner_entree_1": "Pesto Penne Noodles with Turkey Meatballs, Bacon, Grape Tomatoes and Parmesan",
        "dinner_entree_2": "Herb Crusted Baked Sole Filet with White Wine Dill Sauce",
        "dinner_dessert": "Vanilla Tapioca Pudding",
    }
    render_day("menu_background.png", sample, "test_output.pdf")
    print("done")
