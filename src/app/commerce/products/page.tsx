"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Card,
  CardBody,
  Button,
  Input,
  Chip,
  Select,
  SelectItem,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Pagination,
} from "@heroui/react";
import {
  Plus,
  Search,
  Grid3X3,
  List,
  MoreVertical,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  Package,
  Upload,
} from "lucide-react";
import {
  useProducts,
  useProductCategories,
  useCommerceActions,
  useInventoryItems,
  useInventoryMovements,
} from "@/lib/stores";
import { formatCurrency } from "@/lib/utils";
import type { Product, ProductStatus } from "@/lib/stores/commerce-store";

const statusColors: Record<ProductStatus, "default" | "primary" | "success" | "warning"> = {
  draft: "default",
  active: "success",
  archived: "warning",
};

export default function ProductsPage() {
  const products = useProducts();
  const categories = useProductCategories();
  const inventoryItems = useInventoryItems();
  const inventoryMovements = useInventoryMovements();
  const { deleteProduct, updateProduct } = useCommerceActions();

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  // Calculate stock for a product
  const getProductTotalStock = (productId: string) => {
    const items = inventoryItems.filter((i) => i.productId === productId);
    return items.reduce((total, item) => {
      const stock = inventoryMovements
        .filter((m) => m.inventoryItemId === item.id)
        .reduce((sum, m) => sum + m.quantity, 0);
      return total + stock;
    }, 0);
  };

  // Filter products
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch =
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.sku.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory =
        categoryFilter === "all" || product.categoryId === categoryFilter;
      const matchesStatus =
        statusFilter === "all" || product.status === statusFilter;
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [products, searchQuery, categoryFilter, statusFilter]);

  // Pagination
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const paginatedProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredProducts.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredProducts, currentPage, itemsPerPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentPage(1);
  }, [searchQuery, categoryFilter, statusFilter]);

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this product?")) {
      deleteProduct(id);
    }
  };

  const togglePublished = (product: Product) => {
    updateProduct(product.id, { isPublished: !product.isPublished });
  };

  const getCategoryName = (categoryId?: string) => {
    if (!categoryId) return "Uncategorized";
    return categories.find((c) => c.id === categoryId)?.name || "Unknown";
  };

  return (
    <div className="max-w-6xl mx-auto p-4 pb-24 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Products
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Manage your product catalog
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/commerce/products/import">
            <Button variant="flat" startContent={<Upload size={18} />}>
              Import CSV
            </Button>
          </Link>
          <Link href="/commerce/products/new">
            <Button color="primary" startContent={<Plus size={18} />}>
              Add Product
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardBody className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <Input
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              startContent={<Search size={18} className="text-gray-400" />}
              className="flex-1"
            />
            <Select
              placeholder="Category"
              selectedKeys={[categoryFilter]}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full md:w-48"
            >
              {[
                { id: "all", name: "All Categories" },
                ...categories,
              ].map((cat) => (
                <SelectItem key={cat.id}>{cat.name}</SelectItem>
              ))}
            </Select>
            <Select
              placeholder="Status"
              selectedKeys={[statusFilter]}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full md:w-40"
            >
              <SelectItem key="all">All Status</SelectItem>
              <SelectItem key="active">Active</SelectItem>
              <SelectItem key="draft">Draft</SelectItem>
              <SelectItem key="archived">Archived</SelectItem>
            </Select>
            <div className="flex gap-1">
              <Button
                isIconOnly
                variant={viewMode === "grid" ? "solid" : "light"}
                onPress={() => setViewMode("grid")}
              >
                <Grid3X3 size={18} />
              </Button>
              <Button
                isIconOnly
                variant={viewMode === "list" ? "solid" : "light"}
                onPress={() => setViewMode("list")}
              >
                <List size={18} />
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Products */}
      {filteredProducts.length === 0 ? (
        <Card>
          <CardBody className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
              <Package size={32} className="text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No products found
            </h3>
            <p className="text-gray-500 mb-4">
              {searchQuery || categoryFilter !== "all" || statusFilter !== "all"
                ? "Try adjusting your filters"
                : "Get started by adding your first product"}
            </p>
            {!searchQuery && categoryFilter === "all" && statusFilter === "all" && (
              <Link href="/commerce/products/new">
                <Button color="primary" startContent={<Plus size={18} />}>
                  Add Product
                </Button>
              </Link>
            )}
          </CardBody>
        </Card>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {paginatedProducts.map((product) => {
            const stock = getProductTotalStock(product.id);
            const primaryImage = product.images.find((i) => i.isPrimary) || product.images[0];

            return (
              <Card
                key={product.id}
                className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => window.location.href = `/commerce/products/${product.id}`}
              >
                <div className="relative aspect-square bg-gray-100 dark:bg-gray-800">
                  {primaryImage ? (
                    <Image
                      src={primaryImage.url}
                      alt={primaryImage.alt || product.name}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package size={48} className="text-gray-300" />
                    </div>
                  )}
                  <div className="absolute top-2 right-2 z-10" onClick={(e) => e.stopPropagation()}>
                    <Dropdown>
                      <DropdownTrigger>
                        <Button isIconOnly size="sm" variant="flat" className="bg-white/80 dark:bg-gray-800/80">
                          <MoreVertical size={16} />
                        </Button>
                      </DropdownTrigger>
                      <DropdownMenu>
                        <DropdownItem
                          key="edit"
                          startContent={<Edit size={16} />}
                          href={`/commerce/products/${product.id}`}
                        >
                          Edit
                        </DropdownItem>
                        <DropdownItem
                          key="toggle"
                          startContent={product.isPublished ? <EyeOff size={16} /> : <Eye size={16} />}
                          onPress={() => togglePublished(product)}
                        >
                          {product.isPublished ? "Unpublish" : "Publish"}
                        </DropdownItem>
                        <DropdownItem
                          key="delete"
                          startContent={<Trash2 size={16} />}
                          className="text-danger"
                          color="danger"
                          onPress={() => handleDelete(product.id)}
                        >
                          Delete
                        </DropdownItem>
                      </DropdownMenu>
                    </Dropdown>
                  </div>
                  {product.isPublished && (
                    <div className="absolute top-2 left-2">
                      <Chip size="sm" color="success" variant="flat">
                        Published
                      </Chip>
                    </div>
                  )}
                </div>
                <CardBody className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <h3 className="font-semibold text-sm line-clamp-1">{product.name}</h3>
                      <p className="text-xs text-gray-500">{product.sku}</p>
                    </div>
                    <Chip size="sm" color={statusColors[product.status]} variant="flat" className="capitalize">
                      {product.status}
                    </Chip>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-orange-600">{formatCurrency(product.price)}</p>
                    <Chip
                      size="sm"
                      color={stock <= 0 ? "danger" : stock <= 10 ? "warning" : "success"}
                      variant="flat"
                    >
                      {stock <= 0 ? "Out of stock" : `${stock} in stock`}
                    </Chip>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {getCategoryName(product.categoryId)}
                  </p>
                </CardBody>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Product
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      SKU
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Category
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Price
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Stock
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Status
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {paginatedProducts.map((product) => {
                    const stock = getProductTotalStock(product.id);
                    const primaryImage = product.images.find((i) => i.isPrimary) || product.images[0];

                    return (
                      <tr
                        key={product.id}
                        className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
                        onClick={() => window.location.href = `/commerce/products/${product.id}`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 overflow-hidden flex-shrink-0">
                              {primaryImage ? (
                                <Image
                                  src={primaryImage.url}
                                  alt={product.name}
                                  width={40}
                                  height={40}
                                  className="object-cover w-full h-full"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Package size={20} className="text-gray-300" />
                                </div>
                              )}
                            </div>
                            <div>
                              <p className="font-medium text-sm">{product.name}</p>
                              {product.isPublished && (
                                <span className="text-xs text-emerald-600">Published</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">{product.sku}</td>
                        <td className="px-4 py-3 text-sm">{getCategoryName(product.categoryId)}</td>
                        <td className="px-4 py-3 text-sm font-medium">{formatCurrency(product.price)}</td>
                        <td className="px-4 py-3">
                          <Chip
                            size="sm"
                            color={stock <= 0 ? "danger" : stock <= 10 ? "warning" : "success"}
                            variant="flat"
                          >
                            {stock}
                          </Chip>
                        </td>
                        <td className="px-4 py-3">
                          <Chip size="sm" color={statusColors[product.status]} variant="flat" className="capitalize">
                            {product.status}
                          </Chip>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Dropdown>
                            <DropdownTrigger>
                              <Button isIconOnly size="sm" variant="light">
                                <MoreVertical size={16} />
                              </Button>
                            </DropdownTrigger>
                            <DropdownMenu>
                              <DropdownItem
                                key="edit"
                                startContent={<Edit size={16} />}
                                href={`/commerce/products/${product.id}`}
                              >
                                Edit
                              </DropdownItem>
                              <DropdownItem
                                key="toggle"
                                startContent={product.isPublished ? <EyeOff size={16} /> : <Eye size={16} />}
                                onPress={() => togglePublished(product)}
                              >
                                {product.isPublished ? "Unpublish" : "Publish"}
                              </DropdownItem>
                              <DropdownItem
                                key="delete"
                                startContent={<Trash2 size={16} />}
                                className="text-danger"
                                color="danger"
                                onPress={() => handleDelete(product.id)}
                              >
                                Delete
                              </DropdownItem>
                            </DropdownMenu>
                          </Dropdown>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center">
          <Pagination
            total={totalPages}
            page={currentPage}
            onChange={setCurrentPage}
            showControls
            color="primary"
          />
        </div>
      )}

      {/* Results count */}
      {filteredProducts.length > 0 && (
        <p className="text-center text-sm text-gray-500">
          Showing {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, filteredProducts.length)} of {filteredProducts.length} products
        </p>
      )}
    </div>
  );
}
