
import React, { useRef, useMemo, useState, useEffect, useLayoutEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, ChromaticAberration, Scanline, Vignette, Noise } from '@react-three/postprocessing';
import * as THREE from 'three';
import { TrackConfig, CarStats, RacerState, WeatherType, BiomeType, Particle, SkidMarkData, RaceStatus, CollisionType } from '../types';
import { generateTrackPath, createRoadTexture, createBuildingTexture, createStartFinishTexture, getTerrainHeight, LANE_WIDTH, TRACK_WIDTH } from '../constants';

// --- 全局纹理 ---
const roadTexture = createRoadTexture();
const buildingTexture = createBuildingTexture();
const startFinishTexture = createStartFinishTexture();

// --- 高性能实例组件 ---

// 使用 InstancedMesh 渲染胎痕
const InstancedSkidMarks = React.forwardRef<{ addMark: (pos: THREE.Vector3, rot: THREE.Euler) => void }>((_, ref) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const count = 1000;
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const indexRef = useRef(0);

    useLayoutEffect(() => {
        if (!ref) return;
        (ref as any).current = {
            addMark: (pos: THREE.Vector3, rot: THREE.Euler) => {
                if (!meshRef.current) return;
                
                dummy.position.copy(pos);
                dummy.rotation.copy(rot);
                dummy.rotateX(-Math.PI / 2); // 贴地
                dummy.updateMatrix();
                
                meshRef.current.setMatrixAt(indexRef.current, dummy.matrix);
                meshRef.current.instanceMatrix.needsUpdate = true;
                
                indexRef.current = (indexRef.current + 1) % count;
            }
        };
    }, [dummy, ref]);

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
            <planeGeometry args={[0.6, 0.6]} />
            <meshBasicMaterial color="#111" transparent opacity={0.6} depthWrite={false} polygonOffset polygonOffsetFactor={-1} />
        </instancedMesh>
    );
});

// --- 视觉辅助组件 ---

const SpeedLines = ({ speed }: { speed: number }) => {
    const ref = useRef<THREE.Group>(null);
    const count = 50;
    
    const lines = useMemo(() => {
        return new Array(count).fill(0).map(() => ({
            x: (Math.random() - 0.5) * 50,
            y: (Math.random() - 0.5) * 40,
            z: Math.random() * 20,
            len: 5 + Math.random() * 10,
            speed: 1.5 + Math.random()
        }));
    }, []);

    useFrame((_, delta) => {
        if (!ref.current) return;
        ref.current.visible = speed > 100;
        if (speed <= 100) return;

        ref.current.children.forEach((mesh, i) => {
            const line = lines[i];
            mesh.position.z -= line.speed * (speed * 1.0) * delta;
            if (mesh.position.z < -10) {
                mesh.position.z = 40 + Math.random() * 20;
                mesh.position.x = (Math.random() - 0.5) * 50;
                mesh.position.y = (Math.random() - 0.5) * 40;
            }
        });
    });

    return (
        <group ref={ref}>
            {lines.map((l, i) => (
                <mesh key={i} position={[l.x, l.y, l.z]}>
                    <boxGeometry args={[0.08, 0.08, l.len]} />
                    <meshBasicMaterial color="#ffffff" transparent opacity={0.4} />
                </mesh>
            ))}
        </group>
    );
};

// 分层远景背景
const BackgroundLayers = ({ config }: { config: TrackConfig }) => {
    const mountainGeo = useMemo(() => {
        const geo = new THREE.CylinderGeometry(500, 500, 200, 32, 1, true);
        const pos = geo.attributes.position;
        for (let i=0; i<pos.count; i++) {
             if (pos.getY(i) > 0) {
                 pos.setY(i, 40 + Math.random() * 100); 
             } else {
                 pos.setY(i, -100);
             }
        }
        geo.computeVertexNormals();
        return geo;
    }, []);

    return (
        <group>
            {/* 天空 */}
            <mesh scale={[900, 900, 900]} position={[0, 0, 0]}>
                 <sphereGeometry args={[1, 32, 16]} />
                 <meshBasicMaterial color={config.skyColor} side={THREE.BackSide} />
            </mesh>
            {/* 远景轮廓 */}
            <mesh geometry={mountainGeo} position={[0, -50, 0]}>
                 <meshBasicMaterial color={config.fogColor} side={THREE.BackSide} transparent opacity={0.9} />
            </mesh>
        </group>
    );
};

