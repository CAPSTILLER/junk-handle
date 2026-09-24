/** Trait swatches — color for lenses/fallback; url is the original asset (UI + model map). */
export type Swatch = {
  id: string
  label: string
  color: string
  /** Original texture/image asset for UI icons and model material maps. */
  url?: string
}

/** 10 frames — one *-tl per sheet 01–10. */
export const FRAME_SWATCHES: Swatch[] = [
  {
    id: '01-grid-tl',
    label: '01 grid',
    color: '#7e2429',
    url: './assets/textures/frames/01-grid-tl.jpg',
  },
  {
    id: '02-pink-marble-tl',
    label: '02 pink marble',
    color: '#925053',
    url: './assets/textures/frames/02-pink-marble-tl.jpg',
  },
  {
    id: '03-iridescent-purple-tl',
    label: '03 iridescent purple',
    color: '#71393b',
    url: './assets/textures/frames/03-iridescent-purple-tl.jpg',
  },
  {
    id: '04-weathered-bronze-tl',
    label: '04 weathered bronze',
    color: '#4d044e',
    url: './assets/textures/frames/04-weathered-bronze-tl.jpg',
  },
  {
    id: '05-gold-foil-tl',
    label: '05 gold foil',
    color: '#8c567e',
    url: './assets/textures/frames/05-gold-foil-tl.jpg',
  },
  {
    id: '06-icy-crystal-tl',
    label: '06 icy crystal',
    color: '#9761a9',
    url: './assets/textures/frames/06-icy-crystal-tl.jpg',
  },
  {
    id: '07-extra-tl',
    label: '07 extra',
    color: '#5d0b41',
    url: './assets/textures/frames/07-extra-tl.jpg',
  },
  {
    id: '08-extra-tl',
    label: '08 extra',
    color: '#420c04',
    url: './assets/textures/frames/08-extra-tl.jpg',
  },
  {
    id: '09-extra-tl',
    label: '09 extra',
    color: '#6c2856',
    url: './assets/textures/frames/09-extra-tl.jpg',
  },
  {
    id: '10-extra-tl',
    label: '10 extra',
    color: '#5e246a',
    url: './assets/textures/frames/10-extra-tl.jpg',
  },
]

/** 6 hair textures from Cap uploads (2026-09-24). */
export const HAIR_SWATCHES: Swatch[] = [
  {
    id: '01-strands',
    label: '01 strands',
    color: '#2b1a13',
    url: './assets/textures/hair/01-strands.jpg',
  },
  {
    id: '02-curls',
    label: '02 curls',
    color: '#4a1c11',
    url: './assets/textures/hair/02-curls.jpg',
  },
  {
    id: '03-weave',
    label: '03 weave',
    color: '#3f2418',
    url: './assets/textures/hair/03-weave.jpg',
  },
  {
    id: '04-crown',
    label: '04 crown',
    color: '#5f3924',
    url: './assets/textures/hair/04-crown.jpg',
  },
  {
    id: '05-chevron',
    label: '05 chevron',
    color: '#44271a',
    url: './assets/textures/hair/05-chevron.jpg',
  },
  {
    id: '06-block',
    label: '06 block',
    color: '#4c2c1e',
    url: './assets/textures/hair/06-block.jpg',
  },
]


/** 10 skin colors. */
export const SKIN_SWATCHES: Swatch[] = [
  {
    id: 'color-brown',
    label: 'brown',
    color: '#825237',
    url: './assets/textures/skin/color-brown.png',
  },
  {
    id: 'color-deep',
    label: 'deep',
    color: '#5e3824',
    url: './assets/textures/skin/color-deep.png',
  },
  {
    id: 'color-default-gray',
    label: 'default-gray',
    color: '#f5f5f5',
    url: './assets/textures/skin/color-default-gray.png',
  },
  {
    id: 'color-espresso',
    label: 'espresso',
    color: '#3e2418',
    url: './assets/textures/skin/color-espresso.png',
  },
  {
    id: 'color-fair',
    label: 'fair',
    color: '#ebc9af',
    url: './assets/textures/skin/color-fair.png',
  },
  {
    id: 'color-light',
    label: 'light',
    color: '#e0b694',
    url: './assets/textures/skin/color-light.png',
  },
  {
    id: 'color-medium',
    label: 'medium',
    color: '#ba8662',
    url: './assets/textures/skin/color-medium.png',
  },
  {
    id: 'color-porcelain',
    label: 'porcelain',
    color: '#f5e0d2',
    url: './assets/textures/skin/color-porcelain.png',
  },
  {
    id: 'color-tan',
    label: 'tan',
    color: '#a8704e',
    url: './assets/textures/skin/color-tan.png',
  },
  {
    id: 'color-warm-beige',
    label: 'warm-beige',
    color: '#d2a680',
    url: './assets/textures/skin/color-warm-beige.png',
  },
]
