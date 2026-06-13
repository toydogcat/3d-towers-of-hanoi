import React, { useState, useEffect, useRef } from 'react';
import {
  Volume2,
  VolumeX,
  RotateCcw,
  Play,
  Square,
  Save,
  HelpCircle,
  Trophy,
  Sparkles,
  Lock,
  Unlock,
  Trash2,
  ListRestart,
  Volume,
  BookOpen,
  X,
  ChevronRight,
  RefreshCw,
  Cpu
} from 'lucide-react';
import Hanoi3D from './components/Hanoi3D';
import { GameState, Macro, GameStatus } from './types';
import { sounds } from './utils/audio';

// Initial pre-seeded macros for educational onboarding
const PRESEEDED_MACROS: Macro[] = [
  {
    id: 'preset-2-discs',
    name: '雙盤轉移術 (移2盤)',
    moves: [
      { from: 0, to: 1 },
      { from: 0, to: 2 },
      { from: 1, to: 2 }
    ],
    discCount: 2,
    sourcePeg: 0,
    targetPeg: 2
  },
  {
    id: 'preset-3-discs',
    name: '三盤大挪移 (移3盤)',
    moves: [
      { from: 0, to: 2 },
      { from: 0, to: 1 },
      { from: 2, to: 1 },
      { from: 0, to: 2 },
      { from: 1, to: 0 },
      { from: 1, to: 2 },
      { from: 0, to: 2 }
    ],
    discCount: 3,
    sourcePeg: 0,
    targetPeg: 2
  }
];

