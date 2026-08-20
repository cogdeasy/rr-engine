import type {
  AircraftType,
  EngineFamily,
  ModuleCode,
  ParameterDefinition,
  ParameterId,
  Region,
} from "@rr/types";

/** Static reference data: the parts of the domain that are not randomised. */

export interface EngineFamilySpec {
  family: EngineFamily;
  aircraft: AircraftType[];
  thrustLbf: number;
  fanDiameterIn: number;
  bypassRatio: number;
  entryIntoService: number;
  /** Public Rolls-Royce marketing glTF asset, when one exists for the family. */
  modelAsset: string | null;
  overhaulIntervalCycles: number;
  newEgtMargin: number;
  blurb: string;
}

export const ENGINE_FAMILIES: EngineFamilySpec[] = [
  {
    family: "Trent XWB-84",
    aircraft: ["A350-900"],
    thrustLbf: 84000,
    fanDiameterIn: 118,
    bypassRatio: 9.6,
    entryIntoService: 2015,
    modelAsset: "trent-xwb",
    overhaulIntervalCycles: 6000,
    newEgtMargin: 92,
    blurb: "The world's most efficient large aero engine in service, powering the A350-900.",
  },
  {
    family: "Trent XWB-97",
    aircraft: ["A350-1000"],
    thrustLbf: 97000,
    fanDiameterIn: 118,
    bypassRatio: 9.3,
    entryIntoService: 2018,
    modelAsset: "trent-xwb",
    overhaulIntervalCycles: 5200,
    newEgtMargin: 78,
    blurb: "Higher-thrust XWB variant with a redesigned core for the A350-1000.",
  },
  {
    family: "Trent 1000 TEN",
    aircraft: ["B787-8", "B787-9", "B787-10"],
    thrustLbf: 78000,
    fanDiameterIn: 112,
    bypassRatio: 10.8,
    entryIntoService: 2017,
    modelAsset: "trent-1000-ten",
    overhaulIntervalCycles: 4800,
    newEgtMargin: 74,
    blurb: "Thrust, Efficiency and New technology build standard for the Boeing 787 family.",
  },
  {
    family: "Trent 7000",
    aircraft: ["A330-900neo"],
    thrustLbf: 72000,
    fanDiameterIn: 112,
    bypassRatio: 10.0,
    entryIntoService: 2018,
    modelAsset: "trent-7000",
    overhaulIntervalCycles: 5000,
    newEgtMargin: 80,
    blurb: "Exclusive powerplant for the A330neo, derived from the Trent 1000 TEN.",
  },
  {
    family: "Trent 900",
    aircraft: ["A380-800"],
    thrustLbf: 80000,
    fanDiameterIn: 116,
    bypassRatio: 8.7,
    entryIntoService: 2007,
    modelAsset: null,
    overhaulIntervalCycles: 5600,
    newEgtMargin: 70,
    blurb: "Three-shaft turbofan for the A380, the quietest engine in its class at entry into service.",
  },
  {
    family: "UltraFan",
    aircraft: ["A350-1000"],
    thrustLbf: 85000,
    fanDiameterIn: 140,
    bypassRatio: 15.0,
    entryIntoService: 2030,
    modelAsset: "ultrafan",
    overhaulIntervalCycles: 7000,
    newEgtMargin: 110,
    blurb: "Geared demonstrator architecture delivering a 10% efficiency gain over the Trent XWB.",
  },
];

export interface ModuleSpec {
  code: ModuleCode;
  label: string;
  description: string;
  ataChapter: string;
  /** Indicative share of a full overhaul cost. */
  overhaulCostShare: number;
  gltfNodeHints: string[];
}

