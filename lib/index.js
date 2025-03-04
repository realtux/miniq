import express from 'express';
import { promises as fs } from 'fs';
import { DateTime } from 'luxon';
import os from 'node:os';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { WebSocketServer } from 'ws';

const dir_name = path.dirname(fileURLToPath(import.meta.url));
const config_file = path.join(dir_name, '../data/config.json');
const backup_file = path.join(dir_name, '../data/persist.json');

let config = {
    server: {
        host: '0.0.0.0',
        port: 8282
    },
    persistence: {
        enabled: true,
        interval: 60
    }
};

try {
    const is_obj = item => {
        return (item && typeof item === 'object' && !Array.isArray(item));
    }

    const deep_merge = (target, source) => {
        for (const key in source) {
            if (source.hasOwnProperty(key)) {
                if (is_obj(target[key]) && is_obj(source[key])) {
                    deep_merge(target[key], source[key]);
                } else {
                    target[key] = source[key];
                }
            }
        }
        return target;
    }

    let data = await fs.readFile(config_file, 'utf8');
    data = JSON.parse(data);

    deep_merge(config, data);
} catch (e) {
    // do nothing
    console.log(e);
}

const app = express();
app.use(express.json());

const server = app.listen(config.server.port, () => {
    console.log(`miniq running on port ${config.server.port}`);
});

const wss = new WebSocketServer({ server });

class HeapQueue {
    constructor() {
        this.heap = [];
    }

    enqueue(job) {
        const score = (job.priority * 1000000) + (job.timestamp % 1000000);
        this.heap.push({ score, job });
        this.bubble_up(this.heap.length - 1);
    }

    dequeue() {
        const length = this.heap.length;

        if (length === 0) {
            return null;
        }

        const is_single_element = length === 1;

        if (is_single_element) {
            return this.heap.pop().job;
        }

        const min = this.heap[0].job;
        this.heap[0] = this.heap.pop();
        this.sink_down(0);
        return min;
    }

    size() {
        return this.heap.length;
    }

    to_array() {
        return this.heap.map(item => item.job);
    }

    sorted_array() {
        const sorted = [...this.heap].sort((a, b) => a.score - b.score);
        return sorted.map(item => item.job);
    }

    bubble_up(index) {
        const element = this.heap[index];

        while (index > 0) {
            const parent_index = Math.floor((index - 1) / 2);
            const parent = this.heap[parent_index];
            const should_stop = element.score >= parent.score;

            if (should_stop) {
                break;
            }

            this.heap[index] = parent;
            this.heap[parent_index] = element;
            index = parent_index;
        }
    }

    sink_down(index) {
        const length = this.heap.length;
        const element = this.heap[index];

        while (true) {
            let left_child_idx = 2 * index + 1;
            let right_child_idx = 2 * index + 2;
            let swap = null;

            if (left_child_idx < length) {
                const left_score = this.heap[left_child_idx].score;

                if (left_score < element.score) {
                    swap = left_child_idx;
                }
            }

            if (right_child_idx < length) {
                const right_score = this.heap[right_child_idx].score;

                if (swap === null) {
                    if (right_score < element.score) {
                        swap = right_child_idx;
                    }
                } else {
                    if (right_score < this.heap[left_child_idx].score) {
                        swap = right_child_idx;
                    }
                }
            }

            if (swap === null) {
                break;
            }

            this.heap[index] = this.heap[swap];
            this.heap[swap] = element;
            index = swap;
        }
    }
}

const queues = new Map();
const consumers = new Map();

const create_job = (priority = 0, data) => {
    return {
        id: uuidv4(),
        priority,
        data,
        timestamp: Date.now()
    };
}

const validate_job_input = (priority, data, send_error) => {
    if (typeof data !== 'string') {
        send_error({ error: 'Missing required field: data' });
        return false;
    }

    if (!Number.isInteger(priority) || priority < -2147483648 || priority > 2147483647) {
        send_error({ error: 'Priority must be a 32-bit signed integer' });
        return false;
    }

    return true;
}

