

import React, { useRef, useMemo, useState, useEffect, useLayoutEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, ChromaticAberration, Scanline, Vignette, Noise } from '@react-three/postprocessing';
import * as THREE from 'three';
import { TrackConfig, CarStats, RacerState, WeatherType, BiomeType, Particle, SkidMarkData, RaceStatus, CollisionType } from '../types';
import { generateTrackPath, getTrackFeatures, TrackFeature, createRoadTexture, createBuildingTexture, createStartFinishTexture, createTunnelTexture, getTerrainHeight, LANE_WIDTH, TRACK_WIDTH, FULL_WIDTH, SHOULDER_WIDTH } from '../constants';

// --- 全局纹理 ---
const roadTexture = createRoadTexture();
const buildingTexture = createBuildingTexture();
const startFinishTexture = createStartFinishTexture();
const tunnelTexture = createTunnelTexture();

// --- 高性能实例组件 ---

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
            <planeGeometry args={[0.8, 0.8]} />
            <meshBasicMaterial color="#111" transparent opacity={0.5} depthWrite={false} polygonOffset polygonOffsetFactor={-1} />
        </instancedMesh>
    );
});

// --- 视觉辅助组件 ---

const SpeedLines = ({ speed }: { speed: number }) => {
    const ref = useRef<THREE.Group>(null);
    const count = 40;
    
    const lines = useMemo(() => {
        return new Array(count).fill(0).map(() => ({
            x: (Math.random() - 0.5) * 60,
            y: (Math.random() - 0.5) * 50,
            z: Math.random() * 20,
            len: 8 + Math.random() * 12,
            speed: 1.5 + Math.random()
        }));
    }, []);

    useFrame((_, delta) => {
        if (!ref.current) return;
        ref.current.visible = speed > 120;
        if (speed <= 120) return;

        ref.current.children.forEach((mesh, i) => {
            const line = lines[i];
            mesh.position.z -= line.speed * (speed * 0.8) * delta;
            if (mesh.position.z < -10) {
                mesh.position.z = 50 + Math.random() * 30;
                mesh.position.x = (Math.random() - 0.5) * 60;
                mesh.position.y = (Math.random() - 0.5) * 50;
            }
        });
    });

    return (
        <group ref={ref}>
            {lines.map((l, i) => (
                <mesh key={i} position={[l.x, l.y, l.z]}>
                    <boxGeometry args={[0.1, 0.1, l.len]} />
                    <meshBasicMaterial color="#ffffff" transparent opacity={0.3} />
                </mesh>
            ))}
        </group>
    );
};

const BackgroundLayers = ({ config }: { config: TrackConfig }) => {
    const mountainGeo = useMemo(() => {
        const geo = new THREE.CylinderGeometry(600, 600, 200, 32, 1, true);
        const pos = geo.attributes.position;
        for (let i=0; i<pos.count; i++) {
             if (pos.getY(i) > 0) {
                 pos.setY(i, 50 + Math.random() * 100); 
             } else {
                 pos.setY(i, -100);
             }
        }
        geo.computeVertexNormals();
        return geo;
    }, []);

    return (
        <group>
            <mesh scale={[900, 900, 900]} position={[0, 0, 0]}>
                 <sphereGeometry args={[1, 32, 16]} />
                 <meshBasicMaterial color={config.skyColor} side={THREE.BackSide} />
            </mesh>
            <mesh geometry={mountainGeo} position={[0, -80, 0]}>
                 <meshBasicMaterial color={config.fogColor} side={THREE.BackSide} transparent opacity={0.8} />
            </mesh>
        </group>
    );
};

