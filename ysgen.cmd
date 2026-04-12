@echo off
:: ysgen.cmd — Windows wrapper for the ysgen CLI
:: Place this file in a directory that is on your PATH,
:: or just run it directly from the project root.
bun run "%~dp0src\cli\index.ts" %*
