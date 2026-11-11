// Imperative three.js scene for the bathroom build. Browser-only: import dynamically.
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import {
  BUTTON_ORDER,
  BUTTON_SPLITS,
  HOTSPOTS,
  buttonAtStage,
  LABELS,
  STAGE_COUNT,
  STAGE_INDEX,
  TOTAL_SECONDS,
  TUB_INSTALL,
  TUB_ENCLOSURE,
  progressToStage,
  stageToProgress,
  type ButtonType,
  type CornerType,
  type GroutType,
  type NicheType,
  type WaterproofType,
  type DrainCoverType,
} from "./stages";
import { concealedDetailState, DETAIL_DIMENSIONS, FINISH_DETAILS } from "./details";
import { bathFillTarget, gridPieces, nicheLightLevels, TILE_LAYOUT, tileGridOffset } from "./layout";
import {
  Surface,
  bell,
  clamp01,
  concreteTexture,
  cutHoles,
  easeInOut,
  easeOut,
  fabricTexture,
  fibreTexture,
  marbleTexture,
  ramp,
  ridgeTexture,
  rng,
  roundedRect,
  type Rect,
  type SurfaceDef,
  type V3,
} from "./scene-kit";

export interface SceneCallbacks {
  onFrame: (progress: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onReady: () => void;
}

export interface SceneOptions {
  niche: NicheType;
}

export interface BathroomScene {
  play(): void;
  pause(): void;
  toggle(): void;
  seek(progress: number): void;
  seekStage(index: number): void;
  getProgress(): number;
  isPlaying(): boolean;
  setGrout(type: GroutType): void;
  setWaterproof(type: WaterproofType): void;
  setDrainCover(type: DrainCoverType): void;
  /** null = automatic comparison during the corner step. */
  setCorner(type: CornerType | null): void;
  /** null = automatic cycling during the button step. */
  setButton(type: ButtonType | null): void;
  setNicheLight(on: boolean): void;
  setMood(on: boolean): void;
  setRoomLight(on: boolean): void;
  setShower(on: boolean): void;
  setTub(on: boolean): void;
  /** Fly the camera to a step's viewpoint while the finished bathroom stays visible. */
  focus(stage: number | null): void;
  setFreeView(on: boolean): void;
  setLabelElements(map: Map<string, HTMLElement>): void;
  setHotspotElements(map: Map<number, HTMLElement>): void;
  dispose(): void;
}

/* ------------------------------------------------------------------ constants */
const N = STAGE_COUNT;
const W = 3.2; // back wall length (x)
const D = DETAIL_DIMENSIONS.roomDepth; // room depth (z)
const H = 2.6; // wall height (y)
const T = 0.01; // tile thickness
const ADH = 0.006; // adhesive bed
const GAP = TILE_LAYOUT.joint; // joint width
const TEX_M = 2.6; // metres per marble texture repeat

// shower zone (back-left), tub (back-right), WC pre-wall (left wall, front)
const SH_X = 1.4;
const SH_Z = 1.2;
const TUB_X0 = 1.5;
const TUB_Z = 0.8;
const TUB_TOP = 0.56;
const PW_X = 0.24; // pre-wall depth
const PW_Z = 1.75; // pre-wall starts here and runs to the open front (z = D)
const PW_ZT = PW_Z - ADH - T; // outer face of the pre-wall side tiles
const WCZ = DETAIL_DIMENSIONS.wcZ; // WC centre
const WN = { z0: 1.95, z1: 2.7, y0: 1.25, y1: 1.65, x0: 0.1 }; // niche above WC
const CAB = { z0: 1.95, z1: 2.7, y0: 1.8, y1: 2.4, x0: 0.06 }; // hidden cabinet: exactly one 60 cm tile row
const BTN_Y = 1.02;

const NICHES: Record<NicheType, { x0: number; x1: number; y0: number; y1: number; shelves: number[] }> = {
  standard: { x0: 0.4, x1: 1.0, y0: 1.0, y1: 1.6, shelves: [1.3] },
  large: { x0: 0.15, x1: 1.25, y0: 0.85, y1: 1.75, shelves: [1.15, 1.45] },
  full: { x0: 0.85, x1: 1.25, y0: 0, y1: H, shelves: [0.9, 1.3, 1.7] },
};

interface Tile {
  mesh: THREE.Object3D;
  patch: THREE.Mesh;
  grout: THREE.Mesh;
  surf: Surface;
  rect: Rect;
  t0: number;
  dur: number;
  lead: number;
  g0: number;
  world: THREE.Vector3;
}

interface Wipe {
  mesh: THREE.Mesh;
  surf: Surface;
  rect: Rect;
  t0: number;
  t1: number;
}

/* ------------------------------------------------------------------ main */
export function createBathroomScene(
  container: HTMLElement,
  canvas: HTMLCanvasElement,
  cb: SceneCallbacks,
  opts: SceneOptions,
): BathroomScene {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const NI = NICHES[opts.niche];
  const nicheRect: Rect = { u0: NI.x0, v0: NI.y0, u1: NI.x1, v1: NI.y1 };
  const nicheCenter: V3 = [(NI.x0 + NI.x1) / 2, Math.min(NI.y1, NI.y0 + 0.75), -0.04];

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.86;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const bgDay = new THREE.Color("#17181a");
  const bgNight = new THREE.Color("#0c0c0e");
  const bg = bgDay.clone();
  scene.background = bg;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.45;

  const camera = new THREE.PerspectiveCamera(40, 1, 0.03, 60);

  /* lights */
  const hemi = new THREE.HemisphereLight(0xfff6ea, 0x2a2b2e, 0.25);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff3e2, 1.75);
  key.position.set(5.6, 6.5, 6.2);
  key.target.position.set(1.4, 0, 1.2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -4;
  key.shadow.camera.right = 4;
  key.shadow.camera.top = 4;
  key.shadow.camera.bottom = -4;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 20;
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 4;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.45);
  fill.position.set(-2, 3, 6);
  scene.add(fill);

  const spot = (x: number, z: number, tx: number, tz: number, angle: number) => {
    const s = new THREE.SpotLight(0xffd29a, 0, 5, angle, 0.65, 1.4);
    s.position.set(x, H - 0.02, z);
    s.target.position.set(tx, 0, tz);
    scene.add(s, s.target);
    return s;
  };
  const spotShower = spot(0.7, 0.6, 0.7, 0.55, 0.75);
  const spotTub = spot(2.35, 0.45, 2.35, 0.45, 0.85);
  const spotWc = spot(0.75, 2.3, 0.4, 2.3, 0.8);
  const nicheLight = new THREE.PointLight(0xffc98a, 0, 1.1, 1.6);
  nicheLight.position.set(nicheCenter[0], nicheCenter[1], -0.02);
  const wcNicheLight = new THREE.PointLight(0xffc98a, 0, 1.0, 1.6);
  wcNicheLight.position.set(0.2, 1.5, WCZ);
  const candleLight = new THREE.PointLight(0xffa452, 0, 2.6, 1.5);
  candleLight.position.set(2.95, 0.75, 0.9);
  const sweep = new THREE.PointLight(0xffffff, 0, 3.5, 1.5);
  scene.add(nicheLight, wcNicheLight, candleLight, sweep);

  /* textures & materials */
  const marbleMap = marbleTexture();
  const concreteMap = concreteTexture("#8f8b84", 9000, 3);
  concreteMap.repeat.set(3, 3);
  const ridge = ridgeTexture();
  const fibreMap = fibreTexture();
  fibreMap.repeat.set(4, 4);
  const fabricMap = fabricTexture();
  const disposables: { dispose(): void }[] = [marbleMap, concreteMap, ridge, fibreMap, fabricMap, envTex, pmrem];

  const std = (p: THREE.MeshStandardMaterialParameters) => {
    const m = new THREE.MeshStandardMaterial(p);
    disposables.push(m);
    return m;
  };
  const phys = (p: THREE.MeshPhysicalMaterialParameters) => {
    const m = new THREE.MeshPhysicalMaterial(p);
    disposables.push(m);
    return m;
  };
  const basic = (p: THREE.MeshBasicMaterialParameters) => {
    const m = new THREE.MeshBasicMaterial(p);
    disposables.push(m);
    return m;
  };

