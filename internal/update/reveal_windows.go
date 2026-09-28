//go:build windows

package update

import (
	"os/exec"
	"syscall"
)

// revealFile selects path in Explorer. CmdLine bypasses Go EscapeArg so Explorer
// sees /select,"…" quotes literally; otherwise it opens the parent folder.
func revealFile(path string) error {
	cmd := exec.Command("explorer")
	cmd.SysProcAttr = &syscall.SysProcAttr{CmdLine: `explorer /select,"` + path + `"`}
	return cmd.Start()
}

func openDir(path string) error {
	cmd := exec.Command("explorer")
	cmd.SysProcAttr = &syscall.SysProcAttr{CmdLine: `explorer "` + path + `"`}
	return cmd.Start()
}
