
import { BiomeType, CarStats, TrackConfig, WeatherType, DecalType, RimType } from './types';
import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';

// --- 全局配置 ---
export const LANE_WIDTH = 4; // 车道宽
export const SHOULDER_WIDTH = 2.5; // 路肩宽
export const TRACK_WIDTH = LANE_WIDTH * 3; // 赛道主路宽 (3车道宽)
export const FULL_WIDTH = TRACK_WIDTH + SHOULDER_WIDTH * 2; // 总宽
export const SEGMENTS_MULTIPLIER = 4;

export const noise2D = createNoise2D();

export const getTerrainHeight = (x: number, z: number, biome: BiomeType) => {
    let y = noise2D(x * 0.002, z * 0.002) * 50;
    y += noise2D(x * 0.01, z * 0.01) * 5;
    if (biome === BiomeType.DESERT) y = Math.abs(y) * 1.5;
    else if (biome === BiomeType.CITY) y = Math.floor(y / 15) * 15;
    return y;
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
    length: 350,
    curveIntensity: 30,
    sceneryCount: 300
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
    length: 450,
    curveIntensity: 50,
    sceneryCount: 400
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
    length: 600,
    curveIntensity: 70,
    sceneryCount: 800
  }
};

export const generateTrackPath = (seed: number, complexity: number, scale: number, biome: BiomeType) => {
    const points: THREE.Vector3[] = [];
    const segments = 400; // Increased resolution for smoother physics
    
    for (let i = 0; i < segments; i++) {
        const t = i / segments;
        const theta = t * Math.PI * 2;
        
        // Base Oval/Figure-8 shape
        let x = Math.cos(theta) * scale;
        let z = Math.sin(theta) * scale * 1.5;
        
        // Noise Application
        let noiseAmp = complexity;
        // Reduce noise in special sections for playability
        if (t > 0.45 && t < 0.55) noiseAmp *= 0.3; // Jump area
        if (t > 0.65 && t < 0.78) noiseAmp *= 0.1; // Tunnel area

        x += Math.cos(theta * 3 + seed) * noiseAmp * 1.5;
        z += Math.sin(theta * 4 + seed) * noiseAmp * 1.5;
        
        // Base Terrain Height integration
        let terrainH = getTerrainHeight(x, z, biome);
        let y = terrainH + 2;

        // --- DYNAMIC ELEMENTS ---

        // 1. The Big Jump (t: 0.45 - 0.55)
        if (t > 0.45 && t < 0.55) {
            const jt = (t - 0.45) / 0.1; // 0 to 1
            // Smoother sine wave for ramp up and down
            y += Math.sin(jt * Math.PI) * 50; 
        }

        // 2. The Tunnel (t: 0.65 - 0.78)
        if (t > 0.65 && t < 0.78) {
             // Force track lower to cut through terrain or stay flat
             // relative to the average noise
             y = terrainH * 0.4; 
        }

        // 3. Technical Section (undulation)
        if (t > 0.1 && t < 0.3) {
            y += Math.sin(t * 20) * 15;
        }

        points.push(new THREE.Vector3(x, y, z));
    }
    
    // Ensure loop is perfectly closed by explicitly setting last point to first?
    // CatmullRomCurve3(closed=true) handles this, but points must align well.
    // The sine/cos generation guarantees t=0 and t=1 are close.
    
    return new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.05);
};