export const ENGINE_MODULES: ModuleSpec[] = [
  {
    code: "FAN",
    label: "Fan & LP compressor",
    description: "Wide-chord hollow titanium fan blades, containment casing and LP compressor stages.",
    ataChapter: "72-30",
    overhaulCostShare: 0.12,
    gltfNodeHints: ["Fan", "FanBlade", "LPC"],
  },
  {
    code: "IPC",
    label: "Intermediate pressure compressor",
    description: "Eight-stage IP compressor delivering the intermediate spool pressure rise.",
    ataChapter: "72-40",
    overhaulCostShare: 0.09,
    gltfNodeHints: ["IPC", "IPCompressor"],
  },
  {
    code: "HPC",
    label: "High pressure compressor",
    description: "Six-stage HP compressor; blade tip rub and coating loss drive efficiency decay.",
    ataChapter: "72-45",
    overhaulCostShare: 0.14,
    gltfNodeHints: ["HPC", "HPCompressor", "HPSystemComponents"],
  },
  {
    code: "COMBUSTOR",
    label: "Combustor",
    description: "Annular lean-burn combustor with tiled liner; hot-spot distress drives EGT rise.",
    ataChapter: "72-50",
    overhaulCostShare: 0.08,
    gltfNodeHints: ["Combustor", "Combustion"],
  },
  {
    code: "HPT",
    label: "High pressure turbine",
    description: "Single-stage HP turbine, single-crystal cooled blades. The primary life limiter.",
    ataChapter: "72-52",
    overhaulCostShare: 0.21,
    gltfNodeHints: ["HPT", "HPTurbine"],
  },
  {
    code: "IPT",
    label: "Intermediate pressure turbine",
    description: "Single-stage IP turbine driving the IP compressor spool.",
    ataChapter: "72-53",
    overhaulCostShare: 0.09,
    gltfNodeHints: ["IPT", "IPTurbine"],
  },
  {
    code: "LPT",
    label: "Low pressure turbine",
    description: "Multi-stage LP turbine driving the fan; sensitive to sulphidation in harsh environments.",
    ataChapter: "72-54",
    overhaulCostShare: 0.11,
    gltfNodeHints: ["LPT", "LPTurbine"],
  },
  {
    code: "GEARBOX",
    label: "Power gearbox",
    description: "Planetary reduction gearbox (UltraFan) and accessory drive train.",
    ataChapter: "72-60",
    overhaulCostShare: 0.06,
    gltfNodeHints: ["Gearbox", "PowerGearbox"],
  },
  {
    code: "ACCESSORY",
    label: "Accessory drive & externals",
    description: "Fuel pump, oil system, generators, FADEC harnesses and sensing.",
    ataChapter: "73-00",
    overhaulCostShare: 0.05,
    gltfNodeHints: ["Accessory", "Externals", "Gearbox"],
  },
  {
    code: "NACELLE",
    label: "Nacelle & thrust reverser",
    description: "Inlet cowl, fan cowl doors, thrust reverser and exhaust system.",
    ataChapter: "78-00",
    overhaulCostShare: 0.03,
    gltfNodeHints: ["Nacelle", "Cowl", "Reverser"],
  },
  {
    code: "EXTERNALS",
    label: "Bearings & shafts",
    description: "Three-shaft bearing chambers, oil scavenge and debris monitoring.",
    ataChapter: "72-20",
    overhaulCostShare: 0.02,
    gltfNodeHints: ["Bearings", "Shaft"],
  },
];

