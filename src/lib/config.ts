// App configuration from environment variables

export const config = {
  appName: process.env.NEXT_PUBLIC_APP_NAME || "DailyOS",
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  fromEmail: process.env.EMAIL_ADDRESS || "notifications@dailyos.com",
  /**
   * The public marketing site, which is where "Powered by DailyOS" in a
   * merchant's email should point. Deliberately not appUrl: that is the
   * dashboard, and a customer who lands there has nothing to log in with.
   */
  marketingUrl:
    process.env.NEXT_PUBLIC_DAILYOS_MARKETING_URL || "https://dailyos.foverotechnologies.com",
} as const;
