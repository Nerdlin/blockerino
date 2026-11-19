import sys, time, subprocess, phone
out = sys.argv[1]
phone.seed('classic', 'line'); time.sleep(6.5)
cfg = """
duration_ms: 6000
buffers { size_kb: 65536 fill_policy: RING_BUFFER }
data_sources { config { name: "linux.ftrace" ftrace_config {
  ftrace_events: "sched/sched_switch" ftrace_events: "sched/sched_waking"
  atrace_categories: "gfx" atrace_categories: "view" atrace_categories: "input" atrace_categories: "am" atrace_categories: "wm" atrace_categories: "res" atrace_categories: "dalvik"
  atrace_apps: "com.nerdlin.blockerino.perf" } } }
data_sources { config { name: "linux.process_stats" } }
"""
p = subprocess.Popen([phone.ADB, '-s', phone.SER, 'shell', 'perfetto -c - --txt -o /data/misc/perfetto-traces/entry.pftrace'], stdin=subprocess.PIPE, text=True)
p.stdin.write(cfg); p.stdin.close()
time.sleep(1.5)
phone.sh('input', 'tap', '719', '1837')
p.wait()
env = dict(__import__('os').environ, MSYS_NO_PATHCONV='1')
subprocess.run([phone.ADB, '-s', phone.SER, 'pull', '/data/misc/perfetto-traces/entry.pftrace', out], env=env, check=True)
