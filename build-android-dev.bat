@echo off
echo Building Chawp Development Build...
echo.

REM Set environment variable to bypass Git requirement
set EAS_NO_VCS=1

REM Build development version with notification support
eas build -p android --profile development

echo.
echo Development build complete!
echo Install the APK on your device and run: npx expo start --dev-client
pause
