# Question Bank AI

A responsive Next.js starter for a private, Google-authenticated question bank.

## Features in this starter
- Google sign-in through Supabase Auth
- Private cloud uploads for PDFs and images
- Browser-side text extraction from text-based PDFs
- OCR for image uploads (English)
- Basic splitting and labelling of MCQ, Assertion–Reason and descriptive questions
- Exact duplicate skipping against questions already loaded in the app
- Search and PDF export

## 1. Supabase setup
The project expects:
- A `public.questions` table with columns: `id` (uuid), `user_id` (uuid), `question_text` (text), `question_type` (text), `options` (jsonb), `answer` (text), `chapter` (text), `marks` (integer), `created_at` (timestamptz).
- Row Level Security enabled on `questions`, with authenticated users allowed to select/insert/update/delete only rows where `auth.uid() = user_id`.
- A **private** Storage bucket named `question-bank-files`, with policies allowing authenticated users to manage only objects whose first folder is their own auth user ID.
- Google provider enabled in Supabase Auth.

Use the SQL supplied during setup. If you need to recreate it, see `supabase-setup.sql`.

## 2. Local environment
1. Copy `.env.example` to `.env.local`.
2. Fill in your Supabase Project URL and anon/publishable key. These are available in Supabase Project Settings → API.
3. Never put a service-role key in this app.

## 3. Run locally
Install Node.js 20 or newer, then run:
```bash
npm install
npm run dev
```
Open http://localhost:3000.

## 4. Deploy with Vercel
1. Push this project to your GitHub repository.
2. Import that repository at https://vercel.com/new.
3. Add the two environment variables from `.env.local` in Vercel project settings.
4. Deploy.
5. In Supabase Authentication → URL Configuration, set Site URL to your Vercel deployment URL and add it to the Redirect URLs list (for example `https://your-app.vercel.app/**`).
6. In Google Cloud OAuth client, add your Vercel site origin to Authorized JavaScript origins if prompted. Keep the Supabase callback URL in Authorized redirect URIs.

## Current limitations — read before relying on extraction
- This is a first working starter, not a finished AI product.
- OCR currently handles image uploads in English. Scanned PDF OCR is not included yet.
- Question splitting and type detection are heuristic and need user review.
- Duplicate checking is exact normalized text only; it does not identify reworded/semantic duplicates yet.
- Original diagrams and page layouts are not preserved in exported PDFs.
- The app currently extracts questions and saves them, but does not yet include answer-key generation, manual editing, or a review queue.
- Large files and large batches may be limited by browser memory and your Supabase storage plan.
