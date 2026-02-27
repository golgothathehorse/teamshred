# TeamShred Android (Windows) — Open and Run

## 1) Install Android Studio
- Download: https://developer.android.com/studio
- Install with defaults.

## 2) Open project
- In Android Studio: **Open**
- Select folder: `android-webview`
- Wait for Gradle sync to finish.

## 3) Run on phone (recommended)
1. On Android phone: enable Developer Options + USB Debugging.
2. Plug phone via USB.
3. In Android Studio, select your phone from device dropdown.
4. Click Run ▶.

## 4) What to verify
- App opens TeamShred release URL.
- Login works.
- Back button works.
- Pull-to-refresh works.

## 5) Build app bundle (AAB) for Play internal test
1. Android Studio menu: **Build** → **Generate Signed Bundle / APK**
2. Choose **Android App Bundle**
3. Create/choose keystore (save safely)
4. Build **release**
5. Output `.aab` is used in Play Console internal testing.

## 6) Play Console internal test upload
1. Open Play Console app entry
2. Testing → Internal testing
3. Create release, upload `.aab`
4. Add release notes (use template in docs)
5. Add tester emails
6. Publish internal test release

## 7) Version bump before each new upload
Edit `android-webview/app/build.gradle.kts`:
- increase `versionCode` by 1
- update `versionName`

