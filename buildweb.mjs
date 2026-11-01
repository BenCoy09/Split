import { execSync } from 'node:child_process';
import fs from 'node:fs';

try {
  const out = execSync('npm run build --workspace @split/web', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 20 * 1024 * 1024,
    timeout: 300000,
  });
  fs.writeFileSync('build-out.txt', 'OK\n' + out.slice(-1200));
} catch (err) {
  fs.writeFileSync('build-out.txt', 'FAILED\n' + (err.stdout ?? '').slice(-2000) + (err.stderr ?? '').slice(-2000));
}
