Unicode true

####
## Please note: Template replacements don't work in this file. They are provided with default defines like
## mentioned underneath.
## If the keyword is not defined, "wails_tools.nsh" will populate them with the values from ProjectInfo.
## If they are defined here, "wails_tools.nsh" will not touch them. This allows to use this project.nsi manually
## from outside of Wails for debugging and development of the installer.
##
## For development first make a wails nsis build to populate the "wails_tools.nsh":
## > wails build --target windows/amd64 --nsis
## Then you can call makensis on this file with specifying the path to your binary:
## For a AMD64 only installer:
## > makensis -DARG_WAILS_AMD64_BINARY=..\..\bin\app.exe
## For a ARM64 only installer:
## > makensis -DARG_WAILS_ARM64_BINARY=..\..\bin\app.exe
## For a installer with both architectures:
## > makensis -DARG_WAILS_AMD64_BINARY=..\..\bin\app-amd64.exe -DARG_WAILS_ARM64_BINARY=..\..\bin\app-arm64.exe
####
## The following information is taken from the ProjectInfo file, but they can be overwritten here.
####
## !define INFO_PROJECTNAME    "MyProject" # Default "{{.Name}}"
## !define INFO_COMPANYNAME    "MyCompany" # Default "{{.Info.CompanyName}}"
## !define INFO_PRODUCTNAME    "MyProduct" # Default "{{.Info.ProductName}}"
## !define INFO_PRODUCTVERSION "1.0.0"     # Default "{{.Info.ProductVersion}}"
## !define INFO_COPYRIGHT      "Copyright" # Default "{{.Info.Copyright}}"
###
## !define PRODUCT_EXECUTABLE  "Application.exe"      # Default "${INFO_PROJECTNAME}.exe"
## !define UNINST_KEY_NAME     "UninstKeyInRegistry"  # Default "${INFO_COMPANYNAME}${INFO_PRODUCTNAME}"
####
## !define REQUEST_EXECUTION_LEVEL "admin"            # Default "admin"  see also https://nsis.sourceforge.io/Docs/Chapter4.html
####
## Include the wails tools
####
!include "wails_tools.nsh"

# The version information for this two must consist of 4 parts
VIProductVersion "${INFO_PRODUCTVERSION}.0"
VIFileVersion    "${INFO_PRODUCTVERSION}.0"

VIAddVersionKey "CompanyName"     "${INFO_COMPANYNAME}"
VIAddVersionKey "FileDescription" "${INFO_PRODUCTNAME} Installer"
VIAddVersionKey "ProductVersion"  "${INFO_PRODUCTVERSION}"
VIAddVersionKey "FileVersion"     "${INFO_PRODUCTVERSION}"
VIAddVersionKey "LegalCopyright"  "${INFO_COPYRIGHT}"
VIAddVersionKey "ProductName"     "${INFO_PRODUCTNAME}"

# Enable HiDPI support. https://nsis.sourceforge.io/Reference/ManifestDPIAware
ManifestDPIAware true

!include "MUI.nsh"

!define MUI_ICON "..\icon.ico"
!define MUI_UNICON "..\icon.ico"
# !define MUI_WELCOMEFINISHPAGE_BITMAP "resources\leftimage.bmp" #Include this to add a bitmap on the left side of the Welcome Page. Must be a size of 164x314
!define MUI_FINISHPAGE_NOAUTOCLOSE # Wait on the INSTFILES page so the user can take a look into the details of the installation steps
!define MUI_ABORTWARNING # This will warn the user if they exit from the installer.

# Finish page: "Run Tailcat Box" checkbox, checked by default. Silent installs
# (/S) skip the finish page, so they never launch the app.
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_FUNCTION TailcatLaunchApp

!insertmacro MUI_PAGE_WELCOME # Welcome to the installer page.
# !insertmacro MUI_PAGE_LICENSE "resources\eula.txt" # Adds a EULA page to the installer
!insertmacro MUI_PAGE_DIRECTORY # In which folder install page.
!insertmacro MUI_PAGE_INSTFILES # Installing page.
!insertmacro MUI_PAGE_FINISH # Finished installation page.

!insertmacro MUI_UNPAGE_INSTFILES # Uinstalling page

!insertmacro MUI_LANGUAGE "English" # Set the Language of the installer

## The following two statements can be used to sign the installer and the uninstaller. The path to the binaries are provided in %1
#!uninstfinalize 'signtool --file "%1"'
#!finalize 'signtool --file "%1"'

