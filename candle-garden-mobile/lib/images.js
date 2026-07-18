/**
 * Local lifestyle photography for The Candle Garden app.
 * Bundled with the app so Expo Go / production builds work offline.
 */
export const lifestyle = {
  giftCandle: require('../assets/lifestyle/gift-candle.jpg'),
  pouringWax: require('../assets/lifestyle/pouring-wax.jpg'),
  classFragrance: require('../assets/lifestyle/class-fragrance.jpg'),
  classTeaching: require('../assets/lifestyle/class-teaching.jpg'),
  classPourSmile: require('../assets/lifestyle/class-pour-smile.jpg'),
  classMelt: require('../assets/lifestyle/class-melt.jpg'),
  scentMoment: require('../assets/lifestyle/scent-moment.jpg'),
  redCurrant: require('../assets/lifestyle/red-currant.jpg'),
};

/** Ordered gallery for Home horizontal strip */
export const homeGallery = [
  {
    key: 'gift',
    source: lifestyle.giftCandle,
    caption: 'Anything is possible',
    label: 'Shop',
  },
  {
    key: 'scent',
    source: lifestyle.scentMoment,
    caption: 'Scent that feels like home',
    label: 'Signature',
  },
  {
    key: 'pour',
    source: lifestyle.pouringWax,
    caption: 'Hand-poured with care',
    label: 'Craft',
  },
  {
    key: 'class',
    source: lifestyle.classTeaching,
    caption: 'Pour, laugh, take it home',
    label: 'Classes',
  },
  {
    key: 'fragrance',
    source: lifestyle.classFragrance,
    caption: 'Blend your own mood',
    label: 'Scents',
  },
  {
    key: 'currant',
    source: lifestyle.redCurrant,
    caption: 'Red Currant & favorites',
    label: 'Oils',
  },
];

export const classHero = lifestyle.classPourSmile;
export const classStrip = [
  lifestyle.classTeaching,
  lifestyle.classFragrance,
  lifestyle.classMelt,
  lifestyle.pouringWax,
];

export default lifestyle;
