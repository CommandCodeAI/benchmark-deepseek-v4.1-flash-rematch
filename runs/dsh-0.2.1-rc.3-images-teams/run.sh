cd /work/bench3/naz-dsh/work
DSH_HOME=/work/bench3/naz-dsh/home DSH_TELEMETRY_MODE=DISABLED /work/bench3/tools/dsh-0.2.1-rc.3/node_modules/.bin/dsh plugin --profile headless list < /dev/null > /dev/null 2>&1
node -e 'const fs=require("fs"),p=process.argv[1],j=JSON.parse(fs.readFileSync(p,"utf8"));j.dsh.profile.bundles.push("@deepseek-ai/dsh-experimental-agent-team-profile");fs.writeFileSync(p,JSON.stringify(j,null,2)+"\n")' /work/bench3/naz-dsh/home/profiles/headless/package.json
node /work/bench3/tools/proxy/proxy.mjs 47018 /work/bench3/naz-dsh/proxy > /work/bench3/naz-dsh/proxy.log 2>&1 & PX=$!; sleep 1
node -e 'console.log(Date.now())' > ../start
DSH_HOME=/work/bench3/naz-dsh/home DSH_TELEMETRY_MODE=DISABLED /work/bench3/tools/dsh-0.2.1-rc.3/node_modules/.bin/dsh --profile headless --patch /work/bench3/naz-dsh/command-code.patch.yml --json "within the round 1 folder:

$(cat /work/bench3/prompt.txt)" < /dev/null 2> ../stderr.txt | node /work/bench3/ts.mjs > ../events.ndjson
echo ${PIPESTATUS[0]} > ../exit; node -e 'console.log(Date.now())' > ../end; sleep 2; kill $PX
