@echo off
echo Updating client_packages and packages from source...

:: Copy client
if exist source\client (
    echo Copying client...
    xcopy source\client client_packages /E /I /Y
) else (
    echo source\client does not exist!
)

:: Copy server
if exist source\server (
    echo Copying server...
    xcopy source\server packages /E /I /Y
) else (
    echo source\server does not exist!
)

echo.
echo Update complete!
pause