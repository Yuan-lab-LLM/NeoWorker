; NeoWorker assisted installer customizations.
; Keep the well-tested electron-builder NSIS flow while presenting a branded,
; full wizard instead of the default one-click progress dialog.

!include "WinMessages.nsh"

!macro customHeader
  !define MUI_ABORTWARNING
  !define MUI_WELCOMEPAGE_TITLE_3LINES
  !define MUI_FINISHPAGE_TITLE_3LINES
!macroend

!macro customWelcomePage
  !insertmacro MUI_PAGE_WELCOME
!macroend

!ifndef BUILD_UNINSTALLER
  Function NeoWorkerInstFilesShow
    FindWindow $0 "#32770" "" $HWNDPARENT
    GetDlgItem $1 $0 1004
    ; PBM_SETBARCOLOR uses a Windows COLORREF (BGR), so this is #0A7CFF.
    SendMessage $1 ${PBM_SETBARCOLOR} 0 0x00FF7C0A
  FunctionEnd

  !macro customPageAfterChangeDir
    !define MUI_PAGE_CUSTOMFUNCTION_SHOW NeoWorkerInstFilesShow
  !macroend
!endif

; NeoWorker installs per-user so setup does not add a redundant scope page or
; request administrator access. The assisted wizard still offers a destination
; folder, visible progress, and a proper completion page.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend
