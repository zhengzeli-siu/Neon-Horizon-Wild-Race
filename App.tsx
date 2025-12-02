
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { GameState, BiomeType, PlayerState, SettingsState, RaceStatus, RacerState } from './types';
import { CARS, TRACKS, PRIZES } from './constants';
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
    
    // 结算数据
    const [lastScore, setLastScore] = useState(0);
    const [finishRank, setFinishRank] = useState(0);
    const [prizeMoney, setPrizeMoney] = useState(0);

    const [aiBriefing, setAiBriefing] = useState<string>('');
    const [isBriefingLoading, setIsBriefingLoading] = useState(false);
    
    const [playerState, setPlayerState] = useState<PlayerState>(() => {
        const saved = localStorage.getItem('neon_race_save');
        return saved ? JSON.parse(saved) : {
            coins: 100,
            unlockedCars: ['starter_alpha'],
            selectedCarId: 'starter_alpha',
            highScore: 0
        };
    });

    const [settings, setSettings] = useState<SettingsState>({
        quality: 'HIGH',
        musicVolume: 50,
        sfxVolume: 80,
        sensitivity: 50
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
        } else {
            stopAudio(raceBgmRef.current);
            if (menuBgmRef.current && menuBgmRef.current.paused) playAudio(menuBgmRef.current);
        }
    }, [gameState]);

    useEffect(() => {
        localStorage.setItem('neon_race_save', JSON.stringify(playerState));
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
        setCurrentRank(6);

        // 3秒倒计时逻辑由 GameScene 驱动回调
        setTimeout(() => setRaceStatus(RaceStatus.RACING), 4000); 
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
        setCurrentSpeed(Math.floor(state.speed));
        setNitroLevel(state.nitroLevel);
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
                    <label className="block text-cyan-400 mb-2 font-bold">驾驶灵敏度 ({settings.sensitivity})</label>
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
             <div className="flex gap-4">
                <button onClick={() => setGameState(GameState.MENU)} className="px-6 py-2 border border-red-500 text-red-500 hover:bg-red-900/30 font-bold rounded">返回</button>
                <button onClick={handleStartGame} className="px-12 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold text-xl hover:scale-105 transition-transform shadow-[0_0_20px_rgba(16,185,129,0.5)] rounded clip-path-slant">出击</button>
             </div>
        </div>
    );

    const renderShop = () => (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 z-10 p-4">
             <div className="flex justify-between w-full max-w-4xl mb-8 items-center border-b border-gray-700 pb-4">
                <h2 className="text-4xl font-bold font-['Noto_Sans_SC']">地下车库</h2>
                <div className="text-2xl font-['Rajdhani'] text-yellow-400 flex items-center"><CoinIcon /> {playerState.coins}</div>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl w-full h-[60vh] overflow-y-auto p-2">
                {CARS.map(car => {
                    const isUnlocked = playerState.unlockedCars.includes(car.id);
                    const isSelected = playerState.selectedCarId === car.id;
                    return (
                        <div key={car.id} className={`relative rounded-lg p-4 border transition-all ${isSelected ? 'border-yellow-400 bg-yellow-900/10' : 'border-gray-700 bg-gray-800'}`}>
                            <h3 className="text-2xl font-['Noto_Sans_SC'] mb-1">{car.name}</h3>
                            <div className="w-full h-32 bg-gray-900/50 rounded mb-4 flex items-center justify-center border border-gray-800">
                                <div className="w-16 h-10 rounded shadow-lg" style={{ backgroundColor: car.color, boxShadow: `0 0 15px ${car.emissive}` }}></div>
                            </div>
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
            {/* 顶部信息栏 */}
            <div className="flex justify-between items-start">
                <div className="flex gap-4">
                    <div className="bg-black/40 backdrop-blur px-6 py-3 border-l-4 border-cyan-500 skew-x-[-10deg]">
                        <div className="text-xs text-cyan-400 font-bold tracking-widest skew-x-[10deg]">圈数 LAP</div>
                        <div className="text-4xl font-mono font-bold text-white skew-x-[10deg]">{currentLap} <span className="text-sm text-gray-400">/ 3</span></div>
                    </div>
                    <div className="bg-black/40 backdrop-blur px-6 py-3 border-l-4 border-purple-500 skew-x-[-10deg]">
                        <div className="text-xs text-purple-400 font-bold tracking-widest skew-x-[10deg]">排名 POS</div>
                        <div className="text-4xl font-mono font-bold text-white skew-x-[10deg]">{currentRank} <span className="text-sm text-gray-400">/ 6</span></div>
                    </div>
                </div>
                <div className="bg-black/40 backdrop-blur px-6 py-3 border-r-4 border-yellow-500 skew-x-[10deg]">
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
            <div className="self-center flex flex-col items-center gap-2 mb-8 w-full max-w-lg">
                 {/* 耐久度条 */}
                 <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden border border-gray-600 relative skew-x-[-10deg] mb-2">
                     <div className={`h-full transition-all duration-300 ${currentHealth < 30 ? 'bg-red-600' : 'bg-green-500'}`} style={{ width: `${(currentHealth / activeCar.maxHealth) * 100}%` }} />
                 </div>
                 
                 <div className="flex items-end gap-2">
                    <span className="text-7xl font-black italic font-['Orbitron'] text-white drop-shadow-md">{currentSpeed}</span>
                    <span className="text-xl text-cyan-500 font-bold mb-3">KM/H</span>
                 </div>
                 
                 {/* 氮气条 */}
                 <div className="w-80 h-4 bg-gray-900 rounded-full overflow-hidden border border-gray-600 relative skew-x-[-20deg]">
                     <div 
                        className="h-full bg-gradient-to-r from-blue-600 via-cyan-400 to-white transition-all duration-100 box-shadow-[0_0_10px_#00ffff]"
                        style={{ width: `${nitroLevel}%` }}
                     />
                     <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold tracking-widest text-white/90 skew-x-[20deg]">
                         NITRO BOOST
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
                        onGameOver={handleGameOver}
                        onScoreUpdate={handleHUDUpdate}
                        onCountdown={handleCountdown}
                        raceStatus={raceStatus}
                        quality={settings.quality}
                        sfxVolume={settings.sfxVolume}
                        sensitivity={settings.sensitivity}
                   />
                </Canvas>
            </div>
            {gameState === GameState.MENU && renderMainMenu()}
            {gameState === GameState.SETTINGS && renderSettings()}
            {gameState === GameState.TRACK_SELECT && renderTrackSelect()}
            {gameState === GameState.SHOP && renderShop()}
            {gameState === GameState.PLAYING && renderHUD()}
            {gameState === GameState.GAME_OVER && renderGameOver()}
        </div>
    );
};

export default App;
