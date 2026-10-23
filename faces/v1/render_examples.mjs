import fs from 'node:fs';
import { renderSvg, renderPng, traits, publicTraits, svgHash } from './faces_v1.js';
const W = ['0x17Db8FaD0154c64bbc0D8154556291c11D16b9F7', '0x604b2e24df58ef019312b8367af763a7f156bf08', '0x000000000000000000000000000000000000dEaD', '0xC86166D9645cFFF31510670E85C7bb5b2296dC6A'];
fs.mkdirSync('examples', { recursive: true });
const vec = [];
const extra = process.argv[2] === 'all7';
for (const a of W) for (const v of (extra ? [0,1,2,3,4,5,6,7,8] : [0, 1, 2])) {
  const svg = renderSvg(a, v), mask = renderSvg(a, v, { mode: 'mask' });
  const n = `examples/${a.slice(0, 8).toLowerCase()}_v${v}`;
  fs.writeFileSync(n + '.svg', svg); fs.writeFileSync(n + '.png', await renderPng(svg));
  if (!extra) fs.writeFileSync(n + '_mask.png', await renderPng(mask));
  vec.push({ wallet: a, variant: v, svgKeccak: svgHash(svg), maskSvgKeccak: svgHash(mask), traits: publicTraits(traits(a, v)) });
}
fs.writeFileSync(extra ? 'examples/all_moods.json' : 'test_vectors.json', JSON.stringify(vec, null, 1));
console.log(vec.map((x) => x.wallet.slice(0, 8) + ' v' + x.variant + ' ' + JSON.stringify(x.traits)).join('\n'));
