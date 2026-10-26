# Naz's CommandCode GOAT run: session files and analysis

> **Disclaimer.** These are Naz's (@nothingto12) own DeepSeek Harness (DSH) session
> files, which he published himself at
> [nazzysar/commandcode-goat-ecosystem-sess](https://github.com/nazzysar/commandcode-goat-ecosystem-sess)
> (commit `3f45003`). He redacted them himself. We copied them byte for byte
> ([`sessions/SHA256SUMS`](./sessions/SHA256SUMS)) and changed nothing. The
> analysis below is ours. Every number in it comes from
> [`scripts/analyze.py`](./scripts/analyze.py), which reads only these three files.

## Our reply

Naz, your run wasn't a stock benchmark. It was ~90 screenshots across 3
concurrent Agent Teams agents, with image input on. DSH resends every image on
every turn, so each request grew toward 20 MB, times 3 agents, nonstop.

On top of that, DSH:

- retries a 1102 five times blindly, so one failure becomes six heavy requests
- replays every image during compaction
- has no image offload by default (Zayd's plugin exists for exactly this)

That's where your 91 failed calls and 48s TTFT came from. The harness kept
piling the same images on.

We ran DSH ourselves on stock config with the same model and key: rc.3 had 0
failures in 148 requests. All data is public in this repo.

We're hardening the API for heavy image payloads anyway (streaming media
upstream, 32 MB limit). Happy to rerun your exact setup side by side once it ships.

## What the logs show

### 1. Not a stock run

| | Naz's run | DSH stock (our runs) |
|---|---|---|
| Image input for V4.1 Flash | **on** (his `commandcode-goat` provider declares it) | off (DSH default for this model) |
| Screenshots taken and resent | **92** (lead 30, critic 37, prover 25) | 0 |
| Image bytes per request | **up to 19-24 MB**, on every request after the screenshot | 0 |
| Agents | **3 concurrent** (experimental Agent Teams: lead + critic + prover) | 1 |
| Result | ✕ failed | ✓ rc.3: 0 failed in 148 requests, rc.2: 3 in 160 |

DSH puts every screenshot back into every later request. A QA agent that took
25 screenshots sent all 25 again on each of its next steps, about one request a
minute, for over an hour.

### 2. The slowdown tracks the screenshots, not the model

Successful attempts only, all three agents:

| Screenshots in context | OK requests | Failed attempts | TTFT P50 | TTFT P95 |
|---|---|---|---|---|
| 0 | 74 | **0** | **3.9s** | 8.3s |
| 1-5 | 63 | 1 | 8.2s | 16.8s |
| 6-10 | 20 | 1 | 24.6s | 51.3s |
| 11-20 | 103 | 29 | 41.3s | 82.4s |
| 21+ | 90 | **67** | **64.9s** | 125.0s |

With no screenshots in context, his own run had **0 failures and a 3.9s P50
TTFT**, in line with our runs. The lead agent working alone, before the two
helper agents started, also had **0 failures in 72 attempts**.

| Phase | Failed / all attempts |
|---|---|
| Lead alone (15:31-16:15 UTC) | **0 / 72 (0%)** |
| 3 agents concurrent (16:15-17:37) | 80 / 287 (28%) |
| Prover alone, after the lead's turn had already failed (17:37-18:43) | 13 / 52 (25%) |
| The audit turn that produced his numbers (18:44-19:28) | 5 / 37 (14%) |

### 3. "2h 28m 04s" is a stalled helper agent, not the run

His total time is the lifetime of the **prover** QA subagent (DSH's own
`settledMs: 8884627` = 2h 28m 04.6s, 16:15:06 to 18:43:11 UTC), which he
stopped by hand. It is not the build time.

- The lead's build turn ran 15:31:29 to 17:37:34 (2h 06m) and **ended in an
  error**.
- For the next **66 minutes nothing was being built**. Only the prover kept
  going on its own, rerunning QA scripts and re-reading screenshots, with 19-25
  images riding along on each of its 52 attempts. Each step took 1-4 minutes.
- At 18:43 he aborted it. That moment is where "2h 28m 04s" ends.

### 4. The TTFT numbers were computed by the agent, including its own retries

The 48.12s average and 154.47s P95 were not measured by a tool. He asked the
same DSH agent, in the same session, to "audit this whole conversation" (turn 3,
18:44 UTC), and it wrote the numbers itself:

- TTFT was measured **from step start**, so it includes every failed attempt
  and every retry backoff wait before the first token.
- It includes **26 calls from the audit turn itself**, which ran after the build
  with 30 screenshots still in context.
- The same audit also computed per-agent numbers for calls with no retries
  (lead P50 16.81s / P95 90.17s). Those did not make the post.

Recomputed from the logs:

| TTFT | n | Avg | P50 | P95 |
|---|---|---|---|---|
| From step start, retries and waits included (his method) | 350 | 51.8s | 29.1s | 179.2s |
| Successful attempt only | 350 | 36.2s | 29.1s | 99.6s |
| Successful attempt, no screenshots in context | 74 | **4.3s** | **3.9s** | **8.3s** |

### 5. The failures

98 failed attempts across the three agents (his post says 91, his repo says 94;
both were counted mid-audit while the session was still running):

| Class | Count |
|---|---|
| HTTP 503, Cloudflare Error 1102 "Worker exceeded resource limits" | 59 |
| Connection error, no HTTP response | 19 |
| Stream cut off without finish_reason | 18 |
| Empty attempt (user abort) | 2 |
| Timeouts | **0** |

1102 means the Worker serving the request ran out of memory. Each of these
requests carried up to ~20 MB of base64 images, and three agents sent them at
once and again on every retry. In 16 cases two agents failed within 50 ms of
each other: one worker running out of memory ends every stream on it. That is
the part on our side, and the reason we're changing how the API handles large
image bodies (media streamed upstream as bytes instead of parsed as strings,
32 MB limit). The same DSH, stock, with no images, ran clean on the same API.

## What his repo and post leave out

- **Image input on, 92 screenshots, Agent Teams with 3 concurrent agents.**
  Neither the post nor the session repo mentions any of these. All three are
  visible only inside the logs.
- **What "total time" measures.** It is a helper agent's lifetime ending in a
  manual stop, after the build had already failed.
- **How TTFT was measured.** By the model, from step start, retries included,
  audit turn included.
- **Like-for-like settings for the other two providers.** The DeepSeek API and
  OpenCode Go columns have no published logs, so there is no way to tell
  whether they ran with image input and Agent Teams too.

## Reproduce

```
pip install zstandard
python3 naz-session/scripts/analyze.py naz-session/sessions/*.zstd
```

Files:

```
sessions/session-lead.redacted.jsonl.zstd     lead agent, 1,123 events
sessions/session-critic.redacted.jsonl.zstd   critic subagent, 582 events
sessions/session-prover.redacted.jsonl.zstd   prover subagent, 1,091 events
sessions/SHA256SUMS                           checksums, identical to his repo
scripts/analyze.py                            every number on this page
```

An unredacted copy of the lead session was also shared with us. It matches the redacted
lead file event for event, but it carries his username and home paths, so we
publish only his own redacted copies.
