cd /work/bench2/opencode/work
node /work/bench2/proxy.mjs 47012 /work/bench2/opencode/proxy > /work/bench2/opencode/proxy.log 2>&1 & PX=$!; sleep 1
date +%s%3N > ../start
XDG_CONFIG_HOME=/work/bench2/opencode/xdg/config XDG_DATA_HOME=/work/bench2/opencode/xdg/data XDG_CACHE_HOME=/work/bench2/opencode/xdg/cache XDG_STATE_HOME=/work/bench2/opencode/xdg/state /work/bench2/tools/opencode/node_modules/.bin/opencode run --print-logs --log-level INFO --format json --auto "$(cat /work/bench2/prompt.txt)" < /dev/null 2> ../stderr.txt | node /work/bench2/ts.mjs > ../events.ndjson
echo ${PIPESTATUS[0]} > ../exit; date +%s%3N > ../end; sleep 2; kill $PX
