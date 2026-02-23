"use client"

import { useState, useCallback, useEffect, useRef } from "react"

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type CellState = "hidden" | "revealed" | "flagged"
interface Cell {
  isMine: boolean
  isGoldenRetriever: boolean
  isBottle: boolean
  adjacentMines: number
  state: CellState
  treat: string
}

type Difficulty = "easy" | "medium" | "hard"
type GameState = "idle" | "playing" | "won" | "lost"

const CONFIGS: Record<Difficulty, { rows: number; cols: number; mines: number }> = {
  easy: { rows: 9, cols: 9, mines: 10 },
  medium: { rows: 16, cols: 16, mines: 40 },
  hard: { rows: 16, cols: 30, mines: 99 },
}

const TREATS = [".", ",", "`", "'", "~"]

const NUMBER_COLORS: Record<number, string> = {
  1: "#6BA4E8",
  2: "#4AE87A",
  3: "#E8734A",
  4: "#A46BE8",
  5: "#E84A4A",
  6: "#4AE8D4",
  7: "#E8E8E8",
  8: "#888888",
}

// Cell size is always fixed at 28px for visual consistency
const CELL_SIZE = 28

// ---------------------------------------------------------------------------
// Haptic feedback helper
// ---------------------------------------------------------------------------
function haptic(pattern: number | number[] = 12) {
  try { navigator?.vibrate?.(pattern) } catch {}
}

// ---------------------------------------------------------------------------
// Moo sound helper — generates a short synth "moo" via Web Audio API
// ---------------------------------------------------------------------------
function playMoo() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = "sawtooth"
    osc.frequency.setValueAtTime(120, ctx.currentTime)
    osc.frequency.linearRampToValueAtTime(85, ctx.currentTime + 0.35)
    osc.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.55)
    gain.gain.setValueAtTime(0.25, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.1)
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.65)
    // Second harmonic for richness
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.type = "sine"
    osc2.frequency.setValueAtTime(240, ctx.currentTime)
    osc2.frequency.linearRampToValueAtTime(170, ctx.currentTime + 0.35)
    osc2.frequency.linearRampToValueAtTime(200, ctx.currentTime + 0.55)
    gain2.gain.setValueAtTime(0.08, ctx.currentTime)
    gain2.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6)
    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    osc2.start(ctx.currentTime)
    osc2.stop(ctx.currentTime + 0.65)
  } catch {}
}

// ---------------------------------------------------------------------------
// VacoFace — uses the attached pixel art image
// ---------------------------------------------------------------------------

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
      className="block"
      style={{ imageRendering: "pixelated", filter: filters[expression], transition: "filter 0.2s ease" }}
    />
  )
}

// ---------------------------------------------------------------------------
// Corner bracket decorators
// ---------------------------------------------------------------------------

