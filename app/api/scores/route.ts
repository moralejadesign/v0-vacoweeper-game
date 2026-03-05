import { NextResponse } from "next/server"
import { nanoid } from "nanoid"
import { db } from "@/lib/db"
import { scores } from "@/lib/db/schema"
import { eq, asc } from "drizzle-orm"

const VALID_DIFFICULTIES = ["easy", "medium", "hard"] as const
const MAX_NAME_LENGTH = 20
const GLOBAL_TOP_N = 10

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { playerName, difficulty, time, rank } = body

    if (
      typeof playerName !== "string" ||
      playerName.trim().length === 0 ||
      playerName.trim().length > MAX_NAME_LENGTH
    ) {
      return NextResponse.json({ error: "Invalid playerName" }, { status: 400 })
    }

    if (!VALID_DIFFICULTIES.includes(difficulty)) {
      return NextResponse.json({ error: "Invalid difficulty" }, { status: 400 })
    }

    if (typeof time !== "number" || time <= 0 || time > 999) {
      return NextResponse.json({ error: "Invalid time" }, { status: 400 })
    }

    if (typeof rank !== "string" || rank.trim().length === 0) {
      return NextResponse.json({ error: "Invalid rank" }, { status: 400 })
    }

    const id = nanoid(10)

    await db.insert(scores).values({
      id,
      playerName: playerName.trim(),
      difficulty,
      time,
      rank: rank.trim(),
    })

    return NextResponse.json({ id })
  } catch (e) {
    console.error("Failed to save score:", e)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const difficulty = searchParams.get("difficulty")

    if (!difficulty || !VALID_DIFFICULTIES.includes(difficulty as typeof VALID_DIFFICULTIES[number])) {
      return NextResponse.json({ error: "Invalid difficulty" }, { status: 400 })
    }

    const rows = await db
      .select()
      .from(scores)
      .where(eq(scores.difficulty, difficulty))
      .orderBy(asc(scores.time))
      .limit(GLOBAL_TOP_N)

    return NextResponse.json({ scores: rows })
  } catch (e) {
    console.error("Failed to fetch scores:", e)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
