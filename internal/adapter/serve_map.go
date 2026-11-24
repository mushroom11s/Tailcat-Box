package adapter

import (
	"fmt"
	"io/fs"
	"net"
	"os"
	"runtime"
	"strconv"
	"strings"
)

func (m PortMapping) dialSpec() (network, addr string) {
	if sock := strings.TrimSpace(m.Socket); sock != "" {
		return "unix", sock
	}
	return "tcp", net.JoinHostPort(m.destHost(), strconv.Itoa(int(m.destPort())))
}

// prepareServeMappings checks serve targets and splits a catch-all Unix
// socket (local port 0) from ports that are mapped explicitly.
func prepareServeMappings(mappings []PortMapping) (map[uint16]PortMapping, *PortMapping, error) {
	if len(mappings) == 0 {
		return nil, nil, fmt.Errorf("at least one port mapping is required")
	}
	byPort := map[uint16]PortMapping{}
	var catchAll *PortMapping
	for _, m := range mappings {
		if err := checkServeSocket(m.Socket); err != nil {
			return nil, nil, err
		}
		if m.LocalPort == 0 {
			if strings.TrimSpace(m.Socket) == "" {
				return nil, nil, fmt.Errorf("port serve requires a non-zero local port")
			}
			if catchAll != nil {
				return nil, nil, fmt.Errorf("only one Unix socket can accept every other port")
			}
			cp := m
			catchAll = &cp
			continue
		}
		if prev, ok := byPort[m.LocalPort]; ok {
			n1, a1 := prev.dialSpec()
			n2, a2 := m.dialSpec()
			if n1 != n2 || a1 != a2 {
				return nil, nil, fmt.Errorf("port %d is mapped twice", m.LocalPort)
			}
		}
		byPort[m.LocalPort] = m
	}
	return byPort, catchAll, nil
}

// checkServeSocket reports an error when path is set but is not an
// existing Unix-domain socket. An empty path is not a socket target.
// On Windows, Go may not report AF_UNIX sockets as ModeSocket, so only
// existence is checked.
func checkServeSocket(path string) error {
	path = strings.TrimSpace(path)
	if path == "" {
		return nil
	}
	fi, err := os.Stat(path)
	if err != nil {
		return err
	}
	if runtime.GOOS != "windows" && fi.Mode().Type() != fs.ModeSocket {
		return fmt.Errorf("%s is not a Unix socket", path)
	}
	return nil
}
