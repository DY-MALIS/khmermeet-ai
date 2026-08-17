import { compare } from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";

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
        const email = credentials.email.trim().toLowerCase();
        const password = credentials.password.trim();
        if (!email || !password) return null;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;
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