export const createRoadTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Texture();

    // 1. Base Asphalt (Darker for contrast)
    ctx.fillStyle = '#151515';
    ctx.fillRect(0, 0, 1024, 1024);
    
    // Noise/Gravel texture
    for (let i = 0; i < 500000; i++) {
        const v = Math.random() * 40;
        ctx.fillStyle = `rgba(${v},${v},${v}, 0.5)`;
        ctx.fillRect(Math.random() * 1024, Math.random() * 1024, 2, 2);
    }

    // 2. Shoulders (Rumble Strips) - High Contrast
    const shoulderWidth = 128; // Approx 12.5% on each side
    const segmentH = 64;
    
    for(let y=0; y<1024; y+=segmentH) {
        const isRed = (y / segmentH) % 2 === 0;
        
        // Left Strip
        ctx.fillStyle = isRed ? '#cc2222' : '#eeeeee';
        ctx.fillRect(0, y, shoulderWidth, segmentH);
        
        // Right Strip
        ctx.fillStyle = isRed ? '#cc2222' : '#eeeeee';
        ctx.fillRect(1024 - shoulderWidth, y, shoulderWidth, segmentH);
    }
    
    // Shoulder shadow gradient (Depth)
    const gradL = ctx.createLinearGradient(shoulderWidth, 0, shoulderWidth + 40, 0);
    gradL.addColorStop(0, 'rgba(0,0,0,0.8)');
    gradL.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradL;
    ctx.fillRect(shoulderWidth, 0, 40, 1024);

    const gradR = ctx.createLinearGradient(1024 - shoulderWidth, 0, 1024 - shoulderWidth - 40, 0);
    gradR.addColorStop(0, 'rgba(0,0,0,0.8)');
    gradR.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradR;
    ctx.fillRect(1024 - shoulderWidth - 40, 0, 40, 1024);

    // 3. Lane Lines (Center) - Neon style if City, white otherwise
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#ffffff';
    
    // Dashed lines
    const dashH = 80;
    const dashGap = 60;
    for(let y=0; y<1024; y+= (dashH + dashGap)) {
         ctx.fillRect(1024 * 0.33, y, 12, dashH); 
         ctx.fillRect(1024 * 0.66, y, 12, dashH);
    }
    ctx.shadowBlur = 0;

    // 4. Tire Marks (Permanent skidmarks on texture)
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = '#000';
    ctx.filter = 'blur(4px)';
    ctx.fillRect(350, 0, 80, 1024);
    ctx.fillRect(650, 0, 80, 1024);
    ctx.filter = 'none';
    ctx.globalAlpha = 1.0;

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 16;
    tex.repeat.set(1, 80); // Higher repeat for speed sensation
    return tex;
};

export const createTunnelTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if(!ctx) return new THREE.Texture();

    // Dark metallic panels
    ctx.fillStyle = '#111115';
    ctx.fillRect(0,0,512,512);

    // Grid lines
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 4;
    ctx.beginPath();
    for(let i=0; i<=512; i+=64) {
        ctx.moveTo(0, i); ctx.lineTo(512, i);
        ctx.moveTo(i, 0); ctx.lineTo(i, 512);
    }
    ctx.stroke();

    // Lights
    ctx.fillStyle = '#00ffff';
    ctx.shadowBlur = 15;
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

    ctx.fillStyle = '#050510';
    ctx.fillRect(0,0,128,256);

    for(let y=10; y<240; y+=15) {
        for(let x=10; x<110; x+=20) {
            if(Math.random() > 0.4) {
                 const hue = Math.random() > 0.5 ? '#ff00ff' : '#00ffff';
                 ctx.fillStyle = hue;
                 ctx.fillRect(x, y, 12, 12);
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
        ctx.fillRect(230, 0, 52, 512);
    } else if (type === DecalType.FLAME) {
        ctx.fillStyle = '#ff5500';
        ctx.beginPath();
        ctx.moveTo(256, 512);
        ctx.quadraticCurveTo(100, 256, 256, 0);
        ctx.quadraticCurveTo(400, 256, 256, 512);
        ctx.fill();
    } else if (type === DecalType.SKULL) {
        ctx.fillStyle = '#dddddd';
        ctx.font = '300px serif';
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

    ctx.fillStyle = '#333';
    ctx.fillRect(0,0,256,256);

    ctx.strokeStyle = '#888';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(128, 128, 120, 0, Math.PI*2);
    ctx.stroke();

    if (type === RimType.SPORT) {
        ctx.lineWidth = 15;
        for(let i=0; i<5; i++) {
            const a = (i/5) * Math.PI*2;
            ctx.beginPath();
            ctx.moveTo(128, 128);
            ctx.lineTo(128 + Math.cos(a)*120, 128 + Math.sin(a)*120);
            ctx.stroke();
        }
    } else if (type === RimType.NEON) {
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(128, 128, 100, 0, Math.PI*2);
        ctx.stroke();
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#00ffff';
        ctx.stroke();
    }

    return new THREE.CanvasTexture(canvas);
};
