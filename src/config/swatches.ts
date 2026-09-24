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

/** 10 hair textures from Cap uploads (2026-09-24). */
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
  {
    id: '07-dark-stripes',
    label: '07 dark stripes',
    color: '#2d170e',
    url: './assets/textures/hair/07-dark-stripes.jpg',
  },
  {
    id: '08-waves',
    label: '08 waves',
    color: '#321a11',
    url: './assets/textures/hair/08-waves.jpg',
  },
  {
    id: '09-swirl',
    label: '09 swirl',
    color: '#3a1f15',
    url: './assets/textures/hair/09-swirl.jpg',
  },
  {
    id: '10-highlight',
    label: '10 highlight',
    color: '#2d150e',
    url: './assets/textures/hair/10-highlight.jpg',
  },
]


/** Cap material skins 2026-09-24. */
export const SKIN_SWATCHES: Swatch[] = [
  {
    id: '01-hide',
    label: '01 hide',
    color: '#d6d6d5',
    url: './assets/textures/skin/01-hide.jpg',
  },
  {
    id: '02-brick',
    label: '02 brick',
    color: '#d3d3d1',
    url: './assets/textures/skin/02-brick.jpg',
  },
  {
    id: '03-mesh',
    label: '03 mesh',
    color: '#b1b1ad',
    url: './assets/textures/skin/03-mesh.jpg',
  },
  {
    id: '04-cracked',
    label: '04 cracked',
    color: '#cacac9',
    url: './assets/textures/skin/04-cracked.jpg',
  },
  {
    id: '05-wrinkle',
    label: '05 wrinkle',
    color: '#dadbdb',
    url: './assets/textures/skin/05-wrinkle.jpg',
  },
  {
    id: '06-porous',
    label: '06 porous',
    color: '#d5d6da',
    url: './assets/textures/skin/06-porous.jpg',
  },
  {
    id: '07-plaster',
    label: '07 plaster',
    color: '#cdccce',
    url: './assets/textures/skin/07-plaster.jpg',
  },
  {
    id: '08-marble',
    label: '08 marble',
    color: '#c8cace',
    url: './assets/textures/skin/08-marble.jpg',
  },
  {
    id: '09-bark',
    label: '09 bark',
    color: '#b0b1b3',
    url: './assets/textures/skin/09-bark.jpg',
  },
  {
    id: '10-brick-wall',
    label: '10 brick wall',
    color: '#c3c3c6',
    url: './assets/textures/skin/10-brick-wall.jpg',
  },
]
