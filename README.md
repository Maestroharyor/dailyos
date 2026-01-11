# DailyOS

A unified personal productivity system built with Next.js 16, featuring finance tracking, meal planning, commerce management, and more. DailyOS brings together essential life management tools in one beautiful, mobile-first progressive web app with a macOS-inspired desktop experience.

## Features

### Core Apps

- **Fintrack** - Personal finance tracker with expense tracking, income management, budgets, financial goals, and recurring transactions
- **Mealflow** - Meal planning and recipe management with TheMealDB integration, grocery lists, and weekly meal scheduling
- **Commerce** - Full retail/e-commerce management with POS, inventory tracking, orders, customers, and sales reports

### Additional Features

- **Invoices** - Invoice management (Coming Soon)
- **Calendar** - Schedule and event management (Coming Soon)
- **Tasks** - Todo list and task management (Coming Soon)
- **Notes** - Quick notes and documentation (Coming Soon)

### Platform Features

- Progressive Web App (PWA) - Install on any device
- Dark/Light theme support with system preference detection
- Mobile-first responsive design with bottom navigation
- Desktop experience with macOS-style dock and window controls
- Offline-capable with service worker
- Cross-platform authentication system
- Persistent state management with Zustand
- Floating calculator widget for quick calculations
- Receipt export to PDF and image formats

## Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) with App Router
- **UI Components**: [HeroUI](https://heroui.com/) (formerly NextUI)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
- **State Management**: [Zustand](https://zustand-demo.pmnd.rs/)
- **Charts**: [Recharts](https://recharts.org/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Animations**: [Framer Motion](https://www.framer.com/motion/)
- **Theming**: [next-themes](https://github.com/pacocoursey/next-themes)
- **PDF Export**: html2pdf.js, html2canvas
- **Runtime**: [Bun](https://bun.sh/) (recommended) or Node.js

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (recommended) or [Node.js](https://nodejs.org/) 18+
- Git

### Installation

1. Clone the repository:

```bash
git clone https://github.com/yourusername/dailyos.git
cd dailyos
```

2. Install dependencies:

```bash
bun install
# or
npm install
```

3. Create a `.env` file (optional):

```bash
cp .env.example .env
```

4. Start the development server:

```bash
bun dev
# or
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
dailyos/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── (auth)/            # Authentication pages (login, signup, reset)
│   │   ├── commerce/          # Commerce app
│   │   │   ├── customers/     # Customer management
│   │   │   ├── inventory/     # Inventory tracking
│   │   │   ├── orders/        # Order management
│   │   │   ├── pos/           # Point of sale
│   │   │   ├── products/      # Product catalog
│   │   │   ├── reports/       # Sales reports
│   │   │   └── settings/      # Commerce settings
│   │   ├── finance/           # Fintrack app
│   │   │   ├── budget/        # Budget management
│   │   │   ├── expenses/      # Expense tracking
│   │   │   ├── goals/         # Financial goals
│   │   │   ├── income/        # Income tracking
│   │   │   ├── recurring/     # Recurring transactions
│   │   │   └── settings/      # Finance settings
│   │   ├── home/              # Dashboard/home
│   │   ├── invoices/          # Invoices app
│   │   ├── mealflow/          # Mealflow app
│   │   │   ├── groceries/     # Grocery lists
│   │   │   ├── meals/         # Weekly meal planner
│   │   │   └── recipes/       # Recipe management
│   │   ├── settings/          # User settings
│   │   ├── globals.css        # Global styles
│   │   ├── layout.tsx         # Root layout
│   │   └── page.tsx           # Landing page
│   │
│   ├── components/            # React components
│   │   ├── commerce/          # Commerce-specific components
│   │   │   └── order-receipt.tsx
│   │   ├── shared/            # Shared components
│   │   │   ├── bottom-nav.tsx # Mobile bottom navigation
│   │   │   ├── dock.tsx       # macOS-style desktop dock
│   │   │   ├── floating-calculator.tsx
│   │   │   ├── navbar.tsx     # Top navigation
│   │   │   └── sub-app-header.tsx  # Sub-app header with window controls
│   │   ├── auth-guard.tsx     # Authentication guard
│   │   ├── providers.tsx      # App providers (theme, UI)
│   │   └── service-worker-register.tsx
│   │
│   └── lib/                   # Utilities and stores
│       ├── api/               # External API integrations
│       │   └── meal-db.ts     # TheMealDB API client
│       ├── stores/            # Zustand stores
│       │   ├── auth-store.ts
│       │   ├── commerce-store.ts  # Products, inventory, orders, customers
│       │   ├── finance-store.ts
│       │   ├── meals-store.ts
│       │   ├── recipes-store.ts   # Recipes with MealDB integration
│       │   ├── ui-store.ts        # UI state, open apps, dock
│       │   └── index.ts
│       ├── utils/             # Utility functions
│       │   └── receipt-export.ts  # PDF/image export
│       └── utils.ts           # Common utilities (formatCurrency, etc.)
│
├── public/                    # Static assets
│   ├── icons/                 # PWA icons
│   ├── manifest.webmanifest   # PWA manifest
│   └── sw.js                  # Service worker
│
├── hero.ts                    # HeroUI Tailwind plugin config
├── next.config.ts             # Next.js configuration
├── tsconfig.json              # TypeScript configuration
└── package.json
```

## Scripts

| Command | Description |
|---------|-------------|
| `bun dev` | Start development server with Turbopack |
| `bun build` | Build for production |
| `bun start` | Start production server |
| `bun lint` | Run ESLint |

## Core Apps

### Fintrack (Finance)

Personal finance management with:
- **Dashboard**: Overview of financial health with charts
- **Expenses**: Track and categorize spending
- **Income**: Monitor income sources
- **Budget**: Set and track category budgets
- **Goals**: Save towards financial goals
- **Recurring**: Manage recurring transactions
- **Settings**: Configure categories and preferences

### Mealflow

Meal planning and recipe management:
- **Dashboard**: Weekly overview and quick actions
- **Meals**: Plan meals for each day of the week
- **Recipes**: Browse, search, and save recipes (includes TheMealDB integration)
- **Groceries**: Generate and manage shopping lists

### Commerce

Full retail/e-commerce solution:
- **Dashboard**: Revenue, profit, and sales overview with charts
- **POS**: Point of sale for walk-in customers
- **Products**: Catalog management with variants and categories
- **Inventory**: Stock tracking with movement history
- **Orders**: Order management and processing
- **Customers**: Customer database and purchase history
- **Reports**: Sales analytics and insights
- **Settings**: Store configuration and payment methods

## Configuration

### Theme Configuration

The app supports light, dark, and system themes. Theme preference is managed through `next-themes` and persists across sessions.

### PWA Configuration

PWA settings are defined in `public/manifest.webmanifest`. The service worker (`public/sw.js`) handles offline caching.

### HeroUI Configuration

HeroUI theming is configured in `hero.ts` and imported in `globals.css`:

```css
@plugin '../../hero.ts';
@source '../../node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}';
```

## State Management

DailyOS uses Zustand for state management with persistence middleware:

- **Auth Store** - User authentication state
- **Finance Store** - Transactions, budgets, goals, recurring items
- **Meals Store** - Meal plans and weekly schedule
- **Recipes Store** - Local and saved MealDB recipes
- **Commerce Store** - Products, inventory, orders, customers, settings
- **UI Store** - Theme, open apps, dock state, preferences

Example usage:

```tsx
import { useUser, useLogout, useOpenApps } from "@/lib/stores";

function MyComponent() {
  const user = useUser();
  const logout = useLogout();
  const openApps = useOpenApps();

  return (
    <div>
      <p>Welcome, {user?.name}</p>
      <p>Open apps: {openApps.length}</p>
      <button onClick={logout}>Sign Out</button>
    </div>
  );
}
```

## Mobile Support

DailyOS is designed mobile-first with:

- Responsive layouts that adapt from mobile to desktop
- Bottom navigation bar on mobile devices
- Touch-friendly UI elements with appropriate tap targets
- Safe area support for notched devices (iPhone X+)
- PWA installation support for home screen access

## Desktop Experience

On larger screens, DailyOS provides:

- macOS-style dock with app icons and open indicators
- Window controls (close, minimize, expand) in sub-app headers
- App minimize/restore animations
- Floating calculator widget

## External APIs

### TheMealDB

Mealflow integrates with [TheMealDB](https://www.themealdb.com/) for:
- Recipe search
- Category browsing
- Random recipe discovery
- Save external recipes locally

## Deployment

### Deploy on Vercel

The easiest way to deploy DailyOS is using [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/dailyos)

### Manual Deployment

1. Build the application:

```bash
bun build
```

2. Start the production server:

```bash
bun start
```

Or deploy the `.next` folder to any Node.js hosting platform.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Roadmap

- [ ] Calendar integration
- [ ] Task management system
- [ ] Notes with rich text editor
- [ ] Invoice generation and PDF export
- [ ] Data sync across devices
- [ ] Budget alerts and notifications
- [ ] Recipe import from URLs
- [x] Grocery list generation from meal plans
- [x] Commerce/POS system
- [x] Inventory management
- [x] Customer management

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Next.js](https://nextjs.org/) - The React Framework
- [HeroUI](https://heroui.com/) - Beautiful UI components
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS
- [Zustand](https://zustand-demo.pmnd.rs/) - Lightweight state management
- [Recharts](https://recharts.org/) - Composable charting library
- [Lucide](https://lucide.dev/) - Beautiful icons
- [TheMealDB](https://www.themealdb.com/) - Recipe database API
