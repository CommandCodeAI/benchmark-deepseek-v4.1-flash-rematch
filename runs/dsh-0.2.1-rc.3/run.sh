cd /work/bench2/dsh-rc3/work
node /work/bench2/proxy.mjs 47016 /work/bench2/dsh-rc3/proxy > /work/bench2/dsh-rc3/proxy.log 2>&1 & PX=$!; sleep 1
date +%s%3N > ../start
DSH_HOME=/work/bench2/dsh-rc3/home DSH_TELEMETRY_MODE=DISABLED /work/bench2/tools/dsh-rc3/node_modules/.bin/dsh --profile headless --patch /work/bench2/dsh-rc3/command-code.patch.yml --json "$(cat /work/bench2/prompt.txt)" < /dev/null 2> ../stderr.txt | node /work/bench2/ts.mjs > ../events.ndjson
echo ${PIPESTATUS[0]} > ../exit; date +%s%3N > ../end; sleep 2; kill $PX
