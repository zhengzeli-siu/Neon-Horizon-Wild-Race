
import { BiomeType, CarStats, TrackConfig, WeatherType } from './types';
import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';

// --- 全局配置 ---
export const LANE_WIDTH = 4; // 稍微变窄，增加紧凑感
export const TRACK_WIDTH = 18; // 增加赛道总宽以容纳护栏
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
    const segments = 150; // 减少段数以获得更平滑的插值
    
    // 注意：不要包含 i = segments，否则会导致起点和终点重复，导致闭环处切线突变
    for (let i = 0; i < segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        // 基础形状：8字形或环形混合
        let x = Math.cos(theta) * scale;
        let z = Math.sin(theta) * scale * 1.5;
        
        // 扰动
        x += Math.cos(theta * 3 + seed) * complexity * 1.5;
        z += Math.sin(theta * 4 + seed) * complexity * 1.5;
        
        let y = getTerrainHeight(x, z, biome) + 2;

        // 桥梁或跳台 (降低幅度以防止相机翻转)
        if (Math.sin(theta * 6) > 0.8) {
            y += 25 * Math.sin((theta * 6 - 0.8) * Math.PI);
        }

        points.push(new THREE.Vector3(x, y, z));
    }
    
    // closed: true 会自动平滑连接最后一个点和第一个点
    return new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.2);
};

export const createRoadTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Texture();

    // 深色沥青
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, 1024, 1024);
    
    // 噪点
    for (let i = 0; i < 800000; i++) {
        const v = Math.random() * 40;
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(Math.random() * 1024, Math.random() * 1024, 2, 2);
    }

    // 轮胎痕迹
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#000';
    ctx.filter = 'blur(6px)';
    ctx.fillRect(250, 0, 150, 1024);
    ctx.fillRect(624, 0, 150, 1024);
    ctx.filter = 'none';
    ctx.globalAlpha = 1.0;

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 16;
    tex.repeat.set(1, 40);
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
