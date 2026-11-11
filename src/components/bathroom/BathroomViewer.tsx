import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import {
  Bath,
  Check,
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  LightbulbOff,
  Maximize2,
  Pause,
  Play,
  Rotate3d,
  ShowerHead,
  Droplets,
  Sparkles,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  BUTTON_INFO,
  BUTTON_ORDER,
  CORNER_INFO,
  GROUT_INFO,
  HOTSPOTS,
  LABELS,
  NICHE_INFO,
  STAGES,
  STAGE_COUNT,
  STAGE_INDEX,
  WALLS_DETAILS,
  WATERPROOF_INFO,
  DRAIN_COVER_INFO,
  buttonAtStage,
  progressToStage,
  type ButtonType,
  type CornerType,
  type GroutType,
  type NicheType,
  type WaterproofType,
  type DrainCoverType,
} from "./stages";
import type { BathroomScene } from "./scene";
import { DUPLICATE_DETAILS, FINISH_DETAILS } from "./details";
import { Button } from "@/components/ui/button";

const INSPECTION_POINTS = [...HOTSPOTS, ...FINISH_DETAILS.map((d, i) => ({ stage: STAGE_COUNT + i, pos: [...d.pos] as [number, number, number] })).filter((_, i) => !DUPLICATE_DETAILS.includes(i))].map((h, i) => ({ ...h, num: i + 1 }));

export interface BathroomViewerHandle {
  seekStage: (index: number) => void;
}

interface Props {
  ref?: Ref<BathroomViewerHandle>;
  className?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  cols,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  cols?: number;
}) {
  return (
    <div
      className="mt-3 grid gap-px border border-joint bg-joint"
      style={{ gridTemplateColumns: `repeat(${cols ?? options.length}, minmax(0, 1fr))` }}
      role="radiogroup"
      aria-label={label}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "px-2 py-2 text-xs font-semibold leading-tight transition-colors md:text-sm",
            value === o.value ? "bg-brass text-primary-foreground" : "bg-slab text-stone hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  on,
  onClick,
  icon: Icon,
  children,
}: {
  on: boolean;
  onClick: () => void;
  icon: typeof Lightbulb;
  children: string;
}) {
  return (
    <Button
      variant="ghost"
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-2 border px-2 py-2.5 text-xs font-semibold transition-colors md:text-sm",
        on ? "border-brass bg-brass text-primary-foreground" : "border-joint bg-slab text-stone hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{children}</span>
    </Button>
  );
}

