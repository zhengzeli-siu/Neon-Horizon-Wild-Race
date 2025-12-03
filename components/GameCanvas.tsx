
import React, { useRef, useMemo, useState, useEffect, useLayoutEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, ChromaticAberration, Scanline, Vignette, Noise } from '@react-three/postprocessing';
import * as THREE from 'three';
import { TrackConfig, CarStats, RacerState, WeatherType, BiomeType, Particle, SkidMarkData, RaceStatus, CollisionType } from '../types';
import { generateTrackPath, createRoadTexture, createBuildingTexture, createStartFinishTexture, createTunnelTexture, getTerrainHeight, LANE_WIDTH, TRACK_WIDTH, FULL_WIDTH, SHOULDER_WIDTH } from '../constants';

// --- 全局纹理 ---
const roadTexture = createRoadTexture();
const buildingTexture = createBuildingTexture();
const startFinishTexture = createStartFinishTexture();
const tunnelTexture = createTunnelTexture();

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
            const height = getTerrainHeight(x, -y, config.id); 
            // Terrain slightly below where track would be to avoid z-fighting on flat areas,
            // but track mesh foundation will cover gaps.
            posAttribute.setZ(i, height - 5); 
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

// --- Scenery System ---

// Generic Layer for Props
const SceneryLayer = ({ 
    geometry, 
    material, 
    count, 
    curve, 
    config, 
    placementFn 
}: { 
    geometry: THREE.BufferGeometry, 
    material: THREE.Material, 
    count: number, 
    curve: THREE.CatmullRomCurve3, 
    config: TrackConfig,
    placementFn: (i: number, point: THREE.Vector3, binormal: THREE.Vector3, tangent: THREE.Vector3) => { pos: THREE.Vector3, rot: THREE.Euler, scale: THREE.Vector3 } | null
}) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);

    useEffect(() => {
        if (!meshRef.current) return;
        const tempObj = new THREE.Object3D();
        let validCount = 0;

        for (let i = 0; i < count; i++) {
            const t = Math.random();
            const point = curve.getPointAt(t);
            const tangent = curve.getTangentAt(t).normalize();
            const up = new THREE.Vector3(0, 1, 0);
            const binormal = new THREE.Vector3().crossVectors(tangent, up).normalize();

            const result = placementFn(i, point, binormal, tangent);
            if (result) {
                tempObj.position.copy(result.pos);
                tempObj.rotation.copy(result.rot);
                tempObj.scale.copy(result.scale);
                tempObj.updateMatrix();
                meshRef.current.setMatrixAt(validCount++, tempObj.matrix);
            }
        }
        meshRef.current.count = validCount;
        meshRef.current.instanceMatrix.needsUpdate = true;
    }, [config, curve, count, placementFn]);

    return <instancedMesh ref={meshRef} args={[geometry, material, count]} castShadow receiveShadow />;
};

// Dynamic Traffic for City
const TrafficSystem = ({ curve }: { curve: THREE.CatmullRomCurve3 }) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const count = 100;
    const dummy = useMemo(() => new THREE.Object3D(), []);
    
    // Store state for each car: current t, speed, lane offset, height offset
    const cars = useMemo(() => {
        return Array.from({ length: count }).map(() => ({
            t: Math.random(),
            speed: 0.1 + Math.random() * 0.2, // relative speed
            offset: (Math.random() > 0.5 ? 1 : -1) * (20 + Math.random() * 40),
            height: 15 + Math.random() * 40,
            color: new THREE.Color().setHSL(Math.random(), 1, 0.5)
        }));
    }, []);

    useFrame((_, delta) => {
        if (!meshRef.current) return;
        
        cars.forEach((car, i) => {
            car.t = (car.t + car.speed * delta * 0.1) % 1;
            
            const point = curve.getPointAt(car.t);
            const tangent = curve.getTangentAt(car.t).normalize();
            const up = new THREE.Vector3(0, 1, 0);
            const binormal = new THREE.Vector3().crossVectors(tangent, up).normalize();
            
            const pos = point.clone()
                .add(binormal.multiplyScalar(car.offset))
                .add(new THREE.Vector3(0, car.height, 0));
                
            dummy.position.copy(pos);
            dummy.lookAt(pos.clone().add(tangent));
            dummy.updateMatrix();
            meshRef.current!.setMatrixAt(i, dummy.matrix);
            meshRef.current!.setColorAt(i, car.color);
        });
        meshRef.current.instanceMatrix.needsUpdate = true;
        if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
    });

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
            <boxGeometry args={[4, 1, 2]} />
            <meshBasicMaterial toneMapped={false} />
        </instancedMesh>
    );
};

