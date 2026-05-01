# Security Notes

## Access control

ShiftPalette is a public GitHub Pages app, so client-side code and Firebase web config are public by design.

Firestore data access is controlled by `firestore.rules`. A signed-in user can read and write the app data only when this document exists:

```text
allowedUsers/{Firebase Authentication UID}
```

Create and delete these `allowedUsers` documents from the Firebase Console. Client users are not allowed to read or write the allowlist collection.

## Adding an allowed user

1. Open Firebase Console.
2. Go to Authentication > Users.
3. Copy the user's UID.
4. Go to Firestore Database.
5. Create a document at `allowedUsers/{UID}`.
6. Optional fields such as `displayName` or `note` are fine, but the document can also be empty.

## Deploying rules

After editing `firestore.rules`, run:

```bash
npx firebase-tools deploy --only firestore:rules --project shiftpalette
```
