// direct insert remove test
setTimeout(async () => {
    console.time('insert');

    for (let i = 0; i < 10000000; ++i) {
        const job = {
            priority: 1,
            data: 'asd',
            timestamp: Date.now()
        };

        if (!queues.has('master')) {
            queues.set('master', new HeapQueue());
        }

        queues.get('master').enqueue(job);
    }

    console.timeEnd('insert');

    console.time('remove');

    for (let j = 0; j < 10000000; ++j) {
        get_next_job('master');
    }

    console.timeEnd('remove');
}, 1000);
