import axios from 'axios'
import crypto from 'node:crypto'

let i = 0;

setInterval(() => {
    console.log(`rate: ${i}/sec`);
    i = 0;
}, 1000);

while (true) {
    await axios
        .post('http://127.0.0.1:8282/jobs', {
            channel: 'master',
            priority: crypto.randomInt(-2147483648, 2147483648),
            data: JSON.stringify({ name: 'miniq'}),
        });
    ++i;
}
