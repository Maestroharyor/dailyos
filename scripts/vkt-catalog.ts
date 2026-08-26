/**
 * Source catalog for the VKT bag import, transcribed from the "VKT Cost &
 * Retail price" Notion page (25 Aug 2026).
 *
 * Landed cost is the sum of the four per-unit lines the page tracks: bag fee,
 * shipping, packaging and marketing. The page's header block quotes different
 * packaging/marketing figures (₦1500 / ₦200) than its line items (₦200 / ₦500-700);
 * the line items are authoritative because they are what reconciles cost +
 * profit to the quoted sale price on WLS 01-03.
 *
 * `price` is the list price and `salePrice` the struck-through discount, so the
 * storefront shows the markdown the page intends. Items whose profit and sale
 * price were both left blank carry `price: null` and import as drafts priced at
 * landed cost — they cannot reach the storefront until a real price is set.
 */

export interface ColorLine {
  color: string;
  qty: number;
}

export interface CatalogItem {
  sku: string;
  name: string;
  description: string;
  /** Filename inside SOURCE_IMAGE_DIR. Undefined when the page had no product photo. */
  image?: string;
  bagFee: number;
  shipping: number;
  packaging: number;
  marketing: number;
  /** List price. Null when the page left both profit and sale price blank. */
  price: number | null;
  salePrice?: number;
  size: string;
  /** Per-colour stock. Empty for batches bought as an unsorted mix. */
  colors: ColorLine[];
  /** Units held when `colors` is empty. */
  mixedQty?: number;
  /** Set false to hold a priced item back from the storefront; see notes. */
  publish: boolean;
  notes?: string;
}

export const SOURCE_IMAGE_DIR =
  "/Users/maestro/Downloads/Private & Shared/\u{1F4CC}VKT Cost & Retail price";

