# TATZO Mobile + Admin

React Native (Expo, native Android kept) + Firebase + Admin review portal.

## 1) Install

```bash
npm install
npm --prefix admin-web install
```

## 2) Health Checks

```bash
npx tsc --noEmit
npx expo-doctor
npm --prefix admin-web run build
```

## 3) Run Mobile App

```bash
npx expo start
```

For Android native build:

```powershell
cd android
$env:NODE_ENV="development"
.\gradlew.bat :app:processDebugGoogleServices --no-daemon
.\gradlew.bat :app:assembleDebug -x lint -x test --no-daemon
```

If Windows file-lock error appears during `mergeDebugNativeLibs` / `packageDebug`:

```powershell
cd android
.\gradlew.bat --stop
Remove-Item -LiteralPath ".\app\build" -Recurse -Force -ErrorAction SilentlyContinue
$env:NODE_ENV="development"
.\gradlew.bat :app:assembleDebug -x lint -x test --no-daemon
```

## 4) Verification Flow (Current)

- Login/signup -> direct User Dashboard
- Location missing -> Profile banner + Set Location CTA
- Become Artist/Dealer with missing location -> force location first
- Apply submit -> `verificationStatus: pending` (role **not** switched)
- Role switches only after admin approval

## 5) Admin Web Portal

Run locally:

```bash
npm --prefix admin-web run dev
```

Behavior:

- Sign up creates account only
- Sign in requires custom claim `admin=true`
- Signed-in non-admin users are blocked with a claim instruction screen

Set admin claim:

```powershell
$env:FIREBASE_SERVICE_ACCOUNT="C:\path\to\service-account.json"
npm run set-admin-claim -- <admin-email-or-uid>
```

Then sign out and sign in again.

## 6) Firebase Deploy

```bash
npx firebase deploy --only firestore:rules,storage,hosting
```
