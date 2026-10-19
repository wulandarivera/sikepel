import fs from "node:fs";

function testHtmlConversion() {
  // Sample HTML that contentEditable would produce
  const html = `
    <div class="kop-section" style="text-align: center;">
      <p style="text-align: center; font-weight: bold;">PEMERINTAH KOTA TANGERANG</p>
      <p style="text-align: center; font-weight: bold;">KECAMATAN CIBODAS</p>
      <p style="text-align: center; font-weight: bold;">KELURAHAN \${nama_kelurahan}</p>
      <p style="text-align: center;" class="kop-border">\${alamat_kelurahan}</p>
    </div>
    <p style="text-align: center; font-weight: bold; text-decoration: underline;">SURAT KETERANGAN USAHA</p>
    <p style="text-align: center;">Nomor : \${nomor_surat}</p>
    <p style="text-align: justify;">Yang bertanda tangan dibawah ini Lurah \${nama_kelurahan} menerangkan bahwa :</p>
    <p style="text-align: justify;">Nama : <b>\${nama}</b></p>
    <p style="text-align: justify;">NIK : \${nik}</p>
    <p style="text-align: justify;">Demikian surat keterangan ini dibuat untuk dipergunakan sebagaimana mestinya.</p>
    <p style="text-align: right;">Tangerang, \${tanggal_surat}</p>
    <p style="text-align: right;">\${jabatan_penandatangan}</p>
    <p style="text-align: right; font-weight: bold; text-decoration: underline;">\${nama_penandatangan}</p>
    <p style="text-align: right; font-weight: bold;">NIP. \${nip_penandatangan}</p>
  `;
  console.log("Sample HTML ready.");
}

testHtmlConversion();
