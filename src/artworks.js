import source from './portfolio.json';

export let portfolio = source;
export let artworks = source.artworks.map(({ placement, ...content }) => ({ ...content, ...placement, placement }));

export function replacePortfolio(next) {
  portfolio = next;
  artworks = next.artworks.map(({ placement, ...content }) => ({ ...content, ...placement, placement }));
}
