export interface Move {
  from: number;   // Peg index: 0, 1, 2
  to: number;     // Peg index: 0, 1, 2
  discSize: number; // Size of the disc moved
}

export interface Macro {
  id: string;
  name: string;
  moves: { from: number; to: number }[]; // Raw relative moves recorded
  discCount: number; // Number of discs this macro was recorded with
  sourcePeg: number; // Original source peg recorded
  targetPeg: number; // Original target peg recorded
}

export type GameStatus = 'idle' | 'playing' | 'win' | 'autoplaying';

export interface GameState {
  level: number;       // Current level, 1 to 10
  status: GameStatus;  // Current status
  pegs: number[][];    // 3 arrays of disc sizes, e.g. [[3, 2, 1], [], []]
  movesCount: number;  // Number of player moves in current game
  minMoves: number;    // Theoretical minimum moves (2^discCountRef - 1)
  discCount: number;   // Number of discs in this level (level + 2)
  selectedPeg: number | null; // Currently selected peg for move source
  isRecording: boolean;
  recordingMoves: { from: number; to: number }[];
  macros: Macro[];
}
