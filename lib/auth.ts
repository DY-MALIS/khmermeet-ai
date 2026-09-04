import { compare } from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { authEmailLookupCandidates, normalizeAuthEmail, normalizeAuthPassword } from "@/lib/auth-input";
import { prisma } from "@/lib/prisma";

// No database adapter is configured (session strategy is jwt, not
// database) - Google sign-in never automatically creates or links a User
// row on its own. Done manually in the signIn callback below instead: find
// an existing account by email (so someone who already registered with a
// password can also sign in with the same Google account), or create one
// with no password. Real credential value only when both are set; a
// half-configured pair (one env var present, the other missing/blank) is
// almost certainly a copy-paste mistake, not an intentional "provider
// half-enabled" state, so treat it as absent rather than letting NextAuth
// fail confusingly deep in the OAuth handshake.
const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
const googleLoginEnabled = Boolean(googleClientId && googleClientSecret);

// Read by the (auth) pages (server components) to decide whether to render
// the Google button at all - env vars aren't available in the client
// components that own the actual form markup.
export function isGoogleLoginEnabled() {
  return googleLoginEnabled;
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  // Without an explicit error page, a failed non-JS credentials sign-in
  // redirects to NextAuth's own generic /api/auth/error page instead of
  // back to our /login form - confirmed live, the ?error= query param the
  // login page reads never actually reached it because of this gap.
  pages: { signIn: "/login", error: "/login" },
  providers: [
    CredentialsProvider({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) return null;
        // registerUser() trims both fields before hashing (see lib/actions.ts
        // formString) - login must normalize the same way, or a password
        // with an accidental leading/trailing space (autofill, a password
        // manager, copy-paste from a chat app) gets hashed without it at
        // signup but compared with it at login, permanently locking out an
        // account with the "correct" password.
        const email = normalizeAuthEmail(credentials.email);
        const password = normalizeAuthPassword(credentials.password);
        if (!email || !password) return null;
        const emailCandidates = authEmailLookupCandidates(credentials.email);
        const user = await prisma.user.findFirst({
          where: {
            OR: emailCandidates.map((candidate) => ({
              email: { equals: candidate, mode: "insensitive" as const }
            }))
          }
        });
        if (!user) return null;
        // A Google-only account has no password to compare against - fail
        // the same way a wrong password would, not a crash.
        if (!user.passwordHash) return null;
        const ok = await compare(password, user.passwordHash);
        if (!ok) return null;
        return { id: user.id, name: user.name, email: user.email };
      }
    }),
    ...(googleLoginEnabled
      ? [
          GoogleProvider({
            clientId: googleClientId!,
            clientSecret: googleClientSecret!
          })
        ]
      : [])
  ],
  callbacks: {
    // Only Google reaches this callback via the OAuth branch - the
    // Credentials provider already resolved (or rejected) the user inside
    // authorize() above, so `account.provider === "credentials"` returning
    // true here is just confirming what authorize() already decided.
    async signIn({ user, account }) {
      if (account?.provider !== "google") return true;
      const email = normalizeAuthEmail(user.email ?? "");
      if (!email) return false;
      // Find-or-create by email: lets someone who already registered with
      // a password sign in with the same Google account too, instead of
      // ending up with two separate accounts for one person.
      const existing = await prisma.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" } }
      });
      const dbUser =
        existing ??
        (await prisma.user.create({
          data: { name: user.name?.trim() || email, email, passwordHash: null }
        }));
      // No database adapter is configured, so nothing else populates
      // `user.id` with our own row's id for a fresh OAuth sign-in - the jwt
      // callback below only sees whatever this callback leaves on `user`.
      user.id = dbUser.id;
      return true;
    },
    async jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    }
  }
};
