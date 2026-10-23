import { generateKeyPairSync } from 'node:crypto';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const envFile = new URL('.env', root);
const exampleFile = new URL('.env.example', root);
if (!existsSync(envFile)) {
  copyFileSync(exampleFile, envFile);
} else {
  const existing = readFileSync(envFile, 'utf8');
  const names = new Set([...existing.matchAll(/^([A-Z_]+)=/gm)].map((match) => match[1]));
  const additions = readFileSync(exampleFile, 'utf8')
    .split(/\r?\n/)
    .filter((line) => /^[A-Z_]+=/.test(line) && !names.has(line.split('=')[0]));
  if (additions.length) appendFileSync(envFile, `\n${additions.join('\n')}\n`);
}

const keysDir = new URL('.local/keys/', root);
mkdirSync(keysDir, { recursive: true });
const privatePath = new URL('private.pem', keysDir);
const publicPath = new URL('public.pem', keysDir);

if (existsSync(privatePath) !== existsSync(publicPath)) {
  throw new Error('Only one JWT key exists. Restore the matching pair before running setup.');
}

if (!existsSync(privatePath)) {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  writeFileSync(privatePath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  writeFileSync(publicPath, publicKey.export({ type: 'spki', format: 'pem' }), { mode: 0o644 });
}

console.log('Local .env and ES256 JWT key pair are ready.');
