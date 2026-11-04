// Engine host shared by the main-thread mode and the iframe: loads the support scripts, then renders on request.
const refused = [];
window.PLANTUML_STDLIB_LOADER = (url, ok, err) => { refused.push(url); err('refused: ' + url); };
window.PLANTUML_FILE_LOADER = (path, from, ok, err) => { refused.push(path); err('refused: ' + path); };

const classic = (src) => new Promise((res, rej) => {
  const s = document.createElement('script');
  s.src = src; s.onload = res; s.onerror = () => rej(new Error('load failed ' + src));
  document.head.append(s);
});

let engine;
export const ready = (async () => {
  for (const f of ['viz-global.js', 'themes.js', 'openiconic.js', 'emoji.js']) await classic('/engine/' + f);
  engine = await import('/engine/plantuml.js');
})();

export async function render(text) {
  await ready;
  const before = refused.length;
  const start = performance.now();
  return new Promise((resolve) => {
    const done = (msg) => resolve({ ...msg, ms: performance.now() - start, refused: refused.slice(before) });
    try {
      engine.renderToString(text.split(/\r\n|\r|\n/), (svg) => done({ type: 'svg', svg }), (m) => done({ type: 'error', message: String(m) }), { maxSvgSize: 0 });
    } catch (e) { done({ type: 'error', message: 'threw: ' + (e && e.stack || e) }); }
  });
}
