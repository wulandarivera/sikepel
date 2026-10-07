"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  Save,
  Eye,
  Edit3,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Bold,
  Underline,
  Italic,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Minus,
  Monitor,
  Download,
  FileText,
  ChevronDown,
  RotateCcw,
  Image as ImageIcon,
} from "lucide-react";
import type { EditorParagraph } from "@/server/template-editor";
import type { Field } from "@/lib/types";

interface TemplateEditorModalProps {
  templateId: string;
  onClose: () => void;
  onSaved: (newId: string) => void;
}

interface EditorData {
  paragraphs: EditorParagraph[];
  type: {
    id: string;
    name: string;
    slug: string;
    code: string;
    fields: Field[];
  };
  template: {
    id: string;
    version: number;
    file_name: string;
    active: boolean;
  };
  global_placeholders: string[];
  has_logo?: boolean;
  logo_url?: string;
}

export function TemplateEditorModal({
  templateId,
  onClose,
  onSaved,
}: TemplateEditorModalProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [data, setData] = useState<EditorData | null>(null);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [activateOnSave, setActivateOnSave] = useState(true);
  const [showLogo, setShowLogo] = useState(true);
  const [showRuler, setShowRuler] = useState(true);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [showVariableDropdown, setShowVariableDropdown] = useState(false);
  const [currentText, setCurrentText] = useState("");

  // Desktop LibreOffice states
  const [desktopLaunching, setDesktopLaunching] = useState(false);
  const [desktopOpened, setDesktopOpened] = useState(false);
  const [desktopAppName, setDesktopAppName] = useState("");
  const [syncingDesktop, setSyncingDesktop] = useState(false);

  const editorRef = useRef<HTMLDivElement | null>(null);
  const initializedRef = useRef(false);

  // Load editor data
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError("");
        const res = await fetch(`/api/templates/${templateId}/editor-content`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Gagal memuat template.");
        }
        const json: EditorData = await res.json();
        if (!cancelled) {
          setData(json);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || "Terjadi kesalahan saat memuat template.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  // Build initial HTML for contentEditable canvas
  const buildInitialHtml = useCallback((paragraphs: EditorParagraph[]): string => {
    return paragraphs
      .map((p) => {
        const isKopBorder = p.isKopBorder;
        const textAlign = p.align;
        const fontWeight = p.bold ? "bold" : "normal";
        const textDecoration = p.underline ? "underline" : "none";
        const fontSize =
          p.align === "center" && p.text.includes("PEMERINTAH") ? "16px" : "14px";
        const borderBottom = isKopBorder ? "3px double #000000" : "none";
        const paddingBottom = isKopBorder ? "8px" : "0px";
        const marginBottom = isKopBorder ? "14px" : "6px";

        return `<p class="doc-paragraph ${isKopBorder ? "kop-border-line" : ""}" data-kop-border="${isKopBorder}" style="text-align: ${textAlign}; font-weight: ${fontWeight}; text-decoration: ${textDecoration}; font-size: ${fontSize}; border-bottom: ${borderBottom}; padding-bottom: ${paddingBottom}; margin-bottom: ${marginBottom}; line-height: 1.5;">${p.text}</p>`;
      })
      .join("");
  }, []);

  // Initialize editor content once data is loaded
  useEffect(() => {
    if (data && editorRef.current && !initializedRef.current) {
      editorRef.current.innerHTML = buildInitialHtml(data.paragraphs);
      setCurrentText(editorRef.current.innerText || "");
      initializedRef.current = true;
    }
  }, [data, buildInitialHtml]);

  // Handle live content changes
  const handleEditorInput = () => {
    if (editorRef.current) {
      setCurrentText(editorRef.current.innerText || "");
    }
  };

  // Required placeholders logic
  const getRequiredPlaceholders = (): string[] => {
    if (!data) return [];
    const slug = data.type.slug;
    if (slug === "ktp" || slug === "pindah") {
      return ["nama", "nik", "no_kk"];
    }
    if (slug === "suami-istri") {
      return [
        "nama_kelurahan",
        "nomor_surat",
        "nama_suami",
        "nama_istri",
        "nama_penandatangan",
      ];
    }
    return [
      "nama_kelurahan",
      "nomor_surat",
      "nama",
      "nama_penandatangan",
    ];
  };

  const currentPlaceholders = Array.from(
    new Set([...currentText.matchAll(/\$\{([^}]+)\}/g)].map((m) => m[1]))
  );
  const requiredPlaceholders = getRequiredPlaceholders();
  const missingRequired = requiredPlaceholders.filter(
    (req) => !currentPlaceholders.includes(req)
  );

  // Available placeholders categorized
  const kelurahanPlaceholders = [
    { key: "nama_kelurahan", label: "Nama Kelurahan" },
    { key: "alamat_kelurahan", label: "Alamat Kelurahan" },
    { key: "telepon_kelurahan", label: "Telepon Kelurahan" },
    { key: "email_kelurahan", label: "Email Kelurahan" },
    { key: "nama_kecamatan", label: "Nama Kecamatan" },
    { key: "kabupaten_kota", label: "Kabupaten / Kota" },
    { key: "provinsi", label: "Provinsi" },
    { key: "kode_pos_kelurahan", label: "Kode Pos Kelurahan" },
  ];

  const residentPlaceholders = [
    { key: "nama", label: "Nama Pemohon" },
    { key: "nik", label: "NIK (16 Digit)" },
    { key: "no_kk", label: "Nomor KK" },
    { key: "tempat_lahir", label: "Tempat Lahir" },
    { key: "tanggal_lahir", label: "Tanggal Lahir" },
    { key: "jenis_kelamin", label: "Jenis Kelamin" },
    { key: "agama", label: "Agama" },
    { key: "status_perkawinan", label: "Status Perkawinan" },
    { key: "pekerjaan", label: "Pekerjaan" },
    { key: "alamat", label: "Alamat Tempat Tinggal" },
    { key: "rt", label: "Nomor RT" },
    { key: "rw", label: "Nomor RW" },
    { key: "umur", label: "Umur (Tahun)" },
  ];

  const letterInfoPlaceholders = [
    { key: "nomor_surat", label: "Nomor Surat Lengkap" },
    { key: "tanggal_surat", label: "Tanggal Surat Dikeluarkan" },
    { key: "kode_surat", label: "Kode Klasifikasi Surat" },
    { key: "bulan_romawi", label: "Bulan Romawi (I - XII)" },
    { key: "tahun", label: "Tahun Surat" },
    { key: "keterangan_pengantar_rt", label: "Keterangan Pengantar RT/RW" },
  ];

  const signatoryPlaceholders = [
    { key: "nama_penandatangan", label: "Nama Pejabat Penandatangan" },
    { key: "nip_penandatangan", label: "NIP Pejabat Penandatangan" },
    { key: "jabatan_penandatangan", label: "Jabatan Pejabat (Lurah/Camat)" },
  ];

  const specificFields = data?.type.fields || [];

  // Formatting commands via document.execCommand
  const applyFormat = (command: string, value?: string) => {
    if (editorRef.current) {
      editorRef.current.focus();
    }
    document.execCommand(command, false, value);
    handleEditorInput();
  };

  // Toggle kop border line on the currently selected paragraph
  const toggleKopBorderOnSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    let node: Node | null = sel.anchorNode;
    while (node && node !== editorRef.current) {
      if (node.nodeType === 1) {
        const el = node as HTMLElement;
        const currentBorder = el.getAttribute("data-kop-border") === "true";
        if (currentBorder) {
          el.setAttribute("data-kop-border", "false");
          el.classList.remove("kop-border-line");
          el.style.borderBottom = "none";
          el.style.paddingBottom = "0px";
          el.style.marginBottom = "6px";
        } else {
          el.setAttribute("data-kop-border", "true");
          el.classList.add("kop-border-line");
          el.style.borderBottom = "3px double #000000";
          el.style.paddingBottom = "8px";
          el.style.marginBottom = "14px";
        }
        handleEditorInput();
        return;
      }
      node = node.parentNode;
    }
  };

  // Insert variable at cursor position
  const insertVariable = (variableKey: string) => {
    const placeholder = "${" + variableKey + "}";
    if (editorRef.current) {
      editorRef.current.focus();
    }
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const textNode = document.createTextNode(placeholder);
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.setEndAfter(textNode);
      sel.removeAllRanges();
      sel.addRange(range);
    } else if (editorRef.current) {
      editorRef.current.innerHTML += `<p>${placeholder}</p>`;
    }
    handleEditorInput();
    setShowVariableDropdown(false);
    setActiveMenu(null);
  };

  // Extract paragraphs from contentEditable to EditorParagraph[]
  const extractEditorParagraphs = (): EditorParagraph[] => {
    if (!editorRef.current) return [];
    const container = editorRef.current;
    const result: EditorParagraph[] = [];

    // Collect all paragraph / block elements
    const elements = Array.from(
      container.querySelectorAll("p, h1, h2, h3, h4, div.doc-paragraph, blockquote")
    );

    if (elements.length > 0) {
      elements.forEach((elNode) => {
        const el = elNode as HTMLElement;
        const text = el.innerText?.trim() || "";
        if (!text) return;

        const style = window.getComputedStyle(el);
        let align: "left" | "center" | "right" | "justify" = "left";
        if (el.style.textAlign) {
          align = el.style.textAlign as any;
        } else if (style.textAlign === "center") align = "center";
        else if (style.textAlign === "right") align = "right";
        else if (style.textAlign === "justify") align = "justify";

        const isBold =
          el.style.fontWeight === "bold" ||
          style.fontWeight === "bold" ||
          parseInt(style.fontWeight, 10) >= 700 ||
          !!el.querySelector("b, strong");

        const isUnderline =
          el.style.textDecoration?.includes("underline") ||
          style.textDecorationLine?.includes("underline") ||
          !!el.querySelector("u");

        const isKopBorder =
          el.classList.contains("kop-border-line") ||
          el.getAttribute("data-kop-border") === "true";

        result.push({
          id: "p-" + Math.random().toString(36).slice(2, 9),
          text: text.replace(/\s+/g, " "),
          align,
          bold: isBold,
          underline: isUnderline,
          isKopBorder: Boolean(isKopBorder),
        });
      });
    } else {
      // Fallback split by lines
      const lines = (container.innerText || "")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      for (const l of lines) {
        result.push({
          id: "p-" + Math.random().toString(36).slice(2, 9),
          text: l,
          align:
            l.includes("PEMERINTAH") || l.includes("SURAT") || l.includes("Nomor")
              ? "center"
              : "justify",
          bold: l.includes("PEMERINTAH") || l.includes("SURAT"),
          underline: l.includes("SURAT"),
        });
      }
    }

    return result;
  };

  // Launch Desktop LibreOffice
  const handleLaunchDesktopLibreOffice = async () => {
    try {
      setDesktopLaunching(true);
      setError("");
      const res = await fetch(`/api/templates/${templateId}/open-libreoffice`, {
        method: "POST",
      });
      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || "Gagal membuka LibreOffice.");
      }
      setDesktopOpened(true);
      setDesktopAppName(resData.app || "LibreOffice");
      setSuccessMsg(
        `Template berhasil dibuka di ${resData.app}! Silakan edit dan simpan (Ctrl+S) di aplikasi tersebut, lalu klik tombol "Terapkan Hasil Editan" di atas.`
      );
    } catch (err: any) {
      setError(err.message || "Gagal membuka aplikasi desktop.");
    } finally {
      setDesktopLaunching(false);
      setActiveMenu(null);
    }
  };

  // Sync edits from Desktop LibreOffice
  const handleSyncDesktopLibreOffice = async () => {
    try {
      setSyncingDesktop(true);
      setError("");
      const res = await fetch(`/api/templates/${templateId}/save-libreoffice`, {
        method: "POST",
      });
      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || "Gagal menerapkan perubahan dari LibreOffice.");
      }
      setSuccessMsg("Perubahan dari LibreOffice berhasil disimpan dan diaktifkan!");
      setTimeout(() => {
        onSaved(resData.id);
        onClose();
      }, 800);
    } catch (err: any) {
      setError(err.message || "Gagal menerapkan perubahan.");
    } finally {
      setSyncingDesktop(false);
    }
  };

  // Save handler from Web Editor
  const handleSave = async () => {
    if (!data) return;
    const paragraphs = extractEditorParagraphs();

    if (paragraphs.length === 0) {
      setError("Dokumen tidak boleh kosong.");
      return;
    }

    if (missingRequired.length > 0 && activateOnSave) {
      setError(
        `Placeholder wajib belum ada di template: ${missingRequired.map((m) => "${" + m + "}").join(", ")}. Mohon tambahkan sebelum mengaktifkan.`
      );
      return;
    }

    try {
      setSaving(true);
      setError("");
      const res = await fetch(`/api/templates/${templateId}/save-content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paragraphs,
          activate: activateOnSave,
          show_logo: showLogo,
        }),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || "Gagal menyimpan template.");
      }

      onSaved(resData.id);
      onClose();
    } catch (err: any) {
      setError(err.message || "Gagal menyimpan template.");
    } finally {
      setSaving(false);
      setActiveMenu(null);
    }
  };

  // Sample simulation data for live preview
  const sampleData: Record<string, string> = {
    nama_kelurahan: "CIBODAS BARU",
    nama_kecamatan: "CIBODAS",
    kabupaten_kota: "KOTA TANGERANG",
    provinsi: "BANTEN",
    alamat_kelurahan: "Jl. Kavling Pemda Raya No. 1, Kota Tangerang",
    telepon_kelurahan: "(021) 55651234",
    email_kelurahan: "kelurahan.cibodasbaru@tangerangkota.go.id",
    kode_pos_kelurahan: "15138",
    nomor_surat: "B/045/400.8.2.7/CB-CB/IX/2026",
    kode_surat: "400.8.2.7",
    bulan_romawi: "IX",
    tahun: "2026",
    tanggal_surat: "21 September 2026",
    nama: "AHMAD MAULANA",
    nik: "3671011203850001",
    no_kk: "3671012304120005",
    tempat_lahir: "Tangerang",
    tanggal_lahir: "12 Maret 1985",
    jenis_kelamin: "Laki-laki",
    agama: "Islam",
    status_perkawinan: "Kawin",
    pekerjaan: "Karyawan Swasta",
    alamat: "Jl. Melati No. 12",
    rt: "003",
    rw: "001",
    umur: "41",
    keterangan_pengantar_rt:
      " serta berdasarkan Surat Keterangan Ketua RT.003 RW.001 Nomor: 015/RT.003/IX/2026 tanggal 18 September 2026",
    nama_penandatangan: "H. RUSDI, S.Sos",
    nip_penandatangan: "19780512 200212 1 003",
    jabatan_penandatangan: "Lurah Cibodas Baru",
    keperluan: "Melengkapi persyaratan administrasi pengajuan bantuan modal usaha",
    penghasilan_terbilang: "tiga juta lima ratus ribu rupiah",
    nama_suami: "AHMAD MAULANA",
    nama_istri: "SITI NURHALIZA",
  };

  const renderPreviewHtml = (): string => {
    let rawHtml = editorRef.current?.innerHTML || "";
    return rawHtml.replace(/\$\{([^}]+)\}/g, (match, key) => {
      return sampleData[key] !== undefined ? sampleData[key] : match;
    });
  };

  return (
    <div className="template-editor-backdrop">
      <div className="template-editor-window libreoffice-window">
        {/* LIBREOFFICE TITLEBAR */}
        <div className="libreoffice-titlebar">
          <div className="lo-titlebar-left">
            <div className="lo-app-icon" title="LibreOffice Writer">
              <FileText size={18} />
            </div>
            <span className="lo-doc-title">
              {data
                ? `${data.type.slug}-template-v${data.template.version}.docx`
                : "Memuat Dokumen..."}{" "}
              — LibreOffice Writer
            </span>
          </div>

          <div className="lo-titlebar-actions">
            {/* Quick Desktop Launch Button */}
            <button
              type="button"
              className="lo-desktop-launch-btn"
              onClick={handleLaunchDesktopLibreOffice}
              disabled={desktopLaunching || loading}
              title="Buka langsung file template ini di aplikasi LibreOffice / Word di PC Anda"
            >
              {desktopLaunching ? (
                <>
                  <Loader2 size={14} className="spin" /> Membuka...
                </>
              ) : (
                <>
                  <Monitor size={14} /> Buka di LibreOffice Desktop
                </>
              )}
            </button>

            {/* Save Button */}
            <button
              type="button"
              className="lo-titlebar-save-btn"
              onClick={handleSave}
              disabled={loading || saving}
              title="Simpan perubahan template ke server (Ctrl+S)"
            >
              {saving ? (
                <>
                  <Loader2 size={14} className="spin" /> Menyimpan...
                </>
              ) : (
                <>
                  <Save size={14} /> Simpan
                </>
              )}
            </button>

            {/* Close Button */}
            <button
              type="button"
              className="lo-titlebar-close-btn"
              onClick={onClose}
              title="Tutup Editor"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* LIBREOFFICE MENU BAR */}
        <div className="libreoffice-menubar">
          <div
            className="lo-menu-item"
            onClick={() => setActiveMenu(activeMenu === "file" ? null : "file")}
          >
            <span>Berkas</span>
            {activeMenu === "file" && (
              <div
                className="lo-menu-dropdown"
                onMouseLeave={() => setActiveMenu(null)}
              >
                <button type="button" onClick={handleSave}>
                  <Save size={14} /> Simpan Versi Baru
                </button>
                <button type="button" onClick={handleLaunchDesktopLibreOffice}>
                  <Monitor size={14} /> Buka di LibreOffice Desktop
                </button>
                <a href={`/api/templates/${templateId}/download`} download>
                  <Download size={14} /> Unduh File DOCX
                </a>
                <div className="lo-menu-divider" />
                <button type="button" onClick={onClose}>
                  <X size={14} /> Tutup Editor
                </button>
              </div>
            )}
          </div>

          <div
            className="lo-menu-item"
            onClick={() => setActiveMenu(activeMenu === "view" ? null : "view")}
          >
            <span>Tampilan</span>
            {activeMenu === "view" && (
              <div
                className="lo-menu-dropdown"
                onMouseLeave={() => setActiveMenu(null)}
              >
                <button
                  type="button"
                  onClick={() => {
                    setMode("edit");
                    setActiveMenu(null);
                  }}
                >
                  <Edit3 size={14} /> Mode Edit Dokumen
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("preview");
                    setActiveMenu(null);
                  }}
                >
                  <Eye size={14} /> Mode Pratinjau Cetak
                </button>
                <div className="lo-menu-divider" />
                <button
                  type="button"
                  onClick={() => {
                    setShowLogo(!showLogo);
                    setActiveMenu(null);
                  }}
                >
                  <ImageIcon size={14} />{" "}
                  {showLogo ? "Sembunyikan Logo Kop" : "Tampilkan Logo Kop"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowRuler(!showRuler);
                    setActiveMenu(null);
                  }}
                >
                  {showRuler ? "Sembunyikan Penggaris" : "Tampilkan Penggaris"}
                </button>
              </div>
            )}
          </div>

          <div
            className="lo-menu-item"
            onClick={() =>
              setActiveMenu(activeMenu === "insert" ? null : "insert")
            }
          >
            <span>Sisipkan</span>
            {activeMenu === "insert" && (
              <div
                className="lo-menu-dropdown"
                onMouseLeave={() => setActiveMenu(null)}
              >
                <div className="lo-menu-subhead">Variabel Warga</div>
                {residentPlaceholders.slice(0, 5).map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => insertVariable(v.key)}
                  >
                    <Sparkles size={12} /> {v.label} ({`\${${v.key}}`})
                  </button>
                ))}
                <div className="lo-menu-divider" />
                <div className="lo-menu-subhead">Variabel Surat</div>
                {letterInfoPlaceholders.slice(0, 4).map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => insertVariable(v.key)}
                  >
                    <Sparkles size={12} /> {v.label} ({`\${${v.key}}`})
                  </button>
                ))}
              </div>
            )}
          </div>

          <div
            className="lo-menu-item"
            onClick={() =>
              setActiveMenu(activeMenu === "format" ? null : "format")
            }
          >
            <span>Format</span>
            {activeMenu === "format" && (
              <div
                className="lo-menu-dropdown"
                onMouseLeave={() => setActiveMenu(null)}
              >
                <button type="button" onClick={() => applyFormat("bold")}>
                  <Bold size={14} /> Huruf Tebal (Bold)
                </button>
                <button type="button" onClick={() => applyFormat("italic")}>
                  <Italic size={14} /> Huruf Miring (Italic)
                </button>
                <button type="button" onClick={() => applyFormat("underline")}>
                  <Underline size={14} /> Garis Bawah (Underline)
                </button>
                <div className="lo-menu-divider" />
                <button
                  type="button"
                  onClick={() => applyFormat("justifyLeft")}
                >
                  <AlignLeft size={14} /> Rata Kiri
                </button>
                <button
                  type="button"
                  onClick={() => applyFormat("justifyCenter")}
                >
                  <AlignCenter size={14} /> Rata Tengah
                </button>
                <button
                  type="button"
                  onClick={() => applyFormat("justifyRight")}
                >
                  <AlignRight size={14} /> Rata Kanan
                </button>
                <button
                  type="button"
                  onClick={() => applyFormat("justifyFull")}
                >
                  <AlignJustify size={14} /> Rata Kiri & Kanan (Justify)
                </button>
              </div>
            )}
          </div>
        </div>

        {/* DESKTOP LIBREOFFICE OPENED BANNER */}
        {desktopOpened && (
          <div className="lo-desktop-sync-banner">
            <Monitor size={18} />
            <div className="sync-banner-text">
              <strong>Template dibuka di {desktopAppName}!</strong>
              <span>
                Silakan edit template di {desktopAppName}. Setelah selesai dan Anda
                menekan <b>Save (Ctrl+S)</b> di {desktopAppName}, klik tombol di
                samping untuk langsung memperbarui template di web:
              </span>
            </div>
            <button
              type="button"
              className="sync-banner-btn"
              onClick={handleSyncDesktopLibreOffice}
              disabled={syncingDesktop}
            >
              {syncingDesktop ? (
                <>
                  <Loader2 size={14} className="spin" /> Menerapkan...
                </>
              ) : (
                <>
                  <RotateCcw size={14} /> Terapkan Perubahan dari {desktopAppName}
                </>
              )}
            </button>
          </div>
        )}

        {/* LIBREOFFICE STANDARD & FORMATTING TOOLBAR */}
        <div className="libreoffice-toolbar">
          {/* File Operations */}
          <button
            type="button"
            className="lo-tool-btn"
            onClick={handleSave}
            title="Simpan Dokumen (Ctrl+S)"
          >
            <Save size={16} />
          </button>
          <a
            href={`/api/templates/${templateId}/download`}
            className="lo-tool-btn"
            title="Unduh File DOCX"
          >
            <Download size={16} />
          </a>

          <div className="lo-tool-separator" />

          {/* Mode Tabs */}
          <div className="lo-mode-toggle">
            <button
              type="button"
              className={`lo-mode-btn ${mode === "edit" ? "active" : ""}`}
              onClick={() => setMode("edit")}
              title="Mode Edit Dokumen WYSIWYG"
            >
              <Edit3 size={14} /> Dokumen
            </button>
            <button
              type="button"
              className={`lo-mode-btn ${mode === "preview" ? "active" : ""}`}
              onClick={() => setMode("preview")}
              title="Pratinjau Hasil Cetak Surat"
            >
              <Eye size={14} /> Pratinjau
            </button>
          </div>

          <div className="lo-tool-separator" />

          {/* Font controls */}
          <div className="lo-font-select" title="Font Standar Resmi">
            <span>Times New Roman</span>
          </div>

          <div className="lo-tool-separator" />

          {/* Formatting buttons */}
          <button
            type="button"
            className="lo-tool-btn"
            title="Tebal (Bold) - Ctrl+B"
            onClick={() => applyFormat("bold")}
          >
            <Bold size={16} />
          </button>
          <button
            type="button"
            className="lo-tool-btn"
            title="Miring (Italic) - Ctrl+I"
            onClick={() => applyFormat("italic")}
          >
            <Italic size={16} />
          </button>
          <button
            type="button"
            className="lo-tool-btn"
            title="Garis Bawah (Underline) - Ctrl+U"
            onClick={() => applyFormat("underline")}
          >
            <Underline size={16} />
          </button>

          <div className="lo-tool-separator" />

          {/* Alignments */}
          <button
            type="button"
            className="lo-tool-btn"
            title="Rata Kiri"
            onClick={() => applyFormat("justifyLeft")}
          >
            <AlignLeft size={16} />
          </button>
          <button
            type="button"
            className="lo-tool-btn"
            title="Rata Tengah"
            onClick={() => applyFormat("justifyCenter")}
          >
            <AlignCenter size={16} />
          </button>
          <button
            type="button"
            className="lo-tool-btn"
            title="Rata Kanan"
            onClick={() => applyFormat("justifyRight")}
          >
            <AlignRight size={16} />
          </button>
          <button
            type="button"
            className="lo-tool-btn"
            title="Rata Kiri & Kanan (Justify)"
            onClick={() => applyFormat("justifyFull")}
          >
            <AlignJustify size={16} />
          </button>

          <div className="lo-tool-separator" />

          {/* Kop & Logo Toggles */}
          <button
            type="button"
            className="lo-tool-btn"
            title="Pasang / Lepas Garis Ganda Kop Surat pada Paragraf Aktif"
            onClick={toggleKopBorderOnSelection}
          >
            <Minus size={16} /> Garis Kop
          </button>

          <button
            type="button"
            className={`lo-tool-btn ${showLogo ? "active" : ""}`}
            title="Tampilkan / Sembunyikan Lambang Daerah pada Kop Surat"
            onClick={() => setShowLogo(!showLogo)}
          >
            <ImageIcon size={15} /> Logo Kop: {showLogo ? "On" : "Off"}
          </button>

          <div className="lo-tool-separator" />

          {/* INSERT VARIABLE DROPDOWN */}
          <div className="relative">
            <button
              type="button"
              className="lo-insert-var-btn"
              onClick={() => setShowVariableDropdown((prev) => !prev)}
              title="Katalog Sisipkan Variabel / Placeholder Surat"
            >
              <Sparkles size={15} />
              <span>Sisipkan Variabel</span>
              <ChevronDown size={13} />
            </button>

            {showVariableDropdown && (
              <div
                className="variable-dropdown-menu"
                onMouseLeave={() => setShowVariableDropdown(false)}
              >
                <div className="variable-group-title">
                  Kelurahan & Kecamatan
                </div>
                {kelurahanPlaceholders.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    className="variable-item"
                    onClick={() => insertVariable(v.key)}
                  >
                    <span className="var-badge">{"${" + v.key + "}"}</span>
                    <span className="var-desc">{v.label}</span>
                  </button>
                ))}

                <div className="variable-group-title">
                  Data Warga / Pemohon
                </div>
                {residentPlaceholders.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    className="variable-item"
                    onClick={() => insertVariable(v.key)}
                  >
                    <span className="var-badge">{"${" + v.key + "}"}</span>
                    <span className="var-desc">{v.label}</span>
                  </button>
                ))}

                <div className="variable-group-title">
                  Surat & Tanggal
                </div>
                {letterInfoPlaceholders.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    className="variable-item"
                    onClick={() => insertVariable(v.key)}
                  >
                    <span className="var-badge">{"${" + v.key + "}"}</span>
                    <span className="var-desc">{v.label}</span>
                  </button>
                ))}

                <div className="variable-group-title">
                  Penandatangan
                </div>
                {signatoryPlaceholders.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    className="variable-item"
                    onClick={() => insertVariable(v.key)}
                  >
                    <span className="var-badge">{"${" + v.key + "}"}</span>
                    <span className="var-desc">{v.label}</span>
                  </button>
                ))}

                {specificFields.length > 0 && (
                  <>
                    <div className="variable-group-title">
                      Field Spesifik {data?.type.name}
                    </div>
                    {specificFields
                      .filter((f) => f.key !== "catatan")
                      .map((f) => (
                        <button
                          key={f.key}
                          type="button"
                          className="variable-item"
                          onClick={() => insertVariable(f.key)}
                        >
                          <span className="var-badge">{"${" + f.key + "}"}</span>
                          <span className="var-desc">{f.label}</span>
                        </button>
                      ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* HORIZONTAL RULER (PENGGARIS LIBREOFFICE) */}
        {showRuler && (
          <div className="libreoffice-ruler">
            <div className="ruler-indent-left" />
            <div className="ruler-ticks">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map(
                (num) => (
                  <div key={num} className="ruler-cm">
                    <span className="ruler-number">{num}</span>
                    <div className="ruler-subticks">
                      <span />
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                )
              )}
            </div>
            <div className="ruler-indent-right" />
          </div>
        )}

        {/* NOTIFICATION MESSAGES */}
        {error && (
          <div className="template-editor-error-banner">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="template-editor-success-banner">
            <CheckCircle2 size={16} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* DOCUMENT WORKSPACE CANVAS */}
        <div className="template-editor-body libreoffice-workspace">
          {loading ? (
            <div className="editor-loading-center">
              <Loader2 size={36} className="spin" style={{ color: "#18a058" }} />
              <p>Membuka dokumen di LibreOffice Web Engine...</p>
            </div>
          ) : (
            <>
              {/* SEAMLESS SINGLE-DOCUMENT WYSIWYG CANVAS */}
              <div
                className="a4-container"
                style={{ display: mode === "edit" ? "flex" : "none" }}
              >
                <div className="a4-sheet doc-paper">
                  {/* Official Lambang Daerah on Kop Surat */}
                  {showLogo && (
                    <img
                      src={data?.logo_url || "/assets/kop-logo.png"}
                      alt="Lambang Daerah Kota Tangerang"
                      className="kop-surat-logo-img"
                    />
                  )}

                  {/* SINGLE SEAMLESS CONTENTEDITABLE DOCUMENT SHEET */}
                  <div
                    ref={editorRef}
                    className="a4-content editable-doc-content"
                    contentEditable
                    suppressContentEditableWarning
                    onInput={handleEditorInput}
                    spellCheck={false}
                  />
                </div>
              </div>

              {/* PREVIEW MODE CANVAS */}
              {mode === "preview" && (
                <div className="a4-container">
                  <div className="a4-sheet preview-sheet">
                    {showLogo && (
                      <img
                        src={data?.logo_url || "/assets/kop-logo.png"}
                        alt="Lambang Daerah Kota Tangerang"
                        className="kop-surat-logo-img"
                      />
                    )}

                    <div
                      className="a4-content preview-doc-content"
                      dangerouslySetInnerHTML={{ __html: renderPreviewHtml() }}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* LIBREOFFICE STATUS BAR */}
        <div className="libreoffice-statusbar">
          <div className="lo-status-left">
            <span className="lo-status-item">Halaman 1 / 1</span>
            <span className="lo-status-item">{currentText.length} karakter</span>
            <span className="lo-status-item">Bahasa: Indonesia</span>
          </div>

          <div className="lo-status-center">
            <span className="validation-label">Variabel:</span>
            {requiredPlaceholders.map((req) => {
              const exists = currentPlaceholders.includes(req);
              return (
                <span
                  key={req}
                  className={`validation-chip ${exists ? "chip-valid" : "chip-missing"}`}
                  title={
                    exists
                      ? `Variabel ${"$"}{${req}} sudah tersedia`
                      : `Variabel ${"$"}{${req}} wajib ditambahkan!`
                  }
                >
                  {exists ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />}
                  {"${" + req + "}"}
                </span>
              );
            })}
          </div>

          <div className="lo-status-right">
            <label className="activate-checkbox-label">
              <input
                type="checkbox"
                checked={activateOnSave}
                onChange={(e) => setActivateOnSave(e.target.checked)}
              />
              <span>Langsung aktifkan untuk layanan</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
