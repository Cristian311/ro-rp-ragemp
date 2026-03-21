@echo off

echo Cleaning old source folder...
if exist source rmdir /s /q source

echo Creating new structure...
mkdir source
mkdir source\client
mkdir source\server

echo Copying client files...
xcopy client_packages source\client /E /I /Y

echo Copying server files...
xcopy packages source\server /E /I /Y

echo.
echo Done! Source folder ready.
pause