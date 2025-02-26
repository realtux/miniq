# insert job
curl http://127.0.0.1:8282/jobs \
    -H 'content-type: application/json' \
    -d '{"channel": "master", "priority": 1, "data": "1"}'

# wait for a job
curl http://127.0.0.1:8282/jobs/master
