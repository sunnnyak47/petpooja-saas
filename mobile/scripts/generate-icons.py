#!/usr/bin/env python3
"""Generate app icon, adaptive icon, and splash screen PNGs for PetPooja Owner app."""

from PIL import Image, ImageDraw, ImageFont
import os

ASSETS_DIR = os.path.join(os.path.dirname(__file__), '..', 'assets', 'images')
os.makedirs(ASSETS_DIR, exist_ok=True)

# Colors
BLACK = '#000000'
WHITE = '#FFFFFF'
ORANGE = '#F5A623'
GRAY = '#888888'

# Font paths (macOS)
FONT_BOLD = '/System/Library/Fonts/HelveticaNeue.ttc'
FONT_REGULAR = '/System/Library/Fonts/HelveticaNeue.ttc'


def generate_icon(size=1024, output_name='icon.png'):
    """Generate the main app icon — bold P with orange accent on black background."""
    img = Image.new('RGBA', (size, size), BLACK)
    draw = ImageDraw.Draw(img)

    # Draw rounded rectangle background (via mask)
    # For app icon, just use the full square — stores apply their own masking

    # Draw the "P" lettermark
    font_size = int(size * 0.6)
    try:
        font = ImageFont.truetype(FONT_BOLD, font_size, index=1)  # index=1 = Bold
    except Exception:
        font = ImageFont.truetype(FONT_BOLD, font_size)

    letter = 'P'
    bbox = draw.textbbox((0, 0), letter, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]

    # Center the P
    x = (size - text_w) // 2 - bbox[0]
    y = (size - text_h) // 2 - bbox[1] - int(size * 0.02)  # slight upward shift

    draw.text((x, y), letter, fill=WHITE, font=font)

    # Draw orange accent dot — positioned at the top-right of the P's bowl
    dot_radius = int(size * 0.045)
    # Place the dot near the top-right area of the P
    dot_x = x + text_w - int(size * 0.02)
    dot_y = y + int(size * 0.12)
    draw.ellipse(
        [dot_x - dot_radius, dot_y - dot_radius,
         dot_x + dot_radius, dot_y + dot_radius],
        fill=ORANGE
    )

    # Add subtle bar chart element at bottom-right to hint at dashboard/analytics
    bar_base_y = y + text_h + int(size * 0.02)
    bar_x_start = x + int(text_w * 0.45)
    bar_width = int(size * 0.035)
    bar_gap = int(size * 0.02)
    bar_heights = [int(size * 0.06), int(size * 0.10), int(size * 0.08)]

    for i, bh in enumerate(bar_heights):
        bx = bar_x_start + i * (bar_width + bar_gap)
        by = bar_base_y - bh
        # Use orange for tallest bar, white for others
        color = ORANGE if i == 1 else WHITE
        draw.rectangle([bx, by, bx + bar_width, bar_base_y], fill=color)

    output_path = os.path.join(ASSETS_DIR, output_name)
    img.save(output_path, 'PNG')
    print(f'Generated: {output_path} ({size}x{size})')
    return img


def generate_adaptive_icon(size=1024):
    """Generate Android adaptive icon foreground — same design but with safe zone padding."""
    # Android adaptive icons need content within the inner 66% (safe zone)
    # The outer area may be cropped depending on device mask shape
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))  # transparent bg
    draw = ImageDraw.Draw(img)

    # Fill with black (the backgroundColor in app.json handles the actual bg)
    draw.rectangle([0, 0, size, size], fill=BLACK)

    # Scale content to fit within safe zone (inner 66%)
    safe_zone = int(size * 0.66)
    padding = (size - safe_zone) // 2

    font_size = int(safe_zone * 0.6)
    try:
        font = ImageFont.truetype(FONT_BOLD, font_size, index=1)
    except Exception:
        font = ImageFont.truetype(FONT_BOLD, font_size)

    letter = 'P'
    bbox = draw.textbbox((0, 0), letter, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]

    x = (size - text_w) // 2 - bbox[0]
    y = (size - text_h) // 2 - bbox[1] - int(safe_zone * 0.02)

    draw.text((x, y), letter, fill=WHITE, font=font)

    # Orange accent dot
    dot_radius = int(safe_zone * 0.045)
    dot_x = x + text_w - int(safe_zone * 0.02)
    dot_y = y + int(safe_zone * 0.12)
    draw.ellipse(
        [dot_x - dot_radius, dot_y - dot_radius,
         dot_x + dot_radius, dot_y + dot_radius],
        fill=ORANGE
    )

    # Mini bar chart
    bar_base_y = y + text_h + int(safe_zone * 0.02)
    bar_x_start = x + int(text_w * 0.45)
    bar_width = int(safe_zone * 0.035)
    bar_gap = int(safe_zone * 0.02)
    bar_heights = [int(safe_zone * 0.06), int(safe_zone * 0.10), int(safe_zone * 0.08)]

    for i, bh in enumerate(bar_heights):
        bx = bar_x_start + i * (bar_width + bar_gap)
        by = bar_base_y - bh
        color = ORANGE if i == 1 else WHITE
        draw.rectangle([bx, by, bx + bar_width, bar_base_y], fill=color)

    output_path = os.path.join(ASSETS_DIR, 'adaptive-icon.png')
    img.save(output_path, 'PNG')
    print(f'Generated: {output_path} ({size}x{size})')


def generate_splash(width=1284, height=2778):
    """Generate splash screen — black background with PetPooja branding."""
    img = Image.new('RGBA', (width, height), BLACK)
    draw = ImageDraw.Draw(img)

    # Main title: "PetPooja"
    title_font_size = int(width * 0.12)
    try:
        title_font = ImageFont.truetype(FONT_BOLD, title_font_size, index=1)
    except Exception:
        title_font = ImageFont.truetype(FONT_BOLD, title_font_size)

    title = 'PetPooja'
    bbox = draw.textbbox((0, 0), title, font=title_font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = (width - tw) // 2 - bbox[0]
    ty = (height - th) // 2 - bbox[1] - int(height * 0.02)

    draw.text((tx, ty), title, fill=WHITE, font=title_font)

    # Subtitle: "Owner"
    sub_font_size = int(width * 0.05)
    try:
        sub_font = ImageFont.truetype(FONT_REGULAR, sub_font_size, index=0)
    except Exception:
        sub_font = ImageFont.truetype(FONT_REGULAR, sub_font_size)

    subtitle = 'Owner'
    sbbox = draw.textbbox((0, 0), subtitle, font=sub_font)
    sw = sbbox[2] - sbbox[0]
    sx = (width - sw) // 2 - sbbox[0]
    sy = ty + th + int(height * 0.015)

    draw.text((sx, sy), subtitle, fill=GRAY, font=sub_font)

    # Small orange accent line below subtitle
    line_w = int(width * 0.08)
    line_h = 4
    line_x = (width - line_w) // 2
    line_y = sy + int(height * 0.035)
    draw.rectangle([line_x, line_y, line_x + line_w, line_y + line_h], fill=ORANGE)

    output_path = os.path.join(ASSETS_DIR, 'splash.png')
    img.save(output_path, 'PNG')
    print(f'Generated: {output_path} ({width}x{height})')


def generate_favicon(size=48):
    """Generate a small favicon for web."""
    icon = generate_icon(size=size, output_name='favicon.png')


if __name__ == '__main__':
    print('Generating PetPooja app assets...\n')
    generate_icon(1024, 'icon.png')
    generate_adaptive_icon(1024)
    generate_splash(1284, 2778)
    generate_favicon(48)
    print('\nDone! All assets generated in assets/images/')
