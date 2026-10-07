import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve, basename } from 'node:path';

const root = process.cwd();
const portfolioPath = resolve(root, 'src/portfolio.json');
const imageDirectory = resolve(root, 'public/artworks');
const accessToken = process.env.CURATOR_ACCESS_TOKEN || randomBytes(24).toString('base64url');

function equalToken(received) {
  if (typeof received !== 'string') return false;
  const actual = Buffer.from(received);
  const expected = Buffer.from(accessToken);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function readBody(request, limit = 12 * 1024 * 1024) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > limit) throw new Error('Request is too large.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function send(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
}

function curatorApi() {
  return {
    name: 'local-curator-api',
    configureServer(server) {
      console.log(`\n  Curator access token (keep private): ${accessToken}\n  Open ${server.config.server.https ? 'https' : 'http'}://localhost:${server.config.server.port || 5173}/manage\n`);
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url || '/', 'http://localhost');
        if (!url.pathname.startsWith('/api/manage/')) return next();
        if (request.method === 'OPTIONS') { response.writeHead(204, { 'allow': 'GET,POST,PUT,OPTIONS' }); response.end(); return; }
        try {
          if (url.pathname === '/api/manage/auth' && request.method === 'POST') {
            const body = await readBody(request, 2048);
            return equalToken(body.token) ? send(response, 200, { authenticated: true }) : send(response, 401, { error: 'Access token not recognized.' });
          }
          const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
          if (!equalToken(token)) return send(response, 401, { error: 'Curator access required.' });
          if (url.pathname === '/api/manage/portfolio' && request.method === 'GET') {
            return send(response, 200, JSON.parse(await readFile(portfolioPath, 'utf8')));
          }
          if (url.pathname === '/api/manage/portfolio' && request.method === 'PUT') {
            const nextState = await readBody(request);
            if (!Array.isArray(nextState.artworks) || !Array.isArray(nextState.commissions) || !nextState.profile || nextState.artworks.length > 250 || nextState.commissions.length > 100) return send(response, 400, { error: 'Portfolio data is incomplete or too large.' });
            const ids = new Set();
            for (const art of nextState.artworks) {
              const placement = art.placement;
              if (typeof art.id !== 'string' || ids.has(art.id) || typeof art.title !== 'string' || typeof art.year !== 'string' || typeof art.medium !== 'string' || !/^\/artworks\/[\w.-]+$/.test(art.image || '') || !placement || !Array.isArray(placement.position) || placement.position.length !== 3 || !placement.position.every(Number.isFinite) || !Array.isArray(placement.size) || placement.size.length !== 2 || !placement.size.every(value => Number.isFinite(value) && value >= .4 && value <= 4) || !Number.isFinite(placement.rotation)) return send(response, 400, { error: `Artwork “${art.title || 'untitled'}” has invalid content or placement.` });
              ids.add(art.id);
            }
            const serviceCategories = new Set(['vtuber','pngtuber','stream-assets','illustration']);
            for (const service of nextState.commissions) {
              if (!serviceCategories.has(service.category) || (service.published && !String(service.title || '').trim())) return send(response, 400, { error: 'Each published commission needs a category and service name.' });
              if (service.artworkId && !ids.has(service.artworkId)) return send(response, 400, { error: `Commission example for “${service.title || 'untitled'}” is missing.` });
            }
            const temporaryPath = `${portfolioPath}.tmp`;
            await writeFile(temporaryPath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8');
            await rename(temporaryPath, portfolioPath);
            return send(response, 200, { saved: true });
          }
          if (url.pathname === '/api/manage/image' && request.method === 'POST') {
            const body = await readBody(request, 6 * 1024 * 1024);
            if (typeof body.data !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/.test(body.data)) return send(response, 400, { error: 'Choose a PNG, JPEG, or WebP image.' });
            const bytes = Buffer.from(body.data.slice(body.data.indexOf(',') + 1), 'base64');
            if (bytes.length > 4 * 1024 * 1024 || bytes.length < 16) return send(response, 400, { error: 'Image must be under 4 MB.' });
            const webp = bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
            if (!webp) return send(response, 400, { error: 'Image conversion failed. Please try another image.' });
            await mkdir(imageDirectory, { recursive: true });
            const filename = `curator-${randomUUID()}.webp`;
            await writeFile(resolve(imageDirectory, basename(filename)), bytes, { flag: 'wx' });
            return send(response, 201, { image: `/artworks/${filename}` });
          }
          return send(response, 404, { error: 'Curator endpoint not found.' });
        } catch (error) {
          return send(response, 400, { error: error instanceof Error ? error.message : 'Request failed.' });
        }
      });
    },
  };
}

export default {
  plugins: [curatorApi()],
  build: { rollupOptions: { output: { manualChunks: { three: ['three'] } } } },
};
