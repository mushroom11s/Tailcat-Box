package service

import "testing"

func TestAppendLogCapsAndCopies(t *testing.T) {
	var prev []string
	for i := 0; i < 5; i++ {
		prev = appendLog(prev, string(rune('a'+i)), 3)
	}
	if len(prev) != 3 || prev[0] != "c" || prev[2] != "e" {
		t.Fatalf("capped log: %#v", prev)
	}
	prev[0] = "mutated"
	again := appendLog([]string{"c", "d", "e"}, "f", 3)
	if again[0] != "d" {
		t.Fatalf("append reused a mutated buffer: %#v", again)
	}
}
