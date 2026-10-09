package chat

import (
	"encoding/json"
	"testing"
	"time"
)

func TestRecordCallAddsLocalTranscriptEntry(t *testing.T) {
	mem := newMemAdapter()
	svc := New(mem)
	if err := svc.RecordCall("voice", "completed", true, 5); err == nil {
		t.Fatal("record before start should fail")
	}
	if _, err := svc.Start(StartOpts{}); err != nil {
		t.Fatal(err)
	}
	_ = waitRunning(t, svc)
	drainEvents(svc)
	before := len(mem.sent)

	if err := svc.RecordCall("voice", "completed", true, 192); err != nil {
		t.Fatal(err)
	}
	if err := svc.RecordCall("screen", "declined", false, 40); err != nil {
		t.Fatal(err)
	}
	for _, bad := range [][2]string{{"fax", "completed"}, {"video", "exploded"}, {"", ""}} {
		if err := svc.RecordCall(bad[0], bad[1], true, 0); err == nil {
			t.Fatalf("%v accepted", bad)
		}
	}
	if len(mem.sent) != before {
		t.Fatalf("call record went over the wire: %+v", mem.sent[before:])
	}

	msgs := svc.Messages()
	var calls []Message
	for _, m := range msgs {
		if m.Type == "call" {
			calls = append(calls, m)
		}
	}
	if len(calls) != 2 {
		t.Fatalf("calls=%+v", calls)
	}
	if c := calls[0]; c.Direction != "out" || c.Body != "voice" || c.Code != "completed" || c.Duration != 192 || c.ID == "" {
		t.Fatalf("completed record=%+v", c)
	}
	// Only completed calls keep a duration.
	if c := calls[1]; c.Direction != "in" || c.Body != "screen" || c.Code != "declined" || c.Duration != 0 {
		t.Fatalf("declined record=%+v", c)
	}

	got := 0
	deadline := time.After(2 * time.Second)
	for got < 2 {
		select {
		case ev := <-svc.Events():
			if ev.Kind != "message" {
				continue
			}
			var m Message
			if err := json.Unmarshal([]byte(ev.Data), &m); err != nil {
				t.Fatal(err)
			}
			if m.Type == "call" {
				got++
			}
		case <-deadline:
			t.Fatalf("emitted %d call messages", got)
		}
	}

	// Records are ordinary transcript entries: discard removes them.
	if err := svc.Discard(calls[0].ID); err != nil {
		t.Fatal(err)
	}
	for _, m := range svc.Messages() {
		if m.ID == calls[0].ID {
			t.Fatal("discard kept the call record")
		}
	}
}

func drainEvents(svc *Service) {
	for {
		select {
		case <-svc.Events():
		default:
			return
		}
	}
}

func TestHangupReasonPassesThrough(t *testing.T) {
	mem := newMemAdapter()
	svc := New(mem)
	if _, err := svc.Start(StartOpts{}); err != nil {
		t.Fatal(err)
	}
	_ = waitRunning(t, svc)
	if err := svc.Connect("tc:peer"); err != nil {
		t.Fatal(err)
	}
	before := len(mem.sent)
	if err := svc.SendSignal(`{"v":1,"type":"rtc-hangup","reason":"decline"}`); err != nil {
		t.Fatal(err)
	}
	frames := mem.sent[before:]
	if len(frames) != 1 {
		t.Fatalf("sent=%d", len(frames))
	}
	meta, _, err := Unpack(frames[0].frame)
	if err != nil {
		t.Fatal(err)
	}
	if meta["type"] != "rtc-hangup" || meta["reason"] != "decline" {
		t.Fatalf("meta=%v", meta)
	}
}
