package sshterm

import (
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
)

// Launch opens a system terminal attached to the bridge at addr.
func Launch(addr, token string) error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	bin, args, err := terminalArgs(runtime.GOOS, exe, addr, token, exec.LookPath)
	if err != nil {
		return err
	}
	cmd := exec.Command(bin, args...)
	detachCommand(cmd)
	return cmd.Start()
}

func terminalArgs(goos, exe, addr, token string, look func(string) (string, error)) (string, []string, error) {
	switch goos {
	case "windows":
		// start treats a quoted first argument as the window title.
		return "cmd.exe", []string{"/c", "start", "Tailcat SSH", exe, AttachArg, addr, token}, nil
	case "darwin":
		script := fmt.Sprintf(
			"tell application \"Terminal\" to do script \"exec %s %s %s %s\"",
			shellQuote(exe), AttachArg, shellQuote(addr), shellQuote(token),
		)
		return "osascript", []string{"-e", script}, nil
	default:
		// Debian/Ubuntu alias first, then common desktop defaults.
		for _, name := range []string{"x-terminal-emulator", "gnome-terminal", "ptyxis", "konsole", "xfce4-terminal", "kitty", "alacritty", "foot", "xterm"} {
			path, err := look(name)
			if err != nil {
				continue
			}
			cmd := []string{exe, AttachArg, addr, token}
			switch name {
			case "gnome-terminal", "ptyxis":
				return path, append([]string{"--"}, cmd...), nil
			case "xfce4-terminal":
				return path, append([]string{"-x"}, cmd...), nil
			case "kitty", "foot":
				return path, cmd, nil
			}
			return path, append([]string{"-e"}, cmd...), nil
		}
		return "", nil, fmt.Errorf("no system terminal found")
	}
}

func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}
