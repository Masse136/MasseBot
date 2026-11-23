# MasseBot

`massebot.js` på `main` är den senaste publicerade botkoden för DevTools Snippets.

## Installation

Installera [MasseBot i Tampermonkey](https://mb75-updates-m136.butterycone8.chatgpt.site/massebot.user.js) och ladda om Minibia. Det gamla Chrome-snippetet behöver inte köras igen. Tampermonkey kontrollerar nya versioner på den fasta uppdateringsadressen.

### DevTools Snippets

Kör snippetet på Minibia när spelklienten har laddat klart.

```js
fetch('https://raw.githubusercontent.com/Masse136/MasseBot/refs/heads/main/massebot.js', { cache: 'no-store' })
  .then(response => {
    if (!response.ok) throw new Error(`MasseBot: HTTP ${response.status}`);
    return response.text();
  })
  .then(code => (0, eval)(code))
  .catch(console.error);
```

## Publicering

1. Uppdatera `massebot.js` på `main` för samma Snippets-länk och höj userscript-versionen i `scripts/build-release.mjs`.
2. Bygg med Node.js 22 eller senare:

   ```sh
   node scripts/build-release.mjs https://mb75-updates-m136.butterycone8.chatgpt.site
   ```

3. Publicera den genererade Workern från `dist/server/index.js` i samma Sites-projekt. Publicera bara versioner som har testats. En GitHub-commit publicerar inte automatiskt en ny version.
4. Verifiera att `/massebot.meta.js` och `/massebot.user.js` returnerar den nya versionen och `X-Robots-Tag: noindex, nofollow, noarchive`.