export const PARAMETERS: Record<ParameterId, ParameterDefinition> = {
  egt: {
    id: "egt",
    label: "Exhaust gas temperature",
    unit: "°C",
    nominal: { min: 620, max: 780 },
    amber: { min: 780, max: 860 },
    red: { min: 860, max: 1000 },
    direction: "higher-is-worse",
    ataChapter: "77-20",
  },
  egtMargin: {
    id: "egtMargin",
    label: "EGT margin",
    unit: "°C",
    nominal: { min: 25, max: 120 },
    amber: { min: 12, max: 25 },
    red: { min: -10, max: 12 },
    direction: "lower-is-worse",
    ataChapter: "77-20",
  },
  n1: {
    id: "n1",
    label: "Fan speed (N1)",
    unit: "%",
    nominal: { min: 82, max: 96 },
    amber: { min: 96, max: 99 },
    red: { min: 99, max: 105 },
    direction: "higher-is-worse",
    ataChapter: "77-10",
  },
  n2: {
    id: "n2",
    label: "IP spool speed (N2)",
    unit: "%",
    nominal: { min: 84, max: 97 },
    amber: { min: 97, max: 100 },
    red: { min: 100, max: 106 },
    direction: "higher-is-worse",
    ataChapter: "77-10",
  },
  n3: {
    id: "n3",
    label: "HP spool speed (N3)",
    unit: "%",
    nominal: { min: 86, max: 98 },
    amber: { min: 98, max: 101 },
    red: { min: 101, max: 107 },
    direction: "higher-is-worse",
    ataChapter: "77-10",
  },
  oilPressure: {
    id: "oilPressure",
    label: "Oil pressure",
    unit: "psi",
    nominal: { min: 60, max: 95 },
    amber: { min: 45, max: 60 },
    red: { min: 0, max: 45 },
    direction: "lower-is-worse",
    ataChapter: "79-30",
  },
  oilTemp: {
    id: "oilTemp",
    label: "Oil temperature",
    unit: "°C",
    nominal: { min: 60, max: 115 },
    amber: { min: 115, max: 135 },
    red: { min: 135, max: 200 },
    direction: "higher-is-worse",
    ataChapter: "79-30",
  },
  oilConsumption: {
    id: "oilConsumption",
    label: "Oil consumption",
    unit: "qt/h",
    nominal: { min: 0.05, max: 0.35 },
    amber: { min: 0.35, max: 0.55 },
    red: { min: 0.55, max: 1.5 },
    direction: "higher-is-worse",
    ataChapter: "79-00",
  },
  vibN1: {
    id: "vibN1",
    label: "Vibration N1",
    unit: "IPS",
    nominal: { min: 0, max: 1.6 },
    amber: { min: 1.6, max: 2.6 },
    red: { min: 2.6, max: 6 },
    direction: "higher-is-worse",
    ataChapter: "77-30",
  },
  vibN2: {
    id: "vibN2",
    label: "Vibration N2",
    unit: "IPS",
    nominal: { min: 0, max: 1.4 },
    amber: { min: 1.4, max: 2.4 },
    red: { min: 2.4, max: 6 },
    direction: "higher-is-worse",
    ataChapter: "77-30",
  },
  vibN3: {
    id: "vibN3",
    label: "Vibration N3",
    unit: "IPS",
    nominal: { min: 0, max: 1.2 },
    amber: { min: 1.2, max: 2.2 },
    red: { min: 2.2, max: 6 },
    direction: "higher-is-worse",
    ataChapter: "77-30",
  },
  fuelFlow: {
    id: "fuelFlow",
    label: "Fuel flow",
    unit: "kg/h",
    nominal: { min: 2200, max: 3400 },
    amber: { min: 3400, max: 3800 },
    red: { min: 3800, max: 5000 },
    direction: "higher-is-worse",
    ataChapter: "73-30",
  },
  t30: {
    id: "t30",
    label: "HP compressor delivery temp (T30)",
    unit: "°C",
    nominal: { min: 480, max: 610 },
    amber: { min: 610, max: 660 },
    red: { min: 660, max: 760 },
    direction: "higher-is-worse",
    ataChapter: "77-20",
  },
  p30: {
    id: "p30",
    label: "HP compressor delivery pressure (P30)",
    unit: "psia",
    nominal: { min: 380, max: 520 },
    amber: { min: 340, max: 380 },
    red: { min: 0, max: 340 },
    direction: "lower-is-worse",
    ataChapter: "77-20",
  },
  bleedPressure: {
    id: "bleedPressure",
    label: "Bleed pressure",
    unit: "psi",
    nominal: { min: 32, max: 48 },
    amber: { min: 26, max: 32 },
    red: { min: 0, max: 26 },
    direction: "lower-is-worse",
    ataChapter: "36-11",
  },
  tipClearance: {
    id: "tipClearance",
    label: "HPT blade tip clearance",
    unit: "mm",
    nominal: { min: 0.6, max: 1.1 },
    amber: { min: 1.1, max: 1.5 },
    red: { min: 1.5, max: 3 },
    direction: "higher-is-worse",
    ataChapter: "72-52",
  },
  oilDebrisCount: {
    id: "oilDebrisCount",
    label: "Oil debris particle count",
    unit: "counts/h",
    nominal: { min: 0, max: 6 },
    amber: { min: 6, max: 18 },
    red: { min: 18, max: 120 },
    direction: "higher-is-worse",
    ataChapter: "79-30",
  },
};

