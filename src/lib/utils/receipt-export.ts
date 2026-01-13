"use client";

import { pdf } from "@react-pdf/renderer";
import { OrderReceiptPDF } from "@/components/commerce/order-receipt-pdf";
import type { Order, Customer } from "@/lib/stores/commerce-store";

/**
 * Utility functions for exporting receipts as PDF and images
 */

export interface ReceiptPDFData {
  order: Order;
  customer?: Customer | null;
  storeName?: string;
  storeAddress?: string;
  storePhone?: string;
  currency?: string;
}

/**
 * Download receipt as PDF using @react-pdf/renderer
 */
export async function downloadReceiptPDF(
  data: ReceiptPDFData,
  filename: string
): Promise<boolean> {
  try {
    const doc = OrderReceiptPDF(data);
    const blob = await pdf(doc).toBlob();

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

    return true;
  } catch (error) {
    console.error("Failed to generate PDF:", error);
    return false;
  }
}

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
      windowWidth: element.scrollWidth,
      windowHeight: element.scrollHeight,
      width: element.scrollWidth,
      height: element.scrollHeight,
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