const get_next_job = channel => {
    const queue = queues.get(channel);

    if (!queue || queue.size() === 0) {
        return null;
    }

    const job = queue.dequeue();

    if (queue.size() === 0) {
        queues.delete(channel);
    }

    return job;
}

const notify_consumers = channel => {
    if (!consumers.has(channel)) {
        return;
    }

    if (!queues.has(channel) && queues.get(channel).size() > 0) {
        return;
    }

    const consumer_set = consumers.get(channel);
    const consumer_entry = consumer_set.values().next().value;

    if (!consumer_entry) {
        return;
    }

    const job = get_next_job(channel);

    if (!!job) {
        const response = {
            channel,
            id: job.id,
            timestamp: DateTime.fromMillis(job.timestamp).toISO(),
            priority: job.priority,
            data: job.data
        };

        if (consumer_entry.type === 'http') {
            consumer_entry.consumer.json(response);
        } else {
            consumer_entry.consumer.send(JSON.stringify(response));
        }

        consumer_set.delete(consumer_entry);

        if (consumer_set.size === 0) {
            consumers.delete(channel);
        }
    }
}

wss.on('connection', ws => {
    let subscribed_channel = null;

    ws.on('message', message => {
        try {
            const parsed = JSON.parse(message);

            if (parsed.type === 'subscribe' && parsed.channel) {
                subscribed_channel = parsed.channel;

                if (!consumers.has(subscribed_channel)) {
                    consumers.set(subscribed_channel, new Set());
                }

                const consumer_entry = { type: 'ws', consumer: ws };
                consumers.get(subscribed_channel).add(consumer_entry);

                const job = get_next_job(subscribed_channel);

                if (!!job) {
                    ws.send(JSON.stringify({
                        channel: subscribed_channel,
                        id: job.id,
                        timestamp: DateTime.fromMillis(job.timestamp).toISO(),
                        priority: job.priority,
                        data: job.data
                    }));

                    const consumer_set = consumers.get(subscribed_channel);
                    consumer_set.delete(consumer_entry);

                    if (consumer_set.size === 0) {
                        consumers.delete(subscribed_channel);
                    }
                }
            } else {
                const is_insert = parsed.type === 'insert';

                if (is_insert) {
                    const { channel = 'master', priority = 0, data } = parsed;
                    const is_input_valid = validate_job_input(priority, data, (err) => ws.send(JSON.stringify(err)));

                    if (!is_input_valid) {
                        return;
                    }

                    const job = create_job(priority, data);

                    if (!queues.has(channel)) {
                        queues.set(channel, new HeapQueue());
                    }

                    queues.get(channel).enqueue(job);
                    notify_consumers(channel);
                    ws.send(JSON.stringify({ status: 'Job queued', id: job.id }));
                } else {
                    ws.send(JSON.stringify({ error: 'Invalid message type or missing required fields' }));
                }
            }
        } catch (error) {
            console.error('WebSocket message error:', error);
            ws.send(JSON.stringify({ error: 'Invalid message format' }));
        }
    });

    ws.on('close', () => {
        if (subscribed_channel && consumers.has(subscribed_channel)) {
            const consumer_set = consumers.get(subscribed_channel);

            for (const entry of consumer_set) {
                if (entry.type === 'ws' && entry.consumer === ws) {
                    consumer_set.delete(entry);
                    break;
                }
            }

            if (consumer_set.size === 0) {
                consumers.delete(subscribed_channel);
            }
        }
    });
});

