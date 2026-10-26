cd /work/bench2/dsh/work
node /work/bench2/proxy.mjs 47011 /work/bench2/dsh/proxy > /work/bench2/dsh/proxy.log 2>&1 & PX=$!; sleep 1
date +%s%3N > ../start
DSH_HOME=/work/bench2/dsh/home DSH_TELEMETRY_MODE=DISABLED /work/bench2/dsh/node_modules/.bin/dsh --profile headless --patch /work/bench2/dsh/command-code.patch.yml --json "$(cat /work/bench2/prompt.txt)" < /dev/null 2> ../stderr.txt | node /work/bench2/ts.mjs > ../events.ndjson
echo ${PIPESTATUS[0]} > ../exit; date +%s%3N > ../end; sleep 2; kill $PX
