import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./db";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 6,
    maxPasswordLength: 128,
  },

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await resend.emails.send({
        from: "DailyOS <noreply@dailyos.app>",
        to: user.email,
        subject: "Verify your email for DailyOS",
        html: `
          <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            <div style="text-align: center; margin-bottom: 30px;">
              <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #1e293b, #334155); border-radius: 12px; display: inline-flex; align-items: center; justify-content: center;">
                <span style="color: white; font-weight: bold; font-size: 24px;">D</span>
              </div>
              <h1 style="margin-top: 16px; color: #1e293b;">DailyOS</h1>
            </div>
            <h2 style="color: #1e293b; margin-bottom: 16px;">Verify your email address</h2>
            <p style="color: #64748b; line-height: 1.6; margin-bottom: 24px;">
              Thanks for signing up for DailyOS! Please verify your email address by clicking the button below.
            </p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${url}" style="background: #3b82f6; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
                Verify Email
              </a>
            </div>
            <p style="color: #94a3b8; font-size: 14px;">
              If you didn't create an account with DailyOS, you can safely ignore this email.
            </p>
          </div>
        `,
      });
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // Update session every day
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes cache
    },
  },

  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google"],
    },
  },

  // Hooks to create default Space on signup
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // Generate unique slug for space
          const baseSlug = user.name
            ? user.name.toLowerCase().replace(/\s+/g, "-")
            : "my";
          const slug = `${baseSlug}-space-${Date.now().toString(36)}`;

          // Create default space for user
          const space = await prisma.space.create({
            data: {
              name: `${user.name || "My"}'s Space`,
              slug,
              mode: "commerce",
              ownerId: user.id,
              members: {
                create: {
                  userId: user.id,
                  role: "owner",
                  status: "active",
                },
              },
            },
          });

          // Log the space creation
          await prisma.auditLog.create({
            data: {
              userId: user.id,
              spaceId: space.id,
              action: "space_created",
              resource: "space",
              resourceId: space.id,
              details: `Default space created on signup: ${space.name}`,
            },
          });
        },
      },
    },
  },

  rateLimit: {
    window: 60,
    max: 10,
  },
});

export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