export const CATALOG: CatalogItem[] = [
  {
    sku: "WLS-01",
    name: "WLS-01 Bag",
    description:
      "<p>A structured top-handle bag with a clean, boxy silhouette and one deliberate piece of fun. The shape holds itself upright whether it is full or nearly empty, which makes it smart enough for work and light enough for a weekend out. The cherry charm is detachable, so the bag reads either playful or plain depending on the day.</p><h3>Details</h3><ul><li><strong>Design:</strong> Smooth faux-leather in a boxed, flat-based shape with reinforced corners and a single rolled top handle. A slim strap runs across the front panel and under the closure.</li><li><strong>Hardware:</strong> Gold-tone throughout. A working padlock and key fob sit at the front strap, with a turn-lock securing the flap. The cherry charm hangs from a split ring at the handle base.</li><li><strong>Included:</strong> Detachable, adjustable shoulder strap for crossbody wear.</li><li><strong>Size:</strong> Large.</li><li><strong>Colours:</strong> Brown, Wine, Pink, Black and White.</li></ul><h3>Care</h3><p><em>Wipe with a soft, dry cloth. Keep out of prolonged direct sunlight and store upright, stuffed lightly to hold its shape.</em></p>",
    image: "IMG_3096.jpeg",
    bagFee: 2700,
    shipping: 1900,
    packaging: 200,
    marketing: 700,
    price: 25000,
    salePrice: 15500,
    size: "Large",
    colors: [
      { color: "Brown", qty: 3 },
      { color: "Wine", qty: 2 },
      { color: "Pink", qty: 1 },
      { color: "Black", qty: 4 },
      { color: "White", qty: 1 },
    ],
    publish: true,
  },
  {
    sku: "WLS-02",
    name: "WLS-02 Bag",
    description:
      "<p>A two-piece set built around a generous everyday tote. The main bag takes a laptop, a folder and the usual daily carry without slumping, and the smaller flap bag comes along for evenings when you want to leave the bulk behind. Buying the pair together means the two always match.</p><h3>Details</h3><ul><li><strong>Design:</strong> Smooth faux-leather with a wide flat base and a tall, squared-off body. Twin handles alternate chain links with wrapped leather-look grips, so the weight sits comfortably on the shoulder. A slip pocket runs across the front panel.</li><li><strong>Hardware:</strong> Gunmetal chain on the handles and the shoulder strap, with matching fittings.</li><li><strong>Included:</strong> A matching flap shoulder bag on a long chain strap, plus a detachable crossbody strap for the tote.</li><li><strong>Size:</strong> Large, 30cm wide.</li><li><strong>Colours:</strong> Navy Blue, Olive Green, Black, Maroon and Brown.</li></ul><h3>Care</h3><p><em>Wipe with a soft, dry cloth. Keep out of prolonged direct sunlight and store upright, stuffed lightly to hold its shape.</em></p>",
    image: "IMG_3110.jpeg",
    bagFee: 2800,
    shipping: 1900,
    packaging: 200,
    marketing: 700,
    price: 45000,
    salePrice: 25000,
    size: "Large - 30cm wide",
    colors: [
      { color: "Navy Blue", qty: 1 },
      { color: "Olive Green", qty: 1 },
      { color: "Black", qty: 1 },
      { color: "Maroon", qty: 1 },
      { color: "Brown", qty: 1 },
    ],
    publish: true,
  },
  {
    sku: "WLS-03",
    name: "WLS-03 Bag",
    description:
      "<p>A colourblock set that does double duty: a structured work tote in the deeper shade, and a chain clutch in the lighter one for when the tote is too much bag. The contrast band across the front is what gives the pair its shape on the shoulder.</p><h3>Details</h3><ul><li><strong>Design:</strong> Smooth faux-leather in two tones, with twin top handles and a wide contrast belt band fastened across the front panel. Squared body, flat base, roomy unlined main compartment.</li><li><strong>Hardware:</strong> Gunmetal chain on the clutch, matching fittings on the tote.</li><li><strong>Included:</strong> A matching flap clutch on a chain strap, plus a detachable shoulder strap for the tote.</li><li><strong>Size:</strong> Large, 30cm wide.</li><li><strong>Colours:</strong> Black, Brown, and Burgundy &amp; Pink.</li></ul><h3>Care</h3><p><em>Wipe with a soft, dry cloth. Keep out of prolonged direct sunlight and store upright, stuffed lightly to hold its shape.</em></p>",
    image: "IMG_3155.jpeg",
    bagFee: 2800,
    shipping: 1900,
    packaging: 200,
    marketing: 700,
    price: 45000,
    salePrice: 33000,
    size: "Large - 30cm wide",
    colors: [
      { color: "Black", qty: 2 },
      { color: "Brown", qty: 1 },
      { color: "Burgundy & Pink", qty: 1 },
    ],
    publish: true,
  },
  {
    sku: "WLS-04",
    name: "WLS-04 Bag",
    description:
      "<p>A three-piece set with more texture than most. The body is woven twill rather than flat panel, trimmed in smooth faux-leather, and a printed silk-look scarf comes tied at the handle. It is the set to reach for when the outfit is plain and the bag has to do the work.</p><h3>Details</h3><ul><li><strong>Design:</strong> Twill-textured body with smooth faux-leather trim at the corners, base and handles. Twin top handles, plus a flap pocket band across the front. Structured sides that hold their shape when the bag is packed.</li><li><strong>Hardware:</strong> Silver-tone fittings and strap clips.</li><li><strong>Included:</strong> A matching zip-around wallet, a printed scarf tied at the handle, and a detachable webbing shoulder strap.</li><li><strong>Size:</strong> Large, 30cm wide.</li><li><strong>Colours:</strong> Olive Green, Khaki &amp; Mushroom Taupe, Khaki &amp; Toffee Brown, Black, Mocha Brown and Burgundy.</li></ul><h3>Care</h3><p><em>Wipe with a soft, dry cloth. Keep out of prolonged direct sunlight and store upright, stuffed lightly to hold its shape.</em></p>",
    image: "IMG_3161.jpeg",
    bagFee: 2800,
    shipping: 1900,
    packaging: 200,
    marketing: 700,
    price: null,
    size: "Large - 30cm wide",
    colors: [
      { color: "Olive Green", qty: 2 },
      { color: "Khaki & Mushroom Taupe", qty: 2 },
      { color: "Khaki & Toffee Brown", qty: 2 },
      { color: "Black", qty: 5 },
      { color: "Mocha Brown", qty: 1 },
      { color: "Burgundy", qty: 5 },
    ],
    publish: false,
  },
  {
    sku: "WLS-05",
    name: "WLS-05 Bag",
    description:
      "<p>A slimmer, more upright tote than the rest of the range, cut in two contrasting tones with a matching wallet. The narrow handles and tall shape make it read dressier than a standard work bag, without losing the capacity.</p><h3>Details</h3><ul><li><strong>Design:</strong> Smooth faux-leather with a contrasting side and interior panel, twin slim top handles and a structured, gently tapered body. A leather-look pull hangs from the side with a ring charm.</li><li><strong>Hardware:</strong> Gold-tone ring charm and fittings.</li><li><strong>Included:</strong> A matching zip-around wallet and a detachable shoulder strap.</li><li><strong>Size:</strong> Large, 30cm wide.</li><li><strong>Colours:</strong> Black, Burgundy &amp; Blush Pink, Deep Chocolate Brown &amp; Caramel, and Brown &amp; Camel.</li></ul><h3>Care</h3><p><em>Wipe with a soft, dry cloth. Keep out of prolonged direct sunlight and store upright, stuffed lightly to hold its shape.</em></p>",
    image: "IMG_3174.jpeg",
    bagFee: 2700,
    shipping: 1900,
    packaging: 200,
    marketing: 500,
    price: null,
    size: "Large - 30cm wide",
    colors: [
      { color: "Black", qty: 1 },
      { color: "Burgundy & Blush Pink", qty: 1 },
      { color: "Deep Chocolate Brown & Caramel", qty: 1 },
      { color: "Brown & Camel", qty: 1 },
    ],
    publish: false,
  },
  {
    sku: "WLS-06",
    name: "WLS-06 Bag",
    description:
      "<p>A formal top-handle bag, the most structured shape in the range. It stands on its own on a desk or a table, and the padded handle means it stays comfortable even when the bag is full. Supplied with a dust bag, so it is the natural pick if the bag is a gift.</p><h3>Details</h3><ul><li><strong>Design:</strong> Smooth faux-leather over a firm frame, with a rolled and padded top handle. A flap pocket sits on the front panel, and gusseted side zips let the body widen when you need the extra room.</li><li><strong>Hardware:</strong> Gold-tone, with a turn-lock closure on the front flap pocket.</li><li><strong>Included:</strong> Branded dust bag.</li><li><strong>Size:</strong> Large, 26cm wide.</li><li><strong>Colours:</strong> Brown, Maroon, Khaki &amp; Coffee, Black, Nude and Emerald Green.</li></ul><h3>Care</h3><p><em>Wipe with a soft, dry cloth. Keep out of prolonged direct sunlight and store upright, stuffed lightly to hold its shape.</em></p>",
    image: "IMG_3184.jpeg",
    bagFee: 2800,
    shipping: 1900,
    packaging: 200,
    marketing: 500,
    price: null,
    size: "Large - 26cm wide",
    colors: [
      { color: "Brown", qty: 2 },
      { color: "Maroon", qty: 1 },
      { color: "Khaki & Coffee", qty: 1 },
      { color: "Black", qty: 3 },
      { color: "Nude", qty: 1 },
      { color: "Emerald Green", qty: 1 },
    ],
    publish: false,
  },
  {
    sku: "WLS-07",
    name: "WLS-07 Bag",
    description:
      "<p>The most compact bag in the range: a neat, structured top-handle shape sized for a phone, a card holder and the essentials. Short enough in the handle to carry in the hand, with a strap for when you would rather not.</p><h3>Details</h3><ul><li><strong>Design:</strong> Smooth faux-leather in a small trapeze shape with a single top handle, clean unbroken front panel and a flat base.</li><li><strong>Hardware:</strong> Gold-tone plaque at the centre front, with matching strap clips.</li><li><strong>Included:</strong> Detachable crossbody strap, presented in a gift box.</li><li><strong>Size:</strong> Large, 30cm wide.</li><li><strong>Colours:</strong> Assorted. <em>This batch was bought as a mixed lot and the colour split is confirmed once the stock arrives.</em></li></ul><h3>Care</h3><p><em>Wipe with a soft, dry cloth. Keep out of prolonged direct sunlight and store upright, stuffed lightly to hold its shape.</em></p>",
    image: "IMG_3121.jpeg",
    bagFee: 2800,
    shipping: 1900,
    packaging: 200,
    marketing: 500,
    price: 15400,
    size: "Large - 30cm wide",
    colors: [],
    mixedQty: 5,
    publish: false,
    notes:
      "Priced (cost 5400 + stated 10000 profit), but held at draft: the supplier photo carries a third-party brand logo. Publish once the incoming stock is confirmed unbranded.",
  },
  {
    sku: "WLS-08",
    name: "WLS-08 Bag",
    description:
      "<p>A softly structured top-handle bag with winged sides that give it a wider, more relaxed profile than a rigid frame bag. The textured saffiano-style finish hides marks well, which makes it a sensible daily choice.</p><h3>Details</h3><ul><li><strong>Design:</strong> Cross-hatch textured faux-leather with winged side panels and a gently rounded base. A single top handle sits on rolled mounts, with a full-width flap over the opening.</li><li><strong>Hardware:</strong> Gold-tone, closing with an elongated bar-and-loop clasp on the flap.</li><li><strong>Included:</strong> Detachable flat shoulder strap.</li><li><strong>Size:</strong> Large, 30cm wide.</li><li><strong>Colours:</strong> Assorted. <em>This batch was bought as a mixed lot and the colour split is confirmed once the stock arrives.</em></li></ul><h3>Care</h3><p><em>Wipe with a soft, dry cloth. Keep out of prolonged direct sunlight and store upright, stuffed lightly to hold its shape.</em></p>",
    image: "IMG_3127.jpeg",
    bagFee: 2800,
    shipping: 1900,
    packaging: 200,
    marketing: 500,
    price: 15400,
    size: "Large - 30cm wide",
    colors: [],
    mixedQty: 5,
    publish: true,
  },
  {
    sku: "WLS-09",
    name: "WLS-09 Bag",
    description:
      "<p>A trapeze-shaped flap bag in two tones, cut smaller and neater than the totes. The contrast between flap and body is the whole design, so it works hardest against a plain outfit.</p><h3>Details</h3><ul><li><strong>Design:</strong> Smooth faux-leather with a contrast flap over a lighter body, tapering gently from base to top. Single top handle, structured sides, flat base.</li><li><strong>Hardware:</strong> Gold-tone turn-lock at the centre of the flap, with matching strap clips.</li><li><strong>Included:</strong> Detachable shoulder strap.</li><li><strong>Size:</strong> 26cm wide.</li><li><strong>Colours:</strong> Brown, Black, White &amp; Nude, Maroon, Royal Blue, and Off-White &amp; Brown.</li></ul><h3>Care</h3><p><em>Wipe with a soft, dry cloth. Keep out of prolonged direct sunlight and store upright, stuffed lightly to hold its shape.</em></p>",
    image: "IMG_3203.jpeg",
    bagFee: 2800,
    shipping: 1900,
    packaging: 200,
    marketing: 500,
    price: null,
    size: "26cm wide",
    colors: [
      { color: "Brown", qty: 2 },
      { color: "Black", qty: 5 },
      { color: "White & Nude", qty: 1 },
      { color: "Maroon", qty: 2 },
      { color: "Royal Blue", qty: 1 },
      { color: "Off-White & Brown", qty: 3 },
    ],
    publish: false,
  },
  {
    sku: "WLS-10",
    name: "WLS-10 Bag",
    description:
      "<p>A grained-finish tote defined by one oversized buckle across the front. The pebbled texture is the practical part: it resists scuffing far better than a smooth panel, which matters on a bag this size.</p><h3>Details</h3><ul><li><strong>Design:</strong> Pebble-grain faux-leather with a squared body, flat base and firm sides. Twin slim top handles mounted on shaped plates. A large flat buckle sits centre-front as the sole detail.</li><li><strong>Hardware:</strong> Gold-tone triangular handle mounts and buckle.</li><li><strong>Included:</strong> Detachable shoulder strap.</li><li><strong>Size:</strong> 30cm wide.</li><li><strong>Colours:</strong> Brown, Maroon, Nude, Off-White &amp; Burgundy, Black and Emerald Green.</li></ul><h3>Care</h3><p><em>Wipe with a soft, dry cloth. Keep out of prolonged direct sunlight and store upright, stuffed lightly to hold its shape.</em></p>",
    image: "IMG_3208.jpeg",
    bagFee: 2800,
    shipping: 1900,
    packaging: 200,
    marketing: 500,
    price: null,
    size: "30cm wide",
    colors: [
      { color: "Brown", qty: 1 },
      { color: "Maroon", qty: 2 },
      { color: "Nude", qty: 1 },
      { color: "Off-White & Burgundy", qty: 1 },
      { color: "Black", qty: 2 },
      { color: "Emerald Green", qty: 1 },
    ],
    publish: false,
  },
  {
    sku: "WLS-11",
    name: "WLS-11 Bag",
    description:
      "<p>A two-piece set in a restrained, businesslike shape. The belt and ring across the front is the only ornament, which is what keeps it wearable with a suit as easily as with jeans. The matching wallet makes it a complete gift without adding anything.</p><h3>Details</h3><ul><li><strong>Design:</strong> Smooth faux-leather with a tall structured body, twin rolled top handles and a slim belt fastened across the front panel. Side zips let the body expand.</li><li><strong>Hardware:</strong> Gold-tone hook ring on the front belt, with matching fittings.</li><li><strong>Included:</strong> A matching zip-around wallet.</li><li><strong>Size:</strong> 28cm wide.</li><li><strong>Colours:</strong> Brown, Olive Green, Burgundy, Black, and Khaki &amp; Brown.</li></ul><h3>Care</h3><p><em>Wipe with a soft, dry cloth. Keep out of prolonged direct sunlight and store upright, stuffed lightly to hold its shape.</em></p>",
    image: "IMG_3221.jpeg",
    bagFee: 2800,
    shipping: 1900,
    packaging: 200,
    marketing: 500,
    price: null,
    size: "28cm wide",
    colors: [
      { color: "Brown", qty: 2 },
      { color: "Olive Green", qty: 1 },
      { color: "Burgundy", qty: 2 },
      { color: "Black", qty: 3 },
      { color: "Khaki & Brown", qty: 1 },
    ],
    publish: false,
  },
  {
    sku: "WLS-12",
    name: "WLS-12 Bag",
    description:
      "<p>A three-piece set in a printed jacquard rather than a plain panel, finished with a webbing stripe down the centre. The tote is a medium day size, and the pouch and wallet nest inside it or travel on their own.</p><h3>Details</h3><ul><li><strong>Design:</strong> Monogram-print jacquard body with faux-leather trim at the handles, corners and base. A red and green webbing stripe runs vertically down the front and back. Open top, flat base.</li><li><strong>Hardware:</strong> Gold-tone fittings with a round logo charm on the handle.</li><li><strong>Included:</strong> A matching zip pouch and a slim wallet.</li><li><strong>Size:</strong> Tote 27cm wide by 20.5cm high; pouch 20cm by 12.5cm.</li><li><strong>Colours:</strong> Assorted. <em>This batch was bought as a mixed lot and the colour split is confirmed once the stock arrives.</em></li></ul><h3>Care</h3><p><em>Wipe with a soft, dry cloth. Keep out of prolonged direct sunlight and store upright, stuffed lightly to hold its shape.</em></p>",
    image: "IMG_3211.jpeg",
    bagFee: 2800,
    shipping: 1900,
    packaging: 200,
    marketing: 500,
    price: null,
    size: "Large - 30cm wide",
    colors: [],
    mixedQty: 5,
    publish: false,
    notes:
      "Supplier photo shows a third-party monogram print. Confirm the incoming stock before pricing or publishing.",
  },
  {
    sku: "WLS-13",
    name: "WLS-13 Bag",
    description:
      "<p>A small structured tote in the classic twin-strap shape, cut in grained faux-leather. Sized for the essentials rather than a day's carry, and bright enough in the lighter colourways to work as the accent piece of an outfit.</p><h3>Details</h3><ul><li><strong>Design:</strong> Pebble-grain faux-leather over a firm frame, with twin rolled top handles and two belt straps running from the flap to the front panel. Flat base, open top under the flap.</li><li><strong>Hardware:</strong> Gold-tone buckles, strap keepers and a decorative padlock at the front.</li><li><strong>Included:</strong> Detachable shoulder strap.</li><li><strong>Size:</strong> Large, 30cm wide.</li><li><strong>Colours:</strong> Assorted. <em>This batch was bought as a mixed lot and the colour split is confirmed once the stock arrives.</em></li></ul><h3>Care</h3><p><em>Wipe with a soft, dry cloth. Keep out of prolonged direct sunlight and store upright, stuffed lightly to hold its shape.</em></p>",
    image: "IMG_3212.jpeg",
    bagFee: 2800,
    shipping: 1900,
    packaging: 200,
    marketing: 500,
    price: null,
    size: "Large - 30cm wide",
    colors: [],
    mixedQty: 4,
    publish: false,
  },
  {
    sku: "WLS-14",
    name: "WLS-14 Bag",
    description:
      "<p>A mixed batch of medium bags bought as a job lot: assorted shapes, finishes and colours across the fifty units. Styles are allocated as stock is picked, so this listing is sold on size and price rather than on a specific design.</p><h3>Details</h3><ul><li><strong>Design:</strong> Varies by unit. The batch spans structured top-handle shapes, flap bags and small totes in a mix of smooth, grained and printed faux-leather finishes.</li><li><strong>Hardware:</strong> Varies by unit, gold-tone and silver-tone both present.</li><li><strong>Included:</strong> Varies by unit.</li><li><strong>Size:</strong> Medium.</li><li><strong>Colours:</strong> Assorted, allocated on picking. <em>Contact us before ordering if you need a specific shade.</em></li></ul><h3>Care</h3><p><em>Wipe with a soft, dry cloth. Keep out of prolonged direct sunlight and store upright, stuffed lightly to hold its shape.</em></p>",
    bagFee: 2800,
    shipping: 1900,
    packaging: 200,
    marketing: 500,
    price: null,
    size: "Medium",
    colors: [],
    mixedQty: 50,
    publish: false,
    notes: "No product photo on the source page; IMG_3308 is the purchase receipt.",
  },
];

export function landedCost(item: CatalogItem): number {
  return item.bagFee + item.shipping + item.packaging + item.marketing;
}

export function totalUnits(item: CatalogItem): number {
  return item.colors.length ? item.colors.reduce((sum, c) => sum + c.qty, 0) : (item.mixedQty ?? 0);
}