  const tileMat = phys({ map: marbleMap, roughness: 0.14, clearcoat: 0.55, clearcoatRoughness: 0.08 });
  const adhFlat = std({ color: "#c4c0b7", map: ridge, bumpMap: ridge, bumpScale: 2, roughness: 0.95 });
  const adhRidge = std({ map: ridge, bumpMap: ridge, bumpScale: 3, roughness: 0.95 });
  const groutMat = std({ color: "#bdb6aa", roughness: 0.92 });
  const wallMat = std({ map: concreteMap, color: "#b9b4ac", roughness: 0.96 });
  const slabMat = std({ map: concreteMap, color: "#9e9a92", roughness: 0.97 });
  const capMat = std({ color: "#26272b", roughness: 0.9 });
  const ytongMat = std({ map: concreteMap, color: "#f1ede6", roughness: 0.95 });
  const boardMat = std({ map: concreteMap, color: "#c4cabf", roughness: 0.9 });
  const sandMat = std({ map: concreteMap, color: "#c9c4bb", roughness: 0.99, transparent: true, opacity: 0.9, depthWrite: false });
  const primerMat = std({ color: "#8d8981", roughness: 0.32, transparent: true, opacity: 0.82, depthWrite: false });
  const screedMat = std({ map: concreteMap, color: "#c9bda8", roughness: 0.97 });
  const membrane1Mat = std({ color: "#9cc3d0", roughness: 0.55 });
  const membrane2Mat = std({ color: "#4f8297", roughness: 0.5 });
  const cementWpMat = std({ map: fibreMap, color: "#b3b7b5", roughness: 0.9 });
  const cementWp2Mat = std({ map: fibreMap, color: "#8f9593", roughness: 0.88 });
  const bandMat = std({ color: "#f2f3f1", roughness: 0.8 });
  const fabricMatA = std({ map: fabricMap, color: "#e6ecef", roughness: 0.95, side: THREE.DoubleSide });
  const fabricMatB = std({ map: fabricMap, color: "#d5dee3", roughness: 0.95, side: THREE.DoubleSide });
  const tapeMat = std({ color: "#e4e6e4", roughness: 0.85 });
  const steelMat = std({ color: "#d0d4d7", metalness: 1, roughness: 0.26, envMapIntensity: 1.8 });
  const aluMat = std({ color: "#c9ccce", metalness: 1, roughness: 0.18, envMapIntensity: 2.2 });
  const brassMat = std({ color: "#d4ad66", metalness: 0.7, roughness: 0.3, envMapIntensity: 1.8 });
  const darkMat = std({ color: "#2a2b2f", roughness: 0.6 });
  const ceramicMat = phys({ color: "#f8f7f4", roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 });
  const glassMat = phys({
    color: "#dceef0",
    roughness: 0.02,
    metalness: 0.05,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const waterMat = phys({ color: "#9fd0d6", roughness: 0.04, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const jollyMat = std({ color: "#e2ddd4", roughness: 0.35 });
  const ledMat = basic({ color: "#2a2b2f", toneMapped: false });
  const wcLedMat = basic({ color: "#2a2b2f", toneMapped: false });
  const flameMat = basic({ color: "#ffcf7a", toneMapped: false, transparent: true, opacity: 0.95 });
  const laserMat = basic({ color: "#ff3b30", toneMapped: false, transparent: true, opacity: 0 });
  const arrowMat = basic({ color: "#b99350", transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  const lineMat = new THREE.LineBasicMaterial({ color: "#b99350", transparent: true, opacity: 0.85 });
  const glowMat = new THREE.LineBasicMaterial({ color: "#e9c27a", transparent: true, opacity: 0 });
  disposables.push(lineMat, glowMat);

  const shadowed = <M extends THREE.Mesh>(m: M, cast = true) => {
    m.castShadow = cast;
    m.receiveShadow = true;
    return m;
  };
  const boxAt = (
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    mat: THREE.Material | THREE.Material[],
    parent: THREE.Object3D = scene,
  ) => {
    const m = shadowed(new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat));
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    parent.add(m);
    return m;
  };
  /** Map uv of tile-local geometry so the marble continues across the surface. */
  const marbleUV = (g: THREE.BufferGeometry, cu: number, cv: number, tu: number, tv: number) => {
    const pos = g.getAttribute("position") as THREE.BufferAttribute;
    const uv = g.getAttribute("uv") as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (cu + pos.getX(i) + tu) / TEX_M, (cv + pos.getY(i) + tv) / TEX_M);
  };

  /* ---------------------------------------------------------------- shell */
  const wallMats = [wallMat, wallMat, capMat, wallMat, wallMat, wallMat];
  // slab with a recessed pit for the shower screed
  boxAt(-0.18, -0.24, -0.18, W, -0.06, D, [slabMat, slabMat, slabMat, slabMat, capMat, slabMat]);
  boxAt(SH_X, -0.06, 0, W, 0, D, slabMat);
  boxAt(0, -0.06, SH_Z, SH_X, 0, D, slabMat);
  // back wall around the shower niche
  boxAt(-0.18, -0.24, -0.18, NI.x0, H, 0, wallMats);
  boxAt(NI.x1, -0.24, -0.18, W, H, 0, wallMats);
  boxAt(NI.x0, -0.24, -0.18, NI.x1, NI.y0, 0, wallMats);
  if (H - NI.y1 > 0.001) boxAt(NI.x0, NI.y1, -0.18, NI.x1, H, 0, wallMats);
  boxAt(NI.x0, NI.y0, -0.18, NI.x1, NI.y1, -0.12, wallMats);
  for (const r of cutHoles([{ u0: 0, v0: -0.06, u1: W, v1: H }], [nicheRect])) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r.u1 - r.u0, r.v1 - r.v0), wallMat);
    m.position.set((r.u0 + r.u1) / 2, (r.v0 + r.v1) / 2, 0.0003);
    m.receiveShadow = true;
    scene.add(m);
  }
  // left wall
  boxAt(-0.18, -0.24, 0, 0, H, D, wallMats);
  // bathtub enclosure (aerated blocks). Inner faces stay clear of the tub basin (no z-fighting).
  const tubEnclosure = new THREE.Group();
  scene.add(tubEnclosure);
  boxAt(TUB_X0, 0, 0, W, 0.1, TUB_Z, ytongMat, tubEnclosure);
  for (const r of cutHoles([{ u0: TUB_X0, u1: W, v0: 0.1, v1: TUB_TOP }], [{ u0: TUB_X0 - ADH - T + 0.6, u1: TUB_X0 - ADH - T + 0.6 + DETAIL_DIMENSIONS.hatchWidth, v0: 0.1, v1: 0.1 + DETAIL_DIMENSIONS.hatchHeight }])) {
    boxAt(r.u0, r.v0, TUB_Z - 0.06, r.u1, r.v1, TUB_Z, ytongMat, tubEnclosure);
  }
  boxAt(TUB_X0, 0.1, 0, TUB_X0 + 0.06, TUB_TOP, TUB_Z - 0.06, ytongMat, tubEnclosure);
  boxAt(TUB_X0 + 0.06, 0.1, 0, W, TUB_TOP, 0.05, ytongMat, tubEnclosure);
  boxAt(W - 0.07, 0.1, 0.05, W, TUB_TOP, TUB_Z - 0.06, ytongMat, tubEnclosure);
  // WC pre-wall (cement board) with the lit niche and the hidden cabinet
  const accessoryHoles = [{ u0: DETAIL_DIMENSIONS.accessoriesZ - 0.09, u1: DETAIL_DIMENSIONS.accessoriesZ + 0.09, v0: DETAIL_DIMENSIONS.brushBottom, v1: DETAIL_DIMENSIONS.paperTop }];
  boxAt(0, 0, PW_Z, 0.08, WN.y0, D, boardMat);
  for (const r of cutHoles([{ u0: PW_Z, u1: D, v0: 0, v1: WN.y0 }], accessoryHoles)) {
    boxAt(0.08, r.v0, r.u0, PW_X, r.v1, r.u1, boardMat);
  }
  boxAt(0, WN.y0, PW_Z, WN.x0, WN.y1, D, boardMat);
  boxAt(WN.x0, WN.y0, PW_Z, PW_X, WN.y1, WN.z0, boardMat);
  boxAt(WN.x0, WN.y0, WN.z1, PW_X, WN.y1, D, boardMat);
  boxAt(0, WN.y1, PW_Z, PW_X, CAB.y0, D, boardMat);
  boxAt(0, CAB.y0, PW_Z, CAB.x0, CAB.y1, D, boardMat);
  boxAt(CAB.x0, CAB.y0, PW_Z, PW_X, CAB.y1, CAB.z0, boardMat);
  boxAt(CAB.x0, CAB.y0, CAB.z1, PW_X, CAB.y1, D, boardMat);
  boxAt(0, CAB.y1, PW_Z, PW_X, H, D, boardMat);
  // cabinet lining, shelf and contents (visible when the door opens)
  const cabinetLining = std({ color: "#f3f0ea", roughness: 0.6 });
  boxAt(CAB.x0, CAB.y0, CAB.z0, CAB.x0 + 0.006, CAB.y1, CAB.z1, cabinetLining);
  boxAt(CAB.x0, CAB.y0 + 0.29, CAB.z0, PW_X - 0.02, CAB.y0 + 0.302, CAB.z1, cabinetLining);
  const cabinetContents = new THREE.Group();
  cabinetContents.visible = false;
  scene.add(cabinetContents);
  {
    const m1 = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.14, 18), darkMat));
    m1.position.set(0.14, CAB.y0 + 0.07, 2.15);
    const m2 = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 18), brassMat));
    m2.position.set(0.15, CAB.y0 + 0.352, 2.45);
    const m3 = shadowed(new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.18, 0.14, 2, 0.01), std({ color: "#d9d0c3", roughness: 1 })));
    m3.position.set(0.13, CAB.y0 + 0.09, 2.5);
    cabinetContents.add(m1, m2, m3);
  }

  // brass section lines: the architectural-model look
  {
    const pts: number[] = [];
    const seg = (a: V3, b: V3) => pts.push(...a, ...b);
    seg([-0.18, H, -0.18], [W, H, -0.18]);
    seg([0, H, 0], [W, H, 0]);
    seg([W, H, -0.18], [W, H, 0]);
    seg([-0.18, H, -0.18], [-0.18, H, D]);
    seg([0, H, 0], [0, H, PW_Z]);
    seg([-0.18, H, D], [PW_X, H, D]);
    seg([PW_X, H, PW_Z], [PW_X, H, D]);
    seg([0, H, PW_Z], [PW_X, H, PW_Z]);
    seg([-0.18, -0.24, D], [W, -0.24, D]);
    seg([W, -0.24, -0.18], [W, -0.24, D]);
    seg([-0.18, -0.24, D], [-0.18, H, D]);
    seg([W, -0.24, -0.18], [W, H, -0.18]);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    scene.add(new THREE.LineSegments(g, lineMat));
  }
  {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.45 }));
    disposables.push(ground.material as THREE.Material);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.241;
    ground.receiveShadow = true;
    scene.add(ground);
  }

  /* ---------------------------------------------------------------- surfaces */
  const PFW = D - PW_ZT; // pre-wall front width (wraps over the side tiles' edge)
  const btnTileRect: Rect = { u0: 0.6, v0: 0.6, u1: PFW, v1: 1.2 };
  const brushRect: Rect = { u0: D - DETAIL_DIMENSIONS.accessoriesZ - 0.09, u1: D - DETAIL_DIMENSIONS.accessoriesZ + 0.09, v0: DETAIL_DIMENSIONS.brushBottom, v1: DETAIL_DIMENSIONS.brushTop };
  const paperRect: Rect = { ...brushRect, v0: DETAIL_DIMENSIONS.paperBottom, v1: DETAIL_DIMENSIONS.paperTop };
  // concealed tissue box under the mirror: its door is cut from the wall grid like the paper door
  const TISSUE = { z0: 2.98, z1: 3.22, y0: 1.02, y1: 1.18 };
  const tissueRect: Rect = { u0: D - TISSUE.z1, u1: D - TISSUE.z0, v0: TISSUE.y0, v1: TISSUE.y1 };
  const ventSize = DETAIL_DIMENSIONS.ventTile + DETAIL_DIMENSIONS.ventGap * 2;
  const ventRect: Rect = { u0: PW_ZT - DETAIL_DIMENSIONS.ventZ - ventSize / 2, u1: PW_ZT - DETAIL_DIMENSIONS.ventZ + ventSize / 2, v0: 2.4 - ventSize / 2, v1: 2.4 + ventSize / 2 };
  const hatchRect: Rect = { u0: 0.6, u1: 0.6 + DETAIL_DIMENSIONS.hatchWidth, v0: 0.1, v1: 0.1 + DETAIL_DIMENSIONS.hatchHeight };
  const wnHole: Rect = { u0: D - WN.z1, v0: WN.y0, u1: D - WN.z0, v1: WN.y1 };
  const cabRect: Rect = { u0: D - CAB.z1, v0: CAB.y0, u1: D - CAB.z0, v1: CAB.y1 };
  const nw = NI.x1 - NI.x0;
  // Wall tiles butt against the reveal tiles, whose front edge is flush with the wall face.
  const insetRect = (r: Rect, d: number): Rect => ({ u0: r.u0 + d, v0: r.v0 + d, u1: r.u1 - d, v1: r.v1 - d });
  const nh = NI.y1 - NI.y0;
  const defs: SurfaceDef[] = [
    {
      id: "floor",
      o: [0, 0, D],
      u: [1, 0, 0],
      v: [0, 0, -1],
      w: W,
      h: D,
      tw: 1.2,
      th: 0.6,
      off: [0, tileGridOffset(D - 0.5, 0.6)],
      tex: [0.37, 0.21],
      holes: [
        { u0: 0.1, v0: D - 0.105, u1: SH_X - 0.1, v1: D - 0.035 },
        { u0: TUB_X0 - ADH - T, v0: D - TUB_Z - ADH - T, u1: W, v1: D },
        { u0: 0, v0: 0, u1: PW_X + ADH + T, v1: D - PW_ZT },
      ],
    },
    {
      id: "back",
      o: [0, 0, 0],
      u: [1, 0, 0],
      v: [0, 1, 0],
      w: W,
      h: H,
      tex: [0, 0],
      holes: [insetRect(nicheRect, ADH), { u0: TUB_X0 - ADH - T, v0: 0, u1: W, v1: TUB_TOP + 0.025 }],
    },
    { id: "left", o: [0, 0, PW_ZT], u: [0, 0, -1], v: [0, 1, 0], w: PW_ZT, h: H, off: [tileGridOffset(PW_ZT - 0.5, 1.2), 0], tex: [1.31, 0.47], holes: [ventRect] },
    { id: "nicheBack", o: [NI.x0, NI.y0, -0.12], u: [1, 0, 0], v: [0, 1, 0], w: nw, h: nh, tex: [NI.x0, NI.y0] },
    { id: "nicheBottom", o: [NI.x0, NI.y0, ADH + T], u: [1, 0, 0], v: [0, 0, -1], w: nw, h: 0.12 + ADH + T, tex: [NI.x0, NI.y0 - 0.12] },
    { id: "nicheTop", o: [NI.x0, NI.y1, -0.12], u: [1, 0, 0], v: [0, 0, 1], w: nw, h: 0.12 + ADH + T, tex: [NI.x0, NI.y1] },
    { id: "nicheL", o: [NI.x0, NI.y0, ADH + T], u: [0, 0, -1], v: [0, 1, 0], w: 0.12 + ADH + T, h: nh, tex: [NI.x0 - 0.12, NI.y0] },
    { id: "nicheR", o: [NI.x1, NI.y0, -0.12], u: [0, 0, 1], v: [0, 1, 0], w: 0.12 + ADH + T, h: nh, tex: [NI.x1, NI.y0] },
    {
      id: "preFront",
      o: [PW_X, 0, D],
      u: [0, 0, -1],
      v: [0, 1, 0],
      w: PFW,
      h: H,
      off: [-0.6, 0],
      tex: [0.9, 0.35],
      holes: [insetRect(wnHole, ADH), cabRect, brushRect, paperRect, tissueRect],
      skip: [btnTileRect],
    },
    { id: "preSide", o: [PW_X, 0, PW_Z], u: [-1, 0, 0], v: [0, 1, 0], w: PW_X, h: H, tex: [0.9 + PFW, 0.35] },
    { id: "wnBack", o: [WN.x0, WN.y0, WN.z1], u: [0, 0, -1], v: [0, 1, 0], w: WN.z1 - WN.z0, h: WN.y1 - WN.y0, tex: [1.1, 1.6] },
    { id: "wnBottom", o: [PW_X + ADH + T, WN.y0, WN.z1], u: [0, 0, -1], v: [-1, 0, 0], w: WN.z1 - WN.z0, h: PW_X - WN.x0 + ADH + T, tex: [1.1, 1.46] },
    { id: "wnTop", o: [WN.x0, WN.y1, WN.z1], u: [0, 0, -1], v: [1, 0, 0], w: WN.z1 - WN.z0, h: PW_X - WN.x0 + ADH + T, tex: [1.1, 2.0] },
    { id: "wnL", o: [PW_X + ADH + T, WN.y0, WN.z1], u: [-1, 0, 0], v: [0, 1, 0], w: PW_X - WN.x0 + ADH + T, h: WN.y1 - WN.y0, tex: [0.96, 1.6] },
    { id: "wnR", o: [WN.x0, WN.y0, WN.z0], u: [1, 0, 0], v: [0, 1, 0], w: PW_X - WN.x0 + ADH + T, h: WN.y1 - WN.y0, tex: [1.85, 1.6] },
    { id: "tubFront", o: [TUB_X0 - ADH - T, 0, TUB_Z], u: [1, 0, 0], v: [0, 1, 0], w: W - TUB_X0 + ADH + T, h: TUB_TOP, off: [tileGridOffset(-(TUB_X0 - ADH - T), 1.2), 0], tex: [0.2, 1.4], holes: [hatchRect] },
    { id: "tubSide", o: [TUB_X0, 0, 0], u: [0, 0, 1], v: [0, 1, 0], w: TUB_Z, h: TUB_TOP, tex: [2.1, 0.3] },
  ];
  for (const d of defs) {
    d.tw = TILE_LAYOUT.width;
    d.th = TILE_LAYOUT.height;
    if (d.id === "preSide" || d.id === "tubSide") d.off = [0, 0];
    if (d.id.startsWith("niche")) d.off = [tileGridOffset(-d.o[0], TILE_LAYOUT.width), tileGridOffset(-d.o[1], TILE_LAYOUT.height)];
    if (d.id.startsWith("wn")) d.off = [tileGridOffset(d.o[2] - 0.5, TILE_LAYOUT.width), tileGridOffset(-d.o[1], TILE_LAYOUT.height)];
  }
  const S: Record<string, Surface> = {};
  const sf = (id: string): Surface => {
    const v = S[id];
    if (!v) throw new Error(`Unknown surface ${id}`);
    return v;
  };
  for (const d of defs) {
    const s = new Surface(d);
    S[d.id] = s;
    scene.add(s.group);
  }
  scene.updateMatrixWorld(true);

  const overlaps = (a: Rect, b: Rect) => a.u0 < b.u1 - 1e-4 && a.u1 > b.u0 + 1e-4 && a.v0 < b.v1 - 1e-4 && a.v1 > b.v0 + 1e-4;
  const gridRects = (d: SurfaceDef): Rect[] => {
    const tw = d.tw ?? TILE_LAYOUT.width;
    const th = d.th ?? TILE_LAYOUT.height;
    const [ou, ov] = d.off ?? [0, 0];
    const out: Rect[] = [];
    for (let u = ou; u < d.w - 0.001; u += tw)
      for (let v = ov; v < d.h - 0.001; v += th)
        out.push({ u0: Math.max(0, u), v0: Math.max(0, v), u1: Math.min(d.w, u + tw), v1: Math.min(d.h, v + th) });
    // On detail walls, an opening is cut into ONE slab, not separate grouted strips.
    const rects = out;
    return rects.filter((r) => !(d.skip ?? []).some((k) => overlaps(k, r)));
  };

  /* ---------------------------------------------------------------- tiles */
  const tiles: Tile[] = [];
  const makeTile = (surf: Surface, r: Rect, custom?: THREE.Object3D, fillsOpening = false) => {
    const w = r.u1 - r.u0;
    const h = r.v1 - r.v0;
    const cu = (r.u0 + r.u1) / 2;
    const cv = (r.v0 + r.v1) / 2;
    const [tu, tv] = surf.def.tex;
    let mesh: THREE.Object3D;
    const openings = (surf.def.holes ?? []).filter((hole) => overlaps(r, hole));
    const continuousCut = !custom && !fillsOpening && openings.length > 0;
    const slabParts = continuousCut ? cutHoles([{ u0: r.u0 + GAP / 2, u1: r.u1 - GAP / 2, v0: r.v0 + GAP / 2, v1: r.v1 - GAP / 2 }], openings) : [];
    if (continuousCut) {
      const slab = new THREE.Group();
      for (const part of slabParts) {
        const px = (part.u0 + part.u1) / 2;
        const py = (part.v0 + part.v1) / 2;
        const geo = new THREE.BoxGeometry(part.u1 - part.u0, part.v1 - part.v0, T);
        marbleUV(geo, px, py, tu, tv);
        const piece = shadowed(new THREE.Mesh(geo, [tileMat, tileMat, tileMat, tileMat, tileMat, adhFlat]));
        piece.position.set(px - cu, py - cv, 0);
        slab.add(piece);
      }
      mesh = slab;
    } else if (custom) mesh = custom;
    else {
      const geo = new THREE.BoxGeometry(w - GAP, h - GAP, T);
      marbleUV(geo, cu, cv, tu, tv);
      mesh = shadowed(new THREE.Mesh(geo, [tileMat, tileMat, tileMat, tileMat, tileMat, adhFlat]));
    }
    mesh.position.set(cu, cv, ADH + T / 2);
    mesh.visible = false;
    surf.group.add(mesh);

    const pg = new THREE.PlaneGeometry(w, h);
    pg.translate(w / 2, 0, 0);
    const puv = pg.getAttribute("uv") as THREE.BufferAttribute;
    const pp = pg.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < pp.count; i++) puv.setXY(i, pp.getX(i) * 6, pp.getY(i) * 42);
    const patch = new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(pg, adhRidge);
    if (continuousCut) {
      const parts = cutHoles([r], openings);
      const shapes = parts.map((part) => {
        const shape = new THREE.Shape();
        shape.moveTo(part.u0 - r.u0, part.v0 - cv);
        shape.lineTo(part.u1 - r.u0, part.v0 - cv);
        shape.lineTo(part.u1 - r.u0, part.v1 - cv);
        shape.lineTo(part.u0 - r.u0, part.v1 - cv);
        shape.closePath();
        return shape;
      });
      patch.geometry.dispose();
      patch.geometry = new THREE.ShapeGeometry(shapes);
    }
    patch.receiveShadow = true;
    patch.position.set(r.u0, cv, 0.0056);
    patch.visible = false;
    surf.group.add(patch);

    const grout = new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(new THREE.PlaneGeometry(w + GAP * 0.4, h + GAP * 0.4), groutMat);
    grout.receiveShadow = true;
    grout.position.set(cu, cv, ADH + T * 0.82);
    grout.visible = false;
    surf.group.add(grout);

    if (continuousCut) {
      // Keep grout only in the slab's outer joint; never bridge a cabinet or vent opening.
      const shape = new THREE.Shape();
      const parts = cutHoles([{ u0: r.u0 - GAP * 0.2, u1: r.u1 + GAP * 0.2, v0: r.v0 - GAP * 0.2, v1: r.v1 + GAP * 0.2 }], openings);
      const shapes = parts.map((part) => {
        const outline = shape.clone();
        outline.moveTo(part.u0 - cu, part.v0 - cv);
        outline.lineTo(part.u1 - cu, part.v0 - cv);
        outline.lineTo(part.u1 - cu, part.v1 - cv);
        outline.lineTo(part.u0 - cu, part.v1 - cv);
        outline.closePath();
        return outline;
      });
      grout.geometry.dispose();
      grout.geometry = new THREE.ShapeGeometry(shapes);
    }

    const t: Tile = { mesh, patch, grout, surf, rect: r, t0: 0, dur: 0.1, lead: 0.07, g0: 0, world: surf.world(cu, cv, 0) };
    tiles.push(t);
    return t;
  };

  // flush-button tile: three cut-out variants, only the buttons are cut from the tile
  const buttonVariants = {} as Record<ButtonType, { group: THREE.Group; press: THREE.Object3D }>;
  const buttonRoot = new THREE.Group();
  {
    const s = sf("preFront");
    const r = btnTileRect;
    const w = r.u1 - r.u0 - GAP;
    const h = r.v1 - r.v0 - GAP;
    const cu = (r.u0 + r.u1) / 2;
    const cv = (r.v0 + r.v1) / 2;
    const [tu, tv] = s.def.tex;
    const bx = D - WCZ - cu;
    const by = BTN_Y - cv;
    const CUT = 0.0022;
    const rectPath = (p: THREE.Shape | THREE.Path, x: number, y: number, ww: number, hh: number) => {
      roundedRect(p, x - ww / 2, y - hh / 2, ww, hh, 0.004);
    };
    const circle = (p: THREE.Shape | THREE.Path, x: number, y: number, rad: number) => p.absarc(x, y, rad, 0, Math.PI * 2, false);
    const extrude = (shape: THREE.Shape, depth: number, z0: number) => {
      const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 40 });
      g.translate(0, 0, z0);
      marbleUV(g, cu, cv, tu, tv);
      return g;
    };
    const backing = std({ color: "#1c1d20", roughness: 0.5 });
    const build = (holes: (p: THREE.Path) => void, pieces: THREE.Shape[]) => {
      const group = new THREE.Group();
      const plate = new THREE.Shape();
      plate.moveTo(-w / 2, -h / 2);
      plate.lineTo(w / 2, -h / 2);
      plate.lineTo(w / 2, h / 2);
      plate.lineTo(-w / 2, h / 2);
      plate.closePath();
      holes(plate as unknown as THREE.Path);
      // The hidden paper door shares this slab's grid cell: keep its opening clear.
      const paperHole = new THREE.Path();
      rectPath(paperHole, (paperRect.u0 + paperRect.u1) / 2 - cu, (paperRect.v0 + paperRect.v1) / 2 - cv, paperRect.u1 - paperRect.u0, paperRect.v1 - paperRect.v0);
      plate.holes.push(paperHole);
      group.add(shadowed(new THREE.Mesh(extrude(plate, T, -T / 2), [tileMat, tileMat])));
      const back = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.24), backing);
      back.position.set(bx, by, -T / 2 + 0.0008);
      group.add(back);
      const meshes = pieces.map((p) => {
        const m = shadowed(new THREE.Mesh(extrude(p, T - 0.0012, -T / 2 + 0.0012), [tileMat, tileMat]));
        group.add(m);
        return m;
      });
      buttonRoot.add(group);
      return { group, press: meshes[meshes.length - 1]! };
    };
    // Photo references: unequal adjacent keys sharing a single horizontal cut.
    const rectangularKeys = (height: number, radius: number) => {
      const left = bx - 0.044;
      const right = bx + 0.087;
      const y = by - 0.028;
      const key = (x: number, width: number) => {
        const sh = new THREE.Shape();
        roundedRect(sh, x - width / 2, y - height / 2, width, height, radius);
        return sh;
      };
      return build((plate) => {
        const hole = new THREE.Path();
        roundedRect(hole, bx - 0.133 - CUT, y - height / 2 - CUT, 0.266 + CUT * 2, height + CUT * 2, radius + CUT);
        (plate as unknown as THREE.Shape).holes.push(hole);
      }, [key(left, 0.174), key(right, 0.084)]);
    };
    buttonVariants.narrow = rectangularKeys(0.042, 0.004);
    buttonVariants.wide = rectangularKeys(0.125, 0.004);
    // round: a bigger and a smaller disc side by side
    {
      const R1 = 0.062;
      const R2 = 0.04;
      const g = 0.014;
      const total = R1 * 2 + g + R2 * 2;
      const c1x = bx - total / 2 + R1;
      const c2x = bx + total / 2 - R2;
      const c2y = by - 0.021;
      buttonVariants.round = build(
        (plate) => {
          const h1 = new THREE.Path();
          circle(h1, c1x, by, R1 + CUT);
          const h2 = new THREE.Path();
          circle(h2, c2x, c2y, R2 + CUT);
          (plate as unknown as THREE.Shape).holes.push(h1, h2);
        },
        (() => {
          const d1 = new THREE.Shape();
          circle(d1, c1x, by, R1);
          const d2 = new THREE.Shape();
          circle(d2, c2x, c2y, R2);
          return [d1, d2];
        })(),
      );
    }
    // nested: the smaller disc sits in the lower-right of the bigger one, which becomes a "C" (a bite)
    {
      const R1 = 0.08;
      const R2 = 0.053;
      const c1: [number, number] = [bx - 0.012, by + 0.012];
      const c2: [number, number] = [c1[0] + 0.11, c1[1] - 0.024];
      /** Outline of circle 1 outside circle 2, closed along circle 2 (inside → bite, outside → union). */
      const twoCircles = (p: THREE.Path, r1: number, r2: number, union: boolean) => {
        const dx = c2[0] - c1[0];
        const dy = c2[1] - c1[1];
        const d = Math.hypot(dx, dy);
        const th = Math.atan2(dy, dx);
        const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
        const phi1 = Math.acos(Math.max(-1, Math.min(1, a / r1)));
        const p1: [number, number] = [c1[0] + r1 * Math.cos(th + phi1), c1[1] + r1 * Math.sin(th + phi1)];
        const p2: [number, number] = [c1[0] + r1 * Math.cos(th - phi1), c1[1] + r1 * Math.sin(th - phi1)];
        const psi1 = Math.atan2(p1[1] - c2[1], p1[0] - c2[0]);
        const psi2 = Math.atan2(p2[1] - c2[1], p2[0] - c2[0]);
        p.moveTo(p1[0], p1[1]);
        p.absarc(c1[0], c1[1], r1, th + phi1, th - phi1 + Math.PI * 2, false);
        // Follow the small circle's inner arc for the C-shaped key,
        // and its outer arc for the combined opening in the wall tile.
        p.absarc(c2[0], c2[1], r2, psi2, psi1, !union);
        p.closePath();
      };
      buttonVariants.nested = build(
        (plate) => {
          const hole = new THREE.Path();
          twoCircles(hole, R1 + CUT, R2 + CUT, true);
          (plate as unknown as THREE.Shape).holes.push(hole);
        },
        (() => {
          const cShape = new THREE.Shape();
          twoCircles(cShape, R1, R2 + CUT * 2, false);
          const disc = new THREE.Shape();
          circle(disc, c2[0], c2[1], R2);
          return [cShape, disc];
        })(),
      );
    }
  }

  // floor: first tile is the slow "hero" butterfly demonstration
  const floorTiles = gridRects(sf("floor").def).map((r) => makeTile(sf("floor"), r));
  const heroUV = { u: 1.9, v: 0.6 };
  const dist = (t: Tile) => Math.hypot((t.rect.u0 + t.rect.u1) / 2 - heroUV.u, (t.rect.v0 + t.rect.v1) / 2 - heroUV.v);
  floorTiles.sort((a, b) => dist(a) - dist(b));
  floorTiles.forEach((t, i) => {
    if (i === 0) {
      t.t0 = 4.2;
      t.dur = 0.3;
      t.lead = 0.16;
    } else {
      t.t0 = 4.5 + ((i - 1) / Math.max(1, floorTiles.length - 1)) * 0.36;
      t.dur = 0.09;
      t.lead = 0.06;
    }
  });

  const wallOrder = [
    "back",
    "left",
    "nicheBack",
    "nicheBottom",
    "nicheTop",
    "nicheL",
    "nicheR",
    "tubSide",
    "tubFront",
    "preSide",
    "preFront",
    "wnBack",
    "wnBottom",
    "wnTop",
    "wnL",
    "wnR",
  ];
  const wallTiles: Tile[] = [];
  let doorTile: Tile | null = null;
  const detailDoors: { tile: Tile; detail: number; angle: number; tilt?: boolean }[] = [];
  for (const id of wallOrder) {
    const s = sf(id);
    const list = gridRects(s.def)
      .sort((a, b) => a.v0 - b.v0 || a.u0 - b.u0)
      .map((r) => makeTile(s, r));
    wallTiles.push(...list);
    if (id === "preFront") {
      const buttonTile = makeTile(s, btnTileRect, buttonRoot);
      {
        // Its adhesive patch must not cover the hidden paper compartment either.
        const r = btnTileRect;
        const cv = (r.v0 + r.v1) / 2;
        const shapes = cutHoles([r], [paperRect]).map((part) => {
          const shape = new THREE.Shape();
          shape.moveTo(part.u0 - r.u0, part.v0 - cv);
          shape.lineTo(part.u1 - r.u0, part.v0 - cv);
          shape.lineTo(part.u1 - r.u0, part.v1 - cv);
          shape.lineTo(part.u0 - r.u0, part.v1 - cv);
          shape.closePath();
          return shape;
        });
        buttonTile.patch.geometry.dispose();
        buttonTile.patch.geometry = new THREE.ShapeGeometry(shapes);
        const cu = (r.u0 + r.u1) / 2;
        const groutShapes = cutHoles([r], [paperRect]).map((part) => {
          const shape = new THREE.Shape();
          shape.moveTo(part.u0 - cu, part.v0 - cv);
          shape.lineTo(part.u1 - cu, part.v0 - cv);
          shape.lineTo(part.u1 - cu, part.v1 - cv);
          shape.lineTo(part.u0 - cu, part.v1 - cv);
          shape.closePath();
          return shape;
        });
        buttonTile.grout.geometry.dispose();
        buttonTile.grout.geometry = new THREE.ShapeGeometry(groutShapes);
      }
      wallTiles.push(buttonTile);
      const cabinetPanel = new THREE.Group();
      const cu = (cabRect.u0 + cabRect.u1) / 2;
      const cv = (cabRect.v0 + cabRect.v1) / 2;
      const [tu, tv] = s.def.tex;
      const backing = new THREE.Mesh(new THREE.BoxGeometry(cabRect.u1 - cabRect.u0 - GAP, cabRect.v1 - cabRect.v0 - GAP, T * 0.6), groutMat);
      backing.position.z = -T * 0.4;
      cabinetPanel.add(backing);
      for (const part of gridPieces(cabRect, s.def.off ?? [0, 0])) {
        const px = (part.u0 + part.u1) / 2;
        const py = (part.v0 + part.v1) / 2;
        const g = new THREE.BoxGeometry(part.u1 - part.u0 - GAP, part.v1 - part.v0 - GAP, T);
        marbleUV(g, px, py, tu, tv);
        const panel = shadowed(new THREE.Mesh(g, tileMat));
        panel.position.set(px - cu, py - cv, 0);
        cabinetPanel.add(panel);
      }
      doorTile = makeTile(s, cabRect, cabinetPanel, true);
      wallTiles.push(doorTile);
      for (const rect of [brushRect, paperRect]) {
        const tile = makeTile(s, rect, undefined, true);
        wallTiles.push(tile);
        detailDoors.push({ tile, detail: N + 1, angle: 0, tilt: rect === brushRect });
      }
      {
        const tile = makeTile(s, tissueRect, undefined, true);
        wallTiles.push(tile);
        detailDoors.push({ tile, detail: N + 7, angle: 0, tilt: true });
        // only a hairline cut around the oval slot: the marble runs straight through
        const ovalShape = new THREE.Shape();
        ovalShape.absellipse(0, 0, 0.065, 0.017, 0, Math.PI * 2, false, 0);
        const ovalHole = new THREE.Path();
        ovalHole.absellipse(0, 0, 0.064, 0.016, 0, Math.PI * 2, true, 0);
        ovalShape.holes.push(ovalHole);
        const oval = new THREE.Mesh(new THREE.ShapeGeometry(ovalShape, 48), new THREE.MeshBasicMaterial({ color: "#3a3631" }));
        oval.position.set(0, 0, T / 2 + 0.0004);
        tile.mesh.add(oval);
      }
    }
    if (id === "left") {
      const vent = makeTile(s, { u0: ventRect.u0 + DETAIL_DIMENSIONS.ventGap, u1: ventRect.u1 - DETAIL_DIMENSIONS.ventGap, v0: ventRect.v0 + DETAIL_DIMENSIONS.ventGap, v1: ventRect.v1 - DETAIL_DIMENSIONS.ventGap }, undefined, true);
      wallTiles.push(vent);
    }
    if (id === "tubFront") {
      const tile = makeTile(s, hatchRect, undefined, true);
      wallTiles.push(tile);
      detailDoors.push({ tile, detail: N + 3, angle: 0 });
    }
  }
  wallTiles.forEach((t, i) => {
    t.t0 = 5.04 + (i / Math.max(1, wallTiles.length - 1)) * 0.74;
    t.dur = 0.11;
    t.lead = 0.06;
  });

  for (const [id, rects] of [["preFront", [brushRect, paperRect, tissueRect]], ["left", [ventRect]], ["tubFront", [hatchRect]]] as [string, Rect[]][]) {
    const surf = sf(id);
    for (const r of rects) {
      const backing = new THREE.Mesh(new THREE.PlaneGeometry(r.u1 - r.u0, r.v1 - r.v0), darkMat);
      backing.position.set((r.u0 + r.u1) / 2, (r.v0 + r.v1) / 2, id === "preFront" ? -0.155 : ADH + T - 0.001);
      surf.group.add(backing);
    }
  }

  // shelves cut from the same tile, set into the shower niche
  const shelves: THREE.Group[] = [];
  const mitredSlab = (width: number, depth: number, thickness: number, upper: boolean) => {
    const outer = [[-width / 2, -depth / 2], [width / 2, -depth / 2], [width / 2, depth / 2], [-width / 2, depth / 2]];
    const inner = [[-width / 2 + thickness, -depth / 2 + thickness], [width / 2 - thickness, -depth / 2 + thickness], [width / 2 - thickness, depth / 2 - thickness], [-width / 2 + thickness, depth / 2 - thickness]];
    const yOuter = upper ? 0.011 : -0.011;
    const yInner = upper ? 0.0004 : -0.0004;
    const points = [...outer.map(([x, z]) => new THREE.Vector3(x, yOuter, z)), ...inner.map(([x, z]) => new THREE.Vector3(x, yInner, z))];
    const g = new THREE.BufferGeometry().setFromPoints(points);
    g.setIndex([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]);
    g.computeVertexNormals();
    const uv = points.flatMap(p => [(NI.x0 + nw / 2 + p.x) / TEX_M, (NI.y0 + p.z) / TEX_M]);
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    const material = tileMat.clone();
    material.side = THREE.DoubleSide;
    disposables.push(material);
    return shadowed(new THREE.Mesh(g, material));
  };
  for (const y of NI.shelves) {
    const m = new THREE.Group();
    m.add(mitredSlab(nw - 0.034, 0.12, 0.0106, true), mitredSlab(nw - 0.034, 0.12, 0.0106, false));
    // Tiled fascia closes the hollow shelf; its edges meet the bevelled slabs.
    const faceGeo = new THREE.PlaneGeometry(nw - 0.034, 0.0204);
    marbleUV(faceGeo, NI.x0 + nw / 2, y, 0, 0);
    const fascia = shadowed(new THREE.Mesh(faceGeo, tileMat));
    fascia.position.z = 0.0601;
    m.add(fascia);
    boxAt(-(nw - 0.034) / 2, -0.0004, 0.059, (nw - 0.034) / 2, 0.0004, 0.0602, jollyMat, m);
    m.position.set(NI.x0 + nw / 2, y, -0.12 + 0.016 + 0.06);
    m.visible = false;
    scene.add(m);
    shelves.push(m);
  }

  // grout order: a diagonal sweep through the room
  {
    const ks = tiles.map((t) => t.world.x * 0.6 - t.world.y * 0.5 + t.world.z * 0.4);
    const mn = Math.min(...ks);
    const mx = Math.max(...ks);
    tiles.forEach((t, i) => (t.g0 = 7.08 + ((ks[i]! - mn) / (mx - mn)) * 0.72));
  }

  /* ---------------------------------------------------------------- outside corner: trim vs Jolly */
  const trim = new THREE.Group();
  {
    const cx = PW_X + ADH + T;
    const cz = PW_ZT;
    boxAt(cx - 0.0015, 0.0, cz - 0.0015, cx + 0.0015, H, cz + 0.011, aluMat, trim);
    boxAt(cx - 0.011, 0.0, cz - 0.0015, cx + 0.0015, H, cz + 0.0015, aluMat, trim);
    // rounded nose of the profile
    const nose = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, H, 12), aluMat));
    nose.position.set(cx, H / 2, cz);
    trim.add(nose);
  }
  trim.visible = false;
  scene.add(trim);
  const jolly = new THREE.Group();
  {
    // 45° mitre: the side tile wraps the corner, the hairline joint is epoxy in the tile colour
    const cx = PW_X + ADH + T;
    const cz = PW_ZT;
    const g = new THREE.PlaneGeometry(T + ADH + 0.002, H);
    const pos = g.getAttribute("position") as THREE.BufferAttribute;
    const uv = g.getAttribute("uv") as THREE.BufferAttribute;
    const [tu, tv] = sf("preSide").def.tex;
    const px = cx - (T + ADH + 0.002) / 2;
    // plane faces -z after a half turn, so local x runs against world x
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (PW_X - (px - pos.getX(i)) + tu) / TEX_M, (H / 2 + pos.getY(i) + tv) / TEX_M);
    const cap = new THREE.Mesh(g, tileMat);
    cap.rotation.y = Math.PI;
    cap.position.set(px, H / 2, cz - 0.0004);
    cap.receiveShadow = true;
    jolly.add(cap);
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.0011, H, 0.0011), jollyMat);
    line.position.set(cx - 0.0003, H / 2, cz - 0.0003);
    line.rotation.y = Math.PI / 4;
    jolly.add(line);
  }
  jolly.visible = false;
  scene.add(jolly);

  const nicheTrim = new THREE.Group();
  const nicheJolly = new THREE.Group();
  scene.add(nicheTrim, nicheJolly);
  // Edge profile sits exactly on the outer corner where wall face meets the flush reveal.
  const perimeter = (surf: Surface, hole: Rect) => {
    const r = insetRect(hole, ADH);
    for (const [root, width, mat] of [[nicheTrim, 0.0035, aluMat], [nicheJolly, 0.0009, jollyMat]] as const) {
      const frame = new THREE.Group();
      frame.position.copy(surf.group.position);
      frame.quaternion.copy(surf.group.quaternion);
      root.add(frame);
      const z1 = ADH + T + 0.0004;
      const z0 = z1 - width;
      boxAt(r.u0 - width / 2, r.v0 - width / 2, z0, r.u1 + width / 2, r.v0 + width / 2, z1, mat, frame);
      boxAt(r.u0 - width / 2, r.v1 - width / 2, z0, r.u1 + width / 2, r.v1 + width / 2, z1, mat, frame);
      boxAt(r.u0 - width / 2, r.v0, z0, r.u0 + width / 2, r.v1, z1, mat, frame);
      boxAt(r.u1 - width / 2, r.v0, z0, r.u1 + width / 2, r.v1, z1, mat, frame);
    }
  };
  perimeter(sf("back"), nicheRect);
  perimeter(sf("preFront"), wnHole);

  /* ---------------------------------------------------------------- wipes (sanding, primer, waterproofing) */
  const wipes = {
    sand: [] as Wipe[],
    primer: [] as Wipe[],
    wp1: [] as Wipe[],
    wp1Floor: [] as Wipe[],
    wpA: [] as Wipe[],
    wpAFloor: [] as Wipe[],
    wpB: [] as Wipe[],
    wpBand: [] as Wipe[],
  };
  const addWipe = (list: Wipe[], id: string, rects: Rect[], holes: Rect[], t0: number, t1: number, mat: THREE.Material, depth: number) => {
    const surf = sf(id);
    cutHoles(rects, holes).forEach((r) => {
      const w = r.u1 - r.u0;
      const h = r.v1 - r.v0;
      const g = new THREE.PlaneGeometry(w, h);
      g.translate(0, h / 2, 0);
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      m.position.set((r.u0 + r.u1) / 2, r.v0, depth);
      m.visible = false;
      surf.group.add(m);
      list.push({ mesh: m, surf, rect: r, t0, t1 });
    });
  };
  const full = (id: string): Rect[] => [{ u0: 0, v0: 0, u1: sf(id).def.w, v1: sf(id).def.h }];
  const nicheIds = ["nicheBack", "nicheBottom", "nicheTop", "nicheL", "nicheR"];
  const floorHoles = sf("floor").def.holes ?? [];
  const floorHolesWp = [
    { u0: 0.1, v0: D - 0.11, u1: SH_X - 0.1, v1: D },
    { u0: 0, v0: 0, u1: PW_X, v1: D - PW_Z },
  ];

  // grinding the floor
  addWipe(wipes.sand, "floor", full("floor"), floorHoles, 0.38, 0.6, sandMat, 0.0004);
  // primer
  addWipe(wipes.primer, "back", full("back"), [nicheRect], 0.62, 0.76, primerMat, 0.0008);
  addWipe(wipes.primer, "left", full("left"), [], 0.72, 0.84, primerMat, 0.0008);
  for (const id of nicheIds) addWipe(wipes.primer, id, full(id), [], 0.74, 0.8, primerMat, 0.0008);
  for (const id of ["preFront", "preSide", "tubFront", "tubSide"])
    addWipe(wipes.primer, id, full(id), id === "preFront" ? [wnHole, cabRect, brushRect, paperRect, tissueRect] : [], 0.8, 0.88, primerMat, 0.0008);
  addWipe(wipes.primer, "floor", full("floor"), floorHolesWp, 0.84, 0.95, primerMat, 0.0008);

  // waterproofing areas: shower zone full height, tub surround, low bands elsewhere
  const D1 = 0.0016; // first layer (tapes and sleeves are pressed into it)
  const D2 = 0.0038; // second layer, covers the tapes
  const wallAreas = (
    list: Wipe[],
    t0: number,
    mat: THREE.Material,
    depth: number,
  ) => {
    const k = (a: number) => t0 + a;
    addWipe(list, "back", [{ u0: 0, v0: 0, u1: TUB_X0, v1: 2.3 }], [nicheRect], k(0), k(0.22), mat, depth);
    addWipe(list, "back", [{ u0: TUB_X0, v0: 0, u1: W, v1: 1.1 }], [], k(0.18), k(0.28), mat, depth);
    addWipe(list, "left", [{ u0: PW_ZT - SH_Z - 0.2, v0: 0, u1: PW_ZT, v1: 2.3 }], [], k(0.08), k(0.3), mat, depth);
    addWipe(list, "left", [{ u0: 0, v0: 0, u1: PW_ZT - SH_Z - 0.2, v1: 0.25 }], [], k(0.24), k(0.32), mat, depth);
    for (const id of nicheIds) addWipe(list, id, full(id), [], k(0.14), k(0.24), mat, depth);
    addWipe(list, "tubSide", full("tubSide"), [], k(0.28), k(0.38), mat, depth);
    addWipe(list, "tubFront", [{ u0: 0, v0: 0, u1: sf("tubFront").def.w, v1: 0.25 }], [], k(0.3), k(0.4), mat, depth);
    addWipe(list, "preSide", [{ u0: 0, v0: 0, u1: PW_X, v1: 0.25 }], [], k(0.32), k(0.4), mat, depth);
    addWipe(list, "preFront", [{ u0: 0, v0: 0, u1: PFW, v1: 0.25 }], [brushRect, paperRect], k(0.32), k(0.42), mat, depth);
  };

  // 1st layer (both variants): liquid membrane on walls and niches, fibre-reinforced cement on the floor
  addWipe(wipes.wp1Floor, "floor", full("floor"), floorHolesWp, 2.04, 2.22, cementWpMat, D1);
  wallAreas(wipes.wp1, 2.06, membrane1Mat, D1);

  // 2nd layer, variant A: second coat of the same system
  addWipe(wipes.wpAFloor, "floor", full("floor"), floorHolesWp, 3.04, 3.3, cementWp2Mat, D2);
  wallAreas(wipes.wpA, 3.22, membrane2Mat, D2);

  // 2nd layer, variant B: membrane sheets (e.g. Mapeguard WP 200) in 1 m strips, joints over-bandaged
  {
    const strips: { id: string; holes: Rect[] }[] = [
      { id: "floor", holes: floorHolesWp },
      { id: "back", holes: [nicheRect] },
      { id: "left", holes: [] },
      { id: "preFront", holes: [wnHole, cabRect, brushRect, paperRect, tissueRect] },
    ];
    let k = 0;
    const totalStrips = strips.reduce((a, st2) => a + Math.ceil((sf(st2.id).def.w - 0.1) / 0.9), 0) + 4;
    const slot = 0.5 / totalStrips;
    for (const st2 of strips) {
      const d = sf(st2.id).def;
      let i = 0;
      for (let u = 0; u < d.w - 0.1; u += 0.9, i++, k++) {
        const t0 = 3.04 + k * slot;
        addWipe(wipes.wpB, st2.id, [{ u0: u, v0: 0, u1: Math.min(d.w, u + 1.0), v1: d.h }], st2.holes, t0, t0 + slot * 1.6, i % 2 ? fabricMatB : fabricMatA, D2 + (i % 2) * 0.0005);
        // bandage tape over the 10 cm overlap, bedded in special adhesive
        if (u + 1.0 < d.w - 0.02) {
          const bt = 3.56 + (k / totalStrips) * 0.3;
          addWipe(wipes.wpBand, st2.id, [{ u0: u + 0.89, v0: 0, u1: u + 1.01, v1: d.h }], st2.holes, bt, bt + 0.08, bandMat, D2 + 0.0012);
        }
      }
    }
    for (const id of [...nicheIds, "tubSide", "tubFront", "preSide"]) {
      const t0 = 3.04 + k * slot;
      addWipe(wipes.wpB, id, full(id), [], t0, t0 + slot * 2, fabricMatA, D2);
    }
  }

  /* ---------------------------------------------------------------- drain & screed */
  const drain = new THREE.Group();
  boxAt(0.1, -0.05, 0.035, SH_X - 0.1, 0, 0.105, steelMat, drain);
  boxAt(0.12, -0.049, 0.045, SH_X - 0.12, -0.002, 0.095, darkMat, drain);
  {
    const pipe = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.14, 20), steelMat));
    pipe.position.set(1.05, -0.11, 0.07);
    drain.add(pipe);
  }
  drain.visible = false;
  scene.add(drain);

  let drainTileStrip: THREE.Mesh | null = null;
  const drainInsert = new THREE.Group();
  boxAt(0.1, 0.002, 0.035, SH_X - 0.1, 0.014, 0.105, darkMat, drainInsert);
  {
    const geo = new THREE.BoxGeometry(SH_X - 0.2 - 0.004, 0.004, 0.07 - 0.004);
    const pos = geo.getAttribute("position") as THREE.BufferAttribute;
    const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (0.7 + pos.getX(i)) / TEX_M, (0.07 + pos.getZ(i)) / TEX_M);
    const strip = shadowed(new THREE.Mesh(geo, tileMat));
    strip.position.set(SH_X / 2, 0.015, 0.07);
    drainTileStrip = strip;
    drainInsert.add(strip);
  }
  // alternative cover: slotted stainless grate in the same frame
  const drainGrate = new THREE.Group();
  {
    const len = SH_X - 0.34;
    boxAt(0.17, 0.011, 0.041, SH_X - 0.17, 0.017, 0.099, steelMat, drainGrate);
    const slots = Math.floor(len / 0.025);
    for (let i = 0; i < slots; i++) {
      const x = 0.17 + 0.0125 + i * (len / slots);
      boxAt(x - 0.004, 0.0165, 0.048, x + 0.004, 0.0175, 0.092, darkMat, drainGrate);
    }
  }
  drainGrate.visible = false;
  drainInsert.add(drainGrate);
  drainInsert.visible = false;
  scene.add(drainInsert);

  const screed = (() => {
    const g = new THREE.BoxGeometry(SH_X, 0.06, SH_Z);
    g.translate(0, 0.03, 0);
    const p = g.getAttribute("position") as THREE.BufferAttribute;
    // top falls towards the drain at the back wall (z = 0)
    for (let i = 0; i < p.count; i++) if (p.getY(i) > 0.05) p.setY(i, 0.06 - 0.012 * ((SH_Z / 2 - p.getZ(i)) / SH_Z));
    g.computeVertexNormals();
    const m = shadowed(new THREE.Mesh(g, screedMat), false);
    m.position.set(SH_X / 2, -0.06, SH_Z / 2);
    m.visible = false;
    scene.add(m);
    return m;
  })();

  // slope arrows: chevrons lying on the screed, tips pointing at the drain (towards -z)
  const arrows: THREE.Mesh[] = [];
  {
    const sh = new THREE.Shape();
    sh.moveTo(-0.07, 0.03);
    sh.lineTo(0, -0.03);
    sh.lineTo(0.07, 0.03);
    sh.lineTo(0.07, 0.055);
    sh.lineTo(0, -0.005);
    sh.lineTo(-0.07, 0.055);
    sh.closePath();
    const g = new THREE.ShapeGeometry(sh);
    // shape -y (the tip) → world -z
    g.rotateX(Math.PI / 2);
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(g, arrowMat);
      m.userData = { x: 0.3 + (i % 3) * 0.4, phase: Math.floor(i / 3) / 3 };
      m.visible = false;
      m.renderOrder = 2;
      scene.add(m);
      arrows.push(m);
    }
  }

  /* ---------------------------------------------------------------- tapes, collars, sleeves */
  interface Grow {
    obj: THREE.Object3D;
    t0: number;
    t1: number;
    axis: "x" | "all";
  }
  const grows: Grow[] = [];
  const bandGrows: Grow[] = [];
  const addTape = (a: V3, b: V3, n1: V3, n2: V3, t0: number, t1: number, lift = 0.0024, into: Grow[] = grows) => {
    const A = new THREE.Vector3(...a);
    const B = new THREE.Vector3(...b);
    const dir = B.clone().sub(A);
    const L = dir.length();
    dir.normalize();
    for (const [nn, ext] of [
      [n1, n2],
      [n2, n1],
    ] as [V3, V3][]) {
      const Nn = new THREE.Vector3(...nn);
      const E = new THREE.Vector3(...ext);
      const g = new THREE.BoxGeometry(L, 0.06, 0.0018);
      g.translate(L / 2, 0.03, 0);
      const m = new THREE.Mesh(g, into === grows ? tapeMat : bandMat);
      m.receiveShadow = true;
      m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(dir, E, Nn));
      m.position.copy(A).addScaledVector(Nn, lift);
      m.visible = false;
      scene.add(m);
      into.push({ obj: m, t0, t1, axis: "x" });
    }
  };
  const tapeDefs: [V3, V3, V3, V3][] = [
    [[0, 0, 0], [0, 2.1, 0], [0, 0, 1], [1, 0, 0]],
    [[0, 0, 0], [TUB_X0, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[0, 0, 0], [0, 0, PW_Z], [1, 0, 0], [0, 1, 0]],
    [[TUB_X0, 0, 0], [TUB_X0, 0, TUB_Z], [-1, 0, 0], [0, 1, 0]],
    [[TUB_X0, 0, TUB_Z], [W, 0, TUB_Z], [0, 0, 1], [0, 1, 0]],
    [[TUB_X0, TUB_TOP + 0.025, 0.02], [W, TUB_TOP + 0.025, 0.02], [0, 0, 1], [0, 1, 0]],
    [[0, 0, PW_Z], [PW_X, 0, PW_Z], [0, 0, -1], [0, 1, 0]],
    [[0, 0, PW_Z], [0, 0.2, PW_Z], [1, 0, 0], [0, 0, -1]],
    [[PW_X, 0, PW_Z], [PW_X, 0, D], [1, 0, 0], [0, 1, 0]],
    [[NI.x0, NI.y0, -0.12], [NI.x1, NI.y0, -0.12], [0, 0, 1], [0, 1, 0]],
    [[NI.x0, NI.y1, -0.12], [NI.x1, NI.y1, -0.12], [0, 0, 1], [0, -1, 0]],
    [[NI.x0, NI.y0, -0.12], [NI.x0, NI.y1, -0.12], [0, 0, 1], [1, 0, 0]],
    [[NI.x1, NI.y0, -0.12], [NI.x1, NI.y1, -0.12], [0, 0, 1], [-1, 0, 0]],
  ];
  tapeDefs.forEach((d, i) => {
    const t0 = 2.42 + i * 0.026;
    addTape(d[0], d[1], d[2], d[3], t0, t0 + 0.1);
    const b0 = 3.62 + i * 0.022;
    addTape(d[0], d[1], d[2], d[3], b0, b0 + 0.08, D2 + 0.0024, bandGrows);
  });
  {
    const hw = SH_X / 2 - 0.02;
    const outer = new THREE.Shape();
    outer.moveTo(-hw, -0.08);
    outer.lineTo(hw, -0.08);
    outer.lineTo(hw, 0.08);
    outer.lineTo(-hw, 0.08);
    outer.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-hw + 0.07, -0.035);
    hole.lineTo(hw - 0.07, -0.035);
    hole.lineTo(hw - 0.07, 0.035);
    hole.lineTo(-hw + 0.07, 0.035);
    hole.closePath();
    outer.holes.push(hole);
    const collar = new THREE.Mesh(new THREE.ShapeGeometry(outer), tapeMat);
    collar.rotation.x = -Math.PI / 2;
    collar.position.set(SH_X / 2, 0.0025, 0.07);
    collar.visible = false;
    scene.add(collar);
    grows.push({ obj: collar, t0: 2.74, t1: 2.86, axis: "all" });
  }
  const sleeveShape = (() => {
    const s = new THREE.Shape();
    s.moveTo(-0.07, -0.07);
    s.lineTo(0.07, -0.07);
    s.lineTo(0.07, 0.07);
    s.lineTo(-0.07, 0.07);
    s.closePath();
    const h = new THREE.Path();
    h.absarc(0, 0, 0.016, 0, Math.PI * 2, true);
    s.holes.push(h);
    return new THREE.ShapeGeometry(s, 20);
  })();
  const outlets: { p: V3; n: V3 }[] = [
    { p: [0, 1.05, 0.52], n: [1, 0, 0] },
    { p: [0, 1.05, 0.68], n: [1, 0, 0] },
    { p: [0.7, 2.25, 0], n: [0, 0, 1] },
    { p: [2.35, 0.82, 0], n: [0, 0, 1] },
  ];
  const stubs = new THREE.Group();
  scene.add(stubs);
  outlets.forEach((o, i) => {
    const sl = new THREE.Mesh(sleeveShape, tapeMat);
    const Nn = new THREE.Vector3(...o.n);
    sl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), Nn);
    sl.position.set(...o.p).addScaledVector(Nn, 0.0026);
    sl.visible = false;
    scene.add(sl);
    grows.push({ obj: sl, t0: 2.78 + i * 0.035, t1: 2.88 + i * 0.035, axis: "all" });
    const cyl = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.07, 16), steelMat));
    cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), Nn);
    cyl.position.set(...o.p).addScaledVector(Nn, 0.035);
    const cap = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.02, 16), std({ color: i === 1 ? "#3b6fb0" : "#b5442f", roughness: 0.5 })));
    cap.quaternion.copy(cyl.quaternion);
    cap.position.set(...o.p).addScaledVector(Nn, 0.075);
    stubs.add(cyl, cap);
  });

  /* ---------------------------------------------------------------- tub (deck + basin, no coplanar faces) */
  const TB = { x0: 1.6, x1: 3.08, z0: 0.12, z1: 0.7, r: 0.2 };
  const tub = new THREE.Group();
  const basinShape = (flipZ: boolean) => {
    const p = new THREE.Shape();
    if (flipZ) roundedRect(p, TB.x0, -TB.z1, TB.x1 - TB.x0, TB.z1 - TB.z0, TB.r);
    else roundedRect(p, TB.x0, TB.z0, TB.x1 - TB.x0, TB.z1 - TB.z0, TB.r);
    return p;
  };
  {
    const deck = new THREE.Shape();
    roundedRect(deck, TUB_X0 - ADH - T, 0.017, W - TUB_X0 + ADH + T, TUB_Z + ADH + T + 0.004 - 0.017, 0.004);
    deck.holes.push(basinShape(false));
    const dg = new THREE.ExtrudeGeometry(deck, { depth: 0.025, bevelEnabled: false, curveSegments: 20 });
    const deckMesh = shadowed(new THREE.Mesh(dg, ceramicMat));
    deckMesh.rotation.x = Math.PI / 2;
    deckMesh.position.y = TUB_TOP + 0.025;
    tub.add(deckMesh);

    const basin = new THREE.Shape();
    roundedRect(basin, TB.x0 - 0.02, TB.z0 - 0.02, TB.x1 - TB.x0 + 0.04, TB.z1 - TB.z0 + 0.04, TB.r + 0.02);
    basin.holes.push(basinShape(false));
    const bg2 = new THREE.ExtrudeGeometry(basin, { depth: TUB_TOP - 0.145, bevelEnabled: false, curveSegments: 20 });
    const basinMesh = new THREE.Mesh(bg2, ceramicMat);
    basinMesh.castShadow = true;
    basinMesh.receiveShadow = false;
    basinMesh.rotation.x = Math.PI / 2;
    basinMesh.position.y = TUB_TOP;
    tub.add(basinMesh);

    const bottom = new THREE.Mesh(new THREE.ShapeGeometry(basinShape(true), 20), ceramicMat);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.y = 0.15;
    bottom.receiveShadow = true;
    tub.add(bottom);
  }
  tub.visible = false;
  scene.add(tub);

  const water = new THREE.Mesh(new THREE.ShapeGeometry(basinShape(true), 20), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.renderOrder = 3;
  water.visible = false;
  scene.add(water);
  const spoutStream = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.009, 1, 10), waterMat);
  spoutStream.visible = false;
  scene.add(spoutStream);

  /* ---------------------------------------------------------------- fixtures (handover) */
  interface Appear {
    obj: THREE.Object3D;
    t0: number;
    t1: number;
    from: V3;
    base: THREE.Vector3;
  }
  const appears: Appear[] = [];
  const addAppear = (obj: THREE.Object3D, t0: number, t1: number, from: V3) => {
    obj.visible = false;
    scene.add(obj);
    appears.push({ obj, t0, t1, from, base: obj.position.clone() });
  };

  // shelves slide into the niche during wall tiling
  shelves.forEach((m, i) => {
    scene.remove(m);
    addAppear(m, 5.62 + i * 0.05, 5.76 + i * 0.05, [0, 0, 0.3]);
  });

  // shower glass between shower and tub, brass profile and stabiliser
  const glass = new THREE.Group();
  {
    const pane = new THREE.Mesh(new THREE.BoxGeometry(0.008, 1.98, 0.93), glassMat);
    pane.position.set(1.45, 1.006, 0.485);
    glass.add(pane);
    boxAt(1.44, 0.016, 0.016, 1.46, 2.0, 0.034, brassMat, glass);
    boxAt(0.016, 1.975, 0.925, 1.45, 1.99, 0.94, brassMat, glass);
  }
  addAppear(glass, 15.04, 15.22, [0, 0.6, 0]);

  const shower = new THREE.Group();
  boxAt(0.68, 2.24, 0.016, 0.72, 2.26, 0.5, brassMat, shower);
  boxAt(0.55, 2.225, 0.35, 0.85, 2.24, 0.65, brassMat, shower);
  {
    const plate = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.012, 40), brassMat));
    plate.rotation.z = Math.PI / 2;
    plate.position.set(0.022, 1.05, 0.6);
    shower.add(plate);
    boxAt(0.028, 1.04, 0.585, 0.12, 1.06, 0.615, brassMat, shower);
  }
  addAppear(shower, 15.1, 15.26, [0.12, 0.25, 0.12]);

  const spout = new THREE.Group();
  {
    const plate = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 32), brassMat));
    plate.rotation.x = Math.PI / 2;
    plate.position.set(2.35, 0.82, 0.022);
    spout.add(plate);
    boxAt(2.335, 0.805, 0.016, 2.365, 0.83, 0.2, brassMat, spout);
  }
  addAppear(spout, 15.14, 15.28, [0, 0, 0.2]);

  const wc = new THREE.Group();
  {
    const pod = (hw: number, len: number) => {
      const sh = new THREE.Shape();
      sh.moveTo(-hw, 0);
      sh.lineTo(hw, 0);
      sh.lineTo(hw, len - hw * 1.1);
      sh.absellipse(0, len - hw * 1.1, hw, hw * 1.1, 0, Math.PI, false);
      sh.lineTo(-hw, 0);
      return sh;
    };
    const bowl = shadowed(
      new THREE.Mesh(
        new THREE.ExtrudeGeometry(pod(0.14, 0.46), { depth: 0.22, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 6, curveSegments: 24 }),
        ceramicMat,
      ),
    );
    bowl.rotation.x = Math.PI / 2;
    bowl.position.set(0, 0.37, 0.04);
    const seat = shadowed(
      new THREE.Mesh(
        new THREE.ExtrudeGeometry(pod(0.15, 0.48), { depth: 0.012, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 3, curveSegments: 24 }),
        ceramicMat,
      ),
    );
    seat.rotation.x = Math.PI / 2;
    seat.position.set(0, 0.45, 0.03);
    wc.add(bowl, seat);
    wc.rotation.y = Math.PI / 2;
    wc.position.set(PW_X + ADH + T, 0, WCZ);
  }
  addAppear(wc, 10.02, 10.18, [-0.35, 0, 0]);

  // Custom fabricated basin, mitred tile panels and recessed linear outlet.
  const basin = new THREE.Group();
  const tileBox = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, parent: THREE.Object3D) => {
    const m = boxAt(x0, y0, z0, x1, y1, z1, tileMat, parent);
    const p = m.geometry.getAttribute("position") as THREE.BufferAttribute;
    const uv = m.geometry.getAttribute("uv") as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (m.position.z + p.getZ(i)) / TEX_M, (m.position.x + p.getX(i) + m.position.y + p.getY(i)) / TEX_M);
    return m;
  };
  // 1 m basin: z 2.85-3.85, outlet hidden under a removable tile strip at the back.
  const BZ0 = 2.85, BZ1 = 3.85;
  tileBox(0.256, 0.72, BZ0, 0.79, 0.86, BZ0 + 0.026, basin);
  tileBox(0.256, 0.72, BZ1 - 0.026, 0.79, 0.86, BZ1, basin);
  tileBox(0.764, 0.72, BZ0 + 0.026, 0.79, 0.86, BZ1 - 0.026, basin);
  tileBox(0.256, 0.72, BZ0 + 0.026, 0.282, 0.86, BZ1 - 0.026, basin);
  const basinBottom = tileBox(0.34, 0.738, BZ0 + 0.026, 0.764, 0.754, BZ1 - 0.026, basin);
  basinBottom.rotation.z = 0.02;
  // drain channel below the strip, and the strip itself (lifted in its detail view)
  boxAt(0.282, 0.70, BZ0 + 0.03, 0.34, 0.705, BZ1 - 0.03, darkMat, basin);
  // visible outlet in the channel: brass ring with a dark throat
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.006, 32), brassMat);
  ring.position.set(0.311, 0.708, 3.35);
  const throat = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.008, 32), new THREE.MeshBasicMaterial({ color: "#050505" }));
  throat.position.set(0.311, 0.709, 3.35);
  basin.add(ring, throat);
  const drainStrip = new THREE.Group();
  tileBox(0.284, 0.733, BZ0 + 0.03, 0.336, 0.749, BZ1 - 0.03, drainStrip);
  basin.add(drainStrip);
  // Wall-mounted brass tap and a matching tile soap dispenser.
  boxAt(0.256, 1.06, 3.33, 0.50, 1.082, 3.356, brassMat, basin);
  boxAt(0.479, 1.02, 3.33, 0.501, 1.082, 3.356, brassMat, basin);
  tileBox(0.29, 0.86, 3.62, 0.368, 1.02, 3.698, basin);
  const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.045, 20), darkMat);
  pump.position.set(0.329, 1.042, 3.659);
  basin.add(pump);
  boxAt(0.325, 1.06, 3.648, 0.40, 1.073, 3.67, darkMat, basin);
  // running tap: stream from the spout and water collecting in the basin
  const basinWaterMat = waterMat.clone();
  disposables.push(basinWaterMat);
  const basinWater = new THREE.Mesh(new THREE.PlaneGeometry(0.764 - 0.35, BZ1 - BZ0 - 0.06), basinWaterMat);
  basinWater.rotation.x = -Math.PI / 2;
  basinWater.rotation.z = 0.02;
  basinWater.renderOrder = 3;
  basinWater.visible = false;
  basin.add(basinWater);
  const tapStreamMat = waterMat.clone();
  disposables.push(tapStreamMat);
  const tapStream = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.008, 1, 10), tapStreamMat);
  tapStream.visible = false;
  basin.add(tapStream);
  // Tiled vanity with two drawers; an LED strip lights each drawer as it opens.
  tileBox(0.256, 0.16, BZ0, 0.79, 0.70, BZ0 + 0.026, basin);
  tileBox(0.256, 0.16, BZ1 - 0.026, 0.79, 0.70, BZ1, basin);
  tileBox(0.256, 0.676, BZ0 + 0.026, 0.79, 0.70, BZ1 - 0.026, basin);
  boxAt(0.26, 0.16, BZ0 + 0.026, 0.27, 0.676, BZ1 - 0.026, darkMat, basin);
  const drawerLedMat = new THREE.MeshBasicMaterial({ color: "#2a2b2f" });
  const drawerInnerMat = new THREE.MeshStandardMaterial({ color: "#d9d4ca", roughness: 0.8 });
  disposables.push(drawerLedMat, drawerInnerMat);
  const drawers: THREE.Group[] = [];
  for (const [y0, y1] of [[0.16, 0.414], [0.42, 0.674]] as const) {
    const d = new THREE.Group();
    tileBox(0.766, y0 + 0.002, BZ0 + 0.028, 0.79, y1 - 0.002, BZ1 - 0.028, d);
    boxAt(0.33, y0 + 0.02, BZ0 + 0.04, 0.766, y0 + 0.03, BZ1 - 0.04, drawerInnerMat, d);
    boxAt(0.33, y0 + 0.03, BZ0 + 0.04, 0.34, y1 - 0.04, BZ1 - 0.04, drawerInnerMat, d);
    boxAt(0.33, y0 + 0.03, BZ0 + 0.04, 0.766, y1 - 0.04, BZ0 + 0.05, drawerInnerMat, d);
    boxAt(0.33, y0 + 0.03, BZ1 - 0.05, 0.766, y1 - 0.04, BZ1 - 0.04, drawerInnerMat, d);
    boxAt(0.35, y1 - 0.045, BZ0 + 0.06, 0.745, y1 - 0.04, BZ0 + 0.066, drawerLedMat, d);
    basin.add(d);
    drawers.push(d);
  }
  const drawerLight = new THREE.PointLight("#ffe1b0", 0, 1.2, 2);
  drawerLight.position.set(0.7, 0.5, 3.35);
  basin.add(drawerLight);
  let drawerOpen = 0;
  // slow, deliberate lift while the concealed-drain close-up is open
  let drainFocusT = 0;
  addAppear(basin, 10.08, 10.3, [-0.3, 0.2, 0]);
  // Mirror above the basin and a concealed tile tissue box under it (oval slot, tissue peeking out).
  const mirrorMat = std({ color: "#dfe7ea", metalness: 0.75, roughness: 0.1, envMapIntensity: 3 });
  disposables.push(mirrorMat);
  boxAt(0.256, 1.34, 2.95, 0.262, 2.02, 3.75, darkMat, basin);
  boxAt(0.262, 1.35, 2.96, 0.268, 2.01, 3.74, mirrorMat, basin);
  const TX0 = TISSUE.z0, TX1 = TISSUE.z1, TY0 = TISSUE.y0, TY1 = TISSUE.y1;
  const tissueBox = new THREE.Group();
  boxAt(0.07, TY0 + 0.015, TX0 + 0.01, 0.25, TY1 - 0.015, TX1 - 0.01, ceramicMat, tissueBox);
  boxAt(0.249, TY0 + 0.05, TX0 + 0.05, 0.251, TY1 - 0.05, TX1 - 0.05, darkMat, tissueBox);
  const tissue = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.004, 0.09), ceramicMat);
  tissue.position.set(0.28, TY0 + 0.085, (TX0 + TX1) / 2);
  tissue.rotation.z = 0.5;
  tissueBox.add(tissue);
  basin.add(tissueBox);
  let tissueOpen = 0;

  // All WC accessories remain recessed behind the closed tiled doors.
  const paper = new THREE.Group();
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.041, 0.041, 0.145, 28), ceramicMat);
  roll.rotation.x = Math.PI / 2;
  roll.position.set(0.15, 0.884, DETAIL_DIMENSIONS.accessoriesZ);
  paper.add(roll);
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.125), ceramicMat);
  sheet.rotation.y = Math.PI / 2;
  sheet.position.set(0.195, 0.82, DETAIL_DIMENSIONS.accessoriesZ);
  paper.add(sheet);
  addAppear(paper, 12.05, 12.22, [0, 0, 0]);
  // Paper tail peeks out through a paper-wide slot joint under the closed door.
  const paperFlap = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.065), ceramicMat);
  {
    const pf = sf("preFront");
    pf.group.updateMatrixWorld(true);
    const fu = (brushRect.u0 + brushRect.u1) / 2;
    pf.world(fu, DETAIL_DIMENSIONS.paperBottom - 0.0325, ADH + T + 0.0015, paperFlap.position);
    paperFlap.quaternion.copy(pf.group.getWorldQuaternion(new THREE.Quaternion()));
    const slot = new THREE.Mesh(new THREE.PlaneGeometry(0.118, 0.004), darkMat);
    pf.world(fu, DETAIL_DIMENSIONS.paperBottom, ADH + T + 0.0008, slot.position);
    slot.quaternion.copy(paperFlap.quaternion);
    paperFlap.userData["slot"] = slot;
    scene.add(paperFlap, slot);
  }
  const brush = new THREE.Group();
  boxAt(0.12, 0.18, DETAIL_DIMENSIONS.accessoriesZ - 0.052, 0.19, 0.29, DETAIL_DIMENSIONS.accessoriesZ + 0.052, darkMat, brush);
  boxAt(0.145, 0.29, DETAIL_DIMENSIONS.accessoriesZ - 0.008, 0.156, 0.58, DETAIL_DIMENSIONS.accessoriesZ + 0.003, steelMat, brush);
  scene.add(brush);
  brush.visible = false;

  const shelfY = NI.shelves[0]! + 0.01;
  const decor = new THREE.Group();
  {
    const bottleMat = std({ color: "#3a3b3f", roughness: 0.35 });
    const b1 = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.16, 24), bottleMat));
    b1.position.set(NI.x0 + 0.1, shelfY + 0.08, -0.06);
    const b2 = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.12, 24), ceramicMat));
    b2.position.set(NI.x0 + 0.17, shelfY + 0.06, -0.07);
    const c1 = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.03, 12), brassMat));
    c1.position.set(NI.x0 + 0.1, shelfY + 0.175, -0.06);
    decor.add(b1, b2, c1);
    // WC niche: rolled towels and a plant
    const towelMat = std({ color: "#d9d0c3", roughness: 1 });
    for (let i = 0; i < 3; i++) {
      const t = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.12, 20), towelMat));
      t.rotation.x = Math.PI / 2;
      t.rotation.z = Math.PI / 2;
      t.position.set(0.17, WN.y0 + 0.016 + 0.04 + (i === 2 ? 0.075 : 0), WN.z0 + 0.1 + (i === 2 ? 0.04 : i * 0.085));
      decor.add(t);
    }
    const pot = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.11, 24), darkMat));
    pot.position.set(0.17, WN.y0 + 0.016 + 0.055, WN.z1 - 0.12);
    decor.add(pot);
    const leafMat = std({ color: "#55684f", roughness: 0.7, side: THREE.DoubleSide });
    const R = rng(5);
    for (let i = 0; i < 8; i++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), leafMat);
      leaf.scale.set(0.35, 1.5, 0.12);
      const a = (i / 8) * Math.PI * 2;
      leaf.position.set(0.17 + Math.cos(a) * 0.03, WN.y0 + 0.19 + R() * 0.03, WN.z1 - 0.12 + Math.sin(a) * 0.03);
      leaf.rotation.set(Math.sin(a) * 0.5, a, Math.cos(a) * 0.5);
      leaf.castShadow = true;
      decor.add(leaf);
    }
  }
  addAppear(decor, 15.28, 15.46, [0, 0.25, 0]);

  // Hidden push-to-open (click-clack) towel hooks. The wall shows nothing but the thin
  // grout line left by the circular cut; press the tile disc and a slim chrome pin pops out.
  const hooks: {
    root: THREE.Group;
    shaft: THREE.Group;
    towel: THREE.Object3D | null;
    face: number;
    open: number;
    want: boolean;
  }[] = [];
  const hookGroup = new THREE.Group();
  {
    const DISC = 0.015; // tile disc cut out of the wall
    const PIN = 0.048; // how far the pin travels out of the wall
    const towelMat2 = std({ color: "#b5a693", roughness: 1, side: THREE.DoubleSide });
    const add = (
      surf: "left" | "preFront",
      z: number,
      y: number,
      withTowel: boolean,
      towelLen = 0.62,
      towelDeep = 0.3,
    ) => {
      const [tu, tv] = sf(surf).def.tex;
      const face = (surf === "left" ? 0 : PW_X) + ADH + T;
      const originZ = surf === "left" ? PW_ZT : D; // this surface's u axis runs from originZ towards -z
      const root = new THREE.Group();
      root.userData["hook"] = hooks.length;
      // the cut itself: a grout-coloured line, exactly as wide as the joint between tiles
      const cut = new THREE.Mesh(new THREE.RingGeometry(DISC, DISC + GAP, 48), groutMat);
      cut.rotation.y = Math.PI / 2;
      cut.position.set(face + 0.0003, y, z);
      // the disc is the wall's own tile: same material, veining continuing across the cut
      const disc = shadowed(new THREE.Mesh(new THREE.CircleGeometry(DISC, 48), tileMat), false);
      marbleUV(disc.geometry, originZ - z, y, tu, tv);
      disc.rotation.y = Math.PI / 2;
      disc.position.set(0.0018, 0, 0);
      const rim = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(DISC - 0.0005, DISC - 0.0005, PIN + 0.002, 48, 1, true), tileMat));
      rim.rotation.z = Math.PI / 2;
      rim.position.set(-PIN / 2 + 0.001, 0, 0);
      const hole = new THREE.Mesh(new THREE.CircleGeometry(DISC, 48), darkMat);
      hole.rotation.y = Math.PI / 2;
      hole.position.set(face + 0.0002, y, z);
      // pressing the tile disc pushes out a solid tile cylinder; dark recess behind it
      const shaft = new THREE.Group();
      // the whole hook is a solid tile cylinder: no metal pin
      shaft.add(disc, rim);
      shaft.position.set(face, y, z);
      let towel: THREE.Object3D | null = null;
      if (withTowel) {
        const tw = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.03, towelLen, towelDeep), towelMat2));
        tw.position.set(face + 0.03, y - towelLen / 2 - 0.02, z);
        tw.rotation.z = 0.04;
        tw.visible = false;
        towel = tw;
      }
      root.add(cut, hole, shaft);
      if (towel) root.add(towel);
      hookGroup.add(root);
      hooks.push({ root, shaft, towel, face, open: 0, want: true });
    };
    // two next to the shower opening, one to the left of the basin
    add("left", 1.08, 1.62, true);
    add("left", 1.4, 1.62, false);
    add("preFront", 2.78, 1.45, true, 0.45, 0.12);
    hooks[1]!.want = false;
  }
  hookGroup.visible = false;
  scene.add(hookGroup);

  // LED strips: shower niche (top + under each shelf) and the WC niche
  const nicheLeds = new THREE.Group();
  scene.add(nicheLeds);
  {
    const addLed = (x0: number, x1: number, y: number, mat: THREE.Material) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.006, 0.01), mat);
      m.position.set((x0 + x1) / 2, y, -0.02);
      nicheLeds.add(m);
    };
    addLed(NI.x0 + 0.03, NI.x1 - 0.03, NI.y1 - 0.024, ledMat);
    for (const y of NI.shelves) addLed(NI.x0 + 0.03, NI.x1 - 0.03, y - 0.016, ledMat);
    const wl = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.006, WN.z1 - WN.z0 - 0.06), wcLedMat);
    wl.position.set(PW_X - 0.012, WN.y1 - 0.024, WCZ + 0.025);
    nicheLeds.add(wl);
  }

  // candles (romantic mode / filled tub)
  const candles = new THREE.Group();
  const flames: THREE.Mesh[] = [];
  {
    const waxMat = std({ color: "#f3ecdf", roughness: 0.7 });
    const flameGeo = new THREE.SphereGeometry(0.008, 10, 8);
    flameGeo.scale(1, 2.2, 1);
    const addCandle = (x: number, y: number, z: number, h: number, r: number) => {
      const body = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20), waxMat));
      body.position.set(x, y + h / 2, z);
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.set(x, y + h + 0.016, z);
      flame.userData = { seed: Math.random() * 10, y: y + h + 0.016 };
      flames.push(flame);
      candles.add(body, flame);
    };
    const deckY = TUB_TOP + 0.025;
    addCandle(3.14, deckY, 0.24, 0.07, 0.022);
    addCandle(3.14, deckY, 0.4, 0.11, 0.024);
    addCandle(3.14, deckY, 0.56, 0.05, 0.022);
    addCandle(2.9, 0.016, 1.02, 0.18, 0.04);
    addCandle(3.04, 0.016, 1.1, 0.12, 0.035);
    addCandle(0.17, WN.y0 + 0.016, WN.z1 - 0.26, 0.05, 0.022);
  }
  candles.visible = false;
  scene.add(candles);

  // flush button glow outline
  const glow = (() => {
    const s = sf("preFront");
    const u = D - WCZ;
    const pts = [
      s.world(u - 0.14, BTN_Y - 0.12, 0.0175),
      s.world(u + 0.14, BTN_Y - 0.12, 0.0175),
      s.world(u + 0.14, BTN_Y + 0.12, 0.0175),
      s.world(u - 0.14, BTN_Y + 0.12, 0.0175),
    ];
    const l = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), glowMat);
    scene.add(l);
    return l;
  })();

  // rain from the shower head: short streaks in a widening cone (reads as falling water, not a block)
  const RAIN = 520;
  const HEAD = { x: 0.7, y: 2.2, z: 0.5 };
  const rainPos = new Float32Array(RAIN * 6);
  const rainSeed = rng(9);
  const rainAng = new Float32Array(RAIN);
  const rainRad = new Float32Array(RAIN);
  const rainY = new Float32Array(RAIN);
  for (let i = 0; i < RAIN; i++) {
    rainAng[i] = rainSeed() * Math.PI * 2;
    rainRad[i] = Math.sqrt(rainSeed());
    rainY[i] = 0.02 + rainSeed() * (HEAD.y - 0.02);
  }
  const placeDrop = (i: number) => {
    const y = rainY[i]!;
    const spread = (0.07 + (HEAD.y - y) * 0.07) * rainRad[i]!;
    const x = HEAD.x + Math.cos(rainAng[i]!) * spread;
    const z = HEAD.z + Math.sin(rainAng[i]!) * spread;
    rainPos.set([x, y, z, x, Math.min(HEAD.y, y + 0.07), z], i * 6);
  };
  for (let i = 0; i < RAIN; i++) placeDrop(i);
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
  const rainMat = new THREE.LineBasicMaterial({ color: "#6f98a8", transparent: true, opacity: 0, depthWrite: false });
  disposables.push(rainMat);
  const rain = new THREE.LineSegments(rainGeo, rainMat);
  rain.frustumCulled = false;
  rain.visible = false;
  scene.add(rain);
  const puddle = new THREE.Mesh(new THREE.CircleGeometry(0.22, 32), waterMat.clone());
  disposables.push(puddle.material as THREE.Material);
  puddle.rotation.x = -Math.PI / 2;
  puddle.position.set(0.7, 0.0175, 0.5);
  puddle.visible = false;
  scene.add(puddle);

  /* ---------------------------------------------------------------- tools */
  const tools = {
    roller: new THREE.Group(),
    lath: new THREE.Group(),
    trowel: new THREE.Group(),
    float: new THREE.Group(),
    sponge: new THREE.Group(),
    straight: new THREE.Group(),
    grinder: new THREE.Group(),
  };
  const grinderDisc = new THREE.Group();
  {
    const r = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.24, 24), std({ color: "#6f8796", roughness: 1 })));
    r.rotation.z = Math.PI / 2;
    r.position.z = 0.034;
    const frame = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.18), darkMat));
    frame.position.set(0.13, -0.06, 0.1);
    frame.rotation.x = 0.6;
    const handle = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.3, 12), brassMat));
    handle.position.set(0.13, -0.2, 0.2);
    handle.rotation.x = 0.5;
    tools.roller.add(r, frame, handle);

    const lath = shadowed(new THREE.Mesh(new THREE.BoxGeometry(SH_X + 0.2, 0.1, 0.02), steelMat));
    lath.rotation.x = -0.25;
    tools.lath.add(lath);

    const plate = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.003), steelMat));
    plate.position.z = 0.006;
    const th = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.03, 0.03), darkMat));
    th.position.z = 0.05;
    const post = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.04), darkMat));
    post.position.z = 0.025;
    tools.trowel.add(plate, th, post);

    const fp = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.1, 0.02), std({ color: "#2f3033", roughness: 0.8 })));
    fp.position.z = 0.012;
    const fh = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.03), brassMat));
    fh.position.z = 0.05;
    tools.float.add(fp, fh);

    const sp = shadowed(new THREE.Mesh(new RoundedBoxGeometry(0.17, 0.11, 0.05, 3, 0.015), std({ color: "#d8b46a", roughness: 1 })));
    sp.position.z = 0.028;
    tools.sponge.add(sp);

    // 2 m straightedge with a level vial, standing on its edge
    const se = shadowed(new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.025, 0.09), aluMat));
    se.position.z = 0.045;
    const vial = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.03), basic({ color: "#c7e86a" })));
    vial.position.set(0, 0, 0.07);
    tools.straight.add(se, vial);

    // floor grinder: housing, spinning disc and handle
    const housing = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.08, 32), std({ color: "#c2463a", roughness: 0.5 })));
    housing.rotation.x = Math.PI / 2;
    housing.position.z = 0.06;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.012, 24), darkMat);
    disc.rotation.x = Math.PI / 2;
    const spokeMat = std({ color: "#8c8f93", metalness: 0.8, roughness: 0.4 });
    for (let i = 0; i < 4; i++) {
      const sp2 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.004), spokeMat);
      sp2.rotation.z = (i * Math.PI) / 4;
      sp2.position.z = -0.006;
      grinderDisc.add(sp2);
    }
    grinderDisc.add(disc);
    grinderDisc.position.z = 0.012;
    const bar = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.75, 12), darkMat));
    bar.position.set(0, -0.3, 0.32);
    bar.rotation.x = -0.9;
    const grip = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.36, 12), brassMat));
    grip.rotation.z = Math.PI / 2;
    grip.position.set(0, -0.6, 0.55);
    tools.grinder.add(housing, grinderDisc, bar, grip);

    Object.values(tools).forEach((t) => {
      t.visible = false;
      scene.add(t);
    });
  }
  const placeTool = (tool: THREE.Object3D, surf: Surface, u: number, v: number, d: number, tilt = 0, roll = 0) => {
    surf.world(u, v, d, tool.position);
    tool.quaternion.copy(surf.group.quaternion);
    if (tilt || roll) tool.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, 0, roll)));
    tool.visible = true;
  };

  // rotating laser level on a tripod, projecting a red line round the room
  const laser = new THREE.Group();
  {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const leg = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.0, 8), darkMat));
      leg.position.set(Math.cos(a) * 0.12, 0.48, Math.sin(a) * 0.12);
      leg.rotation.set(Math.sin(a) * 0.24, 0, -Math.cos(a) * 0.24);
      laser.add(leg);
    }
    const head = shadowed(new THREE.Mesh(new RoundedBoxGeometry(0.11, 0.12, 0.11, 2, 0.015), std({ color: "#e0a52a", roughness: 0.5 })));
    head.position.y = 1.03;
    laser.add(head);
    laser.position.set(1.9, 0, 1.75);
    const lines: [number, number, number, number, number, number][] = [
      [0, 0.9985, 0.0012, W, 1.0015, 0.0013],
      [0.0012, 0.9985, 0, 0.0013, 1.0015, PW_Z],
    ];
    for (const [x0, y0, z0, x1, y1, z1] of lines) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.0001, x1 - x0), y1 - y0, Math.max(0.0001, z1 - z0)), laserMat);
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      scene.add(m);
    }
    const v1 = new THREE.Mesh(new THREE.BoxGeometry(0.003, H, 0.0001), laserMat);
    v1.position.set(1.9, H / 2, 0.0013);
    scene.add(v1);
  }
  laser.visible = false;
  scene.add(laser);

  // grinding dust
  const DUST = 90;
  const dustPos = new Float32Array(DUST * 3);
  const dustVel = new Float32Array(DUST * 3);
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({ color: "#d8d2c6", size: 0.02, transparent: true, opacity: 0, depthWrite: false });
  disposables.push(dustMat);
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.visible = false;
  scene.add(dust);
  const dustSeed = rng(17);

  /* ---------------------------------------------------------------- state & colours */
  const groutStyles: Record<GroutType, { color: string; rough: number }> = {
    cement: { color: "#b9b2a6", rough: 0.92 },
    epoxy: { color: "#dedad3", rough: 0.3 },
  };
  const setGrout = (g: GroutType) => {
    groutMat.color.set(groutStyles[g].color);
    groutMat.roughness = groutStyles[g].rough;
  };
  setGrout("cement");

  const st = {
    waterproof: "A" as WaterproofType,
    corner: null as CornerType | null,
    button: null as ButtonType | null,
    nicheLit: true,
    roomLit: true,
    bathHovered: false,
    moodTarget: 0,
    mood: 0,
    showerTarget: 0,
    shower: 0,
    tubTarget: 0,
    basin: 0,
    tub: 0,
    candles: 0,
    door: 0,
    focus: null as number | null,
  };

  const hazeTint = new THREE.Color("#d6d1c7");
  const white = new THREE.Color("#ffffff");
  const ledOff = new THREE.Color("#2a2b2f");
  const ledOn = new THREE.Color("#ffe1b0");

  /* ---------------------------------------------------------------- camera keyframes (one per step) */
  const KF: { p: V3; t: V3 }[] = [
    { p: [4.8, 3.1, 5.2], t: [1.4, 0.55, 1.2] },
    { p: [2.6, 1.7, 2.8], t: [0.7, 0.0, 0.45] },
    { p: [2.7, 1.95, 2.9], t: [0.45, 0.9, 0.45] },
    { p: [4.7, 2.9, 5.1], t: [1.4, 0.95, 1.1] },
    { p: [3.4, 1.4, 4.2], t: [1.7, 0.05, 2.0] },
    { p: [4.5, 2.05, 5.1], t: [1.3, 1.15, 1.0] },
    { p: [1.25, 1.35, 1.05], t: [0.25, 1.15, 1.78] },
    { p: [3.5, 1.6, 3.4], t: [1.3, 1.0, 0.6] },
    { p: [3.4, 1.7, 3.3], t: [0.8, 1.05, 1.1] },
    { p: [1.0, 1.12, 2.06], t: [0.25, 1.02, 2.3] },
    { p: [...FINISH_DETAILS[0].camera], t: [...FINISH_DETAILS[0].target] },
    { p: [2.4, 2.25, 2.4], t: [0.12, 2.15, 2.32] },
    { p: [...FINISH_DETAILS[1].camera], t: [...FINISH_DETAILS[1].target] },
    { p: [...FINISH_DETAILS[2].camera], t: [...FINISH_DETAILS[2].target] },
    { p: [1.75, 1.65, 2.0], t: [0.02, 1.45, 1.2] },
    { p: [4.9, 2.25, 5.3], t: [1.35, 0.95, 1.25] },
  ];
  // viewpoints used by the explanation hotspots once the bathroom is finished
  const FOCUS: { p: V3; t: V3 }[] = KF.map((k) => ({ p: [...k.p] as V3, t: [...k.t] as V3 }));
  FOCUS[0] = { p: [3.6, 1.9, 2.9], t: [1.5, 1.1, 0.3] };
  FOCUS[3] = { p: [2.8, 1.7, 2.6], t: [0.6, 1.1, 0.6] };
  FOCUS[5] = { p: [1.6, 1.6, 2.6], t: [0.25, 1.75, 2.3] };
  FOCUS[7] = { p: [2.8, 1.4, 2.4], t: [1.9, 0.9, 0.1] };
  FOCUS[8] = { p: [2.9, 1.4, 2.2], t: [2.3, 0.6, 0.3] };

  for (const d of FINISH_DETAILS) FOCUS.push({ p: [...d.camera], t: [...d.target] });
  FOCUS[N + 4] = { p: [NI.x0 + nw / 2 + 0.35, NI.y1 + 0.15, 1.2], t: [NI.x0 + nw / 2, NI.y0 + nh / 2, 0] };
  FOCUS[N + 5] = { p: [NI.x0 + nw / 2 + 0.25, (NI.shelves[0] ?? NI.y0) + 0.18, 0.85], t: [NI.x0 + nw / 2, NI.shelves[0] ?? NI.y0, -0.02] };

  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const desiredPos = new THREE.Vector3();
  const desiredTarget = new THREE.Vector3();
  const camPos = new THREE.Vector3(...KF[0]!.p);
  const camTarget = new THREE.Vector3(...KF[0]!.t);
  let distMul = 1;
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  const yAxis = new THREE.Vector3(0, 1, 0);

  const computeCamera = (s: number, time: number, finished: boolean) => {
    if (finished && st.focus !== null) {
      const f = FOCUS[st.focus]!;
      desiredTarget.set(...f.t);
      desiredPos.set(...f.p);
      const off = tmpA.copy(desiredPos).sub(desiredTarget);
      off.applyAxisAngle(yAxis, Math.sin(time * 0.15) * 0.03 + pointer.sx * 0.05);
      off.y += pointer.sy * 0.12;
      off.multiplyScalar(Math.min(distMul, 1.35));
      desiredPos.copy(desiredTarget).add(off);
      return;
    }
    const i = Math.min(N - 1, Math.floor(s));
    const f = s - i;
    // the button step already zooms out at its end, so the last step starts from there
    const a = i === STAGE_INDEX.handover ? KF[STAGE_INDEX.handover]! : KF[Math.max(0, i - 1)]!;
    const b = KF[i]!;
    const k = i === 0 ? 1 : easeInOut(ramp(f, 0, i === 9 ? 0.14 : 0.32));
    desiredTarget.set(...a.t).lerp(tmpB.set(...b.t), k);
    desiredPos.set(...a.p).lerp(tmpA.set(...b.p), k);
    if (i === 9) {
      const out = easeInOut(ramp(f, 0.86, 1));
      desiredTarget.lerp(tmpB.set(...KF[STAGE_INDEX.handover]!.t), out);
      desiredPos.lerp(tmpA.set(...KF[STAGE_INDEX.handover]!.p), out);
    }
    const off = tmpA.copy(desiredPos).sub(desiredTarget);
    let ang = Math.sin(time * 0.12) * 0.025;
    if (i === N - 1) ang += -0.22 + 0.5 * easeInOut(ramp(f, 0.25, 1));
    if (i === 6) ang += -0.12 + 0.24 * easeInOut(f);
    off.applyAxisAngle(yAxis, ang + pointer.sx * 0.06);
    off.y += pointer.sy * 0.25;
    const close = i === 6 || i === 9 || (i >= STAGE_INDEX.basin && i <= STAGE_INDEX.hooks);
    off.multiplyScalar(close ? Math.min(distMul, 1.3) : distMul);
    desiredPos.copy(desiredTarget).add(off);
  };

  /* ---------------------------------------------------------------- update */
  const wipeUpdate = (list: Wipe[], s: number, tool: THREE.Group | null, show = true) => {
    let active: { w: Wipe; p: number } | null = null;
    for (const w of list) {
      const p = show ? ramp(s, w.t0, w.t1) : 0;
      w.mesh.visible = p > 0;
      w.mesh.scale.y = Math.max(0.001, easeInOut(p));
      if (p > 0 && p < 1) active = { w, p };
    }
    if (tool && active) {
      const { w, p } = active;
      const r = w.rect;
      const u = r.u0 + (r.u1 - r.u0) * (0.5 + 0.38 * Math.sin(p * Math.PI * 7));
      const v = r.v0 + (r.v1 - r.v0) * easeInOut(p);
      placeTool(tool, w.surf, u, v, 0.004);
      return true;
    }
    return false;
  };

  const cornerAt = (s: number): CornerType | null => {
    if (s < 6.04) return null;
    if (s < 7 && st.corner === null) return s < 6.5 ? "trim" : "jolly";
    return st.corner ?? "jolly";
  };
  const buttonAt = (s: number): ButtonType => buttonAtStage(s, st.button);

  const update = (s: number, dt: number, time: number, finished: boolean) => {
    // 0 preparation: flatness check, grinding, primer
    const lz = bell(s, 0.04, 0.38, 0.04);
    laser.visible = lz > 0;
    laserMat.opacity = lz * (0.75 + 0.25 * Math.sin(time * 20));
    const se = ramp(s, 0.06, 0.34);
    if (se > 0 && se < 1) {
      if (se < 0.5) {
        const q = se / 0.5;
        placeTool(tools.straight, sf("floor"), 1.7 + Math.sin(q * Math.PI) * 0.2, 0.5 + q * 1.6, 0.0, 0, (q - 0.5) * 0.9);
      } else {
        const q = (se - 0.5) / 0.5;
        placeTool(tools.straight, sf("back"), 0.3 + q * 2.4, 1.15, 0.0, 0, Math.PI / 2);
      }
    } else tools.straight.visible = false;
    const grindActive = wipeUpdate(wipes.sand, s, tools.grinder);
    if (!grindActive) tools.grinder.visible = false;
    grinderDisc.rotation.z = time * 40;
    const dz = bell(s, 0.38, 0.6, 0.03);
    dust.visible = dz > 0 && tools.grinder.visible;
    dustMat.opacity = dz * 0.7;
    if (dust.visible) {
      for (let i = 0; i < DUST; i++) {
        let life = dustVel[i * 3 + 1]!;
        life -= dt * (0.6 + (i % 5) * 0.15);
        if (life <= 0) {
          const a = dustSeed() * Math.PI * 2;
          dustPos[i * 3] = tools.grinder.position.x + Math.cos(a) * 0.15;
          dustPos[i * 3 + 1] = 0.02;
          dustPos[i * 3 + 2] = tools.grinder.position.z + Math.sin(a) * 0.15;
          dustVel[i * 3] = Math.cos(a) * 0.25;
          dustVel[i * 3 + 2] = Math.sin(a) * 0.25;
          life = 1;
        }
        dustVel[i * 3 + 1] = life;
        dustPos[i * 3] = dustPos[i * 3]! + dustVel[i * 3]! * dt;
        dustPos[i * 3 + 1] = dustPos[i * 3 + 1]! + dt * 0.12;
        dustPos[i * 3 + 2] = dustPos[i * 3 + 2]! + dustVel[i * 3 + 2]! * dt;
      }
      (dustGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    }
    const rollerPrimer = wipeUpdate(wipes.primer, s, tools.roller);
    const tb = ramp(s, TUB_INSTALL.from, TUB_INSTALL.to);
    tub.visible = tb > 0;
    tub.position.y = (1 - easeOut(tb)) * 0.9;
    const enclosureProgress = ramp(s, TUB_ENCLOSURE.from, TUB_ENCLOSURE.to);
    tubEnclosure.visible = enclosureProgress > 0;
    tubEnclosure.scale.y = Math.max(0.001, easeOut(enclosureProgress));
    sf("tubFront").group.visible = s >= TUB_ENCLOSURE.to;
    sf("tubSide").group.visible = s >= TUB_ENCLOSURE.to;

    // 1 drain & screed
    const dr = ramp(s, 1.04, 1.28);
    drain.visible = dr > 0;
    drain.position.y = (1 - easeOut(dr)) * 0.9;
    const sc = ramp(s, 1.28, 1.6);
    screed.visible = sc > 0;
    screed.scale.y = Math.max(0.01, easeOut(sc));
    const la = ramp(s, 1.52, 1.86);
    tools.lath.visible = la > 0 && la < 1;
    tools.lath.position.set(SH_X / 2, 0.03, 1.15 - easeInOut(la) * 1.0);
    tools.lath.rotation.y = Math.sin(la * Math.PI * 6) * 0.04;
    const arrowA = bell(s, 1.58, 2.0, 0.08);
    arrowMat.opacity = arrowA * 0.95;
    arrows.forEach((m) => {
      m.visible = arrowA > 0;
      const ph = (time * 0.35 + (m.userData["phase"] as number)) % 1;
      // travel from the front of the shower towards the drain at the back wall
      m.position.set(m.userData["x"] as number, 0.006 - 0.012 * (1 - ph) * 0, 1.05 - ph * 0.82);
      m.scale.setScalar(0.9 + 0.2 * Math.sin(ph * Math.PI));
    });

    // 2 tapes, collar, sleeves
    for (const g of grows) {
      const p = ramp(s, g.t0, g.t1);
      // tapes end up inside the waterproofing: never let them show through the tiles
      g.obj.visible = p > 0 && s < STAGE_INDEX.floor;
      const e = Math.max(0.001, easeOut(p));
      if (g.axis === "x") g.obj.scale.set(e, 1, 1);
      else g.obj.scale.setScalar(e);
    }

    // 2 first layer (tapes are pressed into it) · 3 second layer: variant A or B
    const roll1 = wipeUpdate(wipes.wp1, s, tools.roller);
    const trowel1 = wipeUpdate(wipes.wp1Floor, s, tools.float);
    const isA = st.waterproof === "A";
    const rollA = wipeUpdate(wipes.wpA, s, isA ? tools.roller : null, isA);
    const trowelA0 = wipeUpdate(wipes.wpAFloor, s, isA ? tools.float : null, isA);
    const trowelA = trowelA0 || trowel1;
    wipeUpdate(wipes.wpB, s, null, !isA);
    const bandRoll = wipeUpdate(wipes.wpBand, s, isA ? null : tools.roller, !isA);
    for (const g of bandGrows) {
      const p = isA ? 0 : ramp(s, g.t0, g.t1);
      g.obj.visible = p > 0 && s < STAGE_INDEX.floor + 0.4;
      g.obj.scale.set(Math.max(0.001, easeOut(p)), 1, 1);
    }
    if (!rollerPrimer && !rollA && !roll1 && !bandRoll) tools.roller.visible = false;

    // 4 & 5 tiles (butterfly)
    let activePatch: { t: Tile; p: number } | null = null;
    for (const t of tiles) {
      const pa = ramp(s, t.t0 - t.lead, t.t0 + t.dur * 0.15);
      t.patch.visible = pa > 0;
      t.patch.scale.x = Math.max(0.001, easeOut(pa));
      if (pa > 0 && pa < 1) activePatch = { t, p: pa };
      const a = ramp(s, t.t0, t.t0 + t.dur);
      t.mesh.visible = a > 0;
      if (a > 0) {
        const flip = easeInOut(ramp(a, 0.3, 0.8));
        const lift = 1 - easeOut(ramp(a, 0.55, 1));
        t.mesh.rotation.set((1 - flip) * 0.18, (1 - flip) * Math.PI, 0);
        t.mesh.position.z = ADH + T / 2 + lift * 0.42;
      }
      const g = ramp(s, t.g0, t.g0 + 0.09);
      t.grout.visible = g > 0;
      t.grout.scale.setScalar(Math.max(0.001, easeOut(g)));
    }
    if (activePatch && s >= 4 && s < 6) {
      const { t, p } = activePatch;
      const r = t.rect;
      const v = (r.v0 + r.v1) / 2 + Math.sin(p * Math.PI * 4) * (r.v1 - r.v0) * 0.2;
      placeTool(tools.trowel, t.surf, r.u0 + (r.u1 - r.u0) * p, v, 0.012, 0.55, 0.2);
    } else tools.trowel.visible = false;
    const di = ramp(s, 4.9, 4.98);
    drainInsert.visible = di > 0;
    drainInsert.position.y = (1 - easeOut(di)) * 0.3;

    // hidden cabinet door: swings open at handover and when its explanation is open
    const detailState = concealedDetailState(s, st.focus, finished, N + 1);
    const doorWant = detailState.cabinetOpen ? 1 : 0;
    cabinetContents.visible = s >= STAGE_INDEX.cabinet;
    st.door += (doorWant - st.door) * Math.min(1, dt * 4);
    if (doorTile && s > 5.9) {
      const r = doorTile.rect;
      const w = r.u1 - r.u0;
      const a = easeInOut(st.door) * 1.25;
      doorTile.mesh.rotation.set(0, a, 0);
      doorTile.mesh.position.x = r.u1 - (w / 2) * Math.cos(a);
      doorTile.mesh.position.z = ADH + T / 2 + (w / 2) * Math.sin(a);
      doorTile.patch.visible = false;
      doorTile.grout.visible = false;
    }

    for (const door of detailDoors) {
      const { tile, detail } = door;
      if (s < 5.9) continue;
      const open = ((detail === N + 1 && detailState.accessoriesOpen) || (finished && st.focus === detail)) ? 1.1 : 0;
      door.angle += (open - door.angle) * Math.min(1, dt * 4);
      if (door.tilt) {
        // brush door hinged at the bottom: the top tips out towards the room
        const a = door.angle * 0.75;
        const halfV = (tile.rect.v1 - tile.rect.v0) / 2;
        tile.mesh.rotation.set(a, 0, 0);
        tile.mesh.position.y = tile.rect.v0 + halfV * Math.cos(a);
        tile.mesh.position.z = ADH + T / 2 + halfV * Math.sin(a);
      } else {
        tile.mesh.rotation.y = door.angle;
        const half = (tile.rect.u1 - tile.rect.u0) / 2;
        tile.mesh.position.x = tile.rect.u1 - half * Math.cos(tile.mesh.rotation.y);
        tile.mesh.position.z = ADH + T / 2 + half * Math.sin(tile.mesh.rotation.y);
      }
      tile.patch.visible = false;
      tile.grout.visible = false;
    }
    const accessoriesVisible = detailDoors.some((door) => door.detail === N + 1 && door.angle > 0.15);
    brush.visible = accessoriesVisible;

    // 6 corner: trim vs Jolly
    const corner = cornerAt(s);
    const ct = ramp(s, 6.04, 6.16);
    trim.visible = corner === "trim";
    trim.scale.y = Math.max(0.001, s < 6.5 ? easeOut(ct) : 1);
    jolly.visible = corner === "jolly";
    nicheTrim.visible = corner === "trim";
    nicheJolly.visible = corner === "jolly";

    // 9 flush buttons
    const bv = buttonAt(s);
    (Object.keys(buttonVariants) as ButtonType[]).forEach((k) => (buttonVariants[k].group.visible = k === bv));
    let press = bell(s, 10.72, 10.84, 0.05);
    if (s >= 9 && s < 10) {
      const bi = BUTTON_ORDER.indexOf(bv);
      const w0 = st.button ? 9.0 : BUTTON_SPLITS[bi]!;
      const w1 = st.button ? 9.86 : Math.min(9.86, BUTTON_SPLITS[bi + 1]!);
      press = bell(s, w0 + (w1 - w0) * 0.55, w0 + (w1 - w0) * 0.75, 0.03);
    }
    buttonVariants[bv].press.position.z = -press * 0.004;
    glowMat.opacity = bell(s, 9.04, 9.95, 0.08) * (0.55 + 0.45 * Math.sin(time * 3));

    // 7 grout float, haze
    const fl = ramp(s, 7.06, 7.86);
    if (fl > 0 && fl < 1) {
      const onBack = fl < 0.55;
      const q = onBack ? fl / 0.55 : (fl - 0.55) / 0.45;
      const surf = onBack ? sf("back") : sf("left");
      const u = onBack ? 0.2 + q * 2.8 : 0.3 + q * 1.3;
      const v = (onBack && u > TUB_X0 ? 0.9 : 0.3) + Math.abs(Math.sin(q * Math.PI * 5)) * 1.4;
      placeTool(tools.float, surf, u, v, 0.017, 0, 0.7);
    } else if (!trowelA) tools.float.visible = false;
    const haze = ramp(s, 7.1, 7.55) * (1 - ramp(s, 8.1, 8.75));
    tileMat.roughness = 0.14 + 0.62 * haze;
    tileMat.clearcoat = 0.55 * (1 - haze);
    tileMat.color.copy(white).lerp(hazeTint, haze);

    // 8 sponge + shine sweep
    const spg = ramp(s, 8.06, 8.78);
    if (spg > 0 && spg < 1) {
      const onBack = spg < 0.6;
      const q = onBack ? spg / 0.6 : (spg - 0.6) / 0.4;
      const surf = onBack ? sf("back") : sf("left");
      const u = (onBack ? 0.2 + q * 2.8 : 0.3 + q * 1.3) + Math.cos(time * 9) * 0.06;
      const v = (onBack && u > TUB_X0 ? 1.4 : 1.0) + Math.sin(q * Math.PI * 4) * 0.5 + Math.sin(time * 9) * 0.05;
      placeTool(tools.sponge, surf, u, v, 0.016);
    } else tools.sponge.visible = false;
    const sw = ramp(s, 8.45, 9.0);
    sweep.intensity = bell(s, 8.45, 9.0, 0.1) * 6;
    sweep.position.set(-0.2 + sw * 3.4, 1.5, 0.7);

    // 10 handover
    for (const ap of appears) {
      const p = ramp(s, ap.t0, ap.t1);
      ap.obj.visible = p > 0;
      const e = easeOut(p);
      ap.obj.position.set(ap.base.x + ap.from[0] * (1 - e), ap.base.y + ap.from[1] * (1 - e), ap.base.z + ap.from[2] * (1 - e));
    }
    paper.visible = accessoriesVisible;
    {
      const bs = s - STAGE_INDEX.basin;
      const want = (bs >= 0.1 && bs < 0.4) || (finished && (st.focus === STAGE_INDEX.basin || st.focus === N)) ? 1 : 0;
      drawerOpen += (want - drawerOpen) * Math.min(1, dt * 3);
      drawers.forEach((d, i) => { d.position.x = drawerOpen * (i === 0 ? 0.34 : 0.26); });
      drawerLight.intensity = drawerOpen * 1.6;
      drawerLedMat.color.copy(ledOff).lerp(ledOn, drawerOpen);
      const lifting = finished && st.focus === N + 6;
      drainFocusT = lifting ? Math.min(1, drainFocusT + dt / 2) : 0;
      // slow, deliberate removal: rise, hold over the open channel, then settle back
      const lift = lifting
        ? easeInOut(drainFocusT)
        : Math.min(easeInOut(ramp(bs, 0.3, 0.62)), 1 - easeInOut(ramp(bs, 0.84, 0.97)));
      // driven straight from the timeline so the removal always takes the same visible time
      // rise just above the channel (stays below the rim and the soap dispenser), then slide into the bowl
      drainStrip.position.y = easeInOut(ramp(lift, 0, 0.35)) * 0.085;
      drainStrip.position.x = easeInOut(ramp(lift, 0.35, 1)) * 0.3;
      drainStrip.rotation.z = 0;
    }
    {
      const want = finished && st.focus === N + 7 ? 1 : 0;
      tissueOpen += (want - tissueOpen) * Math.min(1, dt * 2.5);
      // door tips out on its bottom hinge, then the whole box slides out (refill)
      tissueBox.position.x = easeInOut(ramp(tissueOpen, 0.4, 1)) * 0.22;
    }
    const brushOpen = detailDoors.some((door) => door.tilt && door.angle > 0.05);
    paperFlap.visible = s >= 12.2 && !brushOpen;
    (paperFlap.userData["slot"] as THREE.Object3D).visible = s >= 6;
    decor.visible = detailState.decorationsVisible;
    hookGroup.visible = s >= STAGE_INDEX.hooks;
    for (const h of hooks) {
      // pop out during handover (spring overshoot), stay flush before
      const target = h.want && s >= STAGE_INDEX.hooks + 0.3 ? 1 : 0;
      h.open += (target - h.open) * Math.min(1, dt * 6);
      const o = h.open + Math.sin(h.open * Math.PI) * 0.15;
      h.shaft.position.x = h.face + o * 0.048;
      if (h.towel) h.towel.visible = h.open > 0.9;
    }
    nicheLeds.visible = s >= 5.9;
    glassMat.opacity = 0.2 * easeOut(ramp(s, 15.04, 15.22));
    stubs.visible = s < 15.1;

    // lights & mood (romantic: daylight dims, every lamp, LED and candle glows)
    const m = st.mood;
    const lights = Math.max(easeInOut(ramp(s, 10.0, 10.2)), m) * (!finished || st.roomLit ? 1 : 0);
    spotShower.intensity = lights * (9 + m * 3);
    spotTub.intensity = lights * (7 + m * 5);
    spotWc.intensity = lights * (3 + m * 2);
    const nicheLevels = nicheLightLevels(st.nicheLit, s >= 5.9);
    const nl = nicheLevels.shower;
    nicheLight.intensity = nl * (1.6 + m * 1.8);
    ledMat.color.copy(ledOff).lerp(ledOn, nl);
    wcNicheLight.intensity = nicheLevels.wc * (1.4 + m * 1.6);
    wcLedMat.color.copy(ledOff).lerp(ledOn, nicheLevels.wc);
    const ambientFactor = finished && !st.roomLit ? 0.12 : 1;
    key.intensity = 1.75 * (1 - 0.86 * m) * ambientFactor;
    fill.intensity = 0.45 * (1 - 0.9 * m) * ambientFactor;
    hemi.intensity = 0.25 * (1 - 0.6 * m) * Math.max(ambientFactor, 0.4);
    scene.environmentIntensity = 0.45 * (1 - 0.72 * m) * Math.max(ambientFactor, 0.3);
    bg.copy(bgDay).lerp(bgNight, m);

    // candles
    const showCandles = finished && (st.moodTarget > 0 || st.tubTarget > 0) ? 1 : 0;
    st.candles += (showCandles - st.candles) * Math.min(1, dt * 3);
    candles.visible = st.candles > 0.02;
    candles.scale.setScalar(1);
    flames.forEach((f) => {
      const sd = f.userData["seed"] as number;
      const fl2 = 0.85 + 0.15 * Math.sin(time * 13 + sd) + 0.08 * Math.sin(time * 31 + sd * 2);
      f.scale.set(st.candles * fl2, st.candles * (0.8 + 0.4 * fl2), st.candles * fl2);
    });
    candleLight.intensity = st.candles * (1.4 + 0.35 * Math.sin(time * 11) + 0.2 * Math.sin(time * 23));

    // water: timeline shower burst at handover plus the interactive toggles;
    // while the tub is filling, the shower and the basin tap run too
    const fillOn = finished && bathFillTarget(st.tubTarget > 0, st.bathHovered, finished) > 0 ? 1 : 0;
    const showerAmt = Math.max(bell(s, 15.5, 15.8, 0.04), finished ? Math.max(st.shower, fillOn) : 0);
    rain.visible = showerAmt > 0.01;
    rainMat.opacity = showerAmt * 0.85;
    puddle.visible = rain.visible;
    (puddle.material as THREE.MeshPhysicalMaterial).opacity = showerAmt * 0.35;
    puddle.scale.setScalar(0.8 + 0.08 * Math.sin(time * 6));
    if (rain.visible) {
      for (let i = 0; i < RAIN; i++) {
        let y = rainY[i]! - dt * (2.6 + (i % 7) * 0.12);
        if (y < 0.02) y += HEAD.y - 0.02;
        rainY[i] = y;
        placeDrop(i);
      }
      (rainGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    }
    const level = finished ? st.tub : 0;
    water.visible = level > 0.005;
    water.position.y = 0.16 + easeOut(level) * 0.32 + Math.sin(time * 1.7) * 0.0012;
    waterMat.opacity = Math.min(0.6, level * 4);
    const filling = bathFillTarget(st.tubTarget > 0, st.bathHovered, finished) > 0 && st.tub < 0.995;
    container.dataset["bathFilling"] = String(filling);
    container.dataset["bathHovered"] = String(st.bathHovered);
    container.dataset["waterLevel"] = st.tub.toFixed(3);
    container.dataset["roomLit"] = String(st.roomLit);
    container.dataset["nichesLit"] = String(st.nicheLit);
    spoutStream.visible = filling;
    if (filling) {
      const top = 0.8;
      const bottom = water.visible ? water.position.y : 0.16;
      spoutStream.scale.y = top - bottom;
      spoutStream.position.set(2.35, (top + bottom) / 2, 0.19);
    }
    // basin tap runs while the tub fills; water gathers in the basin
    st.basin += (fillOn - st.basin) * Math.min(1, dt * 1.2);
    tapStream.visible = st.basin > 0.02;
    tapStreamMat.opacity = Math.min(0.6, st.basin * 2);
    if (tapStream.visible) {
      const top = 1.018;
      const bottom = 0.79;
      tapStream.scale.y = top - bottom;
      tapStream.position.set(0.487, (top + bottom) / 2, 3.343);
    }
    basinWater.visible = st.basin > 0.02;
    basinWater.position.y = 0.742 + easeOut(Math.min(1, st.basin)) * 0.042;
    basinWaterMat.opacity = Math.min(0.55, st.basin * 2.2);
  };

  /* ---------------------------------------------------------------- labels & hotspots */
  let labelEls = new Map<string, HTMLElement>();
  let hotspotEls = new Map<number, HTMLElement>();
  const labelOverride: Record<string, V3> = {
    niche: [NI.x0 + nw / 2, shelfY + 0.01, -0.02],
  };
  const hotspotOverride: Record<number, V3> = {};
  const proj = new THREE.Vector3();
  const place = (el: HTMLElement, pos: V3, a: number, w: number, h: number, clamp = false) => {
    proj.set(...pos).project(camera);
    if (clamp && proj.z <= 1) {
      const mx = 1 - 24 / w;
      proj.x = Math.max(-mx, Math.min(mx, proj.x));
      proj.y = Math.max(-0.9, Math.min(0.9, proj.y));
    }
    if (a <= 0.001 || proj.z > 1 || Math.abs(proj.x) > 1.05 || Math.abs(proj.y) > 1.05) {
      if (el.style.opacity !== "0") el.style.opacity = "0";
      if (el.style.pointerEvents !== "none") el.style.pointerEvents = "none";
      return;
    }
    const x = (proj.x * 0.5 + 0.5) * w;
    const y = (-proj.y * 0.5 + 0.5) * h;
    el.style.opacity = String(a);
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  };
  let hotspotA = 0;
  const updateOverlays = (s: number, finished: boolean, dt: number, w: number, h: number) => {
    for (const l of LABELS) {
      const el = labelEls.get(l.id);
      if (!el) continue;
      let a = bell(s, l.from, l.to, 0.06);
      if (l.id === "trim" && st.corner !== null) a = s >= 6 && s < 7 && st.corner === "trim" ? 1 : 0;
      if (l.id === "jolly" && st.corner !== null) a = s >= 6 && s < 7 && st.corner === "jolly" ? 1 : 0;
      if (l.id.startsWith("btn-") && st.button !== null) a = s >= 9 && s < 10 && l.id === `btn-${st.button}` ? 1 : 0;
      if (l.variant && l.variant !== st.waterproof) a = 0;
      if (l.id.startsWith("wp") && finished) a = 0;
      place(el, labelOverride[l.id] ?? l.pos, a, w, h);
    }
    hotspotA += ((finished && !freeView ? 1 : 0) - hotspotA) * Math.min(1, dt * 4);
    for (const hs of [...HOTSPOTS, ...FINISH_DETAILS.map((d, i) => ({ stage: N + i, pos: [...d.pos] as V3 }))]) {
      const el = hotspotEls.get(hs.stage);
      if (!el) continue;
      const a = st.focus !== null && st.focus !== hs.stage ? hotspotA * 0.35 : hotspotA;
      place(el, hotspotOverride[hs.stage] ?? hs.pos, a, w, h, true);
      el.style.pointerEvents = a > 0.3 ? "auto" : "none";
    }
  };

  /* ---------------------------------------------------------------- sizing */
  let width = 1;
  let height = 1;
  const resize = () => {
    width = Math.max(1, container.clientWidth);
    height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height, false);
    const aspect = width / height;
    camera.aspect = aspect;
    camera.fov = aspect < 0.8 ? 50 : 40;
    distMul = (aspect >= 1.45 ? 1 : Math.pow(1.45 / aspect, aspect < 0.8 ? 0.8 : 0.7)) * (aspect >= 0.8 ? 1.15 : 1);
    const viewShift = aspect < 0.8 ? height * 0.13 : 0;
    const sideShift = width >= 1024 && aspect > 1.1 ? -width * 0.07 : 0;
    if (viewShift || sideShift) camera.setViewOffset(width, height, sideShift, viewShift, width, height);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  /* ---------------------------------------------------------------- playback */
  let progress = 0;
  let playing = !reduceMotion;
  let freeView = false;
  let controls: OrbitControls | null = null;
  const setPlaying = (v: boolean) => {
    if (playing === v) return;
    playing = v;
    cb.onPlayingChange(v);
  };
  const disableFree = () => {
    if (!controls) return;
    controls.dispose();
    controls = null;
    camPos.copy(camera.position);
  };

  const raycaster = new THREE.Raycaster();
  const pickPointer = new THREE.Vector2();
  const onPointer = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const r = container.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = ((e.clientY - r.top) / r.height) * 2 - 1;
    if (progress >= 1 && e.target === canvas) {
      pickPointer.set(pointer.x, -pointer.y);
      raycaster.setFromCamera(pickPointer, camera);
      const hits = raycaster.intersectObjects([tub, ...wallTiles.filter(t => t.surf.def.id.startsWith("tub")).map(t => t.mesh)], true);
      st.bathHovered = hits.length > 0;
    } else st.bathHovered = false;
  };
  const onLeave = () => { st.bathHovered = false; };
  const onHookClick = (e: PointerEvent) => {
    if (progress < 1 || e.target !== canvas) return;
    const r = container.getBoundingClientRect();
    pickPointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
    raycaster.setFromCamera(pickPointer, camera);
    const hit = raycaster.intersectObjects(hookGroup.children, true)[0];
    let node: THREE.Object3D | null = hit ? hit.object : null;
    while (node && node.userData["hook"] === undefined) node = node.parent;
    const h = node ? hooks[node.userData["hook"] as number] : undefined;
    if (h) h.want = !h.want;
  };
  container.addEventListener("pointerup", onHookClick);
  container.addEventListener("pointermove", onPointer);
  container.addEventListener("pointerleave", onLeave);

  let last = performance.now();
  const clock = { t: 0 };
  const frame = (now: number) => {
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
    last = now;
    clock.t += dt;
    if (playing && !freeView) {
      progress = Math.min(1, progress + dt / TOTAL_SECONDS);
      if (progress >= 1) setPlaying(false);
    }
    const finished = progress >= 1;
    const s = Math.max(0, Math.min(progressToStage(progress), N - 1e-4));
    const k = Math.min(1, dt * 1.6);
    st.mood += ((finished ? st.moodTarget : 0) - st.mood) * k;
    st.shower += (st.showerTarget - st.shower) * Math.min(1, dt * 3);
    const target = bathFillTarget(st.tubTarget > 0, st.bathHovered, finished);
    st.tub = target > st.tub ? Math.min(target, st.tub + dt * 0.12) : Math.max(target, st.tub - dt * 0.25);
    update(s, dt, clock.t, finished);
    pointer.sx += (pointer.x - pointer.sx) * Math.min(1, dt * 3);
    pointer.sy += (pointer.y - pointer.sy) * Math.min(1, dt * 3);
    if (freeView && controls) {
      controls.update();
    } else {
      computeCamera(s, clock.t, finished);
      const kk = 1 - Math.exp(-dt * (st.focus !== null ? 2.4 : 3.2));
      camPos.lerp(desiredPos, kk);
      camTarget.lerp(desiredTarget, kk);
      camera.position.copy(camPos);
      camera.lookAt(camTarget);
    }
    renderer.render(scene, camera);
    updateOverlays(s, finished, dt, width, height);
    cb.onFrame(progress);
  };

  const io = new IntersectionObserver((entries) => {
    const visible = entries.some((e) => e.isIntersecting);
    if (visible) {
      last = performance.now();
      renderer.setAnimationLoop(frame);
    } else renderer.setAnimationLoop(null);
  });
  io.observe(container);
  renderer.setAnimationLoop(frame);

  // initial pose
  computeCamera(0, 0, false);
  camPos.copy(desiredPos);
  camTarget.copy(desiredTarget);
  cb.onPlayingChange(playing);
  requestAnimationFrame(() => { container.dataset["sceneReady"] = "true"; cb.onReady(); });

  const api: BathroomScene = {
    play() {
      if (freeView) api.setFreeView(false);
      if (progress >= 1) {
        progress = 0;
        st.focus = null;
      }
      setPlaying(true);
    },
    pause() {
      setPlaying(false);
    },
    toggle() {
      if (playing) api.pause();
      else api.play();
    },
    seek(p) {
      progress = clamp01(p);
      if (progress < 1) st.focus = null;
      setPlaying(false);
    },
    seekStage(i) {
      const idx = Math.max(0, Math.min(N - 1, i));
      st.focus = null;
      progress = stageToProgress(idx + 0.001);
      setPlaying(true);
    },
    getProgress: () => progress,
    isPlaying: () => playing,
    setGrout,
    setWaterproof(t) {
      st.waterproof = t;
    },
    setDrainCover(t) {
      drainGrate.visible = t === "grate";
      if (drainTileStrip) drainTileStrip.visible = t === "tile";
    },
    setCorner(t) {
      st.corner = t;
    },
    setButton(t) {
      st.button = t;
    },
    setNicheLight(on) {
      st.nicheLit = on;
    },
    setMood(on) {
      st.moodTarget = on ? 1 : 0;
    },
    setRoomLight(on) {
      st.roomLit = on;
    },
    setShower(on) {
      st.showerTarget = on ? 1 : 0;
    },
    setTub(on) {
      st.tubTarget = on ? 1 : 0;
    },
    focus(i) {
      if (freeView) api.setFreeView(false);
      st.focus = i;
    },
    setFreeView(on) {
      freeView = on;
      if (on) {
        setPlaying(false);
        controls = new OrbitControls(camera, canvas);
        controls.target.copy(camTarget);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.enablePan = false;
        controls.minDistance = 0.8;
        controls.maxDistance = 9 * distMul;
        controls.minPolarAngle = 0.2;
        controls.maxPolarAngle = 1.48;
        controls.minAzimuthAngle = 0.02;
        controls.maxAzimuthAngle = 1.55;
        controls.update();
      } else disableFree();
    },
    setLabelElements(map) {
      labelEls = map;
    },
    setHotspotElements(map) {
      hotspotEls = map;
    },
    dispose() {
      renderer.setAnimationLoop(null);
      io.disconnect();
      ro.disconnect();
      container.removeEventListener("pointermove", onPointer);
      container.removeEventListener("pointerup", onHookClick);
      container.removeEventListener("pointerleave", onLeave);
      disableFree();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
    },
  };
  return api;
}
