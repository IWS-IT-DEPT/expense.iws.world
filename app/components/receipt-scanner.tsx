"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { assembleReceiptPdf } from "@/lib/pdf-assemble";
import { warpQuadToRect, type Quad } from "@/lib/scan-warp";
import type { UploadPurpose } from "@/lib/upload-token";

/**
 * In-browser receipt scanner: live camera → capture → drag 4 corners →
 * perspective de-skew (see lib/scan-warp) → multi-page PDF → upload. Falls back
 * to a plain file picker when the camera isn't available; picked images run the
 * same crop/warp path, picked PDFs pass straight through.
 */

interface RawPage {
  id: string;
  /** captured frame at native resolution */
  canvas: HTMLCanvasElement;
  /** corners as fractions of width/height, order TL,TR,BR,BL */
  corners: Quad;
}
interface PassthroughPdf {
  id: string;
  blob: Blob;
}

type Stage = "camera" | "filepick" | "crop" | "processing" | "uploading" | "done" | "error";

const DEFAULT_CORNERS: Quad = [
  { x: 0.06, y: 0.06 },
  { x: 0.94, y: 0.06 },
  { x: 0.94, y: 0.94 },
  { x: 0.06, y: 0.94 },
];

export interface ReceiptScannerProps {
  endpoint: "/api/receipts" | "/api/receipt-upload";
  token?: string;
  purpose: UploadPurpose;
  targetId?: string;
  targetLabel?: string;
  maxPages?: number;
  onComplete?: (r: { receiptCount: number; pendingExpenseId?: string | null }) => void;
  onCancel?: () => void;
}

