#!/usr/bin/env node
// Build a deployable viewer and a configured AIDT skill package without mutating source files.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontendDir = path.join(rootDir, 'frontend');
const agentDir = path.join(rootDir, 'agent');
const tmpDir = path.join(rootDir, 'tmp');

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const result = { skipBuild: false };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--viewer-url') result.viewerUrl = argv[++index];
    else if (arg === '--out') result.out = argv[++index];
    else if (arg === '--skip-build') result.skipBuild = true;
    else fail(`Unknown argument: ${arg}`);
  }
  return result;
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function runBuild() {
  const windows = process.platform === 'win32';
  const executable = windows ? (process.env.ComSpec ?? 'cmd.exe') : 'corepack';
  const args = windows
    ? ['/d', '/s', '/c', 'corepack pnpm@10.12.1 build']
    : ['pnpm@10.12.1', 'build'];
  const command = spawnSync(executable, args, {
    cwd: frontendDir,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (command.error) fail(`Could not run frontend build: ${command.error.message}`);
  if (command.status !== 0) fail(`Frontend build failed with exit code ${command.status ?? 'unknown'}`);
}

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function collectFiles(directory, relative = '') {
  return fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const absolute = path.join(directory, entry.name);
      const itemPath = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) return collectFiles(absolute, itemPath);
      if (!entry.isFile()) return [];
      return [{ path: itemPath, bytes: fs.statSync(absolute).size, sha256: hashFile(absolute) }];
    });
}

function configureAgentScript(source, viewerUrl) {
  const marker = /const DEFAULT_VIEWER_URL = 'https:\/\/REPLACE-WITH-YOUR-VIEWER-HOST\/';/;
  if (!marker.test(source)) fail('Could not locate the agent viewer URL placeholder. Refusing to alter the package.');
  return source.replace(marker, `const DEFAULT_VIEWER_URL = ${JSON.stringify(viewerUrl)};`);
}

try {
  const args = parseArgs(process.argv);
  if (!args.viewerUrl) fail('Usage: node scripts/prepare-aidt-release.mjs --viewer-url <https URL> [--out <tmp path>] [--skip-build]');

  const viewer = new URL(args.viewerUrl);
  if (viewer.protocol !== 'https:') fail('viewer-url must use HTTPS for the AIDT preview iframe.');
  if (viewer.username || viewer.password || viewer.hash) fail('viewer-url must not contain credentials or a fragment.');

  const outputDir = path.resolve(args.out ?? path.join(tmpDir, 'aidt-release', timestamp()));
  if (!isInside(tmpDir, outputDir)) fail(`Release output must be below ${tmpDir}`);
  if (fs.existsSync(outputDir)) fail(`Release output already exists: ${outputDir}`);

  if (!args.skipBuild) runBuild();
  const distDir = path.join(frontendDir, 'dist');
  if (!fs.existsSync(distDir)) fail('frontend/dist is missing. Run without --skip-build or build the frontend first.');

  const viewerOut = path.join(outputDir, 'viewer');
  const agentOut = path.join(outputDir, 'agent');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.cpSync(distDir, viewerOut, { recursive: true, dereference: true });
  fs.mkdirSync(path.join(agentOut, 'scripts'), { recursive: true });
  fs.copyFileSync(path.join(agentDir, 'SKILL.md'), path.join(agentOut, 'SKILL.md'));

  const agentScript = fs.readFileSync(path.join(agentDir, 'scripts', 'pack_thin_html.mjs'), 'utf8');
  fs.writeFileSync(
    path.join(agentOut, 'scripts', 'pack_thin_html.mjs'),
    configureAgentScript(agentScript, viewer.href),
  );

  const manifest = {
    generatedAt: new Date().toISOString(),
    viewerUrl: viewer.href,
    viewerFiles: collectFiles(viewerOut),
    agentFiles: collectFiles(agentOut),
    usage: {
      deploy: 'Publish viewer/ to the configured HTTPS static-host URL.',
      upload: 'Create an archive from agent/ and upload it as the AIDT skill package.',
    },
  };
  fs.writeFileSync(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, outputDir, viewerUrl: viewer.href, manifest: path.join(outputDir, 'manifest.json') }));
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
}
