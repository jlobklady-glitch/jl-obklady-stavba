// Shared, three.js-free data for the 3D bathroom build: steps, labels, options and timing.

export type GroutType = "cement" | "epoxy";
export type WaterproofType = "A" | "B";
export type CornerType = "trim" | "jolly";
export type ButtonType = "narrow" | "wide" | "round";
export type NicheType = "standard" | "large" | "full";

export interface Stage {
  short: string;
  title: string;
  text: string;
  details: string[];
  /** Seconds of playback for this step. */
  seconds: number;
}

export const STAGES: Stage[] = [
  {
    short: "Podklad",
    title: "Příprava podkladu",
    text: "Laserem a vodováhou zkontrolujeme rovinnost stěn i podlahy, nerovnosti přebrousíme a celý podklad napenetrujeme.",
    details: ["Kontrola rovinnosti", "Přebroušení", "Penetrace"],
    seconds: 7,
  },
  {
    short: "Spád a žlab",
    title: "Betonování sprchového koutu",
    text: "Osadíme odtokový žlab přesně do výšky budoucí dlažby a sprchový kout vybetonujeme se spádem k odtoku. Voda nikde nezůstane stát.",
    details: ["Žlab do roviny dlažby", "Beton stažený latí", "Spád 1,5–2 % ke žlabu"],
    seconds: 6.5,
  },
  {
    short: "Pásky",
    title: "Hydroizolace: rohy a prostupy",
    text: "Nejslabší místa zesílíme jako první. Do rohů a styků stěny s podlahou vlepíme těsnicí pásky, na vývody manžety a kolem žlabu límec.",
    details: ["Pásky v rozích", "Manžety na prostupy", "Límec kolem žlabu"],
    seconds: 6.5,
  },
  {
    short: "Hydroizolace",
    title: "Hydroizolace podlahy a stěn",
    text: "Podle koupelny volíme ze dvou systémů. Oba s pásky v rozích tvoří souvislou vodotěsnou vrstvu.",
    details: [],
    seconds: 8,
  },
  {
    short: "Dlažba",
    title: "Pokládka dlažby metodou butterfly",
    text: "Lepidlo naneseme zubovou stěrkou na podklad i na rub dlaždice. Velký formát tak leží v plném lůžku, bez dutin.",
    details: ["Lepidlo na podklad", "Lepidlo na dlaždici", "Spáry navazují na stěny"],
    seconds: 6.5,
  },
  {
    short: "Obklad",
    title: "Obklad velkoformátem",
    text: "Velkoformátové desky lepíme stejnou metodou. V ukázce jsou 120 × 60 cm, podle výběru zákazníka až do formátu 160 × 320 cm. Kresba pokračuje do niky s poličkami z obkladu i na dvířka skryté skříňky nad WC.",
    details: [],
    seconds: 7.5,
  },
  {
    short: "Rohy",
    title: "Roh předstěny: lišta, nebo Jolly",
    text: "Vnější roh můžeme ukončit lištou, nebo ho seříznout pod 45° jako kamenický Jolly roh. Spáru pak vyplníme epoxidem v barvě obkladu.",
    details: [],
    seconds: 10,
  },
  {
    short: "Spárování",
    title: "Spárování",
    text: "Spáry podle spárořezu (v ukázce 1,5 mm) vyplníme gumovým hladítkem. Vyberte si cementovou spárovačku, nebo epoxidovou, která nenasákává a odolá skvrnám.",
    details: [],
    seconds: 6.5,
  },
  {
    short: "Umytí",
    title: "Finální umytí",
    text: "Zbytky spárovačky smyjeme, obklad vyleštíme a kouty vytmelíme sanitárním silikonem. Povrch dostane svůj lesk.",
    details: ["Odstranění závoje", "Silikon v koutech", "Kontrola každé spáry"],
    seconds: 6.5,
  },
  {
    short: "Tlačítko WC",
    title: "Tlačítko WC z obkladu",
    text: "Z obkladu vyřežeme jen samotná tlačítka, ne celý modul. Kresba kamene na nich plynule pokračuje. Hranatá úzká, široká, nebo kulatá prořezaná do sebe.",
    details: [],
    seconds: 13,
  },
  {
    short: "Předání",
    title: "Předání klientovi",
    text: "Osadíme sprchu, zástěnu, vanu a WC a koupelnu předáme se předávacím protokolem. Teď si ji můžete prohlédnout sami.",
    details: ["Předávací protokol", "Čistá koupelna"],
    seconds: 7,
  },
];

