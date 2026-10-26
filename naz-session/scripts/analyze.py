#!/usr/bin/env python3
"""Recompute every number in naz-session/README.md from Naz's own DSH logs.

    pip install zstandard
    python3 naz-session/scripts/analyze.py naz-session/sessions/*.zstd

Reads only the three published session files. Prints one section per claim.
"""
import datetime as dt
import io
import json
import re
import statistics as st
import sys
from collections import Counter, defaultdict

import zstandard

IMAGE_CAP_BYTES = 1024 * 1024  # count each image at most 1 MiB, DSH resizes larger ones


def utc(ms):
    return dt.datetime.fromtimestamp(ms / 1000, dt.timezone.utc).strftime('%H:%M:%S')


def classify(message):
    if 'Error 1102' in message:
        return 'cloudflare_1102'
    if 'without finish_reason' in message:
        return 'stream_cut_off'
    if message.startswith('Connection error'):
        return 'connection_error'
    code = re.match(r'(\d{3})', message)
    return f'http_{code.group(1)}' if code else 'other'


def p(values, q):
    values = sorted(values)
    return values[min(len(values) - 1, int(q * len(values)))]


def records(path):
    with open(path, 'rb') as f:
        reader = zstandard.ZstdDecompressor().stream_reader(f)
        for line in io.TextIOWrapper(reader, encoding='utf-8'):
            yield json.loads(line)


def agent_name(path):
    return path.split('session-')[-1].split('.')[0]


def steps_of(path):
    """One entry per model step: images in context, failed attempts, final reply."""
    name = agent_name(path)
    images = image_bytes = 0
    steps, turns, current = [], [], None
    for r in records(path):
        kind, data = r['type'], r.get('data', {})
        if kind == 'tool/result':
            for part in data['message'].get('content', []):
                if part.get('type') == 'image':
                    images += 1
                    image_bytes += min(part['attachment']['bytes'], IMAGE_CAP_BYTES)
        elif kind in ('turn/start', 'turn/end'):
            turns.append((r['time'], kind, data))
        elif kind == 'step/start':
            current = {
                'agent': name, 'turn': data['turn'], 'step': data['step'],
                'start': r['time'], 'starts': [r['time']], 'images': images,
                'image_bytes': image_bytes, 'failures': [],
            }
            steps.append(current)
        elif kind == 'llm/retry-started' and current:
            current['starts'].append(r['time'])
        elif kind == 'assistant/attempt' and current:
            stream = data['stream']
            reason = stream[-1]['chunk'].get('reason', {}) if stream else {}
            message = reason.get('failure', {}).get('message', '') if isinstance(reason, dict) else ''
            current['failures'].append({'end': r['time'], 'class': classify(message) if stream else 'empty_attempt'})
        elif kind == 'assistant/message' and current and 'usage' in data:
            stream = data['stream']
            current['first_token'] = stream[0].get('time', stream[0].get('time0'))
        elif kind == 'step/end' and current:
            current['end'] = r['time']
    return name, steps, turns


def main(paths):
    agents = {}
    for path in paths:
        name, steps, turns = steps_of(path)
        agents[name] = (steps, turns)
    every = [s for steps, _ in agents.values() for s in steps]

    print('== 1. Agents, lifetimes, screenshots in context')
    for name, (steps, turns) in agents.items():
        end = max(s.get('end', s['start']) for s in steps)
        top = max(steps, key=lambda s: s['images'])
        print(f"{name:7} {utc(steps[0]['start'])} -> {utc(end)} UTC  {(end - steps[0]['start']) / 1000:8.0f}s"
              f"  steps={len(steps):3}  screenshots={top['images']:2}  image bytes per request up to"
              f" {top['image_bytes'] / 1e6:.1f} MB")
    print('screenshots total:', sum(max(s['images'] for s in steps) for steps, _ in agents.values()))

    print('\n== 2. Lead turns (what each turn was, how it ended)')
    for time, kind, data in agents['lead'][1]:
        reason = data.get('reason', {})
        print(utc(time), kind, data.get('turn'), reason.get('kind', ''))

    print('\n== 3. Failed attempts by class')
    print(Counter(f['class'] for s in every for f in s['failures']))
    for name, (steps, _) in agents.items():
        print(f"  {name:7}", Counter(f['class'] for s in steps for f in s['failures']))

    print('\n== 4. TTFT, three ways')
    from_step = [(s['first_token'] - s['starts'][0]) / 1000 for s in every if 'first_token' in s]
    from_attempt = [(s['first_token'] - s['starts'][-1]) / 1000 for s in every if 'first_token' in s]
    no_images = [(s['first_token'] - s['starts'][-1]) / 1000 for s in every if 'first_token' in s and s['images'] == 0]
    for label, values in (('from step start, retries and waits included (his method)', from_step),
                          ('successful attempt only', from_attempt),
                          ('successful attempt, no screenshots in context', no_images)):
        print(f"  {label}: n={len(values)} avg={st.mean(values):.1f}s p50={st.median(values):.1f}s p95={p(values, .95):.1f}s")

    print('\n== 5. TTFT and failures by screenshots in context')
    def bucket(n):
        return '0' if n == 0 else '1-5' if n <= 5 else '6-10' if n <= 10 else '11-20' if n <= 20 else '21+'
    ttft, fails = defaultdict(list), Counter()
    for s in every:
        fails[bucket(s['images'])] += len(s['failures'])
        if 'first_token' in s:
            ttft[bucket(s['images'])].append((s['first_token'] - s['starts'][-1]) / 1000)
    for b in ('0', '1-5', '6-10', '11-20', '21+'):
        v = ttft[b]
        print(f"  {b:>5} screenshots: ok={len(v):3} failed={fails[b]:3} ttft p50={st.median(v):5.1f}s p95={p(v, .95):5.1f}s")

    print('\n== 6. Failure rate by phase (attempts that failed / all attempts)')
    lead_end = next(t for t, k, d in agents['lead'][1] if k == 'turn/end')
    phases = [('lead alone', 0, agents['critic'][0][0]['start']),
              ('3 agents concurrent', agents['critic'][0][0]['start'], lead_end),
              ('prover alone, lead already failed', lead_end, agents['prover'][0][-1]['start'] + 1),
              ('audit turn', agents['prover'][0][-1]['start'] + 1, 1 << 62)]
    for label, lo, hi in phases:
        inside = [s for s in every if lo <= s['start'] < hi]
        failed = sum(len(s['failures']) for s in inside)
        total = failed + sum('first_token' in s for s in inside)
        print(f"  {label:34} {failed:3}/{total:3} = {failed / max(total, 1) * 100:4.0f}%")

    print('\n== 7. Simultaneous failures (2+ agents failing within 50 ms)')
    ends = sorted((f['end'], s['agent']) for s in every for f in s['failures'])
    together = sum(1 for (t1, a1), (t2, a2) in zip(ends, ends[1:]) if t2 - t1 <= 50 and a1 != a2)
    print('  ', together)


if __name__ == '__main__':
    main(sys.argv[1:])
