import sys, time, json, phone
label, trials = sys.argv[1], int(sys.argv[2])
phone.run('push', str(phone.HERE / 'framemark.jar'), '/data/local/tmp/blockerino-framemark-qa.jar')
out = []
for t in range(1, trials + 1):
    phone.seed('classic', 'line'); time.sleep(6.5)
    c = phone.Collector().start()
    m1 = phone.mark('tap', 719, 1837)
    time.sleep(2.2)
    m2 = phone.mark('swipe', 260, 2747, 1308, 2445, 1650)
    time.sleep(2.2)
    rows = c.finish()
    entry = phone.summarize(rows, m1['begin'] - 50_000_000, m1['end'] + 1_800_000_000)
    drag = phone.summarize(rows, m2['begin'], m2['end'])
    clear = phone.summarize(rows, m2['end'] - 100_000_000, m2['end'] + 1_000_000_000)
    saved = phone.state()
    print(label, 'trial', t, saved, '\n  entry', entry, '\n  drag ', drag, '\n  clear', clear, flush=True)
    out.append({'entry': entry, 'drag': drag, 'clear': clear, 'saved': saved})
(phone.HERE / f'line2_{label}.json').write_text(json.dumps(out, indent=1))
