cd /work/bench2/pi/work
node /work/bench2/proxy.mjs 47013 /work/bench2/pi/proxy > /work/bench2/pi/proxy.log 2>&1 & PX=$!; sleep 1
date +%s%3N > ../start
PI_CODING_AGENT_DIR=/work/bench2/pi/agent /work/bench2/tools/pi/node_modules/.bin/pi -p --offline --mode json --model command-code/deepseek/deepseek-v4.1-flash --thinking max "$(cat /work/bench2/prompt.txt)" < /dev/null 2> ../stderr.txt | node /work/bench2/ts.mjs > ../events.ndjson
echo ${PIPESTATUS[0]} > ../exit; date +%s%3N > ../end; sleep 2; kill $PX
