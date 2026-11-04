; UltraSweeper's Windows installer: after choosing the folder, a page asks where the game should appear
; (desktop shortcut, Start menu shortcut). The finish page then offers to start the game.
; Used by both UltraSweeper and UltraSweeper Lite (PRODUCT_NAME fills in the right name).

!ifndef BUILD_UNINSTALLER
  !include nsDialogs.nsh
  !include LogicLib.nsh

  Var DesktopBox
  Var StartMenuBox
  Var WantDesktop
  Var WantStartMenu

!endif

; The page functions live in this macro because it is expanded after the installer's page macros (MUI) are loaded.
!macro customPageAfterChangeDir
  Page custom ShortcutsPageCreate ShortcutsPageLeave

  Function ShortcutsPageCreate
    !insertmacro MUI_HEADER_TEXT "Shortcuts" "Choose where ${PRODUCT_NAME} should appear."
    nsDialogs::Create 1018
    Pop $0
    ${NSD_CreateLabel} 0 0 100% 20u "Tick the places where you want a shortcut to ${PRODUCT_NAME}. You can change these later by reinstalling."
    Pop $0
    ${NSD_CreateCheckbox} 0 28u 100% 12u "Create a shortcut on the &desktop"
    Pop $DesktopBox
    ${NSD_CreateCheckbox} 0 46u 100% 12u "Add to the &Start menu"
    Pop $StartMenuBox
    ; Remember earlier choices when going Back and Next again; tick both the first time.
    ${If} $WantDesktop == ""
      StrCpy $WantDesktop ${BST_CHECKED}
      StrCpy $WantStartMenu ${BST_CHECKED}
    ${EndIf}
    ${NSD_SetState} $DesktopBox $WantDesktop
    ${NSD_SetState} $StartMenuBox $WantStartMenu
    nsDialogs::Show
  FunctionEnd

  Function ShortcutsPageLeave
    ${NSD_GetState} $DesktopBox $WantDesktop
    ${NSD_GetState} $StartMenuBox $WantStartMenu
  FunctionEnd
!macroend

!macro customInstall
  ; A silent install (/S) skips the page, so it gets both shortcuts.
  ${If} $WantDesktop == ""
    StrCpy $WantDesktop ${BST_CHECKED}
    StrCpy $WantStartMenu ${BST_CHECKED}
  ${EndIf}
  ${If} $WantDesktop == ${BST_CHECKED}
    CreateShortCut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  ${EndIf}
  ${If} $WantStartMenu == ${BST_CHECKED}
    CreateShortCut "$SMPROGRAMS\${PRODUCT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  ${EndIf}
!macroend

!macro customUnInstall
  Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
  Delete "$SMPROGRAMS\${PRODUCT_NAME}.lnk"
!macroend
