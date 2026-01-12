import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./db";
import { sendVerificationOTP } from "./otp";

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
    sendVerificationEmail: async ({ user }) => {
      // Send OTP email instead of magic link
      await sendVerificationOTP(user.email, user.name);
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
