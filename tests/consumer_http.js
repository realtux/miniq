import axios from 'axios'

let i = 0;

setInterval(() => {
    console.log(`rate: ${i}/sec`);
    i = 0;
}, 1000);

while (true) {
    await axios.get('http://127.0.0.1:8282/jobs/master');
    ++i;
}
