import { spawn, execSync } from 'node:child_process';

const server = spawn('npm', ['run', 'start', '--workspace', '@split/server'], {
  stdio: 'inherit',
  env: { ...process.env, API_PORT: process.env.API_PORT || '4001' },
  shell: process.platform === 'win32',
});

const web = spawn('npm', ['run', 'start', '--workspace', '@split/web'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of [web, server]) {
    if (child.pid) {
      if (process.platform === 'win32') {
        try {
          execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
        } catch {}
      } else {
        child.kill();
      }
    }
  }
  process.exit(code ?? 0);
}

server.on('exit', (code) => stop(code));
web.on('exit', (code) => stop(code));
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
