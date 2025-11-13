# Deployment Guide for Vercel

## Step 1: Create GitHub Repository

1. Go to https://github.com/new
2. Repository name: `PaletteWebsite`
3. Description: "BIM Material Schedule Generator with Firebase Auth and Project Sharing"
4. **Visibility: Public** (required for free Vercel)
5. **DO NOT** check any boxes (README, .gitignore, license) - we already have these
6. Click "Create repository"

## Step 2: Push Code to GitHub

After creating the repo, run these commands (replace `YOUR_USERNAME` with your GitHub username):

```bash
git remote add origin https://github.com/YOUR_USERNAME/PaletteWebsite.git
git branch -M main
git push -u origin main
```

## Step 3: Deploy to Vercel

### Option A: Via Vercel Dashboard (Recommended)

1. Go to https://vercel.com and sign in with GitHub
2. Click "Add New Project"
3. Import your `PaletteWebsite` repository
4. Vercel will auto-detect Next.js settings
5. **Add Environment Variables:**
   - `NEXT_PUBLIC_FIREBASE_API_KEY`
   - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
   - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
   - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
   - `NEXT_PUBLIC_FIREBASE_APP_ID`
   - `OPENAI_API_KEY`
   - `RESEND_API_KEY`
6. Click "Deploy"

### Option B: Via Vercel CLI

```bash
npm i -g vercel
vercel
```

Follow the prompts and add environment variables when asked.

## Step 4: Configure Resend Domain (After Deployment)

Once deployed to Vercel:

1. Go to your Vercel project settings → Domains
2. Copy your Vercel domain (e.g., `palette-website.vercel.app`)
3. Go to https://resend.com/domains
4. Add and verify your Vercel domain
5. Update `app/api/send-invitation/route.ts` to use your domain:
   ```typescript
   from: 'Palette <noreply@your-vercel-domain.vercel.app>',
   ```
6. Redeploy on Vercel

## Important Notes

- ✅ `.env.local` is already in `.gitignore` - your secrets won't be committed
- ✅ All environment variables need to be added in Vercel dashboard
- ✅ Public repo is required for free Vercel tier
- ✅ After deployment, update Firebase authorized domains to include your Vercel URL

## Firebase Configuration

After deployment, add your Vercel domain to Firebase:

1. Go to Firebase Console → Authentication → Settings
2. Add your Vercel domain to "Authorized domains"
3. This allows Firebase auth to work on your deployed site