export default function App() {
  // Load levels or general states.
  // Level 1: 3 discs; Level i: i + 2 discs; Level 10: 12 discs.
  const [level, setLevel] = useState<number>(() => {
    const saved = localStorage.getItem('hanoi_level');
    if (saved) {
      const lvl = parseInt(saved, 10);
      if (lvl >= 1 && lvl <= 10) return lvl;
    }
    return 1;
  });
  const [status, setStatus] = useState<GameStatus>('idle');
  const [pegs, setPegs] = useState<number[][]>(() => {
    // We will initialize the pegs stack based on the loaded level
    const saved = localStorage.getItem('hanoi_level');
    const lvl = saved ? parseInt(saved, 10) : 1;
    const initialLvl = (lvl >= 1 && lvl <= 10) ? lvl : 1;
    const dCount = initialLvl + 2;
    const initialStack = Array.from({ length: dCount }, (_, i) => dCount - i);
    return [initialStack, [], []];
  });
  const [selectedPeg, setSelectedPeg] = useState<number | null>(null);
  const [movesCount, setMovesCount] = useState<number>(0);
  const [history, setHistory] = useState<number[][][]>([]);

  // Sound state
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Macro/Recorders State
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingMoves, setRecordingMoves] = useState<{ from: number; to: number }[]>([]);
  const [recordingSourcePeg, setRecordingSourcePeg] = useState<number | null>(null);
  const [macros, setMacros] = useState<Macro[]>(() => {
    const saved = localStorage.getItem('hanoi_custom_macros');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const custom = parsed.filter((m: any) => m && m.id && !m.id.startsWith('preset'));
          return [...PRESEEDED_MACROS, ...custom];
        }
      } catch (e) {
        console.error('Error loading custom macros:', e);
      }
    }
    return PRESEEDED_MACROS;
  });
  const [selectedMacroId, setSelectedMacroId] = useState<string>('preset-2-discs');
  
  // Custom execution parameters
  const [macroSourceNew, setMacroSourceNew] = useState<number>(0);
  const [macroTargetNew, setMacroTargetNew] = useState<number>(2);
  const [autoplaySpeed, setAutoplaySpeed] = useState<number>(350); // ms per move
  const [autoplayingMoves, setAutoplayingMoves] = useState<{ from: number; to: number }[] | null>(null);
  const [autoplayIndex, setAutoplayIndex] = useState<number>(0);

  // Notification overlays
  const [showRules, setShowRules] = useState<boolean>(false);
  const [showWelcome, setShowWelcome] = useState<boolean>(true);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Parent Scroll Sync (Luna AI Hub Protocol)
  useEffect(() => {
    let lastScrollY = 0;
    const scrollThreshold = 8;
    const handleScroll = () => {
      const currentScrollY = window.scrollY || document.documentElement.scrollTop;
      if (Math.abs(currentScrollY - lastScrollY) < scrollThreshold && currentScrollY > 10) return;
      const direction = currentScrollY > lastScrollY ? 'down' : 'up';
      window.parent.postMessage({ type: 'iframe_scroll', scrollY: currentScrollY, direction: direction }, '*');
      lastScrollY = currentScrollY;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Vercount Refresh on level change
  useEffect(() => {
    if ((window as any).vercount && typeof (window as any).vercount.fetch === 'function') {
      (window as any).vercount.fetch();
    }
  }, [level]);

  const discCount = level + 2;
  const minMoves = Math.pow(2, discCount) - 1;

  // Track is macro feature unlocked. Level 4 (which has 6 discs) is the barrier.
  const isMacroUnlocked = level >= 4;

  // Initialize level
  const resetLevel = (targetLevel: number) => {
    const dCount = targetLevel + 2;
    // Generate initial stack: [dCount, dCount-1, ..., 1]
    const initialStack = Array.from({ length: dCount }, (_, i) => dCount - i);
    setPegs([initialStack, [], []]);
    setSelectedPeg(null);
    setMovesCount(0);
    setHistory([]);
    setStatus('playing');
    setAutoplayingMoves(null);
    setAutoplayIndex(0);
    setIsRecording(false);
    setRecordingMoves([]);
    setRecordingSourcePeg(null);
    setFeedbackMsg(null);
    
    // Auto initiate sound engine context on first move
    sounds.init();
  };

  // Run on level change
  useEffect(() => {
    resetLevel(level);
  }, [level]);

  // Save level to localStorage
  useEffect(() => {
    localStorage.setItem('hanoi_level', level.toString());
  }, [level]);

  // Save custom macros to localStorage
  useEffect(() => {
    const custom = macros.filter((m) => !m.id.startsWith('preset'));
    localStorage.setItem('hanoi_custom_macros', JSON.stringify(custom));
  }, [macros]);

  // Handle Autoplay timer
  useEffect(() => {
    if (status !== 'autoplaying' || !autoplayingMoves || autoplayIndex >= autoplayingMoves.length) {
      if (status === 'autoplaying' && autoplayingMoves && autoplayIndex === autoplayingMoves.length) {
        // Complete execution
        setStatus('playing');
        setAutoplayingMoves(null);
        setAutoplayIndex(0);
        showFeedback('🤖 遞迴動能複製執行完畢！', 'success');
        sounds.playSuccess();
        checkAndTriggerWin(pegs);
      }
      return;
    }

    const timer = setTimeout(() => {
      const nextMove = autoplayingMoves[autoplayIndex];
      const success = executeMove(nextMove.from, nextMove.to, true);

      if (success) {
        setAutoplayIndex((prev) => prev + 1);
      } else {
        // Halt macro execution on rules violation
        setStatus('playing');
        setAutoplayingMoves(null);
        setAutoplayIndex(0);
        showFeedback('❌ 拷貝執行中斷：該步驟違反河內塔規則（大盤不可壓在小盤上）。請修正在新的柱位上的重現順序！', 'error');
        sounds.playError();
      }
    }, autoplaySpeed);

    return () => clearTimeout(timer);
  }, [status, autoplayingMoves, autoplayIndex, autoplaySpeed, pegs]);

  // Helper to show temporary UI alerts
  const showFeedback = (text: string, type: 'success' | 'error' | 'info') => {
    setFeedbackMsg({ text, type });
  };

  useEffect(() => {
    if (feedbackMsg) {
      const t = setTimeout(() => setFeedbackMsg(null), 5000);
      return () => clearTimeout(t);
    }
  }, [feedbackMsg]);

  // Sync sound setting
  const toggleSound = () => {
    const nextVal = !soundEnabled;
    setSoundEnabled(nextVal);
    sounds.toggleSound(nextVal);
  };

  // Perform physical move between pegs
  const executeMove = (from: number, to: number, isAuto: boolean = false): boolean => {
    const fromStack = pegs[from];
    const toStack = pegs[to];

    if (fromStack.length === 0) return false;

    const movingDisc = fromStack[fromStack.length - 1];

    // Rule validation: Cannot put larger disc on top of smaller disc
    if (toStack.length > 0) {
      const topDisc = toStack[toStack.length - 1];
      if (movingDisc > topDisc) {
        return false;
      }
    }

    // Apply valid status
    const updatedPegs = pegs.map((stack, pIdx) => {
      if (pIdx === from) return stack.slice(0, -1);
      if (pIdx === to) return [...stack, movingDisc];
      return stack;
    });

    setHistory((prev) => [...prev, pegs]);
    setPegs(updatedPegs);
    setMovesCount((prev) => prev + 1);
    sounds.playDiscDrop();

    // Handle recording moves
    if (isRecording && !isAuto) {
      // capture initial source peg of the continuous sequence
      if (recordingMoves.length === 0) {
        setRecordingSourcePeg(from);
      }
      setRecordingMoves((prev) => [...prev, { from, to }]);
    }

    // Check Win status (but wait, in React, we inspect the updated value or trigger it downstream)
    checkAndTriggerWin(updatedPegs);
    return true;
  };

  const undo = () => {
    if (history.length === 0 || status === 'autoplaying') return;
    const prevPegs = history[history.length - 1];
    setPegs(prevPegs);
    setHistory((prev) => prev.slice(0, -1));
    setMovesCount((prev) => Math.max(0, prev - 1));
    setSelectedPeg(null);
    sounds.playDiscDrop();
    showFeedback('↩️ 已復原上一步操作。', 'info');
  };

  const generateHanoiMoves = (n: number, from: number, to: number, aux: number): { from: number; to: number }[] => {
    const steps: { from: number; to: number }[] = [];
    const solve = (discs: number, f: number, t: number, a: number) => {
      if (discs === 1) {
        steps.push({ from: f, to: t });
        return;
      }
      solve(discs - 1, f, a, t);
      steps.push({ from: f, to: t });
      solve(discs - 1, a, t, f);
    };
    solve(n, from, to, aux);
    return steps;
  };

  const startAiSolve = () => {
    sounds.init();
    const dCount = level + 2;
    const initialStack = Array.from({ length: dCount }, (_, i) => dCount - i);
    
    // Reset state for autoplay
    setPegs([initialStack, [], []]);
    setSelectedPeg(null);
    setMovesCount(0);
    setHistory([]);
    setIsRecording(false);
    setRecordingMoves([]);
    setRecordingSourcePeg(null);
    
    const steps = generateHanoiMoves(dCount, 0, 2, 1);
    setAutoplayIndex(0);
    setAutoplayingMoves(steps);
    setStatus('autoplaying');
    sounds.playMacroStart();
    showFeedback(`🤖 AI 遞迴求解器啟動！共需 ${steps.length} 步。`, 'info');
  };

  const checkAndTriggerWin = (currentPegs: number[][]) => {
    // Standard Hanoi Victory: all discs moved to Peg 2 (rightmost)
    const targetPegStack = currentPegs[2];
    if (targetPegStack.length === discCount) {
      // Double check sorted order (though game rules guarantee this)
      setStatus('win');
      sounds.playSuccess();
    }
  };

  // User interactive click on standard rod
  const handlePegClick = (pegIndex: number) => {
    if (status === 'autoplaying') {
      showFeedback('⚠️ 正在執行遞迴拷貝中，請先等候結束。', 'info');
      return;
    }
    if (status === 'win') return;

    sounds.init();

    if (selectedPeg === null) {
      // First click: select Top Disc on selected peg
      if (pegs[pegIndex].length === 0) {
        sounds.playError();
        showFeedback('❌ 此柱子沒有盤子可以移動！', 'error');
        return;
      }
      // Select peg
      setSelectedPeg(pegIndex);
      sounds.playDiscSelect();
    } else {
      // Second click: perform move from selectedPeg to pegIndex
      if (selectedPeg === pegIndex) {
        // Deselect
        setSelectedPeg(null);
        sounds.playDiscSelect();
        return;
      }

      const success = executeMove(selectedPeg, pegIndex);
      if (!success) {
        sounds.playError();
        showFeedback('❌ 無法移動：尺寸過大的盤子不可疊放在精巧的小盤子之上！', 'error');
      }
      setSelectedPeg(null);
    }
  };

  // Macro functions
  const startRecording = () => {
    if (status === 'autoplaying') return;
    setIsRecording(true);
    setRecordingMoves([]);
    setRecordingSourcePeg(null);
    showFeedback('🔴 開始記錄連續移盤操作。接下來的手動移盤都將記入巨集中。', 'info');
    sounds.playDiscSelect();
  };

  const stopAndSaveRecording = () => {
    if (recordingMoves.length === 0) {
      setIsRecording(false);
      showFeedback('⚠️ 錄製器中沒有記錄任何有效的位移操作。', 'info');
      return;
    }

    // Calculate source and target pegs of the overall recording
    const source = recordingSourcePeg ?? recordingMoves[0].from;
    const target = recordingMoves[recordingMoves.length - 1].to;

    // Determine how many unique discs were involved
    const movedDiscs = new Set<number>();
    recordingMoves.forEach((m) => {
      // We can discover which size is moved (but for raw play we just track coordinates)
    });

    const newMacro: Macro = {
      id: 'macro-' + Date.now(),
      name: `連續轉移 (${recordingMoves.length}步)`,
      moves: [...recordingMoves],
      discCount: Math.max(2, level - 1), // heuristic representation
      sourcePeg: source,
      targetPeg: target
    };

    setMacros((prev) => [...prev, newMacro]);
    setSelectedMacroId(newMacro.id);
    setIsRecording(false);
    setRecordingMoves([]);
    setRecordingSourcePeg(null);
    showFeedback('💾 遞迴動能拷貝成功！已儲存至下方巨集選單。', 'success');
    sounds.playLevelUp();
  };

  const clearRecording = () => {
    setIsRecording(false);
    setRecordingMoves([]);
    setRecordingSourcePeg(null);
    showFeedback('🧹 已清空目前錄製緩衝區。', 'info');
  };

  const deleteMacro = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Do not allow deleting preset ones if they are handy
    setMacros((prev) => prev.filter((m) => m.id !== id));
    if (selectedMacroId === id) {
      setSelectedMacroId('preset-2-discs');
    }
    showFeedback('🗑️ 巨集已成功刪除。', 'info');
  };

  // PLAY MACRO WITH RELATIVE ROTATION MAP
  const playMacro = () => {
    const macroObj = macros.find((m) => m.id === selectedMacroId);
    if (!macroObj) {
      showFeedback('❌ 請先選擇一個動能巨集模板！', 'error');
      return;
    }

    if (macroSourceNew === macroTargetNew) {
      showFeedback('❌ 重現方向的 來源柱 與 目標柱 不能相同！', 'error');
      return;
    }

    sounds.playMacroStart();

    // Map moves
    const S0 = macroObj.sourcePeg;
    const T0 = macroObj.targetPeg;
    const A0 = 3 - S0 - T0; // auxiliary is remaining node

    const Sn = macroSourceNew;
    const Tn = macroTargetNew;
    const An = 3 - Sn - Tn; // new auxiliary is remaining node

    const mappedMoves = macroObj.moves.map((mv) => {
      const remap = (val: number) => {
        if (val === S0) return Sn;
        if (val === T0) return Tn;
        return An;
      };
      return {
        from: remap(mv.from),
        to: remap(mv.to)
      };
    });

    // Start playback
    setAutoplayIndex(0);
    setAutoplayingMoves(mappedMoves);
    setStatus('autoplaying');
    setSelectedPeg(null);
    showFeedback(`⚡ 正在執行巨集: "${macroObj.name}" | 重新映射 [柱 ${S0+1}➔柱 ${T0+1}] ➜ [柱 ${Sn+1}➔柱 ${Tn+1}]`, 'info');
  };

  return (
    <div className="w-full min-h-screen flex flex-col text-slate-100 font-sans relative overflow-x-hidden select-none" style={{ background: 'radial-gradient(circle at 50% 50%, #1e1b4b 0%, #020617 100%)' }}>
      
      {/* 3D background visual helper grid */}
      <div className="absolute inset-0 opacity-15 pointer-events-none" style={{ backgroundImage: 'linear-gradient(#1e293b 1px, transparent 1px), linear-gradient(90deg, #1e293b 1px, transparent 1px)', backgroundSize: '40px 40px', transform: 'perspective(600px) rotateX(60deg) translateY(120px)' }}></div>

      {/* Header Bar */}
      <header className="z-40 px-6 py-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 relative">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-4 rounded-2xl shadow-2xl flex items-center gap-4">
          <div className="p-3 bg-gradient-to-tr from-cyan-500 to-indigo-600 rounded-xl shadow-lg shadow-indigo-500/20">
            <Cpu className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black tracking-tight bg-gradient-to-r from-cyan-400 via-indigo-200 to-purple-400 bg-clip-text text-transparent">
              河內塔：動能之境 (KINETIC)
            </h1>
            <div className="flex items-center gap-3 mt-1.5">
              <span className="text-[10px] bg-cyan-500/20 text-cyan-400 px-2 rounded border border-cyan-500/30 font-mono tracking-wider">
                LEVEL {level.toString().padStart(2, '0')}/10
              </span>
              <span className="text-[10px] text-zinc-400 font-mono">
                DISK COUNT: {discCount}
              </span>
            </div>
          </div>
        </div>

        {/* Global Toolbar */}
        <div className="flex items-center gap-3 justify-end">
          {/* Audio toggle */}
          <button
            onClick={toggleSound}
            className="p-3 px-4 rounded-xl border border-white/10 text-slate-300 hover:text-cyan-400 hover:border-white/20 bg-white/5 backdrop-blur-xl transition-all flex items-center gap-2 text-xs font-semibold shadow-lg"
            title="開關音效"
            id="sound-toggle-btn"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-cyan-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
            <span>{soundEnabled ? '音效已開' : '靜音'}</span>
          </button>

          {/* AI Solver Button */}
          <button
            onClick={startAiSolve}
            disabled={status === 'autoplaying'}
            className="p-3 px-4 rounded-xl border border-white/10 text-slate-300 hover:text-cyan-400 hover:border-white/20 bg-white/5 backdrop-blur-xl transition-all flex items-center gap-2 text-xs font-semibold shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
            title="AI 遞迴自動求解"
            id="ai-solve-btn"
          >
            <Cpu className="w-4 h-4 text-purple-400 animate-pulse" />
            <span>AI 自動求解</span>
          </button>

          {/* Rules Button */}
          <button
            onClick={() => setShowRules(true)}
            className="p-3 px-4 rounded-xl border border-white/10 text-slate-300 hover:text-cyan-400 hover:border-white/20 bg-white/5 backdrop-blur-xl transition-all flex items-center gap-2 text-xs font-semibold shadow-lg"
            id="rules-toggle-btn"
          >
            <BookOpen className="w-4 h-4 text-emerald-400" />
            <span>規則說明</span>
          </button>
        </div>
      </header>

      {/* Main Grid Wrapper */}
      <main className="flex-1 w-full max-w-[1700px] mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
        
        {/* Left Column: 3D Frame & Quick Actions (Lg: 8 columns) */}
        <section className="lg:col-span-8 flex flex-col gap-6">
          
          {/* The 3D Render Canvas Box */}
          <div className="relative flex-1 min-h-[440px] md:min-h-[520px] bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 shadow-2xl overflow-hidden flex flex-col">
            
            {/* Viewport Render Layer */}
            <div className="w-full flex-1 min-h-0 relative">
              <Hanoi3D
                gameState={{
                  level,
                  status,
                  pegs,
                  movesCount,
                  minMoves,
                  discCount,
                  selectedPeg,
                  isRecording,
                  recordingMoves,
                  macros
                }}
                onPegClick={handlePegClick}
                autoplayingMoves={autoplayingMoves}
                autoplayIndex={autoplayIndex}
              />

              {/* Status or Success Flash Alerts */}
              {feedbackMsg && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 max-w-sm w-[90%] z-20 pointer-events-none select-none animate-bounce">
                  <div className={`px-4 py-3 rounded-xl border shadow-xl flex items-center gap-2 backdrop-blur-2xl justify-center ${
                    feedbackMsg.type === 'success' 
                      ? 'bg-emerald-555/15 border-emerald-500/30 text-emerald-300' 
                      : feedbackMsg.type === 'error'
                      ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                      : 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300'
                  }`}>
                    <Sparkles className="w-4 h-4 shrink-0" />
                    <span className="text-xs font-bold font-sans tracking-wide">{feedbackMsg.text}</span>
                  </div>
                </div>
              )}

              {/* Autoplay Active Overlay */}
              {status === 'autoplaying' && autoplayingMoves && (
                <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm flex flex-col items-center justify-center z-10 select-none pointer-events-none">
                  <div className="bg-[#020617]/95 border border-cyan-500/30 backdrop-blur-2xl rounded-3xl p-6 text-center max-w-sm shadow-2xl space-y-4 pointer-events-auto">
                    <div className="flex items-center justify-center gap-3">
                      <RefreshCw className="w-6 h-6 text-cyan-400 animate-spin" />
                      <span className="text-cyan-400 font-black tracking-widest text-xs uppercase">遞迴能狂飆傳輸中</span>
                    </div>
                    <p className="text-slate-300 text-xs font-sans">
                      正在自動執行盤子移轉。
                    </p>
                    <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-white/5">
                      <div 
                        className="bg-gradient-to-r from-cyan-400 to-indigo-500 h-full transition-all duration-150"
                        style={{ width: `${(autoplayIndex / autoplayingMoves.length) * 100}%` }}
                      ></div>
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                      <span>進度: {autoplayIndex} / {autoplayingMoves.length} 步</span>
                      <span>剩餘 {autoplayingMoves.length - autoplayIndex} 步</span>
                    </div>
                    <button
                      onClick={() => {
                        setStatus('playing');
                        setAutoplayingMoves(null);
                        setAutoplayIndex(0);
                        showFeedback('⏸️ 已手動中斷自動執行。', 'info');
                      }}
                      className="w-full mt-2 py-2 px-4 bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-800 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" /> 中斷自動執行
                    </button>
                  </div>
                </div>
              )}

              {/* LEVEL WIN MODAL COVER */}
              {status === 'win' && (
                <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center z-20 select-none">
                  <div className="bg-gradient-to-b from-indigo-950/90 to-slate-950/95 border border-indigo-500/30 rounded-3xl p-8 max-w-md w-[90%] text-center shadow-2xl relative overflow-hidden space-y-6">
                    {/* Decorative bg light */}
                    <div className="absolute -top-12 -left-12 w-32 h-32 bg-cyan-500/20 rounded-full blur-2xl"></div>
                    <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-purple-500/20 rounded-full blur-2xl"></div>

                    <div className="space-y-2 relative z-10">
                      <div className="w-16 h-16 bg-gradient-to-tr from-amber-400 to-yellow-600 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-yellow-500/20 animate-bounce">
                        <Trophy className="w-8 h-8 text-white" />
                      </div>
                      <h3 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-yellow-105 tracking-wide">恭喜突破第 {level} 關！</h3>
                      <p className="text-xs text-slate-400">您完美將所有盤子成功轉移至目標柱！</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 bg-white/5 p-4 rounded-xl border border-white/10 text-center font-mono relative z-10">
                      <div>
                        <p className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold">此關盤子數量</p>
                        <p className="text-lg font-bold text-slate-250">{discCount} 個</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold">您的步數 / 最少步數</p>
                        <p className={`text-lg font-bold ${movesCount <= minMoves ? 'text-emerald-400 animate-pulse' : 'text-cyan-300'}`}>
                          {movesCount} / {minMoves} 步
                        </p>
                      </div>
                      <div className="col-span-2 border-t border-white/10 pt-2 mt-1">
                        <p className="text-[11px] text-indigo-300 font-sans tracking-wide">
                          {movesCount <= minMoves 
                            ? '✨ 驚人神乎其技！使用的是最優解移動策略！' 
                            : `💡 您多花了 ${movesCount - minMoves} 步，下次可運用「遞迴巨集」來簡化操作喔！`}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-3 relative z-10">
                      <button
                        onClick={() => resetLevel(level)}
                        className="flex-1 py-3 px-4 bg-white/5 hover:bg-white/10 text-slate-200 rounded-xl text-xs font-bold transition-all border border-white/10 flex items-center justify-center gap-2"
                      >
                        <RotateCcw className="w-4 h-4" /> 重新挑戰
                      </button>

                      {level < 10 ? (
                        <button
                          onClick={() => setLevel((prev) => Math.min(10, prev + 1))}
                          className="flex-1 py-3 px-4 bg-gradient-to-r from-cyan-500 to-indigo-650 hover:from-cyan-400 hover:to-indigo-555 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-1.5"
                        >
                          下一關板塊 ({level + 1} 關) <ChevronRight className="w-4 h-4" />
                        </button>
                      ) : (
                        <div className="flex-1 py-3 px-4 bg-gradient-to-r from-amber-500 to-yellow-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-lg shadow-yellow-500/30">
                          👑 稱霸十關！
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Panel metrics inside frame container */}
            <div className="border-t border-white/10 bg-white/5 backdrop-blur-xl px-5 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              
              {/* Level Progress Stats */}
              <div className="flex flex-wrap items-center gap-5 text-center sm:text-left">
                <div className="space-y-0.5">
                  <header className="text-[10px] text-zinc-400 uppercase tracking-widest font-black">目前關卡進度</header>
                  <p className="text-sm font-semibold text-slate-250">
                    第 {level} 關 <span className="text-xs text-slate-400 font-mono">({discCount} 個盤子)</span>
                  </p>
                </div>

                <div className="h-8 w-[1px] bg-white/10 hidden sm:block"></div>

                <div className="space-y-0.5">
                  <header className="text-[10px] text-zinc-400 uppercase tracking-widest font-black">本局累計步數</header>
                  <p className="text-sm font-semibold font-mono text-slate-250">
                    <span className="text-cyan-400 font-bold text-base">{movesCount}</span>
                    <span className="text-zinc-500"> / 最優：{minMoves} 步</span>
                  </p>
                </div>
              </div>

              {/* Game Control Action Group */}
              <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                <button
                  disabled={history.length === 0 || status === 'autoplaying'}
                  onClick={undo}
                  className="flex-1 sm:flex-initial py-2.5 px-4 rounded-xl border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-cyan-300 transition-all text-xs font-semibold flex items-center justify-center gap-2 shadow-md disabled:opacity-40 disabled:hover:text-slate-300 disabled:cursor-not-allowed"
                  title="復原上一步 (Undo)"
                  id="undo-btn"
                >
                  <span className="text-xs">↩️ 復原一步</span>
                </button>

                <button
                  onClick={() => resetLevel(level)}
                  className="flex-1 sm:flex-initial py-2.5 px-4 rounded-xl border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 text-slate-350 hover:text-cyan-300 transition-all text-xs font-semibold flex items-center justify-center gap-2 shadow-md"
                  title="重置本局"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> 重置本關
                </button>

                <div className="flex rounded-xl bg-slate-950 p-1 border border-white/10">
                  <button
                    disabled={level <= 1}
                    onClick={() => setLevel((prev) => Math.max(1, prev - 1))}
                    className="p-1.5 px-2.5 rounded-lg text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:hover:text-slate-400 transition-all font-bold"
                    title="前一關"
                  >
                    ◀
                  </button>
                  <span className="px-3 py-1 text-xs font-mono font-bold text-slate-300 flex items-center justify-center">
                    Level {level} / 10
                  </span>
                  <button
                    disabled={level >= 10}
                    onClick={() => setLevel((prev) => Math.min(10, prev + 1))}
                    className="p-1.5 px-2.5 rounded-lg text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:hover:text-slate-400 transition-all font-bold"
                    title="下一關"
                  >
                    ▶
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Right Column: Game Control Panel (Lg: 4 columns) */}
        <section className="lg:col-span-4 flex flex-col gap-6">
          
          {/* Level Selection Navigator */}
          <div className="bg-indigo-500/10 backdrop-blur-2xl border border-indigo-500/20 rounded-3xl p-5 shadow-2xl space-y-4">
            <header className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-indigo-400 flex items-center gap-2">
                <span className="w-1.5 h-3 bg-indigo-500 rounded-sm"></span> 關卡進度選擇
              </h3>
              <span className="text-[10px] font-bold text-slate-400 bg-white/5 px-2.5 py-0.5 rounded-full border border-white/10 font-mono">
                MAX: 12層
              </span>
            </header>

            <div className="grid grid-cols-5 gap-2">
              {Array.from({ length: 10 }, (_, i) => {
                const buttonLvl = i + 1;
                const active = buttonLvl === level;
                const isPresetEasy = buttonLvl < 4;
                return (
                  <button
                    key={buttonLvl}
                    onClick={() => setLevel(buttonLvl)}
                    className={`h-11 rounded-xl border flex flex-col items-center justify-center transition-all text-center relative cursor-pointer ${
                      active
                        ? 'bg-gradient-to-b from-indigo-500 to-cyan-500 text-white border-cyan-400 shadow-[0_0_15px_rgba(129,140,248,0.5)]'
                        : 'bg-white/5 text-slate-400 border-white/10 hover:border-white/20 hover:text-slate-200'
                    }`}
                  >
                    <span className="text-xs font-bold font-mono">{buttonLvl}</span>
                    <span className="text-[8px] scale-90 text-slate-400/80 leading-none mt-0.5 font-mono" style={{ color: active ? '#e2e8f0' : undefined }}>
                      {buttonLvl + 2}層
                    </span>
                    
                    {!isPresetEasy && (
                      <span className="absolute top-0 right-0 text-[7px] bg-cyan-500 text-white p-0.5 px-1 rounded-full leading-none transform translate-x-1/3 -translate-y-1/3 shadow animate-pulse" title="可啟用遞迴拷貝">
                        ⚡
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Recursive Copier (Macro Engine) panel */}
          <div className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl p-5 shadow-2xl flex-1 flex flex-col relative overflow-hidden">
            
            {/* If locked, render an eye-safe sleek padlock curtain layer */}
            {!isMacroUnlocked && (
              <div className="absolute inset-0 bg-[#020617]/96 backdrop-blur-md z-10 flex flex-col items-center justify-center p-6 text-center space-y-4">
                <div className="w-14 h-14 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center shadow-lg text-slate-400 animate-pulse">
                  <Lock className="w-6 h-6 text-slate-300" />
                </div>
                <div className="space-y-1.5">
                  <h5 className="text-xs font-bold text-zinc-350 uppercase tracking-widest">🔒 遞迴動能複製器未解鎖</h5>
                  <p className="text-[11px] text-slate-400 leading-relaxed max-w-xs mx-auto">
                    前 3 關（3層、4層、5層盤子）必須以手工操作，以建立河內塔的空間感。{' '}
                    <span className="text-cyan-400 font-semibold">突破第 4 關 (6個盤子)</span>{' '}
                    時將會解除密碼，解鎖此高階複製模組！
                  </p>
                </div>
                <div className="w-[85%] bg-white/5 h-1.5 rounded-full overflow-hidden border border-white/5">
                  <div 
                    className="bg-gradient-to-r from-cyan-400 to-indigo-500 h-full transition-all duration-300"
                    style={{ width: `${(level / 4) * 100}%` }}
                  ></div>
                </div>
                <p className="text-[10px] font-mono text-zinc-500">已累積解鎖狀態：Level {level}/4</p>
              </div>
            )}

            {/* Unlocked header container */}
            <header className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-cyan-400 flex items-center gap-1.5">
                  <Cpu className="w-4 h-4 text-cyan-400 animate-pulse" /> 動能規律緩衝區 (Recursive Buffer)
                </h3>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  您可以錄製一組移盤操作規律，並在別的柱位上重現!
                </p>
              </div>
            </header>

            {/* Macro Body Controls */}
            <div className="space-y-4 flex-1 flex flex-col min-h-0">
              
              {/* Recording Controls */}
              <div className="p-3.5 bg-white/5 rounded-2xl border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1.5 font-mono">
                    {isRecording ? (
                      <span className="flex h-2 w-2 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                      </span>
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-slate-600"></span>
                    )}
                    STATUS: {isRecording ? 'RECORDING' : 'READY'}
                  </span>
                  
                  {isRecording && (
                    <span className="text-[10px] font-mono text-rose-400 bg-rose-950/50 px-2 py-0.5 rounded border border-rose-800/50">
                      已錄製 {recordingMoves.length} 步
                    </span>
                  )}
                </div>

                <div className="flex gap-2">
                  {!isRecording ? (
                    <button
                      onClick={startRecording}
                      disabled={status === 'autoplaying'}
                      className="flex-1 py-1.5 px-3 bg-white/5 border border-white/10 hover:border-white/20 hover:bg-white/10 text-slate-200 hover:text-cyan-400 rounded-xl text-xs font-bold tracking-wider transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 shadow-md cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 text-cyan-400 fill-current" /> 開始錄製動型
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={stopAndSaveRecording}
                        className="flex-1 py-1.5 px-3 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-200 border border-emerald-800 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Save className="w-3.5 h-3.5" /> 儲存錄製
                      </button>
                      <button
                        onClick={clearRecording}
                        className="p-1 px-2.5 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 border border-white/10 rounded-xl text-xs transition-all flex items-center justify-center cursor-pointer"
                        title="取消錄製"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>

                {isRecording && (
                  <p className="text-[10px] text-zinc-400 leading-normal">
                    💡 <strong>提示：</strong>在 3D 面板中移動盤子。要轉移 $K$ 個盤子，建議先完整的將該疊最上面的 $K$ 個盤子從源柱移到另一個柱子，然後按儲存。
                  </p>
                )}
              </div>

              {/* Saved Macros Scrollable Column Container */}
              <div className="flex-1 flex flex-col min-h-[140px] space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">選擇動能模組模板：</label>
                
                <div className="flex-1 overflow-y-auto border border-white/10 bg-white/5 rounded-2xl divide-y divide-white/10 max-h-[180px]">
                  {macros.map((mac) => {
                    const selected = mac.id === selectedMacroId;
                    const isPreset = mac.id.startsWith('preset');
                    return (
                      <div
                        key={mac.id}
                        onClick={() => setSelectedMacroId(mac.id)}
                        className={`p-3 flex items-center justify-between text-left cursor-pointer transition-all ${
                          selected 
                            ? 'bg-cyan-500/5 text-slate-200 border-l-2 border-cyan-500' 
                            : 'hover:bg-white/5 text-slate-400'
                        }`}
                      >
                        <div className="space-y-1">
                          <p className={`text-xs font-bold ${selected ? 'text-cyan-400' : 'text-slate-200'}`}>
                            {mac.name}
                          </p>
                          <p className="text-[10px] text-zinc-500 font-mono">
                            規格：{mac.moves.length} 步 (柱 {mac.sourcePeg+1} ➔ 柱 {mac.targetPeg+1})
                          </p>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-mono text-indigo-400/80 bg-indigo-950/60 border border-indigo-900/50 px-1.5 py-0.5 rounded">
                            {isPreset ? '預設' : '自錄'}
                          </span>
                          {!isPreset && (
                            <button
                              onClick={(e) => deleteMacro(mac.id, e)}
                              className="p-1 text-slate-500 hover:text-rose-400 rounded transition-all cursor-pointer"
                              title="刪除"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {macros.length === 0 && (
                    <div className="p-4 text-center text-xs text-slate-655 font-medium">
                      尚未保存任何自定義操作宏
                    </div>
                  )}
                </div>
              </div>

              {/* Macro Replay Direction Configuration Block */}
              {selectedMacroId && (
                <div className="border-t border-white/10 pt-4 space-y-4">
                  
                  {/* Play config */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">重現目標方向轉換</span>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        (對稱映射機制)
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">
                          ⚙️ 從新來源柱：
                        </label>
                        <div className="flex rounded-xl bg-slate-950 p-1 border border-white/10">
                          {[0, 1, 2].map((idx) => (
                            <button
                              key={idx}
                              onClick={() => setMacroSourceNew(idx)}
                              className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                                macroSourceNew === idx
                                  ? 'bg-cyan-500 text-white font-black shadow-md'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              柱 {idx + 1}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">
                          🎯 到新目標柱：
                        </label>
                        <div className="flex rounded-xl bg-slate-950 p-1 border border-white/10">
                          {[0, 1, 2].map((idx) => (
                            <button
                              key={idx}
                              onClick={() => setMacroTargetNew(idx)}
                              className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                                macroTargetNew === idx
                                  ? 'bg-indigo-600 text-white font-black shadow-md'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              柱 {idx + 1}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Explanatory text for remapping */}
                    <p className="text-[10px] text-slate-355 font-serif leading-relaxed bg-white/5 p-3 rounded-2xl border border-white/10">
                      📜 <strong>遞迴原理：</strong>系統會自動將錄製中{' '}
                      <span className="text-cyan-400 font-semibold font-mono">柱 {macros.find(m => m.id === selectedMacroId)?.sourcePeg! + 1}</span>{' '}
                      的所有移盤軌跡，等比例變位投影為{' '}
                      <span className="text-cyan-400 font-semibold font-mono">柱 {macroSourceNew + 1}</span> 到{' '}
                      <span className="text-indigo-400 font-semibold font-mono">柱 {macroTargetNew + 1}</span> 的物理動作。這也是利用巨集自動化求解更高難度（7~12層）河內塔的數學本質！
                    </p>
                  </div>

                  {/* Play Sliders and Play Button */}
                  <div className="space-y-3 pb-2">
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span className="font-semibold tracking-wider">傳釋速度 (延遲)</span>
                        <span className="font-mono text-cyan-400 font-bold">{autoplaySpeed}ms</span>
                      </div>
                      <input
                        type="range"
                        min="100"
                        max="1000"
                        step="50"
                        value={autoplaySpeed}
                        onChange={(e) => setAutoplaySpeed(Number(e.target.value))}
                        className="w-full h-1 bg-slate-850 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                      />
                    </div>

                    <button
                      onClick={playMacro}
                      disabled={status === 'autoplaying' || macroSourceNew === macroTargetNew}
                      className="w-full py-3 px-4 bg-gradient-to-r from-cyan-500 to-indigo-650 hover:from-cyan-400 hover:to-indigo-555 disabled:opacity-40 text-white rounded-2xl text-xs font-black tracking-widest transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Cpu className="w-4 h-4" />
                      立即釋放能量重現 (Play Macro)
                    </button>
                  </div>

                </div>
              )}

            </div>
          </div>
        </section>

      </main>

      {/* FOOTER METRICS INFO */}
      <footer className="border-t border-white/5 bg-slate-950/50 backdrop-blur-md text-slate-500 text-center py-5 text-[11px] font-mono select-none relative z-15">
        <p>3D Towers of Hanoi Engine © 遞迴河內塔 3D 高度逼真渲染版</p>
        <p className="text-slate-600 mt-1 font-sans">使用 10 關漸漸難度 探索遞迴物理學之美</p>
        <div className="flex items-center justify-center gap-4 mt-3 text-[10px] text-slate-500/80">
          <span>總瀏覽量: <span id="vercount_value_site_pv" className="text-cyan-400 font-bold">--</span> 次</span>
          <span className="w-1 h-1 bg-slate-800 rounded-full"></span>
          <span>訪客人數: <span id="vercount_value_site_uv" className="text-indigo-400 font-bold">--</span> 人</span>
        </div>
      </footer>

      {/* MODAL WINDOWS */}
      
      {/* 1. Rules explains */}
      {showRules && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900/95 border border-white/10 backdrop-blur-2xl rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl relative">
            <button
              onClick={() => setShowRules(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-all"
            >
              <X className="w-5 h-5" />
            </button>

            <header className="space-y-1">
              <h3 className="text-base font-extrabold text-slate-200 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-emerald-400" />
                河內塔 3D 規則說明
              </h3>
              <p className="text-xs text-slate-400">
                本遊戲完美結合經典難題與電腦程式設計思維！
              </p>
            </header>

            <div className="text-xs text-slate-300 space-y-3 font-serif leading-relaxed max-h-[350px] overflow-y-auto pr-2">
              <section className="space-y-1 bg-slate-950/40 p-3 rounded-lg border border-slate-800/80">
                <h4 className="font-bold text-sky-400">💡 經典規則：</h4>
                <p>1. 您的目標：將所有盤子從 <strong>柱 1 (左，藍色起始柱)</strong> 完全轉移至 <strong>柱 3 (右，紫色目標柱)</strong>。</p>
                <p>2. 一次只能移動最上方的一個盤子。</p>
                <p>3. <strong>核心限制：</strong>任何時候，較大的盤子永遠不能放置在較小的盤子之上。</p>
                <p>4. 盤子共 $N$ 個的關卡，數學上的最少移動步數為 $2^N - 1$ 步。</p>
                <p>5. <strong>柱子顏色說明：</strong>左側起始柱為<strong>藍色</strong>，中間過渡柱為<strong>金色</strong>，右側目標柱為<strong>紫色</strong>，以利於快速辨識。</p>
              </section>

              <section className="space-y-1.5 bg-slate-950/40 p-3 rounded-lg border border-slate-800/80">
                <h4 className="font-bold text-sky-400">🚀 遞迴巨集動能（Level 4 解鎖）：</h4>
                <p>
                  當盤子越來越多 (例如 L6 的 8 個盤子到 L10 的 12 個盤子時，至少高達 $4095$ 步！)，此時手工搬運會變得極為繁瑣。本遊戲為此設計了獨創的<strong>「巨集錄製與同構位移轉換」</strong>功能：
                </p>
                <p className="pl-2 border-l-2 border-indigo-500 text-indigo-300">
                  河內塔的解答公式本質上具有高度的<strong>「遞迴自相似性」</strong>：
                  <br />
                  要移動 $n$ 個盤子，一定是：先遞迴移動 $n-1$ 個盤子，移王牌，最後再遞迴疊上 $n-1$ 個盤子。
                </p>
                <p>
                  <strong>如何使用：</strong>
                  <br />
                  一、先點擊 <strong>開始錄製</strong>。<br />
                  二、將最上面的兩（或三、四）個盤子，手動完整地搬移到另一個柱子，然後按下 <strong>儲存錄製</strong>。<br />
                  三、此時，你可以選擇該巨集，並指定 <strong>新來源</strong> 與 <strong>新目標</strong>。系統會根據您指定的柱子方向<strong>對稱重現對應的動作</strong>！這樣你就能一鍵轉移大型子樹，輕鬆攻略 12 層盤子的終極神話關卡！
                </p>
              </section>
            </div>

            <button
              onClick={() => setShowRules(false)}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all border border-slate-700"
            >
              我明白了，立即挑戰
            </button>
          </div>
        </div>
      )}

      {/* 2. Welcome Intro */}
      {showWelcome && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900/90 border border-white/10 backdrop-blur-2xl rounded-3xl max-w-md w-full p-6 text-center space-y-5 shadow-2xl relative">
            <div className="w-14 h-14 bg-gradient-to-tr from-sky-400 to-indigo-500 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-indigo-500/10">
              <Cpu className="w-8 h-8 text-white animate-pulse" />
            </div>

            <div className="space-y-1">
              <h3 className="text-xl font-bold tracking-tight text-white">3D 河內塔：遞迴演算法之境</h3>
              <p className="text-[11px] text-indigo-300 font-mono">10 大關卡 ➔ 結合 3D 渲染與巨集自相似同構</p>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed max-w-sm mx-auto font-serif">
              您好！這是一個新型態的 3D 河內塔科學放置遊戲。
              <br />
              前 3 關供您手動熟悉基本搬運，而從 <strong>第 4 關 (6層盤子)</strong> 起，您將被解下能束枷鎖，解鎖<strong>「遞迴動能複製器」</strong>—— 藉由拷貝並旋轉您的子操作，您將像真正的演算法程序一樣，一鍵解決極致數千步的多盤難題！
            </p>

            <button
              onClick={() => {
                setShowWelcome(false);
                // Warm up Audio Context
                sounds.init();
              }}
              className="w-full py-3 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-sky-500/20"
            >
              啟動遞迴矩陣 (開始遊戲)
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
