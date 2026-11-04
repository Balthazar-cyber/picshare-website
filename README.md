# PicShare Firebase starter

## Included
- `index.html`, `styles.css`, `app.js`
- `firebase-config.js` with the Firebase web app configuration
- `firestore.rules` matching this version's `/posts` collection

## Firebase setup
1. In Firebase Console, confirm Authentication > Sign-in method > Email/Password is enabled.
2. In Firestore Database > Rules, replace the rules with the contents of `firestore.rules`, then Publish.
3. Run this site from a local web server or static hosting service. ES modules and Firebase browser SDK imports may not work when opening `index.html` directly as a `file://` URL.
4. Register a test account and publish a text post.

## Important limitations
This version shares text posts using Firebase Authentication and Firestore. It does not upload photos. Firebase Storage was not enabled because the project setup requested a billing upgrade. Do not put service-account private keys, passwords, or admin credentials in this website. The Firebase web config is public client configuration.
