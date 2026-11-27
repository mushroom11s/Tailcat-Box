package adapter

import (
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/tailscale/tailcat"
	"tailscale.com/types/key"
)

func TestPrepareServeMappings(t *testing.T) {
	if _, _, err := prepareServeMappings(nil); err == nil {
		t.Fatal("expected an error for no mappings")
	}
	if _, _, err := prepareServeMappings([]PortMapping{{LocalPort: 0}}); err == nil || !strings.Contains(err.Error(), "non-zero") {
		t.Fatalf("port 0: %v", err)
	}

	dir := t.TempDir()
	plain := filepath.Join(dir, "plain")
	if err := os.WriteFile(plain, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, _, err := prepareServeMappings([]PortMapping{{LocalPort: 8022, Socket: plain}}); err == nil || !strings.Contains(err.Error(), "Unix socket") {
		t.Fatalf("plain file: %v", err)
	}

	sock := filepath.Join(dir, "app.sock")
	ln, err := net.Listen("unix", sock)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = ln.Close() })

	byPort, catchAll, err := prepareServeMappings([]PortMapping{
		{LocalPort: 8022, Socket: sock},
		{LocalPort: 0, Socket: sock},
	})
	if err != nil {
		t.Fatal(err)
	}
	if catchAll == nil || catchAll.LocalPort != 0 {
		t.Fatalf("catch-all: %+v", catchAll)
	}
	network, addr := byPort[8022].dialSpec()
	if network != "unix" || addr != sock {
		t.Fatalf("dial spec %s %s", network, addr)
	}
	network, addr = (PortMapping{LocalPort: 8080, RemoteHost: "printer.lan", RemotePort: 5555}).dialSpec()
	if network != "tcp" || addr != "printer.lan:5555" {
		t.Fatalf("host dial spec %s %s", network, addr)
	}
}

func TestAllowHook(t *testing.T) {
	pub := key.NewNode().Public()
	other := key.NewNode().Public()

	srv := &tailcat.Server{}
	if err := applySSHAllowlist(srv, SSHServeOpts{RestrictClients: true}); err != nil {
		t.Fatal(err)
	}
	if srv.AllowClient == nil || srv.AllowClient(pub) {
		t.Fatal("empty allow list should deny every client")
	}

	srv = &tailcat.Server{}
	if err := applySSHAllowlist(srv, SSHServeOpts{RestrictClients: true, AllowedNodeKeys: []string{pub.String()}}); err != nil {
		t.Fatal(err)
	}
	if !srv.AllowClient(pub) || srv.AllowClient(other) {
		t.Fatal("listed key should be the only client allowed")
	}

	srv = &tailcat.Server{}
	if err := applySSHAllowlist(srv, SSHServeOpts{AllowAny: true, RestrictClients: true, AllowedNodeKeys: []string{pub.String()}}); err != nil {
		t.Fatal(err)
	}
	if srv.AllowClient != nil {
		t.Fatal("allow any should leave the hook unset")
	}
}

func TestAccessLine(t *testing.T) {
	line := accessLine(accessRecord{Op: "open", Peer: "nodekey:abc", Proto: "tcp", Port: 8080, Via: "direct:1.2.3.4:1"})
	if !strings.Contains(line, `"op":"open"`) || !strings.Contains(line, `"port":8080`) {
		t.Fatal(line)
	}
}
