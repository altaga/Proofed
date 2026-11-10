export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startReconcileLoop } = await import("./lib/scheduler");
    startReconcileLoop();
  }
}