Name "${INFO_PRODUCTNAME}"
OutFile "..\..\bin\${INFO_PROJECTNAME}-${ARCH}-installer.exe" # Name of the installer's file.
!ifdef WAILS_INSTALL_SCOPE
  !if "${WAILS_INSTALL_SCOPE}" == "user"
    !define TAILCAT_DEFAULT_INSTDIR "$LOCALAPPDATA\Programs\${INFO_PRODUCTNAME}"
    !define TAILCAT_UNINST_ROOT HKCU
  !else
    !define TAILCAT_DEFAULT_INSTDIR "$PROGRAMFILES64\${INFO_COMPANYNAME}\${INFO_PRODUCTNAME}"
    !define TAILCAT_UNINST_ROOT HKLM
  !endif
!else
  !define TAILCAT_DEFAULT_INSTDIR "$PROGRAMFILES64\${INFO_COMPANYNAME}\${INFO_PRODUCTNAME}"
  !define TAILCAT_UNINST_ROOT HKLM
!endif
InstallDir "${TAILCAT_DEFAULT_INSTDIR}" # Default folder for a first install; .onInit swaps in the previous install folder.
ShowInstDetails show # This will always show the installation details.

# Reads the folder of a previous install from one uninstall key into $R0
# ("" when absent). New installers write InstallLocation; installers up to
# v1.3.0 only wrote UninstallString ("C:\...\uninstall.exe"), so fall back
# to its parent folder.
!macro tailcat.readPreviousInstall ROOT
    ReadRegStr $R0 ${ROOT} "${UNINST_KEY}" "InstallLocation"
    ${If} $R0 == ""
        ReadRegStr $R1 ${ROOT} "${UNINST_KEY}" "UninstallString"
        ${If} $R1 != ""
            StrCpy $R2 $R1 1
            ${If} $R2 == '"'
                StrCpy $R1 $R1 "" 1
                StrCpy $R2 $R1 1 -1
                ${If} $R2 == '"'
                    StrCpy $R1 $R1 -1
                ${EndIf}
            ${EndIf}
            ${GetParent} $R1 $R0
        ${EndIf}
    ${EndIf}
    ${If} $R0 != ""
    ${AndIfNot} ${FileExists} "$R0\*.*"
        StrCpy $R0 "" # Folder is gone; fall back to the default.
    ${EndIf}
!macroend

Function .onInit
   !insertmacro wails.checkArchitecture

   # Upgrades go to the folder of the existing install. An explicit /D=
   # on the command line changes $INSTDIR from the default and still wins.
   StrCpy $R3 "${TAILCAT_DEFAULT_INSTDIR}"
   ${If} $INSTDIR == $R3
       SetRegView 64
       !insertmacro tailcat.readPreviousInstall ${TAILCAT_UNINST_ROOT}
       ${If} $R0 == ""
           SetRegView 32
           !insertmacro tailcat.readPreviousInstall ${TAILCAT_UNINST_ROOT}
           SetRegView 64
       ${EndIf}
       ${If} $R0 != ""
           StrCpy $INSTDIR $R0
       ${EndIf}
   ${EndIf}
FunctionEnd

# Finish-page "Run" checkbox. The installer runs elevated, so launching the
# exe directly would start Tailcat Box as admin. Handing the path to
# explorer.exe starts it through the already running (unelevated) shell,
# as the signed-in user.
Function TailcatLaunchApp
    !if "${REQUEST_EXECUTION_LEVEL}" == "admin"
        Exec '"$WINDIR\explorer.exe" "$INSTDIR\${PRODUCT_EXECUTABLE}"'
    !else
        Exec '"$INSTDIR\${PRODUCT_EXECUTABLE}"'
    !endif
FunctionEnd

Section
    !insertmacro wails.setShellContext

    !insertmacro wails.webview2runtime

    SetOutPath $INSTDIR

    !insertmacro wails.files

    CreateShortcut "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk" "$INSTDIR\${PRODUCT_EXECUTABLE}"
    CreateShortCut "$DESKTOP\${INFO_PRODUCTNAME}.lnk" "$INSTDIR\${PRODUCT_EXECUTABLE}"

    !insertmacro wails.associateFiles
    !insertmacro wails.associateCustomProtocols

    !insertmacro wails.writeUninstaller

    # Remember the folder so the next installer (upgrade) defaults to it.
    # wails.writeUninstaller left the 64-bit registry view selected; the
    # uninstaller's wails.deleteUninstaller removes the whole key.
    WriteRegStr ${TAILCAT_UNINST_ROOT} "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
SectionEnd

Section "uninstall"
    !insertmacro wails.setShellContext

    RMDir /r "$AppData\${PRODUCT_EXECUTABLE}" # Remove the WebView2 DataPath

    RMDir /r $INSTDIR

    Delete "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk"
    Delete "$DESKTOP\${INFO_PRODUCTNAME}.lnk"

    !insertmacro wails.unassociateFiles
    !insertmacro wails.unassociateCustomProtocols

    !insertmacro wails.deleteUninstaller
SectionEnd
