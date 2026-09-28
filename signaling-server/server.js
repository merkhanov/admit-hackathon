// Minimal WebSocket signaling relay for Motion Dance multiplayer.
// Stateless: only helps peers discover each other and exchange WebRTC
// offer/answer/ICE. No game data, no persistence, no rooms stored on disk.
//
// Star topology: the first peer in a room is the host; every guest connects
// to the host. The server relays signaling messages between a guest and the
// host. Once WebRTC data channels are up, the server is out of the loop.
import { WebSocketServer } from 'ws';
import { createServer } from 'http';

const PORT = process.env.PORT || 8080;

// roomId -> { hostId: string|null, peers: Map<peerId, ws> }
const rooms = new Map();

const httpServer = createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

const wss = new WebSocketServer({ server: httpServer });

function send(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function roomOf(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, { hostId: null, peers: new Map() });
  return rooms.get(roomId);
}

function cleanupRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  if (room.peers.size === 0) rooms.delete(roomId);
}

wss.on('connection', (ws) => {
  let roomId = null;
  let peerId = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (msg.type) {
      case 'join': {
        roomId = msg.roomId;
        peerId = msg.peerId;
        const room = roomOf(roomId);
        room.peers.set(peerId, ws);
        if (room.hostId === null) room.hostId = peerId;
        const isHost = room.hostId === peerId;
        // Tell the joiner who the host is.
        send(ws, { type: 'joined', roomId, peerId, hostId: room.hostId, isHost });
        // Tell the host a new peer joined (so it can accept an offer).
        const hostWs = room.hostId ? room.peers.get(room.hostId) : null;
        if (hostWs && hostWs !== ws) send(hostWs, { type: 'peer-joined', roomId, peerId });
        break;
      }
      case 'offer':
      case 'answer':
      case 'ice': {
        if (!roomId) break;
        const room = rooms.get(roomId);
        if (!room) break;
        const target = room.peers.get(msg.to);
        if (target) send(target, { ...msg, from: peerId });
        break;
      }
      default:
        break;
    }
  });

  ws.on('close', () => {
    if (!roomId || !peerId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    room.peers.delete(peerId);
    if (room.hostId === peerId) {
      // Promote the next peer to host, if any.
      const next = room.peers.keys().next().value;
      room.hostId = next ?? null;
      if (next) {
        const nextWs = room.peers.get(next);
        send(nextWs, { type: 'host', roomId, hostId: next });
      }
    }
    // Notify remaining peers that this one left.
    for (const [id, pws] of room.peers) {
      if (id !== peerId) send(pws, { type: 'peer-left', roomId, peerId });
    }
    cleanupRoom(roomId);
  });
});

httpServer.listen(PORT, () => {
  console.log(`signaling server listening on :${PORT}`);
});
