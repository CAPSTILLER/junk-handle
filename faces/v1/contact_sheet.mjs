import fs from 'node:fs';
import { renderSvg, renderPng, traits } from './faces_v1.js';
const W = ['0x17Db8FaD0154c64bbc0D8154556291c11D16b9F7', '0x604b2e24df58ef019312b8367af763a7f156bf08', '0x000000000000000000000000000000000000dEaD', '0xC86166D9645cFFF31510670E85C7bb5b2296dC6A'];
const vs = (process.argv[2] || '0,1,2').split(',').map(Number), out = process.argv[3] || 'contact_sheet.png';
const cw = 520, ch = 420; let body = '';
W.forEach((a, r) => vs.forEach((v, c) => {
  const inner = renderSvg(a, v).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '').replace(/id="s"/, `id="s${r}_${c}"`).replace('url(#s)', `url(#s${r}_${c})`);
  const t = traits(a, v);
  body += `<g transform="translate(${c * cw + 10} ${r * ch + 10})"><svg x="0" y="-40" width="500" height="500" viewBox="0 0 2400 2400">${inner}</svg><text x="250" y="400" fill="#ccd" font-size="17" text-anchor="middle" font-family="DejaVu Sans">${a.slice(0, 10)}… v${v} · ${t.mood} · ${t.eyes}/${t.brows}${t.crown ? ' · crown' : ''}${t.seer ? ' · seer' : ''}</text></g>`;
}));
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${vs.length * cw + 20}" height="${W.length * ch + 20}"><rect width="100%" height="100%" fill="#0d1117"/>${body}</svg>`;
const { Resvg } = await import('@resvg/resvg-js');
fs.writeFileSync(out, new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng());
