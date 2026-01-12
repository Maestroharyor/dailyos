// App configuration from environment variables

export const config = {
  appName: process.env.NEXT_PUBLIC_APP_NAME || "DailyOS",
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  fromEmail: process.env.FROM_EMAIL || "notifications@dailyos.com",
} as const;