// 地形 Mesh
const TerrainMesh = ({ config }: { config: TrackConfig }) => {
    const geometry = useMemo(() => {
        const size = 1200;
        const segs = 128;
        const geo = new THREE.PlaneGeometry(size, size, segs, segs);
        const posAttribute = geo.attributes.position;
        
        for (let i = 0; i < posAttribute.count; i++) {
            const x = posAttribute.getX(i);
            const y = posAttribute.getY(i); 
            // 使用 shared heightmap
            const height = getTerrainHeight(x, -y, config.id); 
            posAttribute.setZ(i, height - 2); // 稍微下沉一点，避免z-fighting
        }
        
        geo.computeVertexNormals();
        return geo;
    }, [config.id]);

    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <primitive object={geometry} />
            <meshStandardMaterial color={config.groundColor} roughness={1} metalness={0} />
        </mesh>
    );
};

const Scenery: React.FC<{ config: TrackConfig, curve: THREE.CatmullRomCurve3 }> = ({ config, curve }) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    
    const geometry = useMemo(() => {
        if (config.id === BiomeType.CITY) return new THREE.BoxGeometry(8, 50, 8); 
        if (config.id === BiomeType.SNOW) return new THREE.ConeGeometry(4, 15, 6); 
        return new THREE.DodecahedronGeometry(6); 
    }, [config.id]);

    const material = useMemo(() => {
        if (config.id === BiomeType.CITY) return new THREE.MeshStandardMaterial({ map: buildingTexture, color: '#aaa', emissive: config.gridColor, emissiveIntensity: 0.2 });
        if (config.id === BiomeType.SNOW) return new THREE.MeshStandardMaterial({ color: '#cceeff', roughness: 0.2 });
        return new THREE.MeshStandardMaterial({ color: '#7a5230', roughness: 0.9 });
    }, [config.id, config.gridColor]);

    useEffect(() => {
        if (!meshRef.current) return;
        const count = config.sceneryCount;
        const tempObj = new THREE.Object3D();

        for (let i = 0; i < count; i++) {
            const t = Math.random();
            const point = curve.getPointAt(t);
            const tangent = curve.getTangentAt(t).normalize();
            const up = new THREE.Vector3(0, 1, 0);
            const binormal = new THREE.Vector3().crossVectors(tangent, up).normalize();
            
            const side = Math.random() > 0.5 ? 1 : -1;
            // 必须在赛道宽度之外
            const dist = (TRACK_WIDTH / 2) + 5 + Math.random() * 80; 
            const pos = point.clone().add(binormal.multiplyScalar(dist * side));
            
            // 贴地
            const terrainH = getTerrainHeight(pos.x, pos.z, config.id);
            pos.y = terrainH;
            
            if (config.id === BiomeType.CITY) pos.y += 25; 
            else if (config.id === BiomeType.SNOW) pos.y += 7.5;
            else pos.y += 0;

            tempObj.position.copy(pos);
            tempObj.rotation.y = Math.random() * Math.PI * 2;
            const s = 0.8 + Math.random() * 1.5;
            tempObj.scale.set(s, s, s);

            tempObj.updateMatrix();
            meshRef.current.setMatrixAt(i, tempObj.matrix);
        }
        meshRef.current.instanceMatrix.needsUpdate = true;
    }, [config, curve]);

    return <instancedMesh ref={meshRef} args={[geometry, material, config.sceneryCount]} castShadow receiveShadow />;
};

