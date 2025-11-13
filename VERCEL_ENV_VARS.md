# Vercel Environment Variables

Copy these variable names when adding them to Vercel:

## Firebase Configuration
```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
```

## API Keys
```
OPENAI_API_KEY
RESEND_API_KEY
```

## How to Add in Vercel

1. Go to your project in Vercel dashboard
2. Click "Settings" → "Environment Variables"
3. For each variable above:
   - Click "Add New"
   - Enter the variable name
   - Enter the value from your `.env.local` file
   - Select "Production", "Preview", and "Development" (or just Production)
   - Click "Save"
4. After adding all variables, redeploy your project

## After Deployment

1. **Firebase Authorized Domains:**
   - Go to Firebase Console → Authentication → Settings
   - Add your Vercel domain to "Authorized domains"

2. **Resend Domain (Optional):**
   - Go to https://resend.com/domains
   - Add and verify your Vercel domain
   - Update `app/api/send-invitation/route.ts` to use your domain
   - Redeploy

