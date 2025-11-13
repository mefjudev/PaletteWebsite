# Palette Website

A Next.js application with Firebase authentication for login and registration.

## Prerequisites

- Node.js 18+ installed
- Firebase project with Authentication enabled
- Firebase API keys

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Firebase

Create a `.env.local` file in the root directory with your Firebase configuration and OpenAI API key:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain_here
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id_here
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket_here
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id_here
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id_here

# OpenAI API key for Material Schedule Generator
OPENAI_API_KEY=your_openai_api_key_here

# Resend API key for sending invitation emails (optional but recommended)
# Get your API key from https://resend.com/api-keys
RESEND_API_KEY=your_resend_api_key_here
```

**Where to find your Firebase config:**
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Click the gear icon ⚙️ next to "Project Overview"
4. Select "Project settings"
5. Scroll down to "Your apps" section
6. If you don't have a web app, click "Add app" and select Web (</>)
7. Copy the config values from the `firebaseConfig` object

### 3. Get OpenAI API Key (for Schedule Generator)

1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Sign up or log in
3. Go to API Keys section
4. Create a new secret key
5. Copy the key and add it to your `.env.local` file

### 4. Enable Firebase Services

**Authentication:**
1. In Firebase Console, go to "Authentication"
2. Click "Get started"
3. Enable "Email/Password" sign-in method
4. Save the changes

**Firestore Database:**
1. In Firebase Console, go to "Firestore Database"
2. Click "Create database"
3. Start in "Production mode" (or "Test mode" for development)
4. Choose your preferred location
5. Click "Enable"

**Set up Firestore Rules (Important):**
In Firestore Database → Rules, update to:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Projects collection - allows sharing with read-only access
    match /projects/{projectId} {
      // Allow users to read their own projects
      allow read: if request.auth != null && request.auth.uid == resource.data.userId;
      
      // Allow users to read projects shared with them (read-only)
      allow read: if request.auth != null && request.auth.uid in resource.data.get('sharedWith', []);
      
      // Allow users to write their own projects
      allow write: if request.auth != null && request.auth.uid == resource.data.userId;
      
      // Allow create if user sets their own userId
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
      
      // Allow owners to update sharing fields
      allow update: if request.auth != null && request.auth.uid == resource.data.userId;
    }
    
    // Users collection - public read for email lookup (needed for sharing)
    match /users/{userId} {
      // Allow users to read any user document (for email lookup)
      allow read: if request.auth != null;
      
      // Allow users to create/update their own user document
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Invitations collection - for storing pending invitations
    match /invitations/{invitationId} {
      // Allow users to read invitations sent to their email
      allow read: if request.auth != null && request.auth.token.email == resource.data.email;
      
      // Allow project owners to create invitations for their projects
      allow create: if request.auth != null && request.auth.uid == request.resource.data.inviterId;
      
      // Allow users to update their own invitations (when accepting)
      allow update: if request.auth != null && request.auth.token.email == resource.data.email;
      
      // Allow project owners to update invitations (when cancelling)
      allow update: if request.auth != null && request.auth.uid == resource.data.inviterId;
    }
  }
}
```

**Important: Create Firestore Indexes for Sharing**
When you first use the sharing feature, Firebase will automatically prompt you to create indexes. You can also create them manually:

**Index 1: Projects sharedWith**
1. Go to Firestore Database → Indexes in Firebase Console
2. Click "Create Index"
3. Collection ID: `projects`
4. Fields to index:
   - Field: `sharedWith`, Array, Order: `Ascending`
5. Query scope: `Collection`
6. Click "Create"

**Index 2: Invitations (if using email invitations)**
1. Click "Create Index"
2. Collection ID: `invitations`
3. Fields to index:
   - Field: `email`, Order: `Ascending`
   - Field: `status`, Order: `Ascending`
4. Query scope: `Collection`
5. Click "Create"

**Note:** Firebase will show you a link to create indexes if you forget. The indexes are required for querying shared projects and invitations.

**6. Set up Email Service (Optional but Recommended)**
For sending invitation emails, you'll need a Resend API key:

1. Go to [Resend](https://resend.com/) and sign up (free account works for testing)
2. Get your API key from the dashboard (API Keys section)
3. Add it to your `.env.local` file as `RESEND_API_KEY=your_key_here`
4. **For Testing:** The app uses `onboarding@resend.dev` by default - this works without domain verification, perfect for testing!
5. **For Production (Vercel):** When you deploy, you can:
   - Keep using `onboarding@resend.dev` (works but shows Resend branding)
   - Or verify your own domain in Resend and update the `from` field in `app/api/send-invitation/route.ts`

**Note:** If you don't set up Resend, sharing will still work for users who already have accounts, but invitation emails won't be sent. Invitations will still be created and granted automatically when users sign up.

## Running the Application

### Development Server

To run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

### Production Build

To create a production build:

```bash
npm run build
npm start
```

## Features

- **Login**: Users can sign in with email and password
- **Registration**: New users can create an account
- **Password Reset**: "Forgot password" link (ready for implementation)
- **Protected Routes**: Dashboard page is protected and requires authentication
- **Material Schedule Generator**: AI-powered material analysis using OpenAI GPT-4 Vision
- **CSV/Excel Export**: Download material schedules as CSV or Excel files
- **Import**: Import material schedules from CSV or Excel files
- **Project Sharing**: Share projects with other users (read-only access)
- **Toast Notifications**: Visual feedback when copying to clipboard

## Project Structure

```
PaletteWebsite/
├── app/
│   ├── api/
│   │   └── generate-materials/  # OpenAI API route
│   ├── dashboard/      # Protected dashboard page
│   ├── schedule/       # Material schedule generator page
│   ├── globals.css     # Global styles
│   ├── layout.tsx      # Root layout
│   └── page.tsx        # Login/Registration page
├── components/
│   ├── ImageUpload.tsx     # Image upload component
│   └── MaterialSchedule.tsx # Material table display
├── lib/
│   ├── firebase.ts     # Firebase configuration
│   ├── types/
│   │   └── bim.ts      # TypeScript types for BIM data
│   └── utils/
│       └── imageCompressor.ts  # Image compression utility
└── .env.local          # Environment variables (create this)
```

## Deployment to Vercel

1. Push your code to a Git repository (GitHub, GitLab, etc.)
2. Go to [Vercel](https://vercel.com/)
3. Import your repository
4. Add your environment variables in Vercel's project settings
5. Deploy!

The environment variables should be the same as in your `.env.local` file.

## Color Scheme

- Main Background: `#42504A` (dark green)
- Form Container: `#2E3834` (darker shade)
- Input Fields: `#4F6059` (lighter shade)
- Text: White

## Usage

### Login/Registration
1. Start the dev server with `npm run dev`
2. Navigate to `http://localhost:3000`
3. Sign up for a new account or log in
4. You'll be redirected to the dashboard

### Generate Material Schedule
1. Click "Generate Schedule" on the dashboard
2. Upload an image of your space
3. Click "Generate Materials"
4. View the AI-generated material schedule
5. Export to CSV if needed

## Next Steps

- Implement forgot password functionality
- Add project history management
- Customize fonts (as mentioned, fonts will change later)