// --- 定制赛道 Mesh 生成 (解决 ExtrudeGeometry 翻转和对齐问题) ---
const TrackMesh = ({ curve, config }: { curve: THREE.CatmullRomCurve3, config: TrackConfig }) => {
    const geometry = useMemo(() => {
        const steps = 1000;
        const width = TRACK_WIDTH / 2;
        const wallHeight = 1.2;
        const wallThick = 0.5;

        const vertices: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];
        const normals: number[] = [];

        // 我们手动构建 Mesh，使用与 Vehicle 物理完全相同的坐标系 (Tangent x Up)
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const pt = curve.getPointAt(t % 1); // 确保闭环取值正确
            const tan = curve.getTangentAt(t % 1).normalize();
            const up = new THREE.Vector3(0, 1, 0); // 强制 Y 轴向上，防止翻转
            const binormal = new THREE.Vector3().crossVectors(tan, up).normalize();
            
            // 关键：计算该点的赛道左右边缘
            const left = pt.clone().add(binormal.clone().multiplyScalar(-width));
            const right = pt.clone().add(binormal.clone().multiplyScalar(width));
            
            // 护栏顶点
            const l_wall_out = pt.clone().add(binormal.clone().multiplyScalar(-(width + wallThick)));
            const r_wall_out = pt.clone().add(binormal.clone().multiplyScalar(width + wallThick));
            
            const l_top = left.clone().add(new THREE.Vector3(0, wallHeight, 0));
            const l_out_top = l_wall_out.clone().add(new THREE.Vector3(0, wallHeight, 0));
            
            const r_top = right.clone().add(new THREE.Vector3(0, wallHeight, 0));
            const r_out_top = r_wall_out.clone().add(new THREE.Vector3(0, wallHeight, 0));

            // 顶点顺序:
            // 0: Road Left
            // 1: Road Right
            // 2: Left Wall Top Inner
            // 3: Left Wall Top Outer
            // 4: Right Wall Top Inner
            // 5: Right Wall Top Outer
            
            // Road
            vertices.push(left.x, left.y, left.z);
            vertices.push(right.x, right.y, right.z);
            
            // Left Wall
            vertices.push(l_top.x, l_top.y, l_top.z);
            vertices.push(l_out_top.x, l_out_top.y, l_out_top.z);
            
            // Right Wall
            vertices.push(r_top.x, r_top.y, r_top.z);
            vertices.push(r_out_top.x, r_out_top.y, r_out_top.z);

            // UVs
            const repeat = 40;
            uvs.push(0, t * repeat);
            uvs.push(1, t * repeat);
            uvs.push(0, t * repeat); // walls share similar UVs for simplicity
            uvs.push(0.1, t * repeat);
            uvs.push(0, t * repeat);
            uvs.push(0.1, t * repeat);

            // Normals (Simplified, flat shading usually re-computes these)
            for(let k=0; k<6; k++) normals.push(0, 1, 0);
        }

        // Indices
        const stride = 6;
        for (let i = 0; i < steps; i++) {
            const base = i * stride;
            const next = (i + 1) * stride;

            // Road Surface (2 Tris)
            indices.push(base + 0, next + 0, base + 1);
            indices.push(next + 0, next + 1, base + 1);

            // Left Wall Inner (Side facing track)
            indices.push(base + 2, next + 2, base + 0);
            indices.push(next + 2, next + 0, base + 0);

            // Left Wall Top
            indices.push(base + 3, next + 3, base + 2);
            indices.push(next + 3, next + 2, base + 2);

            // Right Wall Inner
            indices.push(base + 1, next + 1, base + 4);
            indices.push(next + 1, next + 4, base + 4);
            
            // Right Wall Top
            indices.push(base + 4, next + 4, base + 5);
            indices.push(next + 4, next + 5, base + 5);
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geo.setIndex(indices);
        geo.computeVertexNormals();
        return geo;
    }, [curve]);

    return (
        <group>
            <mesh geometry={geometry} receiveShadow castShadow>
                <meshStandardMaterial 
                    map={roadTexture}
                    color="#aaa"
                    roughness={0.8}
                    metalness={0.1}
                    side={THREE.DoubleSide}
                />
            </mesh>
            {/* 护栏发光带 */}
            <mesh geometry={geometry} position={[0, 0.1, 0]}>
                <meshBasicMaterial 
                    color={config.gridColor} 
                    wireframe 
                    transparent 
                    opacity={0.15} 
                />
            </mesh>
        </group>
    );
};

const StartLineMesh = ({ curve }: { curve: THREE.CatmullRomCurve3 }) => {
    const { pos, rot } = useMemo(() => {
        const pt = curve.getPointAt(0);
        const tan = curve.getTangentAt(0);
        // LookAt logic for rotation
        const look = pt.clone().add(tan);
        const dummy = new THREE.Object3D();
        dummy.position.copy(pt);
        dummy.lookAt(look);
        return { pos: pt, rot: dummy.rotation };
    }, [curve]);

    return (
        <group position={pos} rotation={rot}>
            <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0.05, 0]}>
                <planeGeometry args={[TRACK_WIDTH, 6]} />
                <meshBasicMaterial map={startFinishTexture} transparent />
            </mesh>
            {/* 拱门柱子 */}
            <mesh position={[-TRACK_WIDTH/2 - 1, 4, 0]}>
                <boxGeometry args={[1, 8, 1]} />
                <meshStandardMaterial color="#222" />
            </mesh>
            <mesh position={[TRACK_WIDTH/2 + 1, 4, 0]}>
                <boxGeometry args={[1, 8, 1]} />
                <meshStandardMaterial color="#222" />
            </mesh>
            {/* 横梁 */}
            <mesh position={[0, 7.5, 0]}>
                <boxGeometry args={[TRACK_WIDTH + 4, 1.5, 1]} />
                <meshStandardMaterial color="#111" emissive="#ff0000" emissiveIntensity={0.8} />
            </mesh>
             {/* START 标志 */}
             <mesh position={[0, 7.5, 0.6]}>
                <planeGeometry args={[10, 1]} />
                <meshBasicMaterial color="#fff" side={THREE.DoubleSide} onUpdate={(self) => {
                    // Simple procedural text texture could go here, relying on emissive for now
                }} />
             </mesh>
        </group>
    )
}

