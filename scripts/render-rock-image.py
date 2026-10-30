#!/usr/bin/env python3
"""Render the metadata image (clear, full textured rock with its active face, front view) for a CAPs Rock.

Usage:  python3 scripts/render-rock-image.py <id> [blank|f<N>]
Needs:  pip install playwright && playwright install chromium
How:    opens the live embed (?still=1) and swaps the low-poly model for the textured model from
        capsmind's /api/rocks/<id>/preview.glb, ONLY inside this local browser, then screenshots it.
        Writes public/rocks/img/<id>-<key>.png and registers it in shared/rocksImages.ts. Commit + push to publish.
Re-run whenever the rock's active face changes (key = f<activeFaceIndex>, or blank), then OpenSea "Refresh metadata".
"""
import re, sys, urllib.request, pathlib
from playwright.sync_api import sync_playwright

rid = int(sys.argv[1]); key = sys.argv[2] if len(sys.argv) > 2 else 'blank'
root = pathlib.Path(__file__).resolve().parent.parent
q = '' if key == 'blank' else f'?face={key[1:]}'
glb = urllib.request.urlopen(f'https://capsmind.gearup.wtf/api/rocks/{rid}/preview.glb{q}', timeout=60).read()
out = root / 'public/rocks/img' / f'{rid}-{key}.png'
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': 1000, 'height': 1000}, device_scale_factor=1)
    pg.route(re.compile(r'.*/api/rocks/display.*'), lambda r: r.fulfill(status=200, body=glb, headers={'content-type': 'model/gltf-binary'}))
    pg.goto(f'https://mywally.gearup.wtf/rocks/embed/{rid}?still=1')
    pg.wait_for_function("!document.querySelector('.status')", timeout=90000)
    pg.wait_for_timeout(2500)
    pg.screenshot(path=str(out)); b.close()
reg = root / 'shared/rocksImages.ts'; s = reg.read_text(); line = f"  '{rid}-{key}': '{rid}-{key}.png',\n"
if line not in s: reg.write_text(s.replace('= {\n', '= {\n' + line, 1))
print('wrote', out)
