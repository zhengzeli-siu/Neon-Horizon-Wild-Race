
import { BiomeType, CarStats, TrackConfig, WeatherType, DecalType, RimType } from './types';
import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';

// --- 全局配置 ---
export const LANE_WIDTH = 6; // Slightly wider lanes for better speed feel
export const SHOULDER_WIDTH = 5; // Distinct shoulders
export const TRACK_WIDTH = LANE_WIDTH * 3; 
export const FULL_WIDTH = TRACK_WIDTH + SHOULDER_WIDTH * 2; 
export const SEGMENTS_MULTIPLIER = 4;

export const noise2D = createNoise2D();

export const getTerrainHeight = (x: number, z: number, biome: BiomeType) => {
    // Smoother base terrain
    let y = noise2D(x * 0.001, z * 0.001) * 35; 
    y += noise2D(x * 0.003, z * 0.003) * 10;
    
    if (biome === BiomeType.DESERT) {
        y = Math.abs(y) * 1.5; // Rolling dunes
    } else if (biome === BiomeType.CITY) {
        y = Math.floor(y / 15) * 15; // Terraced levels
    }
    
    return Math.max(-40, y);
};

export const PRIZES = { 1: 500, 2: 300, 3: 150, others: 50 };

export const DECALS = {
  [DecalType.NONE]: { id: DecalType.NONE, name: '无' },
  [DecalType.STRIPE]: { id: DecalType.STRIPE, name: '赛车条纹' },
  [DecalType.FLAME]: { id: DecalType.FLAME, name: '烈焰' },
  [DecalType.SKULL]: { id: DecalType.SKULL, name: '骷髅' }
};

export const RIMS = {
  [RimType.STANDARD]: { id: RimType.STANDARD, name: '标准' },
  [RimType.SPORT]: { id: RimType.SPORT, name: '运动' },
  [RimType.NEON]: { id: RimType.NEON, name: '霓虹光圈' }
};

export const CARS: CarStats[] = [
  {
    id: 'starter_alpha',
    name: '阿尔法 I型',
    description: '入门级赛车，平衡性好，适合新手训练。',
    speed: 80,
    acceleration: 0.8,
    handling: 2.5,
    nitroCapacity: 3,
    maxHealth: 100,
    price: 0,
    color: '#00ffff',
    emissive: '#00aaaa',
    modelType: 'racer'
  },
  {
    id: 'heavy_titan',
    name: '泰坦重卡',
    description: '重型装甲卡车，极速较低但能在碰撞中占据优势。',
    speed: 70,
    acceleration: 0.5,
    handling: 1.5,
    nitroCapacity: 5,
    maxHealth: 180,
    price: 500,
    color: '#ffaa00',
    emissive: '#aa5500',
    modelType: 'truck'
  },
  {
    id: 'cyber_spectre',
    name: '幽灵 X',
    description: '来自未来的原型车，极高的加速度和操控性。',
    speed: 110,
    acceleration: 1.2,
    handling: 4.0,
    nitroCapacity: 4,
    maxHealth: 80,
    price: 1500,
    color: '#ff00ff',
    emissive: '#aa00aa',
    modelType: 'future'
  },
  {
    id: 'shadow_fang',
    name: '暗影之牙',
    description: '为地下极速赛设计的非法改装车，拥有顶级氮气系统。',
    speed: 105,
    acceleration: 1.0,
    handling: 4.5,
    nitroCapacity: 3,
    maxHealth: 90,
    price: 2500,
    color: '#222222',
    emissive: '#ff0000',
    modelType: 'racer'
  }
];

export const TRACKS: Record<BiomeType, TrackConfig> = {
  [BiomeType.DESERT]: {
    id: BiomeType.DESERT,
    name: '霓虹沙海',
    description: '穿越灼热的沙丘，注意急转弯。',
    groundColor: '#C2B280', 
    gridColor: '#ff4500',
    fogColor: '#cc8855',
    skyColor: '#331100',
    difficultyMultiplier: 1.0,
    weather: WeatherType.CLEAR,
    length: 300,
    curveIntensity: 10,
    sceneryCount: 150
  },
  [BiomeType.SNOW]: {
    id: BiomeType.SNOW,
    name: '极地冰原',
    description: '路面湿滑，视野受限，充满危险的冰柱。',
    groundColor: '#e0f0ff', 
    gridColor: '#00d0ff',
    fogColor: '#aaccff',
    skyColor: '#001133',
    difficultyMultiplier: 1.5,
    weather: WeatherType.SNOW_STORM,
    length: 350,
    curveIntensity: 15,
    sceneryCount: 200
  },
  [BiomeType.CITY]: {
    id: BiomeType.CITY,
    name: '赛博都会',
    description: '复杂的城市高架桥，霓虹灯光下的极速狂飙。',
    groundColor: '#050510', 
    gridColor: '#d600ff',
    fogColor: '#220033',
    skyColor: '#020005',
    difficultyMultiplier: 2.0,
    weather: WeatherType.RAIN,
    length: 450,
    curveIntensity: 20,
    sceneryCount: 350
  }
};

export type FeatureType = 'JUMP' | 'TUNNEL' | 'BANKED';

export interface TrackFeature {
    type: FeatureType;
    start: number; // 0 to 1
    end: number;   // 0 to 1
    intensity: number;
}

export const getTrackFeatures = (biome: BiomeType): TrackFeature[] => {
    switch (biome) {
        case BiomeType.DESERT:
            return [
                { type: 'JUMP', start: 0.1, end: 0.18, intensity: 15 }, // Smoother jump
                { type: 'BANKED', start: 0.35, end: 0.55, intensity: 8 }, 
                { type: 'JUMP', start: 0.7, end: 0.8, intensity: 25 }, 
            ];
        case BiomeType.CITY:
            return [
                 { type: 'TUNNEL', start: 0.2, end: 0.35, intensity: 0 },
                 { type: 'BANKED', start: 0.5, end: 0.7, intensity: 15 },
                 { type: 'TUNNEL', start: 0.85, end: 0.95, intensity: 0 } 
            ];
        case BiomeType.SNOW:
            return [
                 { type: 'BANKED', start: 0.15, end: 0.35, intensity: 12 },
                 { type: 'TUNNEL', start: 0.5, end: 0.6, intensity: 0 },
                 { type: 'JUMP', start: 0.8, end: 0.9, intensity: 18 }
            ];
        default: return [];
    }
};

export const generateTrackPath = (seed: number, complexity: number, scale: number, biome: BiomeType, features: TrackFeature[]) => {
    const points: THREE.Vector3[] = [];
    const segments = 400; 
    
    // Simplification: Less erratic random noise, more smooth curves
    const rX = scale * 1.8;
    const rZ = scale * 1.4;

    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const theta = t * Math.PI * 2;
        
        // Base Shape: Smooth Ellipse with slight distortion
        let x = Math.cos(theta) * rX;
        let z = Math.sin(theta) * rZ;
        
        // Add very low frequency noise for variety without sharp turns
        // Using periodic functions ensures the loop closes perfectly
        x += Math.cos(theta * 2 + seed) * (rX * 0.15);
        z += Math.sin(theta * 3 + seed) * (rZ * 0.1);

        // Calculate base terrain height
        let y = getTerrainHeight(x, z, biome) + 6; 

        // Apply Features smoothly
        let featureMod = 0;
        const inFeature = features.find(f => t >= f.start && t <= f.end);
        
        if (inFeature) {
            const localT = (t - inFeature.start) / (inFeature.end - inFeature.start); 
            // Smooth easing (Hermite-like)
            const smoothT = localT * localT * (3 - 2 * localT);

            if (inFeature.type === 'JUMP') {
                // Sine wave ramp
                featureMod += Math.sin(localT * Math.PI) * inFeature.intensity;
            } 
            else if (inFeature.type === 'TUNNEL') {
                // Flatten and dip
                featureMod -= Math.sin(localT * Math.PI) * 15; 
                y = getTerrainHeight(x, z, biome) * 0.5; // Reduce terrain influence in tunnel
            }
            else if (inFeature.type === 'BANKED') {
                // Banked turns affect rotation mostly, but here we add slight elevation wave
                featureMod += Math.sin(localT * Math.PI * 2) * inFeature.intensity * 0.3;
            }
        } else {
             // Gentle global undulation
             featureMod += Math.sin(theta * 3) * 5; 
        }

        y += featureMod;
        
        // Clamp Y to prevent going underground too deep (unless tunnel)
        if (!inFeature || inFeature.type !== 'TUNNEL') {
             y = Math.max(y, -10);
        }

        points.push(new THREE.Vector3(x, y, z));
    }
    
    return new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.2); // Increased tension for smoother curve
};

