"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type CellState = "hidden" | "revealed" | "flagged"
interface Cell {
  isMine: boolean
  adjacentMines: number
  state: CellState
  treat: string
  isHitMine?: boolean // the mine the player clicked on
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

const MAX_CELL_SIZE = 28
const MIN_CELL_SIZE = 14
const UI_CHROME_HEIGHT = 300

// ---------------------------------------------------------------------------
// Leaderboard system
// ---------------------------------------------------------------------------

interface ScoreEntry {
  time: number
  rank: string
  date: string
}

type LeaderboardData = Record<Difficulty, ScoreEntry[]>

const RANK_THRESHOLDS: { max: number; rank: string }[] = [
  { max: 15, rank: "Supreme Snoot" },
  { max: 30, rank: "Turbo Pupper" },
  { max: 60, rank: "Alpha Bork" },
  { max: 90, rank: "Good Boy" },
  { max: 120, rank: "Treat Hunter" },
  { max: 180, rank: "Tail Chaser" },
  { max: 300, rank: "Belly Scratcher" },
  { max: 600, rank: "Lazy Paws" },
  { max: Infinity, rank: "Sleepy Pup" },
]

const MAX_SCORES_PER_DIFFICULTY = 5
const STORAGE_KEY = "vacoweeper-leaderboard"
const ONBOARDING_KEY = "vacoweeper-onboarding-done"
const PLAYER_NAME_KEY = "vacoweeper-player-name"
const MAX_NAME_LENGTH = 20

function getDogRank(time: number): string {
  return (RANK_THRESHOLDS.find((t) => time <= t.max) ?? RANK_THRESHOLDS[RANK_THRESHOLDS.length - 1]).rank
}

function loadLeaderboard(): LeaderboardData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return { easy: [], medium: [], hard: [] }
}

function saveScore(diff: Difficulty, time: number): ScoreEntry {
  const lb = loadLeaderboard()
  const entry: ScoreEntry = { time, rank: getDogRank(time), date: new Date().toLocaleDateString() }
  lb[diff] = [...lb[diff], entry].sort((a, b) => a.time - b.time).slice(0, MAX_SCORES_PER_DIFFICULTY)
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(lb)) } catch {}
  return entry
}

// ---------------------------------------------------------------------------
// Share result — messages & visual card
// ---------------------------------------------------------------------------

const WIN_MESSAGES: Record<Difficulty, string[]> = {
  easy: [
    "Vaco walked the park like a champ",
    "Easy peasy, belly squeezy",
    "Vaco didn't even break a pant",
  ],
  medium: [
    "Vaco sniffed out every last one",
    "Not a single garbage fooled this good boy",
    "Vaco's nose knows no limits",
  ],
  hard: [
    "Vaco is basically a bomb-sniffing legend",
    "They should give Vaco a medal",
    "Even the mailman is impressed",
  ],
}

const LOSS_MESSAGES: Record<Difficulty, string[]> = {
  easy: [
    "Vaco ate garbage on a casual stroll",
    "The easiest walk and Vaco still found trouble",
    "Rookie mistake, even for a puppy",
  ],
  medium: [
    "Vaco got too curious this time",
    "That garbage looked suspicious but Vaco went for it",
    "Vaco's nose betrayed him today",
  ],
  hard: [
    "Vaco fought bravely but the garbage won",
    "Hard mode is ruff, even for the best boys",
    "Vaco gave it everything... including his lunch",
  ],
}

function pickShareMessage(won: boolean, diff: Difficulty): string {
  const msgs = won ? WIN_MESSAGES[diff] : LOSS_MESSAGES[diff]
  return msgs[Math.floor(Math.random() * msgs.length)]
}

