import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const [originArgument, outputDirectory] = process.argv.slice(2);
const origin = new URL(originArgument);
if (origin.protocol !== 'https:' || origin.href !== origin.origin + '/') {
  throw new Error('Supply the HTTPS release origin without a path.');
}

const version = '76.0.0';
const source = await readFile(new URL('../massebot.js', import.meta.url), 'utf8');
const metadata = `// ==UserScript==
// @name         MasseBot
// @namespace    https://github.com/Masse136/MasseBot
// @version      ${version}
// @match        https://minibia.com/play*
// @match        https://www.minibia.com/play*
// @run-at       document-idle
// @noframes
// @grant        none
// @sandbox      raw
// @updateURL    ${origin.origin}/massebot.meta.js
// @downloadURL  ${origin.origin}/massebot.user.js
// ==/UserScript==
`;
const bootstrap = `(function () {
  'use strict';
  if (!/^\\/play\\/?$/.test(location.pathname) || window.MasseBot2) return;

  const waitingSince = Date.now();
  let sawLoader = false;
  let notice;

  const timer = setInterval(() => {
    if (window.MasseBot2) {
      clearInterval(timer);
      notice?.remove();
      return;
    }
    const loader = document.querySelector('.loader-wrapper');
    sawLoader ||= Boolean(loader);
    const login = document.getElementById('login-wrapper');
    const game = document.getElementById('game-wrapper');
    const loginReady = (sawLoader || Boolean(login?.style.display)) && login?.getClientRects().length;
    const clientReady = window.__CLIENT_BUILD && window.__ccBoot && !loader &&
      (game?.getClientRects().length || loginReady);
    if (clientReady) {
      clearInterval(timer);
      notice?.remove();
      start();
      return;
    }
    if (!notice && Date.now() - waitingSince >= 15000 && document.body) {
      notice = document.createElement('div');
      notice.setAttribute('role', 'status');
      notice.style.cssText = 'position:fixed;top:24px;left:24px;z-index:2147483647;max-width:calc(100vw - 48px);padding:12px;background:#17202d;color:white;font:14px Arial,sans-serif';
      notice.textContent = 'MasseBot väntar på att Minibia ska laddas klart.';
      document.body.append(notice);
    }
  }, 250);

  function start() {
${source}
  }
})();
`;

const html = `<!doctype html>
<html lang="sv">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<title>MasseBot</title>
<style>body{max-width:35rem;margin:4rem auto;padding:0 1.25rem;font:1rem/1.6 system-ui,sans-serif}a{color:#1857ab}</style>
<h1>MasseBot</h1>
<p>Öppna installationsfilen i en webbläsare där Tampermonkey är installerat.</p>
<p><a href="/massebot.user.js">Installera MasseBot ${version}</a></p>
<p>Ladda om Minibia efter installationen. Om du tidigare startade MasseBot med ett Chrome Snippet behöver du inte köra snippetet längre.</p>
</html>
`;
const javascript = 'text/javascript; charset=utf-8';
const files = {
  '/': ['text/html; charset=utf-8', html],
  '/massebot.meta.js': [javascript, metadata],
  '/massebot.user.js': [javascript, metadata + '\n' + bootstrap],
};
const archivedFiles = Object.fromEntries(Object.entries(files).map(([path, [type, content]]) =>
  [path, { type, gzip: gzipSync(content).toString('base64') }]
));

const worker = `const files = ${JSON.stringify(archivedFiles)};
export default {
  fetch(request) {
    const headers = new Headers({
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache',
    });
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      headers.set('Allow', 'GET, HEAD');
      return new Response(null, { status: 405, headers });
    }
    const path = new URL(request.url).pathname;
    if (!Object.hasOwn(files, path)) return new Response(null, { status: 404, headers });
    const file = files[path];
    headers.set('Content-Type', file.type);
    if (request.method === 'HEAD') return new Response(null, { headers });
    const bytes = Uint8Array.from(atob(file.gzip), character => character.charCodeAt(0));
    const body = new Response(bytes).body.pipeThrough(new DecompressionStream('gzip'));
    return new Response(body, { headers });
  }
};
`;

const output = resolve(outputDirectory ?? 'dist/server');
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'index.js'), worker);