// --- Audio Hook (Unchanged) ---
const usePlayerAudio = (volume: number) => {
    const contextRef = useRef<AudioContext | null>(null);
    const engineOscRef = useRef<OscillatorNode | null>(null);
    const engineGainRef = useRef<GainNode | null>(null);
    const driftGainRef = useRef<GainNode | null>(null);
    const nitroOscRef = useRef<OscillatorNode | null>(null);
    const nitroGainRef = useRef<GainNode | null>(null);

    useEffect(() => {
        try {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            const ctx = new AudioContextClass();
            contextRef.current = ctx;
            const masterGain = ctx.createGain();
            masterGain.connect(ctx.destination);
            
            // Engine
            const engOsc = ctx.createOscillator();
            const engGain = ctx.createGain();
            engOsc.type = 'sawtooth';
            engOsc.frequency.value = 100;
            engOsc.start();
            engOsc.connect(engGain);
            engGain.connect(masterGain);
            engineOscRef.current = engOsc;
            engineGainRef.current = engGain;

            // Drift
            const bufferSize = ctx.sampleRate * 2;
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
            
            const driftSrc = ctx.createBufferSource();
            driftSrc.buffer = buffer;
            driftSrc.loop = true;
            driftSrc.start();
            const driftGain = ctx.createGain();
            driftGain.gain.value = 0;
            driftSrc.connect(driftGain);
            driftGain.connect(masterGain);
            driftGainRef.current = driftGain;

            // Nitro
            const nitOsc = ctx.createOscillator();
            const nitGain = ctx.createGain();
            nitOsc.type = 'square';
            nitOsc.frequency.value = 200;
            nitOsc.start();
            nitGain.gain.value = 0;
            nitOsc.connect(nitGain);
            nitGain.connect(masterGain);
            nitroOscRef.current = nitOsc;
            nitroGainRef.current = nitGain;

        } catch (e) {
            console.warn("Audio Context init failed", e);
        }
        return () => { contextRef.current?.close(); };
    }, []);

    const playCollision = () => {
        if (!contextRef.current) return;
        const ctx = contextRef.current;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.setValueAtTime(150, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(volume / 100, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
    };

    const updateAudio = (speed: number, isDrifting: boolean, isNitro: boolean) => {
        if (!contextRef.current || contextRef.current.state === 'suspended') {
            contextRef.current?.resume();
            return;
        }
        const vol = volume / 100; 
        if (engineOscRef.current && engineGainRef.current) {
            engineOscRef.current.frequency.setTargetAtTime(80 + Math.abs(speed) * 3, contextRef.current.currentTime, 0.1);
            engineGainRef.current.gain.setTargetAtTime(vol * 0.2, contextRef.current.currentTime, 0.1);
        }
        if (driftGainRef.current) {
            driftGainRef.current.gain.setTargetAtTime(isDrifting ? vol * 0.4 : 0, contextRef.current.currentTime, 0.1);
        }
        if (nitroOscRef.current && nitroGainRef.current) {
            nitroGainRef.current.gain.setTargetAtTime(isNitro ? vol * 0.3 : 0, contextRef.current.currentTime, 0.1);
        }
    };
    return { updateAudio, playCollision };
};

// --- DriftSmoke Component ---
const DriftSmoke = ({ active, position }: { active: boolean, position?: THREE.Vector3 }) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const particles = useMemo(() => Array.from({ length: 40 }, () => ({
        life: 0,
        pos: new THREE.Vector3(),
        vx: 0,
        vz: 0
    })), []);

    useFrame((_, delta) => {
        if (!meshRef.current) return;
        
        if (active) {
             for (let i = 0; i < 2; i++) {
                const p = particles.find(p => p.life <= 0);
                if (p) {
                    p.life = 0.5 + Math.random() * 0.4;
                    // Emitter near wheels
                    const side = Math.random() > 0.5 ? 0.9 : -0.9;
                    p.pos.set(side, 0.2, 1.2);
                    p.vx = (Math.random() - 0.5) * 1.5;
                    p.vz = 5 + Math.random() * 5; // Move backwards relative to car
                }
             }
        }

        let count = 0;
        particles.forEach(p => {
            if (p.life > 0) {
                p.life -= delta;
                p.pos.x += p.vx * delta;
                p.pos.y += delta * 1.5;
                p.pos.z += p.vz * delta;
                
                const s = 1 + (1.0 - p.life) * 1.5;
                dummy.position.copy(p.pos);
                dummy.scale.set(s, s, s);
                dummy.rotation.z = Math.random() * Math.PI;
                dummy.updateMatrix();
                meshRef.current!.setMatrixAt(count++, dummy.matrix);
            }
        });
        meshRef.current.count = count;
        meshRef.current.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, 40]}>
            <planeGeometry args={[0.5, 0.5]} />
            <meshBasicMaterial color="#cccccc" transparent opacity={0.3} depthWrite={false} />
        </instancedMesh>
    );
};

// --- 车辆组件 (重写对齐逻辑) ---

