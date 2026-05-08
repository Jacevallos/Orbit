# ContextPilot — v0

A project-based AI workspace. You stash reusable context (project description, tech stack, your resume, the bug you're tracking) in projects, then send prompts that come pre-loaded with that context.

This is the **v0 scaffold** — single-user, local-only, Claude-only. The shape is designed so you can add multi-user auth, more models, and side-by-side comparison without rewriting.

## What's in here

```
app/
  api/
    projects/                 # CRUD for projects + nested /context, /prompts
    context/[id]/             # edit/delete individual context blocks
  projects/[id]/page.tsx      # the main work surface (vault + composer + history)
  page.tsx                    # project list
components/
  ContextVault.tsx            # add/list context blocks
  PromptComposer.tsx          # write prompt, pick task + blocks, send
  PromptHistory.tsx           # past prompts + responses + the packet that was sent
  CreateProjectForm.tsx
lib/
  prisma.ts                   # Prisma client singleton
  anthropic.ts                # model adapter — same shape will hold for OpenAI/Perplexity later
  prompt-packet.ts            # THE business logic: assembles context + prompt into a packet
prisma/
  schema.prisma               # Project, ContextBlock, Prompt
```

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Get a Postgres database**. Easiest options:
   - Local: install Postgres.app or run `docker run --name pg -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres`
   - Remote: free Supabase project — copy the connection string from Project Settings → Database

3. **Get an Anthropic API key** at https://console.anthropic.com/

4. **Configure env**
   ```bash
   cp .env.example .env
   # edit .env — set DATABASE_URL and ANTHROPIC_API_KEY
   ```

5. **Push the schema**
   ```bash
   npm run db:push
   ```

6. **Run it**
   ```bash
   npm run dev
   ```
   Open http://localhost:3000

## The core loop

1. Create a project ("BCBookScanner Debugging", goal: "find why first print sometimes fails").
2. Add a few context blocks: tech stack, the bug description, the relevant filenames.
3. Type your prompt. The composer auto-checks the boxes for your context blocks.
4. Hit send. The server assembles a packet like:
   ```
   PROJECT: BCBookScanner Debugging
   GOAL: find why first print sometimes fails

   CONTEXT:
   --- Tech stack [stack] ---
   C# WPF, .NET Framework 4.7.2, SQLite, PaperCut

   --- Bug description [debugging] ---
   First print attempt sometimes fails silently...

   APPROACH: Form hypotheses about root cause before proposing fixes...

   REQUEST:
   Help me debug this print issue.
   ```
   …calls Claude, saves the response.
5. The history panel shows every prompt + response + the exact packet sent, so you can see what context the model actually saw.

## What's intentionally not here yet

- **Auth.** Single-user. To add Clerk: wrap the app, add `userId` to all three models, filter every query.
- **Multiple models.** Adapter exists in `lib/anthropic.ts` — add `lib/openai.ts` and `lib/perplexity.ts` with the same `runModel` shape, then dispatch in the prompt route.
- **Side-by-side comparison.** Trivial once multiple adapters exist — fan out, render columns.
- **Cursor/ChatGPT export.** Add a "Copy packet" button in `PromptHistory.tsx` (the data is already there in `generatedPacket`).
- **Vector search over context.** The schema is small enough for v0 that we just send all selected blocks. Add `pgvector` and ranking when projects start having dozens of blocks.
- **Rate limiting / cost caps.** Add when you stop being the only user.

## The two files to actually understand

- `lib/prompt-packet.ts` — this is the product. Everything else is plumbing.
- `app/api/projects/[id]/prompts/route.ts` — orchestrates: load project → build packet → call model → save row. The error path saves the row first so you never lose a record of a failed call.
