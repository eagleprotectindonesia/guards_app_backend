
export abstract class BaseWorker {
  protected isShuttingDown = false;
  abstract name: string;

  abstract start(): Promise<void>;

  async stop(signal: string): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;
    console.log(`[${this.name}] Received ${signal}, shutting down gracefully...`);
  }
}
