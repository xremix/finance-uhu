#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(repositoryRoot, 'docs', 'screenshots');
const demoCsv = path.join(repositoryRoot, 'demo.csv');
const baseUrlFromEnvironment = process.env.SCREENSHOT_BASE_URL;

let serverProcess;
let browser;

async function getAvailablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer(url) {
  const deadline = Date.now() + 120_000;
  let lastError;

  while (Date.now() < deadline) {
    if (serverProcess?.exitCode !== null && serverProcess?.exitCode !== undefined) {
      throw new Error(`Angular dev server exited with code ${serverProcess.exitCode}.`);
    }

    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for ${url}: ${lastError?.message ?? 'no response'}`);
}

async function startApp() {
  if (baseUrlFromEnvironment) {
    const url = baseUrlFromEnvironment.replace(/\/$/, '');
    await waitForServer(url);
    return url;
  }

  const port = await getAvailablePort();
  const angularCli = path.join(repositoryRoot, 'node_modules', '@angular', 'cli', 'bin', 'ng.js');
  serverProcess = spawn(process.execPath, [angularCli, 'serve', '--host', '127.0.0.1', '--port', String(port), '--no-open'], {
    cwd: repositoryRoot,
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  const url = `http://127.0.0.1:${port}`;
  await waitForServer(url);
  return url;
}

async function captureScreenshots() {
  await mkdir(outputDirectory, { recursive: true });
  const baseUrl = await startApp();
  browser = await chromium.launch({ headless: true });

  const context = await browser.newContext({
    viewport: { width: 1600, height: 1800 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#welcomeTitle').waitFor({ state: 'visible' });
  await page.setViewportSize({ width: 1600, height: 1320 });
  await page.screenshot({
    path: path.join(outputDirectory, 'startseite.png'),
  });

  await page.setViewportSize({ width: 1600, height: 1800 });
  await page.locator('#file-upload-big').setInputFiles(demoCsv);
  await page.locator('#dashboardTitle').waitFor({ state: 'visible', timeout: 30_000 });
  const foodCategory = page.locator('.cat-grid .cat-tile').filter({ hasText: 'Essen & Trinken' }).first();
  await foodCategory.waitFor({ state: 'visible' });
  await foodCategory.click();
  await page.waitForTimeout(500);

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({
    path: path.join(outputDirectory, 'essen-und-trinken.png'),
  });

  await page.locator('.cat-grid .cat-tile.all').click();
  await page.getByRole('tab', { name: 'Alle Buchungen' }).click();
  await page.getByRole('heading', { name: /^Alle Buchungen/ }).waitFor({ state: 'visible' });
  const tabs = page.getByRole('tablist', { name: 'Detailansichten' });
  await tabs.evaluate((element) => {
    window.scrollTo({ top: element.getBoundingClientRect().top + window.scrollY - 80, behavior: 'instant' });
  });
  await page.mouse.move(1590, 1790);
  await page.waitForTimeout(200);
  await page.screenshot({
    path: path.join(outputDirectory, 'alle-buchungen.png'),
  });

  await context.close();
}

try {
  await captureScreenshots();
  console.log(`Screenshots written to ${path.relative(repositoryRoot, outputDirectory)}`);
} finally {
  await browser?.close();
  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill('SIGTERM');
    await new Promise((resolve) => serverProcess.once('exit', resolve));
  }
}
