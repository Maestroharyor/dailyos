"use client";

/**
 * Utility functions for exporting receipts as PDF and images
 */

export async function downloadReceiptAsImage(
  element: HTMLElement,
  filename: string
): Promise<boolean> {
  try {
    const html2canvasModule = await import("html2canvas");
    const html2canvas = html2canvasModule.default;

    const canvas = await html2canvas(element, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
      logging: false,
      allowTaint: true,
    });

    // Convert to blob and download
    canvas.toBlob((blob: Blob | null) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    }, "image/png");

    return true;
  } catch (error) {
    console.error("Failed to generate image:", error);
    return false;
  }
}

export async function downloadReceiptAsPDF(
  element: HTMLElement,
  filename: string
): Promise<boolean> {
  try {
    const html2pdfModule = await import("html2pdf.js");
    const html2pdf = html2pdfModule.default;

    const opt = {
      margin: 10,
      filename: filename,
      image: { type: "jpeg" as const, quality: 0.98 },
      html2canvas: {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        allowTaint: true,
      },
      jsPDF: { unit: "mm", format: "a5", orientation: "portrait" as const },
    };

    await html2pdf().set(opt).from(element).save();
    return true;
  } catch (error) {
    console.error("Failed to generate PDF:", error);
    return false;
  }
}
