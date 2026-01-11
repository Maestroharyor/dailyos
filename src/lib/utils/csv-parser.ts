/**
 * Simple CSV parser that handles:
 * - Quoted fields (with commas inside)
 * - Headers from first row
 * - BOM characters
 * - Empty rows
 */

export interface ParsedCSV {
  headers: string[];
  rows: Record<string, string>[];
  rawRows: string[][];
}

export function parseCSV(content: string): ParsedCSV {
  // Remove BOM if present
  const cleanContent = content.replace(/^\uFEFF/, "");

  // Split into lines, handling both \r\n and \n
  const lines = cleanContent.split(/\r?\n/).filter((line) => line.trim() !== "");

  if (lines.length === 0) {
    return { headers: [], rows: [], rawRows: [] };
  }

  // Parse each line
  const rawRows = lines.map(parseLine);

  // First row is headers
  const headers = rawRows[0].map((h) => h.trim());

  // Rest are data rows
  const dataRows = rawRows.slice(1);

  // Convert to objects
  const rows = dataRows.map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((header, index) => {
      obj[header] = row[index]?.trim() || "";
    });
    return obj;
  });

  return { headers, rows, rawRows: dataRows };
}

function parseLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else if (char === '"') {
        // End of quoted field
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        // Start of quoted field
        inQuotes = true;
      } else if (char === ",") {
        // Field separator
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }
  }

  // Add last field
  result.push(current);

  return result;
}

/**
 * Auto-detect field mappings based on common column names
 */
export function autoDetectMappings(headers: string[]): Record<string, string> {
  const mappings: Record<string, string> = {};

  const fieldPatterns: Record<string, RegExp[]> = {
    name: [/^name$/i, /^product.?name$/i, /^title$/i, /^product$/i],
    sku: [/^sku$/i, /^product.?code$/i, /^code$/i, /^item.?number$/i, /^item.?code$/i],
    price: [/^price$/i, /^selling.?price$/i, /^retail.?price$/i, /^unit.?price$/i],
    costPrice: [/^cost$/i, /^cost.?price$/i, /^purchase.?price$/i, /^buy.?price$/i],
    description: [/^description$/i, /^desc$/i, /^details$/i, /^product.?description$/i],
    status: [/^status$/i, /^state$/i],
    isPublished: [/^published$/i, /^is.?published$/i, /^active$/i, /^visible$/i],
    categoryId: [/^category$/i, /^category.?id$/i, /^cat$/i],
    tags: [/^tags$/i, /^keywords$/i, /^labels$/i],
    initialStock: [/^stock$/i, /^quantity$/i, /^qty$/i, /^initial.?stock$/i, /^inventory$/i],
  };

  headers.forEach((header) => {
    const normalizedHeader = header.trim();
    for (const [field, patterns] of Object.entries(fieldPatterns)) {
      if (patterns.some((pattern) => pattern.test(normalizedHeader))) {
        if (!Object.values(mappings).includes(field)) {
          mappings[normalizedHeader] = field;
        }
        break;
      }
    }
  });

  return mappings;
}

/**
 * Product field definitions for the mapping UI
 */
export const productFields = [
  { key: "name", label: "Product Name", required: true },
  { key: "sku", label: "SKU", required: true },
  { key: "price", label: "Price", required: true },
  { key: "costPrice", label: "Cost Price", required: true },
  { key: "description", label: "Description", required: false },
  { key: "status", label: "Status", required: false },
  { key: "isPublished", label: "Published", required: false },
  { key: "categoryId", label: "Category", required: false },
  { key: "tags", label: "Tags", required: false },
  { key: "initialStock", label: "Initial Stock", required: false },
] as const;

export type ProductFieldKey = (typeof productFields)[number]["key"];

/**
 * Validate a single row and return errors
 */
export function validateRow(
  row: Record<string, string>,
  mappings: Record<string, string>,
  existingSkus: Set<string>,
  seenSkus: Set<string>
): string[] {
  const errors: string[] = [];

  // Get mapped values
  const getValue = (field: string): string => {
    const column = Object.entries(mappings).find(([, f]) => f === field)?.[0];
    return column ? row[column]?.trim() || "" : "";
  };

  // Required fields
  const name = getValue("name");
  const sku = getValue("sku");
  const price = getValue("price");
  const costPrice = getValue("costPrice");

  if (!name) errors.push("Missing product name");
  if (!sku) errors.push("Missing SKU");
  if (!price) errors.push("Missing price");
  if (!costPrice) errors.push("Missing cost price");

  // Validate price
  if (price) {
    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum < 0) {
      errors.push("Invalid price");
    }
  }

  // Validate cost price
  if (costPrice) {
    const costNum = parseFloat(costPrice);
    if (isNaN(costNum) || costNum < 0) {
      errors.push("Invalid cost price");
    }
  }

  // Validate status
  const status = getValue("status");
  if (status && !["draft", "active", "archived"].includes(status.toLowerCase())) {
    errors.push("Invalid status (must be draft, active, or archived)");
  }

  // Validate initial stock
  const initialStock = getValue("initialStock");
  if (initialStock) {
    const stockNum = parseFloat(initialStock);
    if (isNaN(stockNum) || stockNum < 0) {
      errors.push("Invalid initial stock");
    }
  }

  // Check SKU uniqueness
  if (sku) {
    const upperSku = sku.toUpperCase();
    if (existingSkus.has(upperSku)) {
      errors.push("SKU already exists in store");
    }
    if (seenSkus.has(upperSku)) {
      errors.push("Duplicate SKU in file");
    }
  }

  return errors;
}

/**
 * Parse boolean value from various string representations
 */
export function parseBoolean(value: string): boolean {
  const normalized = value.toLowerCase().trim();
  return ["true", "yes", "1", "on", "active"].includes(normalized);
}

/**
 * Parse tags from comma-separated string
 */
export function parseTags(value: string): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag !== "");
}
