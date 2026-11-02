' ============================================================================
'  Silent VBScript Launcher for Tally Proxy Server  (Portable Edition v2.2)
'
'  Path Discovery Order:
'  0. Command-line argument passed directly from Tally (WScript.Arguments(0))
'  1. Reads "proxy-path.cfg" in tally-tdl folder (if it exists).
'  2. Falls back to sibling "..\tally-proxy" folder.
'  3. Falls back to same folder ".\tally-proxy".
' ============================================================================

Option Explicit
Dim WshShell, fso, scriptDir, proxyDir, cfgFile, cfgPath

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
cfgFile = scriptDir & "\proxy-path.cfg"
proxyDir = ""

' --- Priority 0: Command-line argument passed by Tally ---
If WScript.Arguments.Count > 0 Then
    Dim argPath
    argPath = Trim(WScript.Arguments(0))
    ' Strip quotes if present
    If Left(argPath, 1) = """" And Right(argPath, 1) = """" Then
        argPath = Mid(argPath, 2, Len(argPath) - 2)
    End If
    If argPath <> "" And fso.FolderExists(argPath) Then
        proxyDir = argPath
    End If
End If

' --- Priority 1: Read custom path from proxy-path.cfg ---
If proxyDir = "" And fso.FileExists(cfgFile) Then
    Dim ts, line
    Set ts = fso.OpenTextFile(cfgFile, 1)
    If Not ts.AtEndOfStream Then
        line = Trim(ts.ReadLine)
        ' Strip quotes if present
        If Left(line, 1) = """" And Right(line, 1) = """" Then
            line = Mid(line, 2, Len(line) - 2)
        End If
        If line <> "" And fso.FolderExists(line) Then
            proxyDir = line
        End If
    End If
    ts.Close
End If

' --- Priority 2: Sibling folder ..\tally-proxy ---
If proxyDir = "" Then
    Dim siblingPath
    siblingPath = fso.GetAbsolutePathName(scriptDir & "\..\tally-proxy")
    If fso.FolderExists(siblingPath) Then
        proxyDir = siblingPath
    End If
End If

' --- Priority 3: Sub-folder .\tally-proxy ---
If proxyDir = "" Then
    Dim subPath
    subPath = scriptDir & "\tally-proxy"
    If fso.FolderExists(subPath) Then
        proxyDir = subPath
    End If
End If

' --- Launch and sync proxy-path.cfg ---
If proxyDir <> "" And fso.FileExists(proxyDir & "\server.js") Then
    ' Save/Sync proxy-path.cfg so manual batch scripts also know the path
    On Error Resume Next
    Dim tsOut
    Set tsOut = fso.CreateTextFile(cfgFile, True)
    tsOut.WriteLine proxyDir
    tsOut.Close
    On Error GoTo 0

    WshShell.CurrentDirectory = proxyDir
    ' Run completely hidden (0) without blocking Tally (False)
    WshShell.Run "cmd.exe /c node server.js >> proxy.log 2>&1", 0, False
End If

Set WshShell = Nothing
Set fso = Nothing
