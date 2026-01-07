# DailyOS

A unified personal productivity system built with Next.js 16, featuring finance tracking, meal planning, and more. DailyOS brings together essential life management tools in one beautiful, mobile-first progressive web app.

## Features

### Core Apps

- **Fintrack** - Personal finance tracker for managing expenses, income, and budgets
- **Mealflow** - Meal planning and recipe management system
- **Invoices** - Invoice management (Coming Soon)

### Additional Features

- **Calendar** - Schedule and event management (Coming Soon)
- **Tasks** - Todo list and task management (Coming Soon)
- **Notes** - Quick notes and documentation (Coming Soon)

### Platform Features

- Progressive Web App (PWA) - Install on any device
- Dark/Light theme support with system preference detection
- Mobile-first responsive design with bottom navigation
- Offline-capable with service worker
- Cross-platform authentication system
- Persistent state management with Zustand

## Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) with App Router
- **UI Components**: [HeroUI](https://heroui.com/) (formerly NextUI)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
- **State Management**: [Zustand](https://zustand-demo.pmnd.rs/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Animations**: [Framer Motion](https://www.framer.com/motion/)
- **Theming**: [next-themes](https://github.com/pacocoursey/next-themes)
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
│   │   ├── finance/           # Fintrack app
│   │   ├── home/              # Dashboard/home
│   │   ├── invoices/          # Invoices app
│   │   ├── mealflow/          # Mealflow app
│   │   ├── settings/          # Settings page
│   │   ├── globals.css        # Global styles
│   │   ├── layout.tsx         # Root layout
│   │   └── page.tsx           # Landing page
│   │
│   ├── components/            # React components
│   │   ├── shared/            # Shared components (navbar, bottom-nav)
│   │   ├── auth-guard.tsx     # Authentication guard
│   │   ├── providers.tsx      # App providers (theme, UI)
│   │   └── service-worker-register.tsx
│   │
│   └── lib/                   # Utilities and stores
│       ├── stores/            # Zustand stores
│       │   ├── auth-store.ts  # Authentication state
│       │   ├── finance-store.ts
│       │   ├── meals-store.ts
│       │   └── ui-store.ts
│       └── utils.ts           # Utility functions
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

## Configuration

### Theme Configuration

The app supports light, dark, and system themes. Theme preference is managed through `next-themes` and persists across sessions.

To modify the default theme, update `src/components/providers.tsx`:

```tsx
<NextThemesProvider
  attribute="class"
  defaultTheme="light"  // "light" | "dark" | "system"
  enableSystem
/>
```

### PWA Configuration

PWA settings are defined in `public/manifest.webmanifest`. The service worker (`public/sw.js`) handles offline caching.

### HeroUI Configuration

HeroUI theming is configured in `hero.ts` and imported in `globals.css`:

```css
@plugin '../../hero.ts';
@source '../../node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}';
```

## State Management

DailyOS uses Zustand for state management with persistence middleware for key stores:

- **Auth Store** - User authentication state (persisted to localStorage)
- **Finance Store** - Financial data and transactions
- **Meals Store** - Meal plans and recipes
- **UI Store** - UI preferences and temporary state

Example usage:

```tsx
import { useUser, useLogout } from "@/lib/stores";

function MyComponent() {
  const user = useUser();
  const logout = useLogout();

  return (
    <div>
      <p>Welcome, {user?.name}</p>
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
- [ ] Grocery list generation from meal plans

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Next.js](https://nextjs.org/) - The React Framework
- [HeroUI](https://heroui.com/) - Beautiful UI components
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS
- [Zustand](https://zustand-demo.pmnd.rs/) - Lightweight state management
- [Lucide](https://lucide.dev/) - Beautiful icons