export function ReceiptScanner({
  endpoint,
  token,
  purpose,
  targetId,
  targetLabel,
  maxPages = 8,
  onComplete,
  onCancel,
}: ReceiptScannerProps) {
  const [stage, setStage] = useState<Stage>("camera");
  const [cameraSupported, setCameraSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState<RawPage[]>([]);
  const [pdfs, setPdfs] = useState<PassthroughPdf[]>([]);
  const [draft, setDraft] = useState<RawPage | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const dragging = useRef<number | null>(null);
  const cropBoxRef = useRef<HTMLDivElement>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Ref callback: fires when the <video> mounts (stage → camera) and again with
  // null when it unmounts. Keeps camera acquisition out of an effect.
  const attachVideo = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    if (!node) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      return;
    }
    const supported =
      typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function";
    if (!supported) {
      setCameraSupported(false);
      setStage("filepick");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })
      .then((stream) => {
        streamRef.current = stream;
        node.srcObject = stream;
        return node.play().catch(() => {});
      })
      .catch(() => {
        setCameraSupported(false);
        setStage("filepick");
      });
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    setDraft({ id: crypto.randomUUID(), canvas, corners: cloneCorners(DEFAULT_CORNERS) });
    stopCamera();
    setStage("crop");
  }

  async function onFiles(list: FileList | null) {
    if (!list?.length) return;
    setError(null);
    const nextPdfs: PassthroughPdf[] = [];
    let firstImage: RawPage | null = null;
    for (const file of Array.from(list)) {
      if (file.type === "application/pdf") {
        nextPdfs.push({ id: crypto.randomUUID(), blob: file });
        continue;
      }
      try {
        const bitmap = await createImageBitmap(file);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
        bitmap.close();
        const page: RawPage = {
          id: crypto.randomUUID(),
          canvas,
          corners: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 1, y: 1 },
            { x: 0, y: 1 },
          ],
        };
        if (!firstImage) firstImage = page;
        else setPages((p) => [...p, page]);
      } catch {
        // HEIC / unsupported by canvas — send the original bytes through as a PDF-less passthrough
        nextPdfs.push({ id: crypto.randomUUID(), blob: file });
      }
    }
    if (nextPdfs.length) setPdfs((p) => [...p, ...nextPdfs]);
    if (firstImage) {
      setDraft(firstImage);
      setStage("crop");
    } else {
      setStage("filepick"); // PDFs added — stay here, "Finish" is available
    }
  }

  function commitDraft() {
    if (!draft) return;
    setPages((p) => [...p, draft]);
    setDraft(null);
    setStage("camera");
  }

  function pointerHandlers(index: number) {
    return {
      onPointerDown: (e: React.PointerEvent) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        dragging.current = index;
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (dragging.current !== index || !cropBoxRef.current || !draft) return;
        const r = cropBoxRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
        const y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
        setDraft((d) => {
          if (!d) return d;
          const corners = cloneCorners(d.corners);
          corners[index] = { x, y };
          return { ...d, corners };
        });
      },
      onPointerUp: (e: React.PointerEvent) => {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
        dragging.current = null;
      },
    };
  }

  async function finish() {
    setStage("processing");
    setError(null);
    try {
      const imgParts: { blob: Blob; contentType: string }[] = [];
      for (const page of pages) {
        const { width, height } = page.canvas;
        const px: Quad = [
          { x: page.corners[0].x * width, y: page.corners[0].y * height },
          { x: page.corners[1].x * width, y: page.corners[1].y * height },
          { x: page.corners[2].x * width, y: page.corners[2].y * height },
          { x: page.corners[3].x * width, y: page.corners[3].y * height },
        ];
        const grid = (navigator.hardwareConcurrency ?? 8) <= 4 ? 8 : 16;
        const warped = warpQuadToRect(page.canvas, width, height, px, {
          maxLongEdge: 1600,
          grid,
          enhance: true,
        });
        const blob = await canvasToJpeg(warped, 0.7);
        imgParts.push({ blob, contentType: "image/jpeg" });
      }

      const allParts = [
        ...imgParts,
        ...pdfs.map((p) => ({ blob: p.blob, contentType: "application/pdf" })),
      ];
      if (allParts.length === 0) {
        setError("Nothing to upload — capture at least one page.");
        setStage("camera");
        return;
      }

      let file: File;
      if (allParts.length === 1 && allParts[0].contentType === "image/jpeg") {
        file = new File([allParts[0].blob], "receipt.jpg", { type: "image/jpeg" });
      } else {
        const pdf = await assembleReceiptPdf(allParts);
        file = new File([pdf], "receipt.pdf", { type: "application/pdf" });
      }

      setStage("uploading");
      const fd = new FormData();
      fd.set("purpose", purpose);
      if (targetId) fd.set("targetId", targetId);
      if (token) fd.set("token", token);
      fd.set("file", file);

      const res = await fetch(endpoint, { method: "POST", body: fd });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setError((json.error as string) ?? "Upload failed.");
        setStage("error");
        return;
      }
      setStage("done");
      onComplete?.({
        receiptCount: (json.receiptCount as number) ?? 1,
        pendingExpenseId: (json.pendingExpenseId as string | null) ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong while processing.");
      setStage("error");
    }
  }

  const pageCount = pages.length + pdfs.length;

  return (
    <div className="space-y-3">
      {targetLabel ? <p className="text-xs opacity-60">Receipt for {targetLabel}</p> : null}

      {stage === "camera" && (
        <div className="space-y-2">
          <div className="overflow-hidden rounded-lg bg-black">
            <video ref={attachVideo} playsInline muted className="max-h-[60vh] w-full object-contain" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={capture}
              disabled={pageCount >= maxPages}
              className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
            >
              {pageCount >= maxPages ? `Max ${maxPages} pages` : "Capture"}
            </button>
            <button
              type="button"
              onClick={() => {
                stopCamera();
                setStage("filepick");
              }}
              className="text-xs underline opacity-70 hover:opacity-100"
            >
              Choose a file instead
            </button>
            {pageCount > 0 && (
              <button
                type="button"
                onClick={finish}
                className="ml-auto rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
              >
                Finish ({pageCount})
              </button>
            )}
          </div>
        </div>
      )}

      {stage === "filepick" && (
        <div className="space-y-2">
          <input
            type="file"
            accept="image/*,application/pdf"
            multiple
            onChange={(e) => onFiles(e.target.files)}
            className="block w-full text-sm"
          />
          <div className="flex items-center gap-2">
            {cameraSupported && (
              <button
                type="button"
                onClick={() => setStage("camera")}
                className="text-xs underline opacity-70 hover:opacity-100"
              >
                Use the camera
              </button>
            )}
            {pageCount > 0 && (
              <button
                type="button"
                onClick={finish}
                className="ml-auto rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
              >
                Finish ({pageCount})
              </button>
            )}
          </div>
        </div>
      )}

      {stage === "crop" && draft && (
        <div className="space-y-2">
          <p className="text-xs opacity-60">Drag the corners to the edges of the receipt.</p>
          <div ref={cropBoxRef} className="relative inline-block max-w-full select-none">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={draft.canvas.toDataURL("image/jpeg", 0.8)}
              alt="captured page"
              className="max-h-[55vh] w-full object-contain"
              draggable={false}
            />
            <svg className="pointer-events-none absolute inset-0 h-full w-full">
              <polygon
                points={draft.corners.map((c) => `${c.x * 100}%,${c.y * 100}%`).join(" ")}
                className="fill-emerald-500/10 stroke-emerald-400"
                strokeWidth={2}
              />
            </svg>
            {draft.corners.map((c, i) => (
              <div
                key={i}
                {...pointerHandlers(i)}
                className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full border-2 border-emerald-400 bg-white/70"
                style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={commitDraft}
              className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
            >
              Use this page
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(null);
                setStage("camera");
              }}
              className="text-xs underline opacity-70 hover:opacity-100"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {(stage === "processing" || stage === "uploading") && (
        <p className="text-sm opacity-70">
          {stage === "processing" ? "Straightening pages…" : "Uploading…"}
        </p>
      )}

      {stage === "done" && <p className="text-sm text-emerald-600">Receipt uploaded.</p>}

      {stage === "error" && (
        <div className="space-y-2">
          <p className="text-sm text-red-600">{error}</p>
          <button
            type="button"
            onClick={() => setStage(pageCount ? "filepick" : "camera")}
            className="text-xs underline opacity-70 hover:opacity-100"
          >
            Try again
          </button>
        </div>
      )}

      {error && stage !== "error" ? <p className="text-sm text-red-600">{error}</p> : null}

      {onCancel && stage !== "done" ? (
        <button
          type="button"
          onClick={() => {
            stopCamera();
            onCancel();
          }}
          className="text-xs underline opacity-50 hover:opacity-100"
        >
          Cancel
        </button>
      ) : null}
    </div>
  );
}

function cloneCorners(q: Quad): Quad {
  return [ { ...q[0] }, { ...q[1] }, { ...q[2] }, { ...q[3] } ];
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("encode failed"))),
      "image/jpeg",
      quality,
    );
  });
}
