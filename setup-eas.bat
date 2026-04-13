@echo off
echo Installing EAS CLI...
call npm install -g eas-cli

echo.
echo Logging into Expo account...
call eas login

echo.
echo Configuring EAS Build...
call eas build:configure

echo.
echo Setup complete!
echo.
echo To build your app, run:
echo   eas build -p android --profile preview
echo.
pause
