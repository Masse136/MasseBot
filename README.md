# MasseBot

`MasseBot-Test-75.js` är den kompletta källkoden för Test 75.

## Installation

Installera [MasseBot i Tampermonkey](https://mb75-updates-m136.butterycone8.chatgpt.site/massebot.user.js) och ladda om Minibia. Det gamla Chrome-snippetet behöver inte köras igen. Tampermonkey kontrollerar nya versioner på den fasta uppdateringsadressen.

## Publicering

1. Uppdatera källfilen och höj userscript-versionen i `scripts/build-release.mjs`.
2. Bygg med Node.js 22 eller senare:

   ```sh
   node scripts/build-release.mjs https://mb75-updates-m136.butterycone8.chatgpt.site
   ```

3. Publicera den genererade Workern från `dist/server/index.js` i samma Sites-projekt. Publicera bara versioner som har testats. En GitHub-commit publicerar inte automatiskt en ny version.
4. Verifiera att `/massebot.meta.js` och `/massebot.user.js` returnerar den nya versionen och `X-Robots-Tag: noindex, nofollow, noarchive`.
