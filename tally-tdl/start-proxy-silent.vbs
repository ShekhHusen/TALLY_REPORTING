' ============================================================================
'  Silent VBScript Launcher for Tally Proxy Server
'  Launches node server.js in completely hidden mode (0, False)
' ============================================================================

Option Explicit
Dim WshShell, fso, scriptDir, proxyDir

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
proxyDir = fso.GetAbsolutePathName(scriptDir & "\..\tally-proxy")

If fso.FolderExists(proxyDir) Then
    WshShell.CurrentDirectory = proxyDir
    ' Run completely hidden (0) without blocking Tally (False)
    WshShell.Run "cmd.exe /c node server.js > proxy.log 2>&1", 0, False
End If

Set WshShell = Nothing
Set fso = Nothing
