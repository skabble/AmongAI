// Arranca servidor e cliente em paralelo.
// As ferramentas são chamadas diretamente pelo node (em vez dos atalhos de node_modules/.bin)
// porque esses atalhos falham no Windows quando o caminho do projeto contém "&".
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const processes = [
  { name: 'server', cwd: 'packages/server', args: ['--watch', '--import', 'tsx', 'src/index.ts'] },
  { name: 'client', cwd: 'packages/client', args: [path.join(root, 'node_modules/vite/bin/vite.js')] },
].map(({ name, cwd, args }) => {
  const child = spawn(process.execPath, args, { cwd: path.join(root, cwd), stdio: 'inherit' });
  child.on('exit', (code) => {
    console.log(`[${name}] terminou com código ${code}`);
    shutdown();
  });
  return child;
});

function shutdown() {
  for (const child of processes) if (!child.killed) child.kill();
  process.exit();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
