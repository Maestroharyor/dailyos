import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

// ============================================
// TYPES
// ============================================

export type ProductStatus = "draft" | "active" | "archived";
export type OrderSource = "walk-in" | "storefront" | "manual";
export type PaymentMethod = "cash" | "card" | "transfer" | "pos" | "other";
export type OrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "completed"
  | "cancelled"
  | "refunded";
export type MovementType =
  | "stock_in"
  | "stock_out"
  | "adjustment"
  | "return"
  | "sale"
  | "refund";

export interface ProductImage {
  id: string;
  url: string;
  alt?: string;
  isPrimary: boolean;
}

export interface ProductVariant {
  id: string;
  sku: string;
  name: string;
  price: number;
  costPrice: number;
  attributes: Record<string, string>;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  description?: string;
  price: number;
  costPrice: number;
  status: ProductStatus;
  isPublished: boolean;
  categoryId?: string;
  tags: string[];
  images: ProductImage[];
  variants: ProductVariant[];
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  parentId?: string;
}

export interface InventoryItem {
  id: string;
  productId: string;
  variantId?: string;
  location: string;
}

export interface InventoryMovement {
  id: string;
  inventoryItemId: string;
  type: MovementType;
  quantity: number;
  reference?: string;
  referenceType?: "order" | "purchase" | "adjustment" | "refund";
  notes?: string;
  costAtTime?: number;
  createdAt: string;
}

export interface Customer {
  id: string;
  email?: string;
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
  createdAt: string;
}

export interface OrderItem {
  id: string;
  productId: string;
  variantId?: string;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  total: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerId?: string;
  source: OrderSource;
  paymentMethod?: PaymentMethod;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  totalCost: number;
  profit: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommerceSettings {
  currency: string;
  taxRate: number;
  lowStockThreshold: number;
  storeName: string;
  storeAddress: string;
  storePhone: string;
  paymentMethods: { id: string; name: string; isActive: boolean }[];
}

// ============================================
// STATE & ACTIONS INTERFACES
// ============================================

interface CommerceState {
  products: Product[];
  categories: Category[];
  inventoryItems: InventoryItem[];
  inventoryMovements: InventoryMovement[];
  orders: Order[];
  customers: Customer[];
  settings: CommerceSettings;
}

interface CommerceActions {
  // Product actions
  addProduct: (product: Omit<Product, "id" | "createdAt" | "updatedAt">) => string;
  updateProduct: (id: string, product: Partial<Product>) => void;
  deleteProduct: (id: string) => void;

  // Category actions
  addCategory: (category: Omit<Category, "id">) => void;
  updateCategory: (id: string, category: Partial<Category>) => void;
  deleteCategory: (id: string) => void;

  // Inventory actions
  createMovement: (
    movement: Omit<InventoryMovement, "id" | "createdAt">
  ) => void;
  adjustStock: (
    productId: string,
    variantId: string | undefined,
    quantity: number,
    notes?: string
  ) => void;

  // Order actions
  createOrder: (
    order: Omit<Order, "id" | "orderNumber" | "createdAt" | "updatedAt">
  ) => string;
  updateOrderStatus: (id: string, status: OrderStatus) => void;
  processRefund: (orderId: string, itemIds: string[]) => void;

  // Customer actions
  addCustomer: (customer: Omit<Customer, "id" | "createdAt">) => string;
  updateCustomer: (id: string, customer: Partial<Customer>) => void;
  deleteCustomer: (id: string) => void;

