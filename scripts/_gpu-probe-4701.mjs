// TEMPORARY probe — delete when done.
import { chromium } from 'playwright';
const variants = [
  { name: 'swiftshader', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  { name: 'd3d11', args: ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-features=Vulkan'] },
  { name: 'default-gpu', args: ['--enable-gpu', '--ignore-gpu-blocklist'] },
  { name: 'egl', args: ['--use-gl=egl', '--enable-gpu', '--ignore-gpu-blocklist'] },
];
for (const v of variants) {
  try {
    const b = await chromium.launch({ args: v.args });
    const p = await b.newPage();
    const r = await p.evaluate(() => {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      if (!gl) return { gl: false };
      const d = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        gl: true, ver: gl.getParameter(gl.VERSION),
        vendor: d ? gl.getParameter(d.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
        renderer: d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      };
    });
    console.log(v.name, JSON.stringify(r));
    await b.close();
  } catch (e) { console.log(v.name, 'FAIL', String(e).slice(0, 120)); }
}
