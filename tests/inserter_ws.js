import crypto from 'node:crypto'
import WebSocket from 'ws';

let i = 0;

setInterval(() => {
    console.log(`rate: ${i}/sec`);
    i = 0;
}, 1000);

const ws = new WebSocket('ws://127.0.0.1:8282');

ws.on('error', console.error);

ws.on('open', async () => {
    send_message();
});

const send_message = () => {
    ws.send(JSON.stringify({
        type: 'insert',
        channel: 'master',
        priority: crypto.randomInt(-2147483648, 2147483648),
        data: JSON.stringify({ name: 'miniq' }),
    }));
}

ws.on('message', function message(data) {
    send_message();
    ++i;
});
