import sys, time, subprocess, phone
label, mode = sys.argv[1], sys.argv[2]
phone.run('push', str(phone.HERE / 'gesture.jar'), '/data/local/tmp/blockerino-gesture-qa.jar')
phone.run('push', str(phone.HERE / 'framemark.jar'), '/data/local/tmp/blockerino-framemark-qa.jar')
phone.seed(mode, 'empty'); time.sleep(6.5)
phone.sh('input', 'tap', '719', '1837'); time.sleep(3.5)
sx, sy, cx, cy, rx, ry = (260, 2747, 720, 1664, 440, 572) if mode == 'classic' else (170, 2717, 720, 1541, 440, 560)
c = phone.Collector().start()
p = subprocess.Popen([phone.ADB, '-s', phone.SER, 'shell', f'CLASSPATH=/data/local/tmp/blockerino-gesture-qa.jar app_process /system/bin GestureQA {sx} {sy} {cx} {cy} {rx} {ry} 653 2850 360'], stdout=subprocess.PIPE, text=True)
p.communicate(); time.sleep(1.0)
rows = c.finish()
lo, hi = min(rows), max(rows)
print(label, mode, phone.summarize(rows, lo, hi), 'state', phone.state(), flush=True)
