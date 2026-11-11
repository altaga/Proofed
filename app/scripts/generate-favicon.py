import os
from PIL import Image, ImageDraw

def create_proofed_icon(size):
    # Create image with dark background matching #12110F
    # Using RGBA so corners can be slightly rounded or crisp
    img = Image.new("RGBA", (size, size), (18, 17, 15, 255))
    draw = ImageDraw.Draw(img)
    
    # Scale factor relative to 32px
    scale = size / 32.0
    
    # Border box coordinates
    # For size 32: margin = 4, size = 24
    margin = int(round(3.5 * scale))
    box_w = size - 2 * margin
    stroke_w = max(1, int(round(2.5 * scale)))
    
    # Draw orange box outline
    orange = (255, 122, 61, 255) # #FF7A3D
    dark_fill = (24, 23, 20, 255)
    
    # Rectangle coordinates
    x0 = margin
    y0 = margin
    x1 = margin + box_w - 1
    y1 = margin + box_w - 1
    
    # Subtle corner radius for larger sizes, crisp for 16px
    radius = max(1, int(round(2 * scale))) if size >= 32 else 0
    draw.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=dark_fill, outline=orange, width=stroke_w)
    
    # Checkmark points:
    # Scale from 32px base: (10, 16.5) -> (14, 20.5) -> (22, 12.0)
    p1 = (int(round(10.0 * scale)), int(round(16.5 * scale)))
    p2 = (int(round(14.0 * scale)), int(round(20.5 * scale)))
    p3 = (int(round(22.0 * scale)), int(round(12.0 * scale)))
    
    check_w = max(1, int(round(2.6 * scale)))
    draw.line([p1, p2, p3], fill=orange, width=check_w, joint="curve")
    
    # Smooth line ends for clean look
    r_end = check_w / 2.0
    for p in [p1, p2, p3]:
        draw.ellipse([p[0] - r_end, p[1] - r_end, p[0] + r_end, p[1] + r_end], fill=orange)
        
    return img

sizes = [16, 32, 48, 64]
images = [create_proofed_icon(s) for s in sizes]

# Target paths
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
public_ico = os.path.join(base_dir, "public", "favicon.ico")
app_ico = os.path.join(base_dir, "app", "favicon.ico")

# Save ICO with multiple resolutions
images[1].save(
    public_ico,
    format="ICO",
    sizes=[(16, 16), (32, 32), (48, 48), (64, 64)],
    append_images=images
)

images[1].save(
    app_ico,
    format="ICO",
    sizes=[(16, 16), (32, 32), (48, 48), (64, 64)],
    append_images=images
)

print(f"Generated {public_ico} and {app_ico} successfully!")
