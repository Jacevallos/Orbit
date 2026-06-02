# Orbit

A workspace for having actually useful conversations with Claude about your codebase. You upload your project files, add some context (tech stack, architecture notes, whatever's relevant), and chat. It figures out which files matter for each question and pulls them in automatically.

## What it does

The core idea is that most AI coding tools either dump your entire codebase into the context window (expensive, slow) or make you manually pick files every time (annoying). Orbit tries to find the middle ground — it indexes your files in Postgres, uses full-text search to find relevant ones per query, and extracts just the relevant section of each file rather than the whole thing.

A few other things worth knowing:

- Follow-up questions work the way you'd expect — if you ask "is there another way to do this?", it uses identifiers from the conversation to find the right files instead of searching blindly on those 6 words
- For broad questions ("what does this app do?") it uses short per-file summaries instead of full content, which is a lot cheaper
- Long conversations get compressed automatically so you're not paying for the full history on every message
- You can switch between Haiku, Sonnet, and Opus mid-conversation
- Shows an estimated cost before you send so you're not flying blind

## Stack

Next.js 14, TypeScript, Postgres (Supabase), Prisma, Anthropic API

## Setup

You'll need a Postgres database and an Anthropic API key.

```bash
npm install
cp .env.example .env
# fill in DATABASE_URL, DIRECT_URL, ANTHROPIC_API_KEY
npm run db:push
npm run dev
```

Supabase has a free tier that works fine — grab the connection string from Project Settings → Database.

Open http://localhost:3000

## Files worth looking at

- `lib/file-search.ts` — all the retrieval logic (FTS, Haiku routing, chunking, summaries)
- `lib/prompt-packet.ts` — builds the system prompt from project context
- `app/api/prompts/[id]/messages/route.ts` — the main message handler
- `lib/anthropic.ts` — Claude adapter with prompt caching