// Street Lights for City
const StreetLightSystem = ({ curve }: { curve: THREE.CatmullRomCurve3 }) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const count = 150; // Every ~1% of track
    const dummy = useMemo(() => new THREE.Object3D(), []);

    useEffect(() => {
        if (!meshRef.current) return;
        
        for (let i = 0; i < count; i++) {
            const t = i / count;
            const point = curve.getPointAt(t);
            const tangent = curve.getTangentAt(t).normalize();
            const up = new THREE.Vector3(0, 1, 0);
            const binormal = new THREE.Vector3().crossVectors(tangent, up).normalize();
            
            // Place on both sides
            const side = i % 2 === 0 ? 1 : -1;
            const pos = point.clone().add(binormal.multiplyScalar(side * 12)); // Just outside track
            
            // Snap to terrain if needed, but for city we assume flat-ish or elevated
            const h = getTerrainHeight(pos.x, pos.z, BiomeType.CITY);
            pos.y = Math.max(pos.y, h);

            dummy.position.copy(pos);
            dummy.rotation.set(0, 0, 0);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            
            meshRef.current.setMatrixAt(i, dummy.matrix);
        }
        meshRef.current.instanceMatrix.needsUpdate = true;
    }, [curve]);

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
            <cylinderGeometry args={[0.2, 0.2, 15, 8]} />
            <meshStandardMaterial color="#555" emissive="#00ffff" emissiveIntensity={2} />
        </instancedMesh>
    );
};

// Main Biome Environment Controller
const BiomeEnvironment = ({ config, curve }: { config: TrackConfig, curve: THREE.CatmullRomCurve3 }) => {
    
    // Geometries & Materials
    const buildingGeo = useMemo(() => new THREE.BoxGeometry(10, 60, 10), []);
    const buildingMat = useMemo(() => new THREE.MeshStandardMaterial({ 
        map: buildingTexture, color: '#888', emissive: config.gridColor, emissiveIntensity: 0.3 
    }), [config.gridColor]);

    const treeGeo = useMemo(() => new THREE.ConeGeometry(4, 18, 8), []);
    const treeMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2d4c1e', roughness: 0.8 }), []);

    const rockGeo = useMemo(() => new THREE.DodecahedronGeometry(5), []);
    const rockMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#7a5230', roughness: 0.9 }), []);

    const crystalGeo = useMemo(() => new THREE.OctahedronGeometry(4), []);
    const crystalMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#aaddff', metalness: 0.8, roughness: 0.1, emissive: '#004488', emissiveIntensity: 0.2 }), []);
    
    const cactusGeo = useMemo(() => new THREE.CylinderGeometry(0.8, 0.8, 8, 6), []);
    const cactusMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#446622' }), []);

    const billboardGeo = useMemo(() => new THREE.PlaneGeometry(12, 6), []);
    const billboardMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ff00ff', side: THREE.DoubleSide }), []);

    // Placement Logics
    const scatterPlacement = (distBase: number, distVar: number, scaleVar: number) => 
        (i: number, point: THREE.Vector3, binormal: THREE.Vector3) => {
            const side = Math.random() > 0.5 ? 1 : -1;
            const dist = distBase + Math.random() * distVar;
            const pos = point.clone().add(binormal.multiplyScalar(dist * side));
            const h = getTerrainHeight(pos.x, pos.z, config.id);
            pos.y = h;
            
            // Adjust height offset based on biome
            if (config.id === BiomeType.CITY) pos.y += 30; // Buildings sit deep
            else if (config.id === BiomeType.SNOW) pos.y += 9; // Tree pivot
            else pos.y += 0;

            const rot = new THREE.Euler(0, Math.random() * Math.PI * 2, 0);
            const s = 1 + Math.random() * scaleVar;
            return { pos, rot, scale: new THREE.Vector3(s, s, s) };
        };
    
    const billboardPlacement = (i: number, point: THREE.Vector3, binormal: THREE.Vector3) => {
        if (Math.random() > 0.1) return null; // Sparse billboards
        const side = Math.random() > 0.5 ? 1 : -1;
        const dist = 30 + Math.random() * 20;
        const pos = point.clone().add(binormal.multiplyScalar(dist * side));
        pos.y = getTerrainHeight(pos.x, pos.z, config.id) + 30 + Math.random() * 20; // Floating high
        
        const rot = new THREE.Euler(0, Math.atan2(point.x - pos.x, point.z - pos.z), 0);
        return { pos, rot, scale: new THREE.Vector3(1 + Math.random(), 1 + Math.random(), 1) };
    };

    if (config.id === BiomeType.CITY) {
        return (
            <>
                <SceneryLayer 
                    geometry={buildingGeo} material={buildingMat} count={600} curve={curve} config={config}
                    placementFn={scatterPlacement(25, 80, 2)}
                />
                <SceneryLayer 
                    geometry={billboardGeo} material={billboardMat} count={50} curve={curve} config={config}
                    placementFn={billboardPlacement}
                />
                <StreetLightSystem curve={curve} />
                <TrafficSystem curve={curve} />
            </>
        );
    }

    if (config.id === BiomeType.SNOW) {
        return (
            <>
                <SceneryLayer 
                    geometry={treeGeo} material={treeMat} count={500} curve={curve} config={config}
                    placementFn={scatterPlacement(20, 60, 1.5)}
                />
                <SceneryLayer 
                    geometry={crystalGeo} material={crystalMat} count={100} curve={curve} config={config}
                    placementFn={scatterPlacement(15, 30, 1)}
                />
            </>
        );
    }

    // Desert (Default)
    return (
        <>
            <SceneryLayer 
                geometry={rockGeo} material={rockMat} count={300} curve={curve} config={config}
                placementFn={scatterPlacement(20, 100, 2)}
            />
            <SceneryLayer 
                geometry={cactusGeo} material={cactusMat} count={200} curve={curve} config={config}
                placementFn={scatterPlacement(15, 40, 0.5)}
            />
        </>
    );
};

