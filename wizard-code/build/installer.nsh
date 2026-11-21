; Wizard Code, per-user (no admin needed):
;  - "Open with Wizard Code" in the right-click menu for files, folders and folder backgrounds
;  - listed under "Open with" and in Settings > Apps > Default apps
!macro customInstall
  WriteRegStr HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}" "FriendlyAppName" "Wizard Code"
  WriteRegStr HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'

  WriteRegStr HKCU "Software\Classes\*\shell\WizardCode" "" "Open with Wizard Code"
  WriteRegStr HKCU "Software\Classes\*\shell\WizardCode" "Icon" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}",0'
  WriteRegStr HKCU "Software\Classes\*\shell\WizardCode\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'

  WriteRegStr HKCU "Software\Classes\Directory\shell\WizardCode" "" "Open with Wizard Code"
  WriteRegStr HKCU "Software\Classes\Directory\shell\WizardCode" "Icon" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}",0'
  WriteRegStr HKCU "Software\Classes\Directory\shell\WizardCode\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'

  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\WizardCode" "" "Open with Wizard Code"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\WizardCode" "Icon" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}",0'
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\WizardCode\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%V"'

  ; Default apps registration (Settings > Apps > Default apps > Wizard Code)
  WriteRegStr HKCU "Software\Classes\WizardCode.File" "" "Wizard Code File"
  WriteRegStr HKCU "Software\Classes\WizardCode.File\DefaultIcon" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}",0'
  WriteRegStr HKCU "Software\Classes\WizardCode.File\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  WriteRegStr HKCU "Software\Clients\Other\WizardCode\Capabilities" "ApplicationName" "Wizard Code"
  WriteRegStr HKCU "Software\Clients\Other\WizardCode\Capabilities" "ApplicationDescription" "Code editor with Wizard AI"
  WriteRegStr HKCU "Software\Clients\Other\WizardCode\Capabilities" "ApplicationIcon" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}",0'
  WriteRegStr HKCU "Software\Clients\Other\WizardCode\Capabilities\FileAssociations" ".js" "WizardCode.File"
  WriteRegStr HKCU "Software\Clients\Other\WizardCode\Capabilities\FileAssociations" ".mjs" "WizardCode.File"
  WriteRegStr HKCU "Software\Clients\Other\WizardCode\Capabilities\FileAssociations" ".ts" "WizardCode.File"
  WriteRegStr HKCU "Software\Clients\Other\WizardCode\Capabilities\FileAssociations" ".tsx" "WizardCode.File"
  WriteRegStr HKCU "Software\Clients\Other\WizardCode\Capabilities\FileAssociations" ".jsx" "WizardCode.File"
  WriteRegStr HKCU "Software\Clients\Other\WizardCode\Capabilities\FileAssociations" ".json" "WizardCode.File"
  WriteRegStr HKCU "Software\Clients\Other\WizardCode\Capabilities\FileAssociations" ".py" "WizardCode.File"
  WriteRegStr HKCU "Software\Clients\Other\WizardCode\Capabilities\FileAssociations" ".html" "WizardCode.File"
  WriteRegStr HKCU "Software\Clients\Other\WizardCode\Capabilities\FileAssociations" ".css" "WizardCode.File"
  WriteRegStr HKCU "Software\Clients\Other\WizardCode\Capabilities\FileAssociations" ".md" "WizardCode.File"
  WriteRegStr HKCU "Software\Clients\Other\WizardCode\Capabilities\FileAssociations" ".c" "WizardCode.File"
  WriteRegStr HKCU "Software\Clients\Other\WizardCode\Capabilities\FileAssociations" ".cpp" "WizardCode.File"
  WriteRegStr HKCU "Software\Clients\Other\WizardCode\Capabilities\FileAssociations" ".h" "WizardCode.File"
  WriteRegStr HKCU "Software\Clients\Other\WizardCode\Capabilities\FileAssociations" ".java" "WizardCode.File"
  WriteRegStr HKCU "Software\Clients\Other\WizardCode\Capabilities\FileAssociations" ".go" "WizardCode.File"
  WriteRegStr HKCU "Software\Clients\Other\WizardCode\Capabilities\FileAssociations" ".rs" "WizardCode.File"
  WriteRegStr HKCU "Software\Clients\Other\WizardCode\Capabilities\FileAssociations" ".rb" "WizardCode.File"
  WriteRegStr HKCU "Software\Clients\Other\WizardCode\Capabilities\FileAssociations" ".php" "WizardCode.File"
  WriteRegStr HKCU "Software\Clients\Other\WizardCode\Capabilities\FileAssociations" ".sh" "WizardCode.File"
  WriteRegStr HKCU "Software\Clients\Other\WizardCode\Capabilities\FileAssociations" ".sql" "WizardCode.File"
  WriteRegStr HKCU "Software\Clients\Other\WizardCode\Capabilities\FileAssociations" ".yml" "WizardCode.File"
  WriteRegStr HKCU "Software\Clients\Other\WizardCode\Capabilities\FileAssociations" ".yaml" "WizardCode.File"
  WriteRegStr HKCU "Software\Clients\Other\WizardCode\Capabilities\FileAssociations" ".xml" "WizardCode.File"
  WriteRegStr HKCU "Software\Clients\Other\WizardCode\Capabilities\FileAssociations" ".cs" "WizardCode.File"
  WriteRegStr HKCU "Software\Clients\Other\WizardCode\Capabilities\FileAssociations" ".ps1" "WizardCode.File"
  WriteRegStr HKCU "Software\Clients\Other\WizardCode\Capabilities\FileAssociations" ".bat" "WizardCode.File"
  WriteRegStr HKCU "Software\Clients\Other\WizardCode\Capabilities\FileAssociations" ".txt" "WizardCode.File"
  WriteRegStr HKCU "Software\Clients\Other\WizardCode\Capabilities\FileAssociations" ".log" "WizardCode.File"
  WriteRegStr HKCU "Software\Clients\Other\WizardCode\Capabilities\FileAssociations" ".toml" "WizardCode.File"
  WriteRegStr HKCU "Software\Clients\Other\WizardCode\Capabilities\FileAssociations" ".ini" "WizardCode.File"
  WriteRegStr HKCU "Software\RegisteredApplications" "Wizard Code" "Software\Clients\Other\WizardCode\Capabilities"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}"
  DeleteRegKey HKCU "Software\Classes\*\shell\WizardCode"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\WizardCode"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\WizardCode"
  DeleteRegKey HKCU "Software\Classes\WizardCode.File"
  DeleteRegKey HKCU "Software\Clients\Other\WizardCode"
  DeleteRegValue HKCU "Software\RegisteredApplications" "Wizard Code"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
