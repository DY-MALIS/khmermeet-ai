import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-khmer)", "Inter", "system-ui", "sans-serif"]
      },
      colors: {
        ink: "#17202A",
        leaf: "#18745F",
        saffron: "#D8912A",
        sky: "#2E86AB"
      },
      boxShadow: {
        soft: "0 18px 50px rgba(23, 32, 42, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