export function BathroomViewer({ ref, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<BathroomScene | null>(null);
  const fillRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const rangeRef = useRef<HTMLInputElement>(null);
  const labelRefs = useRef(new Map<string, HTMLElement>());
  const hotspotRefs = useRef(new Map<number, HTMLElement>());
  const stageRef = useRef(0);
  const progressRef = useRef(0);
  const playingRef = useRef(false);
  const autoRef = useRef({ corner: "trim" as CornerType, button: "narrow" as ButtonType, finished: false });

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [stage, setStage] = useState(0);
  const [finished, setFinished] = useState(false);
  const [freeView, setFreeView] = useState(false);
  const [autoCorner, setAutoCorner] = useState<CornerType>("trim");
  const [autoButton, setAutoButton] = useState<ButtonType>("narrow");

  const [grout, setGrout] = useState<GroutType>("cement");
  const [waterproof, setWaterproof] = useState<WaterproofType>("A");
  const [drainCover, setDrainCover] = useState<DrainCoverType>("tile");
  const [corner, setCorner] = useState<CornerType | null>(null);
  const [button, setButton] = useState<ButtonType | null>(null);
  const [niche, setNiche] = useState<NicheType>("standard");
  const [nicheLit, setNicheLit] = useState(true);
  const [mood, setMood] = useState(false);
  const [roomLit, setRoomLit] = useState(true);
  const [shower, setShower] = useState(false);
  const [tub, setTub] = useState(false);
  const [focus, setFocus] = useState<number | null>(null);

  // latest option values, re-applied when the scene is rebuilt (niche change)
  const optsRef = useRef({ grout, waterproof, drainCover, corner, button, nicheLit, mood, roomLit, shower, tub, focus });
  optsRef.current = { grout, waterproof, drainCover, corner, button, nicheLit, mood, roomLit, shower, tub, focus };

  useEffect(() => {
    let disposed = false;
    let api: BathroomScene | null = null;
    const resume = progressRef.current;
    const wasPlaying = playingRef.current;
    import("./scene")
      .then(({ createBathroomScene }) => {
        if (disposed || !containerRef.current || !canvasRef.current) return;
        try {
          api = createBathroomScene(
            containerRef.current,
            canvasRef.current,
            {
              onReady: () => setReady(true),
              onPlayingChange: (v) => {
                playingRef.current = v;
                setPlaying(v);
              },
              onFrame: (p) => {
                progressRef.current = p;
                const s = progressToStage(p);
                const idx = Math.min(STAGE_COUNT - 1, Math.floor(s));
                if (idx !== stageRef.current) {
                  stageRef.current = idx;
                  setStage(idx);
                }
                const fin = p >= 1;
                if (fin !== autoRef.current.finished) {
                  autoRef.current.finished = fin;
                  setFinished(fin);
                }
                const c: CornerType = s < 6.5 ? "trim" : "jolly";
                if (c !== autoRef.current.corner) {
                  autoRef.current.corner = c;
                  setAutoCorner(c);
                }
                const b = buttonAtStage(s, null);
                if (b !== autoRef.current.button) {
                  autoRef.current.button = b;
                  setAutoButton(b);
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
          api.setDrainCover(o.drainCover);
          api.setCorner(o.corner);
          api.setButton(o.button);
          api.setNicheLight(o.nicheLit);
          api.setMood(o.mood);
          api.setRoomLight(o.roomLit);
          api.setShower(o.shower);
          api.setTub(o.tub);
          api.setLabelElements(labelRefs.current);
          api.setHotspotElements(hotspotRefs.current);
          if (resume > 0) {
            api.seek(resume);
            if (resume >= 1) api.focus(o.focus);
            else if (wasPlaying) api.play();
          }
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
    setFreeView(false);
    setFocus(null);
    sceneRef.current?.setFreeView(false);
    sceneRef.current?.seekStage(i);
  }, []);

  useImperativeHandle(ref, () => ({ seekStage }), [seekStage]);

  const toggleFree = () => {
    const next = !freeView;
    setFreeView(next);
    if (next) setFocus(null);
    sceneRef.current?.setFreeView(next);
  };

  const fullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else el.requestFullscreen?.().catch(() => {});
  };

  const openFocus = (i: number | null) => {
    setFocus(i);
    if (i !== null) setFreeView(false);
    sceneRef.current?.focus(i);
  };
  const stepFocus = (dir: number) => {
    const list = INSPECTION_POINTS.map((h) => h.stage);
    const at = focus === null ? -1 : list.indexOf(focus);
    const next = list[(at + dir + list.length) % list.length]!;
    openFocus(next);
  };

  const current = STAGES[stage] ?? STAGES[0]!;
  const shownCorner = corner ?? autoCorner;
  const shownButton = button ?? autoButton;

  const detailsFor = (i: number): string[] => {
    if (i === STAGE_INDEX.waterproof) return WATERPROOF_INFO[waterproof].details;
    if (i === STAGE_INDEX.walls) return WALLS_DETAILS;
    if (i === STAGE_INDEX.corner) return CORNER_INFO[shownCorner].details;
    if (i === STAGE_INDEX.grout) return GROUT_INFO[grout].details;
    return STAGES[i]?.details ?? [];
  };

  const optionsFor = (i: number) => {
    if (i === STAGE_COUNT + 4) return optionsFor(STAGE_INDEX.corner);
    if (i === STAGE_COUNT + FINISH_DETAILS.length - 1) return optionsFor(STAGE_INDEX.floor);
    if (i === STAGE_INDEX.waterproof)
      return (
        <>
          <Segmented
            label="Provedení 2. vrstvy hydroizolace"
            value={waterproof}
            onChange={(v) => {
              setWaterproof(v);
              sceneRef.current?.setWaterproof(v);
            }}
            options={(Object.keys(WATERPROOF_INFO) as WaterproofType[]).map((k) => ({ value: k, label: WATERPROOF_INFO[k].name }))}
          />
          <p className="mt-2 text-xs leading-relaxed text-stone md:text-sm">{WATERPROOF_INFO[waterproof].long}</p>
        </>
      );
    if (i === STAGE_INDEX.floor)
      return (
        <>
          <Segmented
            label="Krytí odtokového žlabu"
            value={drainCover}
            onChange={(v) => {
              setDrainCover(v);
              sceneRef.current?.setDrainCover(v);
            }}
            options={(Object.keys(DRAIN_COVER_INFO) as DrainCoverType[]).map((k) => ({ value: k, label: DRAIN_COVER_INFO[k].name }))}
          />
          <p className="mt-2 text-xs leading-relaxed text-stone md:text-sm">{DRAIN_COVER_INFO[drainCover].long}</p>
        </>
      );
    if (i === STAGE_INDEX.walls)
      return (
        <>
          <Segmented
            label="Typ sprchové niky"
            value={niche}
            onChange={setNiche}
            options={(Object.keys(NICHE_INFO) as NicheType[]).map((k) => ({ value: k, label: NICHE_INFO[k].name }))}
          />
          <Segmented
            label="Podsvícení niky"
            value={nicheLit ? "on" : "off"}
            onChange={(v) => {
              setNicheLit(v === "on");
              sceneRef.current?.setNicheLight(v === "on");
            }}
            options={[
              { value: "on", label: "Podsvícená" },
              { value: "off", label: "Bez podsvícení" },
            ]}
          />
        </>
      );
    if (i === STAGE_INDEX.corner)
      return (
        <>
          <Segmented
            label="Ukončení vnějšího rohu"
            value={shownCorner}
            onChange={(v) => {
              setCorner(v);
              sceneRef.current?.setCorner(v);
            }}
            options={(Object.keys(CORNER_INFO) as CornerType[]).map((k) => ({ value: k, label: CORNER_INFO[k].name }))}
          />
          <p className="mt-2 text-xs leading-relaxed text-stone md:text-sm">{CORNER_INFO[shownCorner].long}</p>
        </>
      );
    if (i === STAGE_INDEX.grout)
      return (
        <Segmented
          label="Typ spárovací hmoty"
          value={grout}
          onChange={(v) => {
            setGrout(v);
            sceneRef.current?.setGrout(v);
          }}
          options={(Object.keys(GROUT_INFO) as GroutType[]).map((k) => ({ value: k, label: GROUT_INFO[k].name }))}
        />
      );
    if (i === STAGE_INDEX.button)
      return (
        <Segmented
          label="Tvar tlačítek WC"
          value={shownButton}
          cols={2}
          onChange={(v) => {
            setButton(v);
            sceneRef.current?.setButton(v);
          }}
          options={BUTTON_ORDER.map((k) => ({ value: k, label: BUTTON_INFO[k].name }))}
        />
      );
    return null;
  };

  const focused = focus !== null ? (STAGES[focus] ?? FINISH_DETAILS[focus - STAGE_COUNT]) : null;

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
      <Button
        variant="ghost"
        size="icon"
        title="Umyvadlo a hotová koupelna"
        aria-label="Umyvadlo a hotová koupelna"
        className="absolute right-4 top-4 z-10 border border-joint bg-background/80 text-brass"
        onClick={() => {
          sceneRef.current?.seek(1);
          openFocus(STAGE_COUNT);
        }}
      >
        <Droplets className="size-5" />
      </Button>

      {finished && (
        <div className="absolute right-4 top-16 z-10 flex flex-col gap-2">
          <Button variant="outline" size="icon" aria-label="Světlo v místnosti" title={roomLit ? "Zhasnout místnost" : "Rozsvítit místnost"} aria-pressed={roomLit} className="bg-background/90" onClick={() => { setRoomLit(!roomLit); sceneRef.current?.setRoomLight(!roomLit); }}>
            {roomLit ? <Lightbulb className="text-brass" /> : <LightbulbOff />}
          </Button>
          <Button variant="outline" size="icon" aria-label="Osvětlení obou nik" title={nicheLit ? "Zhasnout niky" : "Rozsvítit niky"} aria-pressed={nicheLit} className="bg-background/90" onClick={() => { setNicheLit(!nicheLit); sceneRef.current?.setNicheLight(!nicheLit); }}>
            <Sparkles className={cn(nicheLit && "text-brass")} />
          </Button>
          <Button variant="outline" size="icon" aria-label="Napouštění vany" title="Napouštění vany" aria-pressed={tub} className="bg-background/90" onClick={() => { setTub(!tub); sceneRef.current?.setTub(!tub); }}>
            <Bath className={cn(tub && "text-brass")} />
          </Button>
        </div>
      )}

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

      {/* explanation hotspots, shown once the bathroom is finished */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {INSPECTION_POINTS.map((h) => (
          <button
            key={h.stage}
            type="button"
            ref={(el) => {
              if (el) hotspotRefs.current.set(h.stage, el);
              else hotspotRefs.current.delete(h.stage);
            }}
            onClick={() => openFocus(focus === h.stage ? null : h.stage)}
            aria-label={`Vysvětlit ${h.stage < STAGE_COUNT ? "krok" : "detail"} ${h.num}: ${(STAGES[h.stage] ?? FINISH_DETAILS[h.stage - STAGE_COUNT])?.title}`}
            className="absolute left-0 top-0 will-change-transform"
            style={{ opacity: 0, pointerEvents: "none" }}
          >
            <span
              className={cn(
                "relative grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border text-xs font-bold tabular-nums transition-colors md:size-9",
                focus === h.stage
                  ? "border-brass bg-brass text-primary-foreground"
                  : "border-brass/70 bg-background/80 text-brass backdrop-blur-sm hover:bg-brass hover:text-primary-foreground",
              )}
            >
              <span className="animate-ping-ring absolute inset-0 rounded-full border border-brass" />
              {h.num}
            </span>
          </button>
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
        <ol className="relative flex flex-col gap-0.5 border-l border-joint">
          {STAGES.map((s, i) => {
            const active = !finished && i === stage;
            const done = finished || i < stage;
            return (
              <li key={s.short}>
                <button
                  type="button"
                  onClick={() => seekStage(i)}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "group relative -ml-px flex items-center gap-3 border-l py-1 pl-4 pr-2 text-left text-sm transition-colors",
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

      {/* caption / options / explanation */}
      <section
        key={finished ? `f-${focus ?? "x"}` : stage}
        aria-live="polite"
        className={cn("animate-caption-in glass-panel scrollbar-none absolute inset-x-3 bottom-[76px] overflow-y-auto p-3 md:inset-x-auto md:bottom-24 md:left-8 md:max-h-[calc(100%-12rem)] md:w-[27rem] md:p-6", finished ? "max-h-[30%]" : "max-h-[38%]")}
      >
        {finished && focused ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <p className="kicker">
                {focus !== null && focus >= STAGE_COUNT ? "Detail z obkladu" : `Krok ${pad((focus ?? 0) + 1)} / ${pad(STAGE_COUNT)}`}
              </p>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => stepFocus(-1)} className="grid size-8 place-items-center text-stone hover:text-brass" aria-label="Předchozí vysvětlení">
                  <ChevronLeft className="size-4" />
                </button>
                <button type="button" onClick={() => stepFocus(1)} className="grid size-8 place-items-center text-stone hover:text-brass" aria-label="Další vysvětlení">
                  <ChevronRight className="size-4" />
                </button>
                <button type="button" onClick={() => openFocus(null)} className="grid size-8 place-items-center text-stone hover:text-brass" aria-label="Zavřít vysvětlení">
                  <X className="size-4" />
                </button>
              </div>
            </div>
            <h3 className="mt-2 text-xl font-semibold leading-[1.05] text-foreground md:text-[1.75rem]">{focused.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-stone md:text-[15px]">
              {focused.text}
            </p>
            {focus !== null && optionsFor(focus)}
            <ul className="mt-3 flex flex-wrap gap-2">
              {(focus === null ? [] : detailsFor(focus)).map((d) => (
                <li key={d} className="flex items-center gap-2 border border-joint bg-slab/70 px-2.5 py-1 text-xs text-stone">
                  <span className="size-1.5 bg-brass" />
                  {d}
                </li>
              ))}
            </ul>
            {focus !== null && focus < STAGE_COUNT && <button
              type="button"
              onClick={() => seekStage(focus)}
              className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brass hover:brightness-110"
            >
              <Play className="size-3.5 fill-current" /> Přehrát tento krok
            </button>}
          </>
        ) : finished ? (
          <>
            <p className="kicker">Hotovo · předáno</p>
            <h3 className="mt-2 text-xl font-semibold leading-[1.05] text-foreground md:text-[1.9rem]">Prohlédněte si koupelnu</h3>
            <p className="mt-2 hidden text-sm leading-relaxed text-stone md:block md:text-[15px]">
              Klikněte na očíslované body v koupelně a vysvětlíme vám, co se pod obkladem skrývá.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
              {FINISH_DETAILS.map((d, i) => DUPLICATE_DETAILS.includes(i) ? null : (
                <Button key={d.title} variant="ghost" type="button" onClick={() => openFocus(STAGE_COUNT + i)} className="h-auto justify-start whitespace-normal rounded-none border-b border-joint px-0 pb-2 text-left text-xs text-stone hover:text-brass">{d.title}</Button>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Toggle
                on={mood}
                icon={Sparkles}
                onClick={() => {
                  setMood(!mood);
                  sceneRef.current?.setMood(!mood);
                }}
              >
                Romantika
              </Toggle>
              <Toggle
                on={shower}
                icon={ShowerHead}
                onClick={() => {
                  setShower(!shower);
                  sceneRef.current?.setShower(!shower);
                }}
              >
                Sprcha
              </Toggle>
              <Toggle
                on={tub}
                icon={Bath}
                onClick={() => {
                  setTub(!tub);
                  sceneRef.current?.setTub(!tub);
                }}
              >
                Vana
              </Toggle>
            </div>
            <button
              type="button"
              onClick={() => {
                setNicheLit(!nicheLit);
                sceneRef.current?.setNicheLight(!nicheLit);
              }}
              aria-pressed={nicheLit}
              className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-stone hover:text-brass"
            >
              <Lightbulb className={cn("size-3.5", nicheLit && "text-brass")} />
              Podsvícení obou nik: {nicheLit ? "zapnuto" : "vypnuto"}
            </button>
          </>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <p className="kicker">
                Krok {pad(stage + 1)} / {pad(STAGE_COUNT)}
              </p>
              <span className="hidden text-xs text-muted-foreground md:inline">{current.short}</span>
            </div>
            <h3 className="mt-2 text-xl font-semibold leading-[1.05] text-foreground md:text-[1.9rem]">{current.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-stone md:mt-3 md:text-[15px]">{current.text}</p>
            {optionsFor(stage)}
            {detailsFor(stage).length > 0 && (
              <ul className="scrollbar-none -mx-1 mt-3 flex gap-2 overflow-x-auto px-1 md:flex-wrap md:overflow-visible">
                {detailsFor(stage).map((d) => (
                  <li
                    key={d}
                    className="flex shrink-0 items-center gap-2 border border-joint bg-slab/70 px-2.5 py-1 text-xs text-stone"
                  >
                    <span className="size-1.5 bg-brass" />
                    {d}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {/* control bar */}
      <div className="absolute inset-x-0 bottom-0 border-t border-joint bg-background/90 backdrop-blur-md">
        <div className="flex h-16 items-center gap-1 px-2 md:gap-3 md:px-6">
          <button
            type="button"
            onClick={() => {
              setFocus(null);
              sceneRef.current?.toggle();
            }}
            className="flex h-10 shrink-0 items-center gap-2 bg-brass px-3 text-sm font-semibold text-primary-foreground transition hover:brightness-110 md:px-4"
            aria-label={playing ? "Pozastavit animaci" : finished ? "Přehrát znovu" : "Přehrát animaci"}
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4 fill-current" />}
            <span className="hidden md:inline">{playing ? "Pozastavit" : finished ? "Znovu" : "Přehrát"}</span>
          </button>
          <button
            type="button"
            onClick={() => seekStage(Math.max(0, finished ? STAGE_COUNT - 1 : stage - 1))}
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
              onInput={(e) => {
                setFocus(null);
                sceneRef.current?.seek(Number(e.currentTarget.value) / 1000);
              }}
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
