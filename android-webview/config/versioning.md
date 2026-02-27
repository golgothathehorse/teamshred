# Android Versioning Guide

Location: `android-webview/app/build.gradle.kts`

## Fields
- `versionCode`: integer, must increase every release.
- `versionName`: human-readable string.

## Example progression
- 1.0.0 -> versionCode 1
- 1.0.1 -> versionCode 2
- 1.1.0 -> versionCode 3

## Before each internal release
1. Increase `versionCode` by 1
2. Update `versionName`
3. Build AAB