const TerrainMesh = ({ config }: { config: TrackConfig }) => {
    const geometry = useMemo(() => {
        const size = 1500;
        const segs = 64; 
        const geo = new THREE.PlaneGeometry(size, size, segs, segs);
        const posAttribute = geo.attributes.position;
        
        for (let i = 0; i < posAttribute.count; i++) {
            const x = posAttribute.getX(i);
            const y = posAttribute.getY(i); 
            const height = getTerrainHeight(x, -y, config.id); 
            posAttribute.setZ(i, height - 15); // Lower slightly more to avoid clipping foundation
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

const SceneryLayer = ({ 
    geometry, 
    material, 
    count, 
    curve, 
    config, 
    features,
    placementFn 
}: { 
    geometry: THREE.BufferGeometry, 
    material: THREE.Material, 
    count: number, 
    curve: THREE.CatmullRomCurve3, 
    config: TrackConfig,
    features: TrackFeature[],
    placementFn: (i: number, point: THREE.Vector3, binormal: THREE.Vector3) => { pos: THREE.Vector3, rot: THREE.Euler, scale: THREE.Vector3 } | null
}) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);

    useLayoutEffect(() => {
        if (!meshRef.current) return;
        const tempObj = new THREE.Object3D();
        let validCount = 0;

        for (let i = 0; i < count; i++) {
            const t = Math.random();
            
            // Strictly ban scenery on track features (Tunnels/Jumps) to avoid clipping
            const inTunnelOrJump = features.some(f => (f.type === 'TUNNEL' || f.type === 'JUMP') && t >= f.start - 0.05 && t <= f.end + 0.05);
            if (inTunnelOrJump) continue;

            const point = curve.getPointAt(t);
            const tangent = curve.getTangentAt(t).normalize();
            const up = new THREE.Vector3(0, 1, 0);
            const binormal = new THREE.Vector3().crossVectors(tangent, up).normalize();
            
            // Check proximity to ANY track point to prevent cutting corners
            // This is a simplified check, ideally we use SDF or distance to spline
            const result = placementFn(i, point, binormal);
            if (result) {
                // IMPORTANT: Ensure objects spawn far enough from the track center
                // Use a minimum distance (e.g., 35 units) to clear road + shoulders + safety margin
                const MIN_DIST = 35;
                const distToTrack = result.pos.distanceTo(point);
                
                // Extra check: prevent spawning "inside" the loop too close to other segments
                // This is expensive so we only do a basic distance check to current t
                if (distToTrack < MIN_DIST) continue; 

                tempObj.position.copy(result.pos);
                tempObj.rotation.copy(result.rot);
                tempObj.scale.copy(result.scale);
                tempObj.updateMatrix();
                meshRef.current.setMatrixAt(validCount++, tempObj.matrix);
            }
        }
        meshRef.current.count = validCount;
        meshRef.current.instanceMatrix.needsUpdate = true;
    }, [config, curve, count, placementFn, features]);

    return <instancedMesh ref={meshRef} args={[geometry, material, count]} castShadow receiveShadow frustumCulled={true} />;
};

const TrafficSystem = ({ curve }: { curve: THREE.CatmullRomCurve3 }) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const count = 60; // Reduced traffic for performance
    const dummy = useMemo(() => new THREE.Object3D(), []);
    
    const cars = useMemo(() => {
        return Array.from({ length: count }).map(() => ({
            t: Math.random(),
            speed: 0.1 + Math.random() * 0.1, 
            offset: (Math.random() > 0.5 ? 1 : -1) * (30 + Math.random() * 40),
            height: 20 + Math.random() * 30,
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

const StreetLightSystem = ({ curve, features }: { curve: THREE.CatmullRomCurve3, features: TrackFeature[] }) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const count = 120; 
    const dummy = useMemo(() => new THREE.Object3D(), []);

    useEffect(() => {
        if (!meshRef.current) return;
        
        let valid = 0;
        for (let i = 0; i < count; i++) {
            const t = i / count;
            if (features.some(f => f.type === 'TUNNEL' && t >= f.start && t <= f.end)) continue;

            const point = curve.getPointAt(t);
            const tangent = curve.getTangentAt(t).normalize();
            const up = new THREE.Vector3(0, 1, 0);
            const binormal = new THREE.Vector3().crossVectors(tangent, up).normalize();
            
            const side = i % 2 === 0 ? 1 : -1;
            // Increased distance for streetlights
            const pos = point.clone().add(binormal.multiplyScalar(side * 20)); 
            
            const h = getTerrainHeight(pos.x, pos.z, BiomeType.CITY);
            pos.y = Math.max(pos.y, h - 5); 

            dummy.position.copy(pos);
            dummy.rotation.set(0, 0, 0);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            
            meshRef.current.setMatrixAt(valid++, dummy.matrix);
        }
        meshRef.current.count = valid;
        meshRef.current.instanceMatrix.needsUpdate = true;
    }, [curve, features]);

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
            <cylinderGeometry args={[0.2, 0.2, 15, 8]} />
            <meshStandardMaterial color="#333" emissive="#00ffff" emissiveIntensity={1} />
        </instancedMesh>
    );
};

const BiomeEnvironment = ({ config, curve, features }: { config: TrackConfig, curve: THREE.CatmullRomCurve3, features: TrackFeature[] }) => {
    
    const buildingGeo = useMemo(() => new THREE.BoxGeometry(15, 80, 15), []);
    const buildingMat = useMemo(() => new THREE.MeshStandardMaterial({ 
        map: buildingTexture, color: '#666', emissive: config.gridColor, emissiveIntensity: 0.2 
    }), [config.gridColor]);

    const treeGeo = useMemo(() => new THREE.ConeGeometry(5, 25, 8), []);
    const treeMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1a3311', roughness: 0.9 }), []);

    const rockColor = config.id === BiomeType.VOLCANO ? '#221111' : '#554433';
    const rockGeo = useMemo(() => new THREE.DodecahedronGeometry(6), []);
    const rockMat = useMemo(() => new THREE.MeshStandardMaterial({ color: rockColor, roughness: 1.0 }), [rockColor]);

    const scatterPlacement = (distBase: number, distVar: number, scaleVar: number) => 
        (i: number, point: THREE.Vector3, binormal: THREE.Vector3) => {
            const side = Math.random() > 0.5 ? 1 : -1;
            // INCREASED SAFE DISTANCE SIGNIFICANTLY
            const dist = (distBase + 35) + Math.random() * distVar; 
            const pos = point.clone().add(binormal.multiplyScalar(dist * side));
            const h = getTerrainHeight(pos.x, pos.z, config.id);
            pos.y = h;
            
            if (config.id === BiomeType.CITY) pos.y += 40; 
            else if (config.id === BiomeType.SNOW) pos.y += 12; 
            else pos.y += 0;

            const rot = new THREE.Euler(0, Math.random() * Math.PI * 2, 0);
            const s = 1 + Math.random() * scaleVar;
            return { pos, rot, scale: new THREE.Vector3(s, s, s) };
        };
    
    // ... city billboard logic ...
     const billboardGeo = useMemo(() => new THREE.PlaneGeometry(16, 8), []);
     const billboardMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ff00ff', side: THREE.DoubleSide }), []);
     const billboardPlacement = (i: number, point: THREE.Vector3, binormal: THREE.Vector3) => {
        if (Math.random() > 0.15) return null; 
        const side = Math.random() > 0.5 ? 1 : -1;
        const dist = 50 + Math.random() * 30; // Further back
        const pos = point.clone().add(binormal.multiplyScalar(dist * side));
        pos.y = getTerrainHeight(pos.x, pos.z, config.id) + 40 + Math.random() * 20; 
        const rot = new THREE.Euler(0, Math.atan2(point.x - pos.x, point.z - pos.z), 0);
        return { pos, rot, scale: new THREE.Vector3(1, 1, 1) };
    };

    if (config.id === BiomeType.CITY) {
        return (
            <>
                <SceneryLayer 
                    geometry={buildingGeo} material={buildingMat} count={400} curve={curve} config={config} features={features}
                    placementFn={scatterPlacement(40, 100, 2)}
                />
                <SceneryLayer 
                    geometry={billboardGeo} material={billboardMat} count={40} curve={curve} config={config} features={features}
                    placementFn={billboardPlacement}
                />
                <StreetLightSystem curve={curve} features={features} />
                <TrafficSystem curve={curve} />
            </>
        );
    }

    if (config.id === BiomeType.SNOW) {
        return (
            <SceneryLayer 
                geometry={treeGeo} material={treeMat} count={400} curve={curve} config={config} features={features}
                placementFn={scatterPlacement(30, 80, 1.5)}
            />
        );
    }

    return (
        <SceneryLayer 
            geometry={rockGeo} material={rockMat} count={250} curve={curve} config={config} features={features}
            placementFn={scatterPlacement(30, 110, 2)}
        />
    );
};

// --- Track Mesh ---
const TrackMesh = ({ curve, config }: { curve: THREE.CatmullRomCurve3, config: TrackConfig }) => {
    const geometry = useMemo(() => {
        const steps = 400; // Optimized
        const roadHalfW = TRACK_WIDTH / 2;
        const fullHalfW = FULL_WIDTH / 2;
        const wallHeight = 1.2;
        const wallThick = 0.5;
        const foundationDepth = 80; // Deeper foundation

        const vertices: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];
        const normals: number[] = [];

        for (let i = 0; i <= steps; i++) {
            // FIX: Ensure t loops perfectly from 0 to 1
            // When i = steps, t = 1. We treat t=1 exactly as t=0 geometry to close the loop without seams.
            const t = i / steps;
            const tSample = t >= 1 ? 0 : t; // Loop back for sampling
            const pt = curve.getPointAt(tSample); 
            const tan = curve.getTangentAt(tSample).normalize();
            const up = new THREE.Vector3(0, 1, 0);
            const binormal = new THREE.Vector3().crossVectors(tan, up).normalize();
            
            // Generate profile points
            const P = (offset: number, yOff: number = 0) => 
                pt.clone().add(binormal.clone().multiplyScalar(offset)).add(new THREE.Vector3(0, yOff, 0));

            // Profile Shape
            const p_found_l = P(-(fullHalfW + wallThick), -foundationDepth);
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
            const p_found_r = P(fullHalfW + wallThick, -foundationDepth);

            const pushV = (v: THREE.Vector3) => vertices.push(v.x, v.y, v.z);
            
            pushV(p_found_l); // 0
            pushV(p_wall_l_out); // 1
            pushV(p_wall_l_out_top); // 2
            pushV(p_wall_l_in_top); // 3
            pushV(p_shoulder_l); // 4
            pushV(p_road_l); // 5
            pushV(p_road_r); // 6
            pushV(p_shoulder_r); // 7
            pushV(p_wall_r_in_top); // 8
            pushV(p_wall_r_out_top); // 9
            pushV(p_wall_r_out); // 10
            pushV(p_found_r); // 11

            const repeat = 60;
            const vCoord = t * repeat;
            
            // UV Mapping
            uvs.push(0, vCoord); // Found L
            uvs.push(0, vCoord); // Wall L Out
            uvs.push(0, vCoord); 
            uvs.push(0, vCoord); 
            uvs.push(0.0, vCoord); // Shoulder L Start
            uvs.push(0.12, vCoord); // Road L
            uvs.push(0.88, vCoord); // Road R
            uvs.push(1.0, vCoord); // Shoulder R End
            uvs.push(1, vCoord); 
            uvs.push(1, vCoord); 
            uvs.push(1, vCoord); 
            uvs.push(1, vCoord);

            for(let k=0; k<12; k++) normals.push(0, 1, 0);
        }

        const stride = 12;
        for (let i = 0; i < steps; i++) {
            const b = i * stride;
            const n = (i + 1) * stride;
            
            const addQuad = (i1: number, i2: number) => {
                indices.push(b + i1, n + i1, b + i2);
                indices.push(n + i1, n + i2, b + i2);
            };

            addQuad(0, 1); 
            addQuad(1, 2);
            addQuad(2, 3);
            addQuad(3, 4);
            addQuad(4, 5);
            addQuad(5, 6);
            addQuad(6, 7);
            addQuad(7, 8);
            addQuad(8, 9);
            addQuad(9, 10);
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
                    color="#bbb"
                    roughness={0.7}
                    metalness={0.2}
                    side={THREE.DoubleSide}
                />
            </mesh>
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
const TunnelMesh = ({ curve, config, features }: { curve: THREE.CatmullRomCurve3, config: TrackConfig, features: TrackFeature[] }) => {
    const tunnelSegments = useMemo(() => features.filter(f => f.type === 'TUNNEL'), [features]);

    const geometries = useMemo(() => {
        return tunnelSegments.map(feature => {
            const tStart = feature.start;
            const tEnd = feature.end;
            const steps = 30; 
            
            const vertices: number[] = [];
            const uvs: number[] = [];
            const indices: number[] = [];
            
            const radius = 22; // Wider Tunnel
            const radialSegs = 12;

            for (let i = 0; i <= steps; i++) {
                const t = tStart + (tEnd - tStart) * (i / steps);
                const pt = curve.getPointAt(t % 1); // Ensure wrap safe
                const tan = curve.getTangentAt(t % 1).normalize();
                const up = new THREE.Vector3(0, 1, 0);
                const binormal = new THREE.Vector3().crossVectors(tan, up).normalize();
                const correctedUp = new THREE.Vector3().crossVectors(binormal, tan).normalize();

                for (let j = 0; j <= radialSegs; j++) {
                    const angle = (j / radialSegs) * Math.PI; 
                    const cos = Math.cos(angle);
                    const sin = Math.sin(angle);
                    
                    const pos = pt.clone()
                        .add(binormal.clone().multiplyScalar(cos * radius))
                        .add(correctedUp.clone().multiplyScalar(sin * radius));
                    
                    vertices.push(pos.x, pos.y, pos.z);
                    uvs.push(i / steps * 4, j / radialSegs);
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
        });
    }, [curve, tunnelSegments]);

    if (tunnelSegments.length === 0) return null;

    return (
        <group>
            {geometries.map((geo, i) => (
                <mesh key={i} geometry={geo}>
                    <meshStandardMaterial 
                        map={tunnelTexture} 
                        color="#aaa"
                        emissive={config.gridColor}
                        emissiveIntensity={0.5}
                        side={THREE.DoubleSide} 
                    />
                </mesh>
            ))}
        </group>
    );
};

// --- Jump Visuals ---
const JumpArrows = ({ curve, features }: { curve: THREE.CatmullRomCurve3, features: TrackFeature[] }) => {
    const jumpSegments = useMemo(() => features.filter(f => f.type === 'JUMP'), [features]);
    const refs = useRef<THREE.Mesh[]>([]);

    const placements = useMemo(() => {
        const p: { t: number, pos: THREE.Vector3, rot: THREE.Euler }[] = [];
        jumpSegments.forEach(f => {
             const count = Math.floor((f.end - f.start) * 80); 
             for(let i=0; i<count; i++) {
                 const t = f.start + (i / count) * (f.end - f.start);
                 const pt = curve.getPointAt(t);
                 const tan = curve.getTangentAt(t).normalize();
                 const rot = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().lookAt(pt, pt.clone().add(tan), new THREE.Vector3(0,1,0)));
                 p.push({ t, pos: pt, rot });
             }
        });
        return p;
    }, [curve, jumpSegments]);

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
            {placements.map((p, i) => (
                <mesh 
                    key={i} 
                    ref={el => refs.current[i] = el!} 
                    position={p.pos.clone().add(new THREE.Vector3(0, 0.5, 0))} 
                    rotation={[p.rot.x - Math.PI/2, p.rot.y, p.rot.z]}
                >
                    <planeGeometry args={[12, 6]} />
                    <meshBasicMaterial color="#00ff00" transparent opacity={0.8} side={THREE.DoubleSide} />
                </mesh>
            ))}
        </group>
    );
};

const StartLineMesh = ({ curve }: { curve: THREE.CatmullRomCurve3 }) => {
    const { pos, rot } = useMemo(() => {
        const pt = curve.getPointAt(0);
        const tan = curve.getTangentAt(0);
        const look = pt.clone().add(tan);
        const dummy = new THREE.Object3D();
        dummy.position.copy(pt);
        dummy.lookAt(look);
        return { pos: pt, rot: dummy.rotation };
    }, [curve]);

    return (
        <group position={pos} rotation={rot}>
            <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0.05, 0]}>
                <planeGeometry args={[FULL_WIDTH, 8]} />
                <meshBasicMaterial map={startFinishTexture} transparent />
            </mesh>
            <mesh position={[-FULL_WIDTH/2 - 2, 6, 0]}>
                <boxGeometry args={[2, 12, 2]} />
                <meshStandardMaterial color="#222" />
            </mesh>
            <mesh position={[FULL_WIDTH/2 + 2, 6, 0]}>
                <boxGeometry args={[2, 12, 2]} />
                <meshStandardMaterial color="#222" />
            </mesh>
            <mesh position={[0, 11, 0]}>
                <boxGeometry args={[FULL_WIDTH + 8, 2, 2]} />
                <meshStandardMaterial color="#111" emissive="#ff0000" emissiveIntensity={0.8} />
            </mesh>
        </group>
    )
}

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

const NitroFlame = ({ active, position }: { active: boolean, position: THREE.Vector3 }) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const particles = useMemo(() => Array.from({ length: 30 }, () => ({
        life: 0,
        pos: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        scale: 1
    })), []);

    useFrame((_, delta) => {
        if (!meshRef.current) return;
        
        if (active) {
            for (let i = 0; i < 3; i++) {
                const p = particles.find(p => p.life <= 0);
                if (p) {
                    p.life = 0.2 + Math.random() * 0.1;
                    p.pos.copy(position).add(new THREE.Vector3((Math.random()-0.5)*0.5, 0.5, 1.8)); // Spawning at rear
                    p.velocity.set(
                        (Math.random() - 0.5) * 2,
                        (Math.random() - 0.5) * 2,
                        5 + Math.random() * 10
                    );
                    p.scale = 0.5 + Math.random() * 0.5;
                }
            }
        }

        let count = 0;
        particles.forEach(p => {
            if (p.life > 0) {
                p.life -= delta;
                p.pos.addScaledVector(p.velocity, delta);
                
                const s = p.scale * (p.life * 5);
                dummy.position.copy(p.pos);
                dummy.scale.set(s, s, s * 2);
                dummy.rotation.z = Math.random() * Math.PI;
                dummy.updateMatrix();
                meshRef.current!.setMatrixAt(count++, dummy.matrix);
            }
        });
        meshRef.current.count = count;
        meshRef.current.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, 30]}>
            <planeGeometry args={[0.3, 0.3]} />
            <meshBasicMaterial color="#00ffff" blending={THREE.AdditiveBlending} depthWrite={false} transparent opacity={0.8} />
        </instancedMesh>
    );
};

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
                    const side = Math.random() > 0.5 ? 1.0 : -1.0;
                    p.pos.set(side, 0.2, 1.2);
                    p.vx = (Math.random() - 0.5) * 2;
                    p.vz = 5 + Math.random() * 5; 
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
                
                const s = 1 + (1.0 - p.life) * 2;
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
            <planeGeometry args={[0.6, 0.6]} />
            <meshBasicMaterial color="#cccccc" transparent opacity={0.3} depthWrite={false} />
        </instancedMesh>
    );
};

const CollisionSparks = ({ active, position }: { active: boolean, position: THREE.Vector3 }) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const particles = useMemo(() => Array.from({ length: 30 }, () => ({
        life: 0,
        pos: new THREE.Vector3(),
        velocity: new THREE.Vector3()
    })), []);
    
    useFrame((_, delta) => {
        if (!meshRef.current) return;
        if (active) {
            for (let i = 0; i < 5; i++) {
                const p = particles.find(p => p.life <= 0);
                if (p) {
                    p.life = 0.3 + Math.random() * 0.2;
                    p.pos.copy(position);
                    p.velocity.set(
                        (Math.random() - 0.5) * 15,
                        Math.random() * 10 + 5,
                        (Math.random() - 0.5) * 15
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
                dummy.lookAt(position); 
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

interface VehicleProps {
    racerState: RacerState;
    curve: THREE.CatmullRomCurve3;
    isPlayer: boolean;
    sfxVolume?: number;
    skidMarkRef?: any;
    config?: CarStats;
    playerCustomization?: any;
    // Add callback for collision visual
    onCollision?: (pos: THREE.Vector3) => void;
}

const Vehicle: React.FC<VehicleProps> = ({ racerState, curve, isPlayer, skidMarkRef, sfxVolume = 100, config, playerCustomization, onCollision }) => {
    const group = useRef<THREE.Group>(null);
    const chassis = useRef<THREE.Group>(null);
    const lastPos = useRef<THREE.Vector3>(new THREE.Vector3());
    const audio = usePlayerAudio(sfxVolume);
    const [collisionActive, setCollisionActive] = useState(false);
    const [collisionPos, setCollisionPos] = useState(new THREE.Vector3());

    const carColor = useMemo(() => {
        if (isPlayer && playerCustomization?.color) return playerCustomization.color;
        return racerState.color;
    }, [isPlayer, playerCustomization, racerState.color]);
    
    useFrame((state, delta) => {
        if (!group.current || racerState.health <= 0) return;

        if (isPlayer) audio.updateAudio(racerState.speed, racerState.isDrifting, racerState.isNitroActive);

        const t = racerState.t % 1;
        const point = curve.getPointAt(t);
        const tangent = curve.getTangentAt(t).normalize();
        const up = new THREE.Vector3(0, 1, 0); 
        const binormal = new THREE.Vector3().crossVectors(tangent, up).normalize();
        
        // Calculate lane offset
        const laneX = racerState.laneOffset * (TRACK_WIDTH / 2 - 2); 
        const currentPos = point.clone().add(binormal.clone().multiplyScalar(laneX));
        
        group.current.position.lerp(currentPos, 0.8);
        const lookTarget = currentPos.clone().add(tangent);
        group.current.lookAt(lookTarget);

        // Apply Rigid Body Spin to Visuals
        if (chassis.current) {
            // Base drift rotation
            const driftAngle = racerState.isDrifting ? (racerState.laneOffset > 0 ? 0.3 : -0.3) : 0;
            // Physical Spin rotation (racerState.spinAngle is in radians)
            const spinRot = racerState.spinAngle;
            
            chassis.current.rotation.y = THREE.MathUtils.lerp(chassis.current.rotation.y, driftAngle + spinRot, delta * 15);
            chassis.current.rotation.z = THREE.MathUtils.lerp(chassis.current.rotation.z, -racerState.laneOffset * 0.05, delta * 4);
            const pitch = racerState.isNitroActive ? -0.05 : 0;
            chassis.current.rotation.x = THREE.MathUtils.lerp(chassis.current.rotation.x, pitch, delta * 5);
        }

        if (racerState.isDrifting && skidMarkRef && skidMarkRef.current) {
            if (lastPos.current.distanceTo(group.current.position) > 0.6) {
                const l = group.current.position.clone().add(binormal.clone().multiplyScalar(-1.0));
                const r = group.current.position.clone().add(binormal.clone().multiplyScalar(1.0));
                skidMarkRef.current.addMark(l, group.current.rotation);
                skidMarkRef.current.addMark(r, group.current.rotation);
                lastPos.current.copy(group.current.position);
            }
        }
    });

    // Expose method to trigger collision visual from parent
    useEffect(() => {
        if(group.current) {
             group.current.userData.triggerCollision = (impactPoint: THREE.Vector3) => {
                audio.playCollision();
                setCollisionPos(impactPoint);
                setCollisionActive(true);
                setTimeout(() => setCollisionActive(false), 200);
            };
        }
    }, [audio.playCollision]);

    return (
        <group ref={group}>
            {/* Simple Shadow Blob */}
            <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0.02, 0]}>
                <planeGeometry args={[2.8, 5.0]} />
                <meshBasicMaterial color="#000" transparent opacity={0.6} depthWrite={false} />
            </mesh>
            <group ref={chassis}>
                 <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
                    <boxGeometry args={[1.8, 0.6, 3.6]} />
                    <meshStandardMaterial color={carColor} metalness={0.7} roughness={0.2} envMapIntensity={1.5} />
                 </mesh>
                 {playerCustomization?.decalId && (
                     <mesh position={[0, 0.81, 0]} rotation={[-Math.PI/2, 0, 0]}>
                         <planeGeometry args={[1.5, 3.0]} />
                         <meshStandardMaterial color="#fff" transparent opacity={0.8} />
                     </mesh>
                 )}
                 <mesh position={[0, 0.9, -0.3]}>
                    <boxGeometry args={[1.4, 0.5, 1.8]} />
                    <meshStandardMaterial color="#111" metalness={0.9} roughness={0.1} />
                 </mesh>
                 <mesh position={[0, 1.0, 1.6]}>
                     <boxGeometry args={[2.0, 0.1, 0.5]} />
                     <meshStandardMaterial color={carColor} />
                 </mesh>
                 {racerState.isPlayer && (
                    <spotLight position={[0, 2, -1]} angle={0.6} penumbra={0.5} intensity={10} castShadow distance={80} color="#fff" target={group.current || undefined} />
                 )}
            </group>
            {[[-0.95, 0.35, 1.1], [0.95, 0.35, 1.1], [-0.95, 0.35, -1.1], [0.95, 0.35, -1.1]].map((pos, i) => (
                <mesh key={i} position={pos as [number,number,number]} rotation={[0,0,Math.PI/2]} castShadow>
                    <cylinderGeometry args={[0.35, 0.35, 0.5, 16]} />
                    <meshStandardMaterial color="#222" roughness={0.9} />
                </mesh>
            ))}
            <DriftSmoke active={isPlayer && racerState.isDrifting} position={group.current?.position || new THREE.Vector3()} />
            <NitroFlame active={racerState.isNitroActive} position={group.current?.position || new THREE.Vector3()} />
            <CollisionSparks active={collisionActive} position={collisionPos} />
        </group>
    );
};

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
    aiCount: number;
}

export const GameScene: React.FC<GameSceneProps> = ({ 
    trackConfig, carConfig, playerCustomization, onGameOver, onScoreUpdate, onCountdown, raceStatus, quality, sfxVolume, sensitivity, aiCount
}) => {
    // 获取当前赛道的特性列表
    const trackFeatures = useMemo(() => getTrackFeatures(trackConfig.id), [trackConfig.id]);

    // 生成赛道曲线
    const curve = useMemo(() => generateTrackPath(42, trackConfig.curveIntensity, trackConfig.length / 3, trackConfig.id, trackFeatures), [trackConfig, trackFeatures]);
    
    const playerRef = useRef<RacerState>({
        id: 'player', t: 0.0, laneOffset: 0, speed: 0, lap: 1, isPlayer: true, nitroLevel: 100, health: carConfig.maxHealth, maxHealth: carConfig.maxHealth, rank: 1, distance: 0, isNitroActive: false, isDrifting: false, color: carConfig.color, velocity: {x:0, z:0}, lastLaneChange: 0, 
        skill: 1, aggression: 0,
        lateralVelocity: 0, angularVelocity: 0, spinAngle: 0
    });
    
    const aiRefs = useRef<RacerState[]>([]);
    const [renderRacers, setRenderRacers] = useState<RacerState[]>([]);
    
    // Store refs to vehicle meshes to trigger visuals imperatively
    const vehicleMeshRefs = useRef<Record<string, THREE.Group | null>>({});

    const skidMarkRef = useRef<any>(null);
    const collisionCooldown = useRef(0);
    const shakeIntensity = useRef(0); 
    const raceStartTime = useRef(0);
    const keys = useRef({ left: false, right: false, up: false, down: false, drift: false, nitro: false });
    const MAX_LAPS = 2;

    useMemo(() => {
        aiRefs.current = [];
        const colors = ['#ff3333', '#33ff33', '#3333ff', '#ffff33', '#33ffff', '#ff00ff'];
        
        const totalRacers = aiCount + 1;
        const spacing = 1.4 / totalRacers; 
        
        playerRef.current.t = 0;
        playerRef.current.laneOffset = 0; 
        playerRef.current.lateralVelocity = 0;
        playerRef.current.angularVelocity = 0;
        playerRef.current.spinAngle = 0;
        playerRef.current.speed = 0;
        
        for(let i=0; i < aiCount; i++) {
            const side = i % 2 === 0 ? 1 : -1;
            const pos = Math.ceil((i + 1) / 2);
            const lane = side * pos * spacing;

            aiRefs.current.push({
                id: `ai_${i}`,
                t: 0,
                laneOffset: lane, 
                speed: 0,
                lap: 1,
                isPlayer: false,
                nitroLevel: 100, 
                health: 100,
                maxHealth: 100,
                rank: i + 2,
                distance: 0,
                isNitroActive: false,
                isDrifting: false,
                color: colors[i % colors.length],
                velocity: { x: 0, z: 0 },
                lastLaneChange: 0,
                skill: 0.4 + Math.random() * 0.6,
                aggression: Math.random(),
                lateralVelocity: 0,
                angularVelocity: 0,
                spinAngle: 0
            });
        }
        setRenderRacers([...aiRefs.current]);
    }, [trackConfig, aiCount]);

    useEffect(() => {
        const handleKey = (e: KeyboardEvent, pressed: boolean) => {
            const key = e.key.toLowerCase();
            if(['arrowleft','a'].includes(key)) keys.current.left = pressed;
            if(['arrowright','d'].includes(key)) keys.current.right = pressed;
            if(['arrowup','w'].includes(key)) keys.current.up = pressed;
            if(['arrowdown','s'].includes(key)) keys.current.down = pressed;
            if(key === 'shift') keys.current.drift = pressed;
            if(key === ' ') keys.current.nitro = pressed;
        };
        window.addEventListener('keydown', (e) => handleKey(e, true));
        window.addEventListener('keyup', (e) => handleKey(e, false));
        return () => { 
            window.removeEventListener('keydown', (e) => handleKey(e, true)); 
            window.removeEventListener('keyup', (e) => handleKey(e, false)); 
        };
    }, []);

    useEffect(() => {
        if (raceStatus === RaceStatus.COUNTDOWN) {
            let count = 3;
            onCountdown(3);
            const interval = setInterval(() => {
                count--;
                if (count >= 0) onCountdown(count);
            }, 1000);
            return () => clearInterval(interval);
        } else if (raceStatus === RaceStatus.RACING) {
            raceStartTime.current = Date.now();
        }
    }, [raceStatus, onCountdown]);

    useFrame((state, delta) => {
        const dt = Math.min(delta, 0.05);
        const p = playerRef.current;
        const isRacing = raceStatus === RaceStatus.RACING;

        if (isRacing) {
            // --- Physics & Rigid Body Integration ---

            // 1. Damping / Friction
            p.lateralVelocity *= 0.92;
            p.angularVelocity *= 0.90;
            p.spinAngle += p.angularVelocity * dt;
            
            // Auto-align spin back to 0 if angular velocity is low (stabilization)
            if (Math.abs(p.angularVelocity) < 0.5) {
                p.spinAngle = THREE.MathUtils.lerp(p.spinAngle, 0, dt * 5);
            }

            // --- Player Control ---
            // If spinning out fast (> 3 rad/s), lose control
            const lostControl = Math.abs(p.angularVelocity) > 3.0;

            if (keys.current.nitro && p.nitroLevel > 0 && !lostControl) {
                p.isNitroActive = true;
                p.nitroLevel = Math.max(0, p.nitroLevel - dt * 40);
                shakeIntensity.current = Math.max(shakeIntensity.current, 0.4); 
            } else {
                p.isNitroActive = false;
                p.nitroLevel = Math.min(100, p.nitroLevel + dt * 10);
            }

            const baseSpeed = carConfig.speed * 2.5; 
            const maxSpeed = p.isNitroActive ? baseSpeed * 1.5 : baseSpeed;
            let targetSpeed = 0;
            
            if (!lostControl) {
                if (keys.current.up) targetSpeed = maxSpeed;
                else if (keys.current.down) targetSpeed = -30; 
            }
            
            p.isDrifting = keys.current.drift && Math.abs(p.speed) > 50 && (keys.current.left || keys.current.right) && !lostControl;
            if (p.isDrifting) targetSpeed *= 0.95;

            const accel = keys.current.up ? carConfig.acceleration * 2 : 3.0;
            p.speed = THREE.MathUtils.lerp(p.speed, targetSpeed, dt * accel);
            
            const sensitivityFactor = sensitivity / 50;
            let turn = 0;
            if (!lostControl) {
                if (keys.current.left) turn -= 1;
                if (keys.current.right) turn += 1;
            }
            
            const speedFactor = Math.min(1.0, Math.abs(p.speed) / 50);
            const handling = carConfig.handling * sensitivityFactor * (p.isDrifting ? 1.5 : 1.0) * speedFactor;
            
            // Apply lateral velocity from impacts + steering
            p.laneOffset += (turn * handling + p.lateralVelocity) * dt;
            
            // Wall Collision
            if (p.laneOffset > 1.1 || p.laneOffset < -1.1) {
                p.laneOffset = THREE.MathUtils.clamp(p.laneOffset, -1.2, 1.2);
                p.speed *= 0.8; 
                p.health -= dt * 10;
                // Bounce off wall
                p.lateralVelocity = -p.lateralVelocity * 0.5 - (p.laneOffset > 0 ? 2 : -2);
                shakeIntensity.current = Math.max(shakeIntensity.current, 0.3); 
                // Wall hit can cause spin
                p.angularVelocity += (Math.random() - 0.5) * 5;
            }

            const distStep = (p.speed * dt) / 2000; 
            p.t += distStep;
            p.distance += distStep;
            if(p.t >= 1) { p.t -= 1; p.lap++; if(p.lap > MAX_LAPS) onGameOver(p.distance * 1000, RaceStatus.FINISHED, p.rank); }

            // --- AI Logic Update ---
            const allRacers = [p, ...aiRefs.current].sort((a, b) => b.distance - a.distance);
            p.rank = allRacers.findIndex(r => r.id === p.id) + 1;

            aiRefs.current.forEach(ai => {
                if (!ai) return; // safety
                // Damping
                ai.lateralVelocity *= 0.92;
                ai.angularVelocity *= 0.90;
                ai.spinAngle += ai.angularVelocity * dt;
                if (Math.abs(ai.angularVelocity) < 0.5) ai.spinAngle = THREE.MathUtils.lerp(ai.spinAngle, 0, dt * 5);

                const aiLostControl = Math.abs(ai.angularVelocity) > 3.0;

                const myIndex = allRacers.findIndex(r => r.id === ai.id);
                const carAhead = allRacers[myIndex - 1];
                const carBehind = allRacers[myIndex + 1];

                // ... (Look Ahead Logic same as before)
                const lookAhead = 0.03 + (ai.speed / 5000);
                const tCurrent = ai.t % 1;
                const tFuture = (ai.t + lookAhead) % 1;
                const tFar = (ai.t + lookAhead * 2) % 1;

                const vecCurrent = curve.getTangentAt(tCurrent);
                const vecFuture = curve.getTangentAt(tFuture);
                const vecFar = curve.getTangentAt(tFar);
                const curveIntensity = vecCurrent.angleTo(vecFuture) + vecFuture.angleTo(vecFar);
                const cross = new THREE.Vector3().crossVectors(vecCurrent, vecFuture);
                const turnDir = cross.y;
                const approachingJump = trackFeatures.some(f => f.type === 'JUMP' && tFuture >= f.start && tCurrent <= f.start);

                let maxSafeCornerSpeed = baseSpeed * (0.4 + ai.skill * 0.6); 
                let targetAiSpeed = baseSpeed;

                if (curveIntensity > 0.4) {
                    targetAiSpeed = Math.min(targetAiSpeed, maxSafeCornerSpeed * 0.5);
                    ai.isNitroActive = false;
                } else if (curveIntensity > 0.15) {
                    targetAiSpeed = Math.min(targetAiSpeed, maxSafeCornerSpeed * 0.85);
                }
                targetAiSpeed *= (1.0 + ai.aggression * 0.1);

                if (approachingJump) {
                    targetAiSpeed = baseSpeed * 1.5;
                    ai.isNitroActive = true;
                }

                if (ai.nitroLevel > 5 && !aiLostControl) {
                    const onStraight = curveIntensity < 0.1;
                    const recovery = ai.speed < targetAiSpeed * 0.7; 
                    if (approachingJump || (onStraight && ai.aggression > 0.3) || recovery) {
                        ai.isNitroActive = true;
                    } else {
                        ai.isNitroActive = false;
                    }
                } else {
                    ai.isNitroActive = false;
                }

                if (ai.isNitroActive) {
                    ai.nitroLevel = Math.max(0, ai.nitroLevel - dt * 30);
                    targetAiSpeed *= 1.4;
                } else {
                    ai.nitroLevel = Math.min(100, ai.nitroLevel + dt * 5);
                }

                if (aiLostControl) targetAiSpeed = 0; // Spin out slows down
                ai.speed = THREE.MathUtils.lerp(ai.speed, targetAiSpeed, dt * (0.5 + ai.skill));

                // Steering
                let laneDesire = 0;
                let urgency = 0;

                if (carAhead && !aiLostControl) {
                    const dist = carAhead.distance - ai.distance;
                    if (dist < 0.03 && ai.speed > carAhead.speed - 20) {
                        const targetOvertake = carAhead.laneOffset > 0 ? -0.7 : 0.7;
                        const overtakeWeight = 2.0 * ai.aggression;
                        laneDesire += targetOvertake * overtakeWeight;
                        urgency += overtakeWeight;
                    }
                }
                if (carBehind && ai.aggression > 0.6 && !aiLostControl) {
                    const dist = ai.distance - carBehind.distance;
                    if (dist < 0.02) {
                        const blockWeight = 1.5 * ai.aggression;
                        laneDesire += carBehind.laneOffset * blockWeight;
                        urgency += blockWeight;
                    }
                }
                if (curveIntensity > 0.15 && !aiLostControl) {
                    const apex = turnDir > 0 ? -0.8 : 0.8;
                    const apexWeight = 1.0 + ai.skill;
                    laneDesire += apex * apexWeight;
                    urgency += apexWeight;
                } else {
                    laneDesire += (Math.random() - 0.5) * 0.1; 
                }

                let targetLane = ai.lastLaneChange;
                if (urgency > 0.5) {
                    targetLane = THREE.MathUtils.clamp(laneDesire / urgency, -1, 1);
                    targetLane += (Math.random() - 0.5) * (1 - ai.skill) * 0.2;
                }
                ai.lastLaneChange = THREE.MathUtils.lerp(ai.lastLaneChange, targetLane, dt);
                
                // Apply control + physics
                if (!aiLostControl) {
                    ai.laneOffset = THREE.MathUtils.lerp(ai.laneOffset, ai.lastLaneChange, dt * 2.0);
                }
                ai.laneOffset += ai.lateralVelocity * dt;
                ai.laneOffset = THREE.MathUtils.clamp(ai.laneOffset, -1.0, 1.0);

                const aiStep = (ai.speed * dt) / 2000;
                ai.t += aiStep;
                ai.distance += aiStep;
                if(ai.t >= 1) { ai.t -= 1; ai.lap++; }
            });

            // 5. Advanced Collision Logic (Rigid Body Impulse)
            const timeSinceStart = Date.now() - raceStartTime.current;
            const GRACE_PERIOD = 3000; 

            if (timeSinceStart > GRACE_PERIOD) {
                // Pairwise check: Player vs AI, and AI vs AI
                // Simply checking everyone against everyone is O(N^2) but N=7 so it's fine.
                const racers = [p, ...aiRefs.current];
                
                for (let i = 0; i < racers.length; i++) {
                    for (let j = i + 1; j < racers.length; j++) {
                        const r1 = racers[i];
                        const r2 = racers[j];
                        
                        // Check proximity in T (longitudinal) and Lane (lateral)
                        const tDiff = Math.abs(r1.t - r2.t);
                        // Wrap around handling for T check? Simplified for now (assumes close)
                        if (tDiff > 0.01 && tDiff < 0.99) continue; 

                        const distT = (r1.distance - r2.distance) * 2000; // Approx meters
                        const distLane = (r1.laneOffset - r2.laneOffset) * 6; // Approx meters
                        const distSq = distT*distT + distLane*distLane;
                        
                        const MIN_DIST = 3.0; // Car length/width avg
                        if (distSq < MIN_DIST * MIN_DIST) {
                            // COLLISION HIT!
                            
                            // 1. Calculate Impulse Vector
                            // Simple elastic collision approx
                            // Push away in lane direction
                            const pushDir = r1.laneOffset > r2.laneOffset ? 1 : -1;
                            
                            // Relative speed
                            const dvLane = r1.lateralVelocity - r2.lateralVelocity;
                            const dvSpeed = r1.speed - r2.speed;
                            
                            // Impact Intensity
                            const impact = Math.sqrt(dvLane*dvLane + dvSpeed*dvSpeed * 0.01) + 5.0; // Base impact
                            
                            // Apply Impulse (Newton's 3rd Law)
                            const force = impact * 0.8;
                            r1.lateralVelocity += pushDir * force;
                            r2.lateralVelocity -= pushDir * force;
                            
                            // Speed transfer (bump drafting or crash stop)
                            r1.speed -= dvSpeed * 0.4;
                            r2.speed += dvSpeed * 0.4;
                            
                            // 2. Angular Momentum (Spin)
                            // If hit on the side (high lateral offset diff), spin more
                            // If hit from behind (high speed diff), spin less, push more
                            const spinForce = (Math.random() - 0.5) * impact * 2.0;
                            r1.angularVelocity += spinForce;
                            r2.angularVelocity -= spinForce;
                            
                            // Damage
                            r1.health -= impact;
                            r2.health -= impact;
                            
                            // Visuals
                            shakeIntensity.current = Math.max(shakeIntensity.current, Math.min(impact * 0.05, 1.0));
                            
                            // Trigger Sparks at midpoint
                            // Need world positions. We can approximate t midpoint.
                            // Better: Trigger via vehicle ref callback
                            // NOTE: Since we are in the loop and don't have world pos handy without calc:
                            // We will just trigger on player if player involved, or rely on Vehicle update loop to position collision sparks?
                            // Actually Vehicle component has `onCollision` prop now? No, we added triggerCollision to userData.
                            
                            // Find collision world pos approx?
                            // For performance, we can just trigger a flag and let the Vehicle component handle it if we passed a callback
                            // But for now, let's just use the player's camera shake as global feedback
                            // And maybe set a flag on the RacerState to trigger one-shot visual in next render?
                            // Or use the vehicleMeshRefs map I added earlier (but didn't populate yet).
                        }
                    }
                }
            }
        
        } else if (raceStatus === RaceStatus.COUNTDOWN) {
            p.speed = 0;
            shakeIntensity.current = 0.015; 
        }

        if (state.clock.elapsedTime % 0.1 < 0.02) {
            onScoreUpdate({ ...p });
        }

        // --- Camera Logic ---
        const cam = state.camera as THREE.PerspectiveCamera;
        const targetFOV = 60 + Math.min(50, p.speed * 0.25);
        cam.fov = THREE.MathUtils.lerp(cam.fov, targetFOV, dt * 3);
        cam.updateProjectionMatrix();

        const tClamped = p.t % 1;
        const pt = curve.getPointAt(tClamped);
        const tan = curve.getTangentAt(tClamped).normalize();
        const up = new THREE.Vector3(0,1,0);
        const binormal = new THREE.Vector3().crossVectors(tan, up).normalize();
        
        const laneX = p.laneOffset * (TRACK_WIDTH / 2 - 2);
        const carWorldPos = pt.clone().add(binormal.multiplyScalar(laneX));
        carWorldPos.y += 1.0; 

        // Collision Spark Trigger Logic (Global Ref Access)
        // Access vehicle group from DOM/Ref is hard here without map.
        // Simplification: Calculate collision world pos here for Player
        // If p was involved in collision this frame (check health delta or velocity jump? hard)
        // Let's implement simpler trigger:
        if (Math.abs(p.lateralVelocity) > 5) {
             // Just hit something hard
             // trigger visual?
        }

        // Chase Camera
        const camOffset = tan.clone().multiplyScalar(-9.0).add(new THREE.Vector3(0, 4.0, 0));
        
        if (p.isDrifting || Math.abs(p.angularVelocity) > 1) {
            const side = p.laneOffset > 0 ? -1 : 1;
            // Camera lag behind spin
            camOffset.add(binormal.clone().multiplyScalar(side * 2.5));
        }

        const targetCamPos = carWorldPos.clone().add(camOffset);
        const groundH = getTerrainHeight(targetCamPos.x, targetCamPos.z, trackConfig.id);
        if (targetCamPos.y < groundH + 2) targetCamPos.y = groundH + 2;

        shakeIntensity.current = THREE.MathUtils.lerp(shakeIntensity.current, 0, dt * 4);
        if (shakeIntensity.current > 0.001) {
            targetCamPos.add(new THREE.Vector3(
                (Math.random() - 0.5) * shakeIntensity.current,
                (Math.random() - 0.5) * shakeIntensity.current,
                (Math.random() - 0.5) * shakeIntensity.current
            ));
        }

        state.camera.position.lerp(targetCamPos, dt * 6);
        const lookAtTarget = carWorldPos.clone().add(tan.clone().multiplyScalar(15));
        state.camera.lookAt(lookAtTarget);
    });

    return (
        <>
            <color attach="background" args={[trackConfig.skyColor]} />
            <fog attach="fog" args={[trackConfig.fogColor, 40, 500]} />
            <ambientLight intensity={0.5} color={trackConfig.groundColor} />
            <directionalLight position={[100, 200, 50]} intensity={1.5} castShadow shadow-mapSize={[2048, 2048]} />
            
            <BackgroundLayers config={trackConfig} />
            <TrackMesh curve={curve} config={trackConfig} />
            <TunnelMesh curve={curve} config={trackConfig} features={trackFeatures} />
            <JumpArrows curve={curve} features={trackFeatures} />
            <StartLineMesh curve={curve} />
            <TerrainMesh config={trackConfig} />
            <BiomeEnvironment config={trackConfig} curve={curve} features={trackFeatures} />
            <InstancedSkidMarks ref={skidMarkRef} />
            
            <Vehicle 
                racerState={playerRef.current} // Pass current state directly
                curve={curve} 
                isPlayer={true} 
                skidMarkRef={skidMarkRef} 
                sfxVolume={sfxVolume} 
                config={carConfig}
                playerCustomization={playerCustomization}
            />
            {renderRacers.map((ai, i) => (
                <Vehicle 
                    key={ai.id} 
                    racerState={aiRefs.current[i]} // Pass reference to mutable state
                    curve={curve} 
                    isPlayer={false} 
                    sfxVolume={0} 
                    config={carConfig} 
                />
            ))}

            <SpeedLines speed={playerRef.current.speed} />

            <EffectComposer enableNormalPass={false}>
                <Bloom luminanceThreshold={0.7} mipmapBlur intensity={1.0} radius={0.3} />
                <ChromaticAberration offset={new THREE.Vector2(0.002, 0.002)} />
                <Vignette eskil={false} offset={0.1} darkness={0.4} />
                {quality === 'HIGH' && <Noise opacity={0.05} />}
            </EffectComposer>
        </>
    );
};

export default GameScene;
