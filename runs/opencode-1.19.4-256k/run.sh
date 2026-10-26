cd /work/bench2/opencode-256k/work
node /work/bench2/proxy.mjs 47014 /work/bench2/opencode-256k/proxy > /work/bench2/opencode-256k/proxy.log 2>&1 & PX=$!; sleep 1
date +%s%3N > ../start
OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX=256000 XDG_CONFIG_HOME=/work/bench2/opencode-256k/xdg/config XDG_DATA_HOME=/work/bench2/opencode-256k/xdg/data XDG_CACHE_HOME=/work/bench2/opencode-256k/xdg/cache XDG_STATE_HOME=/work/bench2/opencode-256k/xdg/state /work/bench2/tools/opencode/node_modules/.bin/opencode run --print-logs --log-level INFO --format json --auto "$(cat /work/bench2/prompt.txt)" < /dev/null 2> ../stderr.txt | node /work/bench2/ts.mjs > ../events.ndjson
echo ${PIPESTATUS[0]} > ../exit; date +%s%3N > ../end; sleep 2; kill $PX
