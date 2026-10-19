import fs from "node:fs";
import path from "node:path";
import PizZip from "pizzip";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  AlignmentType,
  BorderStyle,
  HorizontalPositionRelativeFrom,
  VerticalPositionRelativeFrom,
  TextWrappingType,
  TextWrappingSide,
} from "docx";
import { randomUUID } from "node:crypto";
import type { Row } from "@/lib/types";

export interface EditorParagraph {
  id: string;
  text: string;
  align: "left" | "center" | "right" | "justify";
  bold?: boolean;
  underline?: boolean;
  isKopBorder?: boolean;
}

export function extractDocxLogo(buf: Buffer): Buffer | null {
  try {
    const zip = new PizZip(buf);
    const media = Object.keys(zip.files).filter((k) =>
      k.startsWith("word/media/"),
    );
    if (media.length > 0) {
      const primary = media.find((m) => m.includes("image1.")) || media[0];
      const file = zip.file(primary);
      if (file) return file.asNodeBuffer();
    }
  } catch {}
  return null;
}

export function getDefaultLogo(): Buffer | null {
  const candidates = [
    path.resolve("public/assets/kop-logo.png"),
    path.resolve("public/assets/logo.png"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(/* turbopackIgnore: true */ c)) {
      try {
        return fs.readFileSync(/* turbopackIgnore: true */ c);
      } catch {}
    }
  }
  return null;
}

export function parseDocxToEditorContent(buf: Buffer): EditorParagraph[] {
  const zip = new PizZip(buf);
  const xml = zip.file("word/document.xml")?.asText();
  if (!xml) return [];

  const pMatches = xml.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];
  const items: EditorParagraph[] = [];

  for (const pXml of pMatches) {
    let align: "left" | "center" | "right" | "justify" = "left";
    if (/<w:jc\s+w:val="center"/i.test(pXml)) align = "center";
    else if (/<w:jc\s+w:val="right"/i.test(pXml)) align = "right";
    else if (/<w:jc\s+w:val="both"/i.test(pXml)) align = "justify";

    const isBold = /<w:b(\/|\s+[^>]*\/>|\s+w:val="(1|true|on)")/i.test(pXml);
    const isUnderline = /<w:u(\/|\s+[^>]*\/>|\s+w:val="(single|1|true|on)")/i.test(pXml);
    const hasBottomBorder = /<w:bottom\b/i.test(pXml);

    const texts = [...pXml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map(
      (m) => m[1],
    );
    const fullText = texts.join("");
    if (fullText.trim()) {
      items.push({
        id: randomUUID(),
        text: fullText,
        align,
        bold: isBold,
        underline: isUnderline,
        isKopBorder: hasBottomBorder,
      });
    }
  }

  // If no border bottom was detected, check if we can mark the kop line (e.g. line containing alamat/telepon)
  const hasAnyKopBorder = items.some((it) => it.isKopBorder);
  if (!hasAnyKopBorder && items.length > 3) {
    for (let i = 0; i < Math.min(items.length, 5); i++) {
      if (
        items[i].text.includes("alamat_kelurahan") ||
        items[i].text.includes("telepon_kelurahan") ||
        items[i].text.includes("kode_pos_kelurahan")
      ) {
        items[i].isKopBorder = true;
        break;
      }
    }
  }

  return items;
}

export async function buildDocxFromEditorContent(
  paragraphs: EditorParagraph[],
  _letterType?: Row,
  options?: { logoBytes?: Buffer | null; showLogo?: boolean },
): Promise<Buffer> {
  const alignMap = {
    left: AlignmentType.LEFT,
    center: AlignmentType.CENTER,
    right: AlignmentType.RIGHT,
    justify: AlignmentType.JUSTIFIED,
  };

  const shouldEmbedLogo = options?.showLogo !== false;
  const logoData = shouldEmbedLogo
    ? options?.logoBytes || getDefaultLogo()
    : null;

  let logoInserted = false;

  const docParagraphs = paragraphs.map((item, index) => {
    const isCenter = item.align === "center";
    const isTitle = isCenter && item.bold && item.underline;
    const isKopHeader = isCenter && item.text.includes("PEMERINTAH");

    // Spacing configuration
    let before = 0;
    let after = 120;

    if (item.isKopBorder) {
      after = 200;
    } else if (isTitle) {
      before = 180;
      after = 80;
    } else if (item.text.startsWith("Nomor")) {
      after = 200;
    } else if (item.text.includes("tanggal_surat")) {
      before = 240;
      after = 60;
    } else if (item.text.includes("nama_penandatangan")) {
      before = 700;
      after = 40;
    }

    const children: (TextRun | ImageRun)[] = [];

    // Embed logo at first kop header (or first paragraph if no explicit kop header)
    if (logoData && !logoInserted && (isKopHeader || index === 0)) {
      children.push(
        new ImageRun({
          type: "png",
          data: logoData,
          transformation: { width: 75, height: 86 },
          floating: {
            horizontalPosition: {
              relative: HorizontalPositionRelativeFrom.MARGIN,
              offset: 0,
            },
            verticalPosition: {
              relative: VerticalPositionRelativeFrom.MARGIN,
              offset: 0,
            },
            wrap: {
              type: TextWrappingType.SQUARE,
              side: TextWrappingSide.BOTH_SIDES,
            },
          },
        }),
      );
      logoInserted = true;
    }

    children.push(
      new TextRun({
        text: item.text,
        font: "Times New Roman",
        size: isKopHeader ? 28 : 24,
        bold: item.bold,
        underline: item.underline ? {} : undefined,
      }),
    );

    return new Paragraph({
      alignment: alignMap[item.align] || AlignmentType.LEFT,
      spacing: { before, after },
      border: item.isKopBorder
        ? {
            bottom: {
              color: "000000",
              style: BorderStyle.DOUBLE,
              size: 8,
              space: 8,
            },
          }
        : undefined,
      children,
    });
  });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4
            margin: { top: 1134, right: 1417, bottom: 1134, left: 1417 }, // ~2cm top/bottom, 2.5cm left/right
          },
        },
        children: docParagraphs,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
