import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const out = '/candidate/sik19-browser-evidence';
await mkdir(out, { recursive: true, mode: 0o700 });

// Bundle MandiriReupload with react
const bundle = await build({
  stdin: {
    contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { MandiriReupload } from './src/components/mandiri-reupload';
      const root = createRoot(document.getElementById('root'));
      root.render(
        <div className="portal" style={{ minHeight: '100vh', padding: '20px' }}>
          <main style={{ maxWidth: '920px', margin: '0 auto', width: '100%' }}>
            <MandiriReupload
              ticket="TIK-202610-A1B2C3D4"
              birthDate="1990-05-15"
              revisionNote="Lampiran KTP pemohon buram dan tidak terbaca. Harap unggah ulang pindaian KTP asli dan KK terbaru."
            />
          </main>
        </div>
      );
    `,
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  bundle: true,
  write: false,
  platform: 'browser',
  jsx: 'automatic',
});

const browser = await chromium.launch({
  executablePath: '/opt/google/chrome/chrome',
  headless: true,
  args: ['--no-sandbox'],
});

const report = [];

try {
  for (const width of [360, 390, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.route('**/*', (r) => r.abort());
    await page.route('http://fixture.invalid/', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Fixture Mandiri Reupload</title></head><body style="margin:0;padding:0;"><div id="root"></div></body></html>',
      })
    );

    await page.goto('http://fixture.invalid/');

    // Inject portal CSS and globals
    const globalsCss = (await readFile('src/app/globals.css', 'utf8')).replace(/@import[^;]+;/g, '');
    const portalCss = await readFile('src/app/mandiri/portal.css', 'utf8');
    await page.addStyleTag({ content: globalsCss + '\n' + portalCss });

    // Mock API
    await page.evaluate(() => {
      window.calls = [];
      window.fetch = async (url, opts = {}) => {
        window.calls.push({ url, method: opts.method || 'GET' });
        return new Response(JSON.stringify({ success: true, message: 'Berkas perbaikan berhasil diterima.' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };
    });

    // Inject bundled component
    await page.addScriptTag({ content: bundle.outputFiles[0].text });

    // 1. Verify accessible revision banner
    const alertBanner = page.locator('.reupload-revision-banner[role="alert"]');
    await alertBanner.waitFor({ timeout: 5000 });
    const noteText = await alertBanner.locator('.reupload-banner-text').textContent();
    assert.match(noteText, /Lampiran KTP pemohon buram/);

    // 2. Verify inputs exist with proper descriptive labels
    const ktpInput = page.locator('#reupload-ktp');
    const kkInput = page.locator('#reupload-kk');
    const suratInput = page.locator('#reupload-surat');
    assert.equal(await ktpInput.count(), 1);
    assert.equal(await kkInput.count(), 1);
    assert.equal(await suratInput.count(), 1);

    // 3. Verify zero horizontal overflow
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    assert.equal(
      hasHorizontalOverflow,
      false,
      `Horizontal overflow detected at width ${width}px: scrollWidth=${await page.evaluate(() => document.documentElement.scrollWidth)}, innerWidth=${width}`
    );

    // 4. Verify submit button disabled when no file chosen
    const submitBtn = page.locator('.reupload-submit-btn');
    assert.equal(await submitBtn.isDisabled(), true);

    // 5. Test client-side validation for oversized file (>5MB)
    await ktpInput.setInputFiles({
      name: 'ktp-terlalu-besar.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.alloc(6 * 1024 * 1024), // 6MB
    });
    const fieldError = page.locator('.reupload-field-error');
    await fieldError.waitFor({ timeout: 2000 });
    assert.equal(await fieldError.textContent(), 'Ukuran berkas melebihi batas maksimal 5 MB.');
    assert.equal(await submitBtn.isDisabled(), true);

    // 6. Select valid file (<=5MB)
    await ktpInput.setInputFiles({
      name: 'ktp-valid.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.alloc(1024 * 500), // 500KB
    });
    // Field error should disappear and submit button enabled
    assert.equal(await fieldError.count(), 0);
    assert.equal(await submitBtn.isDisabled(), false);

    // 7. Verify zero emoji in DOM text
    const emojiRegex = /[\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F\u20E3]/u;
    const bodyText = await page.locator('body').innerText();
    const emojiMatch = bodyText.match(emojiRegex);
    assert.equal(emojiMatch, null, `Found emoji in body text at ${width}px: ${emojiMatch}`);

    // Take screenshot before submit
    await page.screenshot({ path: `${out}/reupload-${width}.png`, fullPage: true });

    // 8. Test submit action: progress state and success state
    await submitBtn.click();

    // Progress bar should appear
    const progressTrack = page.locator('.reupload-progress-box [role="progressbar"]');
    await progressTrack.waitFor({ timeout: 3000 });
    assert.equal(await submitBtn.isDisabled(), true);

    // Wait for success box
    const successBox = page.locator('.reupload-success-box[role="status"]');
    await successBox.waitFor({ timeout: 6000 });
    assert.match(
      await successBox.locator('.reupload-success-title').textContent(),
      /Dokumen Perbaikan Berhasil Dikirim/
    );

    // Screenshot after success
    await page.screenshot({ path: `${out}/reupload-${width}-success.png`, fullPage: true });

    assert.deepEqual(errors, []);
    report.push({
      width,
      bannerAlert: true,
      hasKtpInput: true,
      hasKkInput: true,
      hasSuratInput: true,
      oversizeRejected: true,
      submitDisabledWhileEmptyOrUploading: true,
      successAlertReceived: true,
      zeroEmoji: true,
      noOverflow: !hasHorizontalOverflow,
    });

    await page.close();
  }

  await writeFile(out + '/report.json', JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log('BROWSER_TEST_REPORT_OK');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
