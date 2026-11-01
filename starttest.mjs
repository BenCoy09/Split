import { spawn } from 'node:child_process';
import fs from 'node:fs';

const child = spawn('node', ['scripts/start-all.mjs'], {
  env: { ...process.env, API_PORT: '4002', PORT: '3005' },
  shell: true,
});

let out = '';
child.stdout.on('data', (d) => (out += d));
child.stderr.on('data', (d) => (out += d));

setTimeout(() => {
  fs.writeFileSync('startlog.txt', out || '(no output)');
  child.kill();
  process.exit(0);
}, 12000);
