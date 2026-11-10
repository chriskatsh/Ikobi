# Image de partage (Open Graph) et icône Apple, à partir de l'icône de l'app.
import sys
from PIL import Image, ImageDraw, ImageFont
root = sys.argv[1]
icon = Image.open(f'{root}/mobile/assets/images/icon.png').convert('RGB')
fb = '/usr/share/fonts/opentype/inter/Inter-Bold.otf'
fr = '/usr/share/fonts/opentype/inter/Inter-Regular.otf'
for out, title, sub in [(f'{root}/site/src/og-site.png', 'Votre likelemba,\nsans cahier ni doute.', 'ikobi.app'),
                        (f'{root}/site/src/og-api.png', 'Construire avec iKobi.', 'api.ikobi.app — documentation et clés API')]:
    im = Image.new('RGB', (1200, 630), (9, 12, 21)); d = ImageDraw.Draw(im)
    im.paste(icon.resize((420, 420), Image.LANCZOS), (720, 105))
    d.text((80, 150), title, font=ImageFont.truetype(fb, 64), fill=(238, 241, 247), spacing=12)
    d.text((80, 470), sub, font=ImageFont.truetype(fr, 30), fill=(43, 217, 160))
    im.save(out, optimize=True)
icon.resize((180, 180), Image.LANCZOS).save(f'{root}/site/src/apple-touch-icon.png', optimize=True)
