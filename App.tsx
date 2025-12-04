
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { GameState, BiomeType, PlayerState, SettingsState, RaceStatus, RacerState, CustomizationConfig, DecalType, RimType } from './types';
import { CARS, TRACKS, PRIZES, DECALS, RIMS } from './constants';
import GameScene from './components/GameCanvas';
import { getTacticalBriefing } from './services/geminiService';

// 图标组件
const CoinIcon = () => (
    <svg className="w-5 h-5 text-yellow-400 inline-block mr-1" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 100-2 1 1 0 000 2zm7-1a1 1 0 11-2 0 1 1 0 012 0zm-.464 5.535a1 1 0 10-1.415-1.414 3 3 0 01-4.242 0 1 1 0 00-1.415 1.414 5 5 0 007.072 0z" clipRule="evenodd" />
    </svg>
);

const SettingsIcon = () => (
    <svg className="w-6 h-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
);

// Radial Speedometer Component
const SpeedGauge = ({ speed, maxSpeed = 240 }: { speed: number, maxSpeed?: number }) => {
    const radius = 60;
    const stroke = 8;
    const normalizedSpeed = Math.min(Math.abs(speed), maxSpeed);
    const progress = normalizedSpeed / maxSpeed;
    
    // Arc calculation (240 degrees total, -120 to 120)
    const startAngle = -120;
    const endAngle = 120;
    const currentAngle = startAngle + (endAngle - startAngle) * progress;

    const describeArc = (x: number, y: number, r: number, start: number, end: number) => {
        const startRad = (start - 90) * Math.PI / 180;
        const endRad = (end - 90) * Math.PI / 180;
        const largeArc = end - start <= 180 ? "0" : "1";
        const d = [
            "M", x + r * Math.cos(startRad), y + r * Math.sin(startRad),
            "A", r, r, 0, largeArc, 1, x + r * Math.cos(endRad), y + r * Math.sin(endRad)
        ].join(" ");
        return d;
    };

    // Color logic
    let color = '#06b6d4'; // Cyan
    if (progress > 0.6) color = '#a855f7'; // Purple
    if (progress > 0.85) color = '#ef4444'; // Red

    return (
        <div className="relative w-48 h-48 flex items-center justify-center">
            <svg className="w-full h-full transform translate-y-4" viewBox="0 0 140 140">
                {/* Background Arc */}
                <path d={describeArc(70, 70, radius, startAngle, endAngle)} fill="none" stroke="#1f2937" strokeWidth={stroke} strokeLinecap="round" />
                {/* Progress Arc */}
                <path d={describeArc(70, 70, radius, startAngle, currentAngle)} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" className="drop-shadow-[0_0_8px_rgba(6,182,212,0.6)]" />
                
                {/* Ticks */}
                {[0, 0.25, 0.5, 0.75, 1].map((tick, i) => {
                    const angle = startAngle + (endAngle - startAngle) * tick;
                    const rad = (angle - 90) * Math.PI / 180;
                    const r1 = radius - 15;
                    const r2 = radius - 5;
                    const x1 = 70 + r1 * Math.cos(rad);
                    const y1 = 70 + r1 * Math.sin(rad);
                    const x2 = 70 + r2 * Math.cos(rad);
                    const y2 = 70 + r2 * Math.sin(rad);
                    return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#4b5563" strokeWidth="2" />;
                })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center pt-8">
                <span className="text-5xl font-black font-['Orbitron'] text-white drop-shadow-md tracking-tighter">
                    {Math.floor(Math.abs(speed))}
                </span>
                <span className="text-xs text-cyan-500 font-bold tracking-widest mt-0">KM/H</span>
            </div>
        </div>
    );
};

const App = () => {
    const [gameState, setGameState] = useState<GameState>(GameState.MENU);
    const [raceStatus, setRaceStatus] = useState<RaceStatus>(RaceStatus.READY);
    const [selectedTrack, setSelectedTrack] = useState<BiomeType>(BiomeType.DESERT);
    
    // HUD 数据
    const [currentScore, setCurrentScore] = useState(0);
    const [currentSpeed, setCurrentSpeed] = useState(0);
    const [nitroLevel, setNitroLevel] = useState(100);
    const [currentLap, setCurrentLap] = useState(1);
    const [currentHealth, setCurrentHealth] = useState(100);
    const [currentRank, setCurrentRank] = useState(1);
    const [countdownValue, setCountdownValue] = useState(3);
    const [isNitroActive, setIsNitroActive] = useState(false);
    
    // 结算数据
    const [lastScore, setLastScore] = useState(0);
    const [finishRank, setFinishRank] = useState(0);
    const [prizeMoney, setPrizeMoney] = useState(0);

    const [aiBriefing, setAiBriefing] = useState<string>('');
    const [isBriefingLoading, setIsBriefingLoading] = useState(false);
    
    // 玩家数据 & 定制
    const [playerState, setPlayerState] = useState<PlayerState>(() => {
        const saved = localStorage.getItem('neon_race_save_v2'); // New version key
        return saved ? JSON.parse(saved) : {
            coins: 100,
            unlockedCars: ['starter_alpha'],
            selectedCarId: 'starter_alpha',
            highScore: 0,
            carCustomizations: {}
        };
    });

    // 编辑模式状态
    const [editingCarId, setEditingCarId] = useState<string | null>(null);
    const [currentCustomization, setCurrentCustomization] = useState<CustomizationConfig>({ color: '#ffffff', decalId: DecalType.NONE, rimId: RimType.STANDARD });

    const [settings, setSettings] = useState<SettingsState>({
        quality: 'HIGH',
        musicVolume: 50,
        sfxVolume: 80,
        sensitivity: 50,
        aiCount: 5
    });

    const menuBgmRef = useRef<HTMLAudioElement | null>(null);
    const raceBgmRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        menuBgmRef.current = new Audio('/music/menu_theme.mp3');
        menuBgmRef.current.loop = true;
        raceBgmRef.current = new Audio('/music/race_theme.mp3');
        raceBgmRef.current.loop = true;
        return () => {
            menuBgmRef.current?.pause();
            raceBgmRef.current?.pause();
        };
    }, []);

    // 监听 ESC 键实现暂停
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (gameState === GameState.PLAYING) {
                    setGameState(GameState.PAUSED);
                } else if (gameState === GameState.PAUSED) {
                    setGameState(GameState.PLAYING);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [gameState]);

    useEffect(() => {
        if (menuBgmRef.current) menuBgmRef.current.volume = settings.musicVolume / 100;
        if (raceBgmRef.current) raceBgmRef.current.volume = settings.musicVolume / 100;
    }, [settings.musicVolume]);

    useEffect(() => {
        const playAudio = async (audio: HTMLAudioElement | null) => {
            if (!audio) return;
            try {
                audio.currentTime = 0;
                await audio.play();
            } catch (e) { console.warn("Autoplay blocked", e); }
        };
        const stopAudio = (audio: HTMLAudioElement | null) => audio?.pause();

        if (gameState === GameState.PLAYING) {
            stopAudio(menuBgmRef.current);
            playAudio(raceBgmRef.current);
        } else if (gameState === GameState.PAUSED) {
            // 暂停时保持背景音乐，或者可以降低音量
            if (raceBgmRef.current) raceBgmRef.current.volume = (settings.musicVolume / 100) * 0.3;
        } else {
            stopAudio(raceBgmRef.current);
            if (menuBgmRef.current && menuBgmRef.current.paused) playAudio(menuBgmRef.current);
            if (menuBgmRef.current) menuBgmRef.current.volume = settings.musicVolume / 100;
        }
        
        // 恢复音量
        if (gameState === GameState.PLAYING && raceBgmRef.current) {
            raceBgmRef.current.volume = settings.musicVolume / 100;
        }
    }, [gameState, settings.musicVolume]);

    useEffect(() => {
        localStorage.setItem('neon_race_save_v2', JSON.stringify(playerState));
    }, [playerState]);

    const activeCar = CARS.find(c => c.id === playerState.selectedCarId) || CARS[0];
    const activeTrackConfig = TRACKS[selectedTrack];

    const handleStartGame = () => {
        setGameState(GameState.PLAYING);
        setRaceStatus(RaceStatus.COUNTDOWN);
        setCountdownValue(3);
        
        setCurrentScore(0);
        setCurrentLap(1);
        setNitroLevel(100);
        setCurrentHealth(activeCar.maxHealth);
        setCurrentRank(settings.aiCount + 1);

        // 3秒倒计时逻辑由 GameScene 驱动回调
        setTimeout(() => {
            // 只有在没有暂停的情况下才开始
            setRaceStatus(prev => prev === RaceStatus.PAUSED ? prev : RaceStatus.RACING);
        }, 4000); 
    };

    const handleCountdown = (val: number) => {
        setCountdownValue(val);
    };

    const handleGameOver = (score: number, status: RaceStatus, rank: number) => {
        let money = 0;
        if (status === RaceStatus.FINISHED) {
             money = (PRIZES as any)[rank] || PRIZES.others;
        } else {
             money = 10; // 安慰奖
        }

        setLastScore(score);
        setFinishRank(rank);
        setPrizeMoney(money);
        
        setPlayerState(prev => ({
            ...prev,
            coins: prev.coins + money,
            highScore: Math.max(prev.highScore, score)
        }));
        
        setRaceStatus(status);
        setGameState(GameState.GAME_OVER);
    };

    const handleHUDUpdate = (state: RacerState) => {
        setCurrentScore(Math.floor(state.distance * 1000));
        setCurrentSpeed(state.speed); // Keep precise for gauge
        setNitroLevel(state.nitroLevel);
        setIsNitroActive(state.isNitroActive);
        setCurrentHealth(state.health);
        setCurrentRank(state.rank);
        setCurrentLap(state.lap);
    };

    const buyCar = (carId: string, price: number) => {
        if (playerState.coins >= price && !playerState.unlockedCars.includes(carId)) {
            setPlayerState(prev => ({
                ...prev,
                coins: prev.coins - price,
                unlockedCars: [...prev.unlockedCars, carId],
                selectedCarId: carId
            }));
        }
    };

    const selectCar = (carId: string) => {
        if (playerState.unlockedCars.includes(carId)) {
            setPlayerState(prev => ({ ...prev, selectedCarId: carId }));
        }
    };

    // Customization Logic
    const enterCustomization = (carId: string) => {
        const saved = playerState.carCustomizations?.[carId] || { 
            color: CARS.find(c=>c.id===carId)?.color || '#fff', 
            decalId: DecalType.NONE, 
            rimId: RimType.STANDARD 
        };
        setCurrentCustomization(saved);
        setEditingCarId(carId);
    };

    const saveCustomization = () => {
        if (editingCarId) {
            setPlayerState(prev => ({
                ...prev,
                carCustomizations: {
                    ...prev.carCustomizations,
                    [editingCarId]: currentCustomization
                }
            }));
            setEditingCarId(null);
        }
    };

    const fetchBriefing = useCallback(async (biome: BiomeType) => {
        setIsBriefingLoading(true);
        setAiBriefing('');
        const briefing = await getTacticalBriefing(biome, activeCar.name);
        setAiBriefing(briefing);
        setIsBriefingLoading(false);
    }, [activeCar.name]);

    useEffect(() => {
        if (gameState === GameState.TRACK_SELECT) {
             fetchBriefing(selectedTrack);
        }
    }, [gameState, selectedTrack, fetchBriefing]);


    // --- UI Renders ---

    const renderMainMenu = () => (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10 backdrop-blur-sm">
            <h1 className="text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500 mb-8 font-['Orbitron'] tracking-wider drop-shadow-[0_0_15px_rgba(0,255,255,0.5)] text-center">
                NEON HORIZON
            </h1>
            <h2 className="text-2xl text-cyan-200 font-['Noto_Sans_SC'] mb-12 tracking-[0.5em]">霓虹地平线：狂野飙车</h2>
            
            <div className="flex flex-col gap-4 w-72">
                <button onClick={() => setGameState(GameState.TRACK_SELECT)} className="px-6 py-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded shadow-[0_0_20px_rgba(6,182,212,0.6)] transition-all font-['Rajdhani'] text-2xl uppercase tracking-widest clip-path-slant flex justify-center items-center gap-2">
                    开始比赛
                </button>
                <button onClick={() => setGameState(GameState.SHOP)} className="px-6 py-3 border border-purple-500 hover:bg-purple-900/50 text-purple-300 font-bold rounded transition-all font-['Noto_Sans_SC'] text-xl">
                    车库 / 商店
                </button>
                <button onClick={() => setGameState(GameState.SETTINGS)} className="px-6 py-3 border border-gray-600 hover:bg-gray-800 text-gray-400 font-bold rounded transition-all font-['Noto_Sans_SC'] text-lg flex items-center justify-center gap-2">
                    <SettingsIcon /> 设置
                </button>
            </div>
            <div className="mt-8 text-cyan-200/60 font-mono text-sm">
                最高得分: {playerState.highScore}
            </div>
             {/* Controls Guide Table */}
             <div className="mt-8 bg-gray-900/80 p-6 rounded-lg border border-gray-700 max-w-lg w-full">
                <h3 className="text-xl text-cyan-400 font-bold mb-4 font-['Noto_Sans_SC'] text-center border-b border-gray-700 pb-2">操作指南</h3>
                <table className="w-full text-left text-sm text-gray-300">
                    <thead>
                        <tr className="text-gray-500 uppercase text-xs tracking-wider">
                            <th className="pb-2">按键</th>
                            <th className="pb-2 text-right">功能</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800 font-mono">
                        <tr><td className="py-2"><kbd className="bg-gray-800 px-2 py-1 rounded">W</kbd> / <kbd className="bg-gray-800 px-2 py-1 rounded">↑</kbd></td><td className="py-2 text-right">加速 (Accelerate)</td></tr>
                        <tr><td className="py-2"><kbd className="bg-gray-800 px-2 py-1 rounded">S</kbd> / <kbd className="bg-gray-800 px-2 py-1 rounded">↓</kbd></td><td className="py-2 text-right">刹车/倒车 (Brake)</td></tr>
                        <tr><td className="py-2"><kbd className="bg-gray-800 px-2 py-1 rounded">A</kbd> / <kbd className="bg-gray-800 px-2 py-1 rounded">D</kbd></td><td className="py-2 text-right">转向 (Steer)</td></tr>
                        <tr><td className="py-2"><kbd className="bg-gray-800 px-2 py-1 rounded">Shift</kbd> + 转向</td><td className="py-2 text-right text-yellow-400 font-bold">漂移 (Drift)</td></tr>
                        <tr><td className="py-2"><kbd className="bg-gray-800 px-2 py-1 rounded">Space</kbd></td><td className="py-2 text-right text-cyan-400 font-bold">氮气加速 (Nitro)</td></tr>
                        <tr><td className="py-2"><kbd className="bg-gray-800 px-2 py-1 rounded">Esc</kbd></td><td className="py-2 text-right">暂停/退出 (Pause)</td></tr>
                    </tbody>
                </table>
             </div>
        </div>
    );

    const renderPauseMenu = () => (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-50 backdrop-blur-sm">
            <h2 className="text-6xl font-black text-white mb-8 font-['Orbitron'] tracking-widest text-shadow-neon">PAUSED</h2>
            <div className="flex flex-col gap-4 w-72">
                <button 
                    onClick={() => setGameState(GameState.PLAYING)} 
                    className="px-6 py-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded shadow-[0_0_20px_rgba(6,182,212,0.6)] transition-all font-['Rajdhani'] text-2xl uppercase tracking-widest"
                >
                    继续比赛 (RESUME)
                </button>
                <button 
                    onClick={() => {
                        setGameState(GameState.MENU);
                        setRaceStatus(RaceStatus.ABORTED);
                    }} 
                    className="px-6 py-3 border border-red-500 hover:bg-red-900/50 text-red-300 font-bold rounded transition-all font-['Noto_Sans_SC'] text-xl"
                >
                    退出比赛 (EXIT)
                </button>
            </div>
            <div className="mt-8 text-gray-400">按下 <kbd className="bg-gray-700 px-2 py-1 rounded text-white">Esc</kbd> 继续</div>
        </div>
    );

    const renderSettings = () => (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/95 z-20">
             <h2 className="text-4xl font-bold text-white mb-8 font-['Noto_Sans_SC']">系统设置</h2>
             <div className="bg-gray-800 p-8 rounded-lg w-96 border border-gray-700">
                <div className="mb-6">
                    <label className="block text-cyan-400 mb-2 font-bold">画质预设</label>
                    <div className="flex gap-4">
                        <button onClick={() => setSettings(s => ({...s, quality: 'LOW'}))} className={`flex-1 py-2 rounded ${settings.quality === 'LOW' ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-400'}`}>性能</button>
                        <button onClick={() => setSettings(s => ({...s, quality: 'HIGH'}))} className={`flex-1 py-2 rounded ${settings.quality === 'HIGH' ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-400'}`}>画质</button>
                    </div>
                </div>
                <div className="mb-6">
                    <div className="flex justify-between mb-2">
                        <label className="block text-cyan-400 font-bold">AI 车手数量</label>
                        <span className="text-white font-mono">{settings.aiCount}</span>
                    </div>
                    <input type="range" min="2" max="6" value={settings.aiCount} onChange={(e) => setSettings(s => ({...s, aiCount: parseInt(e.target.value)}))} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
                </div>
                <div className="mb-6">
                    <div className="flex justify-between mb-2">
                        <label className="block text-cyan-400 font-bold">驾驶灵敏度</label>
                        <span className="text-white font-mono">{settings.sensitivity}%</span>
                    </div>
                    <input type="range" min="10" max="100" value={settings.sensitivity} onChange={(e) => setSettings(s => ({...s, sensitivity: parseInt(e.target.value)}))} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
                </div>
                <button onClick={() => setGameState(GameState.MENU)} className="w-full py-3 bg-gray-600 hover:bg-gray-500 text-white font-bold rounded mt-4">保存并返回</button>
             </div>
        </div>
    );

    const renderTrackSelect = () => (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-10 p-4">
             <h2 className="text-4xl font-bold text-white mb-8 font-['Orbitron']">赛区选择</h2>
             <div className="flex flex-wrap justify-center gap-4 mb-8">
                {Object.values(TRACKS).map((track) => (
                    <button 
                        key={track.id}
                        onClick={() => setSelectedTrack(track.id)}
                        className={`p-6 border-2 w-64 text-left transition-all relative overflow-hidden group ${selectedTrack === track.id ? 'border-cyan-400 bg-cyan-900/30' : 'border-gray-700 bg-gray-900/50 hover:border-gray-500'}`}
                    >
                        <h3 className="text-xl font-bold font-['Noto_Sans_SC'] mb-2 relative z-10">{track.name}</h3>
                        <p className="text-sm text-gray-300 relative z-10">{track.description}</p>
                    </button>
                ))}
             </div>
             
             {/* AI Briefing */}
             <div className="bg-blue-900/20 border-l-4 border-cyan-500 p-6 max-w-2xl w-full mb-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-2 opacity-10">
                    <svg className="w-24 h-24 text-cyan-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
                </div>
                <h4 className="text-cyan-400 font-bold mb-2 font-mono flex items-center gap-2">
                    <span className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></span>
                    AI 战术简报
                </h4>
                <p className="text-cyan-100 font-['Noto_Sans_SC'] leading-relaxed min-h-[60px]">
                    {isBriefingLoading ? <span className="animate-pulse">正在从战术网络下载数据...</span> : (aiBriefing || "请选择赛道以获取战术建议。")}
                </p>
             </div>

             <div className="flex gap-4">
                <button onClick={() => setGameState(GameState.MENU)} className="px-6 py-2 border border-red-500 text-red-500 hover:bg-red-900/30 font-bold rounded">返回</button>
                <button onClick={handleStartGame} className="px-12 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold text-xl hover:scale-105 transition-transform shadow-[0_0_20px_rgba(16,185,129,0.5)] rounded clip-path-slant">出击</button>
             </div>
        </div>
    );

    const renderShop = () => {
        if (editingCarId) {
            // 定制界面
            return (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 z-10 p-4">
                    <h2 className="text-4xl font-bold font-['Noto_Sans_SC'] mb-8">车辆改装中心</h2>
                    <div className="bg-gray-800 p-8 rounded-xl border border-gray-700 w-full max-w-2xl">
                        <h3 className="text-2xl text-white mb-6 font-['Orbitron']">PAINT & DECALS</h3>
                        
                        {/* 颜色选择 */}
                        <div className="mb-6">
                            <label className="block text-gray-400 mb-2">车身涂装 (Paint)</label>
                            <div className="flex gap-3 flex-wrap">
                                {['#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#111111'].map(c => (
                                    <button 
                                        key={c} 
                                        onClick={() => setCurrentCustomization(prev => ({...prev, color: c}))}
                                        className={`w-10 h-10 rounded-full border-2 ${currentCustomization.color === c ? 'border-white scale-110' : 'border-gray-600'}`}
                                        style={{ backgroundColor: c }}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* 贴花选择 */}
                        <div className="mb-6">
                            <label className="block text-gray-400 mb-2">赛车贴花 (Decal)</label>
                            <div className="grid grid-cols-4 gap-2">
                                {Object.values(DECALS).map(decal => (
                                    <button
                                        key={decal.id}
                                        onClick={() => setCurrentCustomization(prev => ({...prev, decalId: decal.id}))}
                                        className={`p-2 border rounded ${currentCustomization.decalId === decal.id ? 'border-cyan-500 bg-cyan-900/30' : 'border-gray-700 hover:bg-gray-700'}`}
                                    >
                                        <div className="text-xs text-center">{decal.name}</div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 轮毂选择 */}
                        <div className="mb-8">
                            <label className="block text-gray-400 mb-2">轮毂样式 (Rims)</label>
                            <div className="flex gap-4">
                                {Object.values(RIMS).map(rim => (
                                    <button
                                        key={rim.id}
                                        onClick={() => setCurrentCustomization(prev => ({...prev, rimId: rim.id}))}
                                        className={`px-4 py-2 border rounded ${currentCustomization.rimId === rim.id ? 'border-purple-500 bg-purple-900/30' : 'border-gray-700 hover:bg-gray-700'}`}
                                    >
                                        {rim.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <button onClick={saveCustomization} className="flex-1 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded">保存改装</button>
                            <button onClick={() => setEditingCarId(null)} className="flex-1 py-3 bg-gray-600 hover:bg-gray-500 text-white font-bold rounded">取消</button>
                        </div>
                    </div>
                </div>
            )
        }

        return (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 z-10 p-4">
             <div className="flex justify-between w-full max-w-4xl mb-8 items-center border-b border-gray-700 pb-4">
                <h2 className="text-4xl font-bold font-['Noto_Sans_SC']">地下车库</h2>
                <div className="text-2xl font-['Rajdhani'] text-yellow-400 flex items-center"><CoinIcon /> {playerState.coins}</div>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl w-full h-[60vh] overflow-y-auto p-2">
                {CARS.map(car => {
                    const isUnlocked = playerState.unlockedCars.includes(car.id);
                    const isSelected = playerState.selectedCarId === car.id;
                    const custom = playerState.carCustomizations?.[car.id];
                    const displayColor = custom?.color || car.color;

                    return (
                        <div key={car.id} className={`relative rounded-lg p-4 border transition-all ${isSelected ? 'border-yellow-400 bg-yellow-900/10' : 'border-gray-700 bg-gray-800'}`}>
                            <h3 className="text-2xl font-['Noto_Sans_SC'] mb-1">{car.name}</h3>
                            <div className="w-full h-32 bg-gray-900/50 rounded mb-4 flex items-center justify-center border border-gray-800">
                                <div className="w-16 h-10 rounded shadow-lg" style={{ backgroundColor: displayColor, boxShadow: `0 0 15px ${car.emissive}` }}></div>
                            </div>
                            
                            {/* 改装按钮 */}
                            {isUnlocked && (
                                <button onClick={() => enterCustomization(car.id)} className="absolute top-4 right-4 text-gray-400 hover:text-white">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                </button>
                            )}

                            {isUnlocked ? (
                                <button onClick={() => selectCar(car.id)} disabled={isSelected} className={`w-full py-2 font-bold uppercase tracking-wider rounded ${isSelected ? 'bg-yellow-500 text-black cursor-default' : 'bg-gray-700 hover:bg-gray-600 text-white'}`}>
                                    {isSelected ? '当前驾驶' : '驾驶此车'}
                                </button>
                            ) : (
                                <button onClick={() => buyCar(car.id, car.price)} disabled={playerState.coins < car.price} className={`w-full py-2 font-bold uppercase tracking-wider flex items-center justify-center gap-2 rounded ${playerState.coins < car.price ? 'bg-gray-800 text-gray-500' : 'bg-green-600 hover:bg-green-500 text-white'}`}>
                                    <span>购买</span> <span className="flex items-center text-sm"><CoinIcon />{car.price}</span>
                                </button>
                            )}
                        </div>
                    );
                })}
             </div>
             <button onClick={() => setGameState(GameState.MENU)} className="mt-8 px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded">返回主菜单</button>
        </div>
        );
    };

    const renderGameOver = () => (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-20 backdrop-blur-md">
            {raceStatus === RaceStatus.WRECKED ? (
                <>
                    <h2 className="text-6xl font-black text-red-600 mb-2 font-['Orbitron'] text-shadow-red animate-pulse">WRECKED</h2>
                    <div className="text-2xl font-['Noto_Sans_SC'] mb-8 text-red-200">车辆损毁 - 比赛结束</div>
                </>
            ) : (
                <>
                    <h2 className="text-6xl font-black text-yellow-400 mb-2 font-['Orbitron'] text-shadow-neon">FINISHED</h2>
                    <div className="text-2xl font-['Noto_Sans_SC'] mb-8 text-white">第 {finishRank} 名</div>
                </>
            )}
            
            <div className="bg-gray-900 p-8 rounded-xl border border-gray-700 text-center w-80">
                <div className="text-gray-400 text-sm uppercase tracking-widest mb-1">获得奖金</div>
                <div className="text-4xl font-bold text-yellow-400 flex justify-center items-center gap-2 mb-6">
                     <CoinIcon /> +{prizeMoney}
                </div>
                <button onClick={() => setGameState(GameState.MENU)} className="w-full px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded font-['Noto_Sans_SC']">
                    返回主菜单
                </button>
            </div>
        </div>
    );

    const renderHUD = () => (
        <div className="absolute inset-0 pointer-events-none z-10 flex flex-col justify-between p-6">
            {/* 伤害红屏特效 */}
            {currentHealth < 30 && (
                <div className="absolute inset-0 bg-red-500/20 mix-blend-overlay animate-pulse pointer-events-none z-0"></div>
            )}

            {/* 顶部信息栏 */}
            <div className="flex justify-between items-start z-10">
                <div className="flex gap-4">
                    <div className="bg-black/60 backdrop-blur px-6 py-3 border-l-4 border-cyan-500 skew-x-[-10deg]">
                        <div className="text-xs text-cyan-400 font-bold tracking-widest skew-x-[10deg]">圈数 LAP</div>
                        <div className="text-4xl font-mono font-bold text-white skew-x-[10deg]">{currentLap} <span className="text-sm text-gray-400">/ 2</span></div>
                    </div>
                    <div className="bg-black/60 backdrop-blur px-6 py-3 border-l-4 border-purple-500 skew-x-[-10deg]">
                        <div className="text-xs text-purple-400 font-bold tracking-widest skew-x-[10deg]">排名 POS</div>
                        <div className="text-4xl font-mono font-bold text-white skew-x-[10deg]">{currentRank} <span className="text-sm text-gray-400">/ {settings.aiCount + 1}</span></div>
                    </div>
                </div>
                <div className="bg-black/60 backdrop-blur px-6 py-3 border-r-4 border-yellow-500 skew-x-[10deg]">
                    <div className="text-xs text-yellow-400 font-bold tracking-widest skew-x-[-10deg] text-right">信用点</div>
                    <div className="text-2xl font-mono font-bold text-white skew-x-[-10deg] text-right flex items-center justify-end gap-2">
                        <CoinIcon /> {playerState.coins}
                    </div>
                </div>
            </div>
            
            {/* 倒计时层 */}
            {raceStatus === RaceStatus.COUNTDOWN && (
                <div className="absolute inset-0 flex items-center justify-center z-50">
                     <div className="text-[12rem] font-black text-white font-['Orbitron'] animate-ping text-shadow-neon">
                        {countdownValue === 0 ? 'GO' : countdownValue}
                     </div>
                </div>
            )}

            {/* 底部仪表盘 */}
            <div className="flex items-end justify-between w-full px-8 pb-4 z-10">
                 {/* 左侧：耐久度 */}
                 <div className="w-64">
                     <div className="text-xs text-gray-400 font-bold mb-1 tracking-widest">VEHICLE HEALTH</div>
                     <div className="w-full h-4 bg-gray-800 rounded skew-x-[-20deg] overflow-hidden border border-gray-600">
                         <div 
                            className={`h-full transition-all duration-300 ${currentHealth < 30 ? 'bg-red-600 animate-pulse' : 'bg-green-500'}`} 
                            style={{ width: `${(currentHealth / activeCar.maxHealth) * 100}%` }} 
                         />
                     </div>
                     <div className="text-right text-xs text-gray-500 mt-1 font-mono">{Math.floor(currentHealth)} / {activeCar.maxHealth}</div>
                 </div>

                 {/* 中间：速度表 */}
                 <div className="relative bottom-0">
                    <SpeedGauge speed={currentSpeed} />
                 </div>
                 
                 {/* 右侧：氮气条 (Segmented) */}
                 <div className="w-64 flex flex-col items-end">
                     <div className={`text-xs font-bold mb-1 tracking-widest transition-colors ${nitroLevel > 95 ? 'text-cyan-300 drop-shadow-glow' : 'text-gray-400'}`}>
                         NITRO BOOST
                     </div>
                     <div className="flex gap-1 w-full skew-x-[-20deg]">
                         {[...Array(10)].map((_, i) => (
                             <div 
                                key={i} 
                                className={`h-6 flex-1 border border-gray-700 transition-all ${
                                    i < (nitroLevel / 10) 
                                        ? (isNitroActive ? 'bg-white shadow-[0_0_10px_#fff]' : 'bg-cyan-500') 
                                        : 'bg-gray-900'
                                }`}
                             />
                         ))}
                     </div>
                 </div>
            </div>
        </div>
    );

    return (
        <div className="relative w-full h-full bg-black overflow-hidden select-none font-['Noto_Sans_SC']">
            <div className="absolute inset-0 z-0">
                <Canvas shadows dpr={settings.quality === 'HIGH' ? [1, 2] : [1, 1]} gl={{ antialias: false }}>
                   <GameScene 
                        trackConfig={activeTrackConfig} 
                        carConfig={activeCar} 
                        playerCustomization={playerState.carCustomizations?.[playerState.selectedCarId]}
                        onGameOver={handleGameOver}
                        onScoreUpdate={handleHUDUpdate}
                        onCountdown={handleCountdown}
                        // 如果状态是暂停，就传给场景一个暂停状态，虽然场景可能使用内部的暂停逻辑，
                        // 但通过 raceStatus 传递是最安全的。
                        // 由于 types.ts 中 RaceStatus 有 PAUSED，我们可以直接使用。
                        raceStatus={gameState === GameState.PAUSED ? RaceStatus.PAUSED : raceStatus}
                        quality={settings.quality}
                        sfxVolume={settings.sfxVolume}
                        sensitivity={settings.sensitivity}
                        aiCount={settings.aiCount}
                   />
                </Canvas>
            </div>
            {gameState === GameState.MENU && renderMainMenu()}
            {gameState === GameState.SETTINGS && renderSettings()}
            {gameState === GameState.TRACK_SELECT && renderTrackSelect()}
            {gameState === GameState.SHOP && renderShop()}
            {gameState === GameState.PLAYING && renderHUD()}
            {gameState === GameState.PAUSED && renderPauseMenu()}
            {gameState === GameState.GAME_OVER && renderGameOver()}
        </div>
    );
};

export default App;