  // Settings
  updateSettings: (settings: Partial<CommerceSettings>) => void;
}

interface CommerceStore extends CommerceState {
  actions: CommerceActions;
}

// ============================================
// MOCK DATA
// ============================================

const mockCategories: Category[] = [
  { id: "cat-1", name: "Electronics", slug: "electronics", description: "Electronic devices and accessories" },
  { id: "cat-2", name: "Clothing", slug: "clothing", description: "Apparel and fashion items" },
  { id: "cat-3", name: "Food & Beverages", slug: "food-beverages", description: "Consumable products" },
  { id: "cat-4", name: "Home & Garden", slug: "home-garden", description: "Home improvement and garden supplies" },
  { id: "cat-5", name: "Accessories", slug: "accessories", description: "Various accessories" },
];

const mockProducts: Product[] = [
  {
    id: "prod-1",
    sku: "ELEC-001",
    name: "Wireless Bluetooth Headphones",
    description: "High-quality wireless headphones with noise cancellation",
    price: 79.99,
    costPrice: 35.00,
    status: "active",
    isPublished: true,
    categoryId: "cat-1",
    tags: ["audio", "wireless", "bestseller"],
    images: [
      { id: "img-1", url: "https://picsum.photos/seed/headphones/400/400", alt: "Headphones", isPrimary: true },
    ],
    variants: [
      { id: "var-1", sku: "ELEC-001-BLK", name: "Black", price: 79.99, costPrice: 35.00, attributes: { color: "Black" } },
      { id: "var-2", sku: "ELEC-001-WHT", name: "White", price: 79.99, costPrice: 35.00, attributes: { color: "White" } },
    ],
    createdAt: "2024-12-01T10:00:00Z",
    updatedAt: "2024-12-15T14:30:00Z",
  },
  {
    id: "prod-2",
    sku: "CLTH-001",
    name: "Cotton T-Shirt",
    description: "Premium cotton t-shirt, comfortable fit",
    price: 24.99,
    costPrice: 8.00,
    status: "active",
    isPublished: true,
    categoryId: "cat-2",
    tags: ["cotton", "casual"],
    images: [
      { id: "img-2", url: "https://picsum.photos/seed/tshirt/400/400", alt: "T-Shirt", isPrimary: true },
    ],
    variants: [
      { id: "var-3", sku: "CLTH-001-S-BLK", name: "Small / Black", price: 24.99, costPrice: 8.00, attributes: { size: "S", color: "Black" } },
      { id: "var-4", sku: "CLTH-001-M-BLK", name: "Medium / Black", price: 24.99, costPrice: 8.00, attributes: { size: "M", color: "Black" } },
      { id: "var-5", sku: "CLTH-001-L-BLK", name: "Large / Black", price: 24.99, costPrice: 8.00, attributes: { size: "L", color: "Black" } },
    ],
    createdAt: "2024-11-20T09:00:00Z",
    updatedAt: "2024-12-10T11:00:00Z",
  },
  {
    id: "prod-3",
    sku: "FOOD-001",
    name: "Organic Coffee Beans",
    description: "Premium organic arabica coffee beans, 1kg bag",
    price: 18.99,
    costPrice: 9.50,
    status: "active",
    isPublished: true,
    categoryId: "cat-3",
    tags: ["organic", "coffee", "bestseller"],
    images: [
      { id: "img-3", url: "https://picsum.photos/seed/coffee/400/400", alt: "Coffee Beans", isPrimary: true },
    ],
    variants: [],
    createdAt: "2024-10-15T08:00:00Z",
    updatedAt: "2024-12-20T16:00:00Z",
  },
  {
    id: "prod-4",
    sku: "HOME-001",
    name: "LED Desk Lamp",
    description: "Adjustable LED desk lamp with multiple brightness levels",
    price: 45.99,
    costPrice: 18.00,
    status: "active",
    isPublished: true,
    categoryId: "cat-4",
    tags: ["lighting", "office"],
    images: [
      { id: "img-4", url: "https://picsum.photos/seed/lamp/400/400", alt: "Desk Lamp", isPrimary: true },
    ],
    variants: [],
    createdAt: "2024-11-01T12:00:00Z",
    updatedAt: "2024-12-05T10:00:00Z",
  },
  {
    id: "prod-5",
    sku: "ACC-001",
    name: "Leather Wallet",
    description: "Genuine leather bifold wallet with RFID protection",
    price: 39.99,
    costPrice: 15.00,
    status: "active",
    isPublished: true,
    categoryId: "cat-5",
    tags: ["leather", "accessories"],
    images: [
      { id: "img-5", url: "https://picsum.photos/seed/wallet/400/400", alt: "Wallet", isPrimary: true },
    ],
    variants: [
      { id: "var-6", sku: "ACC-001-BRN", name: "Brown", price: 39.99, costPrice: 15.00, attributes: { color: "Brown" } },
      { id: "var-7", sku: "ACC-001-BLK", name: "Black", price: 39.99, costPrice: 15.00, attributes: { color: "Black" } },
    ],
    createdAt: "2024-10-20T14:00:00Z",
    updatedAt: "2024-12-18T09:00:00Z",
  },
  {
    id: "prod-6",
    sku: "ELEC-002",
    name: "USB-C Charging Cable",
    description: "Fast charging USB-C cable, 2m length",
    price: 12.99,
    costPrice: 3.50,
    status: "active",
    isPublished: true,
    categoryId: "cat-1",
    tags: ["charging", "cable", "usb-c"],
    images: [
      { id: "img-6", url: "https://picsum.photos/seed/cable/400/400", alt: "USB-C Cable", isPrimary: true },
    ],
    variants: [],
    createdAt: "2024-11-10T11:00:00Z",
    updatedAt: "2024-12-12T15:00:00Z",
  },
  {
    id: "prod-7",
    sku: "CLTH-002",
    name: "Denim Jeans",
    description: "Classic fit denim jeans, comfortable stretch fabric",
    price: 59.99,
    costPrice: 22.00,
    status: "active",
    isPublished: false,
    categoryId: "cat-2",
    tags: ["denim", "casual"],
    images: [
      { id: "img-7", url: "https://picsum.photos/seed/jeans/400/400", alt: "Jeans", isPrimary: true },
    ],
    variants: [
      { id: "var-8", sku: "CLTH-002-32", name: "32 Waist", price: 59.99, costPrice: 22.00, attributes: { waist: "32" } },
      { id: "var-9", sku: "CLTH-002-34", name: "34 Waist", price: 59.99, costPrice: 22.00, attributes: { waist: "34" } },
    ],
    createdAt: "2024-12-01T10:00:00Z",
    updatedAt: "2024-12-20T10:00:00Z",
  },
  {
    id: "prod-8",
    sku: "FOOD-002",
    name: "Green Tea Collection",
    description: "Assorted green tea varieties, 50 tea bags",
    price: 14.99,
    costPrice: 5.50,
    status: "draft",
    isPublished: false,
    categoryId: "cat-3",
    tags: ["tea", "organic"],
    images: [
      { id: "img-8", url: "https://picsum.photos/seed/tea/400/400", alt: "Green Tea", isPrimary: true },
    ],
    variants: [],
    createdAt: "2024-12-18T16:00:00Z",
    updatedAt: "2024-12-18T16:00:00Z",
  },
];

// Create inventory items for each product/variant
const mockInventoryItems: InventoryItem[] = [
  // Headphones variants
  { id: "inv-1", productId: "prod-1", variantId: "var-1", location: "default" },
  { id: "inv-2", productId: "prod-1", variantId: "var-2", location: "default" },
  // T-Shirt variants
  { id: "inv-3", productId: "prod-2", variantId: "var-3", location: "default" },
  { id: "inv-4", productId: "prod-2", variantId: "var-4", location: "default" },
  { id: "inv-5", productId: "prod-2", variantId: "var-5", location: "default" },
  // Products without variants
  { id: "inv-6", productId: "prod-3", location: "default" },
  { id: "inv-7", productId: "prod-4", location: "default" },
  // Wallet variants
  { id: "inv-8", productId: "prod-5", variantId: "var-6", location: "default" },
  { id: "inv-9", productId: "prod-5", variantId: "var-7", location: "default" },
  // More products
  { id: "inv-10", productId: "prod-6", location: "default" },
  { id: "inv-11", productId: "prod-7", variantId: "var-8", location: "default" },
  { id: "inv-12", productId: "prod-7", variantId: "var-9", location: "default" },
  { id: "inv-13", productId: "prod-8", location: "default" },
];

const mockInventoryMovements: InventoryMovement[] = [
  // Initial stock for headphones
  { id: "mov-1", inventoryItemId: "inv-1", type: "stock_in", quantity: 50, referenceType: "purchase", notes: "Initial inventory", costAtTime: 35.00, createdAt: "2024-12-01T10:00:00Z" },
  { id: "mov-2", inventoryItemId: "inv-2", type: "stock_in", quantity: 30, referenceType: "purchase", notes: "Initial inventory", costAtTime: 35.00, createdAt: "2024-12-01T10:00:00Z" },
  // Sales
  { id: "mov-3", inventoryItemId: "inv-1", type: "sale", quantity: -5, reference: "order-1", referenceType: "order", costAtTime: 35.00, createdAt: "2024-12-15T14:30:00Z" },
  { id: "mov-4", inventoryItemId: "inv-1", type: "sale", quantity: -2, reference: "order-2", referenceType: "order", costAtTime: 35.00, createdAt: "2024-12-18T10:00:00Z" },
  // T-shirt stock
  { id: "mov-5", inventoryItemId: "inv-3", type: "stock_in", quantity: 100, referenceType: "purchase", notes: "Bulk order", costAtTime: 8.00, createdAt: "2024-11-20T09:00:00Z" },
  { id: "mov-6", inventoryItemId: "inv-4", type: "stock_in", quantity: 150, referenceType: "purchase", notes: "Bulk order", costAtTime: 8.00, createdAt: "2024-11-20T09:00:00Z" },
  { id: "mov-7", inventoryItemId: "inv-5", type: "stock_in", quantity: 80, referenceType: "purchase", notes: "Bulk order", costAtTime: 8.00, createdAt: "2024-11-20T09:00:00Z" },
  { id: "mov-8", inventoryItemId: "inv-4", type: "sale", quantity: -10, reference: "order-3", referenceType: "order", costAtTime: 8.00, createdAt: "2024-12-19T11:00:00Z" },
  // Coffee stock
  { id: "mov-9", inventoryItemId: "inv-6", type: "stock_in", quantity: 200, referenceType: "purchase", notes: "Monthly restock", costAtTime: 9.50, createdAt: "2024-12-01T08:00:00Z" },
  { id: "mov-10", inventoryItemId: "inv-6", type: "sale", quantity: -25, reference: "order-4", referenceType: "order", costAtTime: 9.50, createdAt: "2024-12-20T16:00:00Z" },
  // Desk lamp
  { id: "mov-11", inventoryItemId: "inv-7", type: "stock_in", quantity: 40, referenceType: "purchase", costAtTime: 18.00, createdAt: "2024-11-01T12:00:00Z" },
  { id: "mov-12", inventoryItemId: "inv-7", type: "sale", quantity: -8, reference: "order-5", referenceType: "order", costAtTime: 18.00, createdAt: "2024-12-10T09:00:00Z" },
  // Low stock scenario for wallets
  { id: "mov-13", inventoryItemId: "inv-8", type: "stock_in", quantity: 15, referenceType: "purchase", costAtTime: 15.00, createdAt: "2024-10-20T14:00:00Z" },
  { id: "mov-14", inventoryItemId: "inv-8", type: "sale", quantity: -12, reference: "order-6", referenceType: "order", costAtTime: 15.00, createdAt: "2024-12-15T10:00:00Z" },
  { id: "mov-15", inventoryItemId: "inv-9", type: "stock_in", quantity: 20, referenceType: "purchase", costAtTime: 15.00, createdAt: "2024-10-20T14:00:00Z" },
  // USB cable - high volume
  { id: "mov-16", inventoryItemId: "inv-10", type: "stock_in", quantity: 500, referenceType: "purchase", costAtTime: 3.50, createdAt: "2024-11-10T11:00:00Z" },
  { id: "mov-17", inventoryItemId: "inv-10", type: "sale", quantity: -150, reference: "various", referenceType: "order", costAtTime: 3.50, createdAt: "2024-12-20T12:00:00Z" },
  // Jeans
  { id: "mov-18", inventoryItemId: "inv-11", type: "stock_in", quantity: 25, referenceType: "purchase", costAtTime: 22.00, createdAt: "2024-12-01T10:00:00Z" },
  { id: "mov-19", inventoryItemId: "inv-12", type: "stock_in", quantity: 25, referenceType: "purchase", costAtTime: 22.00, createdAt: "2024-12-01T10:00:00Z" },
  // Green tea (draft product)
  { id: "mov-20", inventoryItemId: "inv-13", type: "stock_in", quantity: 60, referenceType: "purchase", costAtTime: 5.50, createdAt: "2024-12-18T16:00:00Z" },
];

const mockCustomers: Customer[] = [
  { id: "cust-1", name: "John Smith", email: "john@example.com", phone: "+1-555-0101", address: "123 Main St, New York, NY 10001", createdAt: "2024-10-01T10:00:00Z" },
  { id: "cust-2", name: "Sarah Johnson", email: "sarah@example.com", phone: "+1-555-0102", createdAt: "2024-10-15T14:00:00Z" },
  { id: "cust-3", name: "Michael Brown", email: "michael@example.com", phone: "+1-555-0103", address: "456 Oak Ave, Los Angeles, CA 90001", notes: "Preferred customer", createdAt: "2024-11-01T09:00:00Z" },
  { id: "cust-4", name: "Emily Davis", email: "emily@example.com", createdAt: "2024-11-20T11:00:00Z" },
];

const mockOrders: Order[] = [
  {
    id: "order-1",
    orderNumber: "ORD-20241215-0001",
    customerId: "cust-1",
    source: "storefront",
    status: "completed",
    items: [
      { id: "oi-1", productId: "prod-1", variantId: "var-1", name: "Wireless Bluetooth Headphones - Black", sku: "ELEC-001-BLK", quantity: 2, unitPrice: 79.99, unitCost: 35.00, total: 159.98 },
      { id: "oi-2", productId: "prod-6", name: "USB-C Charging Cable", sku: "ELEC-002", quantity: 3, unitPrice: 12.99, unitCost: 3.50, total: 38.97 },
    ],
    subtotal: 198.95,
    tax: 17.91,
    discount: 0,
    total: 216.86,
    totalCost: 80.50,
    profit: 136.36,
    createdAt: "2024-12-15T14:30:00Z",
    updatedAt: "2024-12-15T16:00:00Z",
  },
  {
    id: "order-2",
    orderNumber: "ORD-20241218-0001",
    customerId: "cust-2",
    source: "walk-in",
    status: "completed",
    items: [
      { id: "oi-3", productId: "prod-1", variantId: "var-1", name: "Wireless Bluetooth Headphones - Black", sku: "ELEC-001-BLK", quantity: 1, unitPrice: 79.99, unitCost: 35.00, total: 79.99 },
    ],
    subtotal: 79.99,
    tax: 7.20,
    discount: 5.00,
    total: 82.19,
    totalCost: 35.00,
    profit: 47.19,
    createdAt: "2024-12-18T10:00:00Z",
    updatedAt: "2024-12-18T10:05:00Z",
  },
  {
    id: "order-3",
    orderNumber: "ORD-20241219-0001",
    customerId: "cust-3",
    source: "storefront",
    status: "processing",
    items: [
      { id: "oi-4", productId: "prod-2", variantId: "var-4", name: "Cotton T-Shirt - Medium / Black", sku: "CLTH-001-M-BLK", quantity: 5, unitPrice: 24.99, unitCost: 8.00, total: 124.95 },
      { id: "oi-5", productId: "prod-5", variantId: "var-6", name: "Leather Wallet - Brown", sku: "ACC-001-BRN", quantity: 2, unitPrice: 39.99, unitCost: 15.00, total: 79.98 },
    ],
    subtotal: 204.93,
    tax: 18.44,
    discount: 10.00,
    total: 213.37,
    totalCost: 70.00,
    profit: 143.37,
    notes: "Gift wrapping requested",
    createdAt: "2024-12-19T11:00:00Z",
    updatedAt: "2024-12-19T11:00:00Z",
  },
  {
    id: "order-4",
    orderNumber: "ORD-20241220-0001",
    source: "walk-in",
    status: "completed",
    items: [
      { id: "oi-6", productId: "prod-3", name: "Organic Coffee Beans", sku: "FOOD-001", quantity: 3, unitPrice: 18.99, unitCost: 9.50, total: 56.97 },
      { id: "oi-7", productId: "prod-4", name: "LED Desk Lamp", sku: "HOME-001", quantity: 1, unitPrice: 45.99, unitCost: 18.00, total: 45.99 },
    ],
    subtotal: 102.96,
    tax: 9.27,
    discount: 0,
    total: 112.23,
    totalCost: 46.50,
    profit: 65.73,
    createdAt: "2024-12-20T09:30:00Z",
    updatedAt: "2024-12-20T09:35:00Z",
  },
  {
    id: "order-5",
    orderNumber: "ORD-20241220-0002",
    customerId: "cust-4",
    source: "storefront",
    status: "pending",
    items: [
      { id: "oi-8", productId: "prod-4", name: "LED Desk Lamp", sku: "HOME-001", quantity: 2, unitPrice: 45.99, unitCost: 18.00, total: 91.98 },
    ],
    subtotal: 91.98,
    tax: 8.28,
    discount: 0,
    total: 100.26,
    totalCost: 36.00,
    profit: 64.26,
    createdAt: "2024-12-20T14:00:00Z",
    updatedAt: "2024-12-20T14:00:00Z",
  },
  {
    id: "order-6",
    orderNumber: "ORD-20241215-0002",
    customerId: "cust-1",
    source: "storefront",
    status: "completed",
    items: [
      { id: "oi-9", productId: "prod-5", variantId: "var-6", name: "Leather Wallet - Brown", sku: "ACC-001-BRN", quantity: 3, unitPrice: 39.99, unitCost: 15.00, total: 119.97 },
    ],
    subtotal: 119.97,
    tax: 10.80,
    discount: 0,
    total: 130.77,
    totalCost: 45.00,
    profit: 85.77,
    createdAt: "2024-12-15T10:00:00Z",
    updatedAt: "2024-12-15T12:00:00Z",
  },
];

const defaultSettings: CommerceSettings = {
  currency: "USD",
  taxRate: 9,
  lowStockThreshold: 10,
  storeName: "My Store",
  storeAddress: "123 Main Street, City, State 12345",
  storePhone: "(555) 123-4567",
  paymentMethods: [
    { id: "cash", name: "Cash", isActive: true },
    { id: "card", name: "Card", isActive: true },
    { id: "transfer", name: "Bank Transfer", isActive: true },
    { id: "pos", name: "POS Terminal", isActive: true },
  ],
};

// ============================================
// STORE
// ============================================

const useCommerceStore = create<CommerceStore>()(
  persist(
    (set, get) => ({
      products: mockProducts,
      categories: mockCategories,
      inventoryItems: mockInventoryItems,
      inventoryMovements: mockInventoryMovements,
      orders: mockOrders,
      customers: mockCustomers,
      settings: defaultSettings,

      actions: {
        // Product actions
        addProduct: (product) => {
          const id = `prod-${Date.now()}`;
          const now = new Date().toISOString();
          const newProduct: Product = {
            ...product,
            id,
            createdAt: now,
            updatedAt: now,
          };

          // Create inventory items for the product
          const newInventoryItems: InventoryItem[] = [];
          if (product.variants.length > 0) {
            product.variants.forEach((variant) => {
              newInventoryItems.push({
                id: `inv-${Date.now()}-${variant.id}`,
                productId: id,
                variantId: variant.id,
                location: "default",
              });
            });
          } else {
            newInventoryItems.push({
              id: `inv-${Date.now()}`,
              productId: id,
              location: "default",
            });
          }

          set((state) => ({
            products: [newProduct, ...state.products],
            inventoryItems: [...state.inventoryItems, ...newInventoryItems],
          }));

          return id;
        },

        updateProduct: (id, product) => {
          const now = new Date().toISOString();
          set((state) => ({
            products: state.products.map((p) =>
              p.id === id ? { ...p, ...product, updatedAt: now } : p
            ),
          }));
        },

        deleteProduct: (id) => {
          set((state) => ({
            products: state.products.filter((p) => p.id !== id),
            inventoryItems: state.inventoryItems.filter((i) => i.productId !== id),
          }));
        },

        // Category actions
        addCategory: (category) => {
          const newCategory: Category = {
            ...category,
            id: `cat-${Date.now()}`,
          };
          set((state) => ({
            categories: [...state.categories, newCategory],
          }));
        },

        updateCategory: (id, category) => {
          set((state) => ({
            categories: state.categories.map((c) =>
              c.id === id ? { ...c, ...category } : c
            ),
          }));
        },

        deleteCategory: (id) => {
          set((state) => ({
            categories: state.categories.filter((c) => c.id !== id),
          }));
        },

        // Inventory actions
        createMovement: (movement) => {
          const newMovement: InventoryMovement = {
            ...movement,
            id: `mov-${Date.now()}`,
            createdAt: new Date().toISOString(),
          };
          set((state) => ({
            inventoryMovements: [newMovement, ...state.inventoryMovements],
          }));
        },

        adjustStock: (productId, variantId, quantity, notes) => {
          const state = get();
          const inventoryItem = state.inventoryItems.find(
            (i) => i.productId === productId && i.variantId === (variantId || undefined)
          );

          if (!inventoryItem) return;

          const product = state.products.find((p) => p.id === productId);
          const variant = variantId
            ? product?.variants.find((v) => v.id === variantId)
            : null;

          const newMovement: InventoryMovement = {
            id: `mov-${Date.now()}`,
            inventoryItemId: inventoryItem.id,
            type: "adjustment",
            quantity,
            referenceType: "adjustment",
            notes,
            costAtTime: variant?.costPrice ?? product?.costPrice,
            createdAt: new Date().toISOString(),
          };

          set((state) => ({
            inventoryMovements: [newMovement, ...state.inventoryMovements],
          }));
        },

        // Order actions
        createOrder: (order) => {
          const state = get();
          const today = new Date();
          const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
          const todayOrders = state.orders.filter((o) =>
            o.orderNumber.includes(dateStr)
          ).length;
          const orderNumber = `ORD-${dateStr}-${String(todayOrders + 1).padStart(4, "0")}`;

          const id = `order-${Date.now()}`;
          const now = new Date().toISOString();

          const newOrder: Order = {
            ...order,
            id,
            orderNumber,
            createdAt: now,
            updatedAt: now,
          };

          // Create inventory movements for each item (deduct stock)
          const newMovements: InventoryMovement[] = [];
          order.items.forEach((item) => {
            const inventoryItem = state.inventoryItems.find(
              (i) =>
                i.productId === item.productId &&
                i.variantId === (item.variantId || undefined)
            );
            if (inventoryItem) {
              newMovements.push({
                id: `mov-${Date.now()}-${item.id}`,
                inventoryItemId: inventoryItem.id,
                type: "sale",
                quantity: -item.quantity,
                reference: id,
                referenceType: "order",
                costAtTime: item.unitCost,
                createdAt: now,
              });
            }
          });

          set((state) => ({
            orders: [newOrder, ...state.orders],
            inventoryMovements: [...newMovements, ...state.inventoryMovements],
          }));

          return id;
        },

        updateOrderStatus: (id, status) => {
          const now = new Date().toISOString();
          set((state) => ({
            orders: state.orders.map((o) =>
              o.id === id ? { ...o, status, updatedAt: now } : o
            ),
          }));
        },

        processRefund: (orderId, itemIds) => {
          const state = get();
          const order = state.orders.find((o) => o.id === orderId);
          if (!order) return;

          const now = new Date().toISOString();
          const itemsToRefund = order.items.filter((i) => itemIds.includes(i.id));

          // Create refund movements to restore stock
          const newMovements: InventoryMovement[] = [];
          itemsToRefund.forEach((item) => {
            const inventoryItem = state.inventoryItems.find(
              (i) =>
                i.productId === item.productId &&
                i.variantId === (item.variantId || undefined)
            );
            if (inventoryItem) {
              newMovements.push({
                id: `mov-${Date.now()}-refund-${item.id}`,
                inventoryItemId: inventoryItem.id,
                type: "refund",
                quantity: item.quantity, // Positive to restore
                reference: orderId,
                referenceType: "refund",
                costAtTime: item.unitCost,
                createdAt: now,
              });
            }
          });

          // Update order status and profit
          const refundAmount = itemsToRefund.reduce((sum, i) => sum + i.total, 0);
          const refundCost = itemsToRefund.reduce(
            (sum, i) => sum + i.unitCost * i.quantity,
            0
          );

          set((state) => ({
            orders: state.orders.map((o) =>
              o.id === orderId
                ? {
                    ...o,
                    status: "refunded" as OrderStatus,
                    total: o.total - refundAmount,
                    totalCost: o.totalCost - refundCost,
                    profit: o.profit - (refundAmount - refundCost),
                    updatedAt: now,
                  }
                : o
            ),
            inventoryMovements: [...newMovements, ...state.inventoryMovements],
          }));
        },

        // Customer actions
        addCustomer: (customer) => {
          const id = `cust-${Date.now()}`;
          const newCustomer: Customer = {
            ...customer,
            id,
            createdAt: new Date().toISOString(),
          };
          set((state) => ({
            customers: [newCustomer, ...state.customers],
          }));
          return id;
        },

        updateCustomer: (id, customer) => {
          set((state) => ({
            customers: state.customers.map((c) =>
              c.id === id ? { ...c, ...customer } : c
            ),
          }));
        },

        deleteCustomer: (id) => {
          set((state) => ({
            customers: state.customers.filter((c) => c.id !== id),
          }));
        },

        // Settings
        updateSettings: (settings) => {
          set((state) => ({
            settings: { ...state.settings, ...settings },
          }));
        },
      },
    }),
    {
      name: "dailyos-commerce",
      partialize: (state) => ({
        products: state.products,
        categories: state.categories,
        inventoryItems: state.inventoryItems,
        inventoryMovements: state.inventoryMovements,
        orders: state.orders,
        customers: state.customers,
        settings: state.settings,
      }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(persistedState as Partial<CommerceStore>),
        actions: currentState.actions, // Always use fresh actions from initial state
      }),
    }
  )
);

