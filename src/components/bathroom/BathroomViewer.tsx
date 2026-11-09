import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { Check, ChevronLeft, ChevronRight, Maximize2, Pause, Play, Rotate3d } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  BUTTON_INFO,
  CORNER_INFO,
  GROUT_INFO,
  HOTSPOTS,
  LABELS,
  NICHE_INFO,
  STAGES,
  STAGE_COUNT,
  WALLS_DETAILS,
  WATERPROOF_INFO,
  type ButtonType,
  type CornerType,
  type GroutType,
  type NicheType,
  type WaterproofType,
} from "./stages";
import type { BathroomScene } from "./scene";

export interface BathroomViewerHandle {
  seekStage: (index: number) => void;
}

interface Props {
  ref?: Ref<BathroomViewerHandle>;
  className?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Small segmented control used for the per-step options. */
function Seg<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | null;
  options: { id: T; name: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div
      className="mt-3 grid gap-px border border-joint bg-joint"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      role="radiogroup"
      aria-label={label}
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "px-2 py-2 text-[13px] font-semibold leading-tight transition-colors md:text-sm",
            value === o.id ? "bg-brass text-primary-foreground" : "bg-slab text-stone hover:text-foreground",
          )}
        >
          {o.name}
        </button>
      ))}
    </div>
  );
}