export const STAGE_COUNT = STAGES.length;
export const TOTAL_SECONDS = STAGES.reduce((a, s) => a + s.seconds, 0);

/** Start of each stage as a fraction of the whole playback (length STAGE_COUNT + 1). */
export const STAGE_STARTS: number[] = (() => {
  const out = [0];
  let acc = 0;
  for (const s of STAGES) {
    acc += s.seconds;
    out.push(acc / TOTAL_SECONDS);
  }
  return out;
})();

/** Playback fraction (0–1) → timeline in stage units (0–STAGE_COUNT). */
export function progressToStage(p: number): number {
  const x = Math.min(1, Math.max(0, p));
  for (let i = 0; i < STAGE_COUNT; i++) {
    const a = STAGE_STARTS[i]!;
    const b = STAGE_STARTS[i + 1]!;
    if (x < b || i === STAGE_COUNT - 1) return i + Math.min(1, (x - a) / (b - a));
  }
  return STAGE_COUNT;
}

/** Timeline in stage units → playback fraction. */
export function stageToProgress(s: number): number {
  const x = Math.min(STAGE_COUNT, Math.max(0, s));
  const i = Math.min(STAGE_COUNT - 1, Math.floor(x));
  const a = STAGE_STARTS[i]!;
  const b = STAGE_STARTS[i + 1]!;
  return a + (b - a) * (x - i);
}

export const STAGE_INDEX = {
  prep: 0,
  slope: 1,
  tapes: 2,
  waterproof: 3,
  floor: 4,
  walls: 5,
  corner: 6,
  grout: 7,
  clean: 8,
  button: 9,
  handover: 10,
} as const;

export const GROUT_INFO: Record<GroutType, { name: string; details: string[] }> = {
  cement: {
    name: "Cementová",
    details: ["Snadné zpracování", "Mnoho odstínů", "Doporučená impregnace"],
  },
  epoxy: {
    name: "Epoxidová",
    details: ["Nenasákavá", "Odolná skvrnám a chemii", "Ideální do sprchy"],
  },
};

export const WATERPROOF_INFO: Record<WaterproofType, { name: string; long: string; details: string[] }> = {
  A: {
    name: "A · Stěrková",
    long: "Stěny a niky natřeme stěrkovou hydroizolací ve dvou vrstvách, podlahu cementovou hydroizolací vyztuženou vláknem.",
    details: ["Stěny a niky: stěrka 2×", "Podlaha: cementová s vláknem", "Pásky zapracované uvnitř"],
  },
  B: {
    name: "B · Textilie",
    long: "Celou koupelnu, stěny i podlahu, pokryjeme netkanou vodotěsnou textilií v pásech širokých 1 m. Každý spoj se překrývá a přebandážuje.",
    details: ["Pásy šíře 1 m", "Přesahy přebandážované", "Stěny i podlaha"],
  },
};

export const CORNER_INFO: Record<CornerType, { name: string; long: string; details: string[] }> = {
  trim: {
    name: "Ukončovací lišta",
    long: "Lišta je rychlá a levnější, ale kovový pruh je vidět a při nárazu se může prohnout nebo odlepit.",
    details: ["Viditelný kovový pruh", "Hrana se může prohnout", "Levnější řešení"],
  },
  jolly: {
    name: "Jolly roh 45°",
    long: "Obě desky seřízneme pod 45° a spáru vyplníme epoxidem v barvě obkladu. Přechod je skoro neviditelný a roh je extrémně pevný.",
    details: ["Skoro neviditelný přechod", "Extrémně pevný roh", "Epoxid v barvě obkladu"],
  },
};

export const BUTTON_INFO: Record<ButtonType, { name: string }> = {
  narrow: { name: "Hranatá úzká" },
  wide: { name: "Hranatá široká" },
  round: { name: "Kulatá do sebe" },
};

export const NICHE_INFO: Record<NicheType, { name: string }> = {
  standard: { name: "Nika s poličkou" },
  large: { name: "Velká nika" },
  full: { name: "Od podlahy ke stropu" },
};

export const WALLS_DETAILS = ["Poličky z obkladu", "Podsvícená nika nad WC", "Skrytá skříňka v obkladu"];

export interface SceneLabel {
  id: string;
  text: string;
  /** Visible while the timeline (in stage units) is inside this window. */
  from: number;
  to: number;
  pos: [number, number, number];
}

