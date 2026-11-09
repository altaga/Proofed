import { reconcileOrders } from "./orders";

let started = false;

export function startReconcileLoop() {
  if (started) return;
  if (process.env.DISABLE_RECONCILE_LOOP === "1") return;
  started = true;
  const tick = async () => {
    try {
      await reconcileOrders(15);
    } catch (error) {
      console.error("reconcile_loop_error", error instanceof Error ? error.message : "unknown");
    }
  };
  setInterval(() => {
    void tick();
  }, 60_000);
}
