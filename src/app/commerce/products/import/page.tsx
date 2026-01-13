"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  Card,
  CardBody,
  CardHeader,
  Button,
  Select,
  SelectItem,
  Chip,
  Progress,
  Divider,
} from "@heroui/react";
import {
  Upload,
  FileSpreadsheet,
  ArrowLeft,
  ArrowRight,
  Check,
  AlertTriangle,
  CheckCircle,
  Package,
  Trash2,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  parseCSV,
  autoDetectMappings,
  productFields,
  validateRow,
  parseBoolean,
  parseTags,
} from "@/lib/utils/csv-parser";
import { useCurrentSpace } from "@/lib/stores/space-store";
import { createProduct, type CreateProductInput } from "@/lib/actions/commerce/products";
import { queryKeys } from "@/lib/queries/keys";

type WizardStep = "upload" | "mapping" | "preview" | "import";
type ProductStatus = "draft" | "active" | "archived";

interface ValidationResult {
  row: Record<string, string>;
  errors: string[];
  isValid: boolean;
}

// Fetch SKUs from API
async function fetchExistingSkus(spaceId: string): Promise<Set<string>> {
  const response = await fetch(`/api/commerce/products/skus?spaceId=${spaceId}`);
  if (!response.ok) throw new Error("Failed to fetch SKUs");
  const json = await response.json();
  return new Set(json.data.skus as string[]);
}