// Positions are in room metres: x along the back wall, y up, z out from the back wall.
// Labels whose position depends on the chosen niche are re-positioned by the scene.
export const LABELS: SceneLabel[] = [
  { id: "laser", text: "Kontrola rovinnosti", from: 0.06, to: 0.36, pos: [1.6, 1.0, 0.01] },
  { id: "grind", text: "Přebroušení", from: 0.38, to: 0.6, pos: [2.0, 0.02, 1.9] },
  { id: "primer", text: "Penetrace", from: 0.62, to: 0.98, pos: [2.4, 1.6, 0.01] },
  { id: "drain", text: "Odtokový žlab", from: 1.2, to: 1.98, pos: [0.95, 0.02, 0.07] },
  { id: "slope", text: "Spád ke žlabu", from: 1.55, to: 1.98, pos: [0.7, 0.0, 0.85] },
  { id: "tape", text: "Těsnicí páska v rohu", from: 2.25, to: 2.98, pos: [0.03, 1.6, 0.03] },
  { id: "sleeve", text: "Manžeta na vývod", from: 2.6, to: 2.98, pos: [0.01, 1.05, 0.6] },
  { id: "wpWall", text: "Hydroizolace stěn", from: 3.25, to: 3.98, pos: [0.3, 1.95, 0.01] },
  { id: "wpFloor", text: "Hydroizolace podlahy", from: 3.12, to: 3.98, pos: [2.2, 0.01, 1.7] },
  { id: "bed", text: "Lepidlo na podklad", from: 4.08, to: 4.55, pos: [1.7, 0.01, 2.45] },
  { id: "butter", text: "Lepidlo na dlaždici", from: 4.18, to: 4.5, pos: [1.9, 0.42, 2.4] },
  { id: "format", text: "Velkoformát (ukázka 120 × 60 cm)", from: 5.3, to: 5.98, pos: [2.6, 1.9, 0.02] },
  { id: "niche", text: "Polička z obkladu", from: 5.62, to: 5.98, pos: [0.7, 1.3, 0.0] },
  { id: "cabinet", text: "Skrytá skříňka", from: 5.7, to: 5.98, pos: [0.26, 2.15, 2.32] },
  { id: "trim", text: "Ukončovací lišta", from: 6.12, to: 6.48, pos: [0.258, 1.5, 1.732] },
  { id: "jolly", text: "Jolly roh 45° + epoxid", from: 6.56, to: 6.98, pos: [0.258, 1.5, 1.732] },
  { id: "grout", text: "Spára 1,5 mm (podle spárořezu)", from: 7.3, to: 7.98, pos: [1.2, 0.9, 0.02] },
  { id: "silicone", text: "Silikon v koutech", from: 8.35, to: 8.98, pos: [0.02, 0.9, 0.02] },
  { id: "btn-narrow", text: "Hranatá úzká", from: 9.12, to: 9.36, pos: [0.258, 1.12, 2.3] },
  { id: "btn-wide", text: "Hranatá široká", from: 9.4, to: 9.64, pos: [0.258, 1.12, 2.3] },
  { id: "btn-round", text: "Kulatá, prořezaná do sebe", from: 9.68, to: 9.9, pos: [0.258, 1.12, 2.3] },
  { id: "tub", text: "Vana obložená obkladem", from: 10.4, to: 10.95, pos: [2.3, 0.3, 0.81] },
  { id: "wcniche", text: "Podsvícená nika nad WC", from: 10.45, to: 10.95, pos: [0.2, 1.45, 2.32] },
];

export interface Hotspot {
  stage: number;
  pos: [number, number, number];
}

/** Clickable points shown after the build is finished; each explains one step. */
export const HOTSPOTS: Hotspot[] = [
  { stage: 0, pos: [2.3, 1.7, 0.02] },
  { stage: 1, pos: [0.95, 0.03, 0.07] },
  { stage: 2, pos: [0.02, 1.85, 0.02] },
  { stage: 3, pos: [0.02, 1.4, 0.95] },
  { stage: 4, pos: [1.9, 0.02, 2.0] },
  { stage: 5, pos: [0.7, 1.3, 0.0] },
  { stage: 6, pos: [0.258, 0.75, 1.732] },
  { stage: 7, pos: [2.0, 1.2, 0.02] },
  { stage: 8, pos: [2.2, 0.6, 0.02] },
  { stage: 9, pos: [0.258, 1.02, 2.3] },
];
