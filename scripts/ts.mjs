import readline from 'node:readline'
const rl = readline.createInterface({ input: process.stdin })
rl.on('line', (l) => process.stdout.write(JSON.stringify({ t: Date.now(), l }) + '\n'))
