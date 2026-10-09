package chat

import "fmt"

// Call outcomes a call record can carry. Each side writes its own record when
// the call ends; nothing goes over the wire.
var callOutcomes = map[string]bool{
	"completed": true,
	"declined":  true,
	"cancelled": true,
	"missed":    true,
	"failed":    true,
}

// RecordCall appends a local "call" entry to the transcript. Direction is
// "out" when this side placed the call and "in" when the peer did. Mode is
// voice, video, or screen and lands in Body; the outcome lands in Code.
func (s *Service) RecordCall(mode, outcome string, outgoing bool, durationSec int) error {
	if mode != "voice" && mode != "video" && mode != "screen" {
		return fmt.Errorf("invalid call record")
	}
	if !callOutcomes[outcome] {
		return fmt.Errorf("invalid call record")
	}
	if durationSec < 0 || outcome != "completed" {
		durationSec = 0
	}
	direction := "in"
	if outgoing {
		direction = "out"
	}
	msg := newMessage(direction, "call", outcome, mode)
	msg.Duration = durationSec
	s.mu.Lock()
	if s.sess == nil {
		s.mu.Unlock()
		return fmt.Errorf("room is not running")
	}
	sid := s.sess.ID
	s.messages = append(s.messages, msg)
	s.mu.Unlock()
	s.emitMessage(sid, msg)
	return nil
}