app.get('/', async (req, res) => {
    try {
        const jobs_obj = Object.fromEntries([...queues].map(([channel, queue]) => [channel, queue.size()]));

        const idle_workers = {
            http: {},
            ws: {}
        };

        for (const [channel, consumer_set] of consumers) {
            let http_count = 0;
            let ws_count = 0;

            for (const entry of consumer_set) {
                if (entry.type === 'http') {
                    http_count++;
                } else {
                    ws_count++;
                }
            }

            if (http_count > 0) {
                idle_workers.http[channel] = http_count;
            }

            if (ws_count > 0) {
                idle_workers.ws[channel] = ws_count;
            }
        }

        res.json({
            name: 'miniq',
            version: '0.0.1',
            timestamp: DateTime.now(),
            system: {
                pid: process.pid,
                cpus: os.cpus().length
            },
            jobs: jobs_obj,
            idle_workers
        });
    } catch (error) {
        console.error('Error getting status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/channels/:channel/jobs', async (req, res) => {
    try {
        const { channel } = req.params;
        const { id } = req.query;
        const queue = queues.get(channel);
        const channel_exists = !!queue;

        if (!channel_exists) {
            res.status(404).json({ error: 'Channel not found' });
            return;
        }

        const jobs = queue.sorted_array();
        const has_id_query = !!id;

        if (has_id_query) {
            const job = jobs.find(j => j.id === id);
            const job_exists = !!job;

            if (job_exists) {
                res.json(job);
            } else {
                res.status(404).json({ error: 'Job not found' });
            }
        } else {
            res.json(jobs);
        }
    } catch (error) {
        console.error('Error getting jobs:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/jobs/:channel', async (req, res) => {
    try {
        const { channel } = req.params;
        const job = get_next_job(channel);
        const has_job = !!job;

        if (has_job) {
            res.json({
                channel,
                id: job.id,
                timestamp: DateTime.fromMillis(job.timestamp).toISO(),
                priority: job.priority,
                data: job.data
            });
        } else {
            const channel_has_no_consumers = !consumers.has(channel);

            if (channel_has_no_consumers) {
                consumers.set(channel, new Set());
            }

            const consumer_entry = { type: 'http', consumer: res };
            consumers.get(channel).add(consumer_entry);

            req.on('close', () => {
                const consumer_set = consumers.get(channel);
                const has_consumer_set = !!consumer_set;

                if (has_consumer_set) {
                    consumer_set.delete(consumer_entry);

                    const is_consumer_set_empty = consumer_set.size === 0;

                    if (is_consumer_set_empty) {
                        consumers.delete(channel);
                    }
                }
            });
        }
    } catch (error) {
        console.error('Error consuming job:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/jobs/:channel?', async (req, res) => {
    try {
        const channel = req.params.channel || 'master';
        const { priority = 0, data } = req.body;
        const is_input_valid = validate_job_input(priority, data, (err) => res.status(400).json(err));

        if (!is_input_valid) {
            return;
        }

        const job = create_job(priority, data);

        if (!queues.has(channel)) {
            queues.set(channel, new HeapQueue());
        }

        queues.get(channel).enqueue(job);

        notify_consumers(channel);

        res.status(201).json({ status: 'Job queued', id: job.id });
    } catch (error) {
        console.error('Error inserting job:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

const save_to_disk = async () => {
    try {
        const backup = Object
            .fromEntries([...queues].map(([channel, queue]) => [channel, queue.to_array()]));

        await fs.writeFile(backup_file, JSON.stringify(backup));
    } catch (error) {
        console.error('error saving queue');
    }
}

const load_from_disk = async () => {
    try {
        const data = await fs.readFile(backup_file, 'utf8');
        const backup = JSON.parse(data);

        for (const [channel, jobs] of Object.entries(backup)) {
            const queue = new HeapQueue();
            jobs.forEach(job => queue.enqueue(job));
            queues.set(channel, queue);
        }
    } catch (e) {
        console.log('persistence file empty or invalid, starting fresh');
    }
}

const initialize = async () => {
    await load_from_disk();

    if (config.persistence.enabled) {
        setInterval(save_to_disk, config.persistence.interval * 1000);
    }
}

const shutdown = async () => {
    console.log('shutting down...');

    await save_to_disk();

    server.close();
    wss.close();

    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

try {
    await initialize();
} catch (error) {
    console.error(error);
}
