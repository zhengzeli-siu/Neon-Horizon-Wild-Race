
export enum GameState {
  MENU = 'MENU',
  SHOP = 'SHOP',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER',
  TRACK_SELECT = 'TRACK_SELECT',
  SETTINGS = 'SETTINGS'
}

export enum BiomeType {
  DESERT = 'DESERT',
  SNOW = 'SNOW',
  CITY = 'CITY'
}

export enum WeatherType {
  CLEAR = 'CLEAR',
  RAIN = 'RAIN',
  SNOW_STORM = 'SNOW_STORM'
}

export enum RaceStatus {
  READY = 'READY',
  COUNTDOWN = 'COUNTDOWN',
  RACING = 'RACING',
  FINISHED = 'FINISHED',
  WRECKED = 'WRECKED'
}

export enum CollisionType {
  NONE = 'NONE',
  WALL = 'WALL',
  CAR = 'CAR'
}

export enum DecalType {
  NONE = 'NONE',
  STRIPE = 'STRIPE',
  FLAME = 'FLAME',
  SKULL = 'SKULL'
}

export enum RimType {
  STANDARD = 'STANDARD',
  SPORT = 'SPORT',
  NEON = 'NEON'
}

export interface CustomizationConfig {
  color: string;
  decalId: DecalType;
  rimId: RimType;
}

export interface CarStats {
  id: string;
  name: string;
  description: string; // 中文描述
  speed: number;
  handling: number;
  acceleration: number;
  nitroCapacity: number;
  price: number;
  color: string;
  emissive: string;
  maxHealth: number; // 最大耐久度
  modelType: 'racer' | 'truck' | 'future';
}

export interface TrackConfig {
  id: BiomeType;
  name: string;
  description: string;
  groundColor: string;
  gridColor: string;
  fogColor: string;
  skyColor: string;
  difficultyMultiplier: number;
  weather: WeatherType;
  length: number; 
  curveIntensity: number;
  sceneryCount: number;
}

export interface PlayerState {
  coins: number;
  unlockedCars: string[]; 
  selectedCarId: string;
  highScore: number;
  carCustomizations: Record<string, CustomizationConfig>;
}

// 设置菜单状态
export interface SettingsState {
  quality: 'LOW' | 'HIGH';
  musicVolume: number;
  sfxVolume: number;
  sensitivity: number; // 0-100, default 50
}

export interface RacerState {
  id: string;
  t: number; // 赛道上的归一化位置 (0 to 1)
  laneOffset: number; // -1 to 1 (左到右)
  speed: number; // 当前速度
  lap: number;
  isPlayer: boolean;
  nitroLevel: number;
  health: number; // 当前耐久度
  maxHealth: number;
  rank: number; // 当前排名
  distance: number; // 总行驶距离 (lap + t)
  isNitroActive: boolean;
  isDrifting: boolean;
  color: string;
  velocity: { x: number, z: number }; // 速度矢量
  lastLaneChange: number;
}

export interface Particle {
  id: number;
  position: [number, number, number];
  life: number;
  scale: number;
  opacity: number;
}

// 胎痕数据结构
export interface SkidMarkData {
  id: number;
  position: [number, number, number];
  rotation: [number, number, number];
  opacity: number;
}