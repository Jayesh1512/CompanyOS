#!/usr/bin/env python3
"""Render a CompanyOs title card and prepend it to the existing narrated video."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import argparse, hashlib, json, subprocess, shutil

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'artifacts/companyos-walkthrough'
parser = argparse.ArgumentParser()
parser.add_argument('--duration', type=float, default=4)
args = parser.parse_args()
if not 2 <= args.duration <= 10:
    parser.error('Opening duration must be between 2 and 10 seconds.')
OUT.mkdir(parents=True, exist_ok=True)
canonical = OUT / 'companyos-walkthrough.mp4'
source = OUT / 'companyos-walkthrough-body.mp4'
if not source.exists():
    previous = json.loads((OUT / 'opening-manifest.json').read_text())
    assert hashlib.sha256(canonical.read_bytes()).hexdigest() == previous['sourceSha256'], 'Preserve the original walkthrough body before rebuilding the title screen.'
    shutil.copy2(canonical, source)
target = OUT / 'companyos-walkthrough-with-opening.mp4'

def font_path(bold=False):
    candidates = ([
        '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    ] if bold else [
        '/System/Library/Fonts/Supplemental/Arial.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    ])
    return next(str(Path(f)) for f in candidates if Path(f).exists())

slide = Image.new('RGB', (1920, 1080), '#fafafa')
draw = ImageDraw.Draw(slide)
regular, bold = font_path(), font_path(True)
draw.rounded_rectangle((168, 170, 248, 250), radius=16, fill='#202321')
draw.text((208, 209), 'C', font=ImageFont.truetype(bold, 60), fill='white', anchor='mm')
draw.ellipse((202, 263, 210, 271), fill='#c64b2c')
draw.text((160, 346), 'CompanyOs', font=ImageFont.truetype(bold, 154), fill='#202522', anchor='lt')
draw.text((168, 550), 'Build a company that learns as it works.', font=ImageFont.truetype(regular, 52), fill='#202522', anchor='lt')
draw.text((168, 642), 'A platform for living organizations.', font=ImageFont.truetype(regular, 32), fill='#626a65', anchor='lt')
draw.line((168, 850, 1752, 850), fill='#e4e7e4', width=2)
draw.text((168, 890), 'Northstar Care / Customer-care agency', font=ImageFont.truetype(regular, 24), fill='#626a65', anchor='lt')
draw.text((1752, 890), 'Product walkthrough', font=ImageFont.truetype(regular, 24), fill='#626a65', anchor='rt')
slide.save(OUT / 'opening-slide.png')
# Editable vector source; typography and colors follow the product's existing design.
(OUT / 'opening-slide.svg').write_text('''<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
<title>CompanyOs — Product walkthrough</title><rect width="1920" height="1080" fill="#fafafa"/>
<rect x="168" y="170" width="80" height="80" rx="16" fill="#202321"/>
<text x="208" y="231" text-anchor="middle" font-family="Arial,sans-serif" font-size="60" font-weight="700" fill="white">C</text><circle cx="206" cy="267" r="4" fill="#c64b2c"/>
<g font-family="Arial,sans-serif"><text x="160" y="463" font-size="154" font-weight="700" fill="#202522">CompanyOs</text>
<text x="168" y="590" font-size="52" fill="#202522">Build a company that learns as it works.</text>
<text x="168" y="667" font-size="32" fill="#626a65">A platform for living organizations.</text>
<path d="M168 850H1752" stroke="#e4e7e4" stroke-width="2"/>
<text x="168" y="909" font-size="24" fill="#626a65">Northstar Care / Customer-care agency</text>
<text x="1752" y="909" text-anchor="end" font-size="24" fill="#626a65">Product walkthrough</text></g></svg>\n''')

def probe(file):
    return json.loads(subprocess.check_output([
        'ffprobe', '-v', 'error', '-show_entries',
        'format=duration:stream=codec_name,width,height,sample_rate', '-of', 'json', str(file)
    ]))

duration = float(probe(source)['format']['duration'])
filters = (
    '[0:v]setpts=PTS-STARTPTS,'
    f'fade=t=out:st={args.duration - 0.2}:d=0.2:color=0xfafafa[intro];'
    '[2:a]asetpts=PTS-STARTPTS[introaudio];'
    '[1:v]setpts=PTS-STARTPTS[body];[1:a]asetpts=PTS-STARTPTS[voice];'
    '[intro][introaudio][body][voice]concat=n=2:v=1:a=1[v][a]'
)
subprocess.run([
    'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
    '-loop', '1', '-framerate', '25', '-t', str(args.duration), '-i', str(OUT / 'opening-slide.png'),
    '-i', str(source), '-f', 'lavfi', '-t', str(args.duration), '-i', 'anullsrc=r=44100:cl=mono',
    '-filter_complex', filters, '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', str(target)
], check=True)
observed = probe(target)
assert abs(float(observed['format']['duration']) - duration - args.duration) < 0.15
assert any(s.get('codec_name') == 'aac' for s in observed['streams'])
# Promote the title-screen version to the main video without changing its body source.
shutil.copy2(target, canonical)
shutil.copy2(OUT / 'opening-slide.png', OUT / 'companyos-title-screen.png')
manifest = {
    'product': 'CompanyOs', 'source': source.name, 'output': canonical.name,
    'alternateOutput': target.name, 'poster': 'companyos-title-screen.png',
    'firstFrameIsTitleScreen': True,
    'openingSeconds': args.duration, 'narrationStartsAtSeconds': args.duration,
    'durationSeconds': float(observed['format']['duration']),
    'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'outputSha256': hashlib.sha256(target.read_bytes()).hexdigest(),
    'newSpeechRequests': 0,
}
(OUT / 'opening-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps(manifest))
