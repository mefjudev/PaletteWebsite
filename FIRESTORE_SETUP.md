# Firestore Security Rules Setup

## Quick Checklist

If you're getting "Failed to create invitation" error, follow these steps:

### 1. Verify Firestore Rules

Go to Firebase Console → Firestore Database → Rules and make sure you have these rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Projects collection
    match /projects/{projectId} {
      allow read: if request.auth != null && request.auth.uid == resource.data.userId;
      allow read: if request.auth != null && request.auth.uid in resource.data.get('sharedWith', []);
      allow write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
      allow update: if request.auth != null && request.auth.uid == resource.data.userId;
    }
    
    // Users collection
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Invitations collection - IMPORTANT!
    match /invitations/{invitationId} {
      allow read: if request.auth != null && request.auth.token.email == resource.data.email;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.inviterId;
      allow update: if request.auth != null && request.auth.token.email == resource.data.email;
      allow update: if request.auth != null && request.auth.uid == resource.data.inviterId;
    }
  }
}
```

### 2. Publish the Rules

After updating the rules, click **"Publish"** button at the top of the Rules editor.

### 3. Create Firestore Indexes

Go to Firestore Database → Indexes and create these indexes:

**Index 1: Projects sharedWith**
- Collection ID: `projects`
- Fields: `sharedWith` (Array, Ascending)
- Query scope: Collection

**Index 2: Invitations**
- Collection ID: `invitations`
- Fields: 
  - `email` (Ascending)
  - `status` (Ascending)
- Query scope: Collection

### 4. Verify Resend API Key

Check your `.env.local` file has:
```
RESEND_API_KEY=re_cJB44QLi_3BWHkgPcux1YPxqLFm1kx46a
```

### 5. Restart Server

After updating Firestore rules, restart your development server:
```bash
npm run dev
```

### 6. Check Browser Console

Open browser DevTools (F12) → Console tab and look for error messages when trying to share a project. The console logs will show exactly what's failing.

## Common Issues

1. **Permission Denied**: Firestore rules not published or incorrect
2. **Missing Index**: Firebase will show a link to create the index automatically
3. **Email Not Sent**: Check if RESEND_API_KEY is set correctly (emails are optional, invitation still works)

## Testing

1. Share a project with an email that doesn't have an account
2. Check browser console for any errors
3. Check Firebase Console → Firestore Database → Data to see if invitation was created
4. Try signing up with that email to verify auto-grant works

