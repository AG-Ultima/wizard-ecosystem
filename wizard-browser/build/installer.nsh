; Registers Wizard Browser so it shows up under Settings > Apps > Default apps
; (http, https, .html, .htm, .pdf, .svg). Per-user (HKCU), no admin rights needed.
!macro customInstall
  WriteRegStr HKCU "Software\Classes\WizardBrowserURL" "" "Wizard Browser URL"
  WriteRegStr HKCU "Software\Classes\WizardBrowserURL" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\WizardBrowserURL\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCU "Software\Classes\WizardBrowserURL\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  WriteRegStr HKCU "Software\Classes\WizardBrowserHTML" "" "Wizard Browser Document"
  WriteRegStr HKCU "Software\Classes\WizardBrowserHTML\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCU "Software\Classes\WizardBrowserHTML\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'

  WriteRegStr HKCU "Software\Clients\StartMenuInternet\WizardBrowser" "" "Wizard Browser"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\WizardBrowser\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\WizardBrowser\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\WizardBrowser\Capabilities" "ApplicationName" "Wizard Browser"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\WizardBrowser\Capabilities" "ApplicationDescription" "Workspaces, ad blocking and Wizard Ecosystem integration"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\WizardBrowser\Capabilities" "ApplicationIcon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\WizardBrowser\Capabilities\URLAssociations" "http" "WizardBrowserURL"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\WizardBrowser\Capabilities\URLAssociations" "https" "WizardBrowserURL"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\WizardBrowser\Capabilities\FileAssociations" ".htm" "WizardBrowserHTML"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\WizardBrowser\Capabilities\FileAssociations" ".html" "WizardBrowserHTML"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\WizardBrowser\Capabilities\FileAssociations" ".xhtml" "WizardBrowserHTML"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\WizardBrowser\Capabilities\FileAssociations" ".pdf" "WizardBrowserHTML"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\WizardBrowser\Capabilities\FileAssociations" ".svg" "WizardBrowserHTML"
  WriteRegStr HKCU "Software\RegisteredApplications" "Wizard Browser" "Software\Clients\StartMenuInternet\WizardBrowser\Capabilities"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\WizardBrowserURL"
  DeleteRegKey HKCU "Software\Classes\WizardBrowserHTML"
  DeleteRegKey HKCU "Software\Clients\StartMenuInternet\WizardBrowser"
  DeleteRegValue HKCU "Software\RegisteredApplications" "Wizard Browser"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