// --- 定制赛道 Mesh 生成 (包含路肩、护栏和基座) ---
const TrackMesh = ({ curve, config }: { curve: THREE.CatmullRomCurve3, config: TrackConfig }) => {
    const geometry = useMemo(() => {
        const steps = 800; // Match path generation steps or higher
        const roadHalfW = TRACK_WIDTH / 2;
        const fullHalfW = FULL_WIDTH / 2;
        const wallHeight = 1.2;
        const wallThick = 0.5;
        const foundationDepth = 50; // Depth of the skirt into the ground

        const vertices: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];
        const normals: number[] = [];

        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const pt = curve.getPointAt(t % 1); 
            const tan = curve.getTangentAt(t % 1).normalize();
            const up = new THREE.Vector3(0, 1, 0);
            const binormal = new THREE.Vector3().crossVectors(tan, up).normalize();
            
            // Calculate positions
            const P = (offset: number, yOff: number = 0) => 
                pt.clone().add(binormal.clone().multiplyScalar(offset)).add(new THREE.Vector3(0, yOff, 0));

            // Foundation (Deep skirt)
            const p_found_l = P(-(fullHalfW + wallThick), -foundationDepth);
            const p_found_r = P(fullHalfW + wallThick, -foundationDepth);

            // Walls & Road
            const p_wall_l_out = P(-(fullHalfW + wallThick));
            const p_wall_l_out_top = P(-(fullHalfW + wallThick), wallHeight);
            const p_wall_l_in_top = P(-fullHalfW, wallHeight);
            const p_shoulder_l = P(-fullHalfW);
            
            const p_road_l = P(-roadHalfW);
            const p_road_r = P(roadHalfW);
            
            const p_shoulder_r = P(fullHalfW);
            const p_wall_r_in_top = P(fullHalfW, wallHeight);
            const p_wall_r_out_top = P(fullHalfW + wallThick, wallHeight);
            const p_wall_r_out = P(fullHalfW + wallThick);

            // Push vertices for this slice
            const pushV = (v: THREE.Vector3) => vertices.push(v.x, v.y, v.z);
            
            // 0: Left Foundation
            pushV(p_found_l);
            // 1: Left Wall Out Bottom
            pushV(p_wall_l_out); 
            // 2: Left Wall Out Top
            pushV(p_wall_l_out_top); 
            // 3: Left Wall In Top
            pushV(p_wall_l_in_top); 
            // 4: Left Shoulder Start
            pushV(p_shoulder_l); 
            // 5: Road Left
            pushV(p_road_l); 
            // 6: Road Right
            pushV(p_road_r); 
            // 7: Right Shoulder End
            pushV(p_shoulder_r); 
            // 8: Right Wall In Top
            pushV(p_wall_r_in_top); 
            // 9: Right Wall Out Top
            pushV(p_wall_r_out_top); 
            // 10: Right Wall Out Bottom
            pushV(p_wall_r_out);
            // 11: Right Foundation
            pushV(p_found_r);

            // UVs
            const repeat = 80;
            const vCoord = t * repeat;
            
            uvs.push(0, vCoord); // 0
            uvs.push(0, vCoord); // 1
            uvs.push(0, vCoord); // 2
            uvs.push(0, vCoord); // 3 
            uvs.push(0.0, vCoord); // 4 (Shoulder Start)
            uvs.push(0.125, vCoord); // 5 (Road Start)
            uvs.push(0.875, vCoord); // 6 (Road End)
            uvs.push(1.0, vCoord); // 7 (Shoulder End)
            uvs.push(1, vCoord); // 8
            uvs.push(1, vCoord); // 9
            uvs.push(1, vCoord); // 10
            uvs.push(1, vCoord); // 11

            // Normals placeholder (computed later)
            for(let k=0; k<12; k++) normals.push(0, 1, 0);
        }

        // Indices
        const stride = 12;
        for (let i = 0; i < steps; i++) {
            const b = i * stride;
            const n = (i + 1) * stride;
            
            const addQuad = (i1: number, i2: number) => {
                indices.push(b + i1, n + i1, b + i2);
                indices.push(n + i1, n + i2, b + i2);
            };

            // Foundation Skirts
            addQuad(0, 1); // Left Found
            
            // Left Wall
            addQuad(1, 2);
            addQuad(2, 3);
            addQuad(3, 4);
            
            // Left Shoulder
            addQuad(4, 5);
            
            // Main Road
            addQuad(5, 6);
            
            // Right Shoulder
            addQuad(6, 7);
            
            // Right Wall
            addQuad(7, 8);
            addQuad(8, 9);
            addQuad(9, 10);

            // Right Foundation
            addQuad(10, 11);
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
            {/* 护栏发光条 */}
            <mesh geometry={geometry} position={[0, 0.05, 0]}>
                <meshBasicMaterial 
                    color={config.gridColor} 
                    wireframe 
                    transparent 
                    opacity={0.05} 
                />
            </mesh>
        </group>
    );
};

