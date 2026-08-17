import { compare, hash } from "bcryptjs";
import { Prisma } from "@prisma/client";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { authEmailLookupCandidates, normalizeAuthEmail, normalizeAuthPassword } from "@/lib/auth-input";
import { prisma } from "@/lib/prisma";

function defaultNameFromEmail(email: string) {
  const localPart = email.split("@")[0]?.replace(/[._-]+/g, " ").trim();
  return localPart || email;
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
        let user = await prisma.user.findFirst({
          where: {
            OR: emailCandidates.map((candidate) => ({
              email: { equals: candidate, mode: "insensitive" as const }
            }))
          }
        });
        if (!user) {
          try {
            user = await prisma.user.create({
              data: {
                email,
                name: defaultNameFromEmail(email),
                passwordHash: await hash(password, 10)
              }
            });
          } catch (error) {
            if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return null;
            user = await prisma.user.findFirst({
              where: {
                OR: emailCandidates.map((candidate) => ({
                  email: { equals: candidate, mode: "insensitive" as const }
                }))
              }
            });
            if (!user) return null;
          }
        }
        const ok = await compare(password, user.passwordHash);
        if (!ok) return null;
        return { id: user.id, name: user.name, email: user.email };
      }
    })
  ],
  callbacks: {
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
