// Legacy entry point. Execute current source, never a copied CSS implementation.
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2), positional = [];
while (args.length && !args[0].startsWith('--')) positional.push(args.shift());
if (positional.length) {
  const defaults = [984, 784, 1, 10, 140];
  args.unshift('--case', defaults.map((v, i) => positional[i] ?? v).join(','));
}
const result = spawnSync(process.execPath, [path.join(__dirname, 'probe_eg_scroll.mjs'), ...args], { stdio: 'inherit', windowsHide: true });
if (result.error) { console.error(result.error.message); process.exit(2); }
process.exit(result.status ?? 2);