export const OPERATOR_SEEDS: {
  code: string;
  name: string;
  region: Region;
  homeBase: string;
  fleet: AircraftType[];
}[] = [
  { code: "BA", name: "British Airways", region: "Europe", homeBase: "EGLL", fleet: ["A350-1000", "B787-9", "B787-10"] },
  { code: "SQ", name: "Singapore Airlines", region: "Asia Pacific", homeBase: "WSSS", fleet: ["A350-900", "B787-10"] },
  { code: "EK", name: "Emirates", region: "Middle East", homeBase: "OMDB", fleet: ["A380-800", "A350-900"] },
  { code: "QR", name: "Qatar Airways", region: "Middle East", homeBase: "OTHH", fleet: ["A350-900", "A350-1000"] },
  { code: "CX", name: "Cathay Pacific", region: "Greater China", homeBase: "VHHH", fleet: ["A350-900", "A350-1000"] },
  { code: "LH", name: "Lufthansa", region: "Europe", homeBase: "EDDF", fleet: ["A350-900", "A380-800"] },
  { code: "VS", name: "Virgin Atlantic", region: "Europe", homeBase: "EGLL", fleet: ["A350-1000", "B787-9"] },
  { code: "NH", name: "All Nippon Airways", region: "Asia Pacific", homeBase: "RJTT", fleet: ["B787-8", "B787-9", "B787-10"] },
  { code: "ET", name: "Ethiopian Airlines", region: "Africa", homeBase: "HAAB", fleet: ["B787-8", "B787-9", "A350-900"] },
  { code: "AC", name: "Air Canada", region: "North America", homeBase: "CYYZ", fleet: ["B787-9", "A330-900neo"] },
  { code: "LA", name: "LATAM", region: "South America", homeBase: "SBGR", fleet: ["B787-9", "A350-900"] },
  { code: "TP", name: "TAP Air Portugal", region: "Europe", homeBase: "LPPT", fleet: ["A330-900neo"] },
];

export const FACILITY_SEEDS: {
  name: string;
  icao: string;
  region: Region;
  kind: "overhaul-base" | "line-station" | "test-cell" | "partner-shop";
  capacity: number;
  lat: number;
  lon: number;
}[] = [
  { name: "Derby Overhaul Base", icao: "EGNX", region: "Europe", kind: "overhaul-base", capacity: 14, lat: 52.83, lon: -1.33 },
  { name: "Dahlewitz Service Centre", icao: "EDDB", region: "Europe", kind: "overhaul-base", capacity: 10, lat: 52.34, lon: 13.42 },
  { name: "Singapore Seletar Assembly & Test", icao: "WSSL", region: "Asia Pacific", kind: "test-cell", capacity: 6, lat: 1.42, lon: 103.87 },
  { name: "Dallas Fort Worth Line Station", icao: "KDFW", region: "North America", kind: "line-station", capacity: 4, lat: 32.9, lon: -97.04 },
  { name: "Hong Kong HAESL Partner Shop", icao: "VHHH", region: "Greater China", kind: "partner-shop", capacity: 8, lat: 22.31, lon: 113.91 },
  { name: "Dubai Line Station", icao: "OMDB", region: "Middle East", kind: "line-station", capacity: 5, lat: 25.25, lon: 55.36 },
  { name: "São Paulo Partner Shop", icao: "SBGR", region: "South America", kind: "partner-shop", capacity: 4, lat: -23.43, lon: -46.47 },
  { name: "Johannesburg Line Station", icao: "FAOR", region: "Africa", kind: "line-station", capacity: 3, lat: -26.13, lon: 28.24 },
];

/** Public Rolls-Royce marketing glTF assets used by the 3D engine twin. */
export const ENGINE_3D_ASSETS: Record<string, { label: string; url: string; localPath: string; animations: number }> = {
  "trent-1000-ten": {
    label: "Trent 1000 TEN",
    url: "https://engines-cms.rolls-royce.com/uploads/BD_2034_T1000_Ten_Marketing_V01_09_85b79de810.glb",
    localPath: "/models/trent-1000-ten.glb",
    animations: 6,
  },
  "trent-7000": {
    label: "Trent 7000",
    url: "https://engines-cms.rolls-royce.com/uploads/BD_2034_T7000_Marketing_V02_7_5d4d4884aa.glb",
    localPath: "/models/trent-7000.glb",
    animations: 6,
  },
  "trent-xwb": {
    label: "Trent XWB",
    url: "https://engines-cms.rolls-royce.com/uploads/BD_2034_XWB_Marketing_V01_7_12cf2a0c90.glb",
    localPath: "/models/trent-xwb.glb",
    animations: 6,
  },
  ultrafan: {
    label: "UltraFan",
    url: "https://engines-cms.rolls-royce.com/uploads/BD_2034_Ultrafan_Marketing_V02_2_fc9d472dc4.glb",
    localPath: "/models/ultrafan.glb",
    animations: 4,
  },
};

