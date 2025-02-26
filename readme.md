## miniq by [tux](https://github.com/realtux)
miniq is a high performance minimal job queue with support for both http and websocket producers and consumers.

#### usage with docker (recommended)
```bash
# foreground
docker run \
    --name miniq \
    --restart unless-stopped \
    -p 8282:8282 \
    ghcr.io/realtux/miniq:latest

# background
docker run -d \
    --name miniq \
    --restart unless-stopped \
    -p 8282:8282 \
    ghcr.io/realtux/miniq:latest

# background with persistence and/or custom config
docker run -d \
    --name miniq \
    --restart unless-stopped \
    -p 8282:8282 \
    -v /path/to/persist.json:/app/data/persist.json \
    -v /path/to/config.json:/app/data/config.json \
    ghcr.io/realtux/miniq:latest

# with node.js
git clone https://github.com/realtux/miniq
cd miniq
npm i
npm start
```

#### usage from source
```bash
# with node.js
git clone https://github.com/realtux/miniq
cd miniq
npm i
npm start
```

#### performance

`miniq` uses a `min-heap priority queue` with an insertion and removal time complexity of `o(log n)`. the following benchmarks were observed running `miniq` using a single cpu on an i9-14900kf with 50,000,000 jobs of random priorities in memory. both the producers and consumers were parallelized over four processes in order to saturate the `miniq` process.

#### throughput (without http/ws overhead)
- `12mil/sec` production rate
- `5mil/sec` consumption rate

#### throughput (typical)
- `20k/sec` jobs produced over http
- `18k/sec` jobs consumed over http
- `140k/sec` jobs produced over websockets
- `124k/sec` jobs consumed over websockets

`miniq` scales extremely well maintaining the above throughput even with gigabytes of jobs in memory. you'll run out of memory before creating any noticeable degradation in throughput.

### configuration
below is the configuration file for `miniq`. it is optional and if not supplied will use the below values by default.
```json
{
    "server": {
        "host": "0.0.0.0",
        "port": 8282
    },
    "persistence": {
        "enabled": true,
        "interval": 60
    }
}
```
- `server`
  - `host` - host to run on, `0.0.0.0` for all hosts
  - `port` - port to run on
- `persistence`
  - `enabled` - whether or not to persist the queue to disk
  - `interval` - how often in seconds to persist to disk

---

### documentation

base url is `http://127.0.0.1:8282` for http and `ws://127.0.0.1:8282` from websockets

#### utility apis

##### get `/`
this will return some system status information.
###### response
```json
{
    "name": "miniq",
    "version": "x.x.x",
    "timestamp": "2025-02-25T12:34:56.789Z",
    "system": {
        "pid": 12345,
        "cpus": 8
    },
    "jobs": {
        "master": 3
    },
    "idle_workers": {
        "http": {
            "master": 2
        },
        "ws": {
            "master": 1
        }
    }
}
```

##### get `/channels/[channel name]/jobs`
this will return a list of jobs associated with a given channel.
###### response
```json
[
    {
        "channel": "master",
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "timestamp": "2025-02-25T12:34:56.789Z",
        "priority": 0,
        "data": "string, json, whatever"
    },
    {
        "channel": "master",
        "id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
        "timestamp": "2025-02-25T12:34:56.789Z",
        "priority": 0,
        "data": "string, json, whatever"
    }
]
```

##### get `/channels/[channel name]/jobs?id=[uuid]`
this will return a list of jobs associated with a given channel.
###### response
```json
{
    "channel": "master",
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2025-02-25T12:34:56.789Z",
    "priority": 0,
    "data": "string, json, whatever"
}
```

---

#### producer examples

insert a job into the queue. channel name defaults to `master` if not supplied, priority defaults to `0` if not supplied.

##### post `/jobs/[channel name]`
###### request
```json
{
    "priority": 0,
    "data": "string, json, whatever"
}
```
###### response
```json
{
    "status": "queued",
    "id": "6ba7b811-9dad-11d1-80b4-00c04fd430c8"
}
```

##### websockets
###### request
```json
{
    "type": "produce",
    "channel": "master",
    "priority": 1,
    "data": "string, json, whatever"
}
```
###### response
```json
{
    "status": "queued",
    "id": "6ba7b811-9dad-11d1-80b4-00c04fd430c8"
}
```
*jobs can be inserted rapid fire while ignoring the response*

---

#### consumer examples

consume the next available job from a specific channel.

##### get `/jobs/[channel name]`
###### response
```json
{
    "channel": "[channel name]",
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2025-02-25T12:34:56.789Z",
    "priority": 0,
    "data": "string, json, whatever"
}
```
*connection will hang until a job becomes available.*

##### websockets
###### request
```json
{
    "op": "consume",
    "channel": "[channel name]"
}
```
###### response
```json
{
    "channel": "[channel name]",
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2025-02-25T12:34:56.789Z",
    "priority": 0,
    "data": "string, json, whatever"
}
```
*if a job is available it will be delivered instantly, if not job is available it will be delivered as soon as one is produced. after a job is processed by the consumer, send the above packet again*
