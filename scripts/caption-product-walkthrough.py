#!/usr/bin/env python3
"""Build audio-aligned JSON/SRT/VTT captions and a captioned CompanyOs video."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import hashlib, json, shutil, subprocess, textwrap

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'artifacts/companyos-walkthrough'
WORK = ROOT / '.runtime/companyos-caption-render'
WORK.mkdir(parents=True, exist_ok=True)
words = json.loads((OUT / 'captions-words.json').read_text())
opening = json.loads((OUT / 'opening-manifest.json').read_text())
offset = round(opening['narrationStartsAtSeconds'] * 1000)
source = OUT / 'companyos-walkthrough-uncaptioned.mp4'
if not source.exists():
    canonical = OUT / 'companyos-walkthrough.mp4'
    assert hashlib.sha256(canonical.read_bytes()).hexdigest() == opening['outputSha256']
    shutil.copy2(canonical, source)
video = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', str(source)]))
duration = float(video['format']['duration'])

# Keep source captions relative to narration; the opening offset is applied at export.
cues, sentences, sentence = [], [], []
for word in words:
    if sentence and word['startMs'] - sentence[-1]['endMs'] > 750:
        sentences.append(sentence)
        sentence = []
    sentence.append(word)
    if word['text'].rstrip().endswith(('.', '?', '!')):
        sentences.append(sentence)
        sentence = []
if sentence:
    sentences.append(sentence)
# Choose balanced phrase boundaries instead of leaving articles or single words stranded.
bad_endings = {'a', 'an', 'the', 'its', 'and', 'or', 'our', 'their', 'first', 'with', 'to', 'of', 'for', 'by', 'as', 'that'}
for sentence in sentences:
    n = len(sentence)
    best = {n: (0, [])}
    for i in range(n - 1, -1, -1):
        candidates = []
        for j in range(i + 1, min(n, i + 16) + 1):
            text = ' '.join(w['text'].strip() for w in sentence[i:j])
            lines = textwrap.wrap(text, 46, break_long_words=False, break_on_hyphens=False)
            if len(text) > 84 or len(lines) > 2 or sentence[j - 1]['endMs'] - sentence[i]['startMs'] > 5000:
                continue
            if j not in best:
                continue
            count = j - i
            cost = 18 + ((len(text) - 55) / 12) ** 2
            if count < 4:
                cost += (4 - count) * 30
            last = sentence[j - 1]['text'].strip()
            if last.lower() in bad_endings and j < n:
                cost += 100
            if last.endswith(','):
                cost -= 8
            tail_cost, tail = best[j]
            candidates.append((cost + tail_cost, [(i, j), *tail]))
        assert candidates, 'Narration phrase cannot fit the caption area.'
        best[i] = min(candidates, key=lambda value: value[0])
    for i, j in best[0][1]:
        cues.append({'text': ' '.join(w['text'].strip() for w in sentence[i:j]), 'startMs': sentence[i]['startMs'], 'endMs': sentence[j - 1]['endMs'], 'timestampMs': None, 'confidence': None})
for i, cue in enumerate(cues):
    limit = cues[i + 1]['startMs'] - 40 if i + 1 < len(cues) else round((duration - offset / 1000) * 1000)
    cue['endMs'] = min(limit, max(cue['endMs'] + 140, cue['startMs'] + 800))
    assert cue['endMs'] > cue['startMs']
    assert len(textwrap.wrap(cue['text'], 46, break_long_words=False, break_on_hyphens=False)) <= 2
(OUT / 'captions.json').write_text(json.dumps(cues, indent=2) + '\n')

def stamp(ms, decimal=','):
    h, rem = divmod(int(ms), 3600000)
    m, rem = divmod(rem, 60000)
    s, milli = divmod(rem, 1000)
    return f'{h:02}:{m:02}:{s:02}{decimal}{milli:03}'
srt, vtt = [], ['WEBVTT\n']
for i, cue in enumerate(cues):
    lines = '\n'.join(textwrap.wrap(cue['text'], 46, break_long_words=False, break_on_hyphens=False))
    a, b = cue['startMs'] + offset, cue['endMs'] + offset
    srt.append(f'{i + 1}\n{stamp(a)} --> {stamp(b)}\n{lines}\n')
    vtt.append(f'{stamp(a, ".")} --> {stamp(b, ".")}\n{lines}\n')
(OUT / 'companyos-captions.srt').write_text('\n'.join(srt))
(OUT / 'companyos-captions.vtt').write_text('\n'.join(vtt))

fontfile = next(str(Path(p)) for p in ['/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'] if Path(p).exists())
font = ImageFont.truetype(fontfile, 42)
blank = WORK / 'blank.png'
Image.new('RGBA', (1600, 144)).save(blank)
concat, cursor = ['ffconcat version 1.0'], 0.0

def add_frame(file, seconds):
    if seconds > 0:
        escaped = str(file).replace("'", "'\\''")
        concat.extend([f"file '{escaped}'", f'duration {seconds:.6f}'])
for i, cue in enumerate(cues):
    start, end = (cue['startMs'] + offset) / 1000, (cue['endMs'] + offset) / 1000
    assert start >= cursor - 0.001
    add_frame(blank, max(0, start - cursor))
    image = Image.new('RGBA', (1600, 144))
    draw = ImageDraw.Draw(image)
    lines = textwrap.wrap(cue['text'], 46, break_long_words=False, break_on_hyphens=False)
    width = max(draw.textbbox((0, 0), line, font=font)[2] for line in lines) + 72
    height = len(lines) * 50 + 32
    x, y = (1600 - width) // 2, (144 - height) // 2
    assert width <= 1560
    draw.rounded_rectangle((x, y, x + width, y + height), radius=12, fill=(22, 25, 23, 236))
    for line_index, line in enumerate(lines):
        draw.text((800, y + 16 + line_index * 50), line, font=font, fill='white', anchor='mt')
    file = WORK / f'cue-{i:03}.png'
    image.save(file)
    add_frame(file, end - start)
    cursor = end
add_frame(blank, duration - cursor + 1)
concat.append(f"file '{blank}'")
(WORK / 'captions.ffconcat').write_text('\n'.join(concat) + '\n')
target = OUT / 'companyos-walkthrough-captioned.mp4'
subprocess.run([
    'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', str(WORK / 'captions.ffconcat'), '-i', str(source),
    '-filter_complex', '[0:v]format=rgba,fps=25[cap];[1:v][cap]overlay=(W-w)/2:H-h-32:shortest=1:format=auto[v]',
    '-map', '[v]', '-map', '1:a:0', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', str(target)
], check=True)
observed = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration:stream=codec_name,width,height', '-of', 'json', str(target)]))
assert abs(float(observed['format']['duration']) - duration) < 0.15
assert any(s['codec_name'] == 'aac' for s in observed['streams'])
# Existing shared video links now use the captioned version.
for file in ['companyos-walkthrough.mp4', 'companyos-walkthrough-with-opening.mp4']:
    shutil.copy2(target, OUT / file)
opening['output'] = source.name
opening.pop('alternateOutput', None)
(OUT / 'opening-manifest.json').write_text(json.dumps(opening, indent=2) + '\n')
p = OUT / 'capture-manifest.json'
capture = json.loads(p.read_text())
capture['presentation'].update({'captions': 'burned in', 'subtitles': 'companyos-captions.srt'})
p.write_text(json.dumps(capture, indent=2) + '\n')
manifest = {'provider': 'ElevenLabs forced alignment', 'captionCount': len(cues), 'words': len(words), 'openingOffsetMs': offset, 'source': source.name, 'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'output': target.name, 'outputSha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'durationSeconds': float(observed['format']['duration']), 'sourceCaptionTiming': 'relative to narration; opening offset applied in SRT/VTT and render', 'style': 'white text, dark background, max two lines, bottom safe area', 'audio': 'copied without re-encoding'}
(OUT / 'captions-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps(manifest))
