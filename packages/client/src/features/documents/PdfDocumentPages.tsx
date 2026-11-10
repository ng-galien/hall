import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy,
  RenderingCancelledException,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { useI18n } from "../../i18n/I18nProvider";
import { usePhoneLayout } from "../../shell/usePhoneLayout";
import { DocumentPreviewFailure } from "./DocumentPreviewFailure";
import { usePdfTouchZoom } from "./usePdfTouchZoom";
import "./PdfDocumentPages.css";

GlobalWorkerOptions.workerSrc = workerUrl;

const assetBase = `${import.meta.env.BASE_URL}pdfjs/`;
const maximumDensity = 3;
const maximumCanvasPixels = 16_777_216;
const pageMargin = "200% 0px";
const defaultPageRatio = Math.SQRT2;
const positionDisplayMilliseconds = 1600;

function scrollingAncestor(element: HTMLElement): HTMLElement | null {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (/auto|scroll/.test(getComputedStyle(parent).overflowY)) return parent;
  }
  return null;
}

function PdfPage({
  document: pdf,
  number,
  total,
  width,
  ratio,
  onRatio,
  onFailed,
}: {
  document: PDFDocumentProxy;
  number: number;
  total: number;
  width: number;
  ratio: number;
  onRatio(ratio: number): void;
  onFailed(): void;
}) {
  const { t } = useI18n();
  const frame = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setNear(Boolean(entry?.isIntersecting)), {
      root: scrollingAncestor(element),
      rootMargin: pageMargin,
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = frame.current;
    if (!element || !near || width <= 0) {
      element?.replaceChildren();
      return;
    }
    let active = true;
    let cancelRender: (() => void) | null = null;
    void (async () => {
      try {
        const page = await pdf.getPage(number);
        if (!active) return;
        const unscaled = page.getViewport({ scale: 1 });
        onRatio(unscaled.height / unscaled.width);
        const density = Math.min(window.devicePixelRatio || 1, maximumDensity);
        const scale = Math.min(
          (width * density) / unscaled.width,
          Math.sqrt(maximumCanvasPixels / (unscaled.width * unscaled.height)),
        );
        const viewport = page.getViewport({ scale });
        const canvas = window.document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const task = page.render({ canvas, viewport });
        cancelRender = () => task.cancel();
        await task.promise;
        if (active) element.replaceChildren(canvas);
      } catch (error) {
        if (active && !(error instanceof RenderingCancelledException)) onFailed();
      }
    })();
    return () => {
      active = false;
      cancelRender?.();
    };
  }, [near, number, onFailed, onRatio, pdf, width]);

  return (
    <div
      ref={frame}
      className="pdf-document-page"
      role="img"
      aria-label={t("documents.pdfPage", { page: String(number), total: String(total) })}
      style={{ aspectRatio: `1 / ${ratio}` }}
    />
  );
}

/** Renders every page of a PDF one under the other, for browsers without a built-in PDF viewer. */
// @implements-requirement HALL-FR-DOC-480
export function PdfDocumentPages({ url, title, testId }: { url: string; title: string; testId?: string }) {
  const { t } = useI18n();
  const phone = usePhoneLayout();
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [sheet, setSheet] = useState<HTMLDivElement | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [failed, setFailed] = useState(false);
  const [width, setWidth] = useState(0);
  const [ratios, setRatios] = useState<Record<number, number>>({});
  const [position, setPosition] = useState<{ page: number; visible: boolean }>({ page: 1, visible: false });
  const zoom = usePdfTouchZoom(phone, root, sheet);
  const request = useMemo(() => ({ url, attempt }), [url, attempt]);

  useEffect(() => {
    let active = true;
    let task: ReturnType<typeof getDocument> | null = null;
    setPdf(null);
    setFailed(false);
    setRatios({});
    void (async () => {
      try {
        const response = await fetch(request.url);
        if (!response.ok) throw new Error("PDF unavailable");
        const data = new Uint8Array(await response.arrayBuffer());
        if (!active) return;
        task = getDocument({
          data,
          wasmUrl: `${assetBase}wasm/`,
          standardFontDataUrl: `${assetBase}standard_fonts/`,
        });
        const document = await task.promise;
        if (active) setPdf(document);
      } catch {
        if (active) setFailed(true);
      }
    })();
    return () => {
      active = false;
      void task?.destroy();
    };
  }, [request]);

  useEffect(() => {
    if (!root) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry?.contentRect.width ?? 0)));
    observer.observe(root);
    return () => observer.disconnect();
  }, [root]);

  useEffect(() => {
    if (!phone || !root || !sheet || !pdf) return;
    let frame = 0;
    let hide = 0;
    const measure = () => {
      frame = 0;
      const bounds = root.getBoundingClientRect();
      const middle = bounds.top + bounds.height / 2;
      const pages = Array.from(sheet.children);
      const reached = pages.findLastIndex((page) => page.getBoundingClientRect().top <= middle);
      setPosition({ page: Math.max(reached, 0) + 1, visible: true });
      window.clearTimeout(hide);
      hide = window.setTimeout(
        () => setPosition((current) => ({ ...current, visible: false })),
        positionDisplayMilliseconds,
      );
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    measure();
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      root.removeEventListener("scroll", onScroll);
      window.cancelAnimationFrame(frame);
      window.clearTimeout(hide);
    };
  }, [phone, root, sheet, pdf]);

  const firstRatio = ratios[1] ?? defaultPageRatio;
  const onFailed = useMemo(() => () => setFailed(true), []);
  const pages = useMemo(
    () =>
      Array.from({ length: pdf?.numPages ?? 0 }, (_page, index) => ({
        number: index + 1,
        onRatio: (ratio: number) =>
          setRatios((current) => (current[index + 1] === ratio ? current : { ...current, [index + 1]: ratio })),
      })),
    [pdf],
  );

  const content = failed ? (
    <DocumentPreviewFailure onRetry={() => setAttempt((value) => value + 1)} />
  ) : pdf ? (
    pages.map(({ number, onRatio }) => (
      <PdfPage
        key={number}
        document={pdf}
        number={number}
        total={pdf.numPages}
        width={phone ? width * zoom : width}
        ratio={ratios[number] ?? firstRatio}
        onRatio={onRatio}
        onFailed={onFailed}
      />
    ))
  ) : (
    <LoadingIndicator>{t("common.loading")}</LoadingIndicator>
  );

  if (!phone) {
    return (
      <section ref={setRoot} className="pdf-document" data-testid={testId} aria-label={title}>
        {content}
      </section>
    );
  }
  return (
    <div className="pdf-reader">
      <section ref={setRoot} className="pdf-document" data-testid={testId} aria-label={title} data-zoom={zoom}>
        <div
          ref={setSheet}
          className="pdf-document-sheet"
          style={{ width: `${zoom * 100}%`, "--pdf-zoom": zoom } as CSSProperties}
        >
          {content}
        </div>
      </section>
      {pdf && !failed && position.visible ? (
        <output className="pdf-reader-position" data-testid="pdf-page-position">
          {t("documents.pdfPosition", { page: String(position.page), total: String(pdf.numPages) })}
        </output>
      ) : null}
    </div>
  );
}
