"use client"

import { useState, useCallback, useEffect, useRef } from "react"

// --- Types ---
type Difficulty = "easy" | "medium" | "hard"
type GameState = "idle" | "playing" | "won" | "lost"
type CellState = "hidden" | "revealed" | "flagged"

interface Cell {
  isMine: boolean
  isGoldenRetriever: boolean
  isBottle: boolean
  adjacentMines: number
  state: CellState
  treat: string
}

interface DifficultyConfig {
  rows: number
  cols: number
  mines: number
  label: string
}

const DIFFICULTIES: Record<Difficulty, DifficultyConfig> = {
  easy: { rows: 9, cols: 9, mines: 10, label: "EASY" },
  medium: { rows: 16, cols: 16, mines: 40, label: "MEDIUM" },
  hard: { rows: 16, cols: 30, mines: 99, label: "HARD" },
}

const TREATS = ["+", "*", "~", "."]

function getRandomTreat(): string {
  return TREATS[Math.floor(Math.random() * TREATS.length)]
}

// --- Vaco Face (image-based) ---
function VacoFace({ expression, size = 40 }: { expression: "idle" | "nervous" | "win" | "loss"; size?: number }) {
  const filters: Record<string, string> = {
    idle: "none",
    nervous: "saturate(0.5) brightness(0.85)",
    win: "brightness(1.15) saturate(1.2)",
    loss: "grayscale(0.7) brightness(0.6)",
  }

  return (
    <img
      src="/images/vaco-face.jpeg"
      alt={`Vaco the dog - ${expression}`}
      width={size}
      height={size}
      className="block"
      style={{
        imageRendering: "pixelated",
        filter: filters[expression],
        transition: "filter 0.2s ease",
      }}
    />
  )
}

// --- Board Creation ---
function createBoard(rows: number, cols: number, mines: number, firstClickRow?: number, firstClickCol?: number): Cell[][] {
  const board: Cell[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({
      isMine: false,
      isGoldenRetriever: false,
      isBottle: false,
      adjacentMines: 0,
      state: "hidden" as CellState,
      treat: getRandomTreat(),
    }))
  )

  const excludeSet = new Set<string>()
  if (firstClickRow !== undefined && firstClickCol !== undefined) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = firstClickRow + dr
        const nc = firstClickCol + dc
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
          excludeSet.add(`${nr},${nc}`)
        }
      }
    }
  }

  let placed = 0
  while (placed < mines) {
    const r = Math.floor(Math.random() * rows)
    const c = Math.floor(Math.random() * cols)
    if (!board[r][c].isMine && !excludeSet.has(`${r},${c}`)) {
      board[r][c].isMine = true
      placed++
    }
  }

  const minePositions: [number, number][] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (board[r][c].isMine) minePositions.push([r, c])
    }
  }
  if (minePositions.length > 0) {
    const [gr, gc] = minePositions[Math.floor(Math.random() * minePositions.length)]
    board[gr][gc].isGoldenRetriever = true
  }

  const safeTiles: [number, number][] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!board[r][c].isMine) safeTiles.push([r, c])
    }
  }
  if (safeTiles.length > 0) {
    const [br, bc] = safeTiles[Math.floor(Math.random() * safeTiles.length)]
    board[br][bc].isBottle = true
    board[br][bc].treat = "B"
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (board[r][c].isMine) continue
      let count = 0
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue
          const nr = r + dr
          const nc = c + dc
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && board[nr][nc].isMine) {
            count++
          }
        }
      }
      board[r][c].adjacentMines = count
    }
  }

  return board
}

// --- Number colors for adjacent counts (monochrome + accent) ---
const NUMBER_COLORS: Record<number, string> = {
  1: "#E8E8E8",
  2: "#A0A0A0",
  3: "#E8734A",
  4: "#808080",
  5: "#E8734A",
  6: "#A0A0A0",
  7: "#E8E8E8",
  8: "#606060",
}

// --- Zoomies animation component ---
function ZoomiesAnimation() {
  return (
    <div className="relative w-full h-12 overflow-hidden my-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="absolute font-mono text-xs tracking-widest"
          style={{
            animation: `zoomie 2s ease-in-out infinite`,
            animationDelay: `${i * 0.5}s`,
            top: `${4 + Math.sin(i * 1.5) * 14}px`,
            color: "#E8E8E8",
          }}
        >
          {'>>VACO>>'}
        </div>
      ))}
    </div>
  )
}