// ============================================
// BASIC SELECTORS
// ============================================

export const useProducts = () => useCommerceStore((state) => state.products);
export const useProductCategories = () => useCommerceStore((state) => state.categories);
export const useInventoryItems = () => useCommerceStore((state) => state.inventoryItems);
export const useInventoryMovements = () => useCommerceStore((state) => state.inventoryMovements);
export const useOrders = () => useCommerceStore((state) => state.orders);
export const useCustomers = () => useCommerceStore((state) => state.customers);
export const useCommerceSettings = () => useCommerceStore((state) => state.settings);
export const useCommerceActions = () => useCommerceStore((state) => state.actions);

// ============================================
// COMPUTED SELECTORS
// ============================================

// Product selectors
export const useProductById = (id: string) =>
  useCommerceStore((state) => state.products.find((p) => p.id === id));

export const useActiveProducts = () =>
  useCommerceStore(
    useShallow((state) => state.products.filter((p) => p.status === "active"))
  );

export const usePublishedProducts = () =>
  useCommerceStore(
    useShallow((state) =>
      state.products.filter((p) => p.isPublished && p.status === "active")
    )
  );

export const useProductsByCategory = (categoryId: string) =>
  useCommerceStore(
    useShallow((state) => state.products.filter((p) => p.categoryId === categoryId))
  );