export const createRoadTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Texture();

    // 1. Asphalt
    ctx.fillStyle = '#181818';
    ctx.fillRect(0, 0, 1024, 1024);
    
    // Grain
    for (let i = 0; i < 250000; i++) {
        const v = Math.random() * 45;
        ctx.fillStyle = `rgba(${v},${v},${v}, 0.2)`;
        ctx.fillRect(Math.random() * 1024, Math.random() * 1024, 2, 2);
    }

    // 2. High Contrast Rumble Strips
    const shoulderW = 140; 
    const segH = 128;
    
    for(let y=0; y<1024; y+=segH) {
        const isRed = (y / segH) % 2 === 0;
        
        // Left
        ctx.fillStyle = isRed ? '#cc0000' : '#eeeeee';
        ctx.fillRect(0, y, shoulderW, segH);
        
        // Right
        ctx.fillStyle = isRed ? '#cc0000' : '#eeeeee';
        ctx.fillRect(1024 - shoulderW, y, shoulderW, segH);
    }
    
    // Sharp Lines defining track edge
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(shoulderW, 0, 8, 1024);
    ctx.fillRect(1024 - shoulderW - 8, 0, 8, 1024);

    // 3. Center Dashed Lines
    ctx.fillStyle = '#ffffff';
    const dashH = 100;
    const dashGap = 80;
    for(let y=0; y<1024; y+= (dashH + dashGap)) {
         ctx.fillRect(1024 * 0.35, y, 12, dashH); 
         ctx.fillRect(1024 * 0.65, y, 12, dashH);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 16;
    tex.repeat.set(1, 60); 
    return tex;
};

export const createTunnelTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if(!ctx) return new THREE.Texture();

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0,0,512,512);

    // Sci-fi panels
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 4;
    for(let i=0; i<=512; i+=64) {
        ctx.beginPath();
        ctx.moveTo(0, i); ctx.lineTo(512, i);
        ctx.stroke();
    }
    
    // Lights
    ctx.fillStyle = '#00ffff';
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#00ffff';
    for(let y=32; y<512; y+=128) {
        ctx.fillRect(20, y, 15, 64);
        ctx.fillRect(477, y, 15, 64);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 10);
    return tex;
};

export const createBuildingTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if(!ctx) return new THREE.Texture();

    ctx.fillStyle = '#050505';
    ctx.fillRect(0,0,128,256);

    // Windows
    for(let y=20; y<240; y+=20) {
        for(let x=10; x<110; x+=25) {
            if(Math.random() > 0.4) {
                 const hue = Math.random() > 0.5 ? '#ff00ff' : '#00aaff';
                 ctx.fillStyle = hue;
                 ctx.fillRect(x, y, 15, 12);
            }
        }
    }
    return new THREE.CanvasTexture(canvas);
};

export const createStartFinishTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if(!ctx) return new THREE.Texture();

    const size = 32;
    for(let y=0; y<128; y+=size) {
        for(let x=0; x<512; x+=size) {
            ctx.fillStyle = (x/size + y/size) % 2 === 0 ? '#ffffff' : '#000000';
            ctx.fillRect(x, y, size, size);
        }
    }
    return new THREE.CanvasTexture(canvas);
};

export const createDecalTexture = (type: DecalType, primaryColor: string) => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Texture();
    ctx.clearRect(0, 0, 512, 512);

    if (type === DecalType.STRIPE) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(200, 0, 112, 512);
    } else if (type === DecalType.FLAME) {
        ctx.fillStyle = '#ff8800';
        ctx.beginPath();
        ctx.moveTo(256, 512);
        ctx.bezierCurveTo(100, 400, 0, 200, 256, 0);
        ctx.bezierCurveTo(512, 200, 412, 400, 256, 512);
        ctx.fill();
    } else if (type === DecalType.SKULL) {
        ctx.fillStyle = '#eeeeee';
        ctx.font = '250px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('☠️', 256, 256);
    }
    return new THREE.CanvasTexture(canvas);
};

export const createRimTexture = (type: RimType) => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Texture();

    ctx.fillStyle = '#222';
    ctx.fillRect(0,0,256,256);
    ctx.strokeStyle = '#aaa';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(128, 128, 110, 0, Math.PI*2);
    ctx.stroke();

    if (type === RimType.SPORT) {
        ctx.lineWidth = 12;
        for(let i=0; i<6; i++) {
            const a = (i/6) * Math.PI*2;
            ctx.beginPath();
            ctx.moveTo(128, 128);
            ctx.lineTo(128 + Math.cos(a)*110, 128 + Math.sin(a)*110);
            ctx.stroke();
        }
    } else if (type === RimType.NEON) {
        ctx.strokeStyle = '#00ffcc';
        ctx.lineWidth = 6;
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#00ffcc';
        ctx.beginPath();
        ctx.arc(128, 128, 90, 0, Math.PI*2);
        ctx.stroke();
    }
    return new THREE.CanvasTexture(canvas);
};
