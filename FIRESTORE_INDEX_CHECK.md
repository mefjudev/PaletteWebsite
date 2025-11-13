# Firestore Index Check

## The Issue
The "unavailable" error might be because Firestore needs an index for the `userId` query.

## Check if Index is Needed

1. Go to Firebase Console → Firestore Database → Indexes
2. Look for an index on `projects` collection with field `userId`
3. If it doesn't exist, create it:

**Create Index:**
- Collection ID: `projects`
- Fields to index:
  - Field: `userId`, Type: String, Order: Ascending
- Query scope: Collection
- Click "Create"

## Alternative: Check Firestore Rules

The rules might be blocking queries. Make sure you published the updated rules.

## Test Query Directly

Try this in Firebase Console → Firestore Database → Data:
1. Click on `projects` collection
2. Use the filter: `userId == KYahaIdo72QCNBpvZxF6AQ9tiUo1`
3. See if the project shows up

If it shows up in the console but not in the app, it's definitely a rules or index issue.

