@echo off
echo Building Chawp without Git...
echo.

REM Set environment variable to bypass Git requirement
set EAS_NO_VCS=1

REM Build for Android
eas build -p android --profile preview

echo.
echo Build complete!
pause
