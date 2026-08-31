import { PDFDocument } from "pdf-lib";

/**
 * Client-side: fold a mix of image blobs and PDF blobs into a single PDF.
 * Used by the receipt scanner so a multi-page capture uploads as one file.
 */
export async function assembleReceiptPdf(
  pages: { blob: Blob; contentType: string }[],
): Promise<Blob> {
  const doc = await PDFDocument.create();

  for (const page of pages) {
    const bytes = new Uint8Array(await page.blob.arrayBuffer());
    if (page.contentType === "application/pdf") {
      const src = await PDFDocument.load(bytes);
      const copied = await doc.copyPages(src, src.getPageIndices());
      for (const p of copied) doc.addPage(p);
    } else {
      const embedded = page.contentType.includes("png")
        ? await doc.embedPng(bytes)
        : await doc.embedJpg(bytes);
      const p = doc.addPage([embedded.width, embedded.height]);
      p.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
    }
  }

  const out = await doc.save();
  return new Blob([out as BlobPart], { type: "application/pdf" });
}