interface VehicleProps {
    racerRef: React.MutableRefObject<RacerState>;
    curve: THREE.CatmullRomCurve3;
    isPlayer: boolean;
    sfxVolume?: number;
    skidMarkRef?: any;
}

const Vehicle: React.FC<VehicleProps> = ({ racerRef, curve, isPlayer, skidMarkRef, sfxVolume = 100 }) => {
    const group = useRef<THREE.Group>(null);
    const chassis = useRef<THREE.Group>(null);
    const lastPos = useRef<THREE.Vector3>(new THREE.Vector3());
    const audio = usePlayerAudio(sfxVolume);

    useFrame((state, delta) => {
        const racer = racerRef.current;
        if (!group.current || racer.health <= 0) return;

        if (isPlayer) audio.updateAudio(racer.speed, racer.isDrifting, racer.isNitroActive);

        // 核心对齐算法：必须与 TrackMesh 生成算法保持一致
        const t = racer.t % 1;
        const point = curve.getPointAt(t);
        const tangent = curve.getTangentAt(t).normalize();
        const up = new THREE.Vector3(0, 1, 0); // 必须是全局 Up，不能依赖 Frenet
        const binormal = new THREE.Vector3().crossVectors(tangent, up).normalize();
        
        // 计算物理位置
        // 修正：车道偏移需要乘以实际的赛道宽度比例
        const laneX = racer.laneOffset * LANE_WIDTH;
        const currentPos = point.clone().add(binormal.clone().multiplyScalar(laneX));
        
        // 确保垂直于切线
        group.current.position.lerp(currentPos, 0.8);
        
        // 旋转：LookAt 切线方向
        const lookTarget = currentPos.clone().add(tangent);
        group.current.lookAt(lookTarget);

        // 模拟底盘悬挂动作
        if (chassis.current) {
            const driftAngle = racer.isDrifting ? (racer.laneOffset > 0 ? 0.3 : -0.3) : 0;
            // 漂移时的车身偏航
            chassis.current.rotation.y = THREE.MathUtils.lerp(chassis.current.rotation.y, driftAngle, delta * 8);
            // 转弯倾斜
            chassis.current.rotation.z = THREE.MathUtils.lerp(chassis.current.rotation.z, -racer.laneOffset * 0.05, delta * 4);
            // 加速抬头/刹车点头
            const pitch = racer.isNitroActive ? -0.05 : 0;
            chassis.current.rotation.x = THREE.MathUtils.lerp(chassis.current.rotation.x, pitch, delta * 5);
        }

        // 胎痕
        if (racer.isDrifting && skidMarkRef && skidMarkRef.current) {
            if (lastPos.current.distanceTo(group.current.position) > 0.6) {
                const l = group.current.position.clone().add(binormal.clone().multiplyScalar(-0.8));
                const r = group.current.position.clone().add(binormal.clone().multiplyScalar(0.8));
                // 确保胎痕略微高于路面
                skidMarkRef.current.addMark(l, group.current.rotation);
                skidMarkRef.current.addMark(r, group.current.rotation);
                lastPos.current.copy(group.current.position);
            }
        }
    });

    useEffect(() => {
        if(group.current) group.current.userData.playCollision = audio.playCollision;
    }, [audio.playCollision]);

    return (
        <group ref={group}>
            {/* 车影 */}
            <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0.02, 0]}>
                <planeGeometry args={[2.4, 4.8]} />
                <meshBasicMaterial color="#000" transparent opacity={0.7} depthWrite={false} />
            </mesh>
            <group ref={chassis}>
                 {/* 车身 */}
                 <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
                    <boxGeometry args={[1.8, 0.6, 3.6]} />
                    <meshStandardMaterial color={racerRef.current.color} metalness={0.7} roughness={0.2} envMapIntensity={1.5} />
                 </mesh>
                 {/* 驾驶舱 */}
                 <mesh position={[0, 0.9, -0.3]}>
                    <boxGeometry args={[1.4, 0.5, 1.8]} />
                    <meshStandardMaterial color="#111" metalness={0.9} roughness={0.1} />
                 </mesh>
                 {/* 尾翼 */}
                 <mesh position={[0, 1.0, 1.6]}>
                     <boxGeometry args={[2.0, 0.1, 0.5]} />
                     <meshStandardMaterial color={racerRef.current.color} />
                 </mesh>
                 <mesh position={[-0.8, 0.8, 1.6]}>
                     <boxGeometry args={[0.1, 0.4, 0.4]} />
                     <meshStandardMaterial color="#222" />
                 </mesh>
                 <mesh position={[0.8, 0.8, 1.6]}>
                     <boxGeometry args={[0.1, 0.4, 0.4]} />
                     <meshStandardMaterial color="#222" />
                 </mesh>

                 {/* 车灯 */}
                 <mesh position={[0.6, 0.5, -1.8]}>
                     <boxGeometry args={[0.4, 0.2, 0.1]} />
                     <meshBasicMaterial color="#fff" />
                 </mesh>
                 <mesh position={[-0.6, 0.5, -1.8]}>
                     <boxGeometry args={[0.4, 0.2, 0.1]} />
                     <meshBasicMaterial color="#fff" />
                 </mesh>
                 {/* 尾灯 */}
                 <mesh position={[0, 0.6, 1.81]}>
                     <planeGeometry args={[1.6, 0.2]} />
                     <meshBasicMaterial color={racerRef.current.isNitroActive ? "#00ffff" : "#ff0000"} />
                 </mesh>

                 {racerRef.current.isPlayer && (
                    <>
                        <spotLight position={[0, 2, -1]} angle={0.6} penumbra={0.5} intensity={10} castShadow distance={80} color="#fff" target={group.current || undefined} />
                    </>
                 )}
            </group>
            {/* 轮子 */}
            {[[-0.95, 0.35, 1.1], [0.95, 0.35, 1.1], [-0.95, 0.35, -1.1], [0.95, 0.35, -1.1]].map((pos, i) => (
                <mesh key={i} position={pos as [number,number,number]} rotation={[0,0,Math.PI/2]} castShadow>
                    <cylinderGeometry args={[0.35, 0.35, 0.5, 16]} />
                    <meshStandardMaterial color="#222" roughness={0.9} />
                </mesh>
            ))}
            <DriftSmoke active={isPlayer && racerRef.current.isDrifting} position={group.current?.position || new THREE.Vector3()} />
        </group>
    );
};

