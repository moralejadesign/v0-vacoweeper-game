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
  easy: { rows: 9, cols: 9, mines: 10, label: "Easy" },
  medium: { rows: 16, cols: 16, mines: 40, label: "Medium" },
  hard: { rows: 16, cols: 30, mines: 99, label: "Hard" },
}

const TREATS = ["🥕", "🍌", "🥦", "🪵"]

function getRandomTreat(): string {
  return TREATS[Math.floor(Math.random() * TREATS.length)]
}

// --- Pixel Art Vaco Faces (SVG-based pixel art) ---
function VacoFace({ expression, size = 40 }: { expression: "idle" | "nervous" | "win" | "loss"; size?: number }) {
  const filters: Record<string, string> = {
    idle: "none",
    nervous: "saturate(0.5) brightness(0.95)",
    win: "brightness(1.1) saturate(1.2)",
    loss: "grayscale(0.6) brightness(0.8)",
  }

  return (
    <img
      src="/images/vaco-face.jpeg"
      alt={`Vaco the dog - ${expression}`}
      width={size}
      height={size}
      className="block rounded-sm"
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

  // Place mines, avoiding the first click area
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

  // Pick one random mine to be a golden retriever
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

  // Place one plastic bottle on a random non-mine tile
  const safeTiles: [number, number][] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!board[r][c].isMine) safeTiles.push([r, c])
    }
  }
  if (safeTiles.length > 0) {
    const [br, bc] = safeTiles[Math.floor(Math.random() * safeTiles.length)]
    board[br][bc].isBottle = true
    board[br][bc].treat = "🧴"
  }

  // Calculate adjacent mine counts
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

// --- Number colors for adjacent counts ---
const NUMBER_COLORS: Record<number, string> = {
  1: "#0000FF",
  2: "#008000",
  3: "#FF0000",
  4: "#000080",
  5: "#800000",
  6: "#008080",
  7: "#000000",
  8: "#808080",
}

