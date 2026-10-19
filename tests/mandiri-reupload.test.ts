import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  validateReuploadFile,
  validateReuploadBundle,
  isRevisionRequired,
  statusView,
  REUPLOAD_MAX_FILE_SIZE,
} from '../src/lib/mandiri-ui';

test('isRevisionRequired identifies revision states correctly', () => {
  assert.equal(isRevisionRequired('NEEDS_REVISION'), true);
  assert.equal(isRevisionRequired('REVISION_REQUIRED'), true);
  assert.equal(isRevisionRequired('PERLU_REVISI'), true);
  assert.equal(isRevisionRequired('needs_revision'), true);
  assert.equal(isRevisionRequired('perlu_revisi'), true);

  assert.equal(isRevisionRequired('PENDING_VERIFICATION'), false);
  assert.equal(isRevisionRequired('APPROVED'), false);
  assert.equal(isRevisionRequired('COMPLETED'), false);
  assert.equal(isRevisionRequired('REJECTED'), false);
  assert.equal(isRevisionRequired(''), false);
  assert.equal(isRevisionRequired(undefined), false);
  assert.equal(isRevisionRequired(null), false);
});

test('statusView supports revision status aliases', () => {
  const s1 = statusView('NEEDS_REVISION');
  assert.equal(s1.label, 'Perlu perbaikan');
  assert.equal(s1.step, 1);

  const s2 = statusView('REVISION_REQUIRED');
  assert.equal(s2.label, 'Perlu perbaikan');
  assert.equal(s2.step, 1);

  const s3 = statusView('PERLU_REVISI');
  assert.equal(s3.label, 'Perlu perbaikan');
  assert.equal(s3.step, 1);
});

test('validateReuploadFile accepts valid PDF, JPG, PNG under 5MB', () => {
  const pdf = validateReuploadFile({
    name: 'ktp-pemohon.pdf',
    size: 2 * 1024 * 1024,
    type: 'application/pdf',
  });
  assert.equal(pdf.valid, true);
  assert.equal(pdf.error, undefined);

  const jpg = validateReuploadFile({
    name: 'foto-ktp.jpg',
    size: 1.5 * 1024 * 1024,
    type: 'image/jpeg',
  });
  assert.equal(jpg.valid, true);

  const png = validateReuploadFile({
    name: 'kartu-keluarga.png',
    size: 4 * 1024 * 1024,
    type: 'image/png',
  });
  assert.equal(png.valid, true);

  // Exact 5MB boundary
  const exactMax = validateReuploadFile({
    name: 'surat-pengantar.pdf',
    size: REUPLOAD_MAX_FILE_SIZE,
    type: 'application/pdf',
  });
  assert.equal(exactMax.valid, true);
});

test('validateReuploadFile rejects empty files (0 bytes)', () => {
  const res = validateReuploadFile({
    name: 'kosong.pdf',
    size: 0,
    type: 'application/pdf',
  });
  assert.equal(res.valid, false);
  assert.equal(res.error, 'Berkas kosong tidak dapat diunggah.');
});

test('validateReuploadFile rejects files exceeding 5MB', () => {
  const res = validateReuploadFile({
    name: 'dokumen-besar.pdf',
    size: REUPLOAD_MAX_FILE_SIZE + 1,
    type: 'application/pdf',
  });
  assert.equal(res.valid, false);
  assert.equal(res.error, 'Ukuran berkas melebihi batas maksimal 5 MB.');
});

test('validateReuploadFile rejects unsupported MIME or file types', () => {
  const exe = validateReuploadFile({
    name: 'virus.exe',
    size: 1024,
    type: 'application/x-msdownload',
  });
  assert.equal(exe.valid, false);
  assert.equal(exe.error, 'Format berkas tidak didukung. Gunakan format PDF, JPG, atau PNG.');

  const txt = validateReuploadFile({
    name: 'catatan.txt',
    size: 1024,
    type: 'text/plain',
  });
  assert.equal(txt.valid, false);
});

test('validateReuploadBundle ensures at least one valid file is chosen', () => {
  const emptyBundle = validateReuploadBundle({
    ktp: null,
    kk: null,
    surat_pendukung: null,
  });
  assert.equal(emptyBundle.valid, false);
  assert.equal(emptyBundle.error, 'Pilih minimal satu berkas perbaikan untuk diunggah.');

  const validBundle = validateReuploadBundle({
    ktp: { name: 'ktp.jpg', size: 1024 * 1024, type: 'image/jpeg' },
    kk: null,
    surat_pendukung: null,
  });
  assert.equal(validBundle.valid, true);

  const invalidInBundle = validateReuploadBundle({
    ktp: { name: 'ktp.jpg', size: 1024 * 1024, type: 'image/jpeg' },
    kk: { name: 'kk.zip', size: 1024 * 1024, type: 'application/zip' },
    surat_pendukung: null,
  });
  assert.equal(invalidInBundle.valid, false);
  assert.equal(invalidInBundle.error, 'Format berkas tidak didukung. Gunakan format PDF, JPG, atau PNG.');
});

test('mandiri-reupload component file has zero emoji', () => {
  const compPath = path.resolve(__dirname, '../src/components/mandiri-reupload.tsx');
  assert.equal(fs.existsSync(compPath), true);
  const content = fs.readFileSync(compPath, 'utf8');
  const emojiRegex = /[\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F\u20E3]/u;
  const match = content.match(emojiRegex);
  assert.equal(match, null, 'Component file must not contain emoji');
});
