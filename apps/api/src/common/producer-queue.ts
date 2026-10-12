import { Queue } from "bullmq";

/** Worker-owned producer: disconnect without waiting for Redis readiness/end. */
export class ProducerQueue extends Queue {
  override async disconnect() {
    // BullMQ's normal disconnect awaits initial readiness and then an `end`
    // event. During ioredis reconnect backoff that event may never arrive.
    // Forced connection closure also cancels an unfinished initial connection.
    await this.connection.close(true);
  }
}