// Inventory selectors
export const useProductStock = (productId: string, variantId?: string) =>
  useCommerceStore((state) => {
    const inventoryItem = state.inventoryItems.find(
      (i) => i.productId === productId && i.variantId === (variantId || undefined)
    );
    if (!inventoryItem) return 0;

    return state.inventoryMovements
      .filter((m) => m.inventoryItemId === inventoryItem.id)
      .reduce((sum, m) => sum + m.quantity, 0);
  });

export const useInventoryItemStock = (inventoryItemId: string) =>
  useCommerceStore((state) =>
    state.inventoryMovements
      .filter((m) => m.inventoryItemId === inventoryItemId)
      .reduce((sum, m) => sum + m.quantity, 0)
  );

// Computation functions (use with useMemo in components)
export const computeInventoryWithStock = (
  inventoryItems: InventoryItem[],
  inventoryMovements: InventoryMovement[],
  products: Product[]
) => {
  return inventoryItems.map((item) => {
    const stock = inventoryMovements
      .filter((m) => m.inventoryItemId === item.id)
      .reduce((sum, m) => sum + m.quantity, 0);
    const product = products.find((p) => p.id === item.productId);
    const variant = product?.variants.find((v) => v.id === item.variantId);
    return {
      ...item,
      stock,
      product,
      variant,
    };
  });
};