export const AIRPORTS: { icao: string; iata: string; city: string; lat: number; lon: number; dusty: boolean }[] = [
  { icao: "EGLL", iata: "LHR", city: "London", lat: 51.47, lon: -0.45, dusty: false },
  { icao: "WSSS", iata: "SIN", city: "Singapore", lat: 1.36, lon: 103.99, dusty: false },
  { icao: "OMDB", iata: "DXB", city: "Dubai", lat: 25.25, lon: 55.36, dusty: true },
  { icao: "OTHH", iata: "DOH", city: "Doha", lat: 25.27, lon: 51.61, dusty: true },
  { icao: "VHHH", iata: "HKG", city: "Hong Kong", lat: 22.31, lon: 113.91, dusty: false },
  { icao: "EDDF", iata: "FRA", city: "Frankfurt", lat: 50.03, lon: 8.56, dusty: false },
  { icao: "RJTT", iata: "HND", city: "Tokyo", lat: 35.55, lon: 139.78, dusty: false },
  { icao: "HAAB", iata: "ADD", city: "Addis Ababa", lat: 8.98, lon: 38.8, dusty: true },
  { icao: "CYYZ", iata: "YYZ", city: "Toronto", lat: 43.68, lon: -79.63, dusty: false },
  { icao: "SBGR", iata: "GRU", city: "São Paulo", lat: -23.43, lon: -46.47, dusty: false },
  { icao: "LPPT", iata: "LIS", city: "Lisbon", lat: 38.77, lon: -9.13, dusty: false },
  { icao: "KJFK", iata: "JFK", city: "New York", lat: 40.64, lon: -73.78, dusty: false },
  { icao: "KLAX", iata: "LAX", city: "Los Angeles", lat: 33.94, lon: -118.41, dusty: false },
  { icao: "YSSY", iata: "SYD", city: "Sydney", lat: -33.95, lon: 151.18, dusty: false },
  { icao: "ZBAA", iata: "PEK", city: "Beijing", lat: 40.08, lon: 116.58, dusty: true },
  { icao: "FAOR", iata: "JNB", city: "Johannesburg", lat: -26.13, lon: 28.24, dusty: true },
  { icao: "VIDP", iata: "DEL", city: "Delhi", lat: 28.56, lon: 77.1, dusty: true },
  { icao: "OERK", iata: "RUH", city: "Riyadh", lat: 24.96, lon: 46.7, dusty: true },
];

export const FAILURE_MODES: { module: ModuleCode; mode: string; ata: string }[] = [
  { module: "HPT", mode: "HPT blade tip oxidation", ata: "72-52" },
  { module: "HPT", mode: "HPT NGV cracking", ata: "72-52" },
  { module: "COMBUSTOR", mode: "Combustor tile liberation", ata: "72-50" },
  { module: "IPC", mode: "IPC rotor blade fatigue", ata: "72-40" },
  { module: "HPC", mode: "HPC tip rub / efficiency loss", ata: "72-45" },
  { module: "FAN", mode: "Fan blade leading-edge erosion", ata: "72-30" },
  { module: "LPT", mode: "LPT sulphidation attack", ata: "72-54" },
  { module: "EXTERNALS", mode: "Bearing chamber debris generation", ata: "72-20" },
  { module: "ACCESSORY", mode: "Fuel metering unit drift", ata: "73-21" },
  { module: "GEARBOX", mode: "Accessory gearbox seal leak", ata: "72-60" },
  { module: "NACELLE", mode: "Thrust reverser actuator degradation", ata: "78-30" },
  { module: "IPT", mode: "IPT shaft torsional wear", ata: "72-53" },
];

export const SKILLS = [
  "Borescope L2",
  "Borescope L3",
  "Composite repair",
  "Blade blending",
  "Engine build",
  "Test cell operation",
  "NDT eddy current",
  "NDT ultrasonic",
  "Line maintenance B1",
  "Avionics B2",
  "Module strip",
  "Balancing",
];
