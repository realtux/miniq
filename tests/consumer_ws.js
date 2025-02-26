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
    request_job();
});

const request_job = () => {
    ws.send(JSON.stringify({
        type: 'subscribe',
        channel: 'master',
    }));
}

ws.on('message', function message(data) {
    // console.log(data.toString())
    request_job();
    ++i;
});
