cd /work/bench/deepseek-v4.1-flash-fast/work
date +%s%3N > ../start
COMMAND_CODE_API_KEY="$CMD_API_KEY" cmd -p "$(cat /work/bench/prompt.txt)" -m deepseek/deepseek-v4.1-flash-fast --effort max --output-format json --yolo --trust --skip-onboarding --no-auto-update --max-turns 400 2> ../stderr.txt | node /work/bench/ts.mjs > ../events.ndjson
echo $? > ../exit
date +%s%3N > ../end