// --- Tunnel Mesh ---
const TunnelMesh = ({ curve, config }: { curve: THREE.CatmullRomCurve3, config: TrackConfig }) => {
    const geometry = useMemo(() => {
        // Defines the Tunnel Segment range (must match generateTrackPath)
        const tStart = 0.65;
        const tEnd = 0.78;
        const steps = 50;
        
        const vertices: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];
        
        const radius = 18; // Wider tunnel
        const radialSegs = 16;

        for (let i = 0; i <= steps; i++) {
            const t = tStart + (tEnd - tStart) * (i / steps);
            const pt = curve.getPointAt(t);
            const tan = curve.getTangentAt(t).normalize();
            const up = new THREE.Vector3(0, 1, 0);
            const binormal = new THREE.Vector3().crossVectors(tan, up).normalize();
            const correctedUp = new THREE.Vector3().crossVectors(binormal, tan).normalize();

            // Ring (Arch)
            for (let j = 0; j <= radialSegs; j++) {
                const angle = (j / radialSegs) * Math.PI; // 0 to PI
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                
                // Position: centered on track
                const pos = pt.clone()
                    .add(binormal.clone().multiplyScalar(cos * radius))
                    .add(correctedUp.clone().multiplyScalar(sin * radius));
                
                vertices.push(pos.x, pos.y, pos.z);
                uvs.push(i / steps * 5, j / radialSegs);
            }
        }

        const stride = radialSegs + 1;
        for (let i = 0; i < steps; i++) {
            for (let j = 0; j < radialSegs; j++) {
                const current = i * stride + j;
                const next = (i + 1) * stride + j;
                
                indices.push(current, next, current + 1);
                indices.push(next, next + 1, current + 1);
            }
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geo.setIndex(indices);
        geo.computeVertexNormals();
        return geo;
    }, [curve]);

    return (
        <mesh geometry={geometry}>
            <meshStandardMaterial 
                map={tunnelTexture} 
                color="#888"
                emissive={config.gridColor}
                emissiveIntensity={0.6}
                roughness={0.3}
                metalness={0.9}
                side={THREE.DoubleSide} // Render interior
            />
        </mesh>
    );
};