export default function ImportProductsPage() {
  const currentSpace = useCurrentSpace();
  const spaceId = currentSpace?.id || "";
  const queryClient = useQueryClient();

  // Fetch existing SKUs for validation
  const { data: existingSkus = new Set<string>(), isLoading: isLoadingSkus } = useQuery({
    queryKey: queryKeys.commerce.products.skus(spaceId),
    queryFn: () => fetchExistingSkus(spaceId),
    enabled: !!spaceId,
  });

  // Wizard state
  const [step, setStep] = useState<WizardStep>("upload");

  // Upload state
  const [file, setFile] = useState<File | null>(null);
  const [_csvContent, setCsvContent] = useState<string>("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);

  // Mapping state
  const [mappings, setMappings] = useState<Record<string, string>>({});

  // Import state
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState<{
    imported: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  // Validate all rows
  const validationResults = useMemo((): ValidationResult[] => {
    if (rows.length === 0) return [];

    const seenSkus = new Set<string>();
    return rows.map((row) => {
      const errors = validateRow(row, mappings, existingSkus, seenSkus);

      // Track seen SKUs
      const skuColumn = Object.entries(mappings).find(([, f]) => f === "sku")?.[0];
      if (skuColumn && row[skuColumn]) {
        seenSkus.add(row[skuColumn].toUpperCase());
      }

      return { row, errors, isValid: errors.length === 0 };
    });
  }, [rows, mappings, existingSkus]);

  const validCount = validationResults.filter((r) => r.isValid).length;
  const invalidCount = validationResults.filter((r) => !r.isValid).length;

  // Check if required fields are mapped
  const requiredFieldsMapped = useMemo(() => {
    const mappedFields = new Set(Object.values(mappings));
    return productFields
      .filter((f) => f.required)
      .every((f) => mappedFields.has(f.key));
  }, [mappings]);

  // Handle file upload
  const processFile = useCallback((selectedFile: File) => {
    setFile(selectedFile);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setCsvContent(content);

      const parsed = parseCSV(content);
      setHeaders(parsed.headers);
      setRows(parsed.rows);

      // Auto-detect mappings
      const detectedMappings = autoDetectMappings(parsed.headers);
      setMappings(detectedMappings);
    };
    reader.readAsText(selectedFile);
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      processFile(selectedFile);
    }
  }, [processFile]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.name.endsWith(".csv")) {
      processFile(droppedFile);
    }
  }, [processFile]);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  // Update mapping for a column
  const updateMapping = (column: string, field: string) => {
    setMappings((prev) => {
      const newMappings = { ...prev };

      // Remove any existing mapping to this field
      Object.keys(newMappings).forEach((key) => {
        if (newMappings[key] === field) {
          delete newMappings[key];
        }
      });

      // Set new mapping (or remove if "skip")
      if (field && field !== "skip") {
        newMappings[column] = field;
      } else {
        delete newMappings[column];
      }

      return newMappings;
    });
  };

  // Get mapped value from a row
  const getMappedValue = (row: Record<string, string>, field: string): string => {
    const column = Object.entries(mappings).find(([, f]) => f === field)?.[0];
    return column ? row[column]?.trim() || "" : "";
  };

  // Import products
  const handleImport = async () => {
    if (!spaceId) return;

    setIsImporting(true);
    setImportProgress(0);

    const results = {
      imported: 0,
      skipped: 0,
      errors: [] as string[],
    };

    const validRows = validationResults.filter((r) => r.isValid);

    for (let i = 0; i < validRows.length; i++) {
      const { row } = validRows[i];

      try {
        // Extract values
        const name = getMappedValue(row, "name");
        const sku = getMappedValue(row, "sku").toUpperCase();
        const price = parseFloat(getMappedValue(row, "price")) || 0;
        const costPrice = parseFloat(getMappedValue(row, "costPrice")) || 0;
        const description = getMappedValue(row, "description") || undefined;
        const statusValue = getMappedValue(row, "status").toLowerCase();
        const status: ProductStatus = ["draft", "active", "archived"].includes(statusValue)
          ? (statusValue as ProductStatus)
          : "draft";
        const isPublished = parseBoolean(getMappedValue(row, "isPublished"));
        const categoryId = getMappedValue(row, "categoryId") || undefined;
        const tags = parseTags(getMappedValue(row, "tags"));
        const initialStock = parseInt(getMappedValue(row, "initialStock")) || 0;

        // Create product using server action
        const input: CreateProductInput = {
          name,
          sku,
          price,
          costPrice,
          description,
          status,
          isPublished,
          categoryId: categoryId || null,
          tags,
          images: [],
          variants: [],
          initialStock: initialStock > 0 ? initialStock : undefined,
        };

        const result = await createProduct(spaceId, input);

        if (result.error) {
          throw new Error(result.error);
        }

        results.imported++;
      } catch (error) {
        results.skipped++;
        results.errors.push(`Row ${i + 1}: ${error instanceof Error ? error.message : "Unknown error"}`);
      }

      setImportProgress(((i + 1) / validRows.length) * 100);
    }

    // Invalidate products query to refetch
    queryClient.invalidateQueries({ queryKey: queryKeys.commerce.products.all });

    setImportResults(results);
    setIsImporting(false);
  };

  // Reset wizard
  const resetWizard = () => {
    setStep("upload");
    setFile(null);
    setCsvContent("");
    setHeaders([]);
    setRows([]);
    setMappings({});
    setImportProgress(0);
    setImportResults(null);
  };

  // Render step indicator
  const renderStepIndicator = () => {
    const steps: { key: WizardStep; label: string }[] = [
      { key: "upload", label: "Upload" },
      { key: "mapping", label: "Map Fields" },
      { key: "preview", label: "Preview" },
      { key: "import", label: "Import" },
    ];

    const currentIndex = steps.findIndex((s) => s.key === step);

    return (
      <div className="flex items-center justify-center gap-2 mb-6">
        {steps.map((s, index) => (
          <div key={s.key} className="flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                index < currentIndex
                  ? "bg-emerald-500 text-white"
                  : index === currentIndex
                  ? "bg-orange-500 text-white"
                  : "bg-gray-200 dark:bg-gray-700 text-gray-500"
              }`}
            >
              {index < currentIndex ? <Check size={16} /> : index + 1}
            </div>
            <span
              className={`ml-2 text-sm ${
                index <= currentIndex ? "text-gray-900 dark:text-white" : "text-gray-400"
              }`}
            >
              {s.label}
            </span>
            {index < steps.length - 1 && (
              <div
                className={`w-12 h-0.5 mx-3 ${
                  index < currentIndex ? "bg-emerald-500" : "bg-gray-200 dark:bg-gray-700"
                }`}
              />
            )}
          </div>
        ))}
      </div>
    );
  };

  // Render upload step
  const renderUploadStep = () => (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Upload size={20} />
          <h2 className="text-lg font-semibold">Upload CSV File</h2>
        </div>
      </CardHeader>
      <CardBody>
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
            file
              ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
              : "border-gray-300 dark:border-gray-600 hover:border-orange-500"
          }`}
        >
          {file ? (
            <div className="space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <FileSpreadsheet size={32} className="text-emerald-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">{file.name}</p>
                <p className="text-sm text-gray-500">
                  {(file.size / 1024).toFixed(1)} KB • {rows.length} rows detected
                </p>
              </div>
              <Button
                size="sm"
                variant="flat"
                color="danger"
                startContent={<Trash2 size={16} />}
                onPress={resetWizard}
              >
                Remove File
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                <Upload size={32} className="text-gray-400" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">
                  Drag and drop your CSV file here
                </p>
                <p className="text-sm text-gray-500">or click to browse</p>
              </div>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
                id="csv-upload"
              />
              <Button
                as="label"
                htmlFor="csv-upload"
                color="primary"
                variant="flat"
                className="cursor-pointer"
              >
                Select File
              </Button>
            </div>
          )}
        </div>

        <div className="mt-6 p-4 rounded-lg bg-gray-50 dark:bg-gray-800">
          <p className="text-sm font-medium mb-2">CSV Format Requirements:</p>
          <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
            <li>• First row must contain column headers</li>
            <li>• Required: Product Name, SKU, Price, Cost Price</li>
            <li>• Optional: Description, Status, Published, Category, Tags, Initial Stock</li>
            <li>• Tags should be comma-separated within the cell</li>
          </ul>
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
            <a
              href="/samples/products-sample.csv"
              download="products-sample.csv"
              className="text-sm text-orange-600 hover:text-orange-700 font-medium"
            >
              Download sample CSV template
            </a>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <Link href="/commerce/products">
            <Button variant="light">Cancel</Button>
          </Link>
          <Button
            color="primary"
            endContent={<ArrowRight size={18} />}
            isDisabled={!file || rows.length === 0}
            onPress={() => setStep("mapping")}
          >
            Next: Map Fields
          </Button>
        </div>
      </CardBody>
    </Card>
  );

  // Render mapping step
  const renderMappingStep = () => (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <FileSpreadsheet size={20} />
          <h2 className="text-lg font-semibold">Map CSV Columns to Product Fields</h2>
        </div>
      </CardHeader>
      <CardBody>
        <p className="text-sm text-gray-500 mb-6">
          Match each CSV column to the corresponding product field. Required fields are marked with *.
        </p>

        <div className="space-y-4">
          {headers.map((header) => (
            <div key={header} className="flex items-center gap-4">
              <div className="w-1/3">
                <p className="font-medium text-sm">{header}</p>
                <p className="text-xs text-gray-500 truncate">
                  Sample: {rows[0]?.[header] || "(empty)"}
                </p>
              </div>
              <ArrowRight size={16} className="text-gray-400 flex-shrink-0" />
              <Select
                size="sm"
                className="w-1/2"
                selectedKeys={mappings[header] ? [mappings[header]] : ["skip"]}
                onChange={(e) => updateMapping(header, e.target.value)}
                aria-label={`Map ${header} to field`}
                items={[
                  { key: "skip", label: "Skip this column", required: false },
                  ...productFields,
                ]}
              >
                {(item) => (
                  <SelectItem key={item.key}>
                    {item.label}
                    {item.required ? " *" : ""}
                  </SelectItem>
                )}
              </Select>
              {mappings[header] && (
                <Chip size="sm" color="success" variant="flat">
                  <Check size={12} />
                </Chip>
              )}
            </div>
          ))}
        </div>

        {!requiredFieldsMapped && (
          <div className="mt-6 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-start gap-3">
            <AlertTriangle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-800 dark:text-amber-200">
                Required fields not mapped
              </p>
              <p className="text-sm text-amber-600 dark:text-amber-300">
                Please map all required fields: Product Name, SKU, Price, Cost Price
              </p>
            </div>
          </div>
        )}

        <Divider className="my-6" />

        <div className="flex justify-between">
          <Button
            variant="light"
            startContent={<ArrowLeft size={18} />}
            onPress={() => setStep("upload")}
          >
            Back
          </Button>
          <Button
            color="primary"
            endContent={<ArrowRight size={18} />}
            isDisabled={!requiredFieldsMapped || isLoadingSkus}
            isLoading={isLoadingSkus}
            onPress={() => setStep("preview")}
          >
            {isLoadingSkus ? "Loading..." : "Next: Preview"}
          </Button>
        </div>
      </CardBody>
    </Card>
  );

  // Render preview step
  const renderPreviewStep = () => (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <Package size={20} />
            <h2 className="text-lg font-semibold">Preview Import</h2>
          </div>
          <div className="flex items-center gap-3">
            <Chip color="success" variant="flat">
              {validCount} Valid
            </Chip>
            {invalidCount > 0 && (
              <Chip color="danger" variant="flat">
                {invalidCount} With Errors
              </Chip>
            )}
          </div>
        </div>
      </CardHeader>
      <CardBody className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-12">
                  #
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  SKU
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Price
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Cost
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Stock
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {validationResults.slice(0, 20).map((result, index) => (
                <tr
                  key={index}
                  className={
                    result.isValid
                      ? "hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      : "bg-red-50 dark:bg-red-900/20"
                  }
                >
                  <td className="px-4 py-3 text-sm text-gray-500">{index + 1}</td>
                  <td className="px-4 py-3 text-sm font-medium">
                    {getMappedValue(result.row, "name") || "-"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {getMappedValue(result.row, "sku") || "-"}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    ${getMappedValue(result.row, "price") || "0"}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    ${getMappedValue(result.row, "costPrice") || "0"}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {getMappedValue(result.row, "initialStock") || "0"}
                  </td>
                  <td className="px-4 py-3">
                    {result.isValid ? (
                      <Chip size="sm" color="success" variant="flat" startContent={<CheckCircle size={12} />}>
                        Valid
                      </Chip>
                    ) : (
                      <div className="space-y-1">
                        {result.errors.map((error, errIndex) => (
                          <Chip key={errIndex} size="sm" color="danger" variant="flat">
                            {error}
                          </Chip>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {validationResults.length > 20 && (
          <div className="p-4 text-center text-sm text-gray-500 border-t border-gray-200 dark:border-gray-700">
            Showing first 20 of {validationResults.length} rows
          </div>
        )}

        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-center">
            <Button
              variant="light"
              startContent={<ArrowLeft size={18} />}
              onPress={() => setStep("mapping")}
            >
              Back
            </Button>
            <div className="flex items-center gap-3">
              {invalidCount > 0 && (
                <p className="text-sm text-amber-600">
                  {invalidCount} row(s) with errors will be skipped
                </p>
              )}
              <Button
                color="primary"
                endContent={<ArrowRight size={18} />}
                isDisabled={validCount === 0}
                onPress={() => setStep("import")}
              >
                Continue to Import
              </Button>
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  );

  // Render import step
  const renderImportStep = () => (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Package size={20} />
          <h2 className="text-lg font-semibold">
            {importResults ? "Import Complete" : "Import Products"}
          </h2>
        </div>
      </CardHeader>
      <CardBody>
        {!importResults && !isImporting && (
          <div className="text-center py-8">
            <div className="w-20 h-20 mx-auto rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center mb-4">
              <Package size={40} className="text-orange-600" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Ready to Import</h3>
            <p className="text-gray-500 mb-6">
              {validCount} product{validCount !== 1 ? "s" : ""} will be imported
            </p>
            <div className="flex justify-center gap-3">
              <Button
                variant="light"
                startContent={<ArrowLeft size={18} />}
                onPress={() => setStep("preview")}
              >
                Back
              </Button>
              <Button color="primary" onPress={handleImport}>
                Import {validCount} Product{validCount !== 1 ? "s" : ""}
              </Button>
            </div>
          </div>
        )}

        {isImporting && (
          <div className="text-center py-8">
            <h3 className="text-xl font-semibold mb-4">Importing Products...</h3>
            <Progress
              value={importProgress}
              className="max-w-md mx-auto mb-4"
              color="primary"
              showValueLabel
            />
            <p className="text-gray-500">Please wait while we import your products</p>
          </div>
        )}

        {importResults && (
          <div className="text-center py-8">
            <div className="w-20 h-20 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-4">
              <CheckCircle size={40} className="text-emerald-600" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Import Complete!</h3>
            <div className="flex justify-center gap-4 mb-6">
              <Chip size="lg" color="success" variant="flat">
                {importResults.imported} Imported
              </Chip>
              {importResults.skipped > 0 && (
                <Chip size="lg" color="danger" variant="flat">
                  {importResults.skipped} Skipped
                </Chip>
              )}
            </div>

            {importResults.errors.length > 0 && (
              <div className="max-w-md mx-auto mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-left">
                <p className="font-medium text-red-800 dark:text-red-200 mb-2">Errors:</p>
                <ul className="text-sm text-red-600 dark:text-red-300 space-y-1">
                  {importResults.errors.slice(0, 5).map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                  {importResults.errors.length > 5 && (
                    <li>...and {importResults.errors.length - 5} more</li>
                  )}
                </ul>
              </div>
            )}

            <div className="flex justify-center gap-3">
              <Button variant="light" onPress={resetWizard}>
                Import More
              </Button>
              <Link href="/commerce/products">
                <Button color="primary">View Products</Button>
              </Link>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/commerce/products">
          <Button isIconOnly variant="light">
            <ArrowLeft size={20} />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Import Products
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Bulk import products from a CSV file
          </p>
        </div>
      </div>

      {/* Step Indicator */}
      {renderStepIndicator()}

      {/* Step Content */}
      {step === "upload" && renderUploadStep()}
      {step === "mapping" && renderMappingStep()}
      {step === "preview" && renderPreviewStep()}
      {step === "import" && renderImportStep()}
    </div>
  );
}