function ShareCard({
  won,
  diff,
  time,
  round,
  rank,
  message,
  board,
  onClose,
}: {
  won: boolean
  diff: Difficulty
  time: number
  round: number
  rank: string | null
  message: string
  board: Cell[][]
  onClose: () => void
}) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "shared">("idle")
  const [linkStatus, setLinkStatus] = useState<"idle" | "creating" | "copied">("idle")
  const accent = "#E8734A"
  const resultColor = won ? "#4AE87A" : "#E84A4A"
  const resultText = won ? "ALL CLEAR" : "GAME OVER"
  const subText = won ? `COMPLETED IN ${time}s` : "VACO ATE GARBAGE"
  const vacoSrc = won ? "/images/vaco-face.jpeg" : "/images/vaco-sad.jpg"

  const handleDownload = useCallback(async () => {
    setStatus("saving")
    try {
      const res = await fetch("/api/screenshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ won, difficulty: diff, time, round, rank, message, boardState: JSON.stringify(board) }),
      })
      if (!res.ok) throw new Error("Screenshot failed")
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "vacoweeper-result.png"
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setStatus("saved")
    } catch {
      setStatus("idle")
    }
    setTimeout(() => setStatus("idle"), 2500)
  }, [won, diff, time, round, rank, message, board])

  const handleShareLink = useCallback(async () => {
    if (linkStatus === "creating") return
    setLinkStatus("creating")
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ won, difficulty: diff, time, round, rank, message, boardState: JSON.stringify(board) }),
      })
      if (!res.ok) throw new Error("API error")
      const { id } = await res.json()
      const origin = window.location.origin
      const shareUrl = `${origin}/share/${id}`
      await navigator.clipboard.writeText(shareUrl)
      setLinkStatus("copied")
    } catch {
      setLinkStatus("idle")
    }
    setTimeout(() => setLinkStatus("idle"), 2500)
  }, [won, diff, time, round, rank, message, board, linkStatus])

  return (
    <motion.div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: "#0a0a0a" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="flex flex-col items-center gap-4"
        initial={{ scale: 0.85, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.85, opacity: 0, y: 20 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* The card itself */}
        <div
          style={{
            width: 360,
            padding: "32px 28px",
            background: "#0a0a0a",
            border: `1px solid ${resultColor}33`,
            position: "relative",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 14,
            fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
            overflow: "hidden",
          }}
        >
          {/* Corner accents */}
          {[
            { top: 0, left: 0, borderTop: `2px solid ${resultColor}`, borderLeft: `2px solid ${resultColor}` },
            { top: 0, right: 0, borderTop: `2px solid ${resultColor}`, borderRight: `2px solid ${resultColor}` },
            { bottom: 0, left: 0, borderBottom: `2px solid ${resultColor}`, borderLeft: `2px solid ${resultColor}` },
            { bottom: 0, right: 0, borderBottom: `2px solid ${resultColor}`, borderRight: `2px solid ${resultColor}` },
          ].map((s, i) => (
            <span key={i} style={{ position: "absolute", width: 16, height: 16, pointerEvents: "none", ...s }} />
          ))}

          {/* Title bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 10, letterSpacing: "0.2em", color: "rgba(255,255,255,0.3)", fontFamily: "inherit" }}>
              //PROJECT:
            </span>
            <span style={{ fontSize: 13, letterSpacing: "0.15em", color: "#E8E8E8", fontWeight: 700, fontFamily: "inherit" }}>
              VACOWEEPER
            </span>
          </div>

          {/* Vaco face */}
          <img
            src={vacoSrc}
            alt="Vaco"
            width={72}
            height={72}
            style={{ imageRendering: "pixelated", border: `1px solid ${resultColor}44` }}
          />

          {/* Result */}
          <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "0.3em", color: resultColor, textTransform: "uppercase" }}>
            {resultText}
          </span>

          {/* Sub text */}
          <span style={{ fontSize: 10, letterSpacing: "0.15em", color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>
            {subText}
          </span>

          {/* Stats row */}
          <div style={{
            display: "flex", gap: 16, marginTop: 4,
            padding: "8px 16px",
            border: `1px solid rgba(255,255,255,0.08)`,
            position: "relative",
          }}>
            {/* Mini corner brackets */}
            <span style={{ position: "absolute", top: -1, left: -1, width: 4, height: 4, borderTop: `1px solid ${accent}`, borderLeft: `1px solid ${accent}` }} />
            <span style={{ position: "absolute", bottom: -1, right: -1, width: 4, height: 4, borderBottom: `1px solid ${accent}`, borderRight: `1px solid ${accent}` }} />
            <div style={{ display: "flex", flexDirection: "column", textAlign: "center", gap: 2, minWidth: 48 }}>
              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em", display: "block" }}>MODE</span>
              <span style={{ fontSize: 13, color: accent, fontWeight: 600, letterSpacing: "0.15em", display: "block" }}>{diff.toUpperCase()}</span>
            </div>
            <div style={{ width: 1, background: "rgba(255,255,255,0.08)", alignSelf: "stretch" }} />
            <div style={{ display: "flex", flexDirection: "column", textAlign: "center", gap: 2, minWidth: 48 }}>
              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em", display: "block" }}>TIME</span>
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", fontWeight: 600, display: "block" }}>{time}s</span>
            </div>
            <div style={{ width: 1, background: "rgba(255,255,255,0.08)", alignSelf: "stretch" }} />
            <div style={{ display: "flex", flexDirection: "column", textAlign: "center", gap: 2, minWidth: 48 }}>
              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em", display: "block" }}>ROUND</span>
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", fontWeight: 600, display: "block" }}>{String(round).padStart(2, "0")}</span>
            </div>
          </div>

          {/* Rank (win only) */}
          {won && rank && (
            <div style={{
              padding: "4px 14px",
              border: `1px solid ${accent}`,
              color: accent,
              fontSize: 10,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              position: "relative",
            }}>
              <span style={{ position: "absolute", top: -1, left: -1, width: 4, height: 4, borderTop: `1px solid ${accent}`, borderLeft: `1px solid ${accent}` }} />
              <span style={{ position: "absolute", bottom: -1, right: -1, width: 4, height: 4, borderBottom: `1px solid ${accent}`, borderRight: `1px solid ${accent}` }} />
              RANK: {rank}
            </div>
          )}

          {/* Mini board */}
          {board.length > 0 && (() => {
            const cols = board[0]?.length ?? 9
            const cellPx = Math.max(6, Math.min(16, Math.floor(280 / cols)))
            const fontSize = Math.max(4, cellPx - 4)
            return (
              <table style={{ borderCollapse: "separate", borderSpacing: 1, margin: 0, padding: 0, tableLayout: "fixed" }}>
                <tbody>
                  {board.map((row, r) => (
                    <tr key={r}>
                      {row.map((cell, c) => {
                        let bg = "rgba(255,255,255,0.06)"
                        let borderColor = "rgba(255,255,255,0.1)"
                        let content = ""
                        let color = "transparent"
                          if (cell.state === "revealed") {
                                  bg = cell.isMine ? "rgba(232,74,74,0.18)" : "rgba(255,255,255,0.02)"
                                  borderColor = cell.isMine ? "rgba(232,74,74,0.3)" : "rgba(255,255,255,0.04)"
                                  if (cell.isMine) {
                                    content = "×"
                                    color = "#E84A4A"
                                  } else if (cell.adjacentMines > 0) {
                                    content = String(cell.adjacentMines)
                                    color = NUMBER_COLORS[cell.adjacentMines] || "#E8E8E8"
                                  } else {
                                    content = cell.treat
                                    color = "rgba(255,255,255,0.08)"
                                  }
                                } else if (cell.state === "flagged") {
                                  bg = "rgba(232,115,74,0.12)"
                                  borderColor = "rgba(232,115,74,0.35)"
                                  content = "▶"
                                  color = "#E8734A"
                                }
                                return (
                                  <td
                                    key={c}
                                    style={{
                                      width: cellPx,
                                      height: cellPx,
                                      background: bg,
                                      border: `1px solid ${borderColor}`,
                                      fontSize,
                                      color,
                                      textAlign: "center",
                                      verticalAlign: "middle",
                                      padding: 0,
                                      lineHeight: "1",
                                    }}
                                  >
                                    {content}
                                  </td>
                                )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          })()}

          {/* Funny message */}
          <span style={{
            fontSize: 10,
            color: "rgba(255,255,255,0.45)",
            textAlign: "center",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            lineHeight: 1.6,
            maxWidth: 280,
            marginTop: 2,
          }}>
            &ldquo;{message}&rdquo;
          </span>

          {/* URL */}
          <span style={{ fontSize: 9, letterSpacing: "0.2em", color: "rgba(255,255,255,0.2)", marginTop: 4, textTransform: "uppercase" }}>
            vacoweeper.vercel.app
          </span>
        </div>

        {/* Buttons below the card (not captured) */}
        <div className="flex flex-wrap justify-center gap-3">
          <motion.button
            onClick={handleDownload}
            className="relative font-mono text-xs tracking-[0.2em] uppercase cursor-pointer px-5 py-2.5"
            style={{ background: "transparent", border: `1px solid ${accent}`, color: accent }}
            whileHover={{ scale: 1.05, backgroundColor: accent, color: "#0a0a0a" }}
            whileTap={{ scale: 0.95 }}
          >
            <AnimatePresence mode="wait">
              <motion.span
                key={status}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
              >
                {status === "saving" ? "GENERATING..." : status === "saved" ? "SAVED!" : status === "shared" ? "SHARED!" : "DOWNLOAD"}
              </motion.span>
            </AnimatePresence>
          </motion.button>
          <motion.button
            onClick={handleShareLink}
            className="relative font-mono text-xs tracking-[0.2em] uppercase cursor-pointer px-5 py-2.5"
            style={{ background: "transparent", border: `1px solid ${resultColor}`, color: resultColor }}
            whileHover={{ scale: 1.05, backgroundColor: resultColor, color: "#0a0a0a" }}
            whileTap={{ scale: 0.95 }}
          >
            <AnimatePresence mode="wait">
              <motion.span
                key={linkStatus}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
              >
                {linkStatus === "creating" ? "CREATING..." : linkStatus === "copied" ? "LINK COPIED!" : "SHARE LINK"}
              </motion.span>
            </AnimatePresence>
          </motion.button>
          <motion.button
            onClick={onClose}
            className="font-mono text-xs tracking-[0.2em] uppercase cursor-pointer px-5 py-2.5"
            style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.4)" }}
            whileHover={{ scale: 1.05, borderColor: "rgba(255,255,255,0.3)", color: "rgba(255,255,255,0.7)" }}
            whileTap={{ scale: 0.95 }}
          >
            CLOSE
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Haptic feedback helper
// ---------------------------------------------------------------------------
function haptic(pattern: number | number[] = 12) {
  try { navigator?.vibrate?.(pattern) } catch {}
}

// ---------------------------------------------------------------------------
// Moo sound helper — plays the custom MP3 bark/moo sound
// ---------------------------------------------------------------------------
function playMoo() {
  try {
    const audio = new Audio("/vaco-bark.mp3")
    audio.volume = 0.4
    audio.play().catch(() => {})
  } catch {}
}

function playLoss() {
  try {
    const audio = new Audio("/vaco-bark-loss.mp3")
    audio.volume = 0.6
    audio.play().catch(() => {})
  } catch {}
}

function playWin() {
  try {
    const audio = new Audio("/vaco-win.mp3")
    audio.volume = 0.6
    audio.play().catch(() => {})
  } catch {}
}

// ---------------------------------------------------------------------------
// VacoFace — uses the attached pixel art image
// ---------------------------------------------------------------------------

function VacoFace({ expression, size = 40 }: { expression: "idle" | "nervous" | "win" | "loss"; size?: number }) {
  const src = expression === "loss" ? "/images/vaco-sad.jpg" : "/images/vaco-face.jpeg"
  const filters: Record<string, string> = {
    idle: "none",
    nervous: "saturate(0.5) brightness(0.95)",
    win: "brightness(1.1) saturate(1.2)",
    loss: "none",
  }
  return (
    <img
      src={src}
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
// Onboarding overlay
// ---------------------------------------------------------------------------

function Onboarding({ onDone }: { onDone: () => void }) {
  const [slide, setSlide] = useState(0)
  const [dir, setDir] = useState(1)
  const TOTAL = 3
  const accent = "#E8734A"

  const handleDone = useCallback(() => {
    try { localStorage.setItem(ONBOARDING_KEY, "1") } catch {}
    onDone()
  }, [onDone])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleDone() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [handleDone])

  const goNext = () => {
    if (slide < TOTAL - 1) { setDir(1); setSlide(slide + 1) }
    else handleDone()
  }

  const goBack = () => {
    if (slide > 0) { setDir(-1); setSlide(slide - 1) }
  }

  const titles = ["WHAT IS THIS?", "HOW TO PLAY", "SECRET WEAPONS"]

  const exampleGrid = [
    [
      { content: "2", color: "#4AE87A", bg: "rgba(255,255,255,0.02)", bc: "rgba(255,255,255,0.04)" },
      { content: "×", color: "#E84A4A", bg: "rgba(232,74,74,0.18)", bc: "rgba(232,74,74,0.3)" },
      { content: "", color: "transparent", bg: "rgba(255,255,255,0.06)", bc: "rgba(255,255,255,0.1)" },
    ],
    [
      { content: "▶", color: "#E8734A", bg: "rgba(232,115,74,0.12)", bc: "rgba(232,115,74,0.35)" },
      { content: "1", color: "#6BA4E8", bg: "rgba(255,255,255,0.02)", bc: "rgba(255,255,255,0.04)" },
      { content: "", color: "transparent", bg: "rgba(255,255,255,0.06)", bc: "rgba(255,255,255,0.1)" },
    ],
    [
      { content: "", color: "transparent", bg: "rgba(255,255,255,0.06)", bc: "rgba(255,255,255,0.1)" },
      { content: "", color: "transparent", bg: "rgba(255,255,255,0.06)", bc: "rgba(255,255,255,0.1)" },
      { content: "", color: "transparent", bg: "rgba(255,255,255,0.06)", bc: "rgba(255,255,255,0.1)" },
    ],
  ]

  return (
    <motion.div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      style={{ background: "rgba(10,10,10,0.92)", backdropFilter: "blur(8px)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={handleDone}
    >
      <motion.div
        className="relative flex flex-col w-full"
        style={{ maxWidth: 320, background: "#0a0a0a", border: `1px solid ${accent}44` }}
        initial={{ scale: 0.88, opacity: 0, y: 24 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.88, opacity: 0, y: 24 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
        onClick={(e) => e.stopPropagation()}
      >
        <CornerBrackets color={accent} size={12} thickness={1} offset={-4} squares />

        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-2.5"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase" style={{ color: "rgba(255,255,255,0.3)" }}>
            {"//HOW TO PLAY"}
          </span>
          <button
            onClick={handleDone}
            className="font-mono text-[9px] tracking-[0.15em] uppercase cursor-pointer px-2 py-0.5"
            style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.3)" }}
          >
            {"SKIP"}
          </button>
        </div>

        {/* Slide content */}
        <div style={{ position: "relative", overflow: "hidden", minHeight: 228 }}>
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div
              key={slide}
              custom={dir}
              variants={{
                enter: (d: number) => ({ x: d > 0 ? 60 : -60, opacity: 0 }),
                center: { x: 0, opacity: 1 },
                exit: (d: number) => ({ x: d > 0 ? -60 : 60, opacity: 0 }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.22, ease: "easeInOut" }}
              className="flex flex-col items-center gap-4 px-5 py-5 text-center"
            >
              <VacoFace expression={slide === 2 ? "win" : slide === 1 ? "nervous" : "idle"} size={52} />
              <span className="font-mono text-[12px] font-bold tracking-[0.2em] uppercase" style={{ color: "#E8E8E8" }}>
                {titles[slide]}
              </span>

              {slide === 0 && (
                <>
                  <span className="font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.45)", maxWidth: 240, lineHeight: 1.7 }}>
                    {"Vaco the dog explores the park. Reveal all safe tiles without stepping on hidden garbage pills!"}
                  </span>
                  <div className="flex items-center gap-5">
                    <div className="flex items-center gap-1.5">
                      <div style={{ width: 22, height: 22, background: "rgba(232,74,74,0.18)", border: "1px solid rgba(232,74,74,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#E84A4A", fontFamily: "monospace" }}>{"×"}</div>
                      <span className="font-mono text-[9px] uppercase" style={{ color: "rgba(255,255,255,0.3)" }}>{"GARBAGE"}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div style={{ width: 22, height: 22, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#4AE87A", fontFamily: "monospace" }}>{"✓"}</div>
                      <span className="font-mono text-[9px] uppercase" style={{ color: "rgba(255,255,255,0.3)" }}>{"SAFE"}</span>
                    </div>
                  </div>
                </>
              )}

              {slide === 1 && (
                <>
                  <div className="flex flex-col gap-2 text-left w-full" style={{ maxWidth: 240 }}>
                    {([
                      ["CLICK", "Reveal a tile"],
                      ["LONG PRESS", "Flag suspicious tile"],
                      ["NUMBERS", "Adjacent garbage count"],
                    ] as const).map(([key, val]) => (
                      <div key={key} className="flex items-center gap-3">
                        <span className="font-mono text-[9px] tracking-[0.05em] uppercase" style={{ color: accent, minWidth: 76, flexShrink: 0 }}>{key}</span>
                        <span className="font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>{val}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {exampleGrid.map((row, r) => (
                      <div key={r} style={{ display: "flex", gap: 2 }}>
                        {row.map((cell, c) => (
                          <div
                            key={c}
                            style={{ width: 22, height: 22, background: cell.bg, border: `1px solid ${cell.bc}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: cell.color, fontFamily: "monospace", fontWeight: "bold" }}
                          >{cell.content}</div>
                        ))}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {slide === 2 && (
                <div className="flex flex-col gap-3 w-full text-left" style={{ maxWidth: 240 }}>
                  {([
                    { icon: "~", label: "GAS BOMB", desc: "Reveals a 3×3 area safely. One use per game!" },
                  ] as const).map(({ icon, label, desc }) => (
                    <div key={label} className="flex items-start gap-3">
                      <div style={{ width: 22, height: 22, background: "rgba(232,115,74,0.12)", border: `1px solid ${accent}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: accent, flexShrink: 0, fontFamily: "monospace", fontWeight: "bold" }}>{icon}</div>
                      <div>
                        <span className="block font-mono text-[9px] tracking-[0.1em] uppercase" style={{ color: accent }}>{label}</span>
                        <span className="block font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>{desc}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Dot indicators */}
        <div className="flex justify-center gap-2 py-2">
          {Array.from({ length: TOTAL }).map((_, i) => (
            <span
              key={i}
              style={{ width: 5, height: 5, borderRadius: "50%", background: i === slide ? accent : "rgba(255,255,255,0.15)", display: "inline-block", transition: "background 0.2s" }}
            />
          ))}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between px-4 pb-4 pt-1" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <motion.button
            onClick={goBack}
            disabled={slide === 0}
            className="font-mono text-[9px] tracking-[0.15em] uppercase px-3 py-1.5"
            style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: slide === 0 ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.4)", cursor: slide === 0 ? "not-allowed" : "pointer" }}
            whileHover={slide > 0 ? { scale: 1.05 } : undefined}
            whileTap={slide > 0 ? { scale: 0.95 } : undefined}
          >
            {"BACK"}
          </motion.button>
          <motion.button
            onClick={goNext}
            className="relative font-mono text-[9px] tracking-[0.15em] uppercase px-4 py-1.5 cursor-pointer"
            style={{ background: "transparent", border: `1px solid ${accent}`, color: accent }}
            whileHover={{ scale: 1.05, backgroundColor: accent, color: "#0a0a0a" }}
            whileTap={{ scale: 0.95 }}
          >
            <CornerBrackets color={accent} size={4} thickness={1} offset={-2} />
            {slide === TOTAL - 1 ? "LET'S GO! 🐾" : "NEXT"}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Name entry screen
// ---------------------------------------------------------------------------

function NameEntry({ onDone }: { onDone: (name: string) => void }) {
  const [name, setName] = useState("")
  const accent = "#E8734A"
  const trimmed = name.trim()
  const isValid = trimmed.length > 0 && trimmed.length <= MAX_NAME_LENGTH

  const handleSubmit = () => {
    if (!isValid) return
    try { localStorage.setItem(PLAYER_NAME_KEY, trimmed) } catch {}
    onDone(trimmed)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") handleSubmit()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name])

  return (
    <motion.div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      style={{ background: "#0a0a0a" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="relative flex flex-col items-center gap-5 p-8 w-full"
        style={{ maxWidth: 320, border: `1px solid ${accent}44`, background: "#0a0a0a" }}
        initial={{ scale: 0.88, opacity: 0, y: 24 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.88, opacity: 0, y: 24 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
      >
        <CornerBrackets color={accent} size={12} thickness={1} offset={-4} squares />

        <VacoFace expression="idle" size={56} />

        <div className="flex flex-col items-center gap-1 text-center">
          <span className="font-mono text-sm font-bold tracking-[0.2em] uppercase" style={{ color: "#E8E8E8" }}>
            WHAT&apos;S YOUR NAME?
          </span>
          <span className="font-mono text-[10px] tracking-[0.1em]" style={{ color: "rgba(255,255,255,0.35)" }}>
            SHOWN ON THE GLOBAL LEADERBOARD
          </span>
        </div>

        <div className="relative w-full">
          <input
            autoFocus
            type="text"
            value={name}
            maxLength={MAX_NAME_LENGTH}
            onChange={(e) => setName(e.target.value)}
            placeholder="ENTER NAME..."
            className="w-full font-mono text-sm tracking-[0.1em] uppercase bg-transparent outline-none text-center py-2 px-3"
            style={{
              border: `1px solid ${isValid ? accent : "rgba(255,255,255,0.15)"}`,
              color: "#E8E8E8",
              caretColor: accent,
              transition: "border-color 0.15s",
            }}
          />
          <span
            className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[9px]"
            style={{ color: "rgba(255,255,255,0.25)" }}
          >
            {trimmed.length}/{MAX_NAME_LENGTH}
          </span>
        </div>

        <motion.button
          onClick={handleSubmit}
          disabled={!isValid}
          className="relative w-full font-mono text-xs tracking-[0.2em] uppercase cursor-pointer py-2.5"
          style={{
            background: "transparent",
            border: `1px solid ${isValid ? accent : "rgba(255,255,255,0.1)"}`,
            color: isValid ? accent : "rgba(255,255,255,0.2)",
            transition: "border-color 0.15s, color 0.15s",
          }}
          whileHover={isValid ? { scale: 1.03, backgroundColor: accent, color: "#0a0a0a" } : undefined}
          whileTap={isValid ? { scale: 0.97 } : undefined}
        >
          {isValid && <CornerBrackets color={accent} size={5} thickness={1} offset={-3} />}
          LET&apos;S GO
        </motion.button>
      </motion.div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Main game component
// ---------------------------------------------------------------------------

export default function Vacoweeper() {
  const [audioUnlocked, setAudioUnlocked] = useState(false)
  const [playerName, setPlayerName] = useState<string | null>(null)
  const [showNameEntry, setShowNameEntry] = useState(false)
  const [difficulty, setDifficulty] = useState<Difficulty>("easy")
  const config = CONFIGS[difficulty]

  // Board creation
  const createBoard = useCallback((): Cell[][] => {
    const board: Cell[][] = Array.from({ length: config.rows }, () =>
      Array.from({ length: config.cols }, () => ({
        isMine: false,
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
const [firstClick, setFirstClick] = useState(true)
  const [round, setRound] = useState(1)
  const [gasBombAvailable, setGasBombAvailable] = useState(true)
  const [gasBombMode, setGasBombMode] = useState(false)
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [leaderboard, setLeaderboard] = useState<LeaderboardData>({ easy: [], medium: [], hard: [] })
  const [scoreTab, setScoreTab] = useState<"local" | "global">("local")
  const [globalScores, setGlobalScores] = useState<{ playerName: string; time: number; rank: string }[]>([])
  const [globalLoading, setGlobalLoading] = useState(false)
  const [lastRank, setLastRank] = useState<string | null>(null)
  const [showShareCard, setShowShareCard] = useState(false)
  const [shareMessage, setShareMessage] = useState("")
  const [showOnboarding, setShowOnboarding] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTriggeredRef = useRef(false)

  const maxContainerWidth = difficulty === "hard" ? 960 : 680

  const [cellSize, setCellSize] = useState(MAX_CELL_SIZE)
  useEffect(() => {
    const compute = () => {
      const containerInner = Math.min(window.innerWidth - 16, maxContainerWidth) - 38
      const availableH = window.innerHeight - UI_CHROME_HEIGHT
      const byW = Math.floor(containerInner / config.cols)
      const byH = Math.floor(availableH / config.rows)
      setCellSize(Math.max(MIN_CELL_SIZE, Math.min(MAX_CELL_SIZE, byW, byH)))
    }
    compute()
    window.addEventListener("resize", compute)
    return () => window.removeEventListener("resize", compute)
  }, [config.cols, config.rows, maxContainerWidth])

  const gridWidthPx = config.cols * cellSize

  // Init board
  const initBoard = useCallback(() => {
    setBoard(createBoard())
    setGameState("idle")
    setTime(0)
    setFirstClick(true)
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

  // Load leaderboard on mount
  useEffect(() => { setLeaderboard(loadLeaderboard()) }, [])

  // Load global scores when tab becomes visible
  useEffect(() => {
    if (!showLeaderboard || scoreTab !== "global") return
    setGlobalLoading(true)
    fetch(`/api/scores?difficulty=${difficulty}`)
      .then((r) => r.json())
      .then((data) => setGlobalScores(data.scores ?? []))
      .catch(() => setGlobalScores([]))
      .finally(() => setGlobalLoading(false))
  }, [showLeaderboard, scoreTab, difficulty])

  // Allow pressing Enter to dismiss the splash screen
  useEffect(() => {
    if (audioUnlocked) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        haptic([20, 40, 20])
        const audio = new Audio("/vaco-bark.mp3")
        audio.volume = 0.4
        audio.play().catch(() => {})
        setAudioUnlocked(true)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [audioUnlocked])

  // Load player name and show name entry if not set (after audio unlock)
  useEffect(() => {
    if (!audioUnlocked) return
    try {
      const saved = localStorage.getItem(PLAYER_NAME_KEY)
      if (saved) {
        setPlayerName(saved)
      } else {
        setShowNameEntry(true)
      }
    } catch {
      setShowNameEntry(true)
    }
  }, [audioUnlocked])

  // Show onboarding on first visit (after name is set)
  useEffect(() => {
    if (!playerName) return
    try {
      if (!localStorage.getItem(ONBOARDING_KEY)) setShowOnboarding(true)
    } catch {}
  }, [playerName])

  // Record score on win
  useEffect(() => {
    if (gameState === "won" && time > 0) {
      const entry = saveScore(difficulty, time)
      setLeaderboard(loadLeaderboard())
      setLastRank(entry.rank)
      // Post to global leaderboard if player has a name
      if (playerName) {
        fetch("/api/scores", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerName, difficulty, time, rank: entry.rank }),
        }).catch(() => {})
      }
    } else if (gameState !== "won") {
      setLastRank(null)
      setShowShareCard(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, time, difficulty])

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

      // First click safety: guarantee the clicked cell AND its 8 neighbors are mine-free.
      // createBoard() already computes adjacentMines, so no need to recalculate here.
      if (firstClick) {
        setFirstClick(false)
        const isSafeZone = (b: Cell[][]) => {
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              const nr = r + dr, nc = c + dc
              if (nr >= 0 && nr < config.rows && nc >= 0 && nc < config.cols && b[nr][nc].isMine) return false
            }
          }
          return true
        }
        while (!isSafeZone(newBoard)) {
          newBoard = createBoard()
        }
        setGameState("playing")
      }
      // Note: the case firstClick===false && gameState==="idle" is unreachable in practice,
      // since both are set together on the first click. No else branch needed.

      if (newBoard[r][c].isMine) {
        // Reveal all mines and mark the one the player hit
        newBoard.forEach((row) => row.forEach((cell) => { if (cell.isMine) cell.state = "revealed" }))
        newBoard[r][c].isHitMine = true
        setBoard(newBoard)
        setGameState("lost")
        playLoss()
        return
      }

      revealCell(newBoard, r, c)
      setBoard(newBoard)

      // Check win
      const totalSafe = config.rows * config.cols - config.mines
      const revealed = newBoard.flat().filter((cell) => cell.state === "revealed" && !cell.isMine).length
      if (revealed === totalSafe) { setGameState("won"); playWin() }
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
      haptic([10, 20, 10])
      // Flagging before the first real click should NOT start the timer.
      // Only start playing (and timer) if the player has already clicked a cell.
      if (gameState === "idle" && !firstClick) setGameState("playing")
      const newBoard = board.map((row) => row.map((cell) => ({ ...cell })))
      newBoard[r][c].state = newBoard[r][c].state === "flagged" ? "hidden" : "flagged"
      setBoard(newBoard)
    },
    [board, gameState, firstClick]
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
        // Same as right-click: only start timer if the player has already clicked a cell.
        if (gameState === "idle" && !firstClick) setGameState("playing")
        const newBoard = board.map((row) => row.map((cell) => ({ ...cell })))
        newBoard[r][c].state = newBoard[r][c].state === "flagged" ? "hidden" : "flagged"
        setBoard(newBoard)
      }, 400)
    },
    [board, gameState, firstClick]
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
        // Mark first click as done so subsequent clicks don't regenerate the board
        setFirstClick(false)
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
        if (revealed === totalSafe) { setGameState("won"); playWin() }
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

  const boardKey = `${difficulty}-${round}`

  if (showNameEntry) {
    return (
      <AnimatePresence>
        <NameEntry
          onDone={(name) => {
            setPlayerName(name)
            setShowNameEntry(false)
          }}
        />
      </AnimatePresence>
    )
  }

  if (!audioUnlocked) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-svh p-4 select-none overflow-hidden"
        style={{ backgroundColor: "#0a0a0a" }}
      >
        <motion.div
          className="relative flex flex-col items-center gap-6 p-8"
          style={{ border: `1px solid ${borderW}`, background: "#0a0a0a" }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <CornerBrackets color={accent} size={14} thickness={1} offset={-4} squares />
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5, type: "spring", stiffness: 120 }}
          >
            <VacoFace expression="idle" size={80} />
          </motion.div>
          <motion.span
            className="font-mono text-lg tracking-[0.3em] uppercase font-bold"
            style={{ color: "#E8E8E8" }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.4 }}
          >
            {"VACOWEEPER"}
          </motion.span>
          <motion.span
            className="font-mono text-[10px] tracking-[0.15em] uppercase text-center"
            style={{ color: "rgba(255,255,255,0.4)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7, duration: 0.4 }}
          >
            {"TAP TO ENABLE SOUND & START"}
          </motion.span>
          <motion.button
            onClick={() => {
              haptic([20, 40, 20])
              const audio = new Audio("/vaco-bark.mp3")
              audio.volume = 0.4
              audio.play().catch(() => {})
              setAudioUnlocked(true)
            }}
            className="relative font-mono text-xs tracking-[0.2em] uppercase cursor-pointer px-6 py-2.5"
            style={{
              background: "transparent",
              border: `1px solid ${accent}`,
              color: accent,
            }}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9, duration: 0.4 }}
            whileHover={{ scale: 1.05, backgroundColor: accent, color: "#0a0a0a" }}
            whileTap={{ scale: 0.95 }}
          >
            <CornerBrackets color={accent} size={5} thickness={1} offset={-3} />
            {"ENTER"}
          </motion.button>
        </motion.div>
      </div>
    )
  }

  return (
    <motion.div
      className="flex flex-col items-center justify-center min-h-svh p-2 select-none overflow-hidden"
      style={{ backgroundColor: "#0a0a0a" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* Outer frame with corner brackets */}
      <motion.div
        className="relative w-full"
        style={{ padding: "18px", maxWidth: `min(calc(100vw - 16px), ${maxContainerWidth}px)` }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
      >
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
              <span className="font-mono text-[13px] tracking-widest uppercase font-bold" style={{ color: "#E8E8E8" }}>
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
                <motion.div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: gameState === "playing" ? accent : gameState === "won" ? "#4AE87A" : gameState === "lost" ? "#E84A4A" : "rgba(255,255,255,0.3)",
                    boxShadow: gameState === "playing" ? `0 0 6px ${accent}` : gameState === "won" ? "0 0 6px #4AE87A" : gameState === "lost" ? "0 0 6px #E84A4A" : "none",
                  }}
                  animate={gameState === "playing" ? { scale: [1, 1.4, 1], opacity: [1, 0.7, 1] } : { scale: 1, opacity: 1 }}
                  transition={gameState === "playing" ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" } : { duration: 0.3 }}
                />
                <span className="font-mono text-[10px] tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.35)" }}>
                  {gameState === "idle" ? "READY" : gameState === "playing" ? "LIVE" : gameState === "won" ? "CLEAR" : "FAIL"}
                </span>
              </div>
              {/* Player name */}
              {playerName && (
                <motion.button
                  onClick={() => setShowNameEntry(true)}
                  className="font-mono text-[9px] tracking-[0.1em] uppercase cursor-pointer px-2 py-0.5 max-w-[80px] truncate"
                  style={{ background: "transparent", border: `1px solid ${borderFaint}`, color: "rgba(255,255,255,0.35)" }}
                  whileHover={{ scale: 1.05, borderColor: accent, color: accent }}
                  whileTap={{ scale: 0.95 }}
                  title={`Playing as ${playerName} — click to change`}
                >
                  {playerName}
                </motion.button>
              )}
              {/* Help button */}
              <motion.button
                onClick={() => setShowOnboarding(true)}
                className="font-mono text-[10px] cursor-pointer flex items-center justify-center"
                style={{ background: "transparent", border: `1px solid ${borderFaint}`, color: "rgba(255,255,255,0.3)", width: 18, height: 18 }}
                whileHover={{ scale: 1.15, borderColor: accent, color: accent }}
                whileTap={{ scale: 0.9 }}
                aria-label="How to play"
              >
                {"?"}
              </motion.button>
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

          {/* Stats bar: garbage / face / time */}
          <div className="grid grid-cols-3 items-center" style={{ borderBottom: `1px solid ${borderFaint}` }}>
            {/* Garbage counter */}
            <div className="relative flex flex-col items-center justify-center py-2" style={{ borderRight: `1px solid ${borderFaint}` }}>
              <CornerBrackets color={borderFaint} size={6} thickness={1} offset={4} />
              <span className="font-mono text-[9px] tracking-[0.2em] uppercase" style={{ color: "rgba(255,255,255,0.3)" }}>{"GARBAGE"}</span>
              <span className="font-mono text-lg tracking-[0.3em] font-bold" style={{ color: "#E8E8E8" }}>
                {String(minesLeft).padStart(3, "0")}
              </span>
            </div>
            {/* Vaco face */}
            <div className="flex items-center justify-center py-2">
              <motion.button
                onClick={() => { haptic([20, 30, 20]); initBoardWithRound() }}
                className="relative cursor-pointer flex items-center justify-center"
                style={{ background: "transparent", border: `1px solid ${borderW}`, padding: "4px" }}
                aria-label="Reset game"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9, rotate: 10 }}
                transition={{ type: "spring", stiffness: 300, damping: 15 }}
              >
                <CornerBrackets color={accent} size={5} thickness={1} offset={-2} />
                <VacoFace expression={faceExpression} size={36} />
              </motion.button>
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
            <motion.button
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
              }}
              animate={gasBombMode ? { boxShadow: `0 0 12px rgba(232,115,74,0.2)` } : { boxShadow: "0 0 0px rgba(232,115,74,0)" }}
              whileHover={gasBombAvailable ? { scale: 1.05 } : undefined}
              whileTap={gasBombAvailable ? { scale: 0.95 } : undefined}
              transition={{ duration: 0.2 }}
              disabled={!gasBombAvailable || gameState === "won" || gameState === "lost"}
              aria-label="Gas Bomb: reveal 3x3 area safely"
            >
              <CornerBrackets color={gasBombMode ? accent : "rgba(255,255,255,0.1)"} size={4} thickness={1} offset={-2} />
              <motion.span
                style={{ fontSize: "14px", lineHeight: 1 }}
                animate={gasBombMode ? { rotate: [0, -10, 10, -10, 0] } : { rotate: 0 }}
                transition={gasBombMode ? { duration: 0.5, repeat: Infinity, repeatDelay: 1.5 } : { duration: 0.2 }}
              >
                {"~"}
              </motion.span>
              <span>{"GAS BOMB"}</span>
              {gasBombAvailable ? (
                <motion.span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: gasBombMode ? accent : "#4AE87A", boxShadow: gasBombMode ? `0 0 4px ${accent}` : "0 0 4px #4AE87A" }}
                  animate={gasBombMode ? { scale: [1, 1.4, 1] } : { scale: 1 }}
                  transition={gasBombMode ? { duration: 1, repeat: Infinity } : { duration: 0.2 }}
                />
              ) : (
                <span style={{ color: "rgba(255,255,255,0.2)" }}>{"USED"}</span>
              )}
            </motion.button>
            {gasBombMode && (
              <span className="font-mono text-[9px] tracking-[0.15em] uppercase animate-pulse" style={{ color: accent }}>
                {"TAP A CELL TO DEPLOY"}
              </span>
            )}
          </div>

          {/* Game board */}
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

            <AnimatePresence mode="wait">
              <motion.div
                key={boardKey}
                className="relative mx-auto"
                style={{ width: `${gridWidthPx}px` }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.2 }}
              >
                {/* Scan line overlay */}
                <motion.div
                  className="absolute left-0 right-0 pointer-events-none z-10"
                  style={{ height: "2px", background: `linear-gradient(90deg, transparent, ${accent}, transparent)`, opacity: 0.6 }}
                  initial={{ top: 0 }}
                  animate={{ top: "100%" }}
                  transition={{ duration: 0.6, ease: "easeInOut" }}
                />
                {/* Grid glow border flash */}
                <motion.div
                  className="absolute inset-0 pointer-events-none z-10"
                  style={{ border: `1px solid ${accent}` }}
                  initial={{ opacity: 0.5 }}
                  animate={{ opacity: 0 }}
                  transition={{ duration: 0.8, delay: 0.3 }}
                />
                <motion.div
                  className="grid"
                  style={{
                    gridTemplateColumns: `repeat(${config.cols}, ${cellSize}px)`,
                    gap: 0,
                    width: `${gridWidthPx}px`,
                  }}
                  initial={{ clipPath: "inset(0 0 100% 0)" }}
                  animate={{ clipPath: "inset(0 0 0% 0)" }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                >
                {board.map((row, r) =>
                  row.map((cell, c) => {
                    const isRevealed = cell.state === "revealed"
                    const isFlagged = cell.state === "flagged"
                    const isMine = cell.isMine
                    const isHitMine = cell.isHitMine === true

                    return (
                      <motion.button
                        key={`${r}-${c}`}
                        className={`flex items-center justify-center p-0 font-mono ${gasBombMode ? "cursor-crosshair" : "cursor-pointer"}`}
                        style={{
                          width: `${cellSize}px`,
                          height: `${cellSize}px`,
                          fontSize: `${Math.max(8, Math.round(cellSize * 0.43))}px`,
                          fontWeight: "bold",
                          lineHeight: 1,
                          background: isHitMine
                            ? "rgba(232,74,74,0.45)"
                            : isRevealed && isMine
                              ? "rgba(232,74,74,0.15)"
                              : isRevealed
                                ? "rgba(255,255,255,0.02)"
                                : "rgba(255,255,255,0.05)",
                          border: isHitMine
                            ? `1px solid rgba(232,74,74,0.8)`
                            : isRevealed
                              ? `1px solid rgba(255,255,255,0.04)`
                              : `1px solid rgba(255,255,255,0.1)`,
                          color: NUMBER_COLORS[cell.adjacentMines] || "#E8E8E8",
                          boxShadow: isHitMine ? `0 0 8px rgba(232,74,74,0.6)` : undefined,
                        }}
                        animate={{
                          backgroundColor: isHitMine
                            ? "rgba(232,74,74,0.45)"
                            : isRevealed && isMine
                              ? "rgba(232,74,74,0.15)"
                              : isRevealed
                                ? "rgba(255,255,255,0.02)"
                                : "rgba(255,255,255,0.05)",
                          borderColor: isHitMine
                            ? "rgba(232,74,74,0.8)"
                            : isRevealed
                              ? "rgba(255,255,255,0.04)"
                              : "rgba(255,255,255,0.1)",
                        }}
                        transition={{ duration: 0.15 }}
                        whileTap={!isRevealed ? { scale: 0.9 } : undefined}
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
                        <AnimatePresence mode="wait">
                          {isFlagged && (
                            <motion.span
                              key="flag"
                              style={{ color: accent }}
                              initial={{ scale: 0, rotate: -45 }}
                              animate={{ scale: 1, rotate: 0 }}
                              exit={{ scale: 0, rotate: 45 }}
                              transition={{ duration: 0.15, type: "spring", stiffness: 300 }}
                            >
                              {"F"}
                            </motion.span>
                          )}
                          {isRevealed && isMine && (
                            <motion.span
                              key="mine"
                              style={{ color: isHitMine ? "#FF0000" : "#E84A4A", fontSize: isHitMine ? "1.3em" : undefined }}
                              initial={{ scale: 0 }}
                              animate={isHitMine ? { scale: [0, 1.5, 1.2] } : { scale: [0, 1.3, 1] }}
                              transition={{ duration: 0.3, times: [0, 0.6, 1] }}
                            >
                              {"X"}
                            </motion.span>
                          )}
                               {isRevealed && !isMine && (
                                            <motion.span
                                              key="content"
                                              initial={{ opacity: 0, scale: 0.5 }}
                                              animate={{ opacity: 1, scale: 1 }}
                                              transition={{ duration: 0.15 }}
                                            >
                                              {cell.adjacentMines > 0 ? (
                                                <span>{cell.adjacentMines}</span>
                                              ) : (
                                                <span style={{ color: "rgba(255,255,255,0.06)" }}>{cell.treat}</span>
                                              )}
                                            </motion.span>
                                          )}
                        </AnimatePresence>
                      </motion.button>
                    )
                  })
                )}
                </motion.div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-3 py-2" style={{ borderTop: `1px solid ${borderFaint}` }}>
            <span className="font-mono text-[9px] tracking-[0.2em] uppercase" style={{ color: "rgba(255,255,255,0.2)" }}>
              {gasBombMode ? "GAS BOMB ARMED -- TAP TARGET CELL" : (
                <>
                  <span className="hint-desktop">RIGHT CLICK TO FLAG</span>
                  <span className="hint-mobile">LONG PRESS TO FLAG</span>
                </>
              )}
            </span>
            <motion.button
              onClick={() => { haptic(); setShowLeaderboard((p) => !p) }}
              className="relative font-mono text-[9px] tracking-[0.15em] uppercase cursor-pointer px-2 py-1"
              style={{
                background: showLeaderboard ? "rgba(232,115,74,0.1)" : "transparent",
                border: `1px solid ${showLeaderboard ? accent : borderFaint}`,
                color: showLeaderboard ? accent : "rgba(255,255,255,0.3)",
              }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {"SCORES"}
            </motion.button>
          </div>

          {/* Leaderboard panel */}
          <AnimatePresence>
            {showLeaderboard && (
              <motion.div
                className="w-full"
                style={{ borderTop: `1px solid ${borderFaint}` }}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
              >
                {/* Tab bar */}
                <div className="flex w-full" style={{ borderBottom: `1px solid ${borderFaint}` }}>
                  {(["local", "global"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setScoreTab(tab)}
                      className="flex-1 py-1.5 font-mono text-[9px] tracking-[0.2em] uppercase cursor-pointer"
                      style={{
                        background: "transparent",
                        border: "none",
                        borderBottom: scoreTab === tab ? `2px solid ${accent}` : "2px solid transparent",
                        color: scoreTab === tab ? accent : "rgba(255,255,255,0.3)",
                        transition: "color 0.15s, border-color 0.15s",
                      }}
                    >
                      {tab === "local" ? "LOCAL" : "GLOBAL"}
                    </button>
                  ))}
                </div>

                {/* LOCAL tab */}
                {scoreTab === "local" && (
                  <div className="px-3 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-[10px] tracking-[0.2em] uppercase font-bold" style={{ color: "#E8E8E8" }}>
                        {"HIGH SCORES"}
                      </span>
                      <span className="font-mono text-[9px] tracking-[0.1em] uppercase" style={{ color: "rgba(255,255,255,0.25)" }}>
                        {"TOP 5 PER MODE"}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
                        <div key={d} className="relative" style={{ border: `1px solid ${borderFaint}`, padding: "6px" }}>
                          <CornerBrackets color={d === difficulty ? accent : "rgba(255,255,255,0.06)"} size={4} thickness={1} offset={-1} />
                          <span
                            className="block font-mono text-[9px] tracking-[0.15em] uppercase text-center mb-1.5"
                            style={{ color: d === difficulty ? accent : "rgba(255,255,255,0.35)" }}
                          >
                            {d.toUpperCase()}
                          </span>
                          {leaderboard[d].length === 0 ? (
                            <span className="block font-mono text-[8px] text-center" style={{ color: "rgba(255,255,255,0.15)" }}>
                              {"NO RUNS YET"}
                            </span>
                          ) : (
                            leaderboard[d].map((entry, i) => (
                              <div
                                key={i}
                                className="flex items-center justify-between py-0.5"
                                style={{ borderTop: i > 0 ? `1px solid rgba(255,255,255,0.04)` : "none" }}
                              >
                                <span className="font-mono text-[8px]" style={{ color: i === 0 ? "#FFD700" : i === 1 ? "#C0C0C0" : i === 2 ? "#CD7F32" : "rgba(255,255,255,0.3)" }}>
                                  {`${i + 1}.`}
                                </span>
                                <span className="font-mono text-[8px] truncate mx-1" style={{ color: "rgba(255,255,255,0.5)", maxWidth: "60px" }}>
                                  {entry.rank}
                                </span>
                                <span className="font-mono text-[9px] font-bold" style={{ color: "#E8E8E8" }}>
                                  {`${entry.time}s`}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* GLOBAL tab */}
                {scoreTab === "global" && (
                  <div className="px-3 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-[10px] tracking-[0.2em] uppercase font-bold" style={{ color: "#E8E8E8" }}>
                        {"GLOBAL TOP 10"}
                      </span>
                      <span className="font-mono text-[9px] tracking-[0.1em] uppercase" style={{ color: accent }}>
                        {difficulty.toUpperCase()}
                      </span>
                    </div>

                    {globalLoading ? (
                      <div className="flex justify-center py-4">
                        <motion.span
                          className="font-mono text-[9px] tracking-[0.2em] uppercase"
                          style={{ color: "rgba(255,255,255,0.25)" }}
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{ duration: 1.2, repeat: Infinity }}
                        >
                          LOADING...
                        </motion.span>
                      </div>
                    ) : globalScores.length === 0 ? (
                      <div className="flex flex-col items-center py-4 gap-1">
                        <span className="font-mono text-[9px] tracking-[0.1em] uppercase" style={{ color: "rgba(255,255,255,0.2)" }}>
                          NO SCORES YET
                        </span>
                        <span className="font-mono text-[8px]" style={{ color: "rgba(255,255,255,0.12)" }}>
                          BE THE FIRST TO WIN ON {difficulty.toUpperCase()}
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-0">
                        {globalScores.map((entry, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 py-1"
                            style={{
                              borderTop: i > 0 ? `1px solid rgba(255,255,255,0.04)` : "none",
                              background: entry.playerName === playerName ? "rgba(232,115,74,0.05)" : "transparent",
                            }}
                          >
                            <span
                              className="font-mono text-[9px] w-5 shrink-0 text-right"
                              style={{ color: i === 0 ? "#FFD700" : i === 1 ? "#C0C0C0" : i === 2 ? "#CD7F32" : "rgba(255,255,255,0.3)" }}
                            >
                              {i + 1}.
                            </span>
                            <span
                              className="font-mono text-[9px] truncate flex-1"
                              style={{ color: entry.playerName === playerName ? accent : "rgba(255,255,255,0.6)" }}
                            >
                              {entry.playerName}
                            </span>
                            <span className="font-mono text-[8px] shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>
                              {entry.rank}
                            </span>
                            <span className="font-mono text-[9px] font-bold shrink-0" style={{ color: "#E8E8E8" }}>
                              {entry.time}s
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Win / Loss overlay */}
          <AnimatePresence>
            {(gameState === "won" || gameState === "lost") && (
              <motion.div
                className="fixed inset-0 flex flex-col items-center justify-center z-20"
                style={{ background: "rgba(10,10,10,0.80)", backdropFilter: "blur(6px)" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                <motion.div
                  className="relative flex flex-col items-center gap-4 p-6"
                  style={{ border: `1px solid ${borderW}`, background: "#0a0a0a", maxWidth: "min(360px, calc(100vw - 32px))", width: "100%" }}
                  initial={{ opacity: 0, scale: 0.8, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8, y: 20 }}
                  transition={{ duration: 0.4, type: "spring", stiffness: 200, damping: 20 }}
                >
                  <CornerBrackets
                    color={gameState === "won" ? "#4AE87A" : "#E84A4A"}
                    size={14}
                    thickness={1}
                    offset={-4}
                    squares
                  />
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 12 }}
                  >
                    <VacoFace expression={gameState === "won" ? "win" : "loss"} size={80} />
                  </motion.div>
                  <motion.span
                    className="font-mono text-lg tracking-[0.3em] uppercase font-bold"
                    style={{ color: gameState === "won" ? "#4AE87A" : "#E84A4A" }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.3 }}
                  >
                    {gameState === "won" ? "ALL CLEAR" : "GAME OVER"}
                  </motion.span>
                  <motion.span
                    className="font-mono text-[10px] tracking-[0.15em] uppercase"
                    style={{ color: "rgba(255,255,255,0.4)" }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4, duration: 0.3 }}
                  >
                    {gameState === "won" ? `COMPLETED IN ${time}s` : "VACO ATE GARBAGE"}
                  </motion.span>
                  {gameState === "won" && lastRank && (
                    <motion.div
                      className="relative font-mono text-[10px] tracking-[0.15em] uppercase"
                      style={{ border: `1px solid ${accent}`, padding: "3px 10px", color: accent }}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.45, type: "spring", stiffness: 200, damping: 15 }}
                    >
                      <CornerBrackets color={accent} size={4} thickness={1} offset={-2} />
                      {`RANK: ${lastRank}`}
                    </motion.div>
                  )}
                  {/* Round badge */}
                  <motion.div
                    className="relative font-mono text-[10px] tracking-[0.15em] uppercase"
                    style={{ border: `1px solid ${borderFaint}`, padding: "2px 8px", color: "rgba(255,255,255,0.35)" }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.45, duration: 0.3 }}
                  >
                    <span className="absolute pointer-events-none" style={{ top: -1, left: -1, width: "3px", height: "3px", borderTop: `1px solid ${accent}`, borderLeft: `1px solid ${accent}` }} aria-hidden="true" />
                    <span className="absolute pointer-events-none" style={{ bottom: -1, right: -1, width: "3px", height: "3px", borderBottom: `1px solid ${accent}`, borderRight: `1px solid ${accent}` }} aria-hidden="true" />
                    {"ROUND "}{String(round).padStart(2, "0")}
                  </motion.div>
                  {/* Mini board end state */}
                  <motion.div
                    style={{ overflow: "hidden", width: "100%", display: "flex", justifyContent: "center" }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5, duration: 0.4 }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: 1, flexShrink: 0 }}>
                      {(() => {
                        const cols = board[0]?.length ?? 9
                        const cellPx = Math.max(6, Math.min(16, Math.floor(280 / cols)))
                        return board.map((row, r) => (
                          <div key={r} style={{ display: "flex", gap: 1 }}>
                            {row.map((cell, c) => {
                              let bg = "rgba(255,255,255,0.06)"
                              let borderColor = "rgba(255,255,255,0.1)"
                              let content = ""
                              let color = "transparent"
                              if (cell.state === "revealed") {
                                bg = cell.isMine ? "rgba(232,74,74,0.18)" : "rgba(255,255,255,0.02)"
                                borderColor = cell.isMine ? "rgba(232,74,74,0.3)" : "rgba(255,255,255,0.04)"
                                if (cell.isMine) {
                                  content = "×"
                                  color = "#E84A4A"
                                } else if (cell.adjacentMines > 0) {
                                  content = String(cell.adjacentMines)
                                  color = NUMBER_COLORS[cell.adjacentMines] || "#E8E8E8"
                                } else {
                                  content = cell.treat
                                  color = "rgba(255,255,255,0.08)"
                                }
                              } else if (cell.state === "flagged") {
                                bg = "rgba(232,115,74,0.12)"
                                borderColor = "rgba(232,115,74,0.35)"
                                content = "▶"
                                color = "#E8734A"
                              }
                              return (
                                <div
                                  key={c}
                                  style={{
                                    width: cellPx,
                                    height: cellPx,
                                    background: bg,
                                    border: `1px solid ${borderColor}`,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: Math.max(4, cellPx - 4),
                                    color,
                                    lineHeight: 1,
                                    flexShrink: 0,
                                  }}
                                >
                                  {content}
                                </div>
                              )
                            })}
                          </div>
                        ))
                      })()}
                    </div>
                  </motion.div>

                  <div className="flex gap-3">
                    <motion.button
                      onClick={() => {
                        haptic([10, 20, 10])
                        setShareMessage(pickShareMessage(gameState === "won", difficulty))
                        setShowShareCard(true)
                      }}
                      className="relative font-mono text-xs tracking-[0.2em] uppercase cursor-pointer px-5 py-2.5"
                      style={{
                        background: "transparent",
                        border: `1px solid ${borderFaint}`,
                        color: "rgba(255,255,255,0.55)",
                      }}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5, duration: 0.3 }}
                      whileHover={{ scale: 1.05, borderColor: accent, color: accent }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <CornerBrackets color={accent} size={5} thickness={1} offset={-3} />
                      SHARE
                    </motion.button>
                    <motion.button
                      onClick={() => { haptic([20, 30, 20]); initBoardWithRound() }}
                      className="relative font-mono text-xs tracking-[0.2em] uppercase cursor-pointer px-5 py-2.5"
                      style={{
                        background: "transparent",
                        border: `1px solid ${accent}`,
                        color: accent,
                      }}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.55, duration: 0.3 }}
                      whileHover={{ scale: 1.05, backgroundColor: accent, color: "#0a0a0a" }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <CornerBrackets color={accent} size={5} thickness={1} offset={-3} />
                      PLAY AGAIN
                    </motion.button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Share card overlay */}
          <AnimatePresence>
            {showShareCard && (gameState === "won" || gameState === "lost") && (
              <ShareCard
                won={gameState === "won"}
                diff={difficulty}
                time={time}
                round={round}
                rank={lastRank}
                message={shareMessage}
                board={board}
                onClose={() => setShowShareCard(false)}
              />
            )}
          </AnimatePresence>

          {/* Onboarding overlay */}
          <AnimatePresence>
            {showOnboarding && (
              <Onboarding onDone={() => setShowOnboarding(false)} />
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  )
}