function CornerBrackets({
  color = "rgba(232,115,74,0.5)",
  size = 12,
  thickness = 1,
  offset = 0,
  squares = false,
}: {
  color?: string
  size?: number
  thickness?: number
  offset?: number
  squares?: boolean
}) {
  const s = `${size}px`
  const b = `${thickness}px solid ${color}`
  const o = offset
  const sq = squares ? 4 : 0

  return (
    <>
      {/* Top-left */}
      <span className="absolute pointer-events-none" style={{ top: o, left: o, width: s, height: s, borderTop: b, borderLeft: b }} aria-hidden="true" />
      {/* Top-right */}
      <span className="absolute pointer-events-none" style={{ top: o, right: o, width: s, height: s, borderTop: b, borderRight: b }} aria-hidden="true" />
      {/* Bottom-left */}
      <span className="absolute pointer-events-none" style={{ bottom: o, left: o, width: s, height: s, borderBottom: b, borderLeft: b }} aria-hidden="true" />
      {/* Bottom-right */}
      <span className="absolute pointer-events-none" style={{ bottom: o, right: o, width: s, height: s, borderBottom: b, borderRight: b }} aria-hidden="true" />
      {/* Square markers at corners */}
      {sq > 0 && (
        <>
          <span className="absolute pointer-events-none" style={{ top: o - 2, left: o - 2, width: `${sq}px`, height: `${sq}px`, border: b }} aria-hidden="true" />
          <span className="absolute pointer-events-none" style={{ top: o - 2, right: o - 2, width: `${sq}px`, height: `${sq}px`, border: b }} aria-hidden="true" />
          <span className="absolute pointer-events-none" style={{ bottom: o - 2, left: o - 2, width: `${sq}px`, height: `${sq}px`, border: b }} aria-hidden="true" />
          <span className="absolute pointer-events-none" style={{ bottom: o - 2, right: o - 2, width: `${sq}px`, height: `${sq}px`, border: b }} aria-hidden="true" />
        </>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Main game component
// ---------------------------------------------------------------------------

export default function Vacoweeper() {
  const [difficulty, setDifficulty] = useState<Difficulty>("easy")
  const config = CONFIGS[difficulty]

  // Board creation
  const createBoard = useCallback((): Cell[][] => {
    const board: Cell[][] = Array.from({ length: config.rows }, () =>
      Array.from({ length: config.cols }, () => ({
        isMine: false,
        isGoldenRetriever: false,
        isBottle: false,
        adjacentMines: 0,
        state: "hidden" as CellState,
        treat: TREATS[Math.floor(Math.random() * TREATS.length)],
      }))
    )

    let placed = 0
    while (placed < config.mines) {
      const r = Math.floor(Math.random() * config.rows)
      const c = Math.floor(Math.random() * config.cols)
      if (!board[r][c].isMine) {
        board[r][c].isMine = true
        placed++
      }
    }

    // Golden retriever
    const mines = board.flatMap((row, r) => row.map((cell, c) => (cell.isMine ? { r, c } : null)).filter(Boolean)) as { r: number; c: number }[]
    if (mines.length > 0) {
      const gr = mines[Math.floor(Math.random() * mines.length)]
      board[gr.r][gr.c].isGoldenRetriever = true
    }

    // Bottle
    const safeCells = board.flatMap((row, r) => row.map((cell, c) => (!cell.isMine ? { r, c } : null)).filter(Boolean)) as { r: number; c: number }[]
    if (safeCells.length > 0) {
      const bt = safeCells[Math.floor(Math.random() * safeCells.length)]
      board[bt.r][bt.c].isBottle = true
    }

    // Adjacent mines
    for (let r = 0; r < config.rows; r++) {
      for (let c = 0; c < config.cols; c++) {
        if (board[r][c].isMine) continue
        let count = 0
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr, nc = c + dc
            if (nr >= 0 && nr < config.rows && nc >= 0 && nc < config.cols && board[nr][nc].isMine) count++
          }
        }
        board[r][c].adjacentMines = count
      }
    }
    return board
  }, [config.rows, config.cols, config.mines])

  const [board, setBoard] = useState<Cell[][]>(() => createBoard())
  const [gameState, setGameState] = useState<GameState>("idle")
  const [time, setTime] = useState(0)
  const [isMouseDown, setIsMouseDown] = useState(false)
  const [hitGoldenRetriever, setHitGoldenRetriever] = useState(false)
  const [firstClick, setFirstClick] = useState(true)
  const [round, setRound] = useState(1)
  const [gasBombAvailable, setGasBombAvailable] = useState(true)
  const [gasBombMode, setGasBombMode] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTriggeredRef = useRef(false)

  // Grid width in px
  const gridWidthPx = config.cols * CELL_SIZE

  // Init board
  const initBoard = useCallback(() => {
    setBoard(createBoard())
    setGameState("idle")
    setTime(0)
    setFirstClick(true)
    setHitGoldenRetriever(false)
    setGasBombAvailable(true)
    setGasBombMode(false)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    playMoo()
    haptic([30, 50, 30])
  }, [createBoard])

  const initBoardWithRound = useCallback(() => {
    if (gameState === "won" || gameState === "lost") {
      setRound((prev) => prev + 1)
    }
    initBoard()
  }, [initBoard, gameState])

  // Difficulty change
  useEffect(() => {
    initBoard()
  }, [difficulty, initBoard])

  // Timer
  useEffect(() => {
    if (gameState === "playing") {
      timerRef.current = setInterval(() => setTime((t) => Math.min(t + 1, 999)), 1000)
    } else if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [gameState])

  // Flood fill reveal
  const revealCell = useCallback(
    (b: Cell[][], r: number, c: number) => {
      if (r < 0 || r >= config.rows || c < 0 || c >= config.cols) return
      if (b[r][c].state !== "hidden") return
      b[r][c].state = "revealed"
      if (b[r][c].adjacentMines === 0 && !b[r][c].isMine) {
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) revealCell(b, r + dr, c + dc)
      }
    },
    [config.rows, config.cols]
  )

  // Cell click
  const handleCellClick = useCallback(
    (r: number, c: number) => {
      if (gameState === "won" || gameState === "lost") return
      const cell = board[r][c]
      if (cell.state === "flagged" || cell.state === "revealed") return

      let newBoard = board.map((row) => row.map((cell) => ({ ...cell })))

      // First click safety
      if (firstClick) {
        setFirstClick(false)
        while (newBoard[r][c].isMine) {
          newBoard = createBoard()
        }
        // Recalculate adjacent mines
        for (let rr = 0; rr < config.rows; rr++) {
          for (let cc = 0; cc < config.cols; cc++) {
            if (newBoard[rr][cc].isMine) continue
            let count = 0
            for (let dr = -1; dr <= 1; dr++)
              for (let dc = -1; dc <= 1; dc++) {
                const nr = rr + dr, nc = cc + dc
                if (nr >= 0 && nr < config.rows && nc >= 0 && nc < config.cols && newBoard[nr][nc].isMine) count++
              }
            newBoard[rr][cc].adjacentMines = count
          }
        }
        setGameState("playing")
      } else if (gameState === "idle") {
        setGameState("playing")
      }

      if (newBoard[r][c].isMine) {
        // Reveal all mines
        newBoard.forEach((row) => row.forEach((cell) => { if (cell.isMine) cell.state = "revealed" }))
        if (newBoard[r][c].isGoldenRetriever) setHitGoldenRetriever(true)
        setBoard(newBoard)
        setGameState("lost")
        return
      }

      revealCell(newBoard, r, c)
      setBoard(newBoard)

      // Check win
      const totalSafe = config.rows * config.cols - config.mines
      const revealed = newBoard.flat().filter((c) => c.state === "revealed" && !c.isMine).length
      if (revealed === totalSafe) setGameState("won")
    },
    [board, gameState, firstClick, createBoard, config, revealCell]
  )

  // Right-click flag
  const handleCellRightClick = useCallback(
    (e: React.MouseEvent, r: number, c: number) => {
      e.preventDefault()
      if (gameState === "won" || gameState === "lost") return
      const cell = board[r][c]
      if (cell.state === "revealed") return
      if (gameState === "idle") setGameState("playing")
      const newBoard = board.map((row) => row.map((cell) => ({ ...cell })))
      newBoard[r][c].state = newBoard[r][c].state === "flagged" ? "hidden" : "flagged"
      setBoard(newBoard)
    },
    [board, gameState]
  )

  // Touch long-press
  const handleTouchStart = useCallback(
    (r: number, c: number) => {
      longPressTriggeredRef.current = false
      longPressRef.current = setTimeout(() => {
        longPressTriggeredRef.current = true
        haptic([15, 30, 15])
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
    if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null }
  }, [])

  const handleCellClickWrapper = useCallback(
    (r: number, c: number) => {
      if (longPressTriggeredRef.current) { longPressTriggeredRef.current = false; return }
      haptic()
      // Gas bomb mode: safely reveal 3x3 area
      if (gasBombMode && gasBombAvailable) {
        if (gameState === "won" || gameState === "lost") return
        if (gameState === "idle") setGameState("playing")
        setGasBombAvailable(false)
        setGasBombMode(false)
        haptic([20, 40, 20, 40, 60])
        const newBoard = board.map((row) => row.map((cell) => ({ ...cell })))
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr, nc = c + dc
            if (nr >= 0 && nr < config.rows && nc >= 0 && nc < config.cols) {
              const target = newBoard[nr][nc]
              if (target.state === "hidden" && !target.isMine) {
                revealCell(newBoard, nr, nc)
              }
            }
          }
        }
        setBoard(newBoard)
        // Check win
        const totalSafe = config.rows * config.cols - config.mines
        const revealed = newBoard.flat().filter((c) => c.state === "revealed" && !c.isMine).length
        if (revealed === totalSafe) setGameState("won")
        return
      }
      handleCellClick(r, c)
    },
    [handleCellClick, gasBombMode, gasBombAvailable, board, gameState, config, revealCell]
  )

  // Derived state
  const flagCount = board.flat().filter((c) => c.state === "flagged").length
  const minesLeft = Math.max(0, config.mines - flagCount)

  const faceExpression: "idle" | "nervous" | "win" | "loss" =
    gameState === "won" ? "win"
    : gameState === "lost" ? "loss"
    : isMouseDown ? "nervous"
    : "idle"

  // Helpers
  const accent = "#E8734A"
  const borderW = "rgba(255,255,255,0.12)"
  const borderFaint = "rgba(255,255,255,0.06)"

  return (
    <div
      className="flex flex-col items-center justify-center min-h-svh p-2 select-none"
      style={{ backgroundColor: "#0a0a0a" }}
    >
      {/* Outer frame with corner brackets */}
      <div className="relative w-full" style={{ padding: "18px", maxWidth: "min(calc(100vw - 16px), 680px)" }}>
        {/* Outer large orange corner brackets + square markers */}
        <CornerBrackets color={accent} size={16} thickness={1} offset={0} squares />
        {/* Crosshair lines extending from edges */}
        <span className="absolute pointer-events-none" style={{ top: "50%", left: 0, width: "10px", height: "1px", background: borderFaint }} aria-hidden="true" />
        <span className="absolute pointer-events-none" style={{ top: "50%", right: 0, width: "10px", height: "1px", background: borderFaint }} aria-hidden="true" />
        <span className="absolute pointer-events-none" style={{ left: "50%", top: 0, width: "1px", height: "10px", background: borderFaint }} aria-hidden="true" />
        <span className="absolute pointer-events-none" style={{ left: "50%", bottom: 0, width: "1px", height: "10px", background: borderFaint }} aria-hidden="true" />

        {/* Main panel */}
        <div
          className="relative flex flex-col w-full"
          style={{ background: "#0a0a0a", border: `1px solid ${borderW}` }}
        >
          {/* Panel inner brackets */}
          <CornerBrackets color="rgba(255,255,255,0.06)" size={10} thickness={1} offset={3} />

          {/* Title bar */}
          <div
            className="flex items-center justify-between px-3 py-2"
            style={{ borderBottom: `1px solid ${borderFaint}` }}
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] tracking-[0.2em] uppercase" style={{ color: "rgba(255,255,255,0.3)" }}>
                {"//PROJECT:"}
              </span>
              <span className="font-mono text-base tracking-widest uppercase font-bold" style={{ color: "#E8E8E8" }}>
                {"VACOWEEPER"}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {/* Retro round counter */}
              <div
                className="relative flex items-center justify-center font-mono text-[10px] tracking-[0.15em] uppercase"
                style={{ border: `1px solid ${borderFaint}`, padding: "2px 6px", color: "rgba(255,255,255,0.35)" }}
              >
                <span className="absolute pointer-events-none" style={{ top: -1, left: -1, width: "3px", height: "3px", borderTop: `1px solid ${accent}`, borderLeft: `1px solid ${accent}` }} aria-hidden="true" />
                <span className="absolute pointer-events-none" style={{ bottom: -1, right: -1, width: "3px", height: "3px", borderBottom: `1px solid ${accent}`, borderRight: `1px solid ${accent}` }} aria-hidden="true" />
                {"RD."}{String(round).padStart(2, "0")}
              </div>
              {/* Status dot */}
              <div className="flex items-center gap-1.5">
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: gameState === "playing" ? accent : gameState === "won" ? "#4AE87A" : gameState === "lost" ? "#E84A4A" : "rgba(255,255,255,0.3)",
                    boxShadow: gameState === "playing" ? `0 0 6px ${accent}` : gameState === "won" ? "0 0 6px #4AE87A" : gameState === "lost" ? "0 0 6px #E84A4A" : "none",
                  }}
                />
                <span className="font-mono text-[10px] tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.35)" }}>
                  {gameState === "idle" ? "READY" : gameState === "playing" ? "LIVE" : gameState === "won" ? "CLEAR" : "FAIL"}
                </span>
              </div>
            </div>
          </div>

          {/* Difficulty tabs */}
          <div className="flex w-full" style={{ borderBottom: `1px solid ${borderFaint}` }}>
            {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
              <button
                key={d}
                onClick={() => { haptic(); setDifficulty(d) }}
                className="relative flex-1 py-2 font-mono text-xs tracking-[0.2em] uppercase cursor-pointer"
                style={{
                  background: "transparent",
                  color: d === difficulty ? accent : "rgba(255,255,255,0.3)",
                  border: "none",
                  borderBottom: d === difficulty ? `2px solid ${accent}` : "2px solid transparent",
                  transition: "color 0.15s, border-color 0.15s",
                }}
              >
                {d === difficulty && <CornerBrackets color={accent} size={6} thickness={1} offset={2} />}
                {d.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Stats bar: pills / face / time */}
          <div className="grid grid-cols-3 items-center" style={{ borderBottom: `1px solid ${borderFaint}` }}>
            {/* Pills counter */}
            <div className="relative flex flex-col items-center justify-center py-2" style={{ borderRight: `1px solid ${borderFaint}` }}>
              <CornerBrackets color={borderFaint} size={6} thickness={1} offset={4} />
              <span className="font-mono text-[9px] tracking-[0.2em] uppercase" style={{ color: "rgba(255,255,255,0.3)" }}>{"PILLS"}</span>
              <span className="font-mono text-lg tracking-[0.3em] font-bold" style={{ color: "#E8E8E8" }}>
                {String(minesLeft).padStart(3, "0")}
              </span>
            </div>
            {/* Vaco face */}
            <div className="flex items-center justify-center py-2">
              <button
                onClick={() => { haptic([20, 30, 20]); initBoardWithRound() }}
                className="relative cursor-pointer flex items-center justify-center"
                style={{ background: "transparent", border: `1px solid ${borderW}`, padding: "4px" }}
                aria-label="Reset game"
              >
                <CornerBrackets color={accent} size={5} thickness={1} offset={-2} />
                <VacoFace expression={faceExpression} size={36} />
              </button>
            </div>
            {/* Time counter */}
            <div className="relative flex flex-col items-center justify-center py-2" style={{ borderLeft: `1px solid ${borderFaint}` }}>
              <CornerBrackets color={borderFaint} size={6} thickness={1} offset={4} />
              <span className="font-mono text-[9px] tracking-[0.2em] uppercase" style={{ color: "rgba(255,255,255,0.3)" }}>{"TIME"}</span>
              <span className="font-mono text-lg tracking-[0.3em] font-bold" style={{ color: "#E8E8E8" }}>
                {String(time).padStart(3, "0")}
              </span>
            </div>
          </div>

          {/* Gas Bomb power-up */}
          <div className="flex items-center justify-center py-1.5 gap-3" style={{ borderBottom: `1px solid ${borderFaint}` }}>
            <button
              onClick={() => {
                if (!gasBombAvailable || gameState === "won" || gameState === "lost") return
                haptic(gasBombMode ? 8 : [15, 25, 15])
                setGasBombMode((prev) => !prev)
              }}
              className="relative flex items-center gap-2 font-mono text-[10px] tracking-[0.15em] uppercase cursor-pointer px-3 py-1.5"
              style={{
                background: gasBombMode ? "rgba(232,115,74,0.12)" : "transparent",
                border: `1px solid ${gasBombAvailable ? (gasBombMode ? accent : borderW) : borderFaint}`,
                color: gasBombAvailable ? (gasBombMode ? accent : "#E8E8E8") : "rgba(255,255,255,0.2)",
                opacity: gasBombAvailable ? 1 : 0.4,
                transition: "all 0.15s ease",
              }}
              disabled={!gasBombAvailable || gameState === "won" || gameState === "lost"}
              aria-label="Gas Bomb: reveal 3x3 area safely"
            >
              <CornerBrackets color={gasBombMode ? accent : "rgba(255,255,255,0.1)"} size={4} thickness={1} offset={-2} />
              <span style={{ fontSize: "14px", lineHeight: 1 }}>{"~"}</span>
              <span>{"GAS BOMB"}</span>
              {gasBombAvailable ? (
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: gasBombMode ? accent : "#4AE87A", boxShadow: gasBombMode ? `0 0 4px ${accent}` : "0 0 4px #4AE87A" }} />
              ) : (
                <span style={{ color: "rgba(255,255,255,0.2)" }}>{"USED"}</span>
              )}
            </button>
            {gasBombMode && (
              <span className="font-mono text-[9px] tracking-[0.15em] uppercase animate-pulse" style={{ color: accent }}>
                {"TAP A CELL TO DEPLOY"}
              </span>
            )}
          </div>

          {/* Game board -- scrolls horizontally when grid exceeds panel width */}
          <div
            className="relative"
            style={{
              overflowX: "auto",
              overflowY: "hidden",
              width: "100%",
              boxShadow: gasBombMode ? `inset 0 0 20px rgba(232,115,74,0.08)` : "none",
              transition: "box-shadow 0.2s ease",
            }}
          >
            <CornerBrackets color="rgba(232,115,74,0.3)" size={8} thickness={1} offset={4} />

            <div
              className="grid mx-auto"
              style={{
                gridTemplateColumns: `repeat(${config.cols}, ${CELL_SIZE}px)`,
                gap: 0,
                width: `${gridWidthPx}px`,
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
                      className={`flex items-center justify-center p-0 font-mono ${gasBombMode ? "cursor-crosshair" : "cursor-pointer"}`}
                      style={{
                        width: `${CELL_SIZE}px`,
                        height: `${CELL_SIZE}px`,
                        fontSize: "12px",
                        fontWeight: "bold",
                        lineHeight: 1,
                        background: isHitMine
                          ? "rgba(232,74,74,0.15)"
                          : isRevealed
                            ? "rgba(255,255,255,0.02)"
                            : "rgba(255,255,255,0.05)",
                        border: isRevealed
                          ? `1px solid rgba(255,255,255,0.04)`
                          : `1px solid rgba(255,255,255,0.1)`,
                        color: NUMBER_COLORS[cell.adjacentMines] || "#E8E8E8",
                        transition: "background 0.1s ease",
                      }}
                      onClick={() => handleCellClickWrapper(r, c)}
                      onContextMenu={(e) => handleCellRightClick(e, r, c)}
                      onMouseDown={() => { if (cell.state === "hidden") setIsMouseDown(true) }}
                      onMouseUp={() => setIsMouseDown(false)}
                      onMouseLeave={() => setIsMouseDown(false)}
                      onTouchStart={() => handleTouchStart(r, c)}
                      onTouchEnd={handleTouchEnd}
                      onTouchCancel={handleTouchEnd}
                      aria-label={`Cell ${r}, ${c}${isFlagged ? " flagged" : ""}`}
                    >
                      {isFlagged && <span style={{ color: accent }}>{"F"}</span>}
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
                            <span style={{ color: accent }}>{"B"}</span>
                          ) : (
                            <span style={{ color: "rgba(255,255,255,0.06)" }}>{cell.treat}</span>
                          )}
                        </>
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </div>

          {/* Footer hint */}
          <div className="flex items-center justify-center py-2" style={{ borderTop: `1px solid ${borderFaint}` }}>
            <span className="font-mono text-[9px] tracking-[0.2em] uppercase" style={{ color: "rgba(255,255,255,0.2)" }}>
              {gasBombMode ? "GAS BOMB ARMED -- TAP TARGET CELL" : "TAP TO REVEAL / LONG PRESS TO FLAG"}
            </span>
          </div>

          {/* Win / Loss overlay */}
          {(gameState === "won" || gameState === "lost") && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center z-20"
              style={{ background: "rgba(10,10,10,0.92)", backdropFilter: "blur(2px)" }}
            >
              <div className="relative flex flex-col items-center gap-4 p-6" style={{ border: `1px solid ${borderW}`, background: "#0a0a0a" }}>
                <CornerBrackets
                  color={gameState === "won" ? "#4AE87A" : "#E84A4A"}
                  size={14}
                  thickness={1}
                  offset={-4}
                  squares
                />
                <VacoFace expression={gameState === "won" ? "win" : "loss"} size={80} />
                <span
                  className="font-mono text-lg tracking-[0.3em] uppercase font-bold"
                  style={{ color: gameState === "won" ? "#4AE87A" : "#E84A4A" }}
                >
                  {gameState === "won"
                    ? "ALL CLEAR"
                    : hitGoldenRetriever
                      ? "GOLDEN RETRIEVER!"
                      : "GAME OVER"}
                </span>
                <span className="font-mono text-[10px] tracking-[0.15em] uppercase" style={{ color: "rgba(255,255,255,0.4)" }}>
                  {gameState === "won"
                    ? `COMPLETED IN ${time}s`
                    : hitGoldenRetriever
                      ? "VACO FROZE IN HORROR"
                      : "VACO ATE A PILL"}
                </span>
                {/* Round badge */}
                <div
                  className="relative font-mono text-[10px] tracking-[0.15em] uppercase"
                  style={{ border: `1px solid ${borderFaint}`, padding: "2px 8px", color: "rgba(255,255,255,0.35)" }}
                >
                  <span className="absolute pointer-events-none" style={{ top: -1, left: -1, width: "3px", height: "3px", borderTop: `1px solid ${accent}`, borderLeft: `1px solid ${accent}` }} aria-hidden="true" />
                  <span className="absolute pointer-events-none" style={{ bottom: -1, right: -1, width: "3px", height: "3px", borderBottom: `1px solid ${accent}`, borderRight: `1px solid ${accent}` }} aria-hidden="true" />
                  {"ROUND "}{String(round).padStart(2, "0")}
                </div>
                <button
                  onClick={() => { haptic([20, 30, 20]); initBoardWithRound() }}
                  className="relative font-mono text-xs tracking-[0.2em] uppercase cursor-pointer px-6 py-2.5"
                  style={{
                    background: "transparent",
                    border: `1px solid ${accent}`,
                    color: accent,
                    transition: "background 0.15s, color 0.15s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = accent; e.currentTarget.style.color = "#0a0a0a" }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = accent }}
                >
                  <CornerBrackets color={accent} size={5} thickness={1} offset={-3} />
                  {"PLAY AGAIN"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
