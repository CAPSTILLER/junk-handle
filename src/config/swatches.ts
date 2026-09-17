/** Solid-color trait swatches (avg RGB from source images; near-white borders ignored). */
export type Swatch = {
  id: string
  label: string
  color: string
  /** Optional source image — kept for icons/reference, not applied as texture. */
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

/** 10 hair options picked from the 16 cropped quads. */
export const HAIR_SWATCHES: Swatch[] = [
  {
    id: '01-brown-grid-tl',
    label: '01 brown tl',
    color: '#49312c',
    url: './assets/textures/hair/01-brown-grid-tl.jpg',
  },
  {
    id: '01-brown-grid-br',
    label: '01 brown br',
    color: '#5e3d32',
    url: './assets/textures/hair/01-brown-grid-br.jpg',
  },
  {
    id: '01-brown-grid-tr',
    label: '01 brown tr',
    color: '#644034',
    url: './assets/textures/hair/01-brown-grid-tr.jpg',
  },
  {
    id: '02-natural-grid-tl',
    label: '02 natural tl',
    color: '#8c4d26',
    url: './assets/textures/hair/02-natural-grid-tl.jpg',
  },
  {
    id: '02-natural-grid-br',
    label: '02 natural br',
    color: '#100c08',
    url: './assets/textures/hair/02-natural-grid-br.jpg',
  },
  {
    id: '02-natural-grid-tr',
    label: '02 natural tr',
    color: '#411c0d',
    url: './assets/textures/hair/02-natural-grid-tr.jpg',
  },
  {
    id: '03-auburn-grid-tl',
    label: '03 auburn tl',
    color: '#1f110c',
    url: './assets/textures/hair/03-auburn-grid-tl.jpg',
  },
  {
    id: '03-auburn-grid-br',
    label: '03 auburn br',
    color: '#5c241a',
    url: './assets/textures/hair/03-auburn-grid-br.jpg',
  },
  {
    id: '04-streak-grid-tl',
    label: '04 streak tl',
    color: '#33221e',
    url: './assets/textures/hair/04-streak-grid-tl.jpg',
  },
  {
    id: '04-streak-grid-br',
    label: '04 streak br',
    color: '#604a3a',
    url: './assets/textures/hair/04-streak-grid-br.jpg',
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
