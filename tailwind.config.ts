import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontSize: {
        xs: ["0.875rem", { lineHeight: "1.4rem" }],
        sm: ["1rem", { lineHeight: "1.6rem" }],
        base: ["1.0625rem", { lineHeight: "1.75rem" }]
      },
      fontFamily: {
        sans: ["var(--font-khmer)", "Inter", "system-ui", "sans-serif"]
      },
      colors: {
        ink: "#13231F",
        leaf: "#0F8A70",
        saffron: "#E59A23",
        sky: "#1688B8"
      },
      boxShadow: {
        soft: "0 18px 55px rgba(15, 138, 112, 0.12)"
      }
    }
  },
  plugins: []
};

export default config;
