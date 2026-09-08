# Jiahao Feng

Personal website: https://jhfeng.com/

## Orbit

An interactive sculpture built in Blender and displayed with Three.js.

https://jhfeng.com/lab/orbit/

Drag to orbit, pinch to zoom, switch between three lighting palettes, pause the
animation, and expand the orbital rings. Arrow keys rotate the view; plus and
minus zoom. The page respects reduced motion and provides a rendered image if
WebGL or model loading fails. It pauses rendering in hidden tabs.

The model uses 13 mesh objects and approximately 27,100 triangles. Fonts, model,
preview and JavaScript are served from this repository. No runtime API or server
rendering is needed.

## Development

Use Node.js 20 or later. Install locked dependencies with `npm ci`, validate syntax
with `npm run check`, and rebuild the browser bundle with `npm run build`.
Serve the repository root with a static HTTP server and open `/lab/orbit/`.

`src/orbit.js` is the editable JavaScript source; `lab/orbit/app.js` is the built
bundle. The `.nojekyll` file allows GitHub Pages to serve these static files
directly. The custom domain is recorded in `CNAME`.

Font license files are included in `lab/orbit/assets/fonts/`; Three.js license
information is retained in the generated bundle. The sculpture is original work
created for this website.
