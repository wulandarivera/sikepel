' ================================================================
' Script untuk menjalankan server SIKEPEL di latar belakang
' tanpa menampilkan jendela terminal / Command Prompt (Hidden).
' ================================================================
Set fso = CreateObject("Scripting.FileSystemObject")
strDir = fso.GetParentFolderName(WScript.ScriptFullName)

Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = strDir

' 0 = Sembunyikan jendela CMD, False = Jalankan asynchronous di latar belakang
WshShell.Run "cmd /c """ & strDir & "\scripts\run-silent.cmd""", 0, False
