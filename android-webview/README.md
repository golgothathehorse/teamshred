# TeamShred Android WebView (starter)

This is a production-minded Android wrapper for the release web app URL:

- https://teamshred-release.replit.app/

## Build (Android Studio)
1. Open `android-webview` folder in Android Studio.
2. Let Gradle sync.
3. Run on emulator/device.
4. Generate signed AAB: `Build > Generate Signed Bundle / APK`.

## Notes
- Back button navigates WebView history.
- Pull-to-refresh enabled.
- Progress bar enabled.
- JavaScript + DOM storage enabled.

## Before Play Internal Testing
- Replace app icons (`mipmap`) with TeamShred branding.
- Add privacy policy URL in Play Console.
- Validate login/session behavior on low network.
- Ensure release URL stays stable.