// --- Jump Visuals ---
const JumpArrows = ({ curve }: { curve: THREE.CatmullRomCurve3 }) => {
    const refs = useRef<THREE.Mesh[]>([]);
    const jumpStartT = 0.45;

    useEffect(() => {
        // Place arrows on the ramp
        refs.current.forEach((mesh, i) => {
            const t = jumpStartT + i * 0.01;
            const pt = curve.getPointAt(t);
            const tan = curve.getTangentAt(t).normalize();
            mesh.position.copy(pt);
            mesh.lookAt(pt.clone().add(tan));
            mesh.position.y += 0.5; // Lift off ground
        });
    }, [curve]);

    useFrame(({ clock }) => {
        const time = clock.getElapsedTime();
        refs.current.forEach((mesh, i) => {
            if(mesh) {
                const scale = 1 + Math.sin(time * 10 - i) * 0.2;
                mesh.scale.set(scale, scale, scale);
                (mesh.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.sin(time * 5 + i) * 0.5;
            }
        });
    });

    return (
        <group>
            {[0, 1, 2, 3, 4, 5, 6].map(i => (
                <mesh key={i} ref={el => refs.current[i] = el!} rotation={[-Math.PI/2, 0, 0]}>
                    <planeGeometry args={[10, 5]} />
                    <meshBasicMaterial color="#00ff00" transparent opacity={0.8} side={THREE.DoubleSide}>
                        {/* Simple Arrow Texture could be procedural, using color for now */}
                    </meshBasicMaterial>
                </mesh>
            ))}
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
                <planeGeometry args={[FULL_WIDTH, 6]} />
                <meshBasicMaterial map={startFinishTexture} transparent />
            </mesh>
            {/* 拱门柱子 */}
            <mesh position={[-FULL_WIDTH/2 - 1, 4, 0]}>
                <boxGeometry args={[1, 8, 1]} />
                <meshStandardMaterial color="#222" />
            </mesh>
            <mesh position={[FULL_WIDTH/2 + 1, 4, 0]}>
                <boxGeometry args={[1, 8, 1]} />
                <meshStandardMaterial color="#222" />
            </mesh>
            {/* 横梁 */}
            <mesh position={[0, 7.5, 0]}>
                <boxGeometry args={[FULL_WIDTH + 4, 1.5, 1]} />
                <meshStandardMaterial color="#111" emissive="#ff0000" emissiveIntensity={0.8} />
            </mesh>
             {/* START 标志 */}
             <mesh position={[0, 7.5, 0.6]}>
                <planeGeometry args={[10, 1]} />
                <meshBasicMaterial color="#fff" side={THREE.DoubleSide} onUpdate={(self) => {
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

// --- Collision Sparks ---
const CollisionSparks = ({ active, position }: { active: boolean, position: THREE.Vector3 }) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const particles = useMemo(() => Array.from({ length: 30 }, () => ({
        life: 0,
        pos: new THREE.Vector3(),
        velocity: new THREE.Vector3()
    })), []);
    
    // Trigger burst when active changes to true (handled by parent logic repeatedly calling or resetting?)
    // Actually, parent will likely just set active=true for a frame or pass a signal.
    // Better: maintain own state of burst based on prop change or just always emit if active.
    
    useFrame((_, delta) => {
        if (!meshRef.current) return;
        
        // Emit logic
        if (active) {
            for (let i = 0; i < 5; i++) {
                const p = particles.find(p => p.life <= 0);
                if (p) {
                    p.life = 0.3 + Math.random() * 0.2;
                    p.pos.copy(position);
                    p.velocity.set(
                        (Math.random() - 0.5) * 10,
                        Math.random() * 10,
                        (Math.random() - 0.5) * 10
                    );
                }
            }
        }

        let count = 0;
        particles.forEach(p => {
            if (p.life > 0) {
                p.life -= delta;
                p.pos.addScaledVector(p.velocity, delta);
                p.velocity.y -= 20 * delta; // Gravity
                
                const s = p.life * 2;
                dummy.position.copy(p.pos);
                dummy.scale.set(s, s, s);
                dummy.lookAt(position); // billboard-ish
                dummy.updateMatrix();
                meshRef.current!.setMatrixAt(count++, dummy.matrix);
            }
        });
        meshRef.current.count = count;
        meshRef.current.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, 30]}>
            <planeGeometry args={[0.2, 0.2]} />
            <meshBasicMaterial color="#ffaa00" blending={THREE.AdditiveBlending} depthWrite={false} />
        </instancedMesh>
    );
}

// --- 车辆组件 (重写对齐逻辑) ---

interface VehicleProps {
    racerRef: React.MutableRefObject<RacerState>;
    curve: THREE.CatmullRomCurve3;
    isPlayer: boolean;
    sfxVolume?: number;
    skidMarkRef?: any;
    // New props for customization
    config?: CarStats;
    playerCustomization?: any;
}

const Vehicle: React.FC<VehicleProps> = ({ racerRef, curve, isPlayer, skidMarkRef, sfxVolume = 100, config, playerCustomization }) => {
    const group = useRef<THREE.Group>(null);
    const chassis = useRef<THREE.Group>(null);
    const lastPos = useRef<THREE.Vector3>(new THREE.Vector3());
    const audio = usePlayerAudio(sfxVolume);
    const [collisionActive, setCollisionActive] = useState(false);

    // Determine appearance
    const carColor = useMemo(() => {
        if (isPlayer && playerCustomization?.color) return playerCustomization.color;
        return racerRef.current.color;
    }, [isPlayer, playerCustomization, racerRef]);
    
    // Decal texture
    const decalMap = useMemo(() => {
        // Implement real texture loading if needed
        return null; 
    }, [playerCustomization]);

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
        // laneOffset -1 to 1. Full track width for lanes is TRACK_WIDTH (excluding shoulders)
        const laneX = racer.laneOffset * (TRACK_WIDTH / 2 - 2); 
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
        
        // Check collision flag from logic (simple workaround: if health drops fast?)
        // Better: GameScene sets a "collision event" in state. 
        // For now, we assume GameScene handled the logic and maybe we trigger visual based on sudden speed drop or similar?
        // Actually, let's just make collision sparks appear if we are off-road or hitting something (handled by GameScene logic passing props?)
        // For simplicity in this structure: GameScene handles physics.
    });

    useEffect(() => {
        if(group.current) {
            group.current.userData.playCollision = () => {
                audio.playCollision();
                setCollisionActive(true);
                setTimeout(() => setCollisionActive(false), 200);
            };
        }
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
                    <meshStandardMaterial color={carColor} metalness={0.7} roughness={0.2} envMapIntensity={1.5} />
                 </mesh>
                 {/* Decal Overlay (Simplified) */}
                 {playerCustomization?.decalId && (
                     <mesh position={[0, 0.81, 0]} rotation={[-Math.PI/2, 0, 0]}>
                         <planeGeometry args={[1.5, 3.0]} />
                         <meshStandardMaterial color="#fff" transparent opacity={0.8} />
                     </mesh>
                 )}

                 {/* 驾驶舱 */}
                 <mesh position={[0, 0.9, -0.3]}>
                    <boxGeometry args={[1.4, 0.5, 1.8]} />
                    <meshStandardMaterial color="#111" metalness={0.9} roughness={0.1} />
                 </mesh>
                 {/* 尾翼 */}
                 <mesh position={[0, 1.0, 1.6]}>
                     <boxGeometry args={[2.0, 0.1, 0.5]} />
                     <meshStandardMaterial color={carColor} />
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
            <CollisionSparks active={collisionActive} position={group.current?.position || new THREE.Vector3()} />
        </group>
    );
};

// --- 主游戏场景 ---

interface GameSceneProps {
    trackConfig: TrackConfig;
    carConfig: CarStats;
    playerCustomization?: any;
    onGameOver: (score: number, status: RaceStatus, rank: number) => void;
    onScoreUpdate: (state: RacerState) => void;
    onCountdown: (count: number) => void;
    raceStatus: RaceStatus;
    quality: 'LOW' | 'HIGH';
    sfxVolume: number;
    sensitivity: number;
}

export const GameScene: React.FC<GameSceneProps> = ({ 
    trackConfig, carConfig, playerCustomization, onGameOver, onScoreUpdate, onCountdown, raceStatus, quality, sfxVolume, sensitivity
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
    const shakeIntensity = useRef(0); // Camera Shake Intensity
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
                // Should pause, but for now simple quit
                onGameOver(0, RaceStatus.WRECKED, 6); 
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
            shakeIntensity.current = Math.max(shakeIntensity.current, 0.15); // Nitro Shake
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
        // 修正：按下左键(A/←)应该向左移动(laneOffset减小)，按下右键(D/→)应该向右移动(laneOffset增加)
        if (keys.current.left) turn -= 1;
        if (keys.current.right) turn += 1;
        
        // 速度越快，转向越灵敏但受限
        const speedFactor = Math.min(1.0, Math.abs(p.speed) / 50);
        const handling = carConfig.handling * sensitivityFactor * (p.isDrifting ? 1.5 : 1.0) * speedFactor;
        
        p.laneOffset += turn * handling * dt;
        
        // 撞墙检测
        if (p.laneOffset > 1.0 || p.laneOffset < -1.0) {
            p.laneOffset = THREE.MathUtils.clamp(p.laneOffset, -1.0, 1.0);
            p.speed *= 0.9; // 蹭墙减速
            p.health -= dt * 5;
            shakeIntensity.current = Math.max(shakeIntensity.current, 0.3); // Wall Hit Shake
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
             if (ai.laneOffset > 1.0) ai.laneOffset = 1.0;
             if (ai.laneOffset < -1.0) ai.laneOffset = -1.0;

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
                shakeIntensity.current = Math.max(shakeIntensity.current, 0.8); // Car Collision Shake
                if (p.health <= 0) onGameOver(p.distance * 1000, RaceStatus.WRECKED, 6);
                
                // Visual Spark
                // Ideally trigger via ref
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
        
        const laneX = p.laneOffset * (TRACK_WIDTH / 2 - 2);
        const carWorldPos = pt.clone().add(binormal.multiplyScalar(laneX));
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
        
        // 简单的地形避让 (Prevent camera clipping under ground)
        const groundH = getTerrainHeight(targetCamPos.x, targetCamPos.z, trackConfig.id);
        // Also check if inside a tunnel (approximate check by Y height if needed, but simple Y check works for now)
        if (targetCamPos.y < groundH + 1.5) targetCamPos.y = groundH + 1.5;

        // Apply Shake
        shakeIntensity.current = THREE.MathUtils.lerp(shakeIntensity.current, 0, dt * 5);
        if (shakeIntensity.current > 0.01) {
            targetCamPos.add(new THREE.Vector3(
                (Math.random() - 0.5) * shakeIntensity.current,
                (Math.random() - 0.5) * shakeIntensity.current,
                (Math.random() - 0.5) * shakeIntensity.current
            ));
        }

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
            <TunnelMesh curve={curve} config={trackConfig} />
            <JumpArrows curve={curve} />
            <StartLineMesh curve={curve} />
            <TerrainMesh config={trackConfig} />
            <BiomeEnvironment config={trackConfig} curve={curve} />
            <InstancedSkidMarks ref={skidMarkRef} />
            
            <Vehicle 
                racerRef={playerRef} 
                curve={curve} 
                isPlayer={true} 
                skidMarkRef={skidMarkRef} 
                sfxVolume={sfxVolume} 
                config={carConfig}
                playerCustomization={playerCustomization}
            />
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
