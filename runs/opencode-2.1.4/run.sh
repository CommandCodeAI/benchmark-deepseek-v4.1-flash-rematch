cd /work/bench2/opencode2/work
node /work/bench2/proxy.mjs 47015 /work/bench2/opencode2/proxy > /work/bench2/opencode2/proxy.log 2>&1 & PX=$!; sleep 1
date +%s%3N > ../start
XDG_CONFIG_HOME=/work/bench2/opencode2/xdg/config XDG_DATA_HOME=/work/bench2/opencode2/xdg/data XDG_CACHE_HOME=/work/bench2/opencode2/xdg/cache XDG_STATE_HOME=/work/bench2/opencode2/xdg/state HOME=/work/bench2/opencode2/xdg /work/bench2/tools/opencode2/node_modules/.bin/opencode run --format json --auto "$(cat /work/bench2/prompt.txt)" < /dev/null 2> ../stderr.txt | node /work/bench2/ts.mjs > ../events.ndjson
echo ${PIPESTATUS[0]} > ../exit; date +%s%3N > ../end; sleep 2; kill $PX; pkill -f "@opencode/cli/bin/opencode.exe serve"
