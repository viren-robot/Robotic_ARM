# esptool-js 0.7.0 (vendored)

Espressif's [esptool-js](https://github.com/espressif/esptool-js), pinned to **exactly 0.7.0** and committed here so the
page can flash firmware offline. License: Apache-2.0 (see `LICENSE`).

- npm package: `esptool-js@0.7.0`, integrity `sha512-9wHuW/s9t4Vs6HKcr3pra3gbRVWwaN0eabMWodWH4KEJHEYZxgmWwZ3s0F4xcWVCZOc/L98bGZ4uWoZvR8KBKA==`
- bundled dependencies: `pako@2.2.0`, `atob-lite@2.0.0`
- `esptool-js.bundle.js` sha256: `ebbea021cc9e1c9a150730fb6fcd9301170fbb57329abfca37e83f3f079b812f`

`esptool-js.bundle.js` is one ES module (the package's `lib/index.js` plus its two dependencies). The website itself has no build
step; this file was made once, and only needs rebuilding to update esptool-js:

```sh
mkdir tmp && cd tmp && npm init -y
npm install --save-exact esptool-js@0.7.0 esbuild
npx esbuild node_modules/esptool-js/lib/index.js --bundle --format=esm --target=es2020 --legal-comments=none \
    --outfile=../vendor/esptool-js-0.7.0/esptool-js.bundle.js
```