// --- Main Game Component ---
export default function Vacoweeper() {
  const [difficulty, setDifficulty] = useState<Difficulty>("easy")
  const [board, setBoard] = useState<Cell[][]>([])
  const [gameState, setGameState] = useState<GameState>("idle")
  const [timer, setTimer] = useState(0)
  const [isMouseDown, setIsMouseDown] = useState(false)
  const [score, setScore] = useState(0)
  const [hitGoldenRetriever, setHitGoldenRetriever] = useState(false)
  const [firstClick, setFirstClick] = useState(true)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTriggeredRef = useRef(false)

  const config = DIFFICULTIES[difficulty]

  const flagCount = board.flat().filter((c) => c.state === "flagged").length
  const pillsRemaining = config.mines - flagCount

  const initBoard = useCallback(() => {
    const newBoard = createBoard(config.rows, config.cols, config.mines)
    setBoard(newBoard)
    setGameState("idle")
    setTimer(0)
    setScore(0)
    setHitGoldenRetriever(false)
    setFirstClick(true)
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [config])

  useEffect(() => {
    initBoard()
  }, [initBoard])

  useEffect(() => {
    if (gameState === "playing") {
      timerRef.current = setInterval(() => {
        setTimer((prev) => Math.min(prev + 1, 999))
      }, 1000)
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [gameState])

  const checkWin = useCallback(
    (currentBoard: Cell[][]) => {
      for (let r = 0; r < config.rows; r++) {
        for (let c = 0; c < config.cols; c++) {
          const cell = currentBoard[r][c]
          if (!cell.isMine && cell.state !== "revealed") return false
        }
      }
      return true
    },
    [config]
  )

  const floodReveal = useCallback(
    (boardCopy: Cell[][], r: number, c: number) => {
      if (r < 0 || r >= config.rows || c < 0 || c >= config.cols) return
      if (boardCopy[r][c].state !== "hidden") return
      if (boardCopy[r][c].isMine) return

      boardCopy[r][c].state = "revealed"

      if (boardCopy[r][c].isBottle) {
        setScore((prev) => prev + 100)
      }

      if (boardCopy[r][c].adjacentMines === 0) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue
            floodReveal(boardCopy, r + dr, c + dc)
          }
        }
      }
    },
    [config]
  )

  const handleCellClick = useCallback(
    (r: number, c: number) => {
      if (gameState === "won" || gameState === "lost") return

      const cell = board[r][c]
      if (cell.state === "revealed" || cell.state === "flagged") return

      let currentBoard = board.map((row) => row.map((cell) => ({ ...cell })))

      if (firstClick) {
        currentBoard = createBoard(config.rows, config.cols, config.mines, r, c)
        setFirstClick(false)
        setGameState("playing")
      } else if (gameState === "idle") {
        setGameState("playing")
      }

      if (currentBoard[r][c].isMine) {
        currentBoard[r][c].state = "revealed"
        for (let rr = 0; rr < config.rows; rr++) {
          for (let cc = 0; cc < config.cols; cc++) {
            if (currentBoard[rr][cc].isMine) {
              currentBoard[rr][cc].state = "revealed"
            }
          }
        }
        setBoard(currentBoard)
        setHitGoldenRetriever(currentBoard[r][c].isGoldenRetriever)
        setGameState("lost")
        return
      }

      floodReveal(currentBoard, r, c)
      setBoard(currentBoard)

      if (checkWin(currentBoard)) {
        setGameState("won")
      }
    },
    [board, gameState, firstClick, config, floodReveal, checkWin]
  )

  const handleCellRightClick = useCallback(
    (e: React.MouseEvent, r: number, c: number) => {
      e.preventDefault()
      if (gameState === "won" || gameState === "lost") return

      const cell = board[r][c]
      if (cell.state === "revealed") return

      if (gameState === "idle") {
        setGameState("playing")
      }

      const newBoard = board.map((row) => row.map((cell) => ({ ...cell })))
      if (newBoard[r][c].state === "flagged") {
        newBoard[r][c].state = "hidden"
      } else {
        newBoard[r][c].state = "flagged"
      }
      setBoard(newBoard)
    },
    [board, gameState]
  )

  const handleTouchStart = useCallback(
    (r: number, c: number) => {
      longPressTriggeredRef.current = false
      longPressRef.current = setTimeout(() => {
        longPressTriggeredRef.current = true
        if (gameState === "won" || gameState === "lost") return
        const cell = board[r][c]
        if (cell.state === "revealed") return
        if (gameState === "idle") setGameState("playing")
        const newBoard = board.map((row) => row.map((cell) => ({ ...cell })))
        newBoard[r][c].state = newBoard[r][c].state === "flagged" ? "hidden" : "flagged"
        setBoard(newBoard)
      }, 400)
    },
    [board, gameState]
  )

  const handleTouchEnd = useCallback(() => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current)
      longPressRef.current = null
    }
  }, [])

  const handleCellClickWrapper = useCallback(
    (r: number, c: number) => {
      if (longPressTriggeredRef.current) {
        longPressTriggeredRef.current = false
        return
      }
      handleCellClick(r, c)
    },
    [handleCellClick]
  )

  const faceExpression =
    gameState === "won" ? "win" : gameState === "lost" ? "loss" : isMouseDown ? "nervous" : "idle"

  const formatNum = (n: number) => String(Math.max(0, Math.min(999, n))).padStart(3, "0")

  return (
    <div
      className="flex flex-col items-center justify-center min-h-svh p-4 select-none"
      style={{
        backgroundImage: `url('/images/vaco-spots-bg.jpeg')`,
        backgroundSize: "400px",
        backgroundRepeat: "repeat",
        imageRendering: "pixelated",
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Main game panel */}
      <div
        className="flex flex-col w-full max-w-fit"
        style={{
          background: "#0a0a0a",
          border: "1px solid rgba(255,255,255,0.15)",
        }}
      >
        {/* Title bar */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.15)" }}
        >
          <div className="flex items-center gap-3">
            <span
              className="font-mono text-[10px] tracking-[0.2em] uppercase"
              style={{ color: "rgba(255,255,255,0.4)" }}
            >
              {'//PROJECT:'}
            </span>
            <h1
              className="font-mono text-lg md:text-2xl font-bold tracking-[0.15em] uppercase"
              style={{ color: "#E8E8E8" }}
            >
              VACOWEEPER
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: gameState === "playing" ? "#E8734A" : gameState === "won" ? "#4AE87A" : gameState === "lost" ? "#E84A4A" : "rgba(255,255,255,0.3)",
              }}
            />
            <span
              className="font-mono text-[10px] tracking-widest uppercase"
              style={{ color: "rgba(255,255,255,0.4)" }}
            >
              {gameState === "idle" ? "READY" : gameState === "playing" ? "LIVE" : gameState === "won" ? "CLEAR" : "FAIL"}
            </span>
          </div>
        </div>

        {/* Difficulty selector row */}
        <div
          className="flex items-center"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.15)" }}
        >
          {(Object.keys(DIFFICULTIES) as Difficulty[]).map((d, i) => (
            <button
              key={d}
              onClick={() => setDifficulty(d)}
              className="flex-1 py-3 font-mono text-xs md:text-sm tracking-[0.15em] uppercase cursor-pointer transition-colors"
              style={{
                background: difficulty === d ? "rgba(232,115,74,0.15)" : "transparent",
                color: difficulty === d ? "#E8734A" : "rgba(255,255,255,0.4)",
                borderRight: i < 2 ? "1px solid rgba(255,255,255,0.15)" : "none",
                borderBottom: difficulty === d ? "2px solid #E8734A" : "2px solid transparent",
                minHeight: "48px",
              }}
            >
              {DIFFICULTIES[d].label}
            </button>
          ))}
        </div>

        {/* Stats row: pills | face | timer */}
        <div
          className="flex items-center"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.15)" }}
        >
          {/* Mine counter */}
          <div
            className="flex-1 flex flex-col items-center justify-center py-3"
            style={{ borderRight: "1px solid rgba(255,255,255,0.15)" }}
          >
            <span
              className="font-mono text-[10px] tracking-[0.15em] uppercase"
              style={{ color: "rgba(255,255,255,0.35)" }}
            >
              PILLS
            </span>
            <span
              className="font-mono text-xl md:text-2xl font-bold tracking-[0.2em]"
              style={{ color: "#E8E8E8" }}
            >
              {formatNum(pillsRemaining)}
            </span>
          </div>

          {/* Vaco face button */}
          <div
            className="flex items-center justify-center px-4 py-2"
            style={{ borderRight: "1px solid rgba(255,255,255,0.15)" }}
          >
            <button
              onClick={initBoard}
              className="cursor-pointer flex items-center justify-center"
              style={{
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.2)",
                padding: "3px",
                width: "52px",
                height: "52px",
                minWidth: "48px",
                minHeight: "48px",
              }}
              onMouseDown={() => setIsMouseDown(true)}
              onMouseUp={() => setIsMouseDown(false)}
              onMouseLeave={() => setIsMouseDown(false)}
              aria-label="New game"
            >
              <VacoFace expression={faceExpression} size={44} />
            </button>
          </div>

          {/* Timer */}
          <div className="flex-1 flex flex-col items-center justify-center py-3">
            <span
              className="font-mono text-[10px] tracking-[0.15em] uppercase"
              style={{ color: "rgba(255,255,255,0.35)" }}
            >
              TIME
            </span>
            <span
              className="font-mono text-xl md:text-2xl font-bold tracking-[0.2em]"
              style={{ color: "#E8E8E8" }}
            >
              {formatNum(timer)}
            </span>
          </div>
        </div>

        {/* Score indicator */}
        {score > 0 && (
          <div
            className="flex items-center justify-center py-2 font-mono text-[11px] tracking-[0.15em] uppercase"
            style={{
              color: "#E8734A",
              borderBottom: "1px solid rgba(255,255,255,0.15)",
            }}
          >
            {'BOTTLE BONUS: +'}{score}{' PTS'}
          </div>
        )}

        {/* Game board */}
        <div
          style={{
            overflow: "auto",
            maxWidth: "calc(100vw - 32px)",
          }}
        >
          <div
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${config.cols}, minmax(24px, 28px))`,
              gap: 0,
              width: "fit-content",
            }}
          >
            {board.map((row, r) =>
              row.map((cell, c) => {
                const isRevealed = cell.state === "revealed"
                const isFlagged = cell.state === "flagged"
                const isMine = cell.isMine
                const isHitMine = isRevealed && isMine

                return (
                  <button
                    key={`${r}-${c}`}
                    className="flex items-center justify-center cursor-pointer p-0 font-mono"
                    style={{
                      width: "100%",
                      aspectRatio: "1",
                      minWidth: "24px",
                      minHeight: "24px",
                      maxWidth: "28px",
                      maxHeight: "28px",
                      fontSize: "12px",
                      fontWeight: "bold",
                      lineHeight: 1,
                      background: isHitMine
                        ? "rgba(232,74,74,0.2)"
                        : isRevealed
                          ? "rgba(255,255,255,0.03)"
                          : "rgba(255,255,255,0.06)",
                      border: isRevealed
                        ? "1px solid rgba(255,255,255,0.05)"
                        : "1px solid rgba(255,255,255,0.12)",
                      color: NUMBER_COLORS[cell.adjacentMines] || "#E8E8E8",
                      transition: "background 0.1s ease",
                    }}
                    onClick={() => handleCellClickWrapper(r, c)}
                    onContextMenu={(e) => handleCellRightClick(e, r, c)}
                    onMouseDown={() => {
                      if (cell.state === "hidden") setIsMouseDown(true)
                    }}
                    onMouseUp={() => setIsMouseDown(false)}
                    onMouseLeave={() => setIsMouseDown(false)}
                    onTouchStart={() => handleTouchStart(r, c)}
                    onTouchEnd={handleTouchEnd}
                    onTouchCancel={handleTouchEnd}
                    aria-label={`Cell ${r}, ${c}${isFlagged ? " flagged" : ""}`}
                  >
                    {isFlagged && (
                      <span style={{ color: "#E8734A" }}>{"F"}</span>
                    )}
                    {isRevealed && isMine && (
                      <span style={{ color: cell.isGoldenRetriever ? "#FFD700" : "#E84A4A" }}>
                        {cell.isGoldenRetriever ? "G" : "X"}
                      </span>
                    )}
                    {isRevealed && !isMine && (
                      <>
                        {cell.adjacentMines > 0 ? (
                          <span>{cell.adjacentMines}</span>
                        ) : cell.isBottle ? (
                          <span style={{ color: "#E8734A" }}>{"B"}</span>
                        ) : (
                          <span style={{ color: "rgba(255,255,255,0.08)" }}>{cell.treat}</span>
                        )}
                      </>
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Mobile hint footer */}
        <div
          className="py-2 text-center font-mono text-[10px] tracking-[0.15em] uppercase md:hidden"
          style={{
            color: "rgba(255,255,255,0.3)",
            borderTop: "1px solid rgba(255,255,255,0.15)",
          }}
        >
          TAP TO REVEAL / LONG PRESS TO FLAG
        </div>
      </div>

      {/* Win / Loss Overlay */}
      {(gameState === "won" || gameState === "lost") && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: "rgba(0,0,0,0.85)" }}
          onClick={initBoard}
        >
          <div
            className="flex flex-col items-center mx-4 max-w-sm w-full"
            style={{
              background: "#0a0a0a",
              border: "1px solid rgba(255,255,255,0.15)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Overlay title bar */}
            <div
              className="w-full text-center py-3 font-mono text-xs tracking-[0.2em] uppercase font-bold"
              style={{
                background: gameState === "won" ? "rgba(74,232,122,0.1)" : "rgba(232,74,74,0.1)",
                color: gameState === "won" ? "#4AE87A" : "#E84A4A",
                borderBottom: `1px solid ${gameState === "won" ? "rgba(74,232,122,0.2)" : "rgba(232,74,74,0.2)"}`,
              }}
            >
              {gameState === "won" ? "// VICTORY" : "// GAME OVER"}
            </div>

            {/* Face */}
            <div className="flex justify-center py-6">
              <div style={{ border: "1px solid rgba(255,255,255,0.15)", padding: "4px" }}>
                <VacoFace expression={gameState === "won" ? "win" : "loss"} size={100} />
              </div>
            </div>

            {/* Message */}
            {gameState === "won" && (
              <div
                className="w-full px-6 pb-4"
                style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}
              >
                <ZoomiesAnimation />
                <p
                  className="text-center font-mono text-xs tracking-[0.1em] uppercase py-2"
                  style={{ color: "#4AE87A" }}
                >
                  ALL TREATS COLLECTED. NO MEDICINE TODAY.
                </p>
                {score > 0 && (
                  <p
                    className="text-center font-mono text-[10px] tracking-[0.1em] uppercase"
                    style={{ color: "rgba(255,255,255,0.4)" }}
                  >
                    {'BOTTLE BONUS: +'}{score}{' PTS | TIME: '}{timer}{'S'}
                  </p>
                )}
              </div>
            )}

            {gameState === "lost" && (
              <div
                className="w-full px-6 pb-4"
                style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}
              >
                <div
                  className="text-center font-mono text-2xl py-3 animate-bounce"
                  style={{ color: "#E84A4A" }}
                >
                  {hitGoldenRetriever ? "G" : "X"}
                </div>
                <p
                  className="text-center font-mono text-xs tracking-[0.1em] uppercase py-2"
                  style={{ color: "#E84A4A" }}
                >
                  {hitGoldenRetriever
                    ? "VACO FROZE IN HORROR... A GOLDEN RETRIEVER!"
                    : "VACO GOT HIS MEDICINE... HE IS NOT HAPPY."}
                </p>
              </div>
            )}

            {/* Play again button */}
            <button
              onClick={initBoard}
              className="w-full py-3 font-mono text-xs tracking-[0.2em] uppercase font-bold cursor-pointer transition-colors"
              style={{
                background: "rgba(232,115,74,0.1)",
                color: "#E8734A",
                borderTop: "1px solid rgba(232,115,74,0.2)",
                minHeight: "48px",
              }}
            >
              {'PLAY AGAIN >'}
            </button>
          </div>
        </div>
      )}

      {/* Zoomies keyframe animation */}
      <style>{`
        @keyframes zoomie {
          0% { left: -60px; transform: scaleX(1); }
          45% { left: calc(100% + 60px); transform: scaleX(1); }
          50% { left: calc(100% + 60px); transform: scaleX(-1); }
          95% { left: -60px; transform: scaleX(-1); }
          100% { left: -60px; transform: scaleX(1); }
        }
      `}</style>
    </div>
  )
}
