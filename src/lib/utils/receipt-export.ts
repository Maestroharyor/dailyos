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

    // Convert to blob and download - properly await the blob creation
    return new Promise<boolean>((resolve) => {
      canvas.toBlob(
        (blob: Blob | null) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = filename;
            link.style.display = "none";
            document.body.appendChild(link);
            link.click();
            // Small delay before cleanup to ensure download starts
            setTimeout(() => {
              document.body.removeChild(link);
              URL.revokeObjectURL(url);
            }, 100);
            resolve(true);
          } else {
            console.error("Failed to create blob from canvas");
            resolve(false);
          }
        },
        "image/png",
        1.0
      );
    });
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
        logging: false,
      },
      jsPDF: { unit: "mm", format: "a5", orientation: "portrait" as const },
    };

    // html2pdf returns a promise chain - ensure we properly await it
    await html2pdf().set(opt).from(element).save();
    return true;
  } catch (error) {
    console.error("Failed to generate PDF:", error);
    return false;
  }
}
