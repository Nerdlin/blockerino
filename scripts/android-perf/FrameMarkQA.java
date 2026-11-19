public final class FrameMarkQA {
  public static void main(String[] args) throws Exception {
    String[] command = new String[args.length + 2];
    command[0] = "/system/bin/input";
    command[1] = "touchscreen";
    System.arraycopy(args, 0, command, 2, args.length);
    System.out.println("begin " + System.nanoTime());
    Process process = new ProcessBuilder(command).inheritIO().start();
    int code = process.waitFor();
    System.out.println("end " + System.nanoTime());
    if (code != 0) System.exit(code);
  }
}
