// Fabricated tile details: dimensions in metres, shared by scene and checks.
import { STAGE_INDEX } from "./stages";

export function concealedDetailState(stage: number, focus: number | null, finished: boolean, accessoryDetail: number) {
  return {
    cabinetOpen: (stage >= STAGE_INDEX.cabinet + 0.2 && stage < STAGE_INDEX.cabinet + 0.88) || (finished && focus === STAGE_INDEX.cabinet),
    accessoriesOpen: (stage >= STAGE_INDEX.accessories + 0.2 && stage < STAGE_INDEX.accessories + 0.85) || (finished && (focus === STAGE_INDEX.accessories || focus === accessoryDetail)),
    decorationsVisible: stage >= STAGE_INDEX.handover + 0.28,
  };
}

export const DETAIL_DIMENSIONS = {
  roomDepth: 4.0,
  wcZ: 2.3,
  accessoriesZ: 1.9,
  ventZ: 0.6,
  ventTile: 0.1,
  ventGap: 0.01,
  brushBottom: 0.16,
  brushTop: 0.66,
  paperBottom: 0.66,
  paperTop: 0.94,
  hatchWidth: 0.3,
  hatchHeight: 0.3,
} as const;

export const FINISH_DETAILS = [
  { title: "Metrové umyvadlo se skříňkou", text: "Umyvadlo dlouhé 1 m vyrobíme ze stejného obkladu, s kamenickými rohy a spádem ke skrytému odtoku. Pod ním je obložená skříňka se dvěma šuplíky, které se při otevření samy rozsvítí. Stejná kresba pokračuje i na dávkovači mýdla.", pos: [0.78, 1.3, 3.5], camera: [2.5, 1.5, 4.6], target: [0.5, 0.6, 3.35] },
  { title: "Skrytý papír a WC štětka", text: "Napravo od WC je dole skříňka na štětku, přímo nad ní zásobník papíru. Dvířka jsou z obkladu bez úchytek a nepřekážejí umyvadlu.", pos: [0.26, 0.98, 1.7], camera: [1.45, 1.12, 2.75], target: [0.24, 0.64, 1.9] },
  { title: "Skrytý odtah vlhkosti", text: "U sprchy těsně pod stropem je čtverec obkladu 10 × 10 cm. Vzduch odchází centimetrovou mezerou po jeho obvodu, bez viditelné mřížky.", pos: [0.018, 2.4, 0.3], camera: [1.3, 2.4, 1.65], target: [0.01, 2.4, 0.6] },
  { title: "Revizní dvířka pod vanou", text: "Dvířka v čele vany navazují kresbou i spárami na okolní obklad. Umožňují přístup k sifonu bez rozbíjení obkladu.", pos: [2.15, 0.2, 0.82], camera: [3.2, 1.2, 2.4], target: [2.25, 0.28, 0.82] },
  { title: "Obvod niky: Jolly nebo lišta", text: "Po celém obvodu sprchové i WC niky porovnáme ukončovací lištu s kamenickým rohem. Jolly tvoří dva řezy pod 45° spojené jemnou epoxidovou spárou v barvě obkladu.", pos: [1.25, 1.85, 0.02], camera: [1.35, 1.8, 1.4], target: [0.72, 1.38, 0] },
  { title: "Polička z obkladu · Jolly", text: "Poličku ve sprchové nice vyrobíme ze stejného obkladu. Horní deska i čelo mají kamenický řez pod 45° a navazující kresbu, bez kovové lišty.", pos: [0.72, 1.3, 0.014], camera: [1.05, 1.48, 0.85], target: [0.7, 1.3, -0.02] },
  { title: "Skrytý odtok umyvadla", text: "Na zadní straně dna je vyjímatelný proužek obkladu. Voda steče pod něj do skrytého žlabu, takže výpusť není vidět. Při čištění proužek vyjmete a výpusť je hned přístupná.", pos: [0.31, 0.55, 3.7], camera: [0.5, 1.5, 3.36], target: [0.32, 0.72, 3.35] },
] as const;
