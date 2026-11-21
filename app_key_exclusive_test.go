package main

import (
	"strings"
	"testing"

	"github.com/mushroom11s/tailcat-box/internal/adapter"
)

func TestNamedKeyCannotListenInTwoPlaces(t *testing.T) {
	t.Setenv("TAILCAT_ADAPTER", "fake")
	dir := t.TempDir()
	t.Setenv("TAILCAT_KEYS_DIR", dir+"/keys")
	t.Setenv("TAILCAT_SETTINGS_DIR", dir+"/settings")
	t.Setenv("TAILCAT_CHAT_DIR", dir+"/chat")
	t.Setenv("TAILCAT_MIAO_DIR", dir+"/miao")
	a := NewApp()
	if _, err := a.CreateKey("home", false, ""); err != nil {
		t.Fatal(err)
	}

	room, err := a.StartChatRoom("home")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := a.StartRemoteHostKey("home"); err == nil || !strings.Contains(err.Error(), "chat room") {
		t.Fatalf("remote with a room key: %v", err)
	}
	if _, err := a.StartPortServe([]adapter.PortMapping{{LocalPort: 18080}}, "home"); err == nil || !strings.Contains(err.Error(), "chat room") {
		t.Fatalf("port with a room key: %v", err)
	}
	if err := a.StopChatRoom(room.ID); err != nil {
		t.Fatal(err)
	}

	if _, err := a.StartRemoteHostKey("home"); err != nil {
		t.Fatal(err)
	}
	if _, err := a.StartChatRoom("home"); err == nil || !strings.Contains(err.Error(), "remote control") {
		t.Fatalf("room with a remote key: %v", err)
	}
	if _, err := a.StartPortServe([]adapter.PortMapping{{LocalPort: 18081}}, "home"); err == nil || !strings.Contains(err.Error(), "remote control") {
		t.Fatalf("port with a remote key: %v", err)
	}
	a.EndRemote()

	port, err := a.StartPortServe([]adapter.PortMapping{{LocalPort: 18082}}, "home")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := a.StartRemoteHostKey("home"); err == nil || !strings.Contains(err.Error(), "port serve") {
		t.Fatalf("remote with a port key: %v", err)
	}
	if err := a.StopSession(port.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := a.StartRemoteHostKey("home"); err != nil {
		t.Fatalf("key should be free after the port stops: %v", err)
	}
}