export const computeLowStockItems = (
  inventoryItems: InventoryItem[],
  inventoryMovements: InventoryMovement[],
  threshold: number
) => {
  return inventoryItems
    .map((item) => {
      const stock = inventoryMovements
        .filter((m) => m.inventoryItemId === item.id)
        .reduce((sum, m) => sum + m.quantity, 0);
      return { ...item, stock };
    })
    .filter((item) => item.stock > 0 && item.stock <= threshold);
};

export const computeOutOfStockItems = (
  inventoryItems: InventoryItem[],
  inventoryMovements: InventoryMovement[]
) => {
  return inventoryItems
    .map((item) => {
      const stock = inventoryMovements
        .filter((m) => m.inventoryItemId === item.id)
        .reduce((sum, m) => sum + m.quantity, 0);
      return { ...item, stock };
    })
    .filter((item) => item.stock <= 0);
};

export const useMovementsByInventoryItem = (inventoryItemId: string) =>
  useCommerceStore(
    useShallow((state) =>
      state.inventoryMovements
        .filter((m) => m.inventoryItemId === inventoryItemId)
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
    )
  );

// Order selectors
export const useOrderById = (id: string) =>
  useCommerceStore((state) => state.orders.find((o) => o.id === id));

export const useOrdersByStatus = (status: OrderStatus) =>
  useCommerceStore(
    useShallow((state) => state.orders.filter((o) => o.status === status))
  );

