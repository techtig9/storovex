import type {Config} from "tailwindcss";

/**
 * Storovex design tokens.
 *
 * Colours are CSS custom properties rather than literals so a single `data-theme`
 * attribute reskins the whole app. Tailwind supplies the scale, states and
 * breakpoints that React inline styles structurally cannot express — the previous
 * frontend styled everything with `style={{}}`, which cannot represent :hover,
 * :focus, :disabled or a media query at all.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "var(--brand)",
          hover: "var(--brand-hover)",
          soft: "var(--brand-soft)",
          contrast: "var(--brand-contrast)",
        },
        ai: {DEFAULT: "var(--ai)", soft: "var(--ai-soft)"},
        bg: "var(--bg)",
        surface: {DEFAULT: "var(--surface)", raised: "var(--surface-raised)"},
        line: {DEFAULT: "var(--line)", strong: "var(--line-strong)"},
        ink: {
          DEFAULT: "var(--ink)",
          muted: "var(--ink-muted)",
          subtle: "var(--ink-subtle)",
          inverse: "var(--ink-inverse)",
        },
        success: {DEFAULT: "var(--success)", soft: "var(--success-soft)"},
        warning: {DEFAULT: "var(--warning)", soft: "var(--warning-soft)"},
        danger: {DEFAULT: "var(--danger)", soft: "var(--danger-soft)"},
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      // The spec's 8px-based scale. 18/20 are the odd ones out and exist because
      // dense table rows and control heights need them.
      spacing: {
        "4.5": "18px", "5.5": "22px",
        "18": "72px", "22": "88px", "30": "120px", "32": "128px",
      },
      borderRadius: {
        sm: "6px", DEFAULT: "8px", md: "10px", lg: "12px",
        xl: "16px", "2xl": "20px", "3xl": "24px",
      },
      fontSize: {
        "2xs": ["11px", {lineHeight: "16px"}],
        xs: ["12px", {lineHeight: "18px"}],
        sm: ["13px", {lineHeight: "20px"}],
        base: ["14px", {lineHeight: "22px"}],
        md: ["16px", {lineHeight: "26px"}],
        lg: ["18px", {lineHeight: "28px"}],
        xl: ["20px", {lineHeight: "30px"}],
        "2xl": ["24px", {lineHeight: "32px"}],
        "3xl": ["30px", {lineHeight: "38px"}],
        "4xl": ["36px", {lineHeight: "42px"}],
        "5xl": ["44px", {lineHeight: "50px"}],
        "6xl": ["56px", {lineHeight: "60px"}],
        "7xl": ["72px", {lineHeight: "76px"}],
      },
      transitionDuration: {
        fast: "150ms", normal: "220ms", emphasis: "360ms", marketing: "560ms",
      },
      transitionTimingFunction: {
        out: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      boxShadow: {
        card: "0 1px 2px rgb(0 0 0 / 0.04), 0 1px 3px rgb(0 0 0 / 0.06)",
        raised: "0 4px 12px rgb(0 0 0 / 0.08), 0 1px 3px rgb(0 0 0 / 0.06)",
        overlay: "0 16px 48px rgb(0 0 0 / 0.24)",
        focus: "0 0 0 3px var(--focus-ring)",
      },
      keyframes: {
        "fade-up": {
          from: {opacity: "0", transform: "translateY(8px)"},
          to: {opacity: "1", transform: "none"},
        },
        "fade-in": {from: {opacity: "0"}, to: {opacity: "1"}},
        "scale-in": {
          from: {opacity: "0", transform: "scale(0.97)"},
          to: {opacity: "1", transform: "none"},
        },
        "slide-in-right": {
          from: {transform: "translateX(100%)"},
          to: {transform: "none"},
        },
        shimmer: {from: {backgroundPosition: "200% 0"}, to: {backgroundPosition: "-200% 0"}},
      },
      animation: {
        "fade-up": "fade-up 360ms cubic-bezier(0.16,1,0.3,1) both",
        "fade-in": "fade-in 220ms ease-out both",
        "scale-in": "scale-in 180ms cubic-bezier(0.16,1,0.3,1) both",
        "slide-in-right": "slide-in-right 220ms cubic-bezier(0.16,1,0.3,1) both",
        shimmer: "shimmer 1.6s linear infinite",
      },
    },
  },
  plugins: [],
};
export default config;
