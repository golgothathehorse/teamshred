# Play Internal Testing — Step by Step

## Before upload
- [ ] `release` branch is stable
- [ ] Android app runs on at least one real device
- [ ] `versionCode` incremented

## Upload flow
1. Open Play Console
2. Select app: TeamShred
3. Go to **Testing** → **Internal testing**
4. Click **Create new release**
5. Upload `.aab` from Android Studio output
6. Add short release notes
7. Save and review
8. Roll out to internal testing

## Add testers
1. Open Internal testing track
2. Add tester list emails
3. Copy opt-in link
4. Send tester message template from:
   `docs/play-internal-testing/TESTER_MESSAGE_TEMPLATE.md`

## After publish
- [ ] Install from opt-in link
- [ ] Verify login
- [ ] Verify core flow
- [ ] Collect feedback
