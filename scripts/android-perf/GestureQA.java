import android.os.SystemClock;
import android.view.InputDevice;
import android.view.InputEvent;
import android.view.MotionEvent;
import java.lang.reflect.Method;

public final class GestureQA {
  private static Object manager;
  private static Method inject;
  private static long started;

  private static void send(int action, float x, float y) throws Exception {
    final MotionEvent e = MotionEvent.obtain(started, SystemClock.uptimeMillis(), action, x, y, 0);
    e.setSource(InputDevice.SOURCE_TOUCHSCREEN);
    try {
      if (!Boolean.TRUE.equals(inject.invoke(manager, e, 0))) {
        throw new IllegalStateException("touch event not injected");
      }
    } finally {
      e.recycle();
    }
  }

  public static void main(String[] args) throws Exception {
    final Class<?> api = Class.forName("android.hardware.input.InputManagerGlobal");
    manager = api.getMethod("getInstance").invoke(null);
    inject = api.getMethod("injectInputEvent", InputEvent.class, int.class);
    if (args.length == 0) {
      System.out.println("InputManagerGlobal injection available");
      return;
    }
    final float startX = Float.parseFloat(args[0]), startY = Float.parseFloat(args[1]);
    final float centerX = Float.parseFloat(args[2]), centerY = Float.parseFloat(args[3]);
    final float radiusX = Float.parseFloat(args[4]), radiusY = Float.parseFloat(args[5]);
    final float outsideX = Float.parseFloat(args[6]), outsideY = Float.parseFloat(args[7]);
    final int repeats = Integer.parseInt(args[8]);
    final boolean commit = args.length == 10 && args[9].equals("commit");
    started = SystemClock.uptimeMillis();
    send(MotionEvent.ACTION_DOWN, startX, startY);
    SystemClock.sleep(90);
    for(int i=1;i<=14;i++) {
      send(MotionEvent.ACTION_MOVE,startX+(centerX-startX)*i/14,startY+(centerY-startY)*i/14);
      SystemClock.sleep(15);
    }
    System.out.println("held at a placement anchor");
    for (int j = 0; j < 24; j++) { send(MotionEvent.ACTION_MOVE, centerX + j % 2, centerY); SystemClock.sleep(125); }
    final long moving=SystemClock.uptimeMillis();
    for(int i=0;i<repeats;i++) {
      final double phase = Math.PI * 2*i/36;
      send(MotionEvent.ACTION_MOVE,centerX + radiusX*(float)Math.sin(phase), centerY+radiusY*(float)Math.cos(phase));
      SystemClock.sleep(15);
    }
    System.out.println("sent "+repeats+" circular moves in "+(SystemClock.uptimeMillis()-moving)+" ms");
    if(commit) {
      send(MotionEvent.ACTION_MOVE,centerX,centerY);
      SystemClock.sleep(250);
      send(MotionEvent.ACTION_UP,centerX,centerY);
    } else {
      send(MotionEvent.ACTION_MOVE,outsideX,outsideY);
      System.out.println("held outside the board with the same pointer");
      SystemClock.sleep(2200);
      send(MotionEvent.ACTION_CANCEL,outsideX,outsideY);
    }
    System.out.println("gesture finished");
  }
}

