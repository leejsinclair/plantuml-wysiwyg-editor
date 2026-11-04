// Classic worker: viz-global.js is a UMD classic script, plantuml.js an ES module (dynamic import).
self.window = self; // openiconic.js and emoji.js assign to window.*
const refused = [];
self.PLANTUML_STDLIB_LOADER = (url, ok, err) => { refused.push(url); err('refused: ' + url); };
self.PLANTUML_FILE_LOADER = (path, from, ok, err) => { refused.push(path); err('refused: ' + path); };

const t0 = performance.now();
let engine;
const ready = (async () => {
  importScripts('/engine/viz-global.js', '/engine/themes.js', '/engine/openiconic.js', '/engine/emoji.js');
  self.PLANTUML_VIZ = self.Viz;
  self.installDom?.();
  engine = await import('/engine/plantuml.js');
  postMessage({ type: 'ready', ms: performance.now() - t0 });
})().catch((e) => postMessage({ type: 'fatal', message: String(e && e.stack || e) }));

onmessage = async (e) => {
  await ready;
  const { id, text } = e.data;
  const start = performance.now();
  const before = refused.length;
  const done = (msg) => postMessage({ ...msg, id, ms: performance.now() - start, refused: refused.slice(before) });
  try {
    engine.renderToString(text.split(/\r\n|\r|\n/),
      (svg) => done({ type: 'svg', svg }),
      (message) => done({ type: 'error', message: String(message) }),
      { maxSvgSize: 0 });
  } catch (err) {
    done({ type: 'error', message: 'threw: ' + (err && err.stack || err) });
  }
};
