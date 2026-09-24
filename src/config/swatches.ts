/** Trait swatches — color for lenses/fallback; url is the original asset (UI + model map). */
export type Swatch = {
  id: string
  label: string
  color: string
  /** Original texture/image asset for UI icons and model material maps. */
  url?: string
}

/** Cap frame materials 2026-09-24. */
export const FRAME_SWATCHES: Swatch[] = [
  {
    id: '01-haze',
    label: '01 haze',
    color: '#4d167e',
    url: './assets/textures/frames/01-haze.jpg',
  },
  {
    id: '02-mottle',
    label: '02 mottle',
    color: '#5e246a',
    url: './assets/textures/frames/02-mottle.jpg',
  },
  {
    id: '03-brushed',
    label: '03 brushed',
    color: '#570282',
    url: './assets/textures/frames/03-brushed.jpg',
  },
  {
    id: '04-scuff',
    label: '04 scuff',
    color: '#5c0a40',
    url: './assets/textures/frames/04-scuff.jpg',
  },
  {
    id: '05-crushed',
    label: '05 crushed',
    color: '#7f44bf',
    url: './assets/textures/frames/05-crushed.jpg',
  },
  {
    id: '06-velvet',
    label: '06 velvet',
    color: '#7f35aa',
    url: './assets/textures/frames/06-velvet.jpg',
  },
  {
    id: '07-silk',
    label: '07 silk',
    color: '#6d1f63',
    url: './assets/textures/frames/07-silk.jpg',
  },
  {
    id: '08-grain',
    label: '08 grain',
    color: '#43014f',
    url: './assets/textures/frames/08-grain.jpg',
  },
  {
    id: '09-felt',
    label: '09 felt',
    color: '#4d034e',
    url: './assets/textures/frames/09-felt.jpg',
  },
  {
    id: '10-fiber',
    label: '10 fiber',
    color: '#760176',
    url: './assets/textures/frames/10-fiber.jpg',
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