export const useOrdersBySource = (source: OrderSource) =>
  useCommerceStore(
    useShallow((state) => state.orders.filter((o) => o.source === source))
  );

export const useRecentOrders = (limit: number = 5) =>
  useCommerceStore(
    useShallow((state) =>
      [...state.orders]
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
        .slice(0, limit)
    )
  );

// Revenue & Profit selectors
export const useTotalRevenue = () =>
  useCommerceStore((state) =>
    state.orders
      .filter((o) => o.status !== "cancelled" && o.status !== "refunded")
      .reduce((sum, o) => sum + o.total, 0)
  );

export const useTotalProfit = () =>
  useCommerceStore((state) =>
    state.orders
      .filter((o) => o.status !== "cancelled" && o.status !== "refunded")
      .reduce((sum, o) => sum + o.profit, 0)
  );

export const useMonthlyRevenue = (month: string) =>
  useCommerceStore((state) =>
    state.orders
      .filter(
        (o) =>
          o.createdAt.startsWith(month) &&
          o.status !== "cancelled" &&
          o.status !== "refunded"
      )
      .reduce((sum, o) => sum + o.total, 0)
  );

export const useMonthlyProfit = (month: string) =>
  useCommerceStore((state) =>
    state.orders
      .filter(
        (o) =>
          o.createdAt.startsWith(month) &&
          o.status !== "cancelled" &&
          o.status !== "refunded"
      )
      .reduce((sum, o) => sum + o.profit, 0)
  );

