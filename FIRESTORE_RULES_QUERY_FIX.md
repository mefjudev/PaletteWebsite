# Firestore Rules Fix for Queries

## The Issue

The current Firestore rules might be blocking queries. The rule:
```
allow read: if request.auth != null && request.auth.uid == resource.data.userId;
```

This works for reading individual documents, but queries need to be able to LIST documents.

## Updated Rules

Go to Firebase Console → Firestore Database → Rules and use these rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Projects collection - allows sharing with read-only access
    match /projects/{projectId} {
      // Allow users to read their own projects (both get and list)
      allow read: if request.auth != null && (
        request.auth.uid == resource.data.userId ||
        request.auth.uid in resource.data.get('sharedWith', [])
      );
      
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

## Key Changes

The main change is in the `projects` collection - the `allow read` rule now uses an OR condition that allows:
1. Reading documents where `userId` matches (for queries)
2. Reading documents where user is in `sharedWith` array

This should allow queries like `where('userId', '==', user.uid)` to work properly.

## After Updating Rules

1. Click "Publish" in Firebase Console
2. Wait 1-2 minutes for rules to propagate
3. Refresh your Vercel site
4. Check the console - projects should load

