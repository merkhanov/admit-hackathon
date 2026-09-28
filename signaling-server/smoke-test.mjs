// Smoke test for the signaling server: two clients join a room, exchange an offer/answer.
import { WebSocket } from 'ws';

const URL = 'ws://localhost:8090';
const roomId = 'testroom';

function connect(peerId) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'join', roomId, peerId }));
      resolve(ws);
    });
    ws.on('error', reject);
  });
}

function waitFor(ws, type, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), timeout);
    const onMsg = (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === type) {
        clearTimeout(timer);
        ws.off('message', onMsg);
        resolve(msg);
      }
    };
    ws.on('message', onMsg);
  });
}

const a = await connect('a');
const aJoined = await waitFor(a, 'joined');
if (!aJoined.isHost) throw new Error('a should be host');

const b = await connect('b');
const bJoined = await waitFor(b, 'joined');
if (bJoined.isHost) throw new Error('b should not be host');
if (bJoined.hostId !== 'a') throw new Error('b should see a as host');

// Host should be notified a peer joined.
const peerJoined = await waitFor(a, 'peer-joined');
if (peerJoined.peerId !== 'b') throw new Error('host should see b join');

// b sends an offer to a.
const offerPromise = waitFor(a, 'offer');
b.send(JSON.stringify({ type: 'offer', roomId, to: 'a', sdp: 'fake-offer' }));
const offer = await offerPromise;
if (offer.from !== 'b' || offer.sdp !== 'fake-offer') throw new Error('offer not relayed correctly');

// a answers back to b.
const answerPromise = waitFor(b, 'answer');
a.send(JSON.stringify({ type: 'answer', roomId, to: 'b', sdp: 'fake-answer' }));
const answer = await answerPromise;
if (answer.from !== 'a' || answer.sdp !== 'fake-answer') throw new Error('answer not relayed correctly');

// Host promotion: close a, b should become host.
a.close();
const hostMsg = await waitFor(b, 'host');
if (hostMsg.hostId !== 'b') throw new Error('b should be promoted to host');

console.log('SIGNALING SMOKE TEST PASSED');
b.close();
process.exit(0);