function Toggle({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "border px-2.5 py-1 text-xs font-medium transition-colors",
        on ? "border-brass bg-brass text-primary-foreground" : "border-joint bg-slab/70 text-stone hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

export function BathroomViewer({ ref, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<BathroomScene | null>(null);
  const fillRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const rangeRef = useRef<HTMLInputElement>(null);
  const labelRefs = useRef(new Map<string, HTMLElement>());
  const stageRef = useRef(0);

  const hotspotRefs = useRef(new Map<number, HTMLElement>());
  const progressRef = useRef(0);

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [stage, setStage] = useState(0);
  const [grout, setGrout] = useState<GroutType>("cement");
  const [waterproof, setWaterproof] = useState<WaterproofType>("A");
  const [corner, setCorner] = useState<CornerType | null>(null);
  const [button, setButton] = useState<ButtonType | null>(null);
  const [niche, setNiche] = useState<NicheType>("standard");
  const [nicheLight, setNicheLight] = useState(true);
  const [mood, setMood] = useState(false);
  const [shower, setShower] = useState(false);
  const [tub, setTub] = useState(false);
  const [freeView, setFreeView] = useState(false);
  const [info, setInfo] = useState<number | null>(null);

  // Keep the latest choices in a ref so a rebuilt scene (new niche) gets them re-applied.
  const optsRef = useRef({ grout, waterproof, corner, button, nicheLight, mood, shower, tub });
  optsRef.current = { grout, waterproof, corner, button, nicheLight, mood, shower, tub };

  useEffect(() => {
    let disposed = false;
    let api: BathroomScene | null = null;
    setReady(false);
    import("./scene")
      .then(({ createBathroomScene }) => {
        if (disposed || !containerRef.current || !canvasRef.current) return;
        try {
          api = createBathroomScene(
            containerRef.current,
            canvasRef.current,
            {
              onReady: () => setReady(true),
              onPlayingChange: setPlaying,
              onFrame: (p) => {
                progressRef.current = p;
                const s = p * STAGE_COUNT;
                const idx = Math.min(STAGE_COUNT - 1, Math.floor(s));
                if (idx !== stageRef.current) {
                  stageRef.current = idx;
                  setStage(idx);
                }
                fillRefs.current.forEach((el, i) => {
                  if (el) el.style.transform = `scaleX(${Math.min(1, Math.max(0, s - i))})`;
                });
                if (rangeRef.current && document.activeElement !== rangeRef.current)
                  rangeRef.current.value = String(Math.round(p * 1000));
              },
            },
            { niche },
          );
          const o = optsRef.current;
          api.setGrout(o.grout);
          api.setWaterproof(o.waterproof);
          api.setCorner(o.corner);
          api.setButton(o.button);
          api.setNicheLight(o.nicheLight);
          api.setMood(o.mood);
          api.setShower(o.shower);
          api.setTub(o.tub);
          api.setLabelElements(labelRefs.current);
          api.setHotspotElements(hotspotRefs.current);
          if (progressRef.current > 0) api.seek(progressRef.current);
          sceneRef.current = api;
        } catch (e) {
          console.error(e);
          setFailed(true);
        }
      })
      .catch((e) => {
        console.error(e);
        setFailed(true);
      });
    return () => {
      disposed = true;
      api?.dispose();
      sceneRef.current = null;
    };
  }, [niche]);

  const seekStage = useCallback((i: number) => {
    setInfo(null);
    setFreeView(false);
    sceneRef.current?.setFreeView(false);
    sceneRef.current?.seekStage(i);
  }, []);

  useImperativeHandle(ref, () => ({ seekStage }), [seekStage]);

  const chooseGrout = (g: GroutType) => {
    setGrout(g);
    sceneRef.current?.setGrout(g);
  };
  const chooseWaterproof = (w: WaterproofType) => {
    setWaterproof(w);
    sceneRef.current?.setWaterproof(w);
  };
  const chooseCorner = (c: CornerType) => {
    setCorner(c);
    sceneRef.current?.setCorner(c);
  };
  const chooseButton = (b: ButtonType) => {
    setButton(b);
    sceneRef.current?.setButton(b);
  };
  const flip = (cur: boolean, set: (v: boolean) => void, apply: (on: boolean) => void) => {
    set(!cur);
    apply(!cur);
  };
  const openInfo = (i: number) => {
    setInfo(i);
    setFreeView(false);
    sceneRef.current?.focus(i);
  };
  const closeInfo = () => {
    setInfo(null);
    sceneRef.current?.focus(null);
  };

  const toggleFree = () => {
    const next = !freeView;
    setFreeView(next);
    sceneRef.current?.setFreeView(next);
  };

  const fullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else el.requestFullscreen?.().catch(() => {});
  };

  const shown = info ?? stage;
  const current = STAGES[shown] ?? STAGES[0]!;
  const details =
    shown === 3
      ? WATERPROOF_INFO[waterproof].details
      : shown === 5
        ? WALLS_DETAILS
        : shown === 6
          ? corner
            ? CORNER_INFO[corner].details
            : current.details
          : shown === 7
            ? GROUT_INFO[grout].details
            : current.details;
  const longText =
    shown === 3
      ? WATERPROOF_INFO[waterproof].long
      : shown === 6 && corner
        ? CORNER_INFO[corner].long
        : current.text;
  const showOptions = info === null;
  const finished = stage === STAGE_COUNT - 1;

  return (
    <div
      ref={containerRef}
      className={cn("relative isolate h-full w-full overflow-hidden bg-background select-none", className)}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block h-full w-full"
        role="img"
        aria-label="Trojrozměrná animace stavby koupelny krok za krokem"
      />
      <div className="scene-shade pointer-events-none absolute inset-0" />

      {/* 3D-anchored labels, positioned by the scene every frame */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {LABELS.map((l) => (
          <div
            key={l.id}
            ref={(el) => {
              if (el) labelRefs.current.set(l.id, el);
              else labelRefs.current.delete(l.id);
            }}
            className="absolute left-0 top-0 will-change-transform"
            style={{ opacity: 0 }}
          >
            <div className="flex -translate-x-1/2 -translate-y-full flex-col items-center">
              <span className="glass-panel whitespace-nowrap px-2.5 py-1 text-[11px] font-medium tracking-wide text-foreground md:text-xs">
                {l.text}
              </span>
              <span className="h-5 w-px bg-brass md:h-7" />
              <span className="relative grid size-2.5 place-items-center">
                <span className="animate-ping-ring absolute inset-0 rounded-full border border-brass" />
                <span className="size-2 rounded-full bg-brass" />
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* heading */}
      <div className="pointer-events-none absolute left-4 top-4 md:left-8 md:top-7">
        <p className="kicker">3D postup stavby</p>
        <h2 className="mt-1.5 hidden max-w-[14ch] text-2xl font-semibold leading-none text-foreground md:block lg:text-4xl">
          Od podkladu po předání
        </h2>
      </div>

      {freeView && (
        <div className="glass-panel pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 px-3 py-1.5 text-xs text-stone md:top-7">
          Táhněte a otáčejte koupelnou
        </div>
      )}

      {/* step rail */}
      <nav
        aria-label="Kroky stavby"
        className="glass-panel absolute right-6 top-1/2 hidden -translate-y-1/2 py-3 pr-2 lg:block"
      >
        <ol className="relative flex flex-col gap-1 border-l border-joint">
          {STAGES.map((s, i) => {
            const active = i === stage;
            const done = i < stage;
            return (
              <li key={s.short}>
                <button
                  type="button"
                  onClick={() => seekStage(i)}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "group relative -ml-px flex items-center gap-3 border-l py-1.5 pl-4 pr-2 text-left text-sm transition-colors",
                    active
                      ? "border-brass text-foreground"
                      : "border-transparent text-muted-foreground hover:text-stone",
                  )}
                >
                  <span
                    className={cn(
                      "font-display-wide w-6 text-xs tabular-nums",
                      active ? "text-brass" : done ? "text-stone" : "text-muted-foreground",
                    )}
                  >
                    {done ? <Check className="size-3.5 text-brass" /> : pad(i + 1)}
                  </span>
                  <span className={cn("transition-all", active && "font-semibold")}>{s.short}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* caption */}
      <section
        key={shown}
        aria-live="polite"
        className="animate-caption-in glass-panel absolute inset-x-3 bottom-[76px] p-4 md:inset-x-auto md:bottom-24 md:left-8 md:w-[27rem] md:p-6"
      >
        <div className="flex items-baseline justify-between gap-3">
          <p className="kicker">
            {info !== null ? "Detail" : "Krok"} {pad(shown + 1)} / {pad(STAGE_COUNT)}
          </p>
          <span className="hidden text-xs text-muted-foreground md:inline">{current.short}</span>
        </div>
        <h3 className="mt-2 text-xl font-semibold leading-[1.05] text-foreground md:text-[1.9rem]">
          {current.title}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-stone md:mt-3 md:text-[15px]">{longText}</p>

        {showOptions && stage === 3 && (
          <Seg<WaterproofType>
            label="Systém hydroizolace"
            value={waterproof}
            onChange={chooseWaterproof}
            options={(Object.keys(WATERPROOF_INFO) as WaterproofType[]).map((id) => ({ id, name: WATERPROOF_INFO[id].name }))}
          />
        )}
        {showOptions && stage === 5 && (
          <Seg<NicheType>
            label="Typ niky"
            value={niche}
            onChange={setNiche}
            options={(Object.keys(NICHE_INFO) as NicheType[]).map((id) => ({ id, name: NICHE_INFO[id].name }))}
          />
        )}
        {showOptions && stage === 6 && (
          <Seg<CornerType>
            label="Ukončení rohu"
            value={corner}
            onChange={chooseCorner}
            options={(Object.keys(CORNER_INFO) as CornerType[]).map((id) => ({ id, name: CORNER_INFO[id].name }))}
          />
        )}
        {showOptions && stage === 7 && (
          <Seg<GroutType>
            label="Typ spárovací hmoty"
            value={grout}
            onChange={chooseGrout}
            options={(Object.keys(GROUT_INFO) as GroutType[]).map((id) => ({ id, name: GROUT_INFO[id].name }))}
          />
        )}
        {showOptions && stage === 9 && (
          <Seg<ButtonType>
            label="Tvar tlačítka WC"
            value={button}
            onChange={chooseButton}
            options={(Object.keys(BUTTON_INFO) as ButtonType[]).map((id) => ({ id, name: BUTTON_INFO[id].name }))}
          />
        )}
        {info !== null && (
          <button
            type="button"
            onClick={closeInfo}
            className="mt-3 w-full border border-joint bg-slab px-3 py-2 text-sm font-semibold text-stone transition-colors hover:text-foreground"
          >
            Zpět na celou koupelnu
          </button>
        )}

        <ul className="scrollbar-none -mx-1 mt-3 flex gap-2 overflow-x-auto px-1">
          {details.map((d) => (
            <li
              key={d}
              className="flex shrink-0 items-center gap-2 border border-joint bg-slab/70 px-2.5 py-1 text-xs text-stone"
            >
              <span className="size-1.5 bg-brass" />
              {d}
            </li>
          ))}
        </ul>

        {showOptions && finished && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Toggle on={nicheLight} label="Podsvícení niky" onClick={() => flip(nicheLight, setNicheLight, (v) => sceneRef.current?.setNicheLight(v))} />
            <Toggle on={mood} label="Atmosféra" onClick={() => flip(mood, setMood, (v) => sceneRef.current?.setMood(v))} />
            <Toggle on={shower} label="Sprcha" onClick={() => flip(shower, setShower, (v) => sceneRef.current?.setShower(v))} />
            <Toggle on={tub} label="Vana" onClick={() => flip(tub, setTub, (v) => sceneRef.current?.setTub(v))} />
          </div>
        )}
      </section>

      {/* clickable hotspots, shown once the build is finished */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {HOTSPOTS.map((h) => (
          <button
            key={h.stage}
            type="button"
            ref={(el) => {
              if (el) hotspotRefs.current.set(h.stage, el);
              else hotspotRefs.current.delete(h.stage);
            }}
            onClick={() => openInfo(h.stage)}
            aria-label={`Vysvětlení: ${STAGES[h.stage]?.title ?? ""}`}
            className="absolute left-0 top-0 grid size-8 place-items-center rounded-full border border-foreground bg-background/60 text-lg font-light text-foreground backdrop-blur-sm transition-colors will-change-transform hover:border-brass hover:bg-brass hover:text-primary-foreground"
            style={{ opacity: 0 }}
          >
            +
          </button>
        ))}
      </div>

      {/* control bar */}
      <div className="absolute inset-x-0 bottom-0 border-t border-joint bg-background/90 backdrop-blur-md">
        <div className="flex h-16 items-center gap-1 px-2 md:gap-3 md:px-6">
          <button
            type="button"
            onClick={() => sceneRef.current?.toggle()}
            className="flex h-10 shrink-0 items-center gap-2 bg-brass px-3 text-sm font-semibold text-primary-foreground transition hover:brightness-110 md:px-4"
            aria-label={playing ? "Pozastavit animaci" : "Přehrát animaci"}
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4 fill-current" />}
            <span className="hidden md:inline">{playing ? "Pozastavit" : "Přehrát"}</span>
          </button>
          <button
            type="button"
            onClick={() => seekStage(Math.max(0, stage - 1))}
            className="grid size-10 shrink-0 place-items-center text-stone transition hover:text-brass"
            aria-label="Předchozí krok"
          >
            <ChevronLeft className="size-5" />
          </button>

          <div className="relative flex h-10 min-w-0 flex-1 items-center">
            <div className="flex w-full gap-1">
              {STAGES.map((s, i) => (
                <span key={s.short} className="relative h-1 flex-1 overflow-hidden bg-joint">
                  <span
                    ref={(el) => {
                      fillRefs.current[i] = el;
                    }}
                    className="absolute inset-0 origin-left bg-brass"
                    style={{ transform: "scaleX(0)" }}
                  />
                </span>
              ))}
            </div>
            <input
              ref={rangeRef}
              type="range"
              min={0}
              max={1000}
              defaultValue={0}
              aria-label="Průběh stavby"
              onInput={(e) => sceneRef.current?.seek(Number(e.currentTarget.value) / 1000)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </div>

          <button
            type="button"
            onClick={() => seekStage(Math.min(STAGE_COUNT - 1, stage + 1))}
            className="grid size-10 shrink-0 place-items-center text-stone transition hover:text-brass"
            aria-label="Další krok"
          >
            <ChevronRight className="size-5" />
          </button>
          <span className="mx-1 hidden h-6 w-px bg-joint md:block" />
          <button
            type="button"
            onClick={toggleFree}
            aria-pressed={freeView}
            className={cn(
              "flex h-10 shrink-0 items-center gap-2 px-2 text-sm font-medium transition md:px-3",
              freeView ? "text-brass" : "text-stone hover:text-brass",
            )}
            aria-label="Volný 3D pohled"
          >
            <Rotate3d className="size-5" />
            <span className="hidden md:inline">Volný pohled</span>
          </button>
          <button
            type="button"
            onClick={fullscreen}
            className="hidden size-10 shrink-0 place-items-center text-stone transition hover:text-brass md:grid"
            aria-label="Celá obrazovka"
          >
            <Maximize2 className="size-4" />
          </button>
        </div>
      </div>

      {/* loading */}
      <div
        className={cn(
          "absolute inset-0 z-10 grid place-items-center bg-background transition-opacity duration-700",
          ready || failed ? "pointer-events-none opacity-0" : "opacity-100",
        )}
        aria-hidden={ready}
      >
        <div className="flex flex-col items-center gap-5">
          <div className="grid grid-cols-3 gap-1">
            {Array.from({ length: 9 }).map((_, i) => (
              <span
                key={i}
                className="animate-tile-pulse size-4 bg-brass"
                style={{ animationDelay: `${(i % 3) * 0.12 + Math.floor(i / 3) * 0.12}s` }}
              />
            ))}
          </div>
          <p className="kicker">Pokládáme první dlaždici</p>
        </div>
      </div>
      {failed && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-background p-6 text-center text-stone">
          Tento prohlížeč neumí zobrazit 3D animaci.
        </div>
      )}
    </div>
  );
}