export const useTotalOrderCount = () =>
  useCommerceStore((state) =>
    state.orders.filter((o) => o.status !== "cancelled").length
  );

export const useAverageOrderValue = () =>
  useCommerceStore((state) => {
    const validOrders = state.orders.filter(
      (o) => o.status !== "cancelled" && o.status !== "refunded"
    );
    if (validOrders.length === 0) return 0;
    const total = validOrders.reduce((sum, o) => sum + o.total, 0);
    return total / validOrders.length;
  });

// Customer selectors
export const useCustomerById = (id: string) =>
  useCommerceStore((state) => state.customers.find((c) => c.id === id));

export const useCustomerOrders = (customerId: string) =>
  useCommerceStore(
    useShallow((state) =>
      state.orders.filter((o) => o.customerId === customerId)
    )
  );

export const useCustomerTotalSpent = (customerId: string) =>
  useCommerceStore((state) =>
    state.orders
      .filter(
        (o) =>
          o.customerId === customerId &&
          o.status !== "cancelled" &&
          o.status !== "refunded"
      )
      .reduce((sum, o) => sum + o.total, 0)
  );

// Top products by revenue (computation function)
export const computeTopProductsByRevenue = (
  orders: Order[],
  products: Product[],
  limit: number = 5
) => {
  const productRevenue = new Map<string, number>();

  orders
    .filter((o) => o.status !== "cancelled" && o.status !== "refunded")
    .forEach((order) => {
      order.items.forEach((item) => {
        const current = productRevenue.get(item.productId) || 0;
        productRevenue.set(item.productId, current + item.total);
      });
    });

  return [...productRevenue.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([productId, revenue]) => ({
      product: products.find((p) => p.id === productId),
      revenue,
    }));
};

// Sales by category (computation function)
export const computeSalesByCategory = (
  orders: Order[],
  products: Product[],
  categories: Category[]
) => {
  const categoryRevenue = new Map<string, number>();

  orders
    .filter((o) => o.status !== "cancelled" && o.status !== "refunded")
    .forEach((order) => {
      order.items.forEach((item) => {
        const product = products.find((p) => p.id === item.productId);
        const categoryId = product?.categoryId || "uncategorized";
        const current = categoryRevenue.get(categoryId) || 0;
        categoryRevenue.set(categoryId, current + item.total);
      });
    });

  return [...categoryRevenue.entries()].map(([categoryId, revenue]) => ({
    category: categories.find((c) => c.id === categoryId) || {
      id: "uncategorized",
      name: "Uncategorized",
      slug: "uncategorized",
    },
    revenue,
  }));
};