// --- Zoomies animation component ---
function ZoomiesAnimation() {
  return (
    <div className="relative w-full h-20 overflow-hidden my-4">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="absolute text-3xl"
          style={{
            animation: `zoomie 1.5s ease-in-out infinite`,
            animationDelay: `${i * 0.3}s`,
            top: `${10 + Math.sin(i * 1.5) * 20}px`,
          }}
        >
          🐕
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

  // Count flags
  const flagCount = board.flat().filter((c) => c.state === "flagged").length
  const pillsRemaining = config.mines - flagCount

  // Initialize board
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

  // Timer
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

  // Check win condition
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

  // Flood fill reveal
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

  // Left click: reveal
  const handleCellClick = useCallback(
    (r: number, c: number) => {
      if (gameState === "won" || gameState === "lost") return

      const cell = board[r][c]
      if (cell.state === "revealed" || cell.state === "flagged") return

      let currentBoard = board.map((row) => row.map((cell) => ({ ...cell })))

      // On first click, regenerate board to ensure safe start
      if (firstClick) {
        currentBoard = createBoard(config.rows, config.cols, config.mines, r, c)
        setFirstClick(false)
        setGameState("playing")
      } else if (gameState === "idle") {
        setGameState("playing")
      }

      if (currentBoard[r][c].isMine) {
        // Game over
        currentBoard[r][c].state = "revealed"
        // Reveal all mines
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

  // Right click: flag
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

  // Touch long-press handlers for mobile flagging
  const handleTouchStart = useCallback(
    (r: number, c: number) => {
      longPressTriggeredRef.current = false
      longPressRef.current = setTimeout(() => {
        longPressTriggeredRef.current = true
        // Simulate right-click flag
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

  // Determine face expression
  const faceExpression =
    gameState === "won" ? "win" : gameState === "lost" ? "loss" : isMouseDown ? "nervous" : "idle"

  // Format number for display
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
      {/* Title */}
      <h1
        className="text-2xl md:text-4xl font-bold mb-4 tracking-wider text-center"
        style={{
          fontFamily: "monospace",
          color: "#fff",
          textShadow: "2px 2px 0px #000, -1px -1px 0px #000, 1px -1px 0px #000, -1px 1px 0px #000",
        }}
      >
        VACOWEEPER
      </h1>

      {/* Difficulty selector */}
      <div className="flex gap-2 mb-4">
        {(Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => (
          <button
            key={d}
            onClick={() => setDifficulty(d)}
            className="px-3 py-1.5 text-xs md:text-sm font-bold cursor-pointer transition-colors"
            style={{
              fontFamily: "monospace",
              background: difficulty === d ? "#000080" : "#C0C0C0",
              color: difficulty === d ? "#fff" : "#000",
              border: difficulty === d
                ? "2px inset #808080"
                : "2px outset #fff",
              minHeight: "44px",
              minWidth: "60px",
            }}
          >
            {DIFFICULTIES[d].label}
          </button>
        ))}
      </div>

      {/* Game container */}
      <div
        style={{
          background: "#C0C0C0",
          border: "3px outset #fff",
          padding: "6px",
        }}
      >
        {/* Header bar */}
        <div
          className="flex items-center justify-between mb-1.5"
          style={{
            background: "#C0C0C0",
            border: "2px inset #808080",
            padding: "4px 6px",
          }}
        >
          {/* Mine counter */}
          <div
            className="flex items-center gap-1.5"
            style={{
              background: "#000",
              padding: "2px 6px",
              border: "1px inset #808080",
              fontFamily: "monospace",
              color: "#FF0000",
              fontSize: "20px",
              fontWeight: "bold",
              letterSpacing: "2px",
              minWidth: "70px",
            }}
          >
            <span className="text-sm" style={{ color: "#fff" }}>
              {"💊"}
            </span>
            {formatNum(pillsRemaining)}
          </div>

          {/* Vaco face button */}
          <button
            onClick={initBoard}
            className="cursor-pointer flex items-center justify-center"
            style={{
              background: "#C0C0C0",
              border: "2px outset #fff",
              padding: "2px",
              width: "48px",
              height: "48px",
              minWidth: "48px",
              minHeight: "48px",
            }}
            onMouseDown={() => setIsMouseDown(true)}
            onMouseUp={() => setIsMouseDown(false)}
            onMouseLeave={() => setIsMouseDown(false)}
            aria-label="New game"
          >
            <VacoFace expression={faceExpression} />
          </button>

          {/* Timer */}
          <div
            className="flex items-center gap-1.5"
            style={{
              background: "#000",
              padding: "2px 6px",
              border: "1px inset #808080",
              fontFamily: "monospace",
              color: "#FF0000",
              fontSize: "20px",
              fontWeight: "bold",
              letterSpacing: "2px",
              minWidth: "70px",
            }}
          >
            <span className="text-sm" style={{ color: "#fff" }}>
              {"🐾"}
            </span>
            {formatNum(timer)}
          </div>
        </div>

        {/* Score indicator */}
        {score > 0 && (
          <div
            className="text-center mb-1"
            style={{
              fontFamily: "monospace",
              fontSize: "12px",
              color: "#000080",
              fontWeight: "bold",
            }}
          >
            {"🧴"} Bottle Bonus: +{score} pts
          </div>
        )}

        {/* Game board */}
        <div
          style={{
            border: "2px inset #808080",
            overflow: "auto",
            maxWidth: "calc(100vw - 40px)",
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
              row.map((cell, c) => (
                <button
                  key={`${r}-${c}`}
                  className="flex items-center justify-center cursor-pointer p-0"
                  style={{
                    width: "100%",
                    aspectRatio: "1",
                    minWidth: "24px",
                    minHeight: "24px",
                    maxWidth: "28px",
                    maxHeight: "28px",
                    fontFamily: "monospace",
                    fontSize: "14px",
                    fontWeight: "bold",
                    lineHeight: 1,
                    background:
                      cell.state === "revealed" ? "#D0D0D0" : "#C0C0C0",
                    border:
                      cell.state === "revealed"
                        ? "1px solid #808080"
                        : "2px outset #fff",
                    color: NUMBER_COLORS[cell.adjacentMines] || "#000",
                    imageRendering: "pixelated",
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
                  aria-label={`Cell ${r}, ${c}${cell.state === "flagged" ? " flagged" : ""}`}
                >
                  {cell.state === "flagged" && (
                    <span className="text-xs md:text-sm">{"🐕"}</span>
                  )}
                  {cell.state === "revealed" && cell.isMine && (
                    <span className="text-xs md:text-sm">
                      {cell.isGoldenRetriever ? "🐕" : "💊"}
                    </span>
                  )}
                  {cell.state === "revealed" && !cell.isMine && (
                    <>
                      {cell.adjacentMines > 0 ? (
                        <span>{cell.adjacentMines}</span>
                      ) : (
                        <span className="text-xs md:text-sm opacity-60">{cell.treat}</span>
                      )}
                    </>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Long press hint for mobile */}
      <p
        className="mt-3 text-center text-xs md:hidden"
        style={{
          fontFamily: "monospace",
          color: "#fff",
          textShadow: "1px 1px 0px #000",
        }}
      >
        Tap to reveal. Long press to flag.
      </p>

      {/* Win / Loss Overlay */}
      {(gameState === "won" || gameState === "lost") && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={initBoard}
        >
          <div
            className="flex flex-col items-center gap-4 p-6 mx-4 max-w-sm w-full"
            style={{
              background: "#C0C0C0",
              border: "3px outset #fff",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Title bar */}
            <div
              className="w-full text-center py-1 font-bold"
              style={{
                background: gameState === "won" ? "#000080" : "#800000",
                color: "#fff",
                fontFamily: "monospace",
                fontSize: "14px",
              }}
            >
              {gameState === "won" ? "VICTORY!" : "GAME OVER"}
            </div>

            {/* Face */}
            <div className="flex justify-center">
              <VacoFace expression={gameState === "won" ? "win" : "loss"} size={120} />
            </div>

            {/* Message */}
            {gameState === "won" && (
              <>
                <ZoomiesAnimation />
                <p
                  className="text-center font-bold text-sm md:text-base"
                  style={{ fontFamily: "monospace", color: "#008000" }}
                >
                  All treats collected! No medicine today!
                </p>
                {score > 0 && (
                  <p
                    className="text-center text-xs"
                    style={{ fontFamily: "monospace", color: "#000080" }}
                  >
                    Bottle Bonus: +{score} pts | Time: {timer}s
                  </p>
                )}
              </>
            )}

            {gameState === "lost" && (
              <>
                <div className="text-4xl animate-bounce">
                  {hitGoldenRetriever ? "🐕" : "💊"}
                </div>
                <p
                  className="text-center font-bold text-sm md:text-base"
                  style={{ fontFamily: "monospace", color: "#800000" }}
                >
                  {hitGoldenRetriever
                    ? "Vaco froze in horror... A GOLDEN RETRIEVER!"
                    : "Vaco got his medicine... he is NOT happy."}
                </p>
              </>
            )}

            {/* Play again */}
            <button
              onClick={initBoard}
              className="px-6 py-2 font-bold cursor-pointer text-sm"
              style={{
                fontFamily: "monospace",
                background: "#C0C0C0",
                border: "2px outset #fff",
                color: "#000",
                minHeight: "44px",
              }}
            >
              Play Again
            </button>
          </div>
        </div>
      )}

      {/* Zoomies keyframe animation */}
      <style>{`
        @keyframes zoomie {
          0% { left: -40px; transform: scaleX(1); }
          45% { left: calc(100% + 40px); transform: scaleX(1); }
          50% { left: calc(100% + 40px); transform: scaleX(-1); }
          95% { left: -40px; transform: scaleX(-1); }
          100% { left: -40px; transform: scaleX(1); }
        }
      `}</style>
    </div>
  )
}
