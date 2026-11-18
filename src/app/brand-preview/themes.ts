// Fase 0 · Las 3 direcciones visuales candidatas.
// Esto NO es todavía el design system: cuando Oier elija una dirección,
// la convertiremos en tokens definitivos (CSS variables + Tailwind) en /docs/brand.md.

export type ModeTokens = {
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  text: string;
  muted: string;
  primary: string; // relleno de botones, gráficas
  primaryFg: string; // texto sobre primary
  primaryInk: string; // primary usado como color de texto (con contraste suficiente)
  accent: string;
  accentFg: string;
  success: string;
  warning: string;
  danger: string;
};

export type Direction = {
  id: "terminal" | "estudio" | "premium";
  label: string;
  tagline: string;
  defaultMode: "dark" | "light";
  modes: { dark: ModeTokens; light: ModeTokens };
  fonts: { display: string; body: string; mono: string };
  fontNames: { display: string; body: string; mono: string };
  radius: { lg: string; md: string; sm: string; pill: string };
  icons: { set: string; stroke: number; note: string };
  voice: { summary: string; samples: string[] };
  audience: string;
  logoStyle: "cursor" | "dot" | "orbit";
};

export const directions: Direction[] = [
  {
    id: "terminal",
    label: "A · Terminal de crecimiento",
    tagline: "Oscuro, preciso y orientado a datos. Se siente como una herramienta de pro.",
    defaultMode: "dark",
    modes: {
      dark: {
        bg: "#0A0C08",
        surface: "#12150E",
        surface2: "#1A1E14",
        border: "#272C1F",
        text: "#E9EFE0",
        muted: "#8A9480",
        primary: "#C6F432",
        primaryFg: "#0A0C08",
        primaryInk: "#C6F432",
        accent: "#FFB547",
        accentFg: "#0A0C08",
        success: "#7CF29A",
        warning: "#FFB547",
        danger: "#FF5C5C",
      },
      light: {
        bg: "#F3F5EC",
        surface: "#FFFFFF",
        surface2: "#E9EDDF",
        border: "#D5DBC7",
        text: "#11140C",
        muted: "#5D6654",
        primary: "#C6F432",
        primaryFg: "#0A0C08",
        primaryInk: "#4A7300",
        accent: "#C77700",
        accentFg: "#FFFFFF",
        success: "#1E8A4C",
        warning: "#B56A00",
        danger: "#D63B3B",
      },
    },
    fonts: {
      display: "var(--font-space-grotesk)",
      body: "var(--font-space-grotesk)",
      mono: "var(--font-jetbrains-mono)",
    },
    fontNames: { display: "Space Grotesk", body: "Space Grotesk", mono: "JetBrains Mono" },
    radius: { lg: "6px", md: "4px", sm: "2px", pill: "4px" },
    icons: {
      set: "Lucide",
      stroke: 1.5,
      note: "Lineales finos (1.5 px), esquinas rectas, sin relleno. Etiquetas en mayúsculas mono.",
    },
    voice: {
      summary: "Directo, técnico, con números. Frases cortas. Cero relleno.",
      samples: [
        "+38 % de views esta semana. Tu mejor hora: 19:00.",
        "3 posts listos. Aprueba y salen a su hora.",
        "Outlier detectado: 6,2× la media del canal.",
      ],
    },
    audience:
      "Dropshippers, growth hackers y creadores que viven en las métricas. Muy fuerte en el buscador de productos y la competencia.",
    logoStyle: "cursor",
  },
  {
    id: "estudio",
    label: "B · Estudio creativo",
    tagline: "Cálido, cercano y lleno de personalidad. Da ganas de crear.",
    defaultMode: "light",
    modes: {
      light: {
        bg: "#FBF6EE",
        surface: "#FFFFFF",
        surface2: "#F4ECDF",
        border: "#E8DCC8",
        text: "#1F1633",
        muted: "#6E6680",
        primary: "#6C47FF",
        primaryFg: "#FFFFFF",
        primaryInk: "#5B36F0",
        accent: "#FF6B57",
        accentFg: "#FFFFFF",
        success: "#1F9D6B",
        warning: "#D99100",
        danger: "#E5484D",
      },
      dark: {
        bg: "#17111F",
        surface: "#211A2C",
        surface2: "#2B2338",
        border: "#3A3049",
        text: "#F7F1E8",
        muted: "#A99FB8",
        primary: "#8B6CFF",
        primaryFg: "#FFFFFF",
        primaryInk: "#A891FF",
        accent: "#FF7A66",
        accentFg: "#1F1633",
        success: "#4CC38A",
        warning: "#F5B940",
        danger: "#FF6369",
      },
    },
    fonts: {
      display: "var(--font-bricolage)",
      body: "var(--font-dm-sans)",
      mono: "var(--font-dm-mono)",
    },
    fontNames: { display: "Bricolage Grotesque", body: "DM Sans", mono: "DM Mono" },
    radius: { lg: "22px", md: "14px", sm: "10px", pill: "999px" },
    icons: {
      set: "Phosphor (duotone)",
      stroke: 2,
      note: "Redondeados, trazo 2 px, sobre baldosas de color suave. Mucho aire.",
    },
    voice: {
      summary: "Cercano, optimista, de tú a tú. Celebra los logros del usuario.",
      samples: [
        "¡Tu semana ha ido genial! 🎉 +38 % de views.",
        "Tienes 3 ideas listas para brillar. ¿Les damos el visto bueno?",
        "Este vídeo está volando. Vamos a por otro igual.",
      ],
    },
    audience:
      "Creadores de contenido, marcas personales y pequeñas marcas DTC. Ideal para el Estudio de IA y el brand kit.",
    logoStyle: "dot",
  },
  {
    id: "premium",
    label: "C · Premium oscuro",
    tagline: "Elegante, tecnológico y aspiracional. Transmite escala y confianza.",
    defaultMode: "dark",
    modes: {
      dark: {
        bg: "#060A1A",
        surface: "#0D1330",
        surface2: "#131B3F",
        border: "#1F2A55",
        text: "#EAF0FF",
        muted: "#8890B5",
        primary: "#22D3EE",
        primaryFg: "#04121A",
        primaryInk: "#22D3EE",
        accent: "#E040FB",
        accentFg: "#FFFFFF",
        success: "#34D399",
        warning: "#FBBF24",
        danger: "#F43F5E",
      },
      light: {
        bg: "#F5F7FD",
        surface: "#FFFFFF",
        surface2: "#ECEFFA",
        border: "#D8DEF0",
        text: "#0A1030",
        muted: "#596184",
        primary: "#0891B2",
        primaryFg: "#FFFFFF",
        primaryInk: "#0E7490",
        accent: "#B21FCB",
        accentFg: "#FFFFFF",
        success: "#059669",
        warning: "#B45309",
        danger: "#E11D48",
      },
    },
    fonts: {
      display: "var(--font-sora)",
      body: "var(--font-inter)",
      mono: "var(--font-jetbrains-mono)",
    },
    fontNames: { display: "Sora", body: "Inter", mono: "JetBrains Mono" },
    radius: { lg: "14px", md: "10px", sm: "6px", pill: "999px" },
    icons: {
      set: "Lucide / Tabler",
      stroke: 1.75,
      note: "Lineales 1.75 px con acentos en degradado cian→magenta en estados activos.",
    },
    voice: {
      summary: "Profesional, seguro y conciso. Habla de resultados y de escala.",
      samples: [
        "Rendimiento semanal: +38 % de alcance en 4 cuentas.",
        "3 publicaciones esperan tu aprobación.",
        "Oportunidad detectada en tu nicho. Revísala.",
      ],
    },
    audience:
      "Agencias, marcas medianas y equipos. Encaja con informes de marca blanca, equipos y roles.",
    logoStyle: "orbit",
  },
];

export const candidateNames = [
  "Ondo",
  "Hazi",
  "Kreo",
  "Ekin",
  "Hivo",
  "Stakk",
  "Pulsr",
  "Viralab",
  "Zinta",
  "Brio",
] as const;
