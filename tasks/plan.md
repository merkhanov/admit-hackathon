# Implementation Plan: Motion Dance — Multiplayer + 5 Songs + Mobile

## Overview
Close remaining gaps: (1) multiplayer lobby, (2) cross-device sync, (3) 5 songs + per-song VFX, (4) per-player live scoreboard, (5) phone support.

## Architecture Decisions
- **Multiplayer transport**: BroadcastChannel (same-device tabs) + WebRTC data channels (cross-device) with a minimal WebSocket signaling relay. Never transmit video/landmarks — each client runs MediaPipe locally.
- **Host-authoritative**: first joiner is host; host owns room state, song clock, podium aggregation.
- **Song registry**: `SONGS: Record<SongId, Song>` replacing hardcoded `SONG`; lobby song selector; per-song VFX palette.
- **Player name**: persisted in localStorage, prompted in lobby.
- **Mobile**: responsive CSS, camera permission handling for iOS.

## Task List
### Phase 1: Multiplayer Infrastructure
- T1: Signaling server (Node ws relay, Fly.io)
- T2: Multiplayer types + pure session reducer + persistence + tests
- T3: BroadcastChannel transport
- T4: WebRTC client transport
- T5: Multiplayer orchestrator wired into main.ts

### Phase 2: UI Layer
- T6: Name input + persistence
- T7: Lobby screen (create/join room, player list, song selector, start)
- T8: Live scoreboard overlay
- T9: Shared podium / results

### Phase 3: Songs + VFX
- T10: Song registry + selector
- T11: Songs 2-5 choreography
- T12: Per-song VFX

### Phase 4: Mobile
- T13: Mobile camera + permissions
- T14: Responsive UI

### Phase 5: Integration + Deploy
- T15: Full integration test
- T16: Deploy signaling server
- T17: Final polish + regression tests

## Risks
- WebRTC ICE fails on some networks -> TURN fallback / BroadcastChannel same-device
- Signaling server downtime -> Fly.io auto-restart, graceful degradation
- Mobile camera denied -> clear instructions
- Song timing desync -> host broadcasts songStart with timestamp
- Scope creep -> vertical slices, songs 2-3 before 4-5