// --- 主游戏场景 ---

interface GameSceneProps {
    trackConfig: TrackConfig;
    carConfig: CarStats;
    onGameOver: (score: number, status: RaceStatus, rank: number) => void;
    onScoreUpdate: (state: RacerState) => void;
    onCountdown: (count: number) => void;
    raceStatus: RaceStatus;
    quality: 'LOW' | 'HIGH';
    sfxVolume: number;
    sensitivity: number;
}

export const GameScene: React.FC<GameSceneProps> = ({ 
    trackConfig, carConfig, onGameOver, onScoreUpdate, onCountdown, raceStatus, quality, sfxVolume, sensitivity
}) => {
    // 生成赛道曲线
    const curve = useMemo(() => generateTrackPath(42, trackConfig.curveIntensity, trackConfig.length / 3, trackConfig.id), [trackConfig]);
    
    // 物理状态
    const playerRef = useRef<RacerState>({
        id: 'player', t: 0.995, laneOffset: 0, speed: 0, lap: 1, isPlayer: true, nitroLevel: 100, health: carConfig.maxHealth, maxHealth: carConfig.maxHealth, rank: 1, distance: 0, isNitroActive: false, isDrifting: false, color: carConfig.color, velocity: {x:0, z:0}, lastLaneChange: 0
    });
    
    const aiRefs = useRef<RacerState[]>([]);
    const skidMarkRef = useRef<any>(null);
    const collisionCooldown = useRef(0);
    const keys = useRef({ left: false, right: false, up: false, down: false, drift: false, nitro: false });
    const MAX_LAPS = 2;

    // AI 初始化
    useMemo(() => {
        aiRefs.current = [];
        const colors = ['#ff3333', '#33ff33', '#3333ff', '#ffff33', '#33ffff'];
        for(let i=0; i<5; i++) {
            aiRefs.current.push({
                id: `ai_${i}`,
                t: 0.99 - (i * 0.005), 
                laneOffset: ((i % 2 === 0) ? 0.6 : -0.6), 
                speed: 0,
                lap: 1,
                isPlayer: false,
                nitroLevel: 0,
                health: 100,
                maxHealth: 100,
                rank: i + 2,
                distance: 0,
                isNitroActive: false,
                isDrifting: false,
                color: colors[i],
                velocity: { x: 0, z: 0 },
                lastLaneChange: 0
            });
        }
    }, [trackConfig]);

    // 输入处理
    useEffect(() => {
        const handleKey = (e: KeyboardEvent, pressed: boolean) => {
            const key = e.key.toLowerCase();
            if(['arrowleft','a'].includes(key)) keys.current.left = pressed;
            if(['arrowright','d'].includes(key)) keys.current.right = pressed;
            if(['arrowup','w'].includes(key)) keys.current.up = pressed;
            if(['arrowdown','s'].includes(key)) keys.current.down = pressed;
            if(key === 'shift') keys.current.drift = pressed;
            if(key === ' ') keys.current.nitro = pressed;
            if (pressed && e.key === 'Escape' && raceStatus === RaceStatus.RACING) {
                onGameOver(0, RaceStatus.WRECKED, 6); // 快速退出作为示例
            }
        };
        window.addEventListener('keydown', (e) => handleKey(e, true));
        window.addEventListener('keyup', (e) => handleKey(e, false));
        return () => { 
            window.removeEventListener('keydown', (e) => handleKey(e, true)); 
            window.removeEventListener('keyup', (e) => handleKey(e, false)); 
        };
    }, [raceStatus, onGameOver]);

    // 倒计时
    useEffect(() => {
        if (raceStatus === RaceStatus.COUNTDOWN) {
            let count = 3;
            onCountdown(3);
            const interval = setInterval(() => {
                count--;
                if (count >= 0) onCountdown(count);
            }, 1000);
            return () => clearInterval(interval);
        }
    }, [raceStatus, onCountdown]);

    // 物理循环
    useFrame((state, delta) => {
        if (raceStatus !== RaceStatus.RACING) return;
        
        // 防止超大 delta 导致穿模
        const dt = Math.min(delta, 0.05);

        const p = playerRef.current;
        
        // 氮气
        if (keys.current.nitro && p.nitroLevel > 0) {
            p.isNitroActive = true;
            p.nitroLevel = Math.max(0, p.nitroLevel - dt * 40);
        } else {
            p.isNitroActive = false;
            p.nitroLevel = Math.min(100, p.nitroLevel + dt * 10);
        }

        // 速度逻辑
        const baseSpeed = carConfig.speed * 2.5; // 提高基础速度感
        const maxSpeed = p.isNitroActive ? baseSpeed * 1.5 : baseSpeed;
        let targetSpeed = 0;
        
        if (keys.current.up) targetSpeed = maxSpeed;
        else if (keys.current.down) targetSpeed = -30; 
        
        p.isDrifting = keys.current.drift && Math.abs(p.speed) > 50 && (keys.current.left || keys.current.right);
        if (p.isDrifting) targetSpeed *= 0.95;

        // 加速度
        const accel = keys.current.up ? carConfig.acceleration * 2 : 3.0;
        p.speed = THREE.MathUtils.lerp(p.speed, targetSpeed, dt * accel);
        
        // 转向
        const sensitivityFactor = sensitivity / 50;
        let turn = 0;
        if (keys.current.left) turn += 1;
        if (keys.current.right) turn -= 1;
        
        // 速度越快，转向越灵敏但受限
        const speedFactor = Math.min(1.0, Math.abs(p.speed) / 50);
        const handling = carConfig.handling * sensitivityFactor * (p.isDrifting ? 1.5 : 1.0) * speedFactor;
        
        p.laneOffset += turn * handling * dt;
        
        // 撞墙检测
        const limit = (TRACK_WIDTH / 2 - 2) / LANE_WIDTH; // 留出车宽余量
        if (p.laneOffset > limit || p.laneOffset < -limit) {
            p.laneOffset = THREE.MathUtils.clamp(p.laneOffset, -limit, limit);
            p.speed *= 0.9; // 蹭墙减速
            p.health -= dt * 5;
        }

        // 移动
        const distStep = (p.speed * dt) / 2000; // 调整距离比例
        p.t += distStep;
        p.distance += distStep;
        if(p.t >= 1) { p.t -= 1; p.lap++; if(p.lap > MAX_LAPS) onGameOver(p.distance * 1000, RaceStatus.FINISHED, p.rank); }

        // AI 逻辑
        aiRefs.current.forEach(ai => {
            let targetAiSpeed = baseSpeed * 0.92;
            // 简单的弯道减速
            const tNext = (ai.t + 0.05) % 1;
            const curvature = curve.getTangentAt(ai.t).angleTo(curve.getTangentAt(tNext));
            if (curvature > 0.3) targetAiSpeed *= 0.7;

            ai.speed = THREE.MathUtils.lerp(ai.speed, targetAiSpeed, dt * 1.0);
            
            // 简单AI变道
            if (Math.random() < 0.02) {
                ai.lastLaneChange = (Math.random() - 0.5) * 2;
            }
            ai.laneOffset = THREE.MathUtils.lerp(ai.laneOffset, ai.lastLaneChange, dt * 0.5);
             if (ai.laneOffset > limit) ai.laneOffset = limit;
             if (ai.laneOffset < -limit) ai.laneOffset = -limit;

            const aiStep = (ai.speed * dt) / 2000;
            ai.t += aiStep;
            ai.distance += aiStep;
            if(ai.t >= 1) { ai.t -= 1; ai.lap++; }
        });

        // 碰撞检测
        if (collisionCooldown.current > 0) collisionCooldown.current -= dt;
        aiRefs.current.forEach(ai => {
            const tDist = Math.abs(p.t - ai.t);
            const laneDist = Math.abs(p.laneOffset - ai.laneOffset);
            
            // 0.005 约等于一个车身长度
            if (tDist < 0.005 && laneDist < 0.4 && collisionCooldown.current <= 0) {
                collisionCooldown.current = 0.5;
                p.speed *= 0.8;
                p.health -= 10;
                // 弹开
                const pushDir = p.laneOffset > ai.laneOffset ? 1 : -1;
                p.laneOffset += pushDir * 0.2;
                if (p.health <= 0) onGameOver(p.distance * 1000, RaceStatus.WRECKED, 6);
            }
        });

        // 排名计算
        const allRacers = [p, ...aiRefs.current].sort((a, b) => b.distance - a.distance);
        p.rank = allRacers.findIndex(r => r.id === p.id) + 1;

        // UI 更新频率限制
        if (state.clock.elapsedTime % 0.1 < 0.02) {
            onScoreUpdate({ ...p });
        }

        // --- 相机逻辑 (Action Cam) ---
        const cam = state.camera as THREE.PerspectiveCamera;
        
        // 动态 FOV：速度越快视角越广
        const targetFOV = 70 + Math.min(40, p.speed * 0.2);
        cam.fov = THREE.MathUtils.lerp(cam.fov, targetFOV, dt * 2);
        cam.updateProjectionMatrix();

        // 算出车在世界坐标的位置
        const tClamped = p.t % 1;
        const pt = curve.getPointAt(tClamped);
        const tan = curve.getTangentAt(tClamped).normalize();
        const up = new THREE.Vector3(0,1,0);
        const binormal = new THREE.Vector3().crossVectors(tan, up).normalize();
        const carWorldPos = pt.clone().add(binormal.multiplyScalar(p.laneOffset * LANE_WIDTH));
        carWorldPos.y += 1.0; // 视点高度

        // 相机目标位置：车后方 + 稍微偏上
        // 距离更近，更低，增加速度感
        const camOffset = tan.clone().multiplyScalar(-7.0).add(new THREE.Vector3(0, 2.5, 0));
        
        // 漂移时的相机甩尾效果
        if (p.isDrifting) {
            const side = p.laneOffset > 0 ? -1 : 1;
            camOffset.add(binormal.clone().multiplyScalar(side * 2.0));
        }

        const targetCamPos = carWorldPos.clone().add(camOffset);
        
        // 简单的地形避让
        const groundH = getTerrainHeight(targetCamPos.x, targetCamPos.z, trackConfig.id);
        if (targetCamPos.y < groundH + 1.5) targetCamPos.y = groundH + 1.5;

        // 增加阻尼，防止震荡
        state.camera.position.lerp(targetCamPos, dt * 5);
        
        // LookAt 稍微前方
        const lookAtTarget = carWorldPos.clone().add(tan.clone().multiplyScalar(10));
        
        // 平滑 LookAt，避免瞬间抖动
        const currentLookAt = new THREE.Vector3();
        state.camera.getWorldDirection(currentLookAt);
        const targetLookAt = lookAtTarget.clone().sub(state.camera.position).normalize();
        const smoothedLookAt = currentLookAt.lerp(targetLookAt, dt * 8);
        
        state.camera.lookAt(state.camera.position.clone().add(smoothedLookAt));
    });

    return (
        <>
            <color attach="background" args={[trackConfig.skyColor]} />
            <fog attach="fog" args={[trackConfig.fogColor, 30, 400]} />
            <ambientLight intensity={0.6} color={trackConfig.groundColor} />
            <directionalLight position={[100, 200, 50]} intensity={1.2} castShadow shadow-mapSize={[2048, 2048]} />
            
            <BackgroundLayers config={trackConfig} />
            <TrackMesh curve={curve} config={trackConfig} />
            <StartLineMesh curve={curve} />
            <TerrainMesh config={trackConfig} />
            <Scenery config={trackConfig} curve={curve} />
            <InstancedSkidMarks ref={skidMarkRef} />
            
            <Vehicle racerRef={playerRef} curve={curve} isPlayer={true} skidMarkRef={skidMarkRef} sfxVolume={sfxVolume} />
            {aiRefs.current.map((ai, i) => (
                <Vehicle key={ai.id} racerRef={{ current: aiRefs.current[i] } as any} curve={curve} isPlayer={false} sfxVolume={0} />
            ))}

            <SpeedLines speed={playerRef.current.speed} />

            <EffectComposer>
                <Bloom luminanceThreshold={0.8} mipmapBlur intensity={1.2} radius={0.4} />
                <ChromaticAberration offset={new THREE.Vector2(0.002, 0.002)} />
                <Vignette eskil={false} offset={0.1} darkness={0.5} />
                {quality === 'HIGH' && <Noise opacity={0.05} />}
            </EffectComposer>
        </>
    );
};

export default GameScene;
