"use client";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Download,
  LoaderCircle,
} from "lucide-react";
import { Button } from "./ui/button";
import { Alert } from "./common";
export type PDFHandle = { print: () => Promise<void> };
export const PDFViewer = forwardRef<PDFHandle, { src: string; title: string }>(
  function PDFViewer({ src, title }, ref) {
    const [pdf, setPDF] = useState<PDFDocumentProxy | null>(null),
      [page, setPage] = useState(1),
      [zoom, setZoom] = useState(1),
      [width, setWidth] = useState(600),
      [loading, setLoading] = useState(true),
      [error, setError] = useState(""),
      [printing, setPrinting] = useState(false);
    const holder = useRef<HTMLDivElement>(null),
      canvas = useRef<HTMLCanvasElement>(null),
      printFrame = useRef<HTMLIFrameElement | null>(null);
    useEffect(() => {
      let alive = true;
      let task: any;
      setLoading(true);
      setError("");
      setPDF(null);
      setPage(1);
      (async () => {
        try {
          const lib = await import("pdfjs-dist");
          if (!alive) return;
          lib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
          task = lib.getDocument({ url: src, withCredentials: true });
          const doc = await task.promise;
          if (alive) setPDF(doc);
        } catch {
          if (alive) {
            setError(
              "PDF belum dapat ditampilkan. Unduh dokumen atau muat ulang halaman.",
            );
            setLoading(false);
          }
        }
      })();
      return () => {
        alive = false;
        task?.destroy();
      };
    }, [src]);
    useEffect(() => {
      if (!holder.current) return;
      const observer = new ResizeObserver((entries) =>
        setWidth(Math.max(200, entries[0].contentRect.width - 36)),
      );
      observer.observe(holder.current);
      return () => observer.disconnect();
    }, []);
    useEffect(() => {
      if (!pdf || !canvas.current) return;
      let alive = true;
      let task: RenderTask | undefined;
      setLoading(true);
      (async () => {
        try {
          const current = await pdf.getPage(page);
          if (!alive || !canvas.current) return;
          const base = current.getViewport({ scale: 1 }),
            scale = Math.min(width / base.width, 1.5) * zoom,
            viewport = current.getViewport({ scale }),
            ratio = Math.min(window.devicePixelRatio || 1, 2);
          const c = canvas.current;
          c.width = Math.floor(viewport.width * ratio);
          c.height = Math.floor(viewport.height * ratio);
          c.style.width = viewport.width + "px";
          c.style.height = viewport.height + "px";
          task = current.render({
            canvas: c,
            viewport,
            transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
          });
          await task.promise;
          if (alive) setLoading(false);
        } catch (e) {
          if (alive && (e as Error).name !== "RenderingCancelledException") {
            setError("Halaman PDF tidak dapat dirender. Gunakan tombol unduh.");
            setLoading(false);
          }
        }
      })();
      return () => {
        alive = false;
        task?.cancel();
      };
    }, [pdf, page, width, zoom]);
    useImperativeHandle(
      ref,
      () => ({
        async print() {
          if (!pdf || printing) return;
          setPrinting(true);
          try {
            printFrame.current?.remove();
            const frame = document.createElement("iframe");
            frame.style.cssText =
              "position:fixed;width:0;height:0;right:0;bottom:0;border:0";
            frame.title = "Dokumen untuk dicetak";
            document.body.appendChild(frame);
            printFrame.current = frame;
            const doc = frame.contentDocument!;
            doc.open();
            doc.write(
              "<!DOCTYPE html><html><head><title>Cetak Surat</title><style>@page{margin:0}body{margin:0}img{display:block;object-fit:contain;break-after:page}img:last-child{break-after:auto}</style></head><body></body></html>",
            );
            doc.close();
            for (let i = 1; i <= pdf.numPages; i++) {
              const p = await pdf.getPage(i),
                c = document.createElement("canvas"),
                viewport = p.getViewport({ scale: 2 });
              c.width = Math.ceil(viewport.width);
              c.height = Math.ceil(viewport.height);
              await p.render({ canvas: c, viewport }).promise;
              const image = doc.createElement("img");
              const paper = p.getViewport({ scale: 1 });
              const style = doc.createElement("style");
              style.textContent = `@page sheet${i}{size:${paper.width}pt ${paper.height}pt;margin:0}`;
              doc.head.appendChild(style);
              image.style.cssText = `page:sheet${i};width:${paper.width}pt;height:${paper.height}pt`;
              image.src = c.toDataURL("image/png");
              image.alt = `Halaman ${i}`;
              doc.body.appendChild(image);
              await image.decode();
            }
            frame.contentWindow?.focus();
            frame.contentWindow?.print();
          } catch {
            setError(
              "Dokumen belum dapat dicetak. Unduh PDF untuk mencetak melalui pembaca PDF.",
            );
          } finally {
            setPrinting(false);
          }
        },
      }),
      [pdf, printing],
    );
    useEffect(
      () => () => {
        printFrame.current?.remove();
      },
      [],
    );
    return (
      <div className="pdf-viewer">
        <div className="pdf-controls">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Halaman PDF sebelumnya"
            disabled={!pdf || page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft size={16} />
          </Button>
          <span>
            {page} / {pdf?.numPages || "…"}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Halaman PDF berikutnya"
            disabled={!pdf || page >= pdf.numPages}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight size={16} />
          </Button>
          <span className="spacer" />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Perkecil PDF"
            disabled={zoom <= 0.6}
            onClick={() => setZoom((z) => z - 0.2)}
          >
            <ZoomOut size={16} />
          </Button>
          <span>{Math.round(zoom * 100)}%</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Perbesar PDF"
            disabled={zoom >= 1.8}
            onClick={() => setZoom((z) => z + 0.2)}
          >
            <ZoomIn size={16} />
          </Button>
          <Button asChild variant="ghost" size="icon">
            <a
              href={src + (src.includes("?") ? "&" : "?") + "download=1"}
              aria-label="Unduh dokumen PDF"
            >
              <Download size={16} />
            </a>
          </Button>
        </div>
        {error && <Alert kind="error">{error}</Alert>}
        {printing && <Alert>Menyiapkan seluruh halaman untuk dicetak…</Alert>}
        <div className="pdf-pages" ref={holder}>
          {loading && (
            <div className="pdf-loading" role="status">
              <LoaderCircle size={20} className="spin" />
              Memuat dokumen…
            </div>
          )}
          <canvas
            ref={canvas}
            role="img"
            aria-label={`${title}, halaman ${page}`}
            style={{ visibility: loading ? "hidden" : "visible" }}
          />
        </div>
      </div>
    );
  },
);
